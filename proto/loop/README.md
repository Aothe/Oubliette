# The loop prototype

*SPEC §8 step 3, begun 2026-10-10. The slice's dungeon — one class, one dungeon, one boss — on a
deterministic fixed-point tick with an input log, so that the server of SPEC §3.4 exists in
miniature: inputs in, state out, and anyone can replay a run to the same deaths. Scripted delvers
play it headless; a browser client lets a person play it and save or replay any run. Everything
the slice invented is still invented (SPEC §4); what is new comes from `docs/red-team.md`.*

## Run it

```bash
cd proto/loop && npm ci          # TypeScript, esbuild and Node types; no runtime dependencies
npm run check                    # tsc --noEmit
npm test                         # node --test: determinism, replay, resume, integers, settlement, the door
npm run fuzz                     # garbage inputs and odd configurations must never throw or store a float
npm run bench                    # the red team's scenarios, 20 runs each; --runs 60 for the numbers below
npm run bench -- --runs 60 --scenario shard20,nomend --danger 400
node --experimental-strip-types src/headless.ts scan --runs 20      # the danger dial against the death band
node --experimental-strip-types src/headless.ts play --scenario party4 --seed 3 --out out/run.json
npm run replay -- out/run.json   # replay a log and compare its hash
npm run build                    # bundles the client to dist/client.js (gitignored); then open index.html
node shots.cjs                   # screenshots into out/ and the in-browser replay check (needs playwright)
```

Node 22.6 or later runs the TypeScript directly (`--experimental-strip-types`; a no-op flag from
22.18). Outputs go to `out/` and the bundle to `dist/`; both are gitignored.

## What is deterministic, and how

- **Integers only.** Positions are in 1/256 px, angles in 1/1024 of a turn, trigonometry from a
  committed Q14 table (`src/sin-table.ts`, generated once by `tools/gen-sin.mjs`), hit points
  in tenths. Division is `Math.trunc` or `Math.floor`, exact below 2^52 because IEEE 754
  rounds the quotient correctly; `isqrt` corrects `Math.sqrt` by integer comparison. No
  `Math.sin`, `atan2`, `hypot` or `random` touches the state. `stateHash` throws on any
  non-integer, and the fuzzer feeds `NaN`, `Infinity`, fractions and strings as inputs.
- **Rolls from a committed secret** (`docs/chain.md` §3, red team D1): the stream for tick *t* is
  seeded from the run's secret, its entry block and *t*; settlement rolls from the secret and a
  block fixed afterwards. The dungeon layout comes from the public dungeon seed alone. The hash
  that stands in for keccak is a 32-bit mixer; nothing depends on which it is.
- **The input log is the run.** Every delver's input is recorded when it changes, bots' included,
  in its canonical form, with a state hash every 600 ticks and at the end; a replay needs no bot
  code and names the first checkpoint that disagrees. `snapshot`/`restore` carry everything but
  the derived world.
- **The config is part of the state.** A run keeps a frozen copy of its config, refuses one with
  a non-integer anywhere or an item in the wrong slot, and hashes the seed, the door rule and
  the dials with the rest, so two states with one hash step the same way under the same inputs.
- **Checked:** 583 of 583 bench runs replay to their hash; a run killed at tick 1,800 and resumed
  from its snapshot ends on the same hash in every scenario; 40 fuzz runs × 2,500 ticks, 0
  failures; headless Chromium replays the run it played, and Node replays Chromium's log, to the
  same hash. No engine but V8 has run a log yet — save a run in one browser and load it in
  another; the verdict line says whether they agree.
- **Cost** on this machine: 8, 36 and 255 µs a tick for 4, 20 and 85 delvers in Node; 250–330 µs
  a tick at 85 in headless Chromium over two runs, 2 % of a 60 Hz frame. A 20-delver run of 5,600 ticks logs
  about 54,000 input frames, about a megabyte of JSON uncompressed, most of it aim; a compact
  encoding is not written.

## What is the slice's, what is new

From `proto/visual/` (`src/content.ts`): the six rooms, the Forgotten, Shades and Gaolers, the
Turnkey's three phases, ten gear items in three tiers, Slip / Mend / Sunder, the three-second
recall a hit breaks, 60 Hz. Loot carried is still left where you die.

New, each from `docs/red-team.md`:

- **A sealed boss door** (C2). A ready plate before the chamber; the first delver to hold **E**
  on it starts a ten-second count; the door opens when everyone living is ready or the count
  ends, stays open three seconds and seals. Those inside are locked in with the boss, whose
  health scales to their number; those outside are recalled with their wager and no loot. The
  slice's rule — the first delver in wakes the boss and shuts recall for all — is kept as
  `door: "open"` so the two can be measured against each other.
- **A hard run length and a halt rule** (D5). Ten minutes; then the run ends where it stands,
  earlier deaths stand, the living leave with their wager and nothing they carried.
- **Settlement as the §3.5 lottery** (B1–B3, B7, C1, A1). Finishers above a contribution bar
  (half the upper-median finisher's damage plus healing) share the prizes by a roll weighted by
  the value they wagered. The dead's recycled third goes to the *next* run's pool, never the run
  it died in. Fresh drops come from the slice's table or, under `fresh: {mode: "budget"}`, only
  as far as a budget allows; the bench reports both.
- **Per-run entry.** The kit, skill included, is fixed when the run is created; nothing changes
  hands mid-run.

## The bench

Scripted delvers (`src/bots.ts`) follow a leader along the rooms, keep their distance, strafe,
dodge what they have noticed, use their skill, ready at the plate. Their one knob is `skill`,
0–100: a bullet is seen only once it is `100 − skill` ticks old, the dodge radius shrinks with
skill, and a lapse of attention — the feet stop for half a second to a second and a half — comes
with a chance of `100 − skill` in 12,000 a tick. The bench's shards mix skills 90, 35, 60, 75 and
45. Bots read exact positions, so their death rate is a dial, not a fact about people.

At the slice's damage a bot shard never dies. The run config's `danger` scales every hit a
delver takes — SPEC §4's one dial — and a scan (`headless.ts scan`, 20 runs × 20 delvers each)
finds the band the economy needs, 7–14 % of delver-runs ending in a death, at ×4 to ×4.5:

| danger | ×1 | ×2 | ×3 | ×3.5 | ×4 | ×4.5 | ×5 | ×6 |
|---|---|---|---|---|---|---|---|---|
| delver-runs dying | 0 % | 0 % | 2.0 % | 4.8 % | 9.0 % | 13.8 % | 22.5 % | 40.0 % |

So the bench runs at ×4. Sixty seeded runs per scenario, twenty delvers unless noted; a run's
recycled gear feeds the next run's pool; "fresh (budget)" is the fresh drop value when the budget
is half the value destroyed in the same run, against the slice's table, 3,360 token when the
boss dies.

| scenario | boss killed | deaths / run | delver-runs dying | shut out / run | extracted | halted | ticks | value destroyed | fresh (table) | fresh (budget ½) | Mends / run |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `party4` — the slice's party of four | 85 % | 1.45 | 36.3 % | 0.05 | 62.5 % | 0 % | 4,980 | 22.4 % | 2,856 | 13 | 4.0 |
| `shard20` — twenty, mixed skills, seven casual Menders | 100 % | 1.93 | 9.7 % | 0.57 | 87.4 % | 1.7 % | 5,625 | 6.6 % | 3,360 | 176 | 44.6 |
| `nomend` — twenty, Slip and Sunder only | 100 % | 5.05 | 25.3 % | 0.55 | 72.0 % | 0 % | 5,315 | 16.5 % | 3,360 | 587 | 0 |
| `healball` (A1) — six Menders at 85 % HP, staggered | 100 % | 2.35 | 11.8 % | 0.92 | 83.7 % | 0 % | 5,317 | 8.0 % | 3,360 | 189 | 45.9 |
| `stripped` (B1) — half wager only the skill item | 95 % | 3.62 | 18.1 % | 0.75 | 73.3 % | 5 % | 7,325 | 10.4 % | 3,192 | 156 | 51.8 |
| `opendoor` (C2) — the slice's door rule | 100 % | 2.42 | 12.1 % | 0 | 87.2 % | 10 % | 8,082 | 8.0 % | 3,360 | 202 | 44.8 |
| `cautious` (A2) — recall under 45 % HP | 100 % | 2.20 | 11.0 % | 0.70 | 81.3 % | 1.7 % | 5,749 | 7.5 % | 3,360 | 182 | 42.6 |
| `shard85` — the realm cap, 3 runs, for the tick cost | 100 % | 6.0 | 7.1 % | 2.0 | 90.6 % | 0 % | 4,788 | 4.6 % | 3,360 | 690 | 170 |

What the bench says, as far as bots can say it:

- **Mend halves deaths; organising it adds nothing here.** No Mend 25.3 % → seven casual Menders
  9.7 % → six staggered Menders at 85 % 11.8 % (the last two are within the noise of sixty runs).
  The budget rule pays 5–17 % of the slice's piñata at this death rate, 587 token a run with no
  healers, under 200 with them.
- **The weakest carry the deaths:** in `shard20` the two lowest skills, two fifths of the shard,
  take 64 % of the deaths (35, 39, 24, 10, 8 across skills 35, 45, 60, 75, 90). The sim's
  treadmill finding in miniature.
- **Value-weighted rolls remove the strip.** Skill-only wagers stake 20 % of the shard's value
  and win 12.4 % of the prize value — they die more, 22.2 % against 14 %, and fewer clear the
  bar; a per-head roll would have paid them half.
- **The sealed door costs 0.57 of 20 a run** shut out with their wager and no loot on a
  ten-second count; the slice's open rule halts 10 % of runs (against 1.7 %) and takes 44 %
  longer, because delvers caught in the rooms must walk in; deaths are the same.
- **A recall rule changes nothing:** 0.83 recalls a run, 0.70 shut out, deaths 11.0 %.
  Recalling means standing still for three seconds in a fight, and a hit breaks it; recall is
  a way out between rooms, not under fire.
- **The party of four dies three times as often** per head as the shard of twenty: fewer bodies
  share the fire, and the boss scaled to four is the same fight per delver.

## Not in here, and what is next

- Nobody has played it. Fun at $0 is the question the prototype exists to ask and bots cannot
  answer; the thirty-run play test is the next step and the only one that counts.
- Signed input batches with receipts (red team D6): the log is unsigned.
- Any engine but V8: the client saves and loads logs so Firefox and Safari can be tried by hand.
- A compact log encoding, interpolation in the renderer, touch controls, sound.
- The contribution formula is damage plus healing; the red team's B2 wants it attacked on paper.
