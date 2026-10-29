---
ticket: KEY-nnnn
title: <story title>
status: planned # planned | running | merged
---

# <story title>

## Story

As a <role>, I want <capability> so that <outcome>.

## Business context

Two to four sentences: why now, what it unblocks, what it costs to delay.

## Not settled from code

Behaviours the reference app or the ticket does not pin down, one line each.
Each becomes a bundle question or a click-through row.

## Acceptance criteria

```gherkin
Scenario: <name>
  Given <state>
  When <action>
  Then <observable result>
```

## Out of scope

- <thing a reader would expect here, and the story that owns it>

## Definition of done

- Every criterion has a test or a click-through row.
- `pnpm gates` green on every layer; stack merged to the trunk.
- Epic after-merge step done (README state row, parity rows, changelog).

## Answers owed

| Question | Owed by | Blocks |
| -------- | ------- | ------ |

## Tasks

| Key      | File            | Title |
| -------- | --------------- | ----- |
| KEY-nnnn | `T01-<slug>.md` |       |

## Order

1. T01 — reason it goes first (the seam the others read).
