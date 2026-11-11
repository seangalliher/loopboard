export type ThemeChoice = 'system' | 'light' | 'dark'

/** The key is also read by the inline script in index.html; keep the two in step. */
export const THEME_KEY = 'loopboard:theme'

const CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

export function nextChoice(choice: ThemeChoice): ThemeChoice {
  return CHOICES[(CHOICES.indexOf(choice) + 1) % CHOICES.length]
}

/** Anything stored other than 'light' or 'dark', or no storage at all, means follow the system. */
export function readChoice(storage: Pick<Storage, 'getItem'> | null): ThemeChoice {
  try {
    const value = storage?.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(choice: ThemeChoice, systemIsDark: boolean): 'light' | 'dark' {
  return choice === 'system' ? (systemIsDark ? 'dark' : 'light') : choice
}

/**
 * Builds the theme button. It sets `data-theme` (light or dark) on <html>, which the stylesheet's
 * palettes key on, and follows the system setting live while the choice is 'system'.
 */
export function createThemeButton(storage: Storage | null): HTMLButtonElement {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  let choice = readChoice(storage)
  const button = document.createElement('button')
  button.type = 'button'

  function apply(): void {
    document.documentElement.dataset.theme = resolveTheme(choice, query.matches)
    button.textContent = `Theme: ${choice}`
    button.setAttribute('aria-label', `Theme: ${choice} (click for ${nextChoice(choice)})`)
  }

  button.addEventListener('click', () => {
    choice = nextChoice(choice)
    try {
      storage?.setItem(THEME_KEY, choice)
    } catch {
      // The choice still applies until the page is closed.
    }
    apply()
  })
  query.addEventListener('change', apply)
  apply()
  return button
}
