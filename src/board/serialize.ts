import { createBoard, normalizeCardFields, setWipLimit } from './board'
import type { Board, Card, ColumnId } from './board'

export function serializeBoard(board: Board): string {
  return JSON.stringify(board, null, 2)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Parses and validates untrusted board JSON. Throws an Error with a readable
 * message when anything is wrong; unknown properties are dropped.
 */
export function parseBoard(text: string): Board {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`The file is not valid JSON (${describe(error)}).`, { cause: error })
  }
  if (!isRecord(data)) throw new Error('The board must be a JSON object.')
  if (data.version !== 1) throw new Error('Unsupported board version: expected 1.')
  const rawColumns = data.columns
  if (!isRecord(rawColumns)) throw new Error('The board must have a "columns" object.')

  const board = createBoard()
  const columnIds = Object.keys(board.columns) as ColumnId[]
  for (const name of Object.keys(rawColumns)) {
    if (!columnIds.includes(name as ColumnId)) throw new Error(`Unknown column "${name}".`)
  }
  const seenIds = new Set<string>()
  for (const columnId of columnIds) {
    const raw = rawColumns[columnId]
    if (!isRecord(raw)) throw new Error(`Column "${columnId}" is missing or not an object.`)
    if (!Array.isArray(raw.cards)) throw new Error(`Column "${columnId}": cards must be an array.`)
    try {
      // The WIP limit rule lives in board.ts; the cast is checked by that rule.
      board.columns[columnId].wipLimit = setWipLimit(
        board,
        columnId,
        raw.wipLimit as number | null,
      ).columns[columnId].wipLimit
    } catch (error) {
      throw new Error(`Column "${columnId}": ${describe(error)}`, { cause: error })
    }
    for (const [index, rawCard] of (raw.cards as unknown[]).entries()) {
      const where = `Column "${columnId}", card ${index + 1}`
      if (!isRecord(rawCard)) throw new Error(`${where}: a card must be an object.`)
      const id = rawCard.id
      if (typeof id !== 'string' || id === '') {
        throw new Error(`${where}: id must be a non-empty string.`)
      }
      if (seenIds.has(id)) throw new Error(`${where}: duplicate card id "${id}".`)
      seenIds.add(id)
      let fields
      try {
        fields = normalizeCardFields({
          title: rawCard.title as string,
          note: rawCard.note as string | undefined,
          due: rawCard.due as string | undefined,
        })
      } catch (error) {
        throw new Error(`${where}: ${describe(error)}`, { cause: error })
      }
      const card: Card = { id, ...fields }
      board.columns[columnId].cards.push(card)
    }
  }
  return board
}
