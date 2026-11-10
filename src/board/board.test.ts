import { describe, expect, it } from 'vitest'
import {
  addCard,
  createBoard,
  deleteCard,
  isOverLimit,
  moveCard,
  normalizeCardFields,
  setWipLimit,
  updateCard,
  type Board,
  type CardFields,
} from './board'

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

// todo: a, b; doing: c; done: (empty)
function sampleBoard(): Board {
  let board = createBoard()
  board = addCard(board, { id: 'a', title: 'A', note: 'note a', due: '2026-03-01' })
  board = addCard(board, { id: 'b', title: 'B' })
  board = addCard(board, { id: 'c', title: 'C' })
  return moveCard(board, 'c', 'doing')
}

const ids = (board: Board, column: keyof Board['columns']) =>
  board.columns[column].cards.map((c) => c.id)

describe('createBoard', () => {
  it('has three empty columns with no limits', () => {
    expect(createBoard()).toEqual({
      version: 1,
      columns: {
        todo: { wipLimit: null, cards: [] },
        doing: { wipLimit: null, cards: [] },
        done: { wipLimit: null, cards: [] },
      },
    })
  })
})

describe('addCard', () => {
  it('appends to the end of todo using the supplied id', () => {
    const board = addCard(sampleBoard(), { id: 'z', title: 'Z' })
    expect(ids(board, 'todo')).toEqual(['a', 'b', 'z'])
    expect(ids(board, 'doing')).toEqual(['c'])
  })

  it('trims title and note and stores empty note and due as absent keys', () => {
    const board = addCard(createBoard(), { id: 'x', title: '  Hi  ', note: '  n ', due: '' })
    expect(board.columns.todo.cards[0]).toEqual({ id: 'x', title: 'Hi', note: 'n' })
    const blank = addCard(createBoard(), { id: 'y', title: 'Y', note: '   ', due: '  ' })
    expect(Object.keys(blank.columns.todo.cards[0])).toEqual(['id', 'title'])
  })

  it('rejects an invalid card', () => {
    expect(() => addCard(createBoard(), { id: 'x', title: '  ' })).toThrow(Error)
  })
})

describe('updateCard', () => {
  it('replaces title, note and due in place', () => {
    const board = updateCard(sampleBoard(), 'a', { title: ' New ', due: '2024-02-29' })
    expect(board.columns.todo.cards).toEqual([
      { id: 'a', title: 'New', due: '2024-02-29' },
      { id: 'b', title: 'B' },
    ])
  })

  it('replaces a supplied note and drops the old due when the caller clears it', () => {
    // card a starts with note 'note a' and due '2026-03-01'
    const board = updateCard(sampleBoard(), 'a', { title: 'A', note: ' fresh ', due: '' })
    expect(board.columns.todo.cards[0]).toEqual({ id: 'a', title: 'A', note: 'fresh' })
    const cleared = updateCard(sampleBoard(), 'a', { title: 'A' })
    expect(cleared.columns.todo.cards[0]).toEqual({ id: 'a', title: 'A' })
  })

  it('keeps a card in its own column and position', () => {
    const board = updateCard(sampleBoard(), 'c', { title: 'C2' })
    expect(board.columns.doing.cards).toEqual([{ id: 'c', title: 'C2' }])
  })

  it('returns the board unchanged for an unknown id', () => {
    const board = sampleBoard()
    expect(updateCard(board, 'nope', { title: 'X' })).toBe(board)
  })

  it('rejects invalid fields', () => {
    expect(() => updateCard(sampleBoard(), 'a', { title: '' })).toThrow(Error)
  })
})

describe('deleteCard', () => {
  it('removes the card from its column', () => {
    const board = deleteCard(sampleBoard(), 'a')
    expect(ids(board, 'todo')).toEqual(['b'])
    expect(ids(board, 'doing')).toEqual(['c'])
  })

  it('returns the board unchanged for an unknown id', () => {
    const board = sampleBoard()
    expect(deleteCard(board, 'nope')).toBe(board)
  })
})

describe('moveCard', () => {
  it('leaves the source and appends to the target', () => {
    const board = moveCard(sampleBoard(), 'a', 'doing')
    expect(ids(board, 'todo')).toEqual(['b'])
    expect(ids(board, 'doing')).toEqual(['c', 'a'])
    expect(board.columns.doing.cards[1]).toEqual({
      id: 'a',
      title: 'A',
      note: 'note a',
      due: '2026-03-01',
    })
  })

  it('returns the board unchanged when the column is the same', () => {
    const board = sampleBoard()
    expect(moveCard(board, 'a', 'todo')).toBe(board)
  })

  it('returns the board unchanged for an unknown id', () => {
    const board = sampleBoard()
    expect(moveCard(board, 'nope', 'done')).toBe(board)
  })

  it('is not blocked by a WIP limit', () => {
    const limited = setWipLimit(sampleBoard(), 'doing', 1)
    expect(ids(moveCard(limited, 'a', 'doing'), 'doing')).toEqual(['c', 'a'])
  })
})

describe('setWipLimit', () => {
  it('sets and clears a limit on one column only', () => {
    const set = setWipLimit(createBoard(), 'doing', 3)
    expect(set.columns.doing.wipLimit).toBe(3)
    expect(set.columns.todo.wipLimit).toBeNull()
    expect(setWipLimit(set, 'doing', null).columns.doing.wipLimit).toBeNull()
  })

  it('keeps the cards of the column', () => {
    expect(ids(setWipLimit(sampleBoard(), 'todo', 5), 'todo')).toEqual(['a', 'b'])
  })

  it('accepts 1 and 999', () => {
    expect(setWipLimit(createBoard(), 'todo', 1).columns.todo.wipLimit).toBe(1)
    expect(setWipLimit(createBoard(), 'todo', 999).columns.todo.wipLimit).toBe(999)
  })

  it.each([0, -1, 1.5, NaN, 1000, 10000000000000000000, Infinity])('rejects %s', (n) => {
    expect(() => setWipLimit(createBoard(), 'todo', n)).toThrow(
      'WIP limit must be a whole number from 1 to 999, or null for no limit.',
    )
  })
})

describe('isOverLimit', () => {
  it('is true only when the count is above the limit', () => {
    const board = sampleBoard() // todo has 2 cards
    expect(isOverLimit(setWipLimit(board, 'todo', 1), 'todo')).toBe(true)
    expect(isOverLimit(setWipLimit(board, 'todo', 2), 'todo')).toBe(false)
    expect(isOverLimit(setWipLimit(board, 'todo', 3), 'todo')).toBe(false)
  })

  it('is false with no limit', () => {
    expect(isOverLimit(sampleBoard(), 'todo')).toBe(false)
  })
})

describe('normalizeCardFields', () => {
  it('trims and drops empty optional fields', () => {
    expect(normalizeCardFields({ title: ' T ', note: ' ', due: '' })).toEqual({ title: 'T' })
    expect(normalizeCardFields({ title: 'T', note: ' n ', due: '2026-03-01' })).toEqual({
      title: 'T',
      note: 'n',
      due: '2026-03-01',
    })
  })

  it.each(['', '   ', '\t\n'])('rejects the blank title %j', (title) => {
    expect(() => normalizeCardFields({ title })).toThrow(/Title/)
  })

  it('replaces each run of line breaks in the title with one space', () => {
    expect(normalizeCardFields({ title: 'First\nSecond' }).title).toBe('First Second')
    expect(normalizeCardFields({ title: '\nA\r\n\r\nB\r' }).title).toBe('A B')
  })

  it('rejects a title that is only line breaks', () => {
    expect(() => normalizeCardFields({ title: '\n\r\n' })).toThrow(/Title must not be blank/)
  })

  it.each(['2026-02-30', '2026-2-3', '2026-13-01', '2026-00-10', '2023-02-29', 'tomorrow'])(
    'rejects the due date %s',
    (due) => {
      expect(() => normalizeCardFields({ title: 'T', due })).toThrow(/Due date/)
    },
  )

  it('rejects year zero', () => {
    expect(() => normalizeCardFields({ title: 'T', due: '0000-01-01' })).toThrow(/Due date/)
  })

  it.each([
    [{ title: 5 }, /Title must be a string/],
    [{ title: undefined }, /Title must be a string/],
    [{ title: null }, /Title must be a string/],
    [{ title: 'T', note: 5 }, /Note must be a string/],
    [{ title: 'T', note: null }, /Note must be a string/],
    [{ title: 'T', due: 5 }, /Due date must be a string/],
    [{ title: 'T', due: null }, /Due date must be a string/],
  ])('rejects the malformed fields %j', (fields, message) => {
    expect(() => normalizeCardFields(fields as unknown as CardFields)).toThrow(message)
  })

  it.each(['2024-02-29', '2026-12-31', '0099-01-01'])('accepts the due date %s', (due) => {
    expect(normalizeCardFields({ title: 'T', due }).due).toBe(due)
  })
})

describe('immutability', () => {
  it('no function mutates a deeply frozen board', () => {
    const board = deepFreeze(sampleBoard())
    expect(() => {
      addCard(board, { id: 'z', title: 'Z' })
      updateCard(board, 'a', { title: 'New', note: 'n', due: '2026-03-01' })
      deleteCard(board, 'a')
      moveCard(board, 'a', 'done')
      setWipLimit(board, 'todo', 1)
      setWipLimit(board, 'todo', null)
      isOverLimit(board, 'todo')
    }).not.toThrow()
  })

  it('leaves the original board equal to a fresh copy after operations', () => {
    const board = sampleBoard()
    moveCard(board, 'a', 'done')
    deleteCard(board, 'b')
    expect(board).toEqual(sampleBoard())
  })
})
