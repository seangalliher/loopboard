export type ColumnId = 'todo' | 'doing' | 'done'

export interface Card {
  id: string
  title: string
  note?: string
  due?: string
}

export interface CardFields {
  title: string
  note?: string
  due?: string
}

export interface Column {
  wipLimit: number | null
  cards: Card[]
}

export interface Board {
  version: 1
  columns: Record<ColumnId, Column>
}

const COLUMN_IDS: ColumnId[] = ['todo', 'doing', 'done']

export function createBoard(): Board {
  return {
    version: 1,
    columns: {
      todo: { wipLimit: null, cards: [] },
      doing: { wipLimit: null, cards: [] },
      done: { wipLimit: null, cards: [] },
    },
  }
}

function isRealDate(due: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false
  const [year, month, day] = due.split('-').map(Number)
  if (year === 0) return false
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  // An out-of-range month or day rolls over into another month or year.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
}

/** Trims and validates card fields; an empty note or due becomes an absent key. */
export function normalizeCardFields(fields: CardFields): CardFields {
  if (typeof fields.title !== 'string') throw new Error('Title must be a string.')
  if (fields.note !== undefined && typeof fields.note !== 'string') {
    throw new Error('Note must be a string.')
  }
  if (fields.due !== undefined && typeof fields.due !== 'string') {
    throw new Error('Due date must be a string.')
  }
  // The title field is a single-line input, which would strip line breaks on edit.
  const title = fields.title.replace(/[\r\n]+/g, ' ').trim()
  if (title === '') throw new Error('Title must not be blank.')
  const result: CardFields = { title }
  const note = fields.note?.trim()
  if (note) result.note = note
  const due = fields.due?.trim()
  if (due) {
    if (!isRealDate(due)) {
      throw new Error(`Due date "${due}" is not a real date in YYYY-MM-DD form.`)
    }
    result.due = due
  }
  return result
}

function locate(board: Board, id: string): { columnId: ColumnId; card: Card } | undefined {
  for (const columnId of COLUMN_IDS) {
    const card = board.columns[columnId].cards.find((c) => c.id === id)
    if (card) return { columnId, card }
  }
  return undefined
}

function withCards(board: Board, columnId: ColumnId, cards: Card[]): Board {
  return {
    ...board,
    columns: { ...board.columns, [columnId]: { ...board.columns[columnId], cards } },
  }
}

export function addCard(board: Board, card: { id: string } & CardFields): Board {
  const added: Card = { id: card.id, ...normalizeCardFields(card) }
  return withCards(board, 'todo', [...board.columns.todo.cards, added])
}

export function updateCard(board: Board, id: string, fields: CardFields): Board {
  const found = locate(board, id)
  if (!found) return board
  const updated: Card = { id, ...normalizeCardFields(fields) }
  return withCards(
    board,
    found.columnId,
    board.columns[found.columnId].cards.map((c) => (c.id === id ? updated : c)),
  )
}

export function deleteCard(board: Board, id: string): Board {
  const found = locate(board, id)
  if (!found) return board
  return withCards(
    board,
    found.columnId,
    board.columns[found.columnId].cards.filter((c) => c.id !== id),
  )
}

export function moveCard(board: Board, id: string, target: ColumnId): Board {
  const found = locate(board, id)
  if (!found || found.columnId === target) return board
  const withoutCard = deleteCard(board, id)
  return withCards(withoutCard, target, [...withoutCard.columns[target].cards, found.card])
}

export const MAX_WIP_LIMIT = 999

export function setWipLimit(board: Board, column: ColumnId, limit: number | null): Board {
  if (limit !== null && !(Number.isInteger(limit) && limit >= 1 && limit <= MAX_WIP_LIMIT)) {
    throw new Error(
      `WIP limit must be a whole number from 1 to ${MAX_WIP_LIMIT}, or null for no limit.`,
    )
  }
  return {
    ...board,
    columns: { ...board.columns, [column]: { ...board.columns[column], wipLimit: limit } },
  }
}

export function isOverLimit(board: Board, column: ColumnId): boolean {
  const { wipLimit, cards } = board.columns[column]
  return wipLimit !== null && cards.length > wipLimit
}
