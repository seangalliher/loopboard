import {
  addCard,
  createBoard,
  deleteCard,
  isOverLimit,
  moveCard,
  setWipLimit,
  updateCard,
} from '../board/board'
import type { Board, Card, ColumnId } from '../board/board'
import { parseBoard, serializeBoard } from '../board/serialize'
import { newId } from '../id'
import { loadBoard, saveBoard } from '../storage'
import { createThemeButton } from './theme'

const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'Doing' },
  { id: 'done', title: 'Done' },
]

type Child = Node | string

/** Longest import error shown; the fixed notices area at 320px fits about this much text. */
const MAX_MESSAGE_LENGTH = 120

interface ColumnView {
  section: HTMLElement
  count: HTMLElement
  limitInput: HTMLInputElement
  limitError: HTMLElement
  list: HTMLElement
  status: HTMLElement // the over-limit warning; empty when not over the limit
  cards: Card[] | null // the cards array the list was last built from
}

/** Builds an element. Text children become text nodes, never HTML. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
  node.append(...children)
  return node
}

function field(label: string, control: HTMLElement): HTMLElement {
  return h('div', { class: 'field' }, h('label', { for: control.id }, label), control)
}

/** Local date as YYYY-MM-DD, for the export file name. */
function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `storage` is null when the browser does not allow storage; the board then lives in memory. */
export function mountApp(root: HTMLElement, storage: Storage | null): void {
  let board: Board = storage ? loadBoard(storage) : createBoard()
  let editingId: string | null = null // null: the form adds a card
  const cardEls = new Map<string, { li: HTMLElement; edit: HTMLElement }>()
  const headingEls = new Map<ColumnId, HTMLElement>()
  const views = new Map<ColumnId, ColumnView>()
  let dragging: { id: string; from: ColumnId } | null = null

  const addButton = h('button', { type: 'button' }, 'Add card')
  const formHeading = h('h2', { id: 'form-heading' })
  const titleInput = h('input', {
    id: 'card-title',
    type: 'text',
    autocomplete: 'off',
    'aria-required': 'true',
  })
  const noteInput = h('textarea', { id: 'card-note', rows: '3' })
  const dueInput = h('input', { id: 'card-due', type: 'date' })
  const errorEl = h('p', { class: 'error', role: 'alert', hidden: '' })
  const cancelButton = h('button', { type: 'button' }, 'Cancel')
  const form = h(
    'form',
    { 'aria-labelledby': 'form-heading', novalidate: '', hidden: '' },
    formHeading,
    field('Title', titleInput),
    field('Note', noteInput),
    field('Due date', dueInput),
    errorEl,
    h('div', { class: 'actions' }, h('button', { type: 'submit' }, 'Save'), cancelButton),
  )
  const boardEl = h('div', { class: 'board' })
  const exportButton = h('button', { type: 'button' }, 'Export')
  const importInput = h('input', { id: 'import-file', type: 'file', accept: '.json,application/json' })
  const messageEl = h('p', { class: 'error', role: 'alert', hidden: '' })
  const saveWarningEl = h(
    'p',
    { class: 'error', role: 'alert', hidden: '' },
    'Could not save the board in this browser. Export it to keep a copy.',
  )
  const statusEl = h('p', { class: 'visually-hidden', role: 'status' })
  const mainEl = h('main', {}, form, boardEl)
  // Fixed to the viewport, so showing or hiding a notice never moves anything else on the page.
  const noticesEl = h('div', { class: 'notices' }, saveWarningEl, messageEl)

  /** A newly shown notice can cover the focused control; scroll it up so the page's scroll padding keeps it clear. */
  function keepFocusClearOfNotices(): void {
    // Scrolling between a press and its click would move the target out from under the pointer.
    if (pointerPressed) return
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || !mainEl.contains(active)) return
    if (active.getBoundingClientRect().bottom > noticesEl.getBoundingClientRect().top) {
      active.scrollIntoView({ block: 'nearest' })
    }
  }

  // True from a pointer press until just after the click it produces has been dispatched.
  let pointerPressed = false
  const releasePointer = (): void =>
    void setTimeout(() => {
      pointerPressed = false
      // A notice that appeared during the press skipped its clearance; do it now the click is done.
      if (!saveWarningEl.hidden || !messageEl.hidden) keepFocusClearOfNotices()
    }, 0)
  document.addEventListener('pointerdown', () => (pointerPressed = true), true)
  for (const type of ['pointerup', 'pointercancel', 'dragend']) {
    document.addEventListener(type, releasePointer, true)
  }

  root.append(
    h(
      'header',
      {},
      h('h1', {}, 'LoopBoard'),
      h(
        'div',
        { class: 'actions' },
        addButton,
        exportButton,
        createThemeButton(storage),
        h('label', { for: importInput.id }, 'Import a board file (replaces the current board)'),
        importInput,
      ),
    ),
    mainEl,
    noticesEl,
    statusEl,
  )

  for (const column of COLUMNS) {
    const view = createColumn(column)
    views.set(column.id, view)
    boardEl.append(view.section)
  }

  function setBoard(next: Board): void {
    board = next
    render()
    messageEl.hidden = true
    const warningWasHidden = saveWarningEl.hidden
    try {
      if (!storage) throw new Error('storage unavailable')
      saveBoard(storage, board)
      saveWarningEl.hidden = true
    } catch {
      saveWarningEl.hidden = false
      if (warningWasHidden) keepFocusClearOfNotices()
    }
  }

  /** A column's controls are built once; render() only updates them, so editing a limit never replaces a control. */
  function createColumn({ id, title }: { id: ColumnId; title: string }): ColumnView {
    const heading = h('h2', { id: `column-${id}`, tabindex: '-1' }, title)
    const count = h('span', { class: 'count' })
    const limitInput = h('input', {
      id: `wip-${id}`,
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      'aria-label': `${title} WIP limit`,
      'aria-describedby': `wip-error-${id}`,
    })
    const limitError = h('p', { id: `wip-error-${id}`, class: 'error wip-error', role: 'alert' })
    const status = h('p', { class: 'over-limit-text', role: 'status' })
    const list = h('ul', { class: 'cards' })
    const section = h(
      'section',
      { class: 'column', 'aria-labelledby': heading.id },
      h(
        'div',
        { class: 'column-head' },
        heading,
        count,
        h('label', { class: 'wip-limit' }, 'WIP limit ', limitInput),
      ),
      limitError,
      status,
      list,
    )
    limitInput.addEventListener('change', () => {
      // The raw text decides: only an empty entry clears the limit; anything but digits is rejected.
      const text = limitInput.value.trim()
      try {
        setBoard(setWipLimit(board, id, text === '' ? null : /^\d+$/.test(text) ? Number(text) : NaN))
      } catch (error) {
        const previous = board.columns[id].wipLimit
        limitInput.value = previous === null ? '' : String(previous)
        limitError.textContent = error instanceof Error ? error.message : String(error)
      }
    })
    // Only another column accepts the dragged card; its own column does not.
    section.addEventListener('dragover', (event) => {
      if (!dragging || dragging.from === id) return
      event.preventDefault()
      section.classList.add('drop-target')
    })
    section.addEventListener('dragleave', (event) => {
      if (!(event.relatedTarget instanceof Node && section.contains(event.relatedTarget))) {
        section.classList.remove('drop-target')
      }
    })
    section.addEventListener('drop', (event) => {
      // Text dropped on the limit input goes to the field; the change handler validates it.
      if (!dragging && event.target === limitInput) return
      event.preventDefault()
      const moved = dragging
      endDrag()
      if (moved && moved.from !== id) setBoard(moveCard(board, moved.id, id))
    })
    headingEls.set(id, heading)
    return { section, count, limitInput, limitError, list, status, cards: null }
  }

  function render(): void {
    // Every column's view is created before the first render.
    const changed = COLUMNS.filter(({ id }) => views.get(id)!.cards !== board.columns[id].cards)
    // Forget the old cards first: a moved card is registered by its new column below.
    for (const { id } of changed) {
      for (const card of views.get(id)!.cards ?? []) cardEls.delete(card.id)
    }
    for (const { id } of COLUMNS) {
      const view = views.get(id)!
      const { cards, wipLimit } = board.columns[id]
      const countText =
        wipLimit === null
          ? `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
          : `${cards.length}/${wipLimit} cards`
      if (view.count.textContent !== countText) view.count.textContent = countText
      const limitText = wipLimit === null ? '' : String(wipLimit)
      if (view.limitInput.value !== limitText) view.limitInput.value = limitText
      view.limitError.textContent = ''
      const over = isOverLimit(board, id)
      view.section.classList.toggle('over-limit', over)
      const statusText = over ? `⚠ Over WIP limit by ${cards.length - (wipLimit ?? 0)}` : ''
      if (view.status.textContent !== statusText) view.status.textContent = statusText
      if (view.cards !== cards) {
        view.list.replaceChildren(...cards.map((card) => renderCard(card, id)))
        view.cards = cards
      }
    }
  }

  function endDrag(): void {
    dragging = null
    for (const el of boardEl.querySelectorAll('.dragging, .drop-target')) {
      el.classList.remove('dragging', 'drop-target')
    }
  }

  function moveByButton(card: Card, column: { id: ColumnId; title: string }): void {
    setBoard(moveCard(board, card.id, column.id))
    cardEls.get(card.id)?.li.focus()
    statusEl.textContent = `Moved "${card.title}" to ${column.title}`
  }

  function renderCard(card: Card, from: ColumnId): HTMLElement {
    const edit = h('button', { type: 'button', 'aria-label': `Edit "${card.title}"` }, 'Edit')
    const del = h('button', { type: 'button', 'aria-label': `Delete "${card.title}"` }, 'Delete')
    edit.addEventListener('click', () => openForm(card))
    del.addEventListener('click', () => removeCard(card.id))
    const moves = COLUMNS.filter((c) => c.id !== from).map((column) => {
      const button = h(
        'button',
        { type: 'button', 'aria-label': `Move "${card.title}" to ${column.title}` },
        h('span', { 'aria-hidden': 'true' }, '→ '),
        column.title,
      )
      button.addEventListener('click', () => moveByButton(card, column))
      return button
    })
    const li = h('li', { class: 'card', tabindex: '-1', draggable: 'true' }, h('h3', {}, card.title))
    li.addEventListener('dragstart', (event) => {
      if (!event.dataTransfer) return
      event.dataTransfer.setData('text/plain', card.id) // Firefox needs data to start a drag
      event.dataTransfer.effectAllowed = 'move'
      dragging = { id: card.id, from }
      li.classList.add('dragging')
    })
    li.addEventListener('dragend', endDrag)
    if (card.note) li.append(h('p', { class: 'note' }, card.note))
    // The due date is already YYYY-MM-DD; show it as is so no time zone can shift it.
    if (card.due) {
      li.append(h('p', { class: 'due' }, 'Due ', h('time', { datetime: card.due }, card.due)))
    }
    li.append(h('div', { class: 'actions' }, edit, del, ...moves))
    cardEls.set(card.id, { li, edit })
    return li
  }

  function openForm(card?: Card): void {
    editingId = card?.id ?? null
    formHeading.textContent = card ? 'Edit card' : 'Add card'
    titleInput.value = card?.title ?? ''
    noteInput.value = card?.note ?? ''
    dueInput.value = card?.due ?? ''
    errorEl.hidden = true
    form.hidden = false
    titleInput.focus()
  }

  function hideForm(): void {
    form.hidden = true
    errorEl.hidden = true
  }

  function closeForm(): void {
    const opener = editingId === null ? addButton : cardEls.get(editingId)?.edit
    hideForm()
    ;(opener ?? addButton).focus()
  }

  function removeCard(id: string): void {
    const columnId = COLUMNS.find((c) => board.columns[c.id].cards.some((x) => x.id === id))?.id
    if (!columnId) return
    const cards = board.columns[columnId].cards
    const index = cards.findIndex((c) => c.id === id)
    const neighbour = cards[index + 1] ?? cards[index - 1]
    setBoard(deleteCard(board, id))
    if (editingId === id) hideForm()
    const target = neighbour ? cardEls.get(neighbour.id)?.li : headingEls.get(columnId)
    target?.focus()
  }

  exportButton.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([serializeBoard(board)], { type: 'application/json' }))
    const link = h('a', { href: url, download: `loopboard-${today()}.json` })
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  })
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0]
    if (!file) return
    // Clear the input so choosing the same file again fires another change event.
    importInput.value = ''
    try {
      const next = parseBoard(await file.text())
      hideForm()
      setBoard(next)
    } catch (error) {
      const text = `Import failed: ${error instanceof Error ? error.message : String(error)}`
      // Notices can't be scrolled by pointer, so keep the text short enough to fit the area.
      messageEl.textContent = text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : text
      messageEl.hidden = false
      keepFocusClearOfNotices()
    }
  })
  addButton.addEventListener('click', () => openForm())
  cancelButton.addEventListener('click', closeForm)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !form.hidden) closeForm()
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (form.hidden) return
    const fields = { title: titleInput.value, note: noteInput.value, due: dueInput.value }
    try {
      setBoard(
        editingId === null
          ? addCard(board, { id: newId(), ...fields })
          : updateCard(board, editingId, fields),
      )
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : String(error)
      errorEl.hidden = false
      titleInput.focus()
      return
    }
    closeForm()
  })

  render()
  saveWarningEl.hidden = storage !== null
}
