# <story> — decisions

Append-only. `REQUIRES-DECISION` is the only status the loop assigns on its
own; it is resolved by editing the status to `DECIDED-OWNER` or `RATIFIED-PM`
(or `SUPERSEDED` with a pointer), never by deleting the record.

### D-<story>-001 — <one-line decision>

- **Date / decided by:** YYYY-MM-DD / the owner (bundle Q1)
- **Status:** DECIDED-OWNER · PR #N
- **Area:** <file or surface the decision governs>
- **Options considered:** (a) …; (b) …
- **Decision + rationale:** (a). <why, in plain English>
- **Consequences / propagation:** <what else moves; reversal cost>
- **Evidence:** <bundle file / spec line / code read>
