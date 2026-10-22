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

## E1 — result (2026-10-22)

*`sim/run_length.py`, pre-registered (docstring hash `e6e7df195808`) before any run: 80 runs × 10,000
days, seeds 0–4, `s` = ⅓, incomes held at the v1 calibration in every cell; byte-reproducible; with
nothing switched on the patched model is `economy2` bit for bit. SPEC §5 has the row. `p_run` stands
for run length at the same play time a day — 0.25 is a dungeon twice the slice's length, 0.125 four
times — so "a day" below means "an hour of play".*

**In plain words.** A dungeon twice as long, with each run no deadlier than today's, does not break
the economy — it makes it half the size. Every hour of play then holds half the runs, half the
deaths, half the mints and half the token burned; each run looks exactly like today's. Minting is
not dying. The guess in item 6 above — "the same arithmetic as `d0` 0.05" — was wrong: `d0` 0.05
cuts deaths but not boss drops, while fewer runs cut both together, so the balance between them
holds. What shrinks is the sink: at twice the length the mint burn sits exactly on the
pre-registered floor (half of today's, held by half a token on the worst seed), and at four times
it falls through. Players do not spend the money they save by running less — in this model budgets
have slack, and the poor are kept out by the size of their wallet, not by how often they run — so
nothing rises to fill the gap.

Making each run deadlier in step with its length (the band restated per hour of play) more than
restores the sink. Deaths per hour stay where they are today, but boss drops are paid per run, so
fewer runs mean fewer free items and about twice as many mints: mint burn doubles. The price is felt
inside the run: 13 % of runs end in death at twice the length and 27 % at four times (18 % and 36 %
for the least skilled third), with 4.5–6.4 % fewer runs played. Fewer drops also means fewer tier-2
and tier-3 items in the world.

Wear per stage (gear wears in proportion to the length of the run) puts repair burn back to where it
is today for about 1 % of runs. It moves repair burn and nothing else, so it cannot rescue minting.

**What E1 says about the choice (decision 2 above; the operator's to make, SPEC §4).** Both
options keep the economy alive. The band per run keeps runs as safe as today and accepts half the
burn per hour at twice the length — on the edge of the pass mark — and fails at four times. The band
per hour keeps the burn (it doubles it) and makes every run deadlier. "More at the door, more at the
end" — a dearer entry and richer drops per run, size as a tier — was **not in E1's grid**. The
band-per-hour overshoot suggests a longer, deadlier dungeon has room for more boss drops per run than
today without inflating; that is inference, not a run.

**Hypotheses, as registered.** The null check (band per hour plus wear per stage changes nothing)
**fails**: deaths per hour are unchanged, everything else moves — mints +98 % / +142 %, boss drops
−58 % / −84 %, value destroyed −24.5 % / −35.5 %, burn +34 % / +38 % — because the drop table is per
run. Twice the length at today's danger "fails like `d0` 0.05" **fails**: minting is alive
(days with a mint 0.56–0.61 on every seed, 0.74–0.81 on windows matched to today's exposure). Unchanged
wear halving repair burn **holds** (0.50×). **E4** (600 delvers running half as often against 300
running at today's rate) — **the same economy within seed noise** in runs (90.8 / 88.4 a day), mints
(1.45 / 1.49), burn (389 / 385) and the tier-1 price: in this model half the runs per head is half the
heads. My predictions of a wealth effect (fewer runs per head, fewer priced out) and of E4 differing
were both wrong.

Means over seeds 0–4, the seed range in brackets where it matters; every cell's ranges are in
`sim/out/run_length.log`, section (B). "Verdict" is `economy2`'s (days with a mint ≥ 0.5 and supply
flat on every seed; ROBUST at ≥ 0.9); "sink" holds when mint burn is at least half of today's
(≥ 170 token a day) on every seed; pass needs both. Priced out is 39–44 % and tier 1 trades at
210–211 of its 220 mint-equivalent in every cell.

| Length | Danger per run (`d0`) | Wear per run | Runs a day | Deaths per run | Mints a day | Mint burn a day | Repair burn a day | Total burn a day | Days with a mint | Verdict, sink | Pass |
|---|---|---|---|---|---|---|---|---|---|---|---|
| today (`p_run` 0.5) | 0.10 | 0.08 | 182 [179–188] | 6.5 % | 2.84 [2.68–2.93] | 341 [321–351] | 374 | 773 | 0.75 [0.73–0.76] | viable, holds | **yes** |
| today | 0.10 | 0.16 | 178 | 6.5 % | 2.80 | 336 | 873 | 1,266 | 0.75 | viable, holds | **yes** |
| today | 0.10 | 0.32 | 172 | 6.5 % | 2.87 | 345 | 1,496 | 1,896 | 0.77 | viable, holds | **yes** |
| 2× (`p_run` 0.25) | 0.10, band per run | 0.08 | 91 [89–94] | 6.5 % | 1.45 | 174 [171–176] | 185 | 389 | 0.59 [0.56–0.61] | no (one seed's supply +1.06 %/yr), holds | no |
| 2× | 0.10, band per run | 0.16, per stage | 90 | 6.5 % | 1.45 | 174 [171–176] | 439 | 642 | 0.59 | viable, holds | **yes** |
| 2× | 0.10, band per run | 0.32 | 89 | 6.5 % | 1.45 | 175 [172–177] | 778 | 982 | 0.60 | viable, holds | **yes** |
| 2× | 0.20, band per hour | 0.08 | 87 | 13.4 % | 5.65 | 679 [669–687] | 111 | 821 | 0.98 | ROBUST, holds | **yes** |
| 2× | 0.20, band per hour | 0.16, per stage | 86 | 13.4 % | 5.61 | 674 | 330 | 1,035 | 0.98 | ROBUST, holds | **yes** |
| 2× | 0.20, band per hour | 0.32 | 85 | 13.4 % | 5.58 | 670 | 635 | 1,336 | 0.98 | ROBUST, holds | **yes** |
| 4× (`p_run` 0.125) | 0.10, band per run | 0.08 | 45 | 6.5 % | 0.73 | 88 [86–90] | 92 | 195 | 0.42 [0.41–0.44] | no, fails | no |
| 4× | 0.10, band per run | 0.16 | 45 | 6.5 % | 0.73 | 87 | 220 | 322 | 0.42 | no, fails | no |
| 4× | 0.10, band per run | 0.32, per stage | 45 | 6.5 % | 0.72 | 86 | 392 | 493 | 0.42 | no, fails | no |
| 4× | 0.40, band per hour | 0.08 | 42 | 27.2 % | 6.91 | 834 [815–861] | 18 | 869 | 1.00 | ROBUST, holds | **yes** |
| 4× | 0.40, band per hour | 0.16 | 42 | 27.2 % | 6.89 | 831 | 91 | 939 | 1.00 | ROBUST, holds | **yes** |
| 4× | 0.40, band per hour | 0.32, per stage | 42 | 27.2 % | 6.88 | 831 | 218 | 1,065 | 1.00 | ROBUST, holds | **yes** |
| E4: 300 delvers, today's rate | 0.10 | 0.08 | 88 [85–92] | 6.6 % | 1.49 [1.40–1.61] | 179 [168–193] | 179 | 385 | 0.61 | viable, fails (worst seed 168) | no |

**Not run:** E2 (chosen risk) and E3 (the operator's repair fee with wear per hour halved). **Not
verified:** that players keep their hours of play when runs lengthen; real budgets (with the model's
slack, how often a delver runs prices nobody out); a drop table per dungeon; whether 13–27 % of runs
ending in death is fun. Reproduce: `.venv/bin/python sim/run_length.py` (`--repro`, `--report`).

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
