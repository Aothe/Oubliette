# Section templates

Per-section content templates with structural examples. Use these to construct the PR body. The example excerpts use generic placeholder text — substitute the actual content from the PR's material.

## Section emission matrix

| Section                                           | brief       | medium      | large       | Material gate                                                                                                  |
| ------------------------------------------------- | ----------- | ----------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| Top stamp (HTML comment with PR head + timestamp) | ✓           | ✓           | ✓           | always                                                                                                         |
| Summary                                           | ✓           | ✓           | ✓           | always                                                                                                         |
| What ships (commit table)                         | ✓           | ✓           | ✓           | always                                                                                                         |
| Architecture (with bounded-contexts table)        | —           | —           | conditional | only if a new bounded context is introduced                                                                    |
| Motivation / context                              | —           | conditional | ✓           | only when novel work, not sibling/follow-up                                                                    |
| Why each fix exists                               | —           | ✓           | ✓           | only when there are named findings (audit IDs in commit bodies)                                                |
| Verification (bash block)                         | ✓           | ✓           | —           | brief and medium use this single block                                                                         |
| Test plan (checkbox list)                         | —           | —           | ✓           | replaces Verification for large                                                                                |
| Three-env split (Local / Preview / Production)    | —           | conditional | conditional | only when UI-rendering files in diff                                                                           |
| What's NOT in this PR                             | —           | ✓           | ✓           | only when explicit deferrals exist in commit bodies, session context, or user input                            |
| Findings deliberately NOT addressed               | conditional | conditional | conditional | only when audit produced non-actionable findings                                                               |
| Known limitations                                 | —           | conditional | ✓           | only when limitations exist and user supplies them                                                             |
| Cold-review punch list                            | conditional | conditional | conditional | only when audit/cold-review was run                                                                            |
| Expert Council Decisions                          | —           | —           | conditional | only when ≥ 1 design decision was made; user supplies the quotes OR they come from configured citation library |
| References (categorised `###` subsections)        | —           | —           | conditional | only when external docs were consulted and the user supplies the list                                          |
| Existing project references                       | conditional | ✓           | ✓           | only when predecessor PRs / sibling work exists                                                                |
| Rollback                                          | —           | —           | conditional | only when large PR touches production behaviour                                                                |
| Predecessor PRs                                   | ✓           | ✓           | ✓           | always; says "None — greenfield" if no predecessors                                                            |

## Templates

### Top stamp (always first line of body)

```html
<!-- pr-description skill — generated against PR head <HEAD-SHA> at <ISO-8601-UTC>. If git HEAD differs at push time, regenerate or hand-verify the commit table. -->
```

`<HEAD-SHA>` comes from `gh pr view <N> --json commits --jq '.commits[-1].oid'`. `<ISO-8601-UTC>` from `date -u +%Y-%m-%dT%H:%M:%SZ`.

### Summary

1-3 sentences. State what ships. State why. State the scope-defining boundary. Never lead with implementation detail.

Brief PRs: one sentence is fine.

Medium/Large: 2-3 sentences. If there's a parent architectural doc, link it here.

Example shape:

```markdown
## Summary

<What changes in one sentence>. <Why it changes in one sentence>. <Scope-fence in one sentence — what this is and isn't>.

<Optional: link to the canonical architecture doc if one exists.>
```

### What ships

The canonical commit table. Always include.

**Three-column** (default for brief PRs):

```markdown
## What ships (<N> commits)

| #   | Commit         | Summary                                                               |
| --- | -------------- | --------------------------------------------------------------------- |
| 1   | `<7-char-sha>` | `<conventional-commit-prefix>` — <one-line present-tense description> |
| ... | ...            | ...                                                                   |
```

**Four-column** (when the commits map to audit-finding IDs):

```markdown
## What ships (<N> commits)

| #   | Commit  | What                       | Audit item |
| --- | ------- | -------------------------- | ---------- |
| 1   | `<sha>` | `<prefix>` — <description> | M1         |
| ... | ...     | ...                        | ...        |
```

Notes:

- The first column is the row number, not the commit hash.
- The SHA is 7 chars, plain (no link, no markdown formatting beyond backticks).
- The "Summary" column starts with a backticked conventional-commit prefix (`fix()`, `feat()`, `chore()`, `refactor()`, `docs()`, `test()`, `perf()`, `build()`, `ci()`, `style()`), then `—`, then a present-tense description.
- Description should be one line; multi-line is acceptable for complex changes but discouraged.
- Skipped commits (e.g., "C6 was intentionally skipped") get an explanatory paragraph below the table, not a row.

### Architecture (large only, conditional)

Only for large PRs that introduce a new bounded context. One convention is a "bounded contexts table" — four columns: `Context | Module | Concern | Failure mode`. This is a Domain-Driven-Design pattern. Adapt to the project's actual structure.

```markdown
## Architecture

<One-paragraph orientation: what's the overall shape, what's new.>

| Context        | Module   | Concern            | Failure mode      |
| -------------- | -------- | ------------------ | ----------------- |
| <context-name> | `<path>` | <one-line concern> | <how it can fail> |
| ...            | ...      | ...                | ...               |
```

If the project doesn't use bounded-contexts terminology, fall back to "Components" or "Modules" as the column header. Do not invent the table; only include if the PR genuinely introduces multiple new contexts.

### Why each fix exists (medium/large, conditional)

Subsections per finding. Each subsection explains the finding's root cause + the fix's rationale.

```markdown
## Why each fix exists

### M1 — <short title of the finding>

<2-4 sentence explanation: what was wrong, what was fixed, why the fix is correct.>

### M2 — <next finding>

<...>
```

Only emit when there are named findings (the commit messages reference `M1` / `M2` / `C1` / `C2` / `Wave-N` style identifiers, OR the user's session context has audit reports). Never invent finding IDs.

### Verification (brief/medium)

A single bash block. Concrete commands the user can run; expected output annotated after `# →`.

```markdown
## Verification

\`\`\`bash
<project-package-manager-detected-from-repo> install
<typecheck-command-from-package.json> # → clean / no errors
<lint-command-from-package.json> # → no new violations
<test-command-from-package.json> <path> # → <N/N> pass
\`\`\`
```

Detect the package manager and script names from `package.json` (the project's actual scripts; don't hardcode `pnpm` or `npm`).

### Test plan (large only)

Replaces Verification for large PRs. Checkbox format — `[x]` for items the user has confirmed locally; `[ ]` for items remaining.

```markdown
## Test plan

- [x] `<tooling-command>` — <expected outcome, with the concrete observation: "131/131 tests pass">
- [x] `<another tooling command>` — <observation>
- [ ] Manual smoke test in <env> — human verify
- [ ] <other items>
```

Tooling checkable items use `[x]` (assume the user has run them since the description claims they pass — but be honest; if the user hasn't run them, leave `[ ]`). Human-verifiable items always use `[ ]` and end in `— human verify`.

### Three-environment test split (medium/large, conditional on UI in diff)

When UI-rendering files are touched, the Verification or Test plan section gets sub-sections for each deployment environment. The environment names depend on the project — detect from `.github/workflows/`, `vercel.json`, `netlify.toml`, or the project's docs.

```markdown
### A. Locally (developer machine)

\`\`\`bash
<package-manager> dev
\`\`\`

What you should see by default:

- <expected behaviour 1>
- <expected behaviour 2>

### B. <Preview environment — e.g., "Vercel Preview"> deployments

<Setup steps if any, e.g., env vars to set in the preview environment.>

### C. <Production environment — e.g., "Vercel Production">

<The production-rollout / rollback flow, if applicable.>
```

### What's NOT in this PR (medium/large, conditional)

Explicit scope-fencing. Each bullet names a thing that's plausibly in scope but is deferred + the reason.

```markdown
## What's NOT in this PR

- **<deferred-item-1>** — <one-line reason / disposition>.
- **<deferred-item-2>** — <reason>.
```

Disposition can be: "deferred to follow-up PR", "out of scope per <stakeholder> decision", "covered by sibling PR #N", "covered by issue #M", etc. Never list "stale TODOs" or "fix later if needed" — only list things that have an explicit owner/path.

### Findings deliberately NOT addressed (conditional)

Used when an audit produced findings that the PR chose not to act on. Format as a two-column table.

```markdown
## <N> findings deliberately NOT addressed (and why)

| Finding            | Why no fix                                                                         |
| ------------------ | ---------------------------------------------------------------------------------- |
| <one-line finding> | <one-line rationale referencing concrete code or architecture, not "out of scope"> |
| ...                | ...                                                                                |
```

The "why no fix" column must give a concrete reason (a reserved seam, an intentional architectural choice, a documented pattern). Vague reasons indicate the finding should actually be addressed.

### Known MVP limitations (medium/large, conditional)

Numbered list of caveats. Use when the PR ships with intentional gaps that the user should know about.

```markdown
## Known MVP limitations

1. **<limitation>** — <consequence + why accepted>.
2. **<limitation>** — <consequence + why accepted>.
```

Only include when the user has documented gaps in commit bodies, session context, or an audit report. Never invent limitations.

### Cold-review punch list (conditional)

Used when an audit was run after initial commits and produced additional commits. Three-column table: ID, what was added, audit reference.

```markdown
## Why <C3 + C4> were added (cold-review punch list)

After the original commits, an independent review of this PR surfaced <N> items worth addressing in-PR. Each is documented inline in the commit body; this section summarises the rationale.

### <M3> — <short title>

<3-5 sentence explanation of what the audit found and how the PR fixes it.>

### <next>

<...>
```

The commit message bodies should already explain the audit-driven additions; this section just connects them back to the audit framework.

### Expert Council Decisions (large only, conditional)

For PRs where ≥ 1 design decisions were made that deserve recording. Requires either:

1. The user supplies the quote inline in their invocation, OR
2. A citation library is configured and the user names the handle (e.g., "cite PRD-EXE-18 here").

```markdown
## Expert Council Decisions

### <Decision title>

**<Handle / authority — e.g., "Fowler", "PRD-EXE-18", "Vogels (fail-soft)">**

> "<verbatim quote from the citation library, or from the user's input — never paraphrased>"

<2-3 sentence explanation of how the decision shaped this PR.>
```

**Never construct citations.** If the user doesn't supply a quote and no citation library is configured, omit this section entirely.

### References (large only, conditional)

When external docs were consulted. Categorised by topic with `###` subsections.

```markdown
## References

Sources consulted during the design + audit of this PR. Cited inline in the docs; collected here for one-click reading.

### <Topic 1 — e.g., "Vercel Flags SDK">

- [<doc title>](url) — <one-line "what role it played in the design">
- [<doc title>](url) — <one-line>

### <Topic 2>

- ...

### Existing <project> references

- [<sibling PR title>](url) — <one-line "what role it plays vs this PR">
```

Only include URLs the user explicitly supplied or that appear in the PR diff (e.g., a code comment that links to a doc). Never invent URLs. The "Existing project references" subsection uses sibling PR titles and links — detect via `gh pr list`.

### Rollback (large only, conditional)

When the PR ships behaviour to production that may need a documented rollback path.

```markdown
## Rollback

To roll this back:

1. <step 1 — e.g., revert PR N>
2. <step 2 — e.g., unset env var X in Production>
3. <step 3 — e.g., redeploy>

Verification of rollback: <how to confirm the rollback worked>.

State remaining after rollback: <what stays — e.g., database schema migrations are not reversed; the new env var X stays set with value Y>.
```

Only include when the PR introduces production-affecting behaviour AND the user has supplied the rollback steps. Never invent rollback steps.

### Predecessor PRs (always)

The footer. Lists PRs this one depends on, or affirms greenfield-ness.

```markdown
## Predecessor PRs

- [#<num>](url) (merged / open) — <one-line on what it provides for this PR>
- ...
```

Or:

```markdown
## Predecessor PRs

None — greenfield <feature>.
```
