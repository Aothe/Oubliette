---
name: story-plan
description: Plan one story before /story-run. Read the story and its tasks, write the story folder's implementation-plan.md (current code, stack order, one section per layer, rollback, decisions, verification), run /powerhouse-audit on it, fold the findings in and re-audit until the verdict is APPROVE or APPROVE_WITH_CONDITIONS (four rounds at most), then hand over the decision bundle. Use for "/story-plan KEY-nnnn", "plan story KEY-nnnn", "plan USn".
---

# /story-plan <story> [--siblings <story>,…] [--reference-app <path>]

Planning is its own session. `/story-run` records an audit verdict and stops
without one; this skill is what produces it. Several stories can be planned
at once in separate sessions, one story per session; each writes only its own
story folder and its own bundle file.

## Inputs

- `<story>` — as for `/story-run`: `USn` or a tracker key `KEY-nnnn`,
  resolved to a folder under `planning/<epic>/`.
- `--siblings <story>,…` — stories being planned or run at the same time. The
  plan names every file and seam they share and says which stack owns each.
- `--reference-app <path>` — the codebase whose behaviour is the specification
  when the story copies an existing product surface (a parity story).

## Read order

1. `CLAUDE.md`, then `CLAUDE.local.md` → "Working loop".
2. `planning/<epic>/README.md`: state, story order, execution loop,
   open items.
3. The story folder: the story file, every task file, `decisions.md` when it
   exists, and any earlier `implementation-plan.md` (this run writes the next
   version).
4. `planning/<epic>/EPIC/decisions.md` and `DECISION-BUNDLE.md`: the
   rulings and standing defaults the story must honour.
5. The most recently merged story's `implementation-plan.md`, as the shape
   reference.
6. The code the story touches, on `origin/main` at HEAD. Record the sha.
7. The reference app's code for every behaviour the story copies, when given.

## The plan file

`<story-dir>/implementation-plan.md`, sections in this order. `/powerhouse-audit`
appends its report below the last section and replaces it on each re-run.

- **Header.** Story key and title, `Plan vN — <date>`, the trunk sha the plan
  was read against, and from v2 on a "What changed from vN-1" line.
- **Rulings folded in.** Every epic decision and standing default the story
  relies on, by ID, one line each saying what it fixes for this story.
- **Current code.** What exists today for each surface the story touches,
  with file paths. Nothing here is inferred; it is read.
- **Stack order.** One row per layer: `#`, branch `<type>/<slug>`, task key,
  scope in one line, estimated source lines (S < 150, M < 400). Budget per
  layer: 400 source lines, 600 test lines, 1,000 total. **No row is L.** A
  task that would be L is split at a seam where each half builds and is green
  alone (schema before consumer, pure function before call site, data before
  UI). A layer that completes a task closes its title with the task key.
- **Layer 1 … Layer n.** For each: files touched, behaviour in plain English,
  the criteria it serves, tests (unit, contract, E2E), and what the next
  layer or a sibling story relies on from it.
- **Shared with siblings.** Files and seams a sibling story also touches, and
  which stack owns each. The other stack reads the seam and never writes it
  until the owner merges. Empty section when there are no siblings.
- **Not in this story.** What a reader would expect here and will not find,
  and where it lives instead.
- **Rollback.** How each layer is reverted or switched off.
- **Decisions.** The questions the bundle will ask, each with a recommended
  default and the cost of reversing it.
- **Verification.** The commands and click-throughs that prove each
  criterion, in the order a reviewer would run them.
- **Tracker edits owed.** Wording in the ticket the plan found wrong, missing
  or contradicted by the code. The user applies these; the plan never edits
  the tracker.
- **Next.** The `/story-run <story>` command, for a fresh session.

## Loop

1. Write v1.
2. Run `/powerhouse-audit <plan path>`. Read the `### Ship verdict` line of
   the report it appended.
3. On `REJECT_AND_REVISE`, or on conditions that move the design: write the
   next version in place above the report, with its "What changed" line, and
   audit again. **Four rounds at most.** After the fourth, stop and hand over
   the gaps that remain as open questions.
4. On `APPROVE` or `APPROVE_WITH_CONDITIONS`: write the decision bundle to
   `.scratch-research/story-run/<story>-decisions.md` in the format of
   `../story-run/reference/decision-bundle.md`, including the layer plan
   table from the Stack order section and any audit condition that names a
   task, then stop. The bundle is answered in the `/story-run` session, not
   here.

## Rules

- Plans only. No code is written, no branch is created, nothing is pushed.
- The ticket's words win over the plan's. A disagreement becomes a "Tracker
  edits owed" line or a bundle question, never a silent rewrite.
- The plan is local and may cite anything. Nothing it cites is carried into a
  PR body by `/story-run` unless it is in the repo.
- Hard stops (`decision-bundle.md` section 4) are bundle questions with no
  default taken.
- No AI authorship is surfaced in anything written.

## Final message

Verdict and round count · plan path · the stack order table · sibling
collisions found and who owns each seam · tracker edits owed · the open
questions the bundle carries, with their recommended defaults · the
`/story-run <story>` command to start the run in a fresh session.
