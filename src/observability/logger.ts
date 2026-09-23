/**
 * Structured logging for a frontend.
 *
 * "Observability" in a browser app is easy to gesture at and hard to make real.
 * The concrete claim here is: every API call carries a correlation id that the
 * mock server echoes back, every log line is structured JSON with that id
 * attached, and the last N lines are held in a ring buffer that the in-app
 * debug panel renders. So a reviewer can click a button, open the panel, and
 * follow that click through to the response it caused.
 *
 * In production this `emit` would post to an OTLP collector or Sentry. That is
 * a transport swap; the shape below is what matters.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export interface LogRecord {
  readonly seq: number
  readonly level: LogLevel
  readonly message: string
  /** Epoch ms. Wall-clock, not the domain clock — this is telemetry, not business time. */
  readonly at: number
  readonly correlationId?: string
  readonly context?: Readonly<Record<string, unknown>>
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/** Keep the buffer small — it is a debugging aid, not a data store. */
export const RING_BUFFER_SIZE = 200

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
  /** A child logger that stamps every record with the same correlation id. */
  withCorrelation(correlationId: string): Logger
  /**
   * A CACHED, frozen snapshot.
   *
   * `useSyncExternalStore` compares snapshots by reference, so returning a
   * fresh array on every call makes React think the store changed on every
   * render — it warns "The result of getSnapshot should be cached to avoid an
   * infinite loop" and can spin. The snapshot is therefore rebuilt only when
   * the buffer actually changes.
   */
  records(): readonly LogRecord[]
  subscribe(listener: () => void): () => void
  clear(): void
  setLevel(level: LogLevel): void
  level(): LogLevel
}

export interface LoggerOptions {
  readonly minLevel?: LogLevel
  /** Where records go in addition to the buffer. Defaults to the console. */
  readonly emit?: (record: LogRecord) => void
  readonly bufferSize?: number
}

function defaultEmit(record: LogRecord): void {
  // Structured, single-line, greppable. A real collector would take the object.
  const payload = JSON.stringify({
    level: record.level,
    msg: record.message,
    at: new Date(record.at).toISOString(),
    ...(record.correlationId !== undefined ? { correlationId: record.correlationId } : {}),
    ...(record.context ?? {}),
  })
  if (record.level === 'error') console.error(payload)
  else if (record.level === 'warn') console.warn(payload)
  // debug and info stay out of the console: the tests fail on console noise,
  // and the debug panel is the intended surface for them.
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const buffer: LogRecord[] = []
  let snapshot: readonly LogRecord[] = Object.freeze([])
  const listeners = new Set<() => void>()
  const bufferSize = options.bufferSize ?? RING_BUFFER_SIZE
  const emit = options.emit ?? defaultEmit
  let minLevel: LogLevel = options.minLevel ?? 'debug'
  let seq = 0

  const refreshSnapshot = (): void => {
    snapshot = Object.freeze([...buffer])
  }

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  const write = (
    level: LogLevel,
    message: string,
    correlationId: string | undefined,
    context: Record<string, unknown> | undefined,
  ): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return
    seq += 1
    const record: LogRecord = {
      seq,
      level,
      message,
      at: Date.now(),
      ...(correlationId !== undefined ? { correlationId } : {}),
      ...(context !== undefined ? { context } : {}),
    }
    buffer.push(record)
    if (buffer.length > bufferSize) buffer.splice(0, buffer.length - bufferSize)
    refreshSnapshot()
    emit(record)
    notify()
  }

  const make = (correlationId?: string): Logger => ({
    debug: (m, c) => write('debug', m, correlationId, c),
    info: (m, c) => write('info', m, correlationId, c),
    warn: (m, c) => write('warn', m, correlationId, c),
    error: (m, c) => write('error', m, correlationId, c),
    withCorrelation: (id: string) => make(id),
    records: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    clear() {
      buffer.length = 0
      refreshSnapshot()
      notify()
    },
    setLevel(level: LogLevel) {
      minLevel = level
    },
    level: () => minLevel,
  })

  return make()
}

/** The application-wide logger. */
export const logger = createLogger()
