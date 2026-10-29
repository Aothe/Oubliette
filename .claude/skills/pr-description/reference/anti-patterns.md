# Anti-patterns

What the skill must NOT do.

## Hard rules (never violate)

1. **No emoji.** Anywhere. Not in headers, not in bullets, not in commit-table cells. GitHub-native checkbox markdown `[x]` / `[ ]` is allowed; that is not emoji.

2. **No first-person singular.** "I added X" → "Adds X" or "X is added". The PR description is about the change, not the author.

3. **No marketing voice.** No "amazing", "robust", "powerful", "seamless", "delightful", "best-in-class", "industry-leading". State what the change does in operational language.

4. **No fabrication.** Never invent a commit hash, file path, line number, external URL, citation, audit-finding ID, or PR number. If you cannot verify, omit.

5. **No `Generated with Claude Code` footer.** No `Co-Authored-By: Claude` trailer. The description should read as if a human wrote it.

6. **No `Closes #N` / `Fixes #N` issue-linking** at the bottom unless the user explicitly requests it AND supplies the issue numbers. Auto-linking to fabricated issue numbers is worse than not linking.

7. **No auto-push.** Never invoke `gh pr edit --body-file` or `gh pr create` or any other state-changing GitHub action. Write to scratch; output the command for the user to run.

## Soft rules (avoid unless context demands)

1. **No "Files changed" list.** GitHub already shows this. Including it bloats the description. The commit table is the canonical inventory.

2. **No JIRA/issue-tracker IDs in headers.** Bodies can reference them; headers stay clean.

3. **No "Conclusion", "Notes", "Misc", "Other things" catch-all sections.** Every change has a category. If a finding doesn't fit a category, the categories are wrong, not the finding.

4. **No "TBD" or "TODO" placeholder text.** If a section is incomplete, omit it; don't ship placeholders.

5. **No vague test claims.** "All tests pass" → "131/131 tests pass" or "12/12 pass in `tests/api/contracts/`". Specific counts always.

6. **No `## Summary` section that just lists the changes.** Summary explains WHY, not WHAT. The What is the commit table.

7. **No "Why this matters" sections in brief PRs.** Brief PRs are operationally obvious; explaining why a one-line fix matters adds noise. Reserve the rationale prose for medium+ shapes.

## Tone register

- **Operational, not aspirational.** "Drafts survive refresh for 7 days" not "Drafts are now reliable".
- **Definite, not hedging.** "The fix replaces `Boolean()` with explicit type-narrowing" not "Tries to handle the edge case better".
- **Sentence case in headers, not title case.** `## What ships` not `## What Ships`.
- **Past tense for completed work, present tense for the PR's effect.** Commit bodies are past tense ("added X"); PR-description prose is present tense ("adds X", "replaces Y with Z").

## Specific phrasing to avoid

| Avoid                       | Use instead                                                                     |
| --------------------------- | ------------------------------------------------------------------------------- |
| "I've added..."             | "Adds..." or "This PR adds..."                                                  |
| "All tests pass"            | "<N>/<N> tests pass"                                                            |
| "Should work in production" | "Verified in <environment>" or "Smoke-tested in <environment>"                  |
| "More robust"               | "<specific behaviour change>"                                                   |
| "Easy to extend"            | omit; only claim extensibility if there's an explicit extension point in the PR |
| "Closes #N" (auto-linked)   | only if user supplied the issue number                                          |
| "WIP", "TBD", "TODO"        | omit; ship a complete description                                               |
| "See PR" without context    | "see #N — <one-line context>"                                                   |

## When the user supplies content that violates these

If the user pastes content into the invocation that contains emoji, marketing language, or first-person voice, you don't censor it — but you flag it once in your chat output. Example:

> Your draft uses first-person ("I added the schema test"); per the project's PR-description convention, I've rewritten to operational voice ("Adds a schema regression test"). If you want the first-person back, let me know.

Apply the change; don't argue. Once.
