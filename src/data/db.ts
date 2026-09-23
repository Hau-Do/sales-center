/**
 * The persistence seam.
 *
 * "Activity logging must be persisted" is a Part A requirement, and the honest
 * way to satisfy it in a frontend-only build is to name the seam rather than
 * scatter `localStorage` calls through the app. `Db` is that seam: a tiny
 * document store with two implementations that are proven identical by one
 * shared contract test.
 *
 *  - `memoryDb`   — what Vitest runs against. Fast, isolated, no globals.
 *  - `localStorageDb` — what the browser runs against, so a logged activity
 *                       survives a reload (ASM-DATA-01).
 *
 * Swapping in a real backend replaces this file and nothing else.
 */

export interface Db {
  /** All rows in a collection, or an empty array if it has never been written. */
  get<T>(collection: string): T[]
  /** Replace a collection wholesale. */
  set<T>(collection: string, rows: readonly T[]): void
  /** Forget everything. Used by the scenario bootstrap between E2E specs. */
  clear(): void
  /** Names of every collection currently holding data. */
  collections(): string[]
}

export function memoryDb(): Db {
  const store = new Map<string, unknown[]>()
  return {
    get<T>(collection: string): T[] {
      // Clone on read so a caller mutating the result cannot corrupt the store
      // — the browser implementation gets this for free via JSON, and the two
      // must behave identically or the contract test is a lie.
      return structuredClone(store.get(collection) ?? []) as T[]
    },
    set<T>(collection: string, rows: readonly T[]): void {
      store.set(collection, structuredClone([...rows]) as unknown[])
    },
    clear(): void {
      store.clear()
    },
    collections(): string[] {
      return [...store.keys()].sort()
    },
  }
}

const PREFIX = 'sc.db.'

/**
 * localStorage-backed store.
 *
 * Every access is wrapped: storage throws outright in a private window with
 * site data blocked, and a quota error on write is not hypothetical once a
 * seeded dataset is in play. A storage failure degrades to in-memory behaviour
 * rather than taking the app down — the reviewer still sees a working inbox.
 */
export function localStorageDb(storage: Storage = globalThis.localStorage): Db {
  const fallback = memoryDb()
  let degraded = false

  const degradeToMemory = (reason: unknown): void => {
    if (!degraded) {
      degraded = true
      console.warn('[db] localStorage unavailable, falling back to memory:', reason)
    }
  }

  return {
    get<T>(collection: string): T[] {
      if (degraded) return fallback.get<T>(collection)
      try {
        const raw = storage.getItem(PREFIX + collection)
        return raw === null ? [] : (JSON.parse(raw) as T[])
      } catch (error) {
        degradeToMemory(error)
        return fallback.get<T>(collection)
      }
    },

    set<T>(collection: string, rows: readonly T[]): void {
      if (degraded) {
        fallback.set(collection, rows)
        return
      }
      try {
        storage.setItem(PREFIX + collection, JSON.stringify(rows))
      } catch (error) {
        degradeToMemory(error)
        fallback.set(collection, rows)
      }
    },

    clear(): void {
      if (degraded) {
        fallback.clear()
        return
      }
      try {
        for (const key of Object.keys(storage)) {
          if (key.startsWith(PREFIX)) storage.removeItem(key)
        }
      } catch (error) {
        degradeToMemory(error)
        fallback.clear()
      }
    },

    collections(): string[] {
      if (degraded) return fallback.collections()
      try {
        return Object.keys(storage)
          .filter((k) => k.startsWith(PREFIX))
          .map((k) => k.slice(PREFIX.length))
          .sort()
      } catch (error) {
        degradeToMemory(error)
        return fallback.collections()
      }
    },
  }
}
