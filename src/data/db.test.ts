import { describe, it, expect, beforeEach, vi } from 'vitest'
import { type Db, localStorageDb, memoryDb } from './db'
import { allowConsoleError } from '@/test/setup'

/**
 * One contract, run against both implementations.
 *
 * "Persistence is swappable" is an assertion until the same suite passes
 * against every implementation. Parameterising the describe block is what turns
 * it into evidence — and it is how the in-memory path used by Vitest is kept
 * honest about what the browser path actually does.
 */

/** A minimal in-process Storage, so the browser path is testable under Node. */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  const api = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
  // Object.keys(storage) must enumerate the stored keys, as it does in a browser.
  return new Proxy(api as unknown as Storage, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  })
}

const implementations: ReadonlyArray<[string, () => Db]> = [
  ['memoryDb', () => memoryDb()],
  ['localStorageDb', () => localStorageDb(fakeStorage())],
]

describe.each(implementations)('Db contract: %s', (_name, create) => {
  let db: Db

  beforeEach(() => {
    db = create()
  })

  it('returns an empty array for a collection that was never written', () => {
    expect(db.get('leads')).toEqual([])
  })

  it('round-trips rows', () => {
    db.set('leads', [{ id: 'a' }, { id: 'b' }])
    expect(db.get('leads')).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('replaces a collection wholesale rather than appending', () => {
    db.set('leads', [{ id: 'a' }])
    db.set('leads', [{ id: 'b' }])
    expect(db.get('leads')).toEqual([{ id: 'b' }])
  })

  it('keeps collections independent', () => {
    db.set('leads', [{ id: 'a' }])
    db.set('activities', [{ id: 'x' }])
    expect(db.get('leads')).toEqual([{ id: 'a' }])
    expect(db.get('activities')).toEqual([{ id: 'x' }])
  })

  it('stores an empty collection distinctly from an absent one', () => {
    db.set('leads', [])
    expect(db.get('leads')).toEqual([])
    expect(db.collections()).toContain('leads')
  })

  it('lists collections in a stable, sorted order', () => {
    db.set('zeta', [{ id: 1 }])
    db.set('alpha', [{ id: 2 }])
    db.set('mid', [{ id: 3 }])
    expect(db.collections()).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('clear() forgets everything', () => {
    db.set('leads', [{ id: 'a' }])
    db.set('activities', [{ id: 'x' }])
    db.clear()
    expect(db.collections()).toEqual([])
    expect(db.get('leads')).toEqual([])
  })

  it('does not alias the caller’s array — mutating the input cannot corrupt the store', () => {
    const rows = [{ id: 'a' }]
    db.set('leads', rows)
    rows.push({ id: 'injected' })
    expect(db.get('leads')).toEqual([{ id: 'a' }])
  })

  it('does not alias the returned array — mutating a read cannot corrupt the store', () => {
    db.set('leads', [{ id: 'a' }])
    const first = db.get<{ id: string }>('leads')
    first.push({ id: 'injected' })
    expect(db.get('leads')).toEqual([{ id: 'a' }])
  })

  it('preserves nested structures and value types', () => {
    const row = { id: 'a', nested: { deep: [1, 2, 3] }, flag: false, count: 0, when: 1758214320000 }
    db.set('leads', [row])
    expect(db.get('leads')).toEqual([row])
  })

  it('handles a large collection without truncating', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: `lead_${i}` }))
    db.set('leads', rows)
    expect(db.get('leads')).toHaveLength(500)
  })
})

describe('localStorageDb resilience', () => {
  it('degrades to memory when storage throws on read, and keeps working', () => {
    allowConsoleError()
    const hostile = {
      getItem: () => {
        throw new DOMException('SecurityError')
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage

    const db = localStorageDb(hostile)
    expect(db.get('leads')).toEqual([])
    db.set('leads', [{ id: 'a' }])
    expect(db.get('leads')).toEqual([{ id: 'a' }])
  })

  it('degrades to memory when a write exceeds quota', () => {
    allowConsoleError()
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError')
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage

    const db = localStorageDb(full)
    db.set('leads', [{ id: 'a' }])
    expect(db.get('leads')).toEqual([{ id: 'a' }])
  })

  it('warns once rather than on every access', () => {
    allowConsoleError()
    const warn = vi.spyOn(console, 'warn')
    const hostile = {
      getItem: () => {
        throw new Error('nope')
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage

    const db = localStorageDb(hostile)
    db.get('a')
    db.get('b')
    db.get('c')
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('[db]'))).toHaveLength(1)
  })

  it('only clears its own keys, leaving unrelated storage alone', () => {
    const storage = fakeStorage()
    storage.setItem('unrelated', 'keep me')
    const db = localStorageDb(storage)
    db.set('leads', [{ id: 'a' }])
    db.clear()
    expect(storage.getItem('unrelated')).toBe('keep me')
    expect(db.get('leads')).toEqual([])
  })
})
