# Decision bundle + record formats

## 1. The bundle (asked once, before the story starts)

File: `.scratch-research/story-run/<story>-decisions.md`. Show it in full in the
reply. Order questions by blast radius, highest first. Keep to what actually
changes the work; three good questions beat ten.

```markdown
# <USn> — decisions before implementation

Answer inline under each **Answer:**. "default" (or leaving it blank) accepts
the recommendation. Reply "defaults" to accept all of them.

## Q1 — <short title>

Affects: T03 · Blast radius: high (alert path) · Reversal cost: one PR

**What the task needs.** Two to four plain-English sentences: what the task has
to do, what the spec says, and exactly where it stops saying it.

**Options.**

- (a) <option> — <one-line consequence>
- (b) <option> — <one-line consequence>

**Recommended default: (a).** One or two sentences on why, citing any standing
decision (D-EPIC-0xx) or code it follows.

**If (a) turns out wrong.** What has to change and roughly how big that is.

**Answer:**

## Q2 — …
```

Not a question: anything with a conventional default (naming, file placement,
test shape), anything a standing epic decision already settles, anything the
Gherkin answers. Apply those; where one shaped the diff, the PR body may carry
it as a plain-English design note (section 3), never as a decision or an ask.

## 1b. The layer plan (closes the bundle, confirmed with it)

The bundle ends with the layers the run will open, in order, one row each.
It is shown, not asked: the user corrects it in the same reply if they want
a different split or order.

```markdown
## Layer plan

| #   | Task | Branch                   | Scope (one line)                  | Est.     |
| --- | ---- | ------------------------ | --------------------------------- | -------- |
| 1   | T03  | feat/own-site-alert-gate | gate + its unit tests             | M (~250) |
| 2   | T01  | feat/preview-count-copy  | copy change + snapshot            | S (~40)  |
| 3   | T02  | feat/alert-record-store  | store function + contract + tests | M (~380) |
| 4   | T02  | feat/alert-record-wiring | call site + e2e spec              | S (~120) |

Budget: source ≤ 400 changed lines per layer (S < 150, M < 400). T02 is
split at the store/wiring seam so each half builds and passes alone.
```

Sizes are estimated in source lines (tests excluded) against the Phase 2
budget. **No row is L.** A task that would be L is split in the plan at a
seam where each half builds and is green on its own; the usual seams are
schema or contract first and consumer second, pure function first and call
site second, data first and UI second. A task whose smallest honest layer is
still over budget (a mechanical move, a generated file, a lock-step rename)
says so in the row, and that sentence becomes `size.oversize` in run-state
and a plain-English line in the PR summary.

A split that changes task order is a question (it affects what ships first).
A split that keeps the order is not.

## 2. The `decisions.md` record (story folder, local)

Same shape as the existing D-records so the log stays greppable and the
epic's decision-log snapshot can pick it up unchanged:

```markdown
### D-<USn>-NNN — <one-line decision in the imperative or declarative>

- **Date / decided by:** YYYY-MM-DD / the owner (bundle Q3) ← answered
- **Date / decided by:** YYYY-MM-DD / default taken during T02 ← not answered
- **Status:** DECIDED-OWNER | REQUIRES-DECISION · PR #N
- **Area:** <file or surface the decision governs>
- **Options considered:** (a) …; (b) …
- **Decision + rationale:** (a). <why, in plain English>
- **Consequences / propagation:** <what else moves; reversal cost>
- **Evidence:** <bundle file / spec line / code read>
```

`REQUIRES-DECISION` is the only status the loop assigns on its own. It means:
"a reasonable default was taken so the task could ship; a human still needs to
confirm or overturn it". It is resolved by editing the status to
`DECIDED-OWNER` / `RATIFIED-PM` (or `SUPERSEDED` with a pointer) — never by
deleting the record.

## 3. Where open decisions surface — the final message, never the PR

**Nothing about an open decision goes in a PR body** (CLAUDE.local.md). No
`## Decisions required` section, no decision IDs, no "default taken, the owner's
word owed". A reviewer has no access to this vault, and a PR body asking them
to rule on `D-US25-010` is noise in the one document that should say what the
change does and how to check it. Where a decision genuinely shaped the diff,
describe the choice in plain English as a design note — no ID, no ask.

Open decisions are surfaced **once**, in the run's Phase 3 final message,
asked as questions the user can answer in one reply. Numbered, one block each:

```markdown
**1. D-US24-005 — Should a gated own-site detection still get a durable alert record?**

Plain English: when Monitor spots a change on our own site it stops before
alerting. Today it also writes nothing down, so the run history has no trace
that it looked and declined.

- (a) No record — what shipped. Nothing to reverse, but gated detections stay
  invisible in the run history.
- (b) Write the record with outcome `gated` — one function, one test, one
  small follow-up PR.

**Recommended: (a)** — the history gap has not bitten anyone yet, and (b) is
cheap to add later if it does.
```

Answers come back as `1a`, `2b`, or prose. Record each in the story's
`decisions.md`: status `DECIDED-OWNER`, the date, and the user's own words in
"decided by". Decisions already answered in the opening bundle are never
re-asked.

## 4. Hard stops (the only reasons the loop pauses inside a task)

| Class                      | Example                                                                   | Why no default is acceptable         |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------------ |
| Destructive / irreversible | schema migration that drops data, deleting stored runs, rewriting history | cannot be undone by a follow-up PR   |
| Security / tenant boundary | anything touching auth, tenant maps, secrets, cross-tenant reads          | wrong default is a breach, not a bug |
| Spend                      | new vendor, plan tier, paid API, model upgrade with a price change        | money is the user's call             |
| Verbatim owed copy         | customer-facing text the story marks as "PM provides"                     | a placeholder ships to customers     |
| No reasonable default      | two options with no principled tiebreak and high reversal cost            | guessing costs more than asking      |

Everything else takes a default and a `REQUIRES-DECISION` record.
