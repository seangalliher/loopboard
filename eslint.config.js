import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const bannedHtmlProperties = ['innerHTML', 'outerHTML', 'insertAdjacentHTML']

export default defineConfig([
  globalIgnores(['dist/', 'coverage/', '.goal-loop/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-properties': [
        'error',
        ...bannedHtmlProperties.map((property) => ({
          property,
          message: `Do not use ${property}; set user text with textContent or DOM APIs.`,
        })),
      ],
    },
  },
])
