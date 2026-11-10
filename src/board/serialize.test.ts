import { describe, expect, it } from 'vitest'
import { addCard, createBoard, moveCard, setWipLimit } from './board'
import type { Board } from './board'
import { parseBoard, serializeBoard } from './serialize'

function sampleBoard(): Board {
  let board = createBoard()
  board = addCard(board, { id: 'a', title: 'Écrire le plan 計画', note: 'Line 1\nLine 2', due: '2024-02-29' })
  board = addCard(board, { id: 'b', title: 'B' })
  board = addCard(board, { id: 'c', title: 'C' })
  board = moveCard(board, 'c', 'doing')
  board = setWipLimit(board, 'todo', 3)
  return setWipLimit(board, 'doing', 1)
}

/** A valid board as plain JSON data, for tests to break one property at a time. */
function data() {
  return JSON.parse(serializeBoard(sampleBoard()))
}

const parse = (value: unknown) => parseBoard(JSON.stringify(value))

describe('serializeBoard', () => {
  it('writes indented JSON', () => {
    const text = serializeBoard(createBoard())
    expect(text).toContain('\n  "version": 1')
    expect(JSON.parse(text)).toEqual(createBoard())
  })

  it('round-trips notes, due dates, non-ASCII titles and limits', () => {
    const board = sampleBoard()
    expect(parseBoard(serializeBoard(board))).toEqual(board)
  })
})

describe('parseBoard', () => {
  it('rejects invalid JSON', () => {
    expect(() => parseBoard('{')).toThrow(/not valid JSON/)
    expect(() => parseBoard('')).toThrow(/not valid JSON/)
  })

  it('rejects a non-object', () => {
    for (const value of [null, 3, 'text', [], true]) {
      expect(() => parse(value)).toThrow('The board must be a JSON object.')
    }
  })

  it('rejects a version other than 1', () => {
    expect(() => parse({ ...data(), version: 2 })).toThrow(/version/)
    const noVersion = data()
    delete noVersion.version
    expect(() => parse(noVersion)).toThrow(/version/)
  })

  it('rejects missing columns', () => {
    const d = data()
    delete d.columns.done
    expect(() => parse(d)).toThrow('Column "done" is missing or not an object.')
    expect(() => parse({ version: 1 })).toThrow(/"columns" object/)
  })

  it('rejects an extra column', () => {
    const d = data()
    d.columns.review = { wipLimit: null, cards: [] }
    expect(() => parse(d)).toThrow('Unknown column "review".')
  })

  it('rejects a misnamed column', () => {
    const d = data()
    d.columns.finished = d.columns.done
    delete d.columns.done
    expect(() => parse(d)).toThrow('Unknown column "finished".')
  })

  it('rejects cards that are not an array', () => {
    const d = data()
    d.columns.todo.cards = { a: 1 }
    expect(() => parse(d)).toThrow('Column "todo": cards must be an array.')
  })

  it('rejects a card that is not an object', () => {
    const d = data()
    d.columns.todo.cards = ['text']
    expect(() => parse(d)).toThrow(/a card must be an object/)
  })

  it('rejects a card with a blank title', () => {
    const d = data()
    d.columns.todo.cards[0].title = '   '
    expect(() => parse(d)).toThrow(/Column "todo", card 1: Title must not be blank/)
  })

  it('rejects a card with a non-string id', () => {
    const d = data()
    d.columns.todo.cards[1].id = 7
    expect(() => parse(d)).toThrow(/Column "todo", card 2: id must be a non-empty string/)
  })

  it('rejects a card with an empty id', () => {
    const d = data()
    d.columns.todo.cards[1].id = ''
    expect(() => parse(d)).toThrow(/Column "todo", card 2: id must be a non-empty string/)
  })

  it('rejects a card with an invalid due date', () => {
    const d = data()
    d.columns.doing.cards[0].due = '2026-02-30'
    expect(() => parse(d)).toThrow(/Column "doing", card 1: Due date "2026-02-30"/)
  })

  it('rejects a card with a non-string note', () => {
    const d = data()
    d.columns.todo.cards[0].note = 5
    expect(() => parse(d)).toThrow(/Note must be a string/)
  })

  it('rejects duplicate card ids, also across columns', () => {
    const d = data()
    d.columns.done.cards.push({ id: 'a', title: 'Again' })
    expect(() => parse(d)).toThrow('Column "done", card 1: duplicate card id "a".')
  })

  it.each([0, -1, 1.5, '3', 1000, 10000000000000000000])(
    'rejects a wipLimit of %j',
    (wipLimit) => {
      const d = data()
      d.columns.todo.wipLimit = wipLimit
      expect(() => parse(d)).toThrow(
        'Column "todo": WIP limit must be a whole number from 1 to 999, or null for no limit.',
      )
    },
  )

  it('accepts a wipLimit of 999', () => {
    const d = data()
    d.columns.todo.wipLimit = 999
    expect(parse(d).columns.todo.wipLimit).toBe(999)
  })

  it('rejects a missing wipLimit', () => {
    const d = data()
    delete d.columns.done.wipLimit
    expect(() => parse(d)).toThrow(/Column "done": WIP limit/)
  })

  it('accepts a null wipLimit', () => {
    const d = data()
    d.columns.todo.wipLimit = null
    expect(parse(d).columns.todo.wipLimit).toBeNull()
  })

  it('drops unknown properties', () => {
    const d = data()
    d.extra = 1
    d.columns.todo.extra = 1
    d.columns.todo.cards[0].colour = 'red'
    expect(parse(d)).toEqual(sampleBoard())
  })

  it('trims card text and drops an empty note, like the board rules', () => {
    const d = data()
    d.columns.todo.cards[1] = { id: 'b', title: '  B  ', note: '  ' }
    expect(parse(d).columns.todo.cards[1]).toEqual({ id: 'b', title: 'B' })
  })

  it('turns line breaks in an imported title into single spaces', () => {
    const d = data()
    d.columns.todo.cards[1] = { id: 'b', title: 'First\r\nSecond' }
    expect(parse(d).columns.todo.cards[1]).toEqual({ id: 'b', title: 'First Second' })
  })
})
