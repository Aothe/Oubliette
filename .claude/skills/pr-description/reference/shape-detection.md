# Shape detection

A PR's "shape" determines the section emission matrix. Three buckets: **brief**, **medium**, **large**.

## Thresholds (default)

| Shape      | Commits | Changed files | Net LoC  | Other triggers                                                        |
| ---------- | ------- | ------------- | -------- | --------------------------------------------------------------------- |
| **brief**  | ≤ 5     | ≤ 5           | < 200    | none                                                                  |
| **medium** | 4-10    | 5-20          | 200-2000 | one new module or external integration                                |
| **large**  | ≥ 7     | ≥ 20          | ≥ 1500   | OR introduces a new bounded context / top-level architectural concept |

Compute net LoC as `additions - deletions` from `gh pr view --json additions,deletions`.

## When metrics straddle buckets

Pick the **larger** shape. A PR with 6 commits and 18 files (medium territory by commits, also medium by files) is medium. A PR with 6 commits and 35 files is large — files dominate. A PR with 16 commits and 8 files is large — commits dominate.

User can override via `--shape <s|m|l>` in the invocation.

## When metrics mislead (manual override warranted)

These known cases produce wrong shape from metrics alone:

1. **High-commit-count refactor with trivial diffs.** 30 commits each touching 3 lines (rebase-heavy or commit-per-rename style). Metrics scream large; review burden is brief-to-medium. Override down.

2. **Two-commit config-file change with 500 lines.** A single config update (e.g., a generated lockfile, a new ESLint rule that touches every file via formatter, a copyright-header sweep). Metrics say medium; review burden is brief. Override down.

3. **One-commit pure-test PR with 15 files at 20 lines each.** Net LoC ~300, file count ~15. Metrics say medium; review burden is brief. Override down to brief unless the tests cover novel logic.

4. **Three-commit architectural decision that changes 8 files.** Brief by metrics, but introduces a new abstraction (state manager, persistence layer, dependency-injection seam). Override up to medium or large depending on whether the abstraction is a one-off seam or a new bounded context.

5. **Doc-only PR with 25 files.** Metrics say large; review burden is brief unless the docs encode load-bearing architectural decisions (e.g., an ADR sequence).

6. **Pure move or extraction with no behaviour change.** A `refactor:` commit that lifts a body into a shared component or module and leaves the old site as a thin wrapper. Net LoC can read as medium (the body is counted twice), but the reviewer's only question is "is it the same code in a new place". Override down to **brief** and keep three sections: summary (what moved, from where to where, behaviour unchanged), what moved (the file pair), verification ("existing tests pass unchanged"). No motivation section, no testing instructions. A 143-line move does not need a 556-word body.

When in doubt: ask the user "this looks like a [shape] PR by metrics, but the diff suggests [other shape]. Which?" — one question max.

## Detecting "new bounded context" (large-shape signal)

Signals that elevate to large regardless of metrics:

- A new top-level directory under `src/`, `lib/`, `app/`, `packages/`, or the equivalent
- A new external integration (Stripe, Vercel, Sentry, etc. — first-time wire-up, not maintenance)
- A new persistence layer (a new database, a new cache, a new queue)
- A new top-level concept introduced by docs/ADRs as part of the PR
- A new public API surface (route group, contract, RPC)
- A new long-running runtime (worker, scheduler, daemon)

Detect by globbing the diff for new file paths under structurally significant directories, or by checking for new top-level directories not present in the base branch.

## Detecting "user-visible UI change" (three-env-test-split signal)

For medium and large PRs, decide whether the Verification section should split into Local / Preview / Production sub-sections.

Trigger the three-env split when the diff touches:

- React/Vue/Svelte component files
- Route handlers that render HTML
- CSS / Tailwind / styling files
- Layout components
- Feature-flag declarations gating UI surfaces
- Public-facing route files (e.g., `app/(public)/**` in Next.js)

If none of those are touched, the Verification section is a single bash block; no three-env split.

Note the deployment environment names should be detected from the project's conventions. If the project deploys to Vercel: "Local / Vercel Preview / Vercel Production". If to Netlify: "Local / Netlify Deploy Preview / Netlify Production". If unknown: "Local / Staging / Production".

## Quick reference

| Signal                                               | Effect on shape                           |
| ---------------------------------------------------- | ----------------------------------------- |
| ≤ 5 commits AND ≤ 5 files AND no new bounded context | brief                                     |
| 4-10 commits AND new module / external integration   | medium                                    |
| ≥ 7 commits OR ≥ 20 files OR new bounded context     | large                                     |
| High commit count, trivial line counts per file      | step down one shape                       |
| Low commit count, new architectural concept          | step up one shape                         |
| Doc-only with ADR-style content                      | step up one (medium if metrics say brief) |
| Pure move / extraction, behaviour unchanged          | brief, three sections                     |
| UI-rendering files in diff                           | enable three-env test split (medium+)     |
