# <epic name> (<EPIC-KEY>) — single source of truth

Git-excluded. Nothing in here is cited in a commit, PR body, tracker comment
or tracked doc; say the substance in the repo's own terms instead.

## Read order for a new session

1. This file: current state, story order, execution loop, open items.
2. `<story-slug>/` folders: one per story, story file plus one file per task.
3. `EPIC/decisions.md` and `DECISION-BUNDLE.md`: rulings and standing defaults.
4. `CHANGELOG.md`: one entry per merged PR.

## State as of YYYY-MM-DD

| Key | Story | Status |
| --- | ----- | ------ |

## Story order

1. KEY-nnnn — <why first>.

Parallel lanes: <A> · <B> · <C>.

## Execution loop per story

1. `/story-plan <key>` in its own session: plan, audit, fold in, re-audit,
   bundle handed over.
2. `/story-run <key>` in a fresh session: bundle answered, layer by layer
   (implement, size, `pnpm gates`, commit, review, draft PR, PR body, quiz).
3. Stack reviewed, core quiz answered, `ready` marks the stack ready.
4. Human merges; `gh stack sync`; after-merge step below.

## After merge

<the step this epic owes per merged story: a state row here, a parity row
flipped, a runbook log line>

## Open items
