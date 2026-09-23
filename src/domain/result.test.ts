import { describe, it, expect } from 'vitest'
import {
  assertNever,
  domainError,
  err,
  isErr,
  isOk,
  mapResult,
  ok,
  unwrap,
  unwrapOr,
} from './result'

describe('ok() and err()', () => {
  it('wraps a success', () => {
    const r = ok(42)
    expect(r.ok).toBe(true)
    expect(r.value).toBe(42)
  })

  it('wraps a failure', () => {
    const e = domainError('NOPE', 'It did not work.', 'Try the other thing')
    const r = err(e)
    expect(r.ok).toBe(false)
    expect(r.error).toBe(e)
  })

  it('narrows with isOk and isErr', () => {
    const good = ok('yes')
    const bad = err(domainError('X', 'm', 'r'))
    expect(isOk(good)).toBe(true)
    expect(isErr(good)).toBe(false)
    expect(isOk(bad)).toBe(false)
    expect(isErr(bad)).toBe(true)
  })
})

describe('unwrap()', () => {
  it('returns the value of an Ok', () => {
    expect(unwrap(ok('value'))).toBe('value')
  })

  it('throws on an Err, including the error in the message', () => {
    expect(() => unwrap(err(domainError('BOOM', 'exploded', 'stand back')))).toThrow(/BOOM/)
  })

  it('unwrapOr falls back without throwing', () => {
    expect(unwrapOr(ok(1), 99)).toBe(1)
    expect(unwrapOr(err(domainError('X', 'm', 'r')), 99)).toBe(99)
  })
})

describe('mapResult()', () => {
  it('maps the value of an Ok', () => {
    const r = mapResult(ok(2), (n) => n * 10)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(20)
  })

  it('passes an Err straight through, unchanged', () => {
    const e = domainError('X', 'm', 'r')
    const r = mapResult(err(e), (n: number) => n * 10)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe(e)
  })
})

describe('domainError()', () => {
  it('always carries a code, a message and a remedy', () => {
    const e = domainError('LICENCE_CHECK_REQUIRED', 'Not checked.', 'Log a licence check')
    expect(e).toEqual({
      code: 'LICENCE_CHECK_REQUIRED',
      message: 'Not checked.',
      remedy: 'Log a licence check',
    })
  })

  it('omits details entirely when none are given, rather than setting undefined', () => {
    const e = domainError('X', 'm', 'r')
    expect('details' in e).toBe(false)
  })

  it('carries details when given', () => {
    const e = domainError('X', 'm', 'r', { stage: 'test-drive' })
    expect(e.details).toEqual({ stage: 'test-drive' })
  })
})

describe('assertNever()', () => {
  it('throws when an impossible value reaches it', () => {
    // Deliberately lying to the compiler to prove the runtime guard works.
    expect(() => assertNever('unexpected' as never, 'stage')).toThrow(/Unhandled stage/)
  })
})
