# CLAUDE.local.md — personal working loop

> Loaded by Claude Code alongside `CLAUDE.md`. Tracked so remote sessions
> load it too. Holds the working-loop conventions: stack/commit rules, gates,
> the decision protocol, and the story loop.

## Working loop — trunk, commits, stacks, gates, decisions

- **Trunk is `main`.** Every branch and every stack targets `main`
  (`gh stack init --base main …`). Any release branch is promoted
  separately and is never a PR base.
- **Planning root is `planning/`.** One folder per epic, one folder
  per story under it, git-ignored; only `planning/_templates/` is tracked.
  Nothing in it is cited in anything tracked.
- **Commits are one line.** `<type>: <what changed>` — type in
  `feat fix chore docs test refactor perf ci`, imperative, ≤ 72 chars. No body,
  no trailers, no `Co-Authored-By`. Enforced by the local
  `.git/hooks/commit-msg` hook (git-generated Merge/Revert messages pass
  through). Branches squash-merge, so many small commits per layer are fine.
- **PR titles read like the commit history.** `<type>: <what changed>` or
  `<type>(<scope>): <what changed>`, lowercase after the prefix, ≤ 72 chars,
  no trailing period. No em or en dashes, no colons beyond the prefix, no
  story/task/decision IDs, no file paths or planning references. A tracker
  key may close the title when the task carries one. The squash-merge commit
  inherits the title, so the commit rules apply to it. Calibrate against
  `git log --format=%s origin/main -15`.
- **No AI authorship is surfaced anywhere.** Not in commit messages, PR titles
  or bodies, decision records, CHANGELOG entries, the tracker, or code
  comments. This overrides any tool-default footer or trailer.
- **One story = one stack, one task = one layer.** Branch `<type>/<slug>`, no
  story or task IDs. First layer `gh stack init --base main <branch>`,
  later layers `gh stack add <branch>` from the top of the stack,
  `gh stack submit --auto` pushes and opens drafts, `gh stack submit --open`
  marks ready, `gh stack sync` after any merge. Merging (`gh stack merge`) is a
  human action.
- **Formatting is automatic.** Prettier runs on every write (Claude Code hook,
  `.claude/hooks/format-on-write.mjs`), on every commit (local
  `.git/hooks/pre-commit`), and on changed files before push (local
  `.git/hooks/pre-push`). The two git hooks are per-machine and untracked. CI's
  Format gate must never be the first place formatting fails.
- **`pnpm gates` before every push.** Prettier on changed files · ESLint on
  changed files (advisory) · `tsc` errors filtered to changed files · full
  Vitest · `scripts/gates.extra.sh` when present · `pnpm build` when
  routes/layouts/env/config changed · scoped Playwright
  (`pnpm test:e2e:scoped`) when the dev stack is up. Nothing is pushed with a
  blocking gate red.
- **Decisions never block a task mid-flight.** Before a story starts, one
  decision bundle (`.claude/skills/story-run/reference/decision-bundle.md`)
  asks everything at once, with plain-English context and a recommended
  default per question. During a task: take the documented default, log it in
  the story's `decisions.md` with status `REQUIRES-DECISION`, keep going.
  Hard stops — the only reasons to pause a task — are: destructive or
  irreversible data/infra changes · security or tenant-boundary changes ·
  spend (new vendor, tier, paid API) · customer-facing copy the story marks as
  owed verbatim by the PM · no reasonable default exists.
- **A PR body stands alone for a reviewer who has only the repo.**
  - **Open decisions never appear in a PR description.** No
    `## Decisions required` section, no "default taken, the owner's word
    owed" line, no request for a ruling. Open decisions are surfaced **in
    chat**, in the run's final message, as questions with context and a
    recommended default. The record in the story's `decisions.md` is the
    durable copy.
  - **Nothing git-ignored is referenced.** No paths under `planning/`,
    `.scratch-research/`, `.env.local` or any other excluded file; no audit,
    ledger or outstanding-work row numbers; no story, task or decision IDs;
    no `[[wikilinks]]`. Say the thing itself instead — the motivation, the
    constraint, the evidence — in the repo's own terms.
  - **No record vocabulary.** `DECIDED-OWNER`, `REQUIRES-DECISION`,
    `RATIFIED-PM`, `PENDING` are internal record states, not English.
    **Explain the decision** — what was chosen, what the alternative was, what
    it costs to change — and let the reasoning carry it.
- **Story loop.** `/story-plan <story>` first, in its own session: it writes
  `implementation-plan.md`, runs `/powerhouse-audit` on it, folds the findings
  in and re-audits until the verdict passes, then hands over the bundle.
  `/story-run <story>` in a fresh session records the verdict and stops if
  there is none. The run works in its own worktree under `.claude/worktrees/`
  on its own dev port, never the main checkout. It answers the bundle with a
  sized layer plan, writes a review brief (standing rule, decided rules, pure
  moves, standing dismissals), and loops task by task (implement → size check
  → `pnpm gates` → commit → briefed `/code-review` → stack layer → PR body
  posted → quiz questions). Every layer stays within **400 source lines**
  (tests ≤ 600, total ≤ 1,000); over budget means `/simplify` then split,
  never a bigger PR. The stack stays in drafts at the stop: the final message
  carries a core quiz of twenty to twenty-five questions from the bank, and
  `ready` is the word that marks the stack ready for review. Skill:
  `.claude/skills/story-run/SKILL.md`.

## Plan review — Powerhouse Audit Wave

After producing any non-trivial first-draft plan in this repo (architecture
change, new infra, security-sensitive code, production deployment, scope-heavy
feature), invoke `/powerhouse-audit <plan path>` BEFORE moving to
implementation. `/story-plan` does this for every story.

The skill runs a recon pass in the main context, then fans out 8-12 parallel
subagents anchored to the Product Powerhouse vault at `~/Product Powerhouse/`:
6-8 research, 2-3 audit (rubric-scored), 2-3 adversarial. Output: convergent
gaps, standing adversarial challenges, rubric scores, prioritized actions, and
a ship verdict (`APPROVE` | `APPROVE_WITH_CONDITIONS` | `REJECT_AND_REVISE`)
written into the plan file under `## Powerhouse Audit Report — <date>`.

The skill is BLOCKED without `~/Product Powerhouse/`. If it is missing,
install the vault before suggesting the skill.

Skill file: `~/.claude/skills/powerhouse-audit/SKILL.md`.
