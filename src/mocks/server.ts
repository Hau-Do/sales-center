import { setupServer } from 'msw/node'
import { createStore } from '@/data/store'
import { memoryDb } from '@/data/db'
import { createHandlers } from './handlers'

/**
 * The Node-side mock, for Vitest. Backed by memory so each test file is
 * isolated, but running the SAME handlers as the browser — which is the point:
 * what the tests prove is what the reviewer sees.
 */
export const testStore = createStore(memoryDb())
export const server = setupServer(...createHandlers(testStore))
