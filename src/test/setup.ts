import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, vi } from 'vitest'

/**
 * Restore a working `localStorage`.
 *
 * Node 22+ ships an experimental `localStorage` global and on Node 25 it
 * SHADOWS the one jsdom installs: `window.localStorage === globalThis.localStorage`,
 * and neither has `setItem`. Without this, every component that touches
 * storage silently falls into its error path during tests while working
 * perfectly in a browser — the worst kind of divergence, because the tests
 * pass and prove nothing.
 *
 * jsdom's `sessionStorage` is unaffected, which is how the shadowing was
 * identified.
 */
function installStorage(): void {
  if (typeof globalThis.localStorage?.setItem === 'function') return

  const map = new Map<string, string>()
  const api = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
  const storage = new Proxy(api as unknown as Storage, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  })

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    })
  }
}

/**
 * jsdom does not implement `matchMedia`.
 *
 * Components that respect `prefers-color-scheme` or `prefers-reduced-motion`
 * would otherwise throw on mount. Defaults to "no preference".
 */
function installMatchMedia(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'function') return
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        media: query,
        matches: false,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  })
}

installStorage()
installMatchMedia()

/**
 * A React warning is a bug, not a log line.
 *
 * Every test starts with a spy on console.error/warn and fails if anything
 * reached them. Without this, act() warnings, key warnings and prop-type
 * violations accumulate silently until nobody reads the output any more.
 *
 * A test that legitimately expects an error can opt out with
 * `allowConsoleError()`.
 */
let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>
let allowed = false

export function allowConsoleError(): void {
  allowed = true
}

beforeEach(() => {
  allowed = false
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  const errors = consoleErrorSpy.mock.calls
  const warns = consoleWarnSpy.mock.calls
  consoleErrorSpy.mockRestore()
  consoleWarnSpy.mockRestore()

  if (!allowed && (errors.length > 0 || warns.length > 0)) {
    const render = (calls: unknown[][]) =>
      calls.map((c) => c.map((a) => String(a)).join(' ')).join('\n  ')
    expect.fail(
      `Test wrote to the console. Fix the cause, or call allowConsoleError().\n` +
        (errors.length ? `  console.error:\n  ${render(errors)}\n` : '') +
        (warns.length ? `  console.warn:\n  ${render(warns)}\n` : ''),
    )
  }
})
