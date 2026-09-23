# Prompt strategy

How the AI was actually directed. The [corrections log](corrections.md) records what it got wrong;
this records the technique that surfaced those errors rather than shipping them.

> **Historical record.** Several examples below come from the finance engine and propensity scoring,
> which were later removed when the scope was trimmed back to a lean MVP. They are kept because the
> technique is the point, and the arithmetic examples are the sharpest evidence of it.

---

## The premise

> The AI is fast, broad, and **reliably** wrong about arithmetic and about current library
> behaviour — not occasionally, but in predictable places.

Everything below follows from taking that seriously. If the failure modes are predictable, they can
be _engineered against_ rather than reviewed for.

---

## 1 · Make something external adjudicate

The weakest verification is "generate, then read it back". Reading does not catch a wrong annuity
factor, because a wrong annuity factor looks exactly like a right one.

So each area of real risk got an **independent adjudicator** — something that could disagree with
the generated code without sharing its assumptions:

| Risk                          | Adjudicator                                               | Caught                                                                         |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Finance arithmetic            | Bisection-IRR oracle sharing no code with the closed form | An oracle/engine disagreement that required reasoning to settle (correction 8) |
| Tests that do not constrain   | Mutation script flipping 4 constants                      | — (4/4 killed, which is the point)                                             |
| Colour contrast               | `cypress-axe`, reading the browser's computed colours     | A model/browser divergence at the sRGB gamut edge (correction 7)               |
| Framework contract violations | Console-error-fails-the-test, in Vitest and Cypress       | A React infinite-render hazard, on the first run (correction 3)                |
| Library API claims            | A two-line probe script against the installed package     | A false claim about an ESLint plugin's exports (correction 5)                  |

---

## 2 · Generate alternatives, then judge them adversarially

Rather than ask for "a design", three architectures were commissioned from deliberately different
starting points, then scored by three reviewers with different briefs.

**The proposers** were given the same brief and incompatible priorities:

> _"Design this with a **domain-model-first** lens. The dealership domain is the product and React is
> a thin viewport onto it…"_

> _"Design this with a **testability-and-verification-first** lens. Architect so that correctness is
> demonstrable and the verification story is the headline…"_

> _"Design this with a **product-and-demo-impact-first** lens. A reviewer gives this fifteen minutes…"_

**The judges** were given the instruction that produced all the value:

> _"**Recompute** all three worked examples. Hunt for finance formulas that are mathematically wrong,
> misuse of the pinned library versions, and flaky-test designs."_

Not _"evaluate"_. Not _"review"_. **Recompute.** An instruction to opine produces opinions; an
instruction to compute produces arithmetic that can be checked.

It found formula or arithmetic errors in **all three** proposals — including a PCP payment quoted as
£328.14 where the proposal's own stated formula gives £367.75 — and identified that one proposal's
entire E2E determinism story rested on `cy.request` reaching MSW, which cannot work.

---

## 3 · Put the failure modes in the prompt

Prompts named the specific traps, because a model that has been told what to watch for behaves
differently from one asked to be careful:

> _"NOTE: Vitest has **no** `global:` threshold key — that is Jest. Every other key is treated as a
> glob, and a bare `src/domain/**` may match zero resolved paths and silently enforce nothing."_

> _"`cy.request` is issued from Cypress's Node process and never reaches a service worker. Any reset
> design built on it silently does nothing."_

> _"Representative APR is an annual **effective** rate. `APR / 12` is wrong."_

Each of these was a real defect found during design review, promoted into the standing instructions
so it could not recur. They now live in [AGENTS.md](../../AGENTS.md), where they apply to whoever
works on this next.

---

## 4 · Constrain the output shape

Free-form prose hides vagueness. Structured output makes a gap visible:

> _"For each pure logic module give: the path, the responsibility, **actual TypeScript signatures**,
> the edge cases, and concrete `it(...)` test names."_

A proposal that cannot name its test cases does not have them. Requiring the names surfaces that
before any code is written.

---

## 5 · Refuse hand-computed constants

The standing rule, from the first finance commit:

> _"Every golden figure is generated by **running the implementation**. Never hand-compute a number
> into a test."_

This came directly from watching three design proposals each quote finance figures that did not
follow from their own formulas. While the finance engine existed the rule was mechanised — a golden
fixture regenerated from the implementation and an independent IRR oracle that re-derived it. The
rule outlived the engine: every expected figure in the surviving suites is still generated by
running the code.

---

## 6 · When a test fails, find out which side is wrong

Several failures here were the **test**, not the code:

- A fixture pinned `recordedAt` while tests overrode `occurredAt`, manufacturing phantom
  "recorded before it occurred" anomalies.
- An assertion claimed `09:00Z` was 09:00 in London. It is 10:00 BST — 68 consumed working minutes,
  not 38.
- An E2E spec expected `"Responded"` for a lead answered late. The correct label is `"Missed"`.
- The IRR oracle discounted a fee that is not amortised (correction 8).

Reflexively "fixing" the implementation in any of those cases would have introduced a bug **and**
hidden the real one. Each failure was diagnosed to a root cause before anything changed.

---

## What this produced

|                                         |                                              |
| --------------------------------------- | -------------------------------------------- |
| Defects caught before review            | **8**, logged with the test that caught each |
| Caught by _running_ rather than reading | **6 of 8**                                   |
| Cases where the _verifier_ was wrong    | **1** — the correct failure mode             |
| Mutations killed                        | **6 / 6**                                    |
| Domain coverage                         | **100%**, enforced                           |

The generalisable part is not any individual prompt. It is that the AI was treated as a fast,
broad, unreliable collaborator whose output is **worth verifying mechanically** — and that building
the verifier is usually cheaper than reviewing the output carefully enough to substitute for one.
