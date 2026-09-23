# Documented assumptions

The brief notes that requirements are deliberately ambiguous and asks that reasonable assumptions be
made and documented. This is that register.

Each id is **cited in code at the point of use**, so an assumption is addressable rather than buried
in prose:

```bash
grep -rn "ASM-" src/
```

---

## Response targets (SLA)

### `ASM-SLA-01` — Walk-ins carry no response target

Someone standing in the showroom has by definition already been met. Counting walk-ins in the SLA
denominator would inflate compliance and hide the enquiries that really are going cold.

They are excluded from the denominator entirely rather than auto-passed, which would be the same
distortion in a different direction.

Response targets by channel, and why they differ:

| Source                         | Target                  | Reasoning                                       |
| ------------------------------ | ----------------------- | ----------------------------------------------- |
| Marketplace                    | 15 min                  | Sent to several dealers at once; decays fastest |
| OEM portal                     | 20 min                  | High intent, manufacturer-visible               |
| Website · WhatsApp · Telephone | 30 min                  | The general standard                            |
| Service referral               | 60 min                  | Already a customer; less time-critical          |
| Finance renewal                | 480 min (1 working day) | A scheduled conversation, not a race            |
| Walk-in                        | —                       | Not applicable                                  |

_Where:_ `src/domain/sla.ts` · `DEFAULT_SLA_POLICY`

### `ASM-SLA-02` — Business hours include Sunday trading; ambiguous DST hours resolve to the first occurrence

**Sunday trading.** Most UK franchised showrooms open on Sundays (modelled here as 10:00–16:00).
Treating Sunday as closed makes every Friday-evening enquiry look artificially healthy.

**Ambiguous hour.** When clocks go back (25 Oct 2026), 01:30 local happens twice. The **first**
occurrence — the BST one, the earlier instant — is returned. It is the conservative reading: the SLA
clock starts earlier, so the target is tighter rather than looser.

**Non-existent hour.** When clocks go forward (29 Mar 2026), 01:30 local never happens. The time
clamps **forward** to the first instant past the gap, so an opening time falling in the gap still
opens rather than silently vanishing.

**Working day length.** Decay in propensity scoring treats a working day as nine hours.

_Where:_ `src/domain/businessHours.ts` · `src/domain/instant.ts` · `fromLocalParts()`

---

## Pipeline

### `ASM-PIPE-01` — A lead may be rewound one stage at a time

`BACKWARD_LIMIT = 1` covers the real case — correcting a mis-click — without letting a deal silently
rewind past evidence that has already been captured.

### `ASM-PIPE-02` — Guards apply on entry, not on rewind

The licence check is required to move **into** Test drive, but a lead being moved _back_ through
that stage is not re-checked. Rewinding is an administrative correction, not a fresh test drive.

### `ASM-PIPE-04` — Preparation (PDI) sits between the order and the handover

A vehicle is inspected, valeted and plated before the customer sees it, so the pipeline models
**Preparation (PDI)** as its own stage rather than letting a car go straight from _Order placed_ to
_Handover_. It is also where delivery dates actually slip, which is worth making visible on the
board.

The handover guard is therefore `PREPARATION_REQUIRED_BEFORE_HANDOVER`: a lead cannot enter
_Handover_ until it has reached _Preparation_. That is stricter than requiring only the order, and
matches UK practice.

Twelve stages means the exhaustive transition table covers **144** ordered pairs.

_Where:_ `src/domain/types.ts` · `src/domain/pipeline.ts`

### `ASM-PIPE-03` — A licence check is valid for twelve months

Matches common UK dealer practice for DVLA licence checks. Exported as
`LICENCE_CHECK_VALID_DAYS = 365` and boundary-tested at 364 and 400 days.

_Where:_ `src/domain/pipeline.ts`

---

## Data and persistence

### `ASM-DATA-01` — "Persisted" means localStorage behind a swappable `Db`

Part A requires a logged activity to be persisted. In a frontend-only build the honest reading is
"survives a page reload", which `localStorageDb` provides — and the E2E suite proves it by reloading
the page and re-asserting.

The seam is named rather than implicit: `Db` has two implementations, held to one shared contract
suite, so replacing it with a real backend touches one file.

### `ASM-DATA-02` — The demo clock is frozen at Saturday 19 September 2026, 09:15 BST

Saturday is the busiest day on a UK sales floor, the showroom is open (09:00–17:00), and 09:15 is
fifteen minutes after opening — which is what makes the Friday 17:52 enquiry visibly _resume_ its
clock rather than having silently breached overnight.

A frozen clock outside opening hours would compress every relative age to zero and quietly flatten
the entire SLA demonstration.

### `ASM-DATA-03` — The dataset mixes fixed anchors with seeded filler

Eight **anchor** leads carry absolute, hand-chosen timestamps; the E2E specs and the demo narrative
reference them, so they must not move. The remaining volume is generated from a seeded PRNG.

Relative offsets were avoided deliberately: a business-hours SLA clock compresses "45 minutes ago"
to zero whenever the showroom was shut, so offset-seeded fixtures silently stop demonstrating what
they claim to.

### `ASM-DATA-04` — Two activity-chain anomalies are seeded on purpose

`ENQ-4106` carries one inverted-timestamp chain and one orphaned `previousActivityId`, so the
timeline's anomaly surfacing is demonstrable in the running app rather than only in a unit test.
Every other lead's timeline is clean, and a test asserts that.

_Where:_ `src/mocks/seed/generate.ts`

---

## Identity and contact data

### `ASM-ID-01` — All generated contact data is non-routable

Phone numbers use Ofcom's reserved drama range (`07700 900000–900999`) and emails use
`example.co.uk`. Nothing in the seeded dataset can reach a real person.
