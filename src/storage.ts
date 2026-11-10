import { createBoard } from './board/board'
import type { Board } from './board/board'
import { parseBoard, serializeBoard } from './board/serialize'

export const STORAGE_KEY = 'loopboard:board'

/** Returns the saved board, or an empty one if storage is empty, unreadable or invalid. */
export function loadBoard(storage: Pick<Storage, 'getItem'>): Board {
  try {
    const text = storage.getItem(STORAGE_KEY)
    return text === null ? createBoard() : parseBoard(text)
  } catch {
    return createBoard()
  }
}

/** Throws if the browser refuses the write (for example when storage is full). */
export function saveBoard(storage: Pick<Storage, 'setItem'>, board: Board): void {
  storage.setItem(STORAGE_KEY, serializeBoard(board))
}
