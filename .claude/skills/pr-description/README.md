# pr-description

A Claude Code skill that generates polished pull-request descriptions from the actual PR diff, scoped to the conventions of the repo it runs in.

## What it does

Given a PR number (or branch name), the skill:

1. Reads the PR's commits, file changes, and diff via `gh` CLI.
2. Reads the repo's `CLAUDE.md`, `.github/PULL_REQUEST_TEMPLATE.md`, and `package.json` to detect project conventions (package manager, lint/test/build script names, base branch).
3. Samples the last 3 merged PRs against the same base branch to calibrate section ordering and tone.
4. Detects PR shape (brief / medium / large) from commit count, file count, and net LoC.
5. Generates a body containing only the sections that the actual PR material justifies — never stubs, never invents.
6. Writes the body to `.scratch-research/pr-<N>-body.md` and prints the `gh pr edit --body-file` command for you to run.

**It never auto-pushes to GitHub.** You always review and post manually.

## Invocation

```
/pr-description <PR-number>
/pr-description --branch <branch-name>
/pr-description <PR-number> --shape large
```

Or in conversation: "write a PR description for #117".

## Optional config

The skill works with zero configuration. If you want to opt into more:

- **Citation library**: point the skill at a folder of canonical heuristics/rubrics (e.g., an Obsidian vault), and the skill will cite them by handle in Expert Council / References sections. See `reference/config-schema.md` for the file format.
- **Section overrides**: skip sections that don't apply to your project (e.g., "Architecture" if your codebase doesn't use bounded contexts).
- **Shape threshold overrides**: tune the brief/medium/large thresholds.

Configuration lives at `<repo>/.pr-description.yml` (repo-scoped) or `~/.config/pr-description/config.yml` (user-global).

## What's intentionally NOT in V1

- **Auto-push to GitHub.** Friction is the safety net.
- **Hand-edit detection.** Re-invoking overwrites; the header stamp lets you eyeball staleness.
- **Multi-PR batch mode.** One PR per invocation.
- **Style-guide drift auditing.** Quarterly human discipline, not runtime check.

See `reference/safeguards.md` for the full V1 scope.

## Files

- `SKILL.md` — main instructions (what Claude reads when the skill is invoked)
- `reference/shape-detection.md` — brief/medium/large heuristic + override rules
- `reference/section-templates.md` — per-section content templates with structural examples
- `reference/anti-patterns.md` — hard rules and soft rules
- `reference/safeguards.md` — failure-mode catalogue and defuses
- `reference/config-schema.md` — optional config file format

## Trying it

First run on a small PR with no config:

1. Invoke `/pr-description <small-PR-number>`.
2. Skill detects brief shape, generates Summary + commit table + Verification + Predecessor PRs.
3. Output lands at `.scratch-research/pr-<N>-body.md`.
4. Eyeball; run the printed `gh pr edit` command if you're happy.

If the output is consistently off-style for your repo, adjust:

- The bundled `section-templates.md` if a convention is wrong
- A `.pr-description.yml` config override if it's a project-specific tweak

Iterate. The skill is meant to be edited.
