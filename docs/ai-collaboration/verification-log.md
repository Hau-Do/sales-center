# Verification log

What was checked, how, and what it found — in build order. The
[corrections log](corrections.md) records the defects; this records the _process_, including the
checks that found nothing (which is also information).

> **Historical record.** The scope was later trimmed back to a lean MVP, and the Deal Builder,
> finance engine, propensity scoring and manager dashboard were removed. The sections covering them
> are kept as written, because what was verified and what it cost is evidence about the _method_,
> and deleting it would flatter the record. Sections marked **retired** describe code that is no
> longer in the repository.

---

## M0 · Toolchain

| Check                                       | Method                                           | Outcome                                            |
| ------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Do the pinned versions install cleanly?     | `npm install`, read the output                   | ⚠️ `jsdom@30` excluded Node 25 → pinned `^29` (#6) |
| Zero peer conflicts or overrides?           | Clean install from scratch                       | ✅ 615 packages, 0 vulns, 0 `EBADENGINE`           |
| Does the ESLint flat config load?           | `npx eslint .`                                   | ⚠️ `recommended-latest` is legacy-shaped (#5)      |
| Does the **domain-purity rule fire**?       | A probe file using `Date.now()`, `Math.random()` | ✅ All three flagged; probe deleted                |
| Does Vite 8 + Tailwind v4 + React 19 build? | `npx vite build`                                 | ✅                                                 |
| Is `baseUrl` still valid in TS 6?           | `tsc -b`                                         | ⚠️ Deprecated, removed in TS 7 → dropped           |

**Note on the purity rule.** Writing a file that _should_ fail lint, and confirming it does, is the
difference between a rule being configured and a rule being enforced.

---

## M1 · Domain core

| Check                                 | Method                                         | Outcome                                                 |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| Money arithmetic under float pressure | Table-driven tests incl. `1.005`, `19.99`      | ⚠️ Penny lost (#1)                                      |
| UK DST dates for 2026                 | Queried `Intl` **before** writing expectations | ✅ 29 Mar, 25 Oct confirmed                             |
| Ambiguous-hour handling               | Explicit test for the first occurrence         | ⚠️ Returned the second (#2)                             |
| Bank holiday weekdays                 | Computed all 8 before hard-coding              | ✅ Easter Sunday 5 Apr confirmed                        |
| Working-minute arithmetic             | The Friday 17:52 anchor                        | ✅ First time                                           |
| SLA state boundaries                  | Amber at exactly 25% remaining                 | ⚠️ A test said 38 where it is 68 — the _test_ was wrong |
| Stage transitions                     | All 144 pairs against a **rule**, not a matrix | ✅                                                      |

**Method note.** Every date and DST fact was obtained by _querying the platform_ before writing the
expectation. Hand-computed time values were the most common error in design review, and this is the
mechanical answer to that.

---

## M2 · Data and mock API

| Check                                             | Method                                        | Outcome                                      |
| ------------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| Are the two `Db` implementations interchangeable? | One contract suite over both                  | ✅ 26 tests × 2                              |
| Does aliasing differ between them?                | Mutate-the-returned-array tests               | ✅ `structuredClone` matches JSON            |
| Does storage failure take the app down?           | Hostile `Storage` throwing on read and write  | ✅ Degrades to memory, warns once            |
| Do client, handlers and store agree?              | Integration tests through the **real** client | ✅ 24 tests                                  |
| Is the seed deterministic?                        | Same seed twice, compared                     | ✅ Byte-identical                            |
| Are the anchor leads as claimed?                  | Asserted SLA outcome per anchor               | ✅ ENQ-4101 amber at 23/30                   |
| Is the phone format the reserved range?           | Regex assertion                               | ⚠️ The _assertion_ was wrong; data was right |

---

## M3 · Part A user interface

| Check                                | Method                                       | Outcome                          |
| ------------------------------------ | -------------------------------------------- | -------------------------------- |
| Does the app actually run?           | Dev server, curled, then Cypress             | ✅ After #3                      |
| Is the logger snapshot stable?       | Cypress console guard                        | ⚠️ Infinite-render hazard (#3)   |
| Does a logged activity **persist**?  | E2E: log → reload without params → re-assert | ✅                               |
| Does contact stop the SLA clock?     | E2E on a breached lead                       | ⚠️ Chip kept counting (#4)       |
| Does an internal note _not_ stop it? | E2E negative case                            | ✅                               |
| Do the guards work end to end?       | E2E: blocked → log remedy → unblocked        | ✅                               |
| Accessibility                        | `cypress-axe`, every screen, both themes     | ⚠️ 5 violations → all fixed (#7) |
| Focus management                     | Open dialog, Escape, assert focus returns    | ✅ Radix handles it              |

---

## M4 · Finance — _retired_

| Check                                 | Method                                     | Outcome                                          |
| ------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| Are the golden figures real?          | Generated by running the code; never typed | ✅ 40 deals                                      |
| Does each schedule close on its GMFV? | Balance invariant, all 40                  | ✅ To the penny                                  |
| Does an independent method agree?     | Bisection IRR + NPV, sharing no code       | ⚠️ Flagged £7.39 — **the oracle was wrong** (#8) |
| Is 0% APR exactly free?               | `totalChargeForCredit === 0`               | ✅ Exact, not approximate                        |
| Is the APR conversion right?          | Round-trip: compound the monthly rate 12×  | ✅ Returns the APR to 12 dp                      |
| Is negative equity handled?           | Reference deal with −£850                  | ✅ `TAP − cashPrice` would overstate by £850     |

---

## M5 · Scoring — _retired_

| Check                                      | Method                               | Outcome                            |
| ------------------------------------------ | ------------------------------------ | ---------------------------------- |
| Bounded and deterministic?                 | Extremes; same lead scored twice     | ✅ 0–100, identical                |
| Does pipeline progress rank monotonically? | Five stages compared pairwise        | ✅                                 |
| Does decay use **working** time?           | Friday-evening lead at Saturday open | ✅ No penalty — 23 working minutes |
| Is it explainable?                         | Every score carries ordered factors  | ✅ Rendered in the tooltip         |
| Does intent order differ from urgency?     | E2E comparing full orderings         | ✅ Genuinely different questions   |

---

## Cross-cutting

| Check                                  | Method                                    | Outcome                         |
| -------------------------------------- | ----------------------------------------- | ------------------------------- |
| Do the tests **constrain** behaviour?  | `mutation-sanity.mjs`, 4 constants        | ✅ 4/4 killed                   |
| Is the 100% domain gate real?          | Watched it fail at 99.65%, fixed the gap  | ✅ Enforced                     |
| Is the glob correct?                   | `**/src/domain/**` matches resolved paths | ✅ A bare glob enforces nothing |
| Any fixed sleeps or rival mock layers? | `check-determinism.mjs` grep              | ✅ None                         |
| Do assumption ids match the code?      | Compared both id sets                     | ✅ 11/11                        |
| Does the E2E suite pass repeatedly?    | Full suite, `retries: 0`                  | ✅ 58/58                        |

---

## Honest gaps

Things **not** verified, stated rather than implied:

- **No real backend.** Every API behaviour is the mock's behaviour. The client makes real HTTP calls
  to real URLs so the swap is small, but it has not been performed.
- **No cross-browser run.** Cypress ran in Electron. Chrome and Firefox are configured but were not
  exercised.
- **No load or performance testing.** The inbox renders ~140 leads without virtualization; that is
  comfortable, but it has not been tested at 10,000.
- **Accessibility is automated-only.** `cypress-axe` catches roughly a third of real barriers. No
  screen-reader pass was done.
- **The finance engine is not a lender's system.** It is internally consistent and independently
  verified, but `ASM-FIN-01` records that the APR chain excludes fees and so will not reproduce a
  specific lender's quote.
