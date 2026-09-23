# Corrections log

Every entry is a **real defect in AI-generated output**, what caught it, and what replaced it. Dated
and numbered so they can be referenced from a commit or a review.

> Entries 7, 8, 9 and 10 concern the finance engine, the propensity rubric and the manager
> dashboard, which were later removed when the scope was trimmed back to a lean MVP. They are kept
> because a corrections log that quietly drops its own history is worth nothing.

The pattern across most of them: reading the code did not catch these. Running something did. Three
exceptions prove the rule — **#6** came from reading a tool's output rather than skimming it, and
**#15** and **#16** from reading the source, but only under a brief to _refute_ a stated property
rather than to describe what the code does.

---

## 1 · Float multiplication lost a penny

**Defect.** `poundsToPence(1.005)` returned `100`, not `101`. `1.005 * 100` is
`100.49999999999999` in binary floating point, so half-up rounding rounded _down_.

**Caught by.** A table-driven unit test in `money.test.ts`, on the first run.

**Why it matters.** The value a human typed was silently reduced by a penny before it entered the
system. In a chain of finance operations that penny compounds.

**Fix.** Shift the **decimal string** instead of multiplying: `Number('1.005e+2')` parses the decimal
literal directly, so the value the user wrote survives. Handles exponential-form inputs by folding
into the existing exponent rather than concatenating two.

**Tempting non-fix rejected.** Changing the test to expect `100`. That would have documented the bug
as intended behaviour.

---

## 2 · The DST inverse returned the wrong occurrence

**Defect.** `fromLocalParts` returned the **second** occurrence of an ambiguous hour. On 25 October
2026, 01:30 London happens twice; the implementation returned the later (GMT) instant.

**Caught by.** A DST unit test asserting the first occurrence.

**Root cause.** A two-pass Newton-style correction _converges on the post-transition offset_, so the
earlier BST candidate is never generated at all. The algorithm was not merely imprecise — it was
structurally incapable of producing the right answer.

**Fix.** Sample the UTC offset at `target − 24h`, `target`, and `target + 24h` to bracket any
transition, generate a candidate from each, and take the **earliest that round-trips**. Non-existent
times (spring forward) clamp forward past the gap.

---

## 3 · A React infinite-render hazard in the logger

**Defect.** `logger.records()` returned `[...buffer]` — a fresh array on every call. Consumed through
`useSyncExternalStore`, whose contract requires a referentially stable snapshot, React warned _"The
result of getSnapshot should be cached to avoid an infinite loop"_.

**Caught by.** Cypress, on the very first E2E run, via the console-error-fails-the-test guard. It
failed in `beforeEach`, before a single assertion ran.

**Fix.** Cache the snapshot and rebuild it only when the buffer changes; freeze it so a caller
cannot corrupt the buffer. The aliasing test was strengthened rather than deleted, and a second test
now pins referential stability explicitly.

**Note.** This is the guard paying for itself. The app _looked_ fine.

---

## 4 · The SLA chip kept counting after the clock had stopped

**Defect.** A lead answered **late** carries state `breached` _and_ a `respondedAt`. The chip treated
only `met` as settled, so it kept showing a live negative countdown on a lead that had already been
dealt with — implying outstanding work that did not exist.

**Caught by.** A Cypress spec asserting the clock stops when a customer contact is logged.

**Fix.** Settled is now `respondedAt !== undefined || state === 'not-applicable'`. A late answer
reads **"Missed"**; an in-time one reads **"Responded"**. A `data-sla-settled` attribute makes the
distinction assertable without depending on the copy.

**Also.** The E2E assertion was itself wrong — it expected "Responded" for a late answer. Both sides
were corrected, which is why the diagnosis took reasoning rather than a reflex.

---

## 5 · Confidently-stated library research was false — ESLint plugin config shape

**Defect.** Research asserted that `eslint-plugin-react-hooks@7.1.1` exposes
`configs['recommended-latest']` as a flat config. It does not: that export still ships the **legacy
eslintrc shape**, with `plugins` as an array of strings, and ESLint 10 throws on it.

**Caught by.** Running `eslint`, which refused to start.

**Fix.** Use `configs.flat.recommended`. Confirmed by _inspecting the installed package's exports_
rather than by asking again.

**Lesson.** Version-specific API claims must be checked against the installed artifact. A two-line
probe script settles in seconds what discussion cannot settle at all.

---

## 6 · `jsdom@30` silently excluded the target Node version

**Defect.** The pinned stack produced `EBADENGINE` warnings on a clean install: `jsdom@30` declares
`^22.22.2 || ^24.15.0 || >=26`, excluding the Node 25 the project targets.

**Caught by.** Reading `npm install` output instead of skimming it. jsdom 30 _worked_ on Node 25
despite the warning, so nothing would have failed — it would just have been noise in the reviewer's
terminal, and a latent break.

**Fix.** Pin `jsdom@^29`, whose range (`^20.19 || ^22.13 || >=24`) covers Node 25 cleanly. Clean
install is now warning-free.

---

## 7 · The colour model disagreed with the browser near the gamut edge

**Defect.** Theme colours were chosen by converting OKLCH to sRGB and computing WCAG contrast. For
`oklch(0.30 0.055 204)` the model predicted `#00353a`; Chromium rendered `#205255` — far lighter,
and enough to fail contrast for text sitting on it.

**Caught by.** `cypress-axe`, which reports the browser's _computed_ colours.

**Root cause.** Near the sRGB gamut boundary the naive conversion **clips** negative channels while
the browser **gamut-maps** by reducing chroma, producing a lighter result. The model matched the
browser exactly for in-gamut colours (`#8e99aa` both ways) and diverged only at the edge — the worst
kind of disagreement, because it looks trustworthy.

**Fix.** Keep in-gamut values, and treat **axe as the arbiter** rather than any prediction. Light-mode
tone colours were recomputed to clear 4.5:1 against both their `-subtle` backgrounds and the canvas;
the dark-mode active pill was darkened until axe agreed.

---

## 8 · The verification oracle was wrong, and the implementation was right

**Defect (apparent).** `verify-finance.mjs` reported a £7.39 net-present-value discrepancy on
`pcp-with-fees`, a deal carrying a £10 option-to-purchase fee.

**Resolution.** `£10 / 1.006356^48 ≈ £7.39` — exactly the discrepancy. The oracle was discounting
the option-to-purchase fee as though it were part of the financed balance. It is not: the fee falls
due at the end of the agreement but is **not amortised by the monthly payments**. The _engine_ was
correct; the _oracle_ was wrong.

**Fix.** The oracle now discounts the **GMFV** for the amortisation check and treats the fee
separately, asserting only that `finalPayment ≥ gmfv`.

**Why this entry is here.** It is the correct failure mode for a verification strategy: an
independent check disagreed, the disagreement forced the question, and reasoning — not reflex —
settled which side was right. Had the "fix" been applied to the engine, a correct implementation
would have been broken to satisfy a faulty test.

---

## 9 · The seed contradicted itself, and two screens disagreed

**Defect.** The dashboard reported **8** never-worked enquiries; the inbox reported **5** — from the
same dataset, at the same frozen clock.

**Caught by.** A Cypress spec written specifically to cross-check the two surfaces, then narrowed
with a throwaway Vitest probe that printed both definitions side by side.

**Root cause.** The seed set `firstRespondedAt` from a draft flag, while the dashboard derived
"never worked" from the **activity log**. A lead seeded as unworked but placed at, say, _Appointment
booked_ still received a `showroom-appointment-booked` activity — which is contact with the
customer. So the log said worked and the field said not.

**Fix.** The seed now derives `firstRespondedAt` from `firstCustomerContact(...)` over the
activities it just wrote, making the field a faithful denormalisation of the log — exactly what the
mock API maintains at runtime. One source of truth, so the two screens cannot disagree.

**Why it matters beyond the number.** Keyloop's published figure is that 20–30% of enquiries are
lost purely by never being worked. A dashboard that overstates that by 60% is worse than one that
omits it.

---

## 10 · Two numbers rendered into one

**Defect.** A chart's table view showed a count and its percentage share in the same cell, separated
only by a CSS margin. `textContent` therefore read `"1225.0%"` for a count of 12 and a share of
25.0%. A spec summing the shares got **6440** instead of 100.

**Caught by.** The lost-reason spec asserting that shares sum to exactly 100.0.

**Fix.** The share moved into its own `<td>`. The test was not the problem — a screen reader would
have announced "1225.0 percent" just as the parser did.

**Lesson.** Visual separation is not textual separation. Anything that must be read as two values
needs two elements.

---

## 11 · An accessibility scan that landed mid-animation

**Defect.** The dashboard's accessibility spec passed on its own and failed in the full suite, with
contrast reported against background colours that appear nowhere in the theme — `#553433`,
`#274243`.

**Caught by.** Running the whole suite rather than the spec in isolation.

**Root cause.** Those were **intermediate values of a CSS colour transition**. After the theme
toggle, axe ran while `transition-colors` was still interpolating, and measured contrast against a
blend the user never actually sees. Whether it failed depended on machine speed.

**Fix.** `src/bootstrap.ts` sets `data-e2e` when `VITE_E2E` is on, and the stylesheet zeroes every
transition and animation under that attribute. The class of flake is gone rather than this instance
of it.

**Note.** This is the determinism contract catching something the contract had not anticipated —
the existing rules covered _waiting for data_, not _waiting for paint_.

---

## 12 · A Cypress alias that re-queried itself

**Defect.** Before/after comparisons in the deal-builder specs compared a value with itself —
`expected 613.93 to be below 613.93`.

**Caught by.** The assertion failing, but only because the two values happened to be equal; had the
DOM re-read produced a different number the test would have passed for the wrong reason.

**Root cause.** `cy.byTestId(...).invoke('text').as('before')` does not freeze a string. The alias
re-resolves against the live DOM when read, so "before" and "after" were both "after".

**Fix.** Capture into a closure variable inside `.then()`. The specs now read a little longer and
mean what they say.

---

## 13 · Node's `localStorage` shadowed jsdom's

**Defect.** Every component test that touched storage silently took its error path. The app's theme
persistence appeared to work in the browser and did nothing under test — and the tests still passed,
proving nothing.

**Caught by.** `localStorage.clear is not a function` in a test's own cleanup, then a probe showing
`window.localStorage === globalThis.localStorage` with neither having `setItem`, while
`sessionStorage` was jsdom's real implementation.

**Root cause.** Node 22+ ships an experimental `localStorage` global, and on Node 25 it **shadows**
the one jsdom installs. (The `--localstorage-file` warning in the test output was the clue, ignored
at first.)

**Fix.** `src/test/setup.ts` installs a real in-memory `Storage` when the global lacks `setItem`,
and polyfills the `matchMedia` jsdom does not implement. Component tests now exercise the same APIs
the browser provides.

**Lesson.** A passing test that silently exercises the error path is worse than a failing one.

---

## 14 · The console guard corrupted the thing it was watching

**Defect (apparent).** A spec asserting the deliberate-failure path failed with _"Expected to find
element `[data-testid="activity-error"]`"_. The mock API was returning 503 correctly — verified by
issuing the request from inside the page and reading `status=503` three times in a row — yet the
error UI never rendered.

**Root cause.** The Cypress console guard **threw from inside `console.error`**. The API client
logs `api.response_error` while handling a failed response, so the throw landed in the
application's own promise chain. TanStack Query stored the guard's generic `Error` instead of the
client's typed `ApiError`, `instanceof ApiError` went false, and the component's error branch never
ran. The guard was not observing the failure — it was _replacing_ it.

Worse, the throw was swallowed by the query's error handling, so the guard also failed to report
anything. It had become a silent corrupter.

**Fix.** The guard now **records** console calls and asserts in `afterEach`, exactly as the Vitest
guard always did, with a matching `cy.allowConsoleError()` opt-out for specs that deliberately
drive an error path.

**Verified, not assumed.** A throwaway spec that writes an unexpected `console.error` was run to
confirm the suite still goes red — a weakened guard would have been a worse outcome than the bug.

**Lesson.** Instrumentation must not participate in the control flow it observes. A guard that
throws inside a callback the application already calls during error handling changes the
application's behaviour, and the change is invisible precisely when it matters most.

---

## 15 · The mock API re-declared a rule the domain already owned

**Defect.** `POST /leads/:leadId/activities` decided whether an activity stops the SLA clock by
testing the activity type against an **eleven-element array written inline in the handler** — a
verbatim copy of `CUSTOMER_CONTACT_TYPES` in `src/domain/activities.ts`. The handler never imported
it. A second write path, `POST /leads/:leadId/quotes`, stopped the clock with a third implementation
that omitted the `occurredAt >= receivedAt` test entirely.

**Caught by.** An adversarial extraction pass over the API contract, run while writing §2.5 of the
system design document. The agent's brief was to refute claims rather than summarise them, and it
flagged that the file's own header comment — _"the rules live in exactly one place"_ — was not true
of this endpoint.

**Why it matters.** This is precisely the failure the whole architecture exists to prevent. The two
lists were still identical, so nothing was visibly broken; but adding a twelfth contact type to the
domain would have changed the timeline and the SLA chip while leaving the API's clock-stop decision
silently on the old list. A duplicated rule that currently agrees is a bug with a delayed fuse.

**Fix.** One `applyClockStop(lead, activity)` helper in the handlers, implemented in terms of the
domain's `isCustomerContact()`. Both write paths call it, so there is exactly one definition of
"this counts as answering the customer" and one definition of the back-dating rule.

**Verified.** 948 unit tests and 84 E2E specs unchanged and green — the refactor is
behaviour-preserving, which is the point: it removed a latent divergence, not a live one.

---

## 16 · The one response that most needed a correlation id did not carry one

**Defect.** Every handler echoed the caller's `x-correlation-id` through a `withCorrelation()`
helper — except the injected-fault response. `simulateConditions()` built its 503 with a bare
`HttpResponse.json(..., { status: 503 })` and no headers, so the single response class a reviewer is
most likely to trace was the one that could not be traced.

**Caught by.** The same adversarial pass, checking the claim "every response echoes the caller's
`x-correlation-id`" against all eleven route handlers _plus_ the shared middleware — the helper the
claim's author had not thought to include.

**Why it matters.** The observability story is that you can follow one click from the button to the
response it caused. That story is worth least on the happy path and most on a failure, and the
failure was the gap.

**Fix.** `simulateConditions()` now takes the `Request` and returns through the same `problem()`
helper as every other error, so the fault injector is no longer a special case. Eleven call sites
updated.

**Lesson.** "Every X does Y" is a claim about the _set_, and a set is easy to enumerate incompletely
when one member lives in a helper rather than in the list you are reading.

---

## 17 · The CI gate tested a build with its own test instrumentation compiled out

**Defect.** `npm run e2e:ci` ran Cypress against a `vite preview` build, and the CI job built that
bundle with a plain `npm run build`. But `isE2E()` is `import.meta.env.VITE_E2E === '1'`, which Vite
**inlines at build time**. Setting `VITE_E2E=1` on the preview _server_ changed nothing: the bundle
had already been compiled with the flag undefined.

So the one job whose purpose is to test the production artifact was testing a build in which every
test-only surface was unreachable — `isE2E` folds to `()=>!1` in the minified output, so the
branch survives as dead code but can never run. That includes the `data-e2e` attribute that zeroes
CSS transitions.

**Caught by.** Making dark the default theme. The a11y specs toggle the theme and scan; flipping the
default reversed the transition from light→dark to dark→light, and the new intermediate colours
failed axe: `#c62428` on `#f4d0cd` at 4.0:1, `#656c76` on `#bbe5e1` at 3.89:1. Those are **blends**,
not designed colours — the scan was sampling mid-animation.

`npm run e2e` passed throughout, because it runs against `vite dev`, where `import.meta.env` is
resolved per request from the server's environment. Only the production path was broken.

**Confirmed by experiment, not by reading.** Rebuilding with `VITE_E2E=1 npm run build` and re-running
the identical suite took it from 83/85 to **85/85**, which isolates the cause to the build flag
rather than to the theme change or the palette.

**Fix.** `e2e:ci` now builds the artifact it tests — `VITE_E2E=1 npm run build && VITE_E2E=1
start-server-and-test …` — so the script cannot be pointed at a stale or wrongly-configured bundle.
The separate `Build` step was removed from the CI job, because two builds with different flags is
exactly how this happened.

**Why this one is worth reading twice.** It was latent, not dormant-but-visible: the gate was green
in the mode nobody ships and had probably never been run in the mode that matters. A test that
exercises a _different artifact_ from the one you release is not a weak test, it is a misleading
one — and the theme change only revealed it by accident.

---

## Pattern

| Category                            | Entries    | Implication                                                                                                                    |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Arithmetic / numerical              | 1, 2, 8    | Never trust generated arithmetic. Generate constants by execution                                                              |
| Framework contract violations       | 3, 4, 12   | Guards that fail loudly (console-as-error) earn their keep immediately                                                         |
| False confidence about library APIs | 5, 6, 13   | Check the installed artifact, not recollection                                                                                 |
| Model disagreeing with reality      | 7, 11      | Prefer an arbiter that runs in the real environment                                                                            |
| Two sources of truth drifting apart | 9, 10, 15  | Derive, never duplicate — and cross-check the surfaces                                                                         |
| Instrumentation with a gap in it    | 14, 16, 17 | A guard must record and assert later, "every response" must include the middleware, and a gate must test the artifact you ship |

**Fourteen of seventeen were caught by running something rather than by reading the code**, and five by
tooling built specifically to disagree with it: the IRR oracle, the mutation script, `cypress-axe`,
the console-as-failure guard, and a spec whose only job was to check two screens against each other.

Four entries are worth singling out, and they are all cases where **the test apparatus was wrong,
not the code**. In **#8** the verifier disagreed with a correct implementation — the right failure
mode, and the reason each disagreement was reasoned through rather than reflexively "fixed". In
**#11** the whole suite caught what the spec alone could not. In **#13** the tests were _passing_
while proving nothing. And in **#14** a safety guard was silently corrupting the behaviour it
existed to police.

That is the argument for treating the test harness as production code: five of seventeen defects
lived there, and each one made the suite _less_ truthful while appearing green — #17 most of all,
since it was green against a bundle nobody ships.

**#15 and #16 are the only two caught by reading the source**, and they are instructive about
_how_. Neither came from a summarising pass — summaries reproduce a file's own claims about itself,
and both defects were contradictions between a file's header comment and its body. They came from a
pass whose explicit brief was to **refute**, checking each stated property against every member of
the set it quantified over. The lesson generalises past AI: the reviewer who asks "is this true of
all eleven?" finds what the reviewer who asks "what does this do?" cannot.
