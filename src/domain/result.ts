/**
 * A Result type, because the domain must be able to refuse an operation without
 * throwing.
 *
 * Every rule in this layer answers a question the UI needs to render: not just
 * "was this allowed" but "what do I tell the salesperson, and what can they do
 * about it". So a failure carries a remedy, and the UI renders that remedy
 * verbatim next to a button that performs it. The same string is asserted in
 * the unit test and in the Cypress spec, so the copy cannot drift away from the
 * rule that produced it.
 */

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E = DomainError> = Ok<T> | Err<E>

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error }
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok
}

/** Unwrap, or throw. Only for tests and for call sites that have already checked. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (r.ok) return r.value
  throw new Error(`unwrap() called on an Err: ${JSON.stringify(r.error)}`)
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback
}

export function mapResult<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r
}

/**
 * A refusal from the domain.
 *
 * `code` is stable and machine-readable (asserted in tests, mapped to HTTP
 * status by the mock API). `message` states what happened, `remedy` states what
 * the salesperson can do next.
 */
export interface DomainError {
  readonly code: string
  readonly message: string
  readonly remedy: string
  readonly details?: Readonly<Record<string, unknown>>
}

export function domainError(
  code: string,
  message: string,
  remedy: string,
  details?: Readonly<Record<string, unknown>>,
): DomainError {
  return details === undefined ? { code, message, remedy } : { code, message, remedy, details }
}

/**
 * Exhaustiveness guard. Reaching this means a union grew a member and some
 * switch did not keep up — a compile error at every call site, and a loud
 * throw if it somehow survives to runtime.
 */
/* v8 ignore next 3 -- unreachable by construction; the compile error is the real assertion */
export function assertNever(value: never, context = 'value'): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`)
}
