# Testing

**475 unit and component tests · 58 Cypress E2E specs · 100% coverage on `src/domain/**`, enforced.**

The brief asks for "a suite of tests that validate the core business logic". This document explains
what is tested where, why the E2E suite cannot flake, and how to read the output.

---

## The shape of the suite

```
      ╭──────────────────────────────╮
      │   58 Cypress E2E specs       │   complete user journeys
      ╰──────────────────────────────╯       zero retries, no cy.wait()
   ╭────────────────────────────────────╮
   │  ~180 component + integration      │   RTL, driven through real MSW handlers
   ╰────────────────────────────────────╯
╭──────────────────────────────────────────╮
│   ~760 domain unit tests                 │   pure functions, no DOM, no network
╰──────────────────────────────────────────╯
```

The base is wide on purpose. Because the domain is pure, its tests are fast, exhaustive and
completely deterministic — which is where the value is, since the domain is where the dealership's
rules actually live.

| Layer           | What it covers                                                   | Runs in            |
| --------------- | ---------------------------------------------------------------- | ------------------ |
| **Domain unit** | Money, time, business hours, SLA, pipeline, activities           | Node, milliseconds |
| **Contract**    | `Db` — 26 tests against **both** `memoryDb` and `localStorageDb` | Node               |
| **Integration** | The REST client → MSW handlers → store → domain, end to end      | Node + jsdom       |
| **Component**   | Screens via React Testing Library, through the **real** handlers | jsdom              |
| **E2E**         | Whole journeys in a real browser against the real service worker | Electron/Chrome    |

---

## What is tested where, and why

### Domain — exhaustive, because it is cheap and it is the product

| Module          | Notable coverage                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `money`         | Float-precision traps (`1.005 * 100`), largest-remainder allocation that always sums exactly, both rounding modes |
| `instant`       | Both DST discontinuities, the bounded London↔UTC inverse, round-trip properties across the year                   |
| `businessHours` | Bank holidays, Sunday trading, the Friday 17:52 anchor, spans crossing a DST change, iteration caps               |
| `sla`           | Every state boundary, walk-in exclusion, median-of-even, null-not-zero denominators                               |
| `pipeline`      | **All 144 ordered stage pairs** (12 stages), every guard, every refusal's remedy string                           |
| `activities`    | Total ordering, day grouping, five kinds of chain contradiction                                                   |

The transition table is generated against **the rule**, not a hand-copied matrix — a hand-copied
matrix is just a second place to make the same mistake.

### Integration — because unit tests of one layer prove nothing about two

`src/mocks/handlers.test.ts` drives the **real REST client** against the **real handlers**. It
proves the client's URL building, the handlers' routing and the store's persistence agree with each
other, which no unit test can. It also pins the behaviour that matters most: logging a genuine
contact stops the SLA clock **server-side**, so the UI cannot talk its way out of a missed target.

### E2E — complete journeys, not clicks

| Spec                      | Journey                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `01-lead-inbox`           | Triage, views, search, two sort orders, empty state, **URL-restored state**             |
| `02-lead-detail-activity` | Open a lead → read the timeline → log an activity → **reload and confirm it persisted** |
| `03-sla-working-hours`    | The Friday 17:52 enquiry: amber not breached, 23 working minutes, tips into breach      |
| `04-pipeline-guards`      | A blocked test drive → log the remedy → the move unblocks                               |
| `05-pipeline-board`       | Keyboard-driven stage moves, a guard refusing one, lost-reason capture                  |
| `06-observability`        | The telemetry panel, correlation ids on real calls, Web Vitals, a deliberate 503        |
| `07-accessibility`        | axe on every screen and the dialog, focus trap, keyboard reachability, both themes      |

The numbering follows the build order in the plan, so a milestone's stated verification names the
spec that proves it.

---

## The determinism contract

An E2E suite that flakes gets muted, and a muted suite tests nothing. Five rules, all enforced
mechanically.

### 1. No `cy.wait(number)` — ever

Fixed sleeps are how a suite rots. The app publishes its own quiescence signal:

```tsx
// AppShell.tsx
const busy = useIsFetching() + useIsMutating() > 0
<div data-app-busy={busy ? 'true' : 'false'}>
```

```ts
// cypress/support/commands.ts
cy.get('[data-app-busy]').should('have.attr', 'data-app-busy', 'false')
```

`cy.settled()` waits on the application's actual state, so it is neither slower nor faster than the
work it is waiting for.

### 2. No `cy.intercept()`

MSW is the single mocking layer. `cy.intercept` stubs fetch _inside the page_, so requests never
reach the service worker and the two silently fight — and Cypress 15+ using native browser
networking makes that interaction worse, not better.

### 3. State is reset from the URL, never over HTTP

**`cy.request` cannot reach MSW.** It is issued from Cypress's Node process and never passes through
the page's service worker. `cy.request('POST', '/__test__/reset')` silently does nothing: it 404s
against the dev server while every spec inherits the previous spec's state — and the suite still
goes green, which is the dangerous part.

So reset happens **in the page**, before the worker starts and before React renders:

```ts
cy.visitScenario('/inbox', { scenario: 'sla-breach', now: '2026-09-19T08:15:00Z' })
// → /inbox?__seed=sla-breach&__now=2026-09-19T08:15:00Z
```

`src/bootstrap.ts`: parse URL → reset store → `await worker.start()` → render. Race-free by
construction, and every scenario becomes a shareable link.

### 4. Time is frozen

Under `VITE_E2E`, `ClockProvider` does not advance on its own. A spec moves time deliberately with
`cy.advanceClock(ms)`, which re-enters the page with a later `__now`.

> An earlier version of that helper mutated the store and called `cy.reload()` — which silently
> undid itself, because the reloaded URL still carried the original `__now` and the bootstrap
> reseeded from it. Going through the URL contract keeps one mechanism in charge of the clock.

### 5. Nothing animates

Under `VITE_E2E`, `src/bootstrap.ts` sets `data-e2e` on the document and the stylesheet zeroes every
transition and animation.

> This rule exists because an accessibility scan once landed **mid-transition** after a theme
> toggle and measured contrast against an interpolated blend the user never sees — `#553433`, a
> colour that appears nowhere in the theme. It passed in isolation and failed in the full suite,
> which is the signature of a timing flake. The original contract covered waiting for _data_; it
> did not cover waiting for _paint_.

### 6. `retries: 0`, and the console is a hard failure

A flake fails the build rather than hiding behind a retry. And any `console.error` — a React
warning, a failed prop type, an unhandled rejection — fails the test in **both** Vitest and Cypress.
A test that legitimately drives an error path opts in: `allowConsoleError()` in Vitest,
`cy.allowConsoleError()` in Cypress.

> The guard **records and asserts in `afterEach`**; it does not throw from inside `console.error`.
> An earlier version did, and because the API client logs while handling a failed response, the
> throw landed in the application's own promise chain — TanStack Query stored the guard's generic
> `Error` instead of the client's typed `ApiError`, and the error UI stopped rendering. The guard
> was replacing the behaviour it existed to observe. Instrumentation must not participate in the
> control flow it watches.

### Enforcement

ESLint bans the patterns, and `scripts/check-determinism.mjs` greps for them — because a lint rule
can be disabled with an inline comment and a grep cannot.

```bash
npm run verify:determinism
```

---

## Beyond coverage

A coverage percentage says every line _ran_. It does not say anything would _notice_ if a line were
wrong. Three artifacts answer the stronger question.

### `npm run mutation-sanity`

Flips four load-bearing constants one at a time and asserts the suite **goes red** each time:

```
   ✓ killed    money rounding: half-up -> half-even
   ✓ killed    SLA amber threshold: 25% -> 40%
   ✓ killed    licence check validity: 365 -> 30 days
   ✓ killed    pipeline rewind limit: 1 -> 5 stages

  4/4 mutations killed
```

A survivor is a hole in the tests, and the script fails the build so it cannot be ignored. The
source file is always restored, including on interrupt.

### The 100% domain gate

```js
thresholds: {
  lines: 85, branches: 80, functions: 85, statements: 85,
  '**/src/domain/**': { lines: 100, branches: 100, functions: 100, statements: 100 },
}
```

Two things worth knowing, both of which silently disable the gate if got wrong:

- **Vitest has no `global:` threshold key** — that is Jest. Aggregate thresholds are top-level
  fields inside `thresholds`; _every other key is treated as a glob_.
- The leading `**/` matters. A bare `src/domain/**` can fail to match resolved absolute paths and
  enforce nothing at all.

Prove the gate is real by deleting a domain test and watching CI fail.

For a branch that is genuinely unreachable — a `??` fallback existing only to satisfy
`noUncheckedIndexedAccess` — use `/* v8 ignore next -- reason */` **with the reason written out**.
Never a bare ignore.

---

## Running and reading the results

```bash
npm test                     # unit + component
npm test -- sla              # one pattern
npm run test:watch
npm run test:coverage        # with the gate
npm run e2e                  # Cypress headless
npm run e2e:open             # interactive, with time travel
npm run e2e:ci               # builds with VITE_E2E=1, then tests that build
npm run verify               # typecheck → lint → determinism → coverage → build
```

| Artifact                            | Location                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| Video of every spec                 | `cypress/videos/*.mp4`                                    |
| Screenshot at the moment of failure | `cypress/screenshots/`                                    |
| Coverage HTML                       | `coverage/index.html`                                     |
| Coverage for CI tooling             | `coverage/lcov.info`, `coverage/coverage-summary.json`    |
| Accessibility violations            | Terminal, with element selector, impact and suggested fix |

CI uploads all of them on every run, pass or fail, and prints the mutation result into the job
summary.

### Cypress will not start with `ELECTRON_RUN_AS_NODE` set

VS Code's integrated terminal sets it. Electron then runs as plain Node and rejects its own flags,
failing with `bad option: --no-sandbox`:

```bash
env -u ELECTRON_RUN_AS_NODE npm run e2e
```

---

## Writing a new test here

1. **Domain rule?** Unit-test it in `src/domain/` first, to 100%. Do not reach for the UI.
2. **Never type a constant.** Generate expected figures by running the implementation rather than
   hand-computing them — a hand-copied number is a second place to make the same mistake.
3. **When a test fails, work out which side is wrong.** Several failures here were the _test_: a
   fixture pinning `recordedAt` while overriding `occurredAt`; an assertion that `09:00Z` was 09:00
   in London when it is 10:00 BST. "Fixing" the implementation would have introduced a bug and
   hidden the real one.
4. **E2E specs assert on `data-testid`**, never on CSS classes or copy that will change.
5. **Every E2E spec starts with `cy.visitScenario()`.** A spec that passes alone and fails in the
   suite is leaking state — or waiting on paint rather than on data.
6. **Never alias a value with `invoke('text').as()` and compare it later.** The alias re-resolves
   against the live DOM, so "before" and "after" are both "after". Capture into a closure inside
   `.then()`.
7. **Cross-check surfaces against each other.** When two screens derive the same number, assert
   they agree. A four-line spec of exactly that kind once caught two surfaces computing the
   never-worked count from different sources; testing either alone would never have surfaced it.
