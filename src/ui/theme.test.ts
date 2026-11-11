import { describe, expect, it } from 'vitest'
import { nextChoice, readChoice, resolveTheme, THEME_KEY } from './theme'

describe('nextChoice', () => {
  it('cycles system -> light -> dark -> system', () => {
    expect(nextChoice('system')).toBe('light')
    expect(nextChoice('light')).toBe('dark')
    expect(nextChoice('dark')).toBe('system')
  })
})

describe('readChoice', () => {
  const storageWith = (value: string | null) => ({ getItem: () => value })

  it('returns a stored light or dark choice', () => {
    expect(readChoice(storageWith('light'))).toBe('light')
    expect(readChoice(storageWith('dark'))).toBe('dark')
  })

  it('falls back to system for nothing, junk or no storage', () => {
    expect(readChoice(storageWith(null))).toBe('system')
    expect(readChoice(storageWith('purple'))).toBe('system')
    expect(readChoice(null)).toBe('system')
  })

  it('falls back to system when reading throws', () => {
    expect(
      readChoice({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe('system')
  })

  it('reads the loopboard:theme key', () => {
    expect(readChoice({ getItem: (key: string) => (key === THEME_KEY ? 'dark' : null) })).toBe('dark')
    expect(THEME_KEY).toBe('loopboard:theme')
  })
})

describe('resolveTheme', () => {
  it('follows the system only for the system choice', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
