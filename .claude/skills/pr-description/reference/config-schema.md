# Configuration schema

The skill is **fully functional with no configuration**. Configuration is purely opt-in, for users who want:

- A citation library (e.g., an Obsidian vault with canonical rules/heuristics) the skill can cite by handle
- Project-specific section overrides (custom section names, custom anti-patterns)
- A non-default base branch for PR detection
- A different scratch-file location

## Config file locations (in priority order)

1. `<repo>/.pr-description.yml` — repo-scoped (wins over user-global)
2. `~/.config/pr-description/config.yml` — user-global
3. Environment variables — single-value overrides

If none exist, the skill uses sensible defaults.

## Config file shape

```yaml
# <repo>/.pr-description.yml — example

# Project display name used in section titles like "Existing <project> references"
# Default: derived from `name` in package.json, or repo name from `git remote`
project_name: 'MyProject'

# Where to find the citation library (handles + verbatim quotes the skill can cite)
# Default: no citation library; Expert Council / Heuristics sections are omitted
citation_library:
  path: '~/Documents/MyVault/heuristics/'
  # Format: each .md file in the directory has YAML frontmatter and a body containing the quote.
  # See "Citation library file format" below.

# Default base branch for `gh pr` / `git log` operations
# Default: detected from `gh repo view --json defaultBranchRef`
default_base_branch: 'develop'

# Custom scratch-file location (relative to repo root)
# Default: ".scratch-research/"
scratch_dir: '.tmp/pr-bodies/'

# Override the default shape thresholds (see reference/shape-detection.md)
shape_thresholds:
  brief:
    max_commits: 3
    max_files: 4
    max_net_loc: 150
  medium:
    max_commits: 8
    max_files: 15
    max_net_loc: 1500
  # large is anything above medium

# Custom section overrides
sections:
  # Skip these sections entirely, even if the shape calls for them
  skip:
    - 'Architecture' # if the project doesn't use bounded-contexts terminology
    - 'Rollback' # if the project has no production rollback path
  # Use a different name for this section in the output
  rename:
    'Existing project references': 'Related issues + PRs'

# Additional anti-patterns to enforce (added to the built-in list)
anti_patterns:
  - 'No `Implements: <ticket>` lines' # team-specific rule
  - 'No links to internal Slack channels'

# Package manager override (rarely needed — usually auto-detected)
package_manager: 'pnpm' # or "npm" / "yarn" / "bun" / "deno"
```

## Citation library file format

Each citation lives in its own file, named after its handle. The skill loads these on demand when a section requires a citation.

```markdown
---
handle: prd-exe-18
title: 'Feature Flags for Validation'
authority: 'Fowler, M.'
source_path: 'Product Powerhouse/principles/heuristics/product-execution.md#PRD-EXE-18'
source_url: 'https://martinfowler.com/articles/feature-toggles.html'
verified_at: '2026-04-15'
when_in_prs: 'When the PR adds or modifies a feature flag, gate, or rollout mechanism'
tier: 1
---

Wrap every new feature in a flag. Start with internal team (dogfooding), expand to beta users, then percentage rollout (1% > 10% > 50% > 100%). Monitor error rates, performance, and feature metrics at each stage.
```

Required frontmatter fields:

- `handle`: kebab-case stable identifier. The skill cites by handle (e.g., `prd-exe-18`); never by file path.
- `title`: human-readable title shown in the rendered citation.
- `source_path` OR `source_url`: where the quote lives canonically. At least one is required.
- `verified_at`: ISO date the body's quote was last verified against the source. Used for staleness audits.

Optional frontmatter fields:

- `authority`: the canonical author/source name shown in the rendered citation (e.g., "Fowler, M.", "Vogels (fail-soft)").
- `when_in_prs`: human-readable description of when this citation applies. Used by the skill when matching citations to PR content.
- `tier`: priority bucket (1 = frequently cited core; 2 = conditionally cited; 3 = rare specialist). Used to prioritise which citations the skill considers.

The body is the verbatim canonical quote. The skill emits this verbatim — no paraphrasing, no editing.

## Environment variable overrides

For one-off invocations or CI use:

| Variable                          | Effect                                                |
| --------------------------------- | ----------------------------------------------------- |
| `PR_DESCRIPTION_CITATION_LIBRARY` | Path to citation library directory (overrides config) |
| `PR_DESCRIPTION_PROJECT_NAME`     | Project display name                                  |
| `PR_DESCRIPTION_BASE_BRANCH`      | Default base branch                                   |
| `PR_DESCRIPTION_SCRATCH_DIR`      | Scratch-file directory                                |
| `PR_DESCRIPTION_PACKAGE_MANAGER`  | Package manager override                              |

Env vars win over config files; config files win over defaults.

## Minimal config example (for users who only want a citation library)

```yaml
# <repo>/.pr-description.yml
citation_library:
  path: '~/Documents/Obsidian Vault/My Heuristics/'
```

That's it. Everything else uses defaults.

## No config required

For a fresh user with no setup: the skill works out of the box. It detects the package manager, the base branch, and the scratch directory from the repo. It emits the universal sections (Summary, What ships, Verification, Predecessor PRs). It omits Expert Council and References sections because there's no citation library to cite from.

This is the intended "first run" experience.
