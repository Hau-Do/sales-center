# Observability

Press **`Ctrl`** + **`` ` ``** — or the **Telemetry** button, bottom right — to watch it happen.

---

## Correlation ids

Every request mints an id, sends it as `x-correlation-id`, and **every mock handler echoes it back**.
Both the request log line and the response log line carry it, so a single interaction is one
greppable thread.

```
debug  req-00007  api.request   {"method":"POST","path":"/leads/lead_0001/activities"}
info   req-00007  api.response  {"method":"POST","status":201,"durationMs":14}
```

Ids are **sequential, not `crypto.randomUUID()`**. A seeded, predictable id keeps a Cypress run
reproducible and lets a spec assert on a specific trace. `resetCorrelationIds()` restores the
sequence between tests.

---

## Structured logging

`logger` emits objects, not interpolated strings, so records stay machine-readable:

```ts
logger.withCorrelation(id).info('api.response', { method, path, status, durationMs })
```

<!-- prettier-ignore -->
```json
{"level":"info","msg":"api.response","at":"2026-09-19T08:15:00.000Z","correlationId":"req-00007","method":"POST","status":201,"durationMs":14}
```

| Level           | Goes to                                             |
| --------------- | --------------------------------------------------- |
| `debug`, `info` | The ring buffer only                                |
| `warn`, `error` | The buffer **and** the console, as single-line JSON |

`debug` and `info` deliberately stay out of the console: the test suites fail on console noise, and
the in-app panel is the intended surface for them.

### The ring buffer

The last 200 records are held in memory and published through `useSyncExternalStore`.

> The snapshot is **cached and frozen**. Returning a fresh array on every call makes React believe
> the store changed on every render — it warns _"The result of getSnapshot should be cached to avoid
> an infinite loop"_ and can spin. Cypress's console guard caught this on the first run.

---

## The in-app telemetry panel

|           |                                                                     |
| --------- | ------------------------------------------------------------------- |
| **Open**  | `Ctrl` + `` ` ``, or the Telemetry button                           |
| **Shows** | Level, correlation id, message and structured context, newest first |
| **Live**  | Updates as requests happen                                          |
| **Clear** | Empties the buffer                                                  |

This is what makes the rest of this document checkable in fifteen seconds rather than taken on trust.

---

## Web Vitals

LCP, INP, CLS, FCP and TTFB are reported into the same structured log, so they sit alongside the API
timings rather than in a separate system:

<!-- prettier-ignore -->
```json
{"level":"info","msg":"web_vital","name":"LCP","value":842.5,"rating":"good"}
```

Worth stating because it is commonly inverted: a **CLS session window ends after a 1-second gap**
between shifts and is **capped at 5 seconds total** — not the other way round.

---

## Error boundaries

A render crash is caught, logged as structured telemetry with the component stack, and replaced with
a recoverable fallback rather than a white screen:

<!-- prettier-ignore -->
```json
{"level":"error","msg":"ui.render_error","message":"...","componentStack":"..."}
```

The boundary wraps the routed outlet, so a crash in one screen does not take out the shell. Unit
tested in `ErrorBoundary.test.tsx`, including recovery after reset.

---

## Making failure visible on purpose

Loading and error states are only real if you can see them. Both are controllable from the URL:

| Parameter          | Effect                                                         |
| ------------------ | -------------------------------------------------------------- |
| `?__latency=800`   | 800 ms added to every mock response — skeletons become visible |
| `?__errorRate=0.3` | Roughly every third **write** fails with a 503                 |

Failures are **deterministic — every Nth write, not a random one** — so a demonstration of the error
path is reproducible.

```
http://localhost:5173/inbox?__latency=800&__errorRate=0.3
```

The 503 carries the same `{code, message, remedy}` shape as every other refusal, so the UI renders a
remedy rather than a stack trace.

---

## What production would change

Only the transport. The shape is already right.

| Concern        | Now                       | In production                                                           |
| -------------- | ------------------------- | ----------------------------------------------------------------------- |
| Log sink       | Ring buffer + console     | `logger`'s `emit` posts to an OTLP collector or Sentry                  |
| Correlation id | Sequential, client-minted | Same header, becomes the **trace id** joining browser and backend spans |
| Web Vitals     | Structured log            | Same payload to an RUM endpoint                                         |
| Errors         | Boundary + console        | Sentry, with the correlation id attached as a tag                       |
| Sampling       | None                      | Head-based sampling on `debug`/`info`; always keep `error`              |

Because every log line already carries a correlation id and every response already echoes it, a
backend span could be joined to the exact browser interaction that produced it without changing a
single call site.

---

## Deliberately not built

| Not built                  | Why                                                                             |
| -------------------------- | ------------------------------------------------------------------------------- |
| Real APM / RUM integration | Needs a backend and credentials; this is a frontend assessment                  |
| Distributed tracing spans  | Would be a fiction with no real backend to trace into                           |
| Session replay             | Heavy, privacy-sensitive, and a product decision rather than an engineering one |
| Log persistence            | The buffer is a debugging aid, not a data store                                 |
