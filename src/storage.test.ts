import { describe, expect, it } from 'vitest'
import { addCard, createBoard } from './board/board'
import { serializeBoard } from './board/serialize'
import { loadBoard, saveBoard } from './storage'

/** An in-memory stand-in for the parts of Storage that the app uses. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

const board = addCard(createBoard(), { id: 'a', title: 'Saved', due: '2026-03-01' })

describe('loadBoard', () => {
  it('returns an empty board when storage is empty', () => {
    expect(loadBoard(fakeStorage())).toEqual(createBoard())
  })

  it('returns an empty board for malformed JSON', () => {
    expect(loadBoard(fakeStorage({ 'loopboard:board': '{' }))).toEqual(createBoard())
  })

  it('returns an empty board when validation fails', () => {
    const invalid = JSON.stringify({ version: 2, columns: {} })
    expect(loadBoard(fakeStorage({ 'loopboard:board': invalid }))).toEqual(createBoard())
  })

  it('returns an empty board when reading throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadBoard(storage)).toEqual(createBoard())
  })

  it('returns the saved board', () => {
    expect(loadBoard(fakeStorage({ 'loopboard:board': serializeBoard(board) }))).toEqual(board)
  })
})

describe('saveBoard', () => {
  it('writes the serialized board under loopboard:board', () => {
    const storage = fakeStorage()
    saveBoard(storage, board)
    expect([...storage.items.keys()]).toEqual(['loopboard:board'])
    expect(storage.items.get('loopboard:board')).toBe(serializeBoard(board))
  })

  it('round-trips through loadBoard', () => {
    const storage = fakeStorage()
    saveBoard(storage, board)
    expect(loadBoard(storage)).toEqual(board)
  })
})
