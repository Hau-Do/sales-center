import { describe, it, expect, vi } from 'vitest'
import { createLogger, RING_BUFFER_SIZE, type LogRecord } from './logger'
import { CORRELATION_HEADER, nextCorrelationId, resetCorrelationIds } from './correlation'

const collect = () => {
  const seen: LogRecord[] = []
  const log = createLogger({ emit: (r) => void seen.push(r) })
  return { log, seen }
}

describe('createLogger()', () => {
  it('records at every level', () => {
    const { log, seen } = collect()
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    expect(seen.map((r) => r.level)).toEqual(['debug', 'info', 'warn', 'error'])
  })

  it('attaches structured context rather than interpolating it into the message', () => {
    const { log, seen } = collect()
    log.info('api.response', { status: 200, durationMs: 12 })
    expect(seen[0]?.message).toBe('api.response')
    expect(seen[0]?.context).toEqual({ status: 200, durationMs: 12 })
  })

  it('numbers records so ordering survives equal timestamps', () => {
    const { log, seen } = collect()
    log.info('one')
    log.info('two')
    expect(seen[1]!.seq).toBeGreaterThan(seen[0]!.seq)
  })

  it('filters below the minimum level', () => {
    const seen: LogRecord[] = []
    const log = createLogger({ minLevel: 'warn', emit: (r) => void seen.push(r) })
    log.debug('nope')
    log.info('nope')
    log.warn('yes')
    log.error('yes')
    expect(seen.map((r) => r.message)).toEqual(['yes', 'yes'])
  })

  it('can change level at runtime, for the debug panel', () => {
    const { log, seen } = collect()
    log.setLevel('error')
    expect(log.level()).toBe('error')
    log.warn('dropped')
    log.error('kept')
    expect(seen.map((r) => r.message)).toEqual(['kept'])
  })

  it('stamps a correlation id on a child logger', () => {
    const { log, seen } = collect()
    log.withCorrelation('req-00042').info('api.request')
    expect(seen[0]?.correlationId).toBe('req-00042')
  })

  it('leaves the parent logger uncorrelated', () => {
    const { log, seen } = collect()
    log.withCorrelation('req-1').info('child')
    log.info('parent')
    expect(seen[0]?.correlationId).toBe('req-1')
    expect(seen[1]?.correlationId).toBeUndefined()
  })

  it('keeps a bounded ring buffer, dropping the oldest', () => {
    const log = createLogger({ emit: () => {}, bufferSize: 5 })
    for (let i = 0; i < 12; i += 1) log.info(`m${i}`)
    const records = log.records()
    expect(records).toHaveLength(5)
    expect(records[0]?.message).toBe('m7')
    expect(records.at(-1)?.message).toBe('m11')
  })

  it('defaults to a sensible buffer size', () => {
    expect(RING_BUFFER_SIZE).toBeGreaterThan(50)
  })

  it('returns a frozen snapshot, so a caller cannot corrupt the buffer', () => {
    const log = createLogger({ emit: () => {} })
    log.info('one')
    expect(() =>
      (log.records() as LogRecord[]).push({ seq: 999, level: 'error', message: 'injected', at: 0 }),
    ).toThrow()
    expect(log.records()).toHaveLength(1)
  })

  it('caches the snapshot by reference between writes — useSyncExternalStore needs this', () => {
    const log = createLogger({ emit: () => {} })
    log.info('one')
    const first = log.records()
    expect(log.records()).toBe(first)
    log.info('two')
    expect(log.records()).not.toBe(first)
  })

  it('notifies subscribers and can unsubscribe', () => {
    const log = createLogger({ emit: () => {} })
    const listener = vi.fn()
    const unsubscribe = log.subscribe(listener)
    log.info('one')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    log.info('two')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears the buffer and tells subscribers', () => {
    const log = createLogger({ emit: () => {} })
    const listener = vi.fn()
    log.subscribe(listener)
    log.info('one')
    log.clear()
    expect(log.records()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('emits warn and error to the console as single-line JSON, and stays quiet otherwise', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = createLogger()
    log.debug('quiet')
    log.info('quiet')
    log.warn('loud')
    log.error('louder')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    expect(() => JSON.parse(String(warn.mock.calls[0]?.[0]))).not.toThrow()
    const parsed = JSON.parse(String(error.mock.calls[0]?.[0])) as Record<string, unknown>
    expect(parsed).toMatchObject({ level: 'error', msg: 'louder' })
    expect(typeof parsed['at']).toBe('string')

    warn.mockRestore()
    error.mockRestore()
  })
})

describe('correlation ids', () => {
  it('are sequential and padded, so a trace is readable and reproducible', () => {
    resetCorrelationIds()
    expect(nextCorrelationId()).toBe('req-00001')
    expect(nextCorrelationId()).toBe('req-00002')
  })

  it('reset between specs so ids are stable per test', () => {
    resetCorrelationIds()
    const first = nextCorrelationId()
    resetCorrelationIds()
    expect(nextCorrelationId()).toBe(first)
  })

  it('names the header the mock server echoes', () => {
    expect(CORRELATION_HEADER).toBe('x-correlation-id')
  })
})
