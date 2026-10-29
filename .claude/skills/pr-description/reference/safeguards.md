# Safeguards

Failure-mode catalogue and the defuses the skill applies.

## Critical safeguards (always active)

### 1. Stale commit-table after rebase / force-push

**Risk:** The skill generates the body referencing commit SHAs `abc1234` … `xyz5678`. The user does some interactive work — rebase, squash, amend. Now the PR head is different. The body still cites the old SHAs. Pushed to GitHub, the commit table looks coherent but the hashes don't resolve to anything in `git log`.

**Defuse:** Every body starts with:

```html
<!-- pr-description skill — generated against PR head <SHA> at <ISO-UTC>. If git HEAD differs at push time, regenerate or hand-verify the commit table. -->
```

After generating the body, output for the user, a copy-pasteable verification command:

```bash
# Verify commit hashes still match before pushing:
gh pr view <N> --json commits --jq '.commits[].oid' | head -c 7
```

The user can eyeball before running `gh pr edit`.

### 2. Fabricated citations

**Risk:** The skill emits "**Fowler, on Anticorruption Layer:** '<quote>'" where the quote is a paraphrase or invention, not a real verbatim quote from a verified source. The user trusts the skill and ships a falsified citation.

**Defuse:** **No citation is constructed.** Every Expert Council / References quote must come from one of:

1. A configured citation library file (see `reference/config-schema.md`) where the YAML frontmatter has a `verified_at` timestamp and the body is the canonical quote.
2. A URL or document path the user explicitly supplied in the invocation.

If neither source is available, the section is omitted entirely. The body MUST NOT contain `<insert quote here>`, `[TBD]`, or any other placeholder for a missing citation.

When emitting a citation, always include the source path or URL inline so the reader can verify:

```markdown
> "<verbatim quote>"
> — <Author / handle> ([source](url))
```

### 3. Sections invented because shape says so

**Risk:** The skill emits a "Findings deliberately NOT addressed" section because the PR is medium shape, then types `(none)` because there are no findings — a stubbed section. Or worse, invents findings to fill the table.

**Defuse:** **Material presence gates every section.** Before emitting a section, the skill asks itself: "Do I have actual material for this?" If not, the section is omitted, not stubbed.

Specific checks:

- **Findings deliberately NOT addressed** requires ≥ 1 commit body to reference an audit ID (`M1`, `Wave-N`, `audit`, etc.) AND that ID to be marked non-actionable.
- **Cold-review punch list** requires the session context to have an audit-agent report OR commit bodies referencing a cold-review label.
- **References** requires the user to have supplied URLs OR the diff to contain code comments with external links.
- **Expert Council Decisions** requires either user-supplied verbatim quotes OR citation-library lookups by handle.
- **Rollback** requires the user to supply the rollback steps OR the PR to introduce production-affecting behaviour the user has explicitly documented.
- **Known limitations** requires the user to have documented gaps in commit bodies, audit reports, or direct input.

Each of these is a "must have material" check before the section appears in the output.

### 4. Forcing PNPM / NPM / YARN when the project uses a different package manager

**Risk:** Skill hardcodes `pnpm` commands. User's project uses `npm`. Verification block fails on the first command.

**Defuse:** Detect package manager from the repo before emitting any command:

```bash
# Check in this order:
test -f pnpm-lock.yaml && echo pnpm
test -f yarn.lock && echo yarn
test -f bun.lockb && echo bun
test -f package-lock.json && echo npm
# Or read package.json `packageManager` field if set:
jq -r '.packageManager // empty' package.json
```

Use the detected package manager in the Verification block. Detect script names from `package.json` `scripts` (don't assume the project has `lint`, `test`, `typecheck` — read what's there).

### 5. Q&A loop friction

**Risk:** The skill asks too many questions; the user gets tired and starts typing `n` to everything; the output is generic.

**Defuse:** **Maximum 2 questions per invocation.** Skip the question entirely when the answer is unambiguous from material presence. Example: if the diff has no UI files, don't ask "should I add a three-env test split?" — just omit the split.

The two questions allowed:

- "I see <signal X>. Should I add <conditional section Y>? [y/N]"
- "Skip the <heavyweight optional section> for this PR? [Y/n]"

Default to omit on `[y/N]` and include on `[Y/n]`. Make `N` the safer answer.

## Calendar-based revisits (out of scope for runtime; document for the user)

The skill ships with bundled style assumptions. Over time, those drift. The user should periodically:

- **Every 6 months:** sample the last 10 merged PRs in the project; diff section conventions against the bundled `section-templates.md`. If drift > 30% (different sections, different ordering, different table formats), update the bundled templates.

- **Every 3 months (if a citation library is configured):** re-verify each citation library entry's `verified_at` against the source path. Vault edits are silent to a snapshotted library.

- **Every 3 months:** if the user maintains a self-telemetry log (`.scratch-research/pr-skill-log.jsonl`), review "which sections does the user delete most often after generation?" — that's the signal the heuristic is mis-tuned.

These revisits are not automated; they're a human discipline. The skill ships with a `revisit-checklist.md` (NOT bundled — that's V2) that the user can run quarterly.

## Failures that V1 deliberately does NOT handle

- **Concurrent scratch-file collisions.** Two PR-description runs against different PRs at the same time. V1 just overwrites `pr-<N>-body.md`; the per-PR-number namespacing makes collision unlikely. V2 will add timestamped suffixes.

- **Hand-edit detection.** If the user manually edits `.scratch-research/pr-<N>-body.md` then re-invokes the skill, V1 just overwrites. The header comment stamps the generation time, so the user can eyeball staleness. V2 will hash the file and refuse to overwrite if hand-edits are detected without `--force`.

- **Drift between bundled templates and the live project conventions.** V1 trusts the bundled templates. V2 adds an `audit` subcommand that samples merged PRs and reports drift.

- **Multi-PR mode.** V1 handles one PR per invocation. V2 might add `--batch` for cleanup runs.

These are documented for the user; the skill behaves correctly within its V1 scope and fails gracefully outside it.
