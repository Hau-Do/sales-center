import { setupWorker } from 'msw/browser'
import { createStore } from '@/data/store'
import { localStorageDb } from '@/data/db'
import { createHandlers } from './handlers'

/**
 * The browser-side mock. Backed by localStorage, so an activity logged by the
 * reviewer survives a page reload — which is what Part A's "must be persisted"
 * actually asks for.
 */
export const browserStore = createStore(localStorageDb())
export const worker = setupWorker(...createHandlers(browserStore))
