# The quiz (a bank written per layer, a core set handed over at the stop)

The quiz exists so the user understands what the stack does before marking
it ready. It is not a test of the code and not a review; the review has
already happened. It is a test of whether the person who will own this code
can say what it does, where it lives, why it was done that way, and what it
would take with it if it broke.

## File

`.scratch-research/story-run/<story>-quiz.md` is the **bank**. Created on
the first layer, appended on each later one. The answer key lives only in
the final section so questions can be pasted into chat without it. Each
question carries its angle and a blast-radius tag in its heading line so the
core set can be picked mechanically.

```markdown
# <story> — quiz

Answer as `1b 2d 3a …` or in prose. Each miss comes back with the right
answer, the reason, and the file to read.

## Layer 1 — <branch> (PR #N)

**1. [behaviour · server] <question>**

- (a) …
- (b) …
- (c) …
- (d) …

**2. …**

## Layer 2 — <branch> (PR #N)

…

---

## Answer key

1. (b) — <one line why> — `path/to/file.ts:42`
2. (d) — …
```

## Questions per layer: four to six, from these angles

Pick the angles the layer actually exercises; a copy-only layer does not get a
blast-radius question.

| Angle        | What the question asks                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Behaviour    | Given a concrete input or state, what does the new code do? (The wrong options are the plausible near-misses.) |
| Location     | Where does the logic live, and why there rather than the other place a reader would look?                      |
| Rationale    | Why this shape? The distractors are the alternatives the bundle or the review rejected.                        |
| Proof        | Which test proves the criterion, and what would it report if the behaviour regressed?                          |
| Blast radius | If this function returned the wrong thing, which surface would a user see it on?                               |
| Seam         | What does the next layer or story rely on from this one, and what is deliberately not promised?                |

## Blast-radius tags

| Tag      | Means                                                                     |
| -------- | ------------------------------------------------------------------------- |
| `tenant` | ownership, capabilities, public mode, anything that decides who sees what |
| `server` | a route, a contract, an upstream write or read                            |
| `parity` | a rule copied from the reference app that a later story will rely on      |
| `seam`   | a shared helper, type or component the next layer or story builds on      |
| `ui`     | rendering, copy, layout, keyboard and screen-reader behaviour             |

## The core set (what the final message carries)

Twenty to twenty-five questions from the bank. A bank under twenty is
handed over whole. Otherwise pick mechanically:

1. One question per layer first, its highest-priority tag, so every layer
   is covered end to end.
2. Fill the rest in tag order `tenant`, `server`, `parity`, `seam`, `ui`;
   within a tag, the later layer first (it is freshest and most likely still
   in flux), and on a tie the layer with the fewest picks so far.
3. Stop at twenty-five, or earlier once every `tenant`, `server` and
   `parity` question is in and the count is at least twenty.

Renumber 1 to N in the message; the bank keeps its own numbers, and a
`## Core set` line at the top of the bank lists which bank numbers were
chosen. `more` draws the next round of up to the same size from what is
left, missed angles first.

## Rules

- Four options each, exactly one right. Distractors are things a careful
  reader could believe, not jokes or obvious throwaways.
- Every question is answerable from the diff and the files it touches; none
  needs the vault, the bundle file, or memory of the chat.
- Questions name files and functions by their real names. No story, task or
  decision IDs in question text.
- The answer key cites a `file:line` on the branch for every answer.
- Grading: score as `n/N`, then one block per miss (right answer, why, where
  to read). No block for a correct answer. Offer one more round from the bank
  on the missed angles, in one line; write `quiz.score` and `quiz.answered`
  to run-state (`quiz.bank` and `quiz.core` hold the two counts).
- The quiz never gates anything in code. `ready` from the user runs
  `gh stack submit --open` whether or not the quiz was answered.
