import './commands'
import 'cypress-axe'

/**
 * A console error is a test failure — but NOT by throwing from inside
 * `console.error`.
 *
 * The first version of this guard threw immediately. That was actively
 * harmful: the API client logs `api.response_error` while handling a failed
 * response, so the throw landed inside the application's own promise chain.
 * TanStack Query then stored the guard's generic `Error` instead of the
 * client's typed `ApiError`, `instanceof ApiError` went false, and the error
 * UI never rendered — so a spec asserting the error path failed with
 * "element not found" while the real behaviour was fine. The guard was
 * corrupting the thing it was meant to observe.
 *
 * It now RECORDS calls and asserts in afterEach, which is how the Vitest guard
 * has always worked, and offers the same opt-out for specs that deliberately
 * drive an error path.
 */
const recorded: string[] = []
let allowed = false

Cypress.Commands.add('allowConsoleError', () => {
  allowed = true
})

Cypress.on('window:before:load', (win) => {
  const original = win.console.error.bind(win.console)
  win.console.error = (...args: unknown[]) => {
    original(...args)
    const text = args.map((a) => String(a)).join(' ')
    // MSW announces itself on start; that is not an application error.
    if (text.includes('[MSW]')) return
    recorded.push(text)
  }
})

beforeEach(() => {
  recorded.length = 0
  allowed = false
})

afterEach(() => {
  if (!allowed && recorded.length > 0) {
    const lines = recorded.join('\n  ')
    recorded.length = 0
    throw new Error(`The application wrote to console.error during this test:\n  ${lines}`)
  }
  recorded.length = 0
})

Cypress.on('uncaught:exception', (error) => {
  throw error
})
