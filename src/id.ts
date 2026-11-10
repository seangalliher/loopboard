let counter = 0

/** A unique card id. Works on non-secure origins, where the Web Crypto UUID helper is missing. */
export function newId(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
