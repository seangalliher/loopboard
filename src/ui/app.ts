import { addCard, createBoard, deleteCard, updateCard } from '../board/board'
import type { Board, Card, ColumnId } from '../board/board'
import { parseBoard, serializeBoard } from '../board/serialize'
import { newId } from '../id'
import { loadBoard, saveBoard } from '../storage'

const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'Doing' },
  { id: 'done', title: 'Done' },
]

type Child = Node | string

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
  let cardEls = new Map<string, { li: HTMLElement; edit: HTMLElement }>()
  let headingEls = new Map<ColumnId, HTMLElement>()

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
        h('label', { for: importInput.id }, 'Import a board file (replaces the current board)'),
        importInput,
      ),
    ),
    h('main', {}, saveWarningEl, messageEl, form, boardEl),
  )

  function setBoard(next: Board): void {
    board = next
    render()
    messageEl.hidden = true
    try {
      if (!storage) throw new Error('storage unavailable')
      saveBoard(storage, board)
      saveWarningEl.hidden = true
    } catch {
      saveWarningEl.hidden = false
    }
  }

  function render(): void {
    cardEls = new Map()
    headingEls = new Map()
    boardEl.replaceChildren(
      ...COLUMNS.map(({ id, title }) => {
        const { cards } = board.columns[id]
        const heading = h('h2', { id: `column-${id}`, tabindex: '-1' }, title)
        headingEls.set(id, heading)
        const count = `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
        return h(
          'section',
          { class: 'column', 'aria-labelledby': heading.id },
          h('div', { class: 'column-head' }, heading, h('span', { class: 'count' }, count)),
          h('ul', { class: 'cards' }, ...cards.map(renderCard)),
        )
      }),
    )
  }

  function renderCard(card: Card): HTMLElement {
    const edit = h('button', { type: 'button', 'aria-label': `Edit "${card.title}"` }, 'Edit')
    const del = h('button', { type: 'button', 'aria-label': `Delete "${card.title}"` }, 'Delete')
    edit.addEventListener('click', () => openForm(card))
    del.addEventListener('click', () => removeCard(card.id))
    const li = h('li', { class: 'card', tabindex: '-1' }, h('h3', {}, card.title))
    if (card.note) li.append(h('p', { class: 'note' }, card.note))
    // The due date is already YYYY-MM-DD; show it as is so no time zone can shift it.
    if (card.due) {
      li.append(h('p', { class: 'due' }, 'Due ', h('time', { datetime: card.due }, card.due)))
    }
    li.append(h('div', { class: 'actions' }, edit, del))
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
      messageEl.textContent = `Import failed: ${error instanceof Error ? error.message : String(error)}`
      messageEl.hidden = false
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
