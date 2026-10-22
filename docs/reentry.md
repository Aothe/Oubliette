# Re-entering the dungeon after death, with a fresh kit or loadout

*Synthesis of `docs/reentry-chat-trade-web-notes.md` part A (sourced) against SPEC §2, §3.5, §7
and `docs/red-team.md`. Written 2026-10-05 as a proposal; the operator's decisions on it
(2026-10-20) are at the end and in SPEC §2; the unwagered run of point 3 was reversed on 2026-10-22.
It corrects one of the author's first-pass positions.*

## The short version

1. **Re-entry is always a new wager, never a resume.** The dead kit is burned or pooled and
   nothing on chain rolls back. The slice's "Mint a fresh set and delve again" button is already
   the right shape; the work is in making it fast and in deciding *which run* it leads to.
2. **v0: the dead re-enter a *new* run, not the one they died in.** Their friends' next run,
   from the Gatehouse, as a fresh signed entry. Same-run re-entry is "next", because it is only
   safe once three contract rules exist that are not built yet (below).
3. **The free re-entry is the unwagered run.** A player who cannot afford a second kit — in the
   v1 model, 39 % of runner-days are priced out — should still be able to play: a practice run
   that wagers nothing and pays nothing tradeable, no loot, no lottery, no fame into any roll.
   That is Tarkov's Scav run, and it is also SPEC §2's "fun at $0" made concrete.
4. **Loadouts need no new contract.** A kit of four equips in one transaction for about $0.004;
   entry is a relayed session-key transaction under a cent; RH Chain supports batching
   (`docs/chain.md`). A loadout is a named list of item ids kept off chain plus one batched
   transaction. A "kit NFT" that bundles items is not worth it: more gas, a contract as
   recipient (red team D3), and the exchange would have to list bundles.
5. **Ghosts.** The dead stay in the shard's chat and watch the delayed feed, queued for the
   party's next run. WoW Classic Hardcore's one good idea, and it keeps the dead from leaving.
6. **What persists across death is account-side and never a tradeable prize.** RotMG: vault,
   pets, fame; Hades: Darkness; Rogue Legacy: the manor. The red team's B4 forbids keying any
   tradeable roll to level or fame.
7. **The target number is under a minute from death to back in a run** — RotMG's loop — and it
   is the first thing to time in the thirty-run play test.

## Why not the same run, yet

The tempting version — die, mint, run back in and rejoin the same boss — is the one most
players would want. Three things make it unsafe today:

- **A death must never pay the run it died in** (red team rule 3; C1 "survivors profit from
  shard-mates' deaths", B7). If the dead player's recycled gear went into *that* run's pool, a
  party could feed the pool with cheap deliberate deaths and re-enter to collect. (This was the
  author's first-pass position; it is the wrong way round.) The recycled third must go to a
  pool that this run cannot win — a later run, a delayed raffle, or a global pool with a delay
  (red team research item 9 is to decide which).
- **The lottery is not yet weighted by value wagered** (rule 2). Until it is, re-entering with
  the cheapest qualifying kit is the winning play.
- **The fresh-drop budget is counted in items, not value** (`sim/treadmill.py`). Cheap deliberate
  deaths under same-run re-entry would count as destruction and unlock fresh tier-2 and tier-3
  drops. The budget has to be in value destroyed before re-entry can touch it.

With those three in the contract, same-run re-entry becomes a new entry record before the seal,
capped per run, with the boss scaled to the number inside at the seal — and never after the
boss wakes, which is the operator's lock-in rule from the other side.

## Reference games, in one table

| Game | On death | Fits here? |
|---|---|---|
| RotMG | new character at once; vault, pets, fame persist; dungeon portals close in 30 s so the same instance cannot be rejoined | yes — the model |
| Escape from Tarkov | insurance returns gear, a secure container keeps it; the Scav run is a free loadout | insurance and the container are rollbacks — out; the Scav run fits |
| Diablo hardcore | character gone; stash persists | yes |
| WoW Classic Hardcore | character gone; ghosts can watch and talk | the ghost fits |
| Hades, Dead Cells, Rogue Legacy | banked meta-progress; Dead Cells banks only at checkpoints | banked progress fits; checkpoint banking is SPEC's recall rule |
| Dark Souls, Valheim | corpse run to recover what you dropped | out — nothing to recover |

## What it costs

A tier-1 kit is about $12 at the model's prices (`docs/capital.md`); equip and entry are cents
and seconds. The cost that matters is the kit, which is why the unwagered run exists.

## Bins

- **v0:** re-entry into a new run with one click (a saved loadout, one batched transaction); the
  unwagered practice run; ghosts in shard chat; time death-to-next-run in the play test.
- **Next:** same-run re-entry before the seal, after rules 1–3; named loadouts and a standby
  kit; add "deliberate cheap deaths under same-run re-entry" as a probe in the treadmill sim;
  measure a batched mint-and-equip in `probe/chain/gas`.
- **Later:** anything that returns gear to the dead.

## Decisions this asks of the operator

1. Accept "the dead rejoin their friends in the *next* run" for v0, with same-run re-entry held
   until the contract rules exist? (Recommended: yes.)
2. The unwagered run: a practice mode that pays nothing tradeable — in or out? (Recommended:
   in. It is the $0 loop, it keeps the priced-out playing, and a run with nothing at stake
   paying nothing is exactly the bot-resistance rule.)
3. Where the recycled third of a dead kit goes: a later run, a delayed raffle, or a global pool
   with a delay. Not re-entry's question alone, but re-entry forces it.

**Answered (operator, 2026-10-20; SPEC §2):** 1 — next-run re-entry for v0, yes; and same-run
re-entry is wanted, not merely held: "Intra run re-entries seem like a good way to keep people
playing if the dungeon is particularly difficult. Would need balancing to stop a high number of
entries in order to overwhelm bosses." So, after the three rules: a new signed wager, only before
the boss wakes, capped per run, the boss scaled to the head-count at the seal; the cheap-death probe
goes into the treadmill sim first. 2 — the unwagered run is in. 3 — a global pool with a delay
("seems logical to me"); the delay comes from the delayed-raffle sim.

**Added 2026-10-22:** the dead stay in the run's chat as ghosts — yes. **The unwagered run is
reversed:** "allowing a user to enter one of our dungeons without risking anything is a bad idea."
Instead, a short tutorial on first login and a training ground that can be revisited — a preset
dungeon with practice dummies that fire slow projectiles, have infinite health, stand still or move
on a set path, the practice range a game is expected to have; nothing there is wagered, won or
counted, and practice never shares a shard with wagered players. On the same-run cap the operator is
unsure of a count and floated keyed entry — a dungeon needs a key (an item or a set of items) to
enter, as many entries as keys held, the key a possible revenue line. Recorded in SPEC §4 as a
proposal to weigh and simulate (a key is a second per-run price on top of the kit; it limits entries
by wealth, not by count), not a decision.

## Could not verify (from `docs/reentry-chat-trade-web-notes.md`)

Any RotMG chat or trade gate by rank; Tarkov specifics beyond Wikipedia and one patch report;
batched mint-and-equip gas (inferred about $0.03, not measured); whether a live ghost camera
harms a co-op shard. All design rules are inference from the spec, the red team and the chain
notes; none is simulated.
