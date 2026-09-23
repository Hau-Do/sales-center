# Sales Center

A lead management tool - **Keyloop technical assessment, Scenario C**.

Built as a **frontend**, with the backend mocked at the network boundary.

---

## Quick start

```bash
npm ci          # installs clean: no overrides, no --legacy-peer-deps
npm run dev     # http://localhost:5173
```

Requires **Node 20.19+, 22, 24, 25 or 26**.

### Commands

| Command                              | What it does                                              |
| ------------------------------------ | --------------------------------------------------------- |
| `npm run dev`                        | Dev server with the mock API on `:5173`                   |
| `npm run build`                      | Typecheck and production build                            |
| `npm run preview`                    | Serve the production build on `:4173`                     |
| `npm test`                           | Unit and component tests (Vitest)                         |
| `npm run test:watch`                 | Watch mode                                                |
| `npm run test:coverage`              | With the coverage gate, including 100% on `src/domain/**` |
| `npm run e2e`                        | Cypress headless against the dev server                   |
| `npm run e2e:open`                   | Interactive Cypress runner                                |
| `npm run e2e:ci`                     | Builds with `VITE_E2E=1`, then tests that build           |
| `npm run mutation-sanity`            | Break the code on purpose; assert the tests notice        |
| `npm run verify:determinism`         | Enforce the E2E determinism contract                      |
| `npm run lint` · `npm run typecheck` | ESLint flat config · `tsc -b`                             |
| `npm run verify`                     | Everything above, in order                                |

---

## Features Implementation

### Part A - core requirements

| Requirement                                      | Where                           | Proof                                    |
| ------------------------------------------------ | ------------------------------- | ---------------------------------------- |
| **1. Lead Inbox** - list all incoming leads      | `src/features/inbox/`           | `01-lead-inbox.cy.ts`                    |
| **2. Lead Details** + chronological activity log | `src/features/lead-detail/`     | `02-lead-detail-activity.cy.ts`          |
| **3. Activity logging, persisted**               | dialog → MSW → `localStorageDb` | _"PERSISTS … across a full page reload"_ |

### Part B - enhancements

| Enhancement                                                                    | Status                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Response-target (SLA) engine measured in **working minutes**                   | ✅ Bank holidays, Sunday trading, both DST discontinuities |
| Pipeline **state machine** with guards that carry remedies                     | ✅ All 144 stage pairs tested                              |
| **Pipeline board** - keyboard-operable moves, guards with remedies             | ✅                                                         |
| **Observability** - correlation ids, structured logs, Web Vitals, in-app panel | ✅                                                         |

---

## Automation Testing

```
      ╭──────────────────────────────╮
      │  58 Cypress E2E specs        │   full journeys, zero retries
      ╰──────────────────────────────╯
   ╭────────────────────────────────────╮
   │  ~180 component + integration      │   RTL through real MSW handlers
   ╰────────────────────────────────────╯
╭──────────────────────────────────────────╮
│  ~760 domain unit tests                  │   pure functions, 100% covered
╰──────────────────────────────────────────╯
```

**475 unit/component tests · 58 E2E specs.** Details in **[docs/testing.md](docs/testing.md)**,
including the determinism contract and how to read the artifacts.

### Viewing E2E results

```bash
npm run e2e          # headless; videos written for every spec
npm run e2e:open     # interactive, with time-travel debugging
```

| Artifact                            | Location                                             |
| ----------------------------------- | ---------------------------------------------------- |
| Video of every spec                 | `cypress/videos/*.mp4`                               |
| Screenshot at the moment of failure | `cypress/screenshots/`                               |
| Coverage HTML report                | `coverage/index.html`                                |
| Accessibility violations            | Printed to the terminal with element, impact and fix |

### There is no `cy.wait()` anywhere

Fixed sleeps are how a suite rots into flakes. The app publishes its own quiescence signal -
`data-app-busy`, driven by TanStack Query's in-flight counts - and `cy.settled()` waits on that.
The ban is enforced twice: by ESLint, and by `scripts/check-determinism.mjs`, which is a grep that
an inline lint comment cannot switch off. `retries` is set to **0**, so a flake fails the build
rather than hiding.

---

## Project structure

```
src/
├── domain/          PURE. No React, no fetch, no ambient clock. 100% covered.
│   ├── money.ts         integer pence; no float ever holds an amount
│   ├── instant.ts       branded epoch-ms + the London wall-clock inverse
│   ├── businessHours.ts opening hours, bank holidays, Sunday trading
│   ├── sla.ts           response targets in WORKING minutes
│   ├── pipeline.ts      stage machine; guards carry remedies
│   └── activities.ts    timeline ordering + contradiction detection
├── ports/           Clock · IdGenerator · Rng — the only nondeterminism
├── data/            Db seam (memory | localStorage) + the dealership store
├── mocks/           MSW handlers, seeded dataset, scenario generator
├── api/             REST client; a correlation id on every request
├── app/             providers, router, shell, the single ticking clock
├── features/        inbox · lead-detail
├── components/      Radix-based primitives
└── observability/   logger · Web Vitals · error boundary · debug panel
```

## System Design Document

Please read **[SYSTEM-ANALYSIS.md](SYSTEM-ANALYSIS.md)** before opening [SYSTEM-DESIGN.html](SYSTEM-DESIGN.html) with a browser.

## **AI Collaboration Narrative**

How the AI was directed, how its output was
verified, what it got wrong.

### The strategy: make something external adjudicate

The strategy was not "generate, then review by reading". Reading
does not catch a wrong annuity factor. The strategy was to build **independent adjudicators** and
let them referee.

That produced a set of artifacts that exist purely to disagree with the generated code:

1. **`scripts/mutation-sanity.mjs`** - flips four constants and asserts the suite goes red. Coverage
   says a line _ran_; this asks whether anything would _notice_ if it were wrong.
2. **`cypress-axe`** - after a model-based colour calculation disagreed with the browser, axe became
   the arbiter for contrast rather than any prediction.
3. **The 144-pair transition table** - generated against a _rule_, not a hand-copied matrix, because
   a hand-copied matrix is just a second place to make the same mistake.

### What the AI actually got wrong

Every entry is a real defect caught by running something, with the test that caught it.
The full log is **[docs/ai-collaboration/corrections.md](docs/ai-collaboration/corrections.md)**.

### How quality was maintained

- **No hand-computed constants, anywhere.** Every expected figure is generated by running the code.
  This rule exists because hand-copied constants were the most common defect found in review.
- **The console is a hard failure.** A React warning fails the test, in both Vitest and Cypress. A
  test that needs an error opts in explicitly with `allowConsoleError()`.
- **Automated architectural compliance via Lint.** `src/domain/` cannot import React or data access,
  and cannot call `Date.now()`, `new Date()` or `Math.random()` - `new Date(epochMs)` stays legal.
  Backed by `scripts/check-determinism.mjs`, which a lint comment cannot disable.
- **Assumptions are numbered and cited in code** at the point of use, so they are addressable rather
  than buried in prose.
- **Every refusal carries a remedy.** A domain error is `{code, message, remedy}`, the UI renders the
  remedy verbatim, and the same string is asserted in the unit test _and_ the Cypress spec - so the
  copy cannot drift from the rule that produced it.

### What I would do differently

Every domain module was written and verified before the screen that renders it. That ordering was
right - a UI over unverified logic looks finished and is not - and every screen proved the point:
each took a fraction of the time its domain module did, because the hard part was already settled
and the component had nothing to do but render it.

The thing I would change is **when the cross-surface checks got written**. A four-line spec
asserting that two screens derived the same never-worked count found that they were computed from
different sources - a discrepancy that had been sitting in the seed data for hours. Checks that compare two surfaces against each other are cheap and catch a class of bug that
no amount of testing either surface alone will find. Next time they go in with the second screen,
not the fifth.

---

## Documentation

| Document                                             | Contents                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **[SYSTEM-ANALYSIS.md](SYSTEM-ANALYSIS.md)**         | System Analysis, Problems, Technology Choices, Observability                                  |
| **[SYSTEM-DESIGN.md](SYSTEM-DESIGN.md)**             | Markdown version of the System Design Document with Mermaid architecture diagrams             |
| **[SYSTEM-DESIGN.pdf](SYSTEM-DESIGN.pdf)**           | The System Design Document (.pdf file): business context, architecture, trade-offs, judgment  |
| **[SYSTEM-DESIGN.html](SYSTEM-DESIGN.html)**         | The System Design Document (.html page): business context, architecture, trade-offs, judgment |
| [docs/testing.md](docs/testing.md)                   | Test strategy, the determinism contract, reading the artifacts                                |
| [docs/observability.md](docs/observability.md)       | Logging, correlation ids, Web Vitals, the production path                                     |
| [docs/assumptions.md](docs/assumptions.md)           | Numbered assumption register, cited from code                                                 |
| **[docs/ai-collaboration/](docs/ai-collaboration/)** | Prompt strategy, verification log, corrections log                                            |
| **[CLAUDE.md](CLAUDE.md) & [AGENTS.md](AGENTS.md)**  | Working agreement for AI agents in this repository                                            |
