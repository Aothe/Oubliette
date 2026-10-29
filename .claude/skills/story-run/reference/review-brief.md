# The review brief (what the reviewer is told before it reads the diff)

`/code-review` sees a diff and a repo. It does not know that the reference app's
behaviour is the spec, which files were moved unchanged, which rules were
decided in the bundle, or what the story deliberately leaves out. On
one earlier story that cost 73 dismissals across 111 findings, 35 of them "the reference
app does this" or "pre-existing in moved code", and the stack review re-raised
eight points the layers had already closed. The brief is the fix: one file,
written after the bundle, appended through the loop, passed on every review
invocation and used as the triage key whether or not the reviewer reads it.

## File

`.scratch-research/story-run/<story>-review-brief.md`

```markdown
# <story> — review brief

## Standing rule

For this story the reference app's behaviour is the specification. A finding that
the new app differs from a reasonable expectation is answered by what the
reference app does; cite the reference-app path when the rule is not obvious:

- answers.jsx:608-623 renders the context links for every viewer, public included.
- helpers/review.helper.js getReviewUpdates sets only the fields sent.

## Decided rules (one line each, from the bundle and decisions.md)

- Hide sends `{ hidden }` for the target answer only; no read-then-write.
- Public viewers see context links and hidden placeholders without Show.
- A filter change opens every row; Expand all shows once any row is closed.

## Out of scope for this story

- e2e scope over-match in the e2e scope map
- lenient-field drift logging (repo-wide)
- badge placement by remaining space (reference-app helper, later)

## Pure moves (files carried unchanged; defects in them belong to the task named)

- components/results/standard/standard-answers.tsx — moved from the page in the answers layer; score and answers defects go to T03 / T04

## Standing dismissals (reasons that apply to more than one finding)

- Whole-envelope read on write routes: the ownership check must run on server data; p95 is an owed main check.
- Shared isPending disables sibling controls: same as favourite and report; per-row would drop mutate-level toasts.
```

## Rules

- Written in Phase 1 step 6 from the bundle, the story's `decisions.md` and
  the out-of-scope list; recorded as `reviewBrief` in run-state.
- Appended, never rewritten, during the loop: a moved file goes to pure
  moves before that layer's review; a dismissal reason that will recur goes
  to standing dismissals after it.
- Passed on every `/code-review` invocation (layer and stack) as the
  trailing argument. If the reviewer ignores it, the triage still uses it:
  a finding the brief answers is dismissed with the brief's line, in one
  sentence, and never re-argued.
- Nothing in the brief is a reason to skip a `CONFIRMED` finding. The brief
  answers "is this a defect here", not "is this defect worth fixing".
- The brief is local and git-excluded. Nothing from it is pasted into a PR
  body; the body carries the substance in the repo's own words where a
  reviewer would otherwise ask.
