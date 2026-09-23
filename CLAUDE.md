# CLAUDE.md

**Start with [AGENTS.md](AGENTS.md).** It is the canonical working agreement for this repository and
applies to every agent, including Claude Code. This file adds only what is specific to running
Claude Code here.

---

## Orientation, in one minute

A lead management tool for a UK car dealership. Frontend only; the backend is mocked with MSW at the
network boundary. The organising decision is that **every dealership rule lives in `src/domain/` as
pure TypeScript**, and both the UI and the mock API call those same functions — so the rules cannot
drift.

Read in this order: [README.md](README.md) → [DESIGN.md](DESIGN.md) → [AGENTS.md](AGENTS.md).

---

## Commands you will want

```bash
npm run dev                 # http://localhost:5173
npm test -- <pattern>       # e.g. npm test -- sla
npm run test:coverage       # 100% gate on src/domain/**
npm run verify              # the full gate, in order
npm run e2e                 # 58 Cypress specs
npm run mutation-sanity     # break 6 constants, assert the suite notices
```

### Cypress will not start from this terminal without a fix

VS Code's integrated terminal sets `ELECTRON_RUN_AS_NODE=1`. Electron then runs as plain Node and
rejects its own flags, failing with `bad option: --no-sandbox`. Unset it for Cypress:

```bash
env -u ELECTRON_RUN_AS_NODE npm run e2e
```

Cypress also needs to spawn a browser process, so it may need to run outside a restrictive sandbox.

---

## How to work in this repository

**Verify by executing, not by reading.** This codebase was built on the assumption that a model is
confidently wrong about arithmetic and about current library behaviour. **Seventeen real defects** are
logged in [docs/ai-collaboration/corrections.md](docs/ai-collaboration/corrections.md), fourteen of
them caught by running something — including two cases where confidently-stated research about
library APIs turned out to be false, and one where the verification oracle was wrong and the
implementation was right.

Two were caught by reading the source, and it is worth knowing how: not by summarising a file, but by
checking a stated property against **every** member of the set it quantifies over. "Every response
echoes the correlation id" was false because of one helper. Ask "is this true of all eleven?", not
"what does this do?".

Practical consequences:

- **Run the thing.** `npm test` after a domain change, `npm run e2e` after a UI change. Do not infer
  that a change worked.
- **Never type a constant into a test.** Generate it — see AGENTS.md §2.
- **Check library behaviour against the installed version**, not against recollection.
  `npm view <pkg> engines`, `npm view <pkg> peerDependencies`, or a two-line probe script.
- **Let an external adjudicator settle disputes.** `cypress-axe` for contrast, `mutation-sanity.mjs`
  for whether the tests constrain anything.

**When a test fails, work out which side is wrong before changing anything.** Several failures here
were the _test_ being wrong, not the code — a fixture pinning `recordedAt` while overriding
`occurredAt`, an assertion that `09:00Z` was 09:00 London when it is 10:00 BST. Fixing the
implementation in those cases would have introduced a bug and hidden the real one.

---

## Things that will trip you up

| Symptom                                                       | Cause                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Fast refresh only works when a file only exports components` | A `.tsx` exporting a non-component — move it to a `.ts` file                                                                               |
| `React Hook "useX" is called in function...`                  | A plain helper named `use*`. Rename it                                                                                                     |
| Coverage fails at 99.x% on `src/domain/**`                    | The gate is 100%. Add the test, or `/* v8 ignore next -- reason */`                                                                        |
| `Cannot find name 'process'` in a test                        | It belongs to `tsconfig.test.json` — check the include patterns                                                                            |
| A spec passes alone but fails in the suite                    | State leaked, or an assertion landed mid-animation                                                                                         |
| E2E specs fail on `--waiting for new page to load--`          | A file changed on disk mid-run and Vite reloaded the page. Do not edit or format files while `npm run e2e` is running                      |
| `dist/` behaves oddly after `npm run e2e:ci`                  | That script builds with `VITE_E2E=1` — a test bundle with a frozen clock. Run `npm run build` (or `npm run verify`) to get a shippable one |
| A colour looks fine but axe fails it                          | Trust axe. See AGENTS.md §4                                                                                                                |
| A before/after comparison compares a value with itself        | `invoke('text').as()` re-queries the DOM — capture in a closure                                                                            |

---

## Scope discipline

The brief asks for **one scenario done well**, and every capability Part B pointed at is now built:
the inbox, the lead record with its activity timeline, the working-hours SLA engine, the pipeline
board and the observability layer. The Deal Builder, finance engine, propensity scoring and manager
dashboard were built and then **deliberately removed** to keep the MVP lean — see README.

**Every screen sits on a domain module that was written and verified first.** If you are extending
one, the rule is the same: the logic goes in `src/domain/` with unit tests before the component
renders it, and the mock API calls the same function so the rules live in exactly one place. Do not
reimplement business logic inside a component — `src/domain/pipeline.ts` has all 144 stage
transitions tested, and `src/domain/businessHours.ts` covers both DST discontinuities. A second copy
in a component is a second place to be wrong.

Two habits worth keeping, both of which caught real bugs here:

- **Cross-check surfaces against each other.** When two screens derive the same number, assert they
  agree — a four-line spec of exactly that kind once caught two surfaces disagreeing.
- **Run the whole E2E suite, not just the spec you changed.** A timing flake passed in isolation and
  failed in the suite.
