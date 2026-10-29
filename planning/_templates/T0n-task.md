---
ticket: KEY-nnnn # or `pending` until the tracker card exists
title: <task title>
status: todo # todo | in-progress | done
prs: []
---

# <task title>

One paragraph: what the task changes, where, and the criterion it serves.

## Acceptance criteria

```gherkin
Scenario: <name>
  Given <state>
  When <action>
  Then <observable result>
```

## Definition of done

- Unit or contract test for the new behaviour.
- `pnpm gates` green; one-line commit; PR body posted.
