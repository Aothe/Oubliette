# Bigger dungeons, and more to do inside them: puzzles, mazes, interactables

*Synthesis of the sourced research in `docs/dungeons-web-notes.md` (a URL per fact) and the
sizing sketch in `docs/dungeons-layouts.txt`, against SPEC §2, §3.4, §7 and `docs/red-team.md`.
Written 2026-10-05 as a proposal; the operator's decisions on it (2026-10-20) are at the end and
in SPEC §2. It overturns two of the author's first-pass positions (mazes and two-player plates).*

## The short version

1. **Make size a tier, not a default. v0 stays six rooms in a line.** The operator could not
   beat it in two or three runs and called that good, and RotMG's hardest dungeon (Oryx's
   Sanctuary) is the same shape with gates: three gated rooms, a miniboss, a corridor, the boss.
   The one thing v0 should add is the sealed boss door with a ready plate, which the red team
   already requires (rule 10). That is a rule, not content.
2. **"Bigger" means a short branching room graph, not a maze and not an open floor.** Ten to
   twelve rooms, one loop so a party can split and rejoin, dead ends one room deep. That is the
   Isaac / Gungeon / Hades / Dead Cells shape. RotMG's 50-player mazes (Lost Halls, 64–81
   rooms) only work because anyone can teleport to anyone, and even then its own wiki says
   "very easy to get lost" and runs need 20–30 people on Discord. This game has no teleport
   and a lantern each, so it starts where Lost Halls ends.
3. **Dungeon two, concretely:** hall → two fights → a loop of three rooms with the far side in
   the dark → a miniboss → the sealed door → the boss; off the loop, an optional miniboss that
   drops a key and a locked treasure room the key opens. Eleven rooms, about 192×90 tiles,
   roughly twice the slice, five to seven minutes for a party. Measure, do not assume.
4. **Three interactables earn their place:** a key and a locked treasure room (the key is a
   carried item — lost on death, left behind on recall — so the treasure is only ever paid for
   by someone who went through the seal); a dark branch where the lantern is the only light and
   the loot is a tier better (Darkest Dungeon measured this trade: loot odds rise as light
   falls); and the ready plate at the boss door. **Skip two-player plates, levers that shut
   things, and traps:** in a game where strangers profit from your death they are griefing
   tools, and traps land on the weakest, who already carry 40 % of deaths. Chosen risk is the
   one lever that getting good does not erode.
5. **Determinism costs nothing here.** Every interactable is tick-state plus an "interact"
   input in the log, ties broken by player index, timers in ticks. The choice is design, not
   engineering.
6. **A longer run is an economy change, not a content change.** The sims count in runs: wear,
   death and minting happen per run. Halve the runs a day at the same per-run danger and you
   halve deaths and mints a day — the same arithmetic as `d0` 0.05, which the treadmill sweep
   showed kills minting. Either per-run danger rises with length, or the band is restated as
   value destroyed *per hour of play* and wear moves to per stage. This has to be measured in
   `sim/economy2.py` before dungeon two is built; the four experiments are written below.
7. **Split the seeds.** The layout seed can be public — even a shared daily layout, Spelunky's
   trick, later a market event — while loot rolls stay under the committed server secret (red
   team D1). The slice already draws the map from the RNG first, so it is a one-line change.
8. **Readability is cheap and decisive:** a minimap built from the map and a seen-rooms flag, a
   progress count ("3 of 5 halls broken"), a torch colour per branch, the miniboss as a marker
   once found. Lost Halls added exactly these signposts to cope with its maze.

## Sizing (a scratch ruler, `docs/dungeons-layouts.txt`)

| Shape | Rooms | Path (tiles) | Walking | On the spine | Everything |
|---|---|---|---|---|---|
| the slice today | 6 (hall, 4 fights, boss) | ~190 | ~50 s | ~4.3 min | ~4.3 min |
| dungeon two (the graph above) | 11 | ~310 | ~75 s | ~5.3 min | ~7.8 min |
| a big one | 16 | ~470 | ~2 min | ~6.9 min | ~11.3 min |

Walking at the slice's 4 tiles a second; 28 s a fight room and 100 s for the boss at the
slice's pace with scripted allies; a person is slower. Twenty seeds averaged.

## What the reference games showed (details and URLs in `docs/dungeons-web-notes.md`)

- **RotMG:** Pirate Cave's solo record is one second — no gate between door and boss. Lost
  Halls is a procedural grid and the thing players rush; the Shatters and Oryx's Sanctuary are
  handmade and the thing the developer brags about. The Shatters is also the catalogue of
  RotMG's non-combat verbs — an eight-switch hunt with a reveal at seven, an escort with
  contesting, a lights-out puzzle, a count gate, a sealed arena, a hidden wall — and it drew a
  "slowdown update" after length complaints. Most dungeons cap at 50 players.
- **Room-graph roguelikes:** Isaac (seven or eight rooms, no loops, special rooms at dead
  ends), Gungeon (hand-authored flow graphs and about 300 prefabs, chests at loop ends, a
  secret room on 90 % of floors), Dead Cells (hand-made tiles on a per-biome concept graph,
  timed doors), Hades (hand-made rooms in random order).
- **Open floors:** Diablo 1's 40×40 floors and "wide openings instead of doors" — fine for one
  player, a crowd's nightmare.

## Interactables, judged

| Interactable | Cost under SPEC §3.4 | What it does | Verdict |
|---|---|---|---|
| key + locked treasure room | low | a carried key, lost on death and left on recall; treasure paid for through the seal only; the key could later be a consumable merchants stock | **dungeon two** |
| the dark branch | low | the lantern's own mechanic; better loot for less light; enemies wake from further | **dungeon two** |
| sealed boss door + ready plate | low | red team rule 10; whoever is not on the plate is recalled with wager and no loot; the boss scales to who is inside | **v0** |
| optional miniboss (drops the key) | medium: one more pattern set | chosen risk, a reason to split the party, budgeted loot | **dungeon two** |
| minimap, progress count, branch colours | rendering only | readability; Lost Halls' lesson | **dungeon two** |
| two-player pressure plates | low | a hostage mechanic among strangers | skip |
| levers that shut things, timed doors | low | one player can lock twenty out; timed doors only after the hard run length exists | later, if ever |
| traps | low | hit the weakest, who already carry the deaths | skip |
| switch hunts, lights-out puzzles, escorts | medium | the Shatters' verbs; good as prefab rooms once there is a player base | later |
| breakable walls, secret rooms | low | pure fun; Gungeon's 90 % rule is a fine default; any gear inside draws on the fresh-drop budget | later |
| shrines and altars with prizes | low | lottery-shaped — counsel first; buff-for-fame is safe | later |
| the lantern that burns down (a run clock) | medium | the hard run length made visible | to test in the slice; the dark branch is the cheaper first step |

The art bank already has the props: door, portcullis, chest, altar, cage, spikes, brazier,
torch, barrel, crate, bookshelf, sarcophagus, cobweb, banner, pillar; five tilesets (the Gaol,
the Cistern, the Ossuary, the Foundry, the Overgrowth).

## What to measure before building (pre-registered, in the `treadmill.py` style)

- **E1, run length.** `p_run` ∈ {0.5, 0.25, 0.125} × per-run danger ∈ {unchanged,
  exposure-neutral (`d0` × 0.5/`p_run`)} × wear per run ∈ {0.08, 0.16, 0.32}; `s` = ⅓; five
  seeds; 10,000 days. Report minting alive, supply slope, burn split by mint / repair / fee,
  runs a day, priced-out, the tier-1 price, and value destroyed per value wagered. Written-down
  hypotheses: exposure-neutral danger with scaled wear changes nothing (a null check); `p_run`
  0.25 with unchanged danger fails like `d0` 0.05; unchanged wear halves repair burn.
- **E2, chosen risk.** A fraction of runners take a side room with extra death chance and one
  extra fresh roll. Does chosen risk restore minting at `d0` 0.08 and 0.06, where mastery
  killed it, and at what cost in fresh drops under the budget?
- **E3, the operator's line.** `sim/operator_fee.py` with wear per hour halved.
- **E4, cross-check.** Half the runs per head is not half the heads: `p_run` 0.25 at 600
  delvers against `p_run` 0.5 at 300.

## Prototype order in `proto/visual/index.html`

1. `genMap`: rooms get `links`; corridors carved per link, not per index; room flags for
   `dark`, `boss`, `locked`. About a day.
2. A door tile value; the sealed boss door; the ready plate as a floor region with a tick timer.
3. The key as a carried item (the slice's slot-3 key exists); the locked door checks `carried`.
4. The dark room: no torches, light radius × ⅔, enemy wake range × 1.5.
5. Minimap and progress count in the HUD.
6. **Measure:** 60 seeded runs with the ally bots — deaths, run length, how often the key
   room and the treasure room are taken, deaths in the dark versus out of it. Those numbers
   feed E1 and E2.

## Bins

- **v0:** six rooms in a line, plus the sealed door and ready plate.
- **Dungeon two:** the eleven-room graph; key and locked room; the dark branch; the optional
  miniboss; the readability kit; split seeds. Only after E1 says how the band and wear change.
- **Later:** mazes (probably never), switch hunts, puzzles as prefab rooms, breakable walls,
  timed doors, dungeon modifiers, a daily shared layout seed as a market event, a hidden
  hard-mode route, wear per stage in the contract if E1 shows per-run wear is the problem.

## Decisions this asks of the operator

1. "Bigger" is dungeon two, not v0 — agree?
2. Dungeon two asks for more at the door and pays more (size as a tier) — or the band is
   restated per hour of play? (E1 decides which is cheaper; the operator decides which is
   wanted.)
3. Two-player plates and traps out, chosen risk (the dark branch, the optional miniboss) in —
   agree?
4. The sealed boss door with a ready plate into v0 now — agree?

**Answered (operator, 2026-10-20; SPEC §2):** 1 yes — "bigger" is dungeon two; v0 stays six rooms in
a line. 2 open — E1 runs first and says which is cheaper; the choice between "more at the door, more
at the end" and a band per hour of play is then the operator's (SPEC §4). 3 yes — plates and traps
out, chosen risk in. 4 yes — the sealed boss door with a ready plate goes into v0 now.

## Could not verify (from `docs/dungeons-web-notes.md`)

Typical, not record, RotMG run lengths; Hades' chamber counts; RotMG's generator itself (no
code or official document found); maze-tedium essays were blocked, so behavioural evidence was
used instead; several fandom pages were read via search summaries only.
