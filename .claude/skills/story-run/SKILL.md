---
name: story-run
description: Run a user story end-to-end as one stack of PRs on the trunk — record the story's audit verdict, hold a single decision session with a sized layer plan, then loop task by task (implement → size check → pnpm gates → one-line commit → /code-review → stack layer → posted PR body → quiz questions) until the stack is drafted and the quiz is handed over, or a hard stop. Use for "/story-run USn" or "/story-run KEY-nnnn", "run story USn", "loop KEY-1234", "next task", or "next story".
---

# Story run

One invocation carries a story from "planned" to "stack drafted, reviewed and
quizzed" with the fewest possible turns. The user is asked exactly one thing
before work starts (the decision bundle) and handed exactly one thing after it
(the quiz). Everything in between is either decided by a documented default or
is a hard stop. The run works in its own worktree, never the main checkout.
Every layer is held to the size budget and goes through `/code-review`,
briefed on the story's rules, before its PR is opened. Conventions in `CLAUDE.local.md` → "Working loop" apply
throughout and are not repeated here.

## Inputs

- `<story>` — the story id: `USn` when the local plan is the story, or a
  tracker key such as `KEY-nnnn` when a ticket in the tracker is the story.
  Either resolves to a folder under the planning root (`planning/`,
  named in CLAUDE.local.md → "Working loop"). The folder is local and
  git-excluded.
- `--from <task>` start at a given task · `--resume` continue from run-state
  (implicit when run-state exists) · `--only <task>` run one task as one
  layer. A task is `T0n` under `USn` and a tracker key under `KEY-nnnn`.

## Story root

| Item                 | Where                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Story dir            | `planning/<epic>/<story-slug>/`; for a tracker key, the folder whose story file carries `ticket: KEY-nnnn` in its frontmatter                                                                                                                                                                                                         |
| Story shape          | `_STORY.md` or `<slug>.md` (story, context, acceptance criteria as Gherkin where possible, out of scope, DoD, answers owed); one `T0n-*.md` or one file per tracker task (frontmatter with the key, criteria, DoD); `decisions.md` (created on the first run); `implementation-plan.md` (written by `/story-plan`, carries the audit report) |
| Implementation notes | `implementation-plan.md`. Notes only: the story's own words win where they differ                                                                                                                                                                                                                                                            |
| Epic decisions       | `planning/<epic>/EPIC/decisions.md`                                                                                                                                                                                                                                                                                                   |
| Standing defaults    | `planning/<epic>/DECISION-BUNDLE.md` (every standing question with a default)                                                                                                                                                                                                                                                         |
| Changelog            | `planning/<epic>/CHANGELOG.md`                                                                                                                                                                                                                                                                                                        |
| After merge          | the epic's own after-merge step, named in `planning/<epic>/README.md` (a status table to update, a parity row to flip)                                                                                                                                                                                                                |

When a tracker ticket is the story, the ticket is the ground truth for the
work. Its tasks are the units that get built and closed; the local plan only
says how.

- **Task order.** From the story text when it states one; otherwise from what
  each task's code needs (a task that adds the seam other tasks read goes
  first); otherwise the plan's order for the mapped tasks. Shown in the bundle
  and confirmed there.
- **Task spec.** Each layer is specified from the tracker task's paragraph,
  the story criteria it serves, and the plan's notes for it. Where the plan
  differs from the ticket, the bundle asks, with the ticket wording as default
  and the plan's reason quoted.
- **Work the tracker does not name.** Code the plan says a task needs (a
  shared seam, a test home, a guard) and no tracker task describes is never
  built silently. Phase 0 lists it in the bundle as a proposed task, or a
  proposed story when it serves several stories, written in the epic's own
  style (one paragraph, story criteria). On a yes the user creates it in the
  tracker and the run adds the local file with its key; until the key exists
  the file carries `ticket: pending` and the layer's title carries no key.
- **PR titles.** A layer that completes a tracker task closes its title with
  the key (CLAUDE.local.md → PR titles). A task split over several layers puts
  the key on the last one only.
- **Bookkeeping.** When every layer serving a tracker task is submitted, its
  task file gets `status: done` with the PR numbers. Local only; the user
  moves the ticket.

## Run-state

`.scratch-research/story-run/<story>.json` — read first on every invocation,
written after every state change:

```json
{
  "story": "US24",
  "trunk": "main",
  "startedAt": "2026-09-04T09:00:00Z",
  "updatedAt": "2026-09-04T11:32:00Z",
  "worktree": ".claude/worktrees/us24",
  "devPort": 3010,
  "reviewBrief": ".scratch-research/story-run/US24-review-brief.md",
  "audit": {
    "path": "planning/<epic>/<story>/implementation-plan.md#powerhouse-audit-report",
    "verdict": "APPROVE_WITH_CONDITIONS",
    "at": "2026-10-22 11:40",
    "skipped": null
  },
  "bundle": { "path": ".scratch-research/story-run/US24-decisions.md", "answered": true },
  "layers": [
    {
      "task": "T03",
      "branch": "feat/own-site-alert-gate",
      "parent": "main",
      "pr": 291,
      "status": "submitted",
      "startedAt": "2026-09-04T09:10:00Z",
      "size": {
        "source": 212,
        "tests": 340,
        "overBudget": false,
        "oversize": null,
        "at": "2026-09-04T09:52:00Z"
      },
      "gates": "pass",
      "review": {
        "level": "high",
        "findings": 2,
        "fixed": 2,
        "dismissed": [],
        "at": "2026-09-04T10:05:00Z"
      },
      "submittedAt": "2026-09-04T10:14:00Z"
    },
    {
      "task": "T01",
      "branch": "feat/preview-count-copy",
      "parent": "feat/own-site-alert-gate",
      "pr": null,
      "status": "building",
      "startedAt": "2026-09-04T10:15:00Z",
      "size": null,
      "gates": null,
      "review": null,
      "submittedAt": null
    }
  ],
  "decisions": ["D-US24-005"],
  "quiz": {
    "path": ".scratch-research/story-run/US24-quiz.md",
    "bank": 6,
    "core": null,
    "answered": false,
    "score": null
  },
  "stackReview": null,
  "stoppedBecause": null
}
```

Layer status: `planned → building → sized → gated → reviewed → submitted → done`
or `blocked`. `audit`, `size`, `review`, `quiz` and `stackReview` are written
when the step runs; a null means the step has not happened, never that it was
skipped. A skipped step carries the reason (`audit.skipped`, `size.oversize`,
`review.dismissed[]`). Every step that costs time carries an `at` (layer
`startedAt`, `size.at`, `review.at`, `submittedAt`, `stackReview.at`) so a
retro can say what each step cost per layer.

## Phase 0 — preflight (no questions)

1. **Worktree.** The run never works in the main checkout: another session
   can switch its branch at any moment, and one did mid-run on an earlier story.
   `git worktree add .claude/worktrees/<story-slug> origin/main` (reuse
   the one run-state names when it still exists), `pnpm install
--frozen-lockfile` there once, and every later command, gate, build and
   E2E run uses that directory as its cwd. Record `worktree` in run-state.
   A dirty worktree left by an earlier invocation of the same story is kept
   and built on, never stashed or reset. The main checkout's state is not
   the run's business and is never touched.
2. `git fetch origin main` · `gh auth status` · `gh stack --help` all succeed.
3. Probe the backing services the E2E lane needs (`curl -s -o /dev/null -w '%{http_code}' $E2E_API_URL/`, default port 3001).
   The app server for the E2E gate is the worktree's own: pick the first
   free port from 3010 upward (`ss -ltn` shows what is taken; another story
   may be running in its own worktree at the same time), record it as
   `devPort` in run-state, start `pnpm dev -p <devPort>` from the worktree,
   and run the gate with `E2E_BASE_URL=http://localhost:<devPort>`, never
   against the main checkout's server, which may be serving another branch. Backend down is not a stop —
   the E2E gate will report SKIPPED and the final message says so.
4. Read the story file, every task file, `decisions.md`, the epic
   `decisions.md`, the standing-defaults file, `implementation-plan.md` and
   the changelog head. Note per task what the plan adds, differs on, or says
   is missing. Build the task order per the Story root rule (story
   dependencies and any decided sequencing first, e.g. "T03 ships alone
   first").
5. **Audit record.** The story brief is audited with `/powerhouse-audit` before
   the run, as many times as it takes to pass; the run does not audit, it
   records. Find the `## Powerhouse Audit Report` section in the story file
   (`_STORY.md` or the tracker story `<slug>.md`), in the story folder's
   `implementation-plan.md` (where `/story-plan` writes it), or in
   a `*audit*.md` beside it,
   and read its latest `### Ship verdict` line and timestamp. Write them to
   run-state `audit`. `APPROVE` or `APPROVE_WITH_CONDITIONS` → continue (the
   conditions are read and any that name a task become bundle questions or
   layer notes). No report, or `REJECT_AND_REVISE` → stop here, before Phase 1,
   and say so in one line with the command to run. The user may answer
   `skip: <reason>`; the reason goes to `audit.skipped` and the run continues.
   This is the only stop before the bundle, and it costs nothing because no
   layer exists yet.

## Phase 1 — decision session (the one blocking step)

Skip when run-state says `bundle.answered: true`.

1. Read every task's Gherkin + DoD and the codebase it touches. Collect every
   point where two readings would produce materially different work. Anything
   with a conventional default, a standing epic decision, or a spec answer is
   not a question — apply it and cite it.
2. Write the bundle per `reference/decision-bundle.md` to
   `.scratch-research/story-run/<story>-decisions.md` and show it in full in the
   reply. Each question: plain-English context, options, recommended default,
   what it costs to reverse.
3. **Layer plan.** The bundle ends with one table: every layer the run will
   open, its task, its one-line scope, and its size estimate against the
   budget in Phase 2 step 4 (S under 150 source lines, M under 400, L over
   400). An L is not allowed: the task is split there, in the plan, into the
   layers that fit, and the split is shown. A task whose smallest honest layer
   is still L says why (a mechanical move, a generated file) and carries that
   reason into `size.oversize`. The plan is confirmed with the bundle; it is
   not a question unless the split changes task order.
4. Wait. "defaults", "go", or an empty reply accepts every recommended default.
5. Record every answer as the next `D-<story>-NNN` in the story's `decisions.md`
   using the record format in the reference (`DECIDED-OWNER` when answered;
   `REQUIRES-DECISION` when the default was accepted silently). Update
   run-state and proceed without another prompt.
6. **Review brief.** Write `.scratch-research/story-run/<story>-review-brief.md`
   per `reference/review-brief.md`: the story's standing rule (for a parity
   story, the main app's behaviour is the spec unless a decision says
   otherwise, with the main-app paths that prove it), every decided rule as
   one line, the out-of-scope list, and two lists the task loop appends to:
   pure moves (files carried unchanged, with the layer that moved them) and
   standing dismissals (a reason that applies to more than one finding).
   Record `reviewBrief` in run-state. On one earlier story, 35 of 73 dismissals were
   "the main app does this" or "pre-existing in moved code"; the brief is
   what lets the reviewer and the triage skip them.

## Phase 2 — task loop

For each task in order:

1. **Layer.** Branch `<type>/<slug>` (slug = task title, kebab, ≤ 40 chars; no story or task IDs, so `feat/own-site-alert-gate`, not `feat/us24-t03-…`;
   the type follows the commit type). First layer: `gh stack init --base main <branch>`. Later layers,
   from the current top of the stack: `gh stack add <branch>`. Write the
   layer's `startedAt`.
2. **Build.** Implement against the task's Gherkin + DoD. Tests ride alongside:
   Vitest for logic, an E2E spec change when the task alters a surface
   `tests/e2e/*.spec.ts` covers. Keep the diff to the task; unrelated findings
   go to the final report, not the branch. The smallest change that meets the
   criterion is the right one: no helper with one caller, no option or prop
   nothing reads yet, no type or constant added "for the next story", no
   rename or move outside the task, no test beyond the criterion's rows and
   the review's findings. A layer earns every line it adds.
3. **Question mid-task?** Apply the CLAUDE.local.md protocol: take the default, add a
   `REQUIRES-DECISION` record to `decisions.md`, append its id to run-state,
   continue. A hard-stop class → Phase 3 with the reason spelled out.
4. **Size.** Measure the layer against its parent before the gates run:

   ```bash
   git diff -M --numstat <parent>...HEAD -- . ':!pnpm-lock.yaml' ':!*.snap' \
     | awk '$1 != "-" { if ($3 ~ /^tests\//) t += $1 + $2; else s += $1 + $2 } END { printf "source %d tests %d\n", s, t }'
   ```

   Budget per layer: **source ≤ 400 changed lines, tests ≤ 600, total ≤
   1,000.** (`-M` makes a moved file count only the lines that changed inside
   it.) Over budget → run `/simplify` on the branch first; still over → split
   the branch into two layers at a seam that leaves each one building and
   green (the second becomes the next `gh stack add`), and the layer plan in
   the bundle file is corrected. A layer that cannot be split without breaking
   the build writes the reason to `size.oversize` and its PR summary says, in
   plain English, why the diff is the size it is. Record `size` in run-state
   either way, with `at`. The last sixty merged PRs have a median of about 350 changed
   lines; a layer over 1,000 is the exception the reviewer has to be told
   about, never the norm.

5. **Gates.** `pnpm gates`. Fix and rerun. Two consecutive failures of the same
   gate with no progress → Phase 3 (do not weaken a test to pass it).
6. **Commit.** One-line conventional commit, no body, no trailers. Several
   commits per layer are fine — they squash.
7. **Review.** Before any PR exists for the layer: add the layer's moved
   files (if any) to the brief's pure-move list, then
   `/code-review <branch> <level> <brief path>` — `medium` when the layer is
   a pure move or a copy change, `high` otherwise. The brief's path rides on
   the invocation so the reviewer can read it first; whether or not it does,
   triage runs against the brief: a finding the brief already answers is
   dismissed by citing the brief's line, not re-argued. Fix every
   `CONFIRMED` finding and every `PLAUSIBLE` one a test can pin down; a
   `PLAUSIBLE` finding left alone gets a one-line reason in
   `review.dismissed`, and a reason that will apply again (a parity rule, a
   moved-code fact, an out-of-scope seam) is appended to the brief's
   standing dismissals so later layers and the stack review inherit it.
   Fixes go through steps 4 to 6 again (size, gates, commit). Record
   `review` in run-state with the level, the count found, the count fixed,
   the dismissals and `at`, including a zero-finding review. The review
   never widens the layer past its task and never weakens a test; a finding
   that belongs to another layer or another story goes to the final message.
8. **Submit.** `gh stack submit --auto` (drafts; pushes the whole stack). Then
   `n=$(gh pr view <branch> --json number -q .number)`,
   `gh pr edit $n --title "<type>: <what shipped>"` (title rules:
   CLAUDE.local.md → PR titles — no dashes, no story/task IDs, ≤ 72 chars; an
   `KEY-nnnn` layer that completes a tracker task closes the title with its key), and
   `/pr-description $n --post` to write and post the body. **Open decisions
   never go in the body** (CLAUDE.local.md) — no `## Decisions required`
   section, no decision IDs. They are surfaced in the Phase 3 final message.
   The PR opens as a draft and stays one until Phase 3. Write `submittedAt`.
9. **Quiz questions.** Append four to six questions for this layer to the
   bank at `.scratch-research/story-run/<story>-quiz.md` per
   `reference/quiz.md`, each tagged with its angle and blast radius, with
   the answer key in the file's final section only. Nothing is shown in chat
   yet; Phase 3 hands over a core set drawn from the bank.
10. **Bookkeeping (local files only, never in the PR).** Task frontmatter
    `status: done` with the PR number; run-state layer `submitted`; under
    `KEY-nnnn`, the tracker task file once every layer serving it is submitted.
11. Next task. No status message between tasks unless something changed the
    plan; one line per completed layer is enough.

## Phase 3 — stop

Stop reasons: story complete · hard-stop decision · a gate failing twice ·
a dependency outside the stack (unmerged prerequisite PR, a bless the story
lists as owed, a missing env var or secret) · the user interrupts.

On stop:

1. **Stack review** when the stack has two or more layers: `/code-review` on
   the whole stack diff (`origin/main...<top branch>`) at `medium`, looking
   for what per-layer reviews cannot see (a later layer undoing an earlier
   one, a seam used two ways, a test that passes only because of merge
   order). The invocation carries the brief, whose standing dismissals now
   hold every layer's repeatable reasons; a finding that repeats one is
   closed by reference, not re-argued (one earlier stack review re-raised
   eight already-dismissed points and fixed nothing). A finding is fixed as
   a commit on the layer that owns the file,
   that layer goes through size, gates and commit again, and
   `gh stack submit --auto` pushes the stack. Record `stackReview` in
   run-state as for a layer review, with `at`.
2. **The stack stays in drafts.** Nothing here runs `gh stack submit --open`.
   Marking ready is the user's action after the quiz.
3. Write run-state with `stoppedBecause`.
4. Final message, in this order: stack table (layer · task · PR URL · draft
   · size · gates · review findings fixed) · under `KEY-nnnn`, a tracker table
   (key · title · layers · ready to move to Done) and the story-level checks
   still owed (an E2E spec against real data, a click-through of each
   criterion on the trunk deployment, the epic's own after-merge rows) · the
   open decisions, asked as questions — this is the ONLY place they are
   surfaced, so each gets its plain-English context, the default taken, the
   alternative, and what it costs to change now · **the core quiz**: twenty
   to twenty-five questions drawn from the bank per `reference/quiz.md`
   (every layer contributes at least one; the rest fill by blast radius:
   tenant boundaries and server routes first, then parity rules and seams a
   later story relies on, then UI; a bank under twenty is handed over
   whole), renumbered 1 to N, questions only, with the bank's path and one
   line saying how to answer (`1b 2d …` or prose) · what stopped the loop
   and the single action that unblocks it · anything noticed but left out of
   scope. Never a bank larger than that: one earlier story handed over 69 questions
   and none were answered before the merge.
5. When the user answers decisions, update each record to `DECIDED-OWNER` with
   the date and their words, and make any change the answer implies. When the
   user answers the quiz, grade it: each miss gets the right answer, the
   reason, and the `file:line` to read; write `quiz.score` and
   `quiz.answered`. Offer, in one line, a second round from the bank on the
   missed angles (`more` draws the next round, up to the same size, from
   what the bank has left).
   `ready` (or `open`) → `gh stack submit --open`; the user may say it before
   or without answering the quiz, and the run says nothing about that.

## After the user merges

`gh stack sync` (fetch, cascade-rebase, force-with-lease push of the remaining
layers). Then: changelog entry per merged PR (append-only, PR-anchored) in the
root's changelog, `_STORY.md` status, and the root's after-merge step from the
table (whatever the epic's README names). When `gh stack sync` reports
every layer merged: `git worktree remove .claude/worktrees/<story-slug>`,
delete the merged local branches, and set run-state `worktree` to null.
"next story" → Phase 0 for the next `<story>`.

## Rules that do not bend

- Never `git push --force`; only `gh stack submit` / `gh stack sync` push, and
  they use `--force-with-lease --atomic`.
- Never merge. `gh stack merge` is the user's action.
- Never stash, reset, or check out over uncommitted user work.
- Never surface AI authorship anywhere (CLAUDE.local.md).
- Never ask a question the bundle could have carried; never block on a question
  that has a documented default.
- Never weaken, skip, or delete a test to make a gate pass.
- Never open a PR for a layer that has not been sized and reviewed, and never
  let an over-budget layer through without a reason in run-state and a plain
  sentence in its PR summary.
- Never mark the stack ready. `gh stack submit --open` runs only on the
  user's `ready` after the quiz is in their hands.
- Never audit the story brief inside the run; record the verdict that exists
  or stop and say which command produces one.
- Never work in the main checkout. Every command of the run has the story's
  worktree as its cwd, and the E2E gate targets that worktree's own server.
- Never re-argue a finding the review brief already answers; cite the line.
