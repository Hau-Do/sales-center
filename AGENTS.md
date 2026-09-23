# AGENTS.md — working agreement for this repository

Tool-agnostic conventions for any AI agent (or person) changing this codebase.
`CLAUDE.md` defers to this file.

Read this before the first edit. Most of it exists because something went wrong once.

---

## 1. The one rule everything else follows from

> **`src/domain/` is pure. No React, no `fetch`, no DOM, no ambient clock, no ambient randomness.**

Time, ids and randomness enter through **ports** (`src/ports/`). This is enforced three ways, on
purpose, because each catches what the others miss:

| Guard                           | Catches                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| ESLint `no-restricted-imports`  | The domain importing React, TanStack Query, MSW or a data module   |
| ESLint `no-restricted-syntax`   | `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()` |
| `scripts/check-determinism.mjs` | The same, via grep — an inline lint comment cannot disable it      |

`new Date(epochMs)` is **legal**: it is a pure conversion. Only the zero-argument form reads the
ambient clock.

**If you need the current time in domain code, take a `Clock` parameter.** Every time. This is what
lets Cypress freeze the entire application's sense of time from a URL parameter.

---

## 2. Non-negotiables

### Never hand-compute a constant

Every expected figure — SLA minutes, stage transitions, working-hours spans — is produced by
**running the implementation**, never typed from a calculation done by hand or by a model.

This rule exists because hand-copied constants were the single most common defect found during
design review: three independent design proposals each quoted figures that did not follow from
their own stated formulas.

If you catch yourself typing a number into a test, stop and generate it instead.

### Money is integer pence

No float ever holds a monetary amount. Use `src/domain/money.ts`. Any chain of monetary operations
drifts a penny somewhere in the middle once binary floating point is involved.

`poundsToPence` shifts the **decimal string** rather than multiplying — `1.005 * 100` is
`100.49999999999999`, which rounds down and loses a penny the customer typed.

### Time is a branded epoch-millisecond `Instant`

Not an ISO string. Strings force a parse/format round-trip into every comparison, and that round-trip
is where timezone bugs breed. Use `src/domain/instant.ts`.

Anything a user _sees_ is **London wall-clock** time: the showroom opens at 09:00 local, not 09:00Z.
`toLocalParts`/`fromLocalParts` handle the conversion, including both DST discontinuities.

### The console is a hard failure

A React warning is a bug, not a log line. Both Vitest and Cypress fail a test that writes to
`console.error` or `console.warn`. If a test legitimately exercises an error path, opt in:

```ts
import { allowConsoleError } from '@/test/setup'
allowConsoleError()
```

### Charts follow ASM-VIZ-01

Headline numbers are stat tiles, not one-bar charts. Anything with more than a handful of meaningful
classes is a table. Single-series charts get one hue and no legend. Chart colours are **computed**
against both surfaces and verified by `cypress-axe`, never chosen by eye. Status colours are
reserved for state and never reused as a series.

### Never use `cy.wait(number)` or `cy.intercept()`

- **`cy.wait(number)`** — fixed sleeps are how a suite rots into flakes. Use `cy.settled()`, which
  waits on the app's own `data-app-busy` attribute (driven by `useIsFetching()` + `useIsMutating()`).
- **`cy.intercept()`** — MSW is the single mocking layer. `cy.intercept` stubs fetch _inside the
  page_, so requests never reach the service worker and the two layers silently fight.

Both are banned by lint **and** by `npm run verify:determinism`.

### Reset E2E state from the URL, never over HTTP

**`cy.request` cannot reach MSW.** It is issued from Cypress's Node process and never passes through
the page's service worker. A `cy.request('POST', '/__test__/reset')` silently does nothing — the
suite still goes green while no spec starts from known state, which is the dangerous part.

Use `cy.visitScenario(path, { scenario, now, latencyMs })`, which drives `src/bootstrap.ts`:
parse URL → reset store → `await worker.start()` → render.

---

## 3. Where things go

```
src/domain/        Business rules. Pure. 100% coverage, enforced.
src/ports/         Clock · IdGenerator · Rng interfaces.
src/data/          Db seam (memory | localStorage) + the dealership store.
src/mocks/         MSW handlers + the seeded dataset.
src/api/           REST client. Correlation id per request.
src/app/           Providers, router, shell, the single clock.
src/features/      Screens. Thin — the logic belongs a layer down.
src/components/    Radix-based primitives. Component exports only.
src/observability/ Logger, Web Vitals, error boundary, debug panel.
```

**Adding a business rule?** It goes in `src/domain/`, with unit tests, _before_ any UI touches it.
If the mock API should enforce it too — and it usually should — call the same function from
`src/mocks/handlers.ts`. The rules live in exactly one place.

---

## 4. Conventions that have bitten before

| Convention                                                             | Why                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `.tsx` files export **components only**                                | `react-refresh/only-export-components` fails the build              |
| Don't name a plain helper `useX`                                       | `react-hooks/rules-of-hooks` treats it as a hook and errors         |
| Optional props taking a possibly-`undefined` value need `\| undefined` | `exactOptionalPropertyTypes` is on                                  |
| Tailwind config lives in `src/index.css`                               | v4 is CSS-first; a `tailwind.config.js` does nothing                |
| Verify colour with `cypress-axe`, not by eye or by model               | Near the gamut edge Chromium reduces chroma where a model clips     |
| Tests live in `tsconfig.test.json`, which has Node types               | `tsconfig.app.json` omits them, so app code can't reach `node:fs`   |
| Don't alias a value with `invoke('text').as()` to compare later        | The alias re-resolves, so "before" and "after" are both "after"     |
| Two values read separately need two elements                           | A count and a percentage in one cell read as `"1225.0%"`            |
| A derived field is derived, never set in parallel                      | A field set from a flag drifted from the log; two screens disagreed |
| Domain errors are `{code, message, remedy}`                            | The UI renders `remedy`; the same string is asserted in both suites |

---

## 5. Before you call it done

```bash
npm run verify              # typecheck → lint → determinism → coverage → build
npm run e2e                 # 58 specs, zero retries
npm run mutation-sanity     # 4/4 mutations must be killed
```

If you changed a domain constant, `mutation-sanity` may need updating — but **only** if the constant
genuinely moved. If a mutation _survives_, that is a hole in the tests, not a reason to delete the
mutation.

If you added a domain module, it must reach **100%** coverage. For a branch that is genuinely
unreachable (a `??` fallback that only exists to satisfy `noUncheckedIndexedAccess`), use
`/* v8 ignore next -- reason */` **with the reason written out**. Never a bare ignore.

---

## 6. Documented assumptions

The brief permits reasonable assumptions provided they are documented. They live in
`docs/assumptions.md` with numbered ids (`ASM-FIN-02`), and each id is **cited in code at the point
of use**. If you make a new judgement call, add an id — do not bury it in a comment.
