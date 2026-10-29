---
name: pr-description
description: Generate a high-quality, scope-fenced pull-request description for a GitHub PR by reading the actual diff via `gh` CLI, detecting PR shape (small / medium / large) from commit + file metrics, and emitting only the sections that material in the PR justifies. Writes output to a scratch file the user reviews before running `gh pr edit --body-file` themselves; never auto-pushes. Optional: cite from a user-supplied citation library of canonical heuristics / rubrics (e.g., an Obsidian vault) when one is configured. Use when the user invokes `/pr-description <PR#>` (add `--post` to skip the Q&A and post title + body to the PR — loop mode, used by /story-run), asks Claude to write or improve a PR description, or says "write a PR description for branch X".
---

# PR description skill

When invoked, you produce a polished PR description for a GitHub pull request. You read the actual diff. You match the project's conventions automatically. You ship a draft for the user to review and post manually.

## When you are invoked

Trigger on any of:

- `/pr-description <PR#>` — direct invocation
- `/pr-description --branch <branch-name>` — for an unopened branch (you'll skip `gh pr view` and use `git log` + `git diff` against the base branch instead)
- `/pr-description <PR#> --post` — loop mode (used by `/story-run`, or when the user says "post it"): no Q&A; title and body are posted to the PR after the scratch file is written. See Step 7b.
- Free-form requests: "write a PR description for #N", "draft the body for this branch", "improve the description of PR N"

If the user provides no target, ask once which PR or branch they mean. Don't guess.

## What you do (workflow)

### Step 1 — Inspect the target

For an open PR:

```bash
gh pr view <N> --json title,commits,additions,deletions,changedFiles,baseRefName,headRefName,body
gh pr diff <N>
```

For an unopened branch:

```bash
git fetch origin <base-branch>  # base is the trunk (`main`, CLAUDE.local.md → Working loop); a stacked layer's base is the layer below it
git log --oneline origin/<base-branch>..<branch>
git diff origin/<base-branch>...<branch> --stat
```

### Step 2 — Detect repo conventions

Read these files (only those that exist) to absorb project-local style:

- `CLAUDE.md` at repo root — conventions, naming rules, banned patterns; and `CLAUDE.local.md` (personal working-loop rules: commit format, stack base, decision protocol)
- `.github/PULL_REQUEST_TEMPLATE.md` — required checklist sections
- `package.json` — derive the package manager from `packageManager` field, or from lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `package-lock.json` → npm, `bun.lockb` → bun). Read the `scripts` block to find the project's `lint`, `test`, `build`, `typecheck` commands. Use these verbatim in the Verification section — never hardcode `pnpm` if the project uses yarn.
- `.github/workflows/*.yml` (first 30 lines each) — what CI runs on this PR
- Most-recent 3 merged PRs against the same base branch (`gh pr list --state merged --base <base> --limit 3 --json body`) — sample of the team's current style. Use to calibrate section ordering, heading levels, tone register.

### Step 3 — Compute shape

See `reference/shape-detection.md`. Decide brief / medium / large from commit count + file count + net LoC + whether the PR introduces structurally new code (new bounded context, new top-level module, new external integration). Bucket overlap is intentional — pick the larger shape when metrics straddle.

User can override via `--shape <s|m|l>` in their invocation.

### Step 4 — Detect optional citation library

Look for, in priority order:

1. `<repo>/.pr-description.yml` — repo-scoped config (use first if present)
2. `~/.config/pr-description/config.yml` — user-global config
3. Environment variable `PR_DESCRIPTION_CITATION_LIBRARY` — path to a citation-library directory

Citation library shape: a folder containing markdown files indexed by `handle` (e.g. `prd-exe-18.md`) with YAML frontmatter `{ handle, title, source_path, verified_at, when_in_prs }` and a body containing the verbatim canonical quote. See `reference/config-schema.md`.

If no citation library is configured or detected: **skip the Powerhouse/citation sections entirely**. Do not invent citations. Do not paraphrase external rules.

### Step 5 — Compute material presence (THIS IS LOAD-BEARING)

Before choosing sections, build a checklist of what material the actual PR provides:

- Are there ≥ 1 commits? (always yes — but check format)
- Do any commits have a conventional-commit prefix (`feat()` / `fix()` / etc.)? Extract per commit.
- Are there findings labels in commit bodies? (e.g., `M1`, `C3`, `Wave-7`, audit-style IDs)
- Does the user supply an Expert Council quote (from session context, citation library, or direct prompt)?
- Did the diff touch UI-rendering files (jsx/tsx) → user-visible → testing-instructions section earns its place
- Did the diff touch only test files → testing section is meta; skip three-env split
- Did the diff touch route-handler or layout files → check if a 3-env test split applies
- Does the user supply external doc URLs (from session, config, or prompt)? → References section earns its place
- Has an audit / cold-review been run? (signal: commit bodies mention "M1", "audit", "cold-review", or session context contains agent reports) → cold-review / findings sections earn their place
- Does this PR have predecessor PRs the user wants linked? → Existing project references section

**Hard rule: every section in the output corresponds to material you actually have.** Never emit a section because the shape archetype "calls for it" if no material fills it. Never stub a section with placeholder text. When in doubt, omit.

### Step 6 — Generate the body

Open `reference/section-templates.md` and `reference/anti-patterns.md`. Build the body following the shape's required sections + the material-justified conditional sections.

Top-of-body invariant (every PR description, regardless of shape):

```html
<!-- pr-description skill — generated against PR head <HEAD-SHA> at <ISO-8601-UTC>. If git HEAD differs at push time, regenerate or hand-verify the commit table. -->
```

This stamp defuses the stale-commit-table-after-rebase failure mode. Always include it as the first line of the body.

### Step 7 — Write to scratch + stop

Write the generated body to `<repo>/.scratch-research/pr-<N>-body.md`. If `.scratch-research/` does not exist, create it. Add it to `.gitignore` if it isn't already (check first; only modify `.gitignore` if it doesn't list it).

Output to the user, in chat:

1. The path to the scratch file.
2. A 2-3 line summary of what's in the draft (shape detected, section count, citation count if any).
3. The exact `gh` command the user runs to push the body, e.g.:
   ```bash
   gh pr edit <N> --body-file .scratch-research/pr-<N>-body.md
   ```
4. A `gh pr view <N> --json commits --jq '.commits[].oid'` snippet so they can verify the commit hashes still match before pushing (consistency check).

**DO NOT auto-push without `--post`.** Never invoke `gh pr create`. Invoke `gh pr edit` only in loop mode (Step 7b); otherwise the user reviews and pushes manually. Friction is the safety net for one-off PRs; in a story run, `pnpm gates` and the per-stack review are.

### Step 7b — Loop mode (`--post` only)

When invoked with `--post`:

1. Skip the Interactive Q&A entirely. Decide every conditional section from material presence alone; when in doubt, omit.
2. Title: if the caller supplied one, or the current title is a gh-stack auto-title (branch-name-shaped), set it — `gh pr edit <N> --title "<type>: <what shipped>"`. Rules (CLAUDE.local.md → PR titles): one line, conventional prefix with optional `(scope)`, lowercase after the prefix, ≤ 72 chars, no trailing period, no em/en dashes, no colons beyond the prefix, no story/task/decision IDs (`US24`, `T03`, `D-…`), no file paths; a Jira key may close the title when the task carries one. Calibrate against `git log --format=%s origin/main -15` — the title becomes the squash-merge commit subject.
3. Decisions: **never in the body** (CLAUDE.local.md → "Open decisions never appear in a PR description"). No `## Decisions required` section, no decision IDs, no "default taken, the owner's word owed" line — in loop mode or out of it. `REQUIRES-DECISION` records live in the story's `decisions.md` and are surfaced in chat by the caller. A choice that shaped the diff may be described as a design choice in plain English, with no ID and no request for a ruling.
4. Write the scratch file exactly as in Step 7, then post it: `gh pr edit <N> --body-file .scratch-research/pr-<N>-body.md`.
5. Reply with one line: PR URL, shape, section count, scratch path.

`--post` never creates PRs (`gh stack submit` does), never marks a draft ready (`gh stack submit --open` does), never merges. Hard rules 1–4 and 6 apply unchanged — in particular no footer, no trailer, no authorship line of any kind.

## Hard rules (non-negotiable, in priority order)

1. **No fabrication.** Every commit hash, file path, line number, external link, and citation quote in the output must trace to source material you actually read. If you cannot verify, omit. If a section requires a citation you can't verify, the section is omitted, not stubbed with `<insert quote here>`.

2. **Material presence gates every section.** No section is included because the shape says so. Every section corresponds to material in the actual PR.

3. **No project-specific tribal knowledge** unless detected from the repo. You do not know whether the project uses `pnpm` or `npm` until you read `package.json`. You do not know whether the project has a citation library until you check the config. Detect, don't assume.

4. **No emoji, no first-person singular, no marketing language, no `Generated with Claude Code` footer, no `Co-Authored-By: Claude` trailers.** See `reference/anti-patterns.md` for the full list.

4b. **The body stands alone for a reviewer who has only the repo** (CLAUDE.local.md). Three parts, all hard: (i) **no open decisions** — no `## Decisions required` section, no line asking anyone to rule on anything; (ii) **nothing git-ignored referenced** — no paths under `planning/`, `.scratch-research/`, `.env.local` or any other excluded file, no audit/ledger/outstanding-work row numbers, no story/task/decision IDs (`US25`, `T09`, `D-US25-010`), no `[[wikilinks]]`; (iii) **no vault vocabulary** — `DECIDED-OWNER`, `REQUIRES-DECISION`, `PENDING` and the rest never appear. Say the substance in the repo's own terms instead: the motivation, the constraint, the alternative, the cost of changing it. Before writing, `git check-ignore -v <path>` anything you are about to cite; before posting, grep the draft for `D-US`, `X-US`, `T0`, `row `, `[[`, `scratch-research`, `planning`.

5. **Output to scratch; post only with `--post`.** Without the flag the user reviews the draft and runs `gh pr edit --body-file` themselves. With it (loop mode) the body is posted right after the scratch file is written — Step 7b.

6. **Match the project's own recent style.** Sample the 3 most-recent merged PRs against the same base; mirror their section ordering, header level, tone register. Don't impose a foreign style.

## Reference files (load on demand)

- `reference/section-templates.md` — per-section content templates + structural examples. Load when you're constructing the body.
- `reference/shape-detection.md` — the small / medium / large heuristic, complete with edge cases (size-by-metrics misclassification).
- `reference/anti-patterns.md` — the full anti-pattern catalogue (hard + soft rules).
- `reference/safeguards.md` — failure-mode catalogue + defuses (stale commit hash, citation drift, q&a friction).
- `reference/config-schema.md` — citation-library config file shape.

## Interactive Q&A (V1, max 2 questions — skipped under `--post`)

After computing material presence, ask the user at most TWO targeted yes/no questions to fill conditional sections. Examples:

- "I see the diff touches `lib/api/contracts/`. Should I add a Verification section with a contract-test invocation? [y/N]"
- "I don't see external doc URLs in the diff or session context. Skip the References section? [y/N]"

Never ask more than 2 questions. If the answer is clear from material presence, don't ask at all. Skip the question entirely if the section is uncontroversially required or uncontroversially omittable.

## What this skill does NOT do (explicit rejections)

- Auto-push to GitHub without `--post`. Create PRs, mark drafts ready, or merge — never, in any mode.
- Modify code. The skill writes one file (`<repo>/.scratch-research/pr-<N>-body.md`) and optionally one entry in `.gitignore`. Nothing else.
- Generate test plans you didn't actually run. The Verification section lists commands the user can run; the Test plan section (for large PRs) lists `[x]` items the user actually confirmed plus `[ ]` items remaining.
- Fabricate citations to external rules. If no citation library is configured, the Expert Council / Heuristics-citation sections are omitted.
- Cross-project generalisation. The skill is for ONE PR in ONE repo per invocation. No batch mode.
- Update the PR template itself. That belongs in a different skill.
