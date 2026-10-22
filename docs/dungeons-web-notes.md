# Research: bigger dungeons, and more to do inside them

*Raw research note, 2026-10-05. One of three parallel research threads (hub, re-entry, dungeons).
Committed 2026-10-22 as the sources behind `docs/dungeons.md`. Every fact carries its URL; my
own reasoning is labelled "inference".
Nothing here is a decision; `SPEC.md` stays the source of truth. Wiki pages are flagged as wikis.
RealmEye pages were read with curl (the fetch tool returned them empty); fandom pages were blocked,
so wiki.gg mirrors are cited instead. Speedrun times come from speedrun.com's public API, not a
page.*

## Verdict (ten lines)

1. The reference games split cleanly. Realm of the Mad God's beginner dungeon is a handful of
   rooms a solo player clears in seconds; its endgame is either a procedural maze (Lost Halls,
   64–81 rooms, "very easy to get lost", needs 20–30 people and a Discord) or fully handmade acts
   (Shatters, Oryx's Sanctuary). The handmade ones are what the developer brags about; the maze
   is what players rush through.
2. For 20 players in one instance, with no teleport-to-player and a sealed boss door, the shape
   that fits is a **short branching room graph** (Isaac / Gungeon / Hades / Dead Cells), 10–12
   rooms, one loop, dead ends one room deep. Not a maze, not an open floor. RotMG's 50-player
   dungeons only work as mazes because players teleport to each other; Lost Halls disables that
   and adds signposts to cope.
3. **Dungeon two**: hall → two fights → a loop of three rooms (one side dark) → a pre-boss
   miniboss room → the sealed boss. Off the loop, two one-room dead ends: an optional miniboss
   that drops a key, and a locked treasure room the key opens. About twice the slice.
4. Three interactables earn their place: (a) **key and locked treasure room** — the key is a
   carried item, lost on death and left behind on recall, so treasure is only ever paid for by
   someone who went through the seal; (b) **a dark branch** where the lantern is the only light
   and the loot is better (Darkest Dungeon's trade, measured); (c) **the ready plate at the boss
   door**, which the red team already requires (C2). Skip two-player pressure plates, levers that
   shut things, and traps: in a game where strangers profit from your death they are griefing
   tools.
5. Determinism costs nothing here. Every interactable is tick-state plus an "interact" input in
   the log, with ties broken by player index. The choice is design, not engineering.
6. A longer run means fewer runs a day. In the sims a run is the unit of death, wear and mint, so
   halving runs a day with the same per-run death chance is the same arithmetic as `d0` 0.05,
   which the treadmill sweep showed kills minting. Either per-run danger rises with length
   (exposure-neutral) or the band moves to deaths per hour and value destroyed, and wear moves to
   per room, or repair burn and the operator's repair line halve too.
7. Measure it in `sim/economy2.py` before building: `p_run` × `d0` × wear-per-run grid,
   exposure-neutral and not; plus an optional-room experiment. Spelled out in §4. Not run here.
8. Prototype order in `proto/visual/index.html`: a room graph in `genMap` with corridors by link
   (a day); a door tile value and a sealed boss door with the ready plate; the key as a carried
   item and a locked door; a dark branch (skip torches, drop the light radius); a minimap with a
   progress count and a torch colour per branch. Then 60 seeded bot runs for deaths and length.
9. v0 stays six rooms in a line. The operator could not beat it in 2–3 runs and called that good;
   the only addition v0 needs is the sealed door, which is a rule, not content.
10. Not verified: typical (not record) run lengths in RotMG; Hades' chamber counts; RotMG's
    generator itself. Full list at the end.

## 1. What the reference games do

### 1.1 Realm of the Mad God

**The general shape (wiki).** "Dungeons consist of a network of rooms (in some cases a single
room) containing various monsters based on the theme of the dungeon. The last room will contain
one or more boss enemies, which may drop special items. Many dungeons also have one or more
'treasure rooms' containing minibosses that drop unique loot."
— RealmEye wiki, Dungeons: https://www.realmeye.com/wiki/dungeons

**Player caps (wiki).** "Most dungeons have a player limit of 50 players." Exceptions: 25
(Alien Wormholes, Court of Oryx, Tavern, Spectral Penitentiary), 20 (White Snake Invasion III),
15 (Heroic dungeons, Hidden Interregnum), 85 (Stromwell's Rift, Oryx's Castle areas, "equal to
the Realm player limit"). "Prior to Patch X.32.7.0 (Feb 2020), most dungeons had a loosely
enforced player limit of 85 players." "All portals stay open for 30 seconds before vanishing."
Difficulty is rated 0–10 and "a non-seasonal dungeon has difficulty 7 or higher if and only if it
is an Exaltation dungeon." — same page. The realm cap of 85 is on the realm guide: "the maximum
amount of 85" — https://www.realmeye.com/wiki/general-realm-guide (wiki). This settles SPEC §5's
"from memory" row on the realm cap: 85, and most dungeons 50 since Feb 2020.

**How 50 people navigate a big map (wiki).** "In most areas, it is possible to teleport to other
players on the same map. However, teleporting is disabled in the Nexus and certain dungeons
(mainly lategame and endgame dungeons)." Ten-second cooldown after a teleport. You can "click on a
yellow dot representing a player" on the minimap and teleport to it.
— https://www.realmeye.com/wiki/teleportation. Lost Halls and Oryx's Sanctuary both carry the
tag "Teleportation Disabled" on their pages (below). *Inference:* this is the single most
important RotMG fact for this question. RotMG's crowd stays together in a maze because anyone
can warp to anyone; the endgame dungeons take that away and have to add navigation aids instead
(a fixed room count to the boss, minimap reveals, a miniboss that becomes a quest marker). This
game has no teleport, so it starts where Lost Halls ends up.

**Pirate Cave — the beginner dungeon (wiki).** "The Pirate Cave is a very low-level dungeon
designed for beginning (level 1+) characters. The enemies and boss all have low health and damage
output for this purpose." "Added in Build 74 (Feb 2010), the Pirate Cave is one of the first two
dungeons that were made." — https://www.realmeye.com/wiki/pirate-cave. Layout, from the guide:
"The Pirate Cave contains several shipwrecked ships and islands with interconnecting platforms,
each full of pirates and pirate companions. Clearing these rooms will grant low-level characters
a chance to find gear and gain EXP before moving to the boss area, a large ship." "Due to the
nature of the dungeon, it is easy to skip many of the platforms by simply wading towards the
boss through the water." — https://www.realmeye.com/wiki/pirate-cave-guide (wiki). Record times
(speedrun.com API, `/levels/{id}/records`): solo 1.1 s (2021-01-01,
https://www.speedrun.com/rotmg/runs/ylv2gg2m), group 179 s (2020-09-19,
https://www.speedrun.com/rotmg/runs/zn34kq7y). *Inference:* a beginner dungeon whose record is
one second is a dungeon with no gate between entrance and boss. The slice's six rooms in a line
with the boss at the end is already stricter than this.

**Lost Halls — the procedural maze (wiki).** "The Lost Halls is composed of a large 8x8, 8x9,
9x8, or 9x9 procedurally generated 'grid' of square rooms with hallways connecting them. Enemies
are found in these rooms, with each room containing one Group Leader commanding their respective
group. The rooms tend to look similar, but can have randomly-generated gimmicks found in them."
Gimmicks listed: water, ice, corruption tiles; "Destructible walls found in various formations.
Each wall has 12,000 HP"; invincible pillars and eyes that apply status effects; "Arrow shooters
in the walls that fire 150-damage arrows"; "Bomb traps in the floor". "The dungeon is fairly big
and the boss doesn't have a Quest marker until found, making it hard to navigate." Starting room:
"players will have to stand close to these Pillars to drop their invulnerability and kill them,
opening up the corresponding path in the wall." Dead ends: "Exactly five of the seven dead ends
have a multitude of Treasure Pots ... one of them will have a passive pink flame that will
teleport itself to the Treasure Room boss. These flames are essential for accessing the secret
area of the dungeon. Additionally, after a Flame is found, it becomes visible on the minimap,
thereby revealing the location of the Treasure Room." "One of the dead ends will be a Treasure
Room ... completely empty except for the Treasure Room Boss, the Agonized Titan, in the middle
and a locked portal to the Cultist Hideout. This room can only be entered from below." Pre-boss:
"The last dead end, just before the boss room, is a relatively empty room, containing only the
Marble Defender. Once found, it will become each player's Quest, making it easier to find for
players that have split up." Boss room: "the entrance seals off after the boss is activated".
— https://www.realmeye.com/wiki/lost-halls

From the guide (wiki): "The dungeon is a massive maze consisting of a huge number of nearly
identical square rooms linked via corridors. The boss is not marked and must be found manually,
making it very easy to get lost, staying true to the dungeon's name." "There are always 10 rooms
between spawn and the Marble Colossus, with the Marble Defender being the 10th room. Also, if you
find a loop of rooms, it means you're on the path to the main boss." "The boss room and the
Marble Defender occupy a grid of 3x3 rooms." "nearly every successful Lost Halls run is completed
in organized groups using Discord"; "It is highly recommended to have a decently sized group
(about 20-30 max) ... too many people will make the HP Scaling extremely difficult to deal with."
The sub-area key: "The Vial is a guaranteed drop to one random person that qualified for SB, and
is required to unlock the final area of the Halls." "Rogue is one of the best rushers in case
one wants to quickly locate the boss or treasure rooms."
— https://www.realmeye.com/wiki/lost-halls-guide. Records: Lost Halls to the Colossus, solo
5.2 min (2020-08-22, https://www.speedrun.com/rotmg/runs/zgw05vdy); with the Cultist Hideout
9.6 min (2020-07-15, https://www.speedrun.com/rotmg/runs/yv6k8vez).

*Inference:* Lost Halls is the maze done as well as a maze can be done, and the wiki's own words
for it are "hard to navigate", "very easy to get lost", "organized groups using Discord". Every
one of its fixes is a signpost: a fixed room count, loops as a tell, flames on the minimap, a
miniboss that becomes a marker, dead ends that always pay. The game stays alive because 20–30
people with voice chat split up and rush. That is the opposite of a shard of strangers.

**The Shatters — the handmade acts (wiki + developer).** Developer: "the fully handmade
structure of the dungeon is quite unique for Realm"; "The dungeon is still split into three acts
with a boss for each"; act I: "you'll first need to find and destroy eight Derelict Monuments";
act II: "Your main goal in the castle is to power on the generators and awaken the Twilight
Archmage"; act III: "you must destroy the five Tablets of the Monarchy"; why: "Given the
polarizing, love-it-or-hate-it nature of the original Shatters, we've strived to keep the spirit
of the dungeon familiar while still massively expanding on its potential."
— Deca, Update 2.0.2 (Aug 2021): https://remaster.realmofthemadgod.com/?p=2156

Wiki detail: "The Derelict Village follows one of many preset layouts"; "Players must seek out
and destroy 8 switches scattered at random locations throughout the islands. When 7 of the 8 are
destroyed, the last one will become highlighted on the minimap as a bright purple dot. Once all
eight are destroyed, the drawbridge at the top of the area will be lowered ... all switches will
also turn into teleporters that can be used to instantly warp to the bridge." Castle: "the
Central Chamber, which then splits into four hallways leading to the four castle wings"; "Each
wing ... has a total of 7 Magi Conductors scattered within (marked as white dots on the minimap)
along with a Source Generator at the end"; players "escort the Untempered Magic through the
castle wings"; "Accursed enemies can 'contest' the conductors by standing close to them". The
Observatory: "a puzzle consisting of 9 small towers arranged in a grid; the towers are either red
or green ... Shooting one of the towers enough will switch its color along with the color of all
the adjacent towers. ... Solving the puzzle by successfully making every single tower green will
unlock the barrier" ("a simple lights out puzzle", Trivia). The Treasury: four rooms where
"Standing on the piles of loose treasure will slow players". The Grand Hall: "the entrance will
close after the first objective has been damaged; players must destroy 5 Tablets of the
Monarchy that will appear one by one in randomized locations". Hard mode (Mar 2022): "a secret
'Hard Mode' was added ... requires players to undertake a series of hidden tasks"; "a hidden wall
behind one of the posters will reveal a secret room". Length: "In Exalt Version 2.3.0.0 (Mar
2022), the Shatters got a slowdown update attempting to resolve many players' complaints about
the length of the dungeon." Portal: "originally stayed open for 70 seconds, but this was changed
to 30 seconds".
— https://www.realmeye.com/wiki/the-shatters. Records: group 4.2 min (2021-03-13, before the
rework, https://www.speedrun.com/rotmg/runs/z18v3kgy); solo 22.4 min (2022-02-23, after it,
https://www.speedrun.com/rotmg/runs/ywjwqknz).

*Inference:* the Shatters is the catalogue of RotMG's non-combat verbs: a scattered-switch hunt
with a reveal at 7 of 8, an escort with a contest mechanic, a lights-out puzzle, a count-down
gate, a sealed arena, a hidden wall. Note what it cost: a length complaint loud enough for a
"slowdown update", and a "love-it-or-hate-it" original. Every verb here is count-based or
shoot-based — nothing requires two players to stand on two things at once.

**Oryx's Sanctuary — the hardest, and linear (wiki).** "Oryx's Sanctuary is an endgame dungeon
designed to be the most challenging content in the game, surpassing even endgame dungeons such as
the Lost Halls and The Shatters." "The dungeon has a fixed layout consisting of four wings. All
players will spawn in one randomly chosen wing in each instance of the dungeon ... Players cannot
enter other wings and fight the other bosses aside from the one initially assigned." "Players
must completely clear three sequential rooms of enemies before confronting the 'miniboss' of the
wing. Each room has its own fixed formation of enemies, and the number of enemies in the three
rooms is consistent regardless of wing (6/12/16 for each room, respectively, for a total of 34
enemies). After the boss is defeated, players will traverse a long hallway with no enemies before
the final battle with Oryx 3. The exit to each room is initially blocked with a large spiked
gate. The gate will disappear and allow access to the next room once all enemies in the current
room are defeated." — https://www.realmeye.com/wiki/oryx-s-sanctuary. Records: group 4.7 min
with 11 players listed (2020-09-07, https://www.speedrun.com/rotmg/runs/yj6jd7gz); solo 7.9 min
(https://www.speedrun.com/rotmg/runs/zgvl59ez).

*Inference:* the game's hardest content is three gated rooms, a miniboss, a breather corridor and
the boss — the slice's shape, with gates. Variety comes from which wing you are dealt, not from
a maze. Difficulty and size are different axes.

**Dungeon Modifiers (wiki).** "Dungeon Modifiers are a system introduced in Exalt Version
2.0.1.0 (Aug 2021) ... designed to increase the replay value of dungeons by giving them a chance
to have modified rulesets upon spawning." Grades D–S carry 1–4 modifier slots; "All modifiers now
come with a reward boost". — https://www.realmeye.com/wiki/dungeon-modifiers. *Inference:* a
cheap "more to do" lever that touches no map: a ruleset roll per instance with a loot boost.
Not v0; noted for later.

**Rushing (wiki).** "running ahead through a dungeon while only occasionally or never bothering
to stop and clear the enemies in your path ... this comes with the heavy cost of putting your
character in extreme danger". — https://www.realmeye.com/wiki/rushing-dungeons. *Inference:*
rushing is what players do to a dungeon that is longer than it is interesting; it is also the
behaviour a death-rate economy wants, since it trades time for risk voluntarily.

**Run lengths.** No source gives typical lengths; only records (speedrun.com, above, all with
full pets, most solo): Pirate Cave 1 s, Undead Lair 27–36 s, Abyss 31–102 s, Lost Halls 5–10 min,
Shatters 4 (group, old) to 22 min (solo, new), Sanctuary 5–8 min, Tomb 10 min. *Inference:* a
normal clear is several times the record; the slice's 2–4 minutes (`docs/loop-design.md`) sits
with the mid-tier dungeons, and a "second dungeon" at 5–7 minutes would still be short of RotMG's
endgame.

### 1.2 Room-graph roguelikes: Isaac, Gungeon, Dead Cells, Hades, Spelunky, Brogue

**The Binding of Isaac (reverse-engineered by Boris the Brave).** Floors are a 9×8 grid; "The
number of rooms is determined by formula random(2) + 5 + level * 2.6" (7–8 rooms on floor one);
"It won't add a room which already has 2 neighbours" — no loops, "keeping the dungeon linear like
classic Zelda dungeons"; special rooms (boss, treasure, shop, sacrifice) go at dead ends furthest
from the start, the boss at "the last item from the end rooms list"; a secret room needs "an
empty cell that is next to at least three rooms, and not next to any end rooms"; "every room is
designed to always be accessible from a four directions".
— https://www.boristhebrave.com/2020/09/12/dungeon-generation-in-binding-of-isaac/
Room types and what they cost (wiki.gg): Treasure Room "From Basement 2 and on, this Room
requires a key to enter"; Shop requires a key; "Secret Rooms must be bombed into, and are usually
surrounded by 3 or 4 Rooms"; "Super Secret Rooms must be bombed into, and are only located next to
one other non-special Room"; Sacrifice Room: a chest "after Isaac damages himself on the spikes";
Curse Room: "spikes on the door that hurt Isaac when entering and exiting"; Challenge Room only
if health is full; Vault "require two keys"; Devil Room trades "health for items"; Arcade "require
one coin"; Library a key; Dice Room two keys.
— https://bindingofisaacrebirth.wiki.gg/wiki/Rooms

**Enter the Gungeon (reverse-engineered).** Generation starts from hand-authored "flow" graphs
("Each room includes metadata about what type of room it is, and what connections it should
have"); the Hollow has 4 flows, Gungeon Proper 8; nearly 300 room prefabs for the first stage;
room categories: normal, hub, boss, shop, treasure chest, secret, jail, connector; "secret rooms
usually spawn at dead ends, but have a 1/5 chance of being attached to any room. They have a 90%
chance of appearing"; "The majority of chests in the game either are at the end of a one way
loop, or deep enough into the level to force you to fight many rooms."
— https://www.boristhebrave.com/2019/07/28/dungeon-generation-in-enter-the-gungeon/
Chests (wiki.gg): "locked chests need a Key to be unlocked, while unlocked chests can be opened
for free. Chests found in treasure rooms are always locked"; "Upon entering a room with a chest,
there is a random chance that a fuse will appear by the chest. If the chest is not opened within
a short period of time, it will explode"; mimics rise with curse.
— https://enterthegungeon.wiki.gg/wiki/Chests. Secret rooms (wiki.gg): "Every chamber has a 90%
chance to generate with a secret room present"; shooting the wall cracks it; blanks open it;
"Secret rooms are often connected to chest rooms, shops, elevator exits, and in dead-end rooms."
— https://enterthegungeon.wiki.gg/wiki/Secret_Room

**Dead Cells (developer).** Six steps: "the overall world layout is fixed and designed by hand";
hand-made room tiles ("A room designed to host a hidden treasure won't be the same as another
hosting a merchant"); a concept graph per biome, "a set of instruction to the procedural
generation algorithm" describing "level length, special room counts, and labyrinth density";
rooms picked to satisfy the graph; monsters by constraints; loot last.
— https://deepnight.net/tutorial/the-level-design-of-dead-cells-a-hybrid-approach/
Timed doors (wiki.gg): "Time doors appear in transition levels ... and will not open if the
timer has passed a specific benchmark" — 2 min (Promenade, Sewers, Arboretum), 8 min (Ramparts,
Ossuary), 15 min, 26 min; each holds "money ... 20 cells, as well as a 3-choice item altar"; the
timer pauses in shops and treasure rooms; killstreak doors need 60 kills without damage; no-hit
doors need a damageless boss. — https://deadcells.wiki.gg/wiki/Timed_door

**Hades.** "The player starts a run by fighting through several rooms drawn from a pool of
pre-determined layouts, with the order they appear in and the enemies that appear being
randomized"; four regions; "After clearing a certain number of rooms in a region, the player
must fight the bosses of the region". — https://en.wikipedia.org/wiki/Hades_(video_game).
Level designer Ed Gorinstein: "Each biome had a set of design principles to guide its design";
Tartarus has "medium-sized chambers that are almost always completely walled in"; "smaller
chambers tend to appear early on in biomes, and larger chambers appear later so that they are
reflective of the escalating encounters."
— https://kotaku.com/hades-level-design-is-less-random-than-it-seems-1845254545

**Spelunky (Derek Yu's generator, explained by Darius Kazemi).** "16 rooms in a 4x4 grid"; a
guaranteed solution path ("On a 1 or 2, the solution path moves left. On a 3 or 4, the solution
path moves right. On a 5, the path goes down"); four room templates by guaranteed exits; off-path
rooms are filler. — https://tinysubversions.com/spelunkyGen/. Dark levels: "I can't see a
thing! I'd better use these flares!"; "the terrain will be in total darkness except within a
certain distance of light sources"; a Box of Flares spawns at the entrance; never on the first or
last level of an area. — https://spelunky.fandom.com/wiki/Level_Feeling_(Classic) (wiki, via
search summary; page blocked). Daily challenge: one seed for everyone for 24 h; "special
'designer caves' are not planned". — https://spelunky.fandom.com/wiki/Daily_Challenge_Mode_(HD)
(wiki, via search summary).

**Brogue (wiki, documenting Brian Walker's generator).** Rooms: "600 attempts (or until we have
99 rooms) to build off of currently existing rooms ... 80% try to make a corridor with a room at
the end 20% try to make a new room." Loops: "500 attempts are made or until we have 30 loops",
joining rooms "further than 2 rooms apart via shortest path". Bridges: "Because this is done after
making the level all connected otherwise, burning down bridges will never strand you." Vaults:
"Treasure machines are generated at depths 3, 7, 11, 15, 19 and 23" as "two components" — a
reward room and a key-holder challenge. Secret doors by depth.
— https://brogue.wiki/wiki/Level_generation

### 1.3 Open floors: Diablo 1 (reverse-engineered)

Every level is a 40×40 tile grid. Cathedral: rooms and corridors, "Dividing walls always run
straight along an axis"; Catacombs: recursive subdivision with "wide openings instead of doors"
to raise encounter rate; Caves: a 2×2 seed grown by blocks, "every tile on the edge has a 50% of
being floor", eroded, at least 600 floor tiles; Hell: a 20×20 quarter mirrored both ways. Common:
pre-authored "set pieces" for quests, 3×3 "minisets", "theme rooms" found by floodfill.
— https://boristhebrave.com/2019/07/14/dungeon-generation-in-diablo-1

### 1.4 Which shape fits a ~20-player co-op bullet-hell

*Inference, from the above.*

| Shape | Precedent | For 20 strangers, no teleport, one lantern each |
|---|---|---|
| Line of gated rooms | Oryx's Sanctuary; the slice | Works now. Nothing to find; variety has to come from the deal (which wing) and the rooms' contents. |
| Short branching graph, one loop | Isaac (7–8 rooms, no loops), Gungeon (loops, chests at loop ends), Hades (fixed count per region) | **Best fit.** The party can split and rejoin on a loop; a dead end one room deep is never "lost"; the boss is at the far end behind a door. |
| Maze (grid of look-alike rooms) | Lost Halls | Needs teleport or voice chat; its own wiki calls it hard to navigate; players rush it. Also the worst case for a light-as-view class: everything looks the same in the dark. |
| Open floor / cave | Diablo caves and catacombs | Bullets from off-screen and nothing to break line of sight; the lantern shows a disc of a featureless field. Bad for readability of a bullet-hell. |
| Hunt-the-N-things across a field | Shatters village (8 switches) | Scales to 50 because the minimap marks them; drew length complaints; one player can finish it for everyone. Later, if ever. |

A graph of 10–12 rooms with one loop keeps the whole party within two rooms of each other and
keeps "where is everyone" answerable from the minimap; it is what every single-player roguelike
above converged on and what RotMG's hardest dungeon is a degenerate case of.

## 2. Procedural generation that scales

**Four methods, what they buy (sources in §1):**

- *Room graph* (Isaac, Gungeon, Dead Cells, Hades): the designer writes the graph (Gungeon's
  flows, Dead Cells' concept graph: "level length, special room counts, and labyrinth density"),
  the seed picks rooms and places them. Readable by construction: the graph *is* the pacing.
- *Maze / grid* (Lost Halls, Spelunky's 4×4): uniform cells, a guaranteed path, filler off it.
  Cheap to generate, expensive to navigate; Spelunky survives because a level is 16 cells and you
  fall downward; Lost Halls needs 10-rooms-to-boss and minimap reveals.
- *Cave* (Diablo caves, Brogue lakes): organic, good for atmosphere, bad for a bullet-hell's
  sight lines; Brogue uses caves as ornament inside a room graph, not as the graph.
- *Hand-authored prefabs / vaults* (Gungeon's ~300 rooms, Dead Cells tiles, Diablo set pieces,
  Brogue machines, Shatters' "one of many preset layouts"): this is where "more to do" lives —
  a puzzle, a treasure room, a trap corridor is a prefab with a rule attached. RotMG's
  developer-praised dungeon is "fully handmade".

**What keeps a bigger dungeon readable.** Wayfinding research borrows Kevin Lynch's five elements
— paths, edges, districts, nodes, landmarks — and finds game players use the same ones
("landmarks are memorable locations that help orient navigation, regions are distinct areas ...
nodes mark points where wayfinding decisions are made").
— https://cs.wellesley.edu/~pmwh/mvmap/papers/open_world_elements/open_world_elements.html
The games above implement them as: a minimap that reveals (Lost Halls' flame, the Shatters' 7-of-8
switch, its conductors as "white dots"); a counted objective ("tracked by a unique UI"); loops as
a tell ("if you find a loop of rooms, it means you're on the path"); a fixed distance to the boss
("always 10 rooms"); a marker that appears once a miniboss is found; distinct districts (the
Shatters' three acts, Sanctuary's colour-coded wings, Hades' biome rules). Light is a reveal too:
Darkest Dungeon's scouting rises with light (§3) and Spelunky's dark levels hand you flares.

**Mazes: fun versus tedious.** The evidence is behavioural rather than a design essay (the one
essay found was blocked, see "could not verify"): Lost Halls' own wiki says "very easy to get
lost" and that runs happen "in organized groups using Discord"; the Shatters got a "slowdown
update attempting to resolve many players' complaints about the length"; "rushing" exists as a
named practice. Brogue adds loops specifically so there is more than one way round. *Inference:*
a maze is fun when the map is the puzzle and you are alone (Spelunky, Brogue); it is tedious when
twenty people have to agree where to go. Loops, one-deep dead ends, landmarks per branch and a
minimap are the difference; without teleport they are mandatory.

**Designer-written seeds.** Spelunky's daily is one seed for everyone, generated the normal way
— "special 'designer caves' are not planned"; Isaac copied the daily. *Inference for this game:*
split the seeds. The layout seed can be public — even a shared daily seed ("the day's delve"),
which also gives merchants a public event — while every roll stays under the committed server
secret and the settlement block (red team D1). The slice already consumes the RNG for the map
before anything else ("no rng: the seed's dungeon must not move", `newRun`), so the split is a
one-line change: `genMap(mulberry(layoutSeed))`, rolls from `G.rng`.

**How RotMG generates dungeons — what is public.** No official document or source was found.
What the wiki states: Lost Halls is "procedurally generated" on an 8×8–9×9 grid with "randomly-
generated gimmicks" per room; the Shatters village "follows one of many preset layouts" and the
developer calls the dungeon "fully handmade"; Oryx's Sanctuary "has a fixed layout" with a random
wing per instance; Dungeon Modifiers roll a ruleset per instance. *Inference:* RotMG uses all of
hand-made maps, a pool of preset layouts, and one grid generator; it did not pick one method.

## 3. Interactables that fit this game's rules

**The determinism cost, once.** A deterministic lockstep simulation must give "exactly the same
result ... exact down to the bit-level" for the same inputs, with a fixed timestep
(https://gafferongames.com/post/deterministic_lockstep/); "if the programmer is not careful
enough, unpredictable events can leak into the game" and accumulate into a desync
(https://factorio.com/blog/post/fff-76). *Inference:* an interactable is a few bytes of state
advanced by the tick plus an "interact" input in the log. The rules that make all of them free:
timers count ticks, never the clock; "interact" is an input like "fire", ordered by player index
when two land in one tick; the server never predicts a door, the client just draws it late; every
RNG draw an interactable needs comes from the run stream in a fixed order. The replay then proves
who opened what, which is also the griefing record. None of the items below changes that.

| Interactable | Precedent (URL in §1) | Fit with this game's rules | Build cost (deterministic server) | Effect on deaths and length |
|---|---|---|---|---|
| **Key and locked room** | Isaac treasure room (key), Gungeon locked chests, Lost Halls' flames and Vial (a key that drops "to one random person"), Brogue's key-holder machines; the slice already has a key item ("The Turnkey's Key", slot 3) | Best fit. The key is a carried item: lost on death, left behind on recall, so the treasure can only be claimed by someone who goes through the seal. No token touched. | A door tile that checks `carried` for `d.key`; an item flag. Trivial. | Optional exposure: +1 fight (the key's guardian) and +1 room; deaths rise only among those who choose it; +30–60 s. |
| **Switches / count gates** | Shatters' 8 monuments with a reveal at 7; "always 10 rooms" | Fine for "open more", never for "shut recall" (red team C2: one player's step must not lock twenty). | A counter per instance. Trivial. | Length +, deaths ≈; a hunt across a field is what drew length complaints. Later. |
| **Two-player pressure plates** | Portal 2 co-op (force fields split the puzzle; ping and countdown tools: https://www.gamedeveloper.com/design/synthesizing-i-portal-2-i-) | **Reject in this game**: the design depends on strangers, and strangers profit from your death (red team C1); a held plate is a hostage mechanic. The one plate that must exist is the **ready plate at the boss door** (red team rule 10). | Trivial. | The ready plate lowers accidental deaths (C2 by accident "in the first multiplayer test"). |
| **Breakable / secret walls** | Lost Halls' 12,000 HP walls, Gungeon's cracked walls and blanks (90 % of floors), Isaac's bombs | Rewards knowledge; bots learn it too (bot-resistance). Fine later as a prefab with a hidden room. | Per-tile HP for a wall tile; bullets already stop on solids. Small. | ≈ on deaths; adds a few seconds for those who know. |
| **Traps** (arrow shooters, floor bombs, door spikes) | Lost Halls' 150-damage arrows and bomb traps; Isaac's curse-room door | Raise deaths without skill expression and land on the weakest (treadmill: the least skilled third carries 40 % of deaths) — the wrong way to hit the band. | A stationary emitter = an enemy that does not move. Trivial. | Deaths ↑ among the new; no length. Avoid in dungeon two. |
| **Altars / shrines (pay to gain)** | Isaac sacrifice (health for a chest) and devil rooms (health for items); Darkest Dungeon's light for loot (below) | Fits if the price is HP, light or wear — never token (no emissions, never a token payout). *Inference:* a shrine that takes durability is a repair sink players choose. | A tile with a cost check and an item roll from the run stream. Trivial. | Deaths ↑ a little (less HP or light); no length. |
| **Timed doors** | Dead Cells: 2/8/15/26 min benchmarks, 20 cells + an altar behind each; timers pause in shops | The tick is the clock, so it is free; it rewards rushing, which raises deaths voluntarily. Needs the hard run length first (red team D5). | A tick threshold on a door. Trivial. | Deaths ↑ among rushers; length ↓ for them. Later. |
| **Light as a resource** | Darkest Dungeon's light meter: 0–100, "Playing at low light levels is thus more risky, but grants higher rewards"; loot chance 25 % at Radiant to 95 % at Black as Pitch; light decays 6 per new corridor, 1 revisited; a torch per click; Shambler ambush at 0 light (1/8/12 % by difficulty) — https://darkestdungeon.wiki.gg/wiki/Light_Meter (wiki). Spelunky's dark levels with flares. | The slice's class *is* the lantern; its light is 88 or 114 px by what is worn. A **dark branch** (no wall torches, smaller radius, better drops) is the class's own mechanic and "a depth with better odds deeper" (red team A2's suggestion) without a new floor. | In the slice light is rendering only; if darkness also widens enemy wake range it is one constant in the sim. Trivial. | Deaths ↑ in the dark branch, by choice; length +. The right kind of difficulty: chosen. |
| **Chests with a cost** | Gungeon's fuse chests ("If the chest is not opened within a short period of time, it will explode"), locked chests, mimics; Isaac's vault (two keys) | A fuse chest in a bullet-hell is a positioning test, not a tax: fine. A key chest is the key-and-lock row. A wear-cost chest is the shrine row. | Trivial. | ≈ |
| **Optional miniboss / side room** | RotMG "treasure rooms containing minibosses that drop unique loot"; Lost Halls' Agonized Titan; Isaac's mini-boss room | Best fit with the key: the miniboss guards the key, the key opens the treasure. Before the seal, so recall is still open and the choice is the player's. | A Gaoler with more HP in a flagged room. Trivial. | Deaths ↑ among those who opt in; +1–2 min. |

*Inference on the death rate as a whole:* every row that raises deaths does so by **choice**
(dark branch, miniboss, timed door) or by **ignorance** (traps). The economy needs deaths, the
red team says the rate is a treadmill that mastery pushes down, and the fix it reached for was a
budget, not more traps. Chosen risk is the one lever that mastery does not erode: the expert who
never dies in the lit rooms still has a reason to take the dark ones. That is the design argument
for the dark branch and the optional miniboss over anything count- or trap-based.

## 4. The economy: what a longer run does

Facts from the model (`sim/economy2.py` docstring and parameters, read directly):

- The run is the unit. "Each day each runs with p 0.5" (`P.p_run = 0.5`); death per run is
  `d0 (1 − 0.6 skill)` times the tier multiplier; "Gear wears 8 % a run and must be repaired
  below 25 %" (`durability_loss 0.08`, `repair_floor 0.25`) → `ceil(0.75 / 0.08)` = 10 runs
  per repair at 30 token; fresh drops roll per survivor per run; the treadmill budget caps fresh
  drops at `b` × items destroyed by death in the last `W` days (`sim/treadmill.py`).
- Measured there: minting is alive 75 % of days at `d0` 0.10, 38 % at 0.08 (fail), none at
  0.06; the fail line is "about one death in 18 runs" or 3.2–3.35 % of value wagered destroyed
  (SPEC §5; `docs/red-team.md` A2). "No budget makes deaths."
- Repair is "a near-free sink" (+680–1,100 burn/day for −1.6 to −3.4 % runs) and the operator's
  main line (0.0012 ETH a repair → $1,211 a month per 600 delvers; `sim/operator_fee.py`).

*Inference, reasoned from those numbers:*

1. **Runs per day fall.** A player with a fixed hour does half as many 6-minute runs as 3-minute
   ones. In the model that is `p_run` 0.5 → 0.25. Deaths per day halve at the same per-run
   death chance, and so do mints: the same daily death flow as `d0` 0.05, which the treadmill
   sweep showed is dead ("57–59 % more runs, on gear at 14–17 % of its mint cost"). A longer
   dungeon at the same per-run danger kills the sink the same way getting good does.
2. **Unless per-run danger scales with length.** More rooms, more bullets, more decision points:
   if the dungeon is twice as long and each room is as dangerous as before, the per-run death
   chance roughly doubles and deaths per hour are unchanged (exposure-neutral). The loop
   prototype warns the recall rule dominates (8 % vs 70 % for the same player), so this is to be
   measured, not assumed. The band should be restated as **deaths per hour of play, in value
   destroyed** — the red team's "value destroyed, not heads" plus "per unit time".
3. **Repair burn halves per hour if wear stays per run.** Wear is 8 points a run by contract
   (red team D2: "wear is a fixed 8 points"). Doubling run length halves repair burn and the
   operator's repair income per hour of play. Fix that keeps the contract's fixed arithmetic:
   wear per *stage* (rooms cleared, counted by the replay), 8 points per stage of the current
   size — the server supplies the stage count as a fact, the contract does the multiplication.
4. **The fresh-drop budget self-corrects, minting does not.** The budget keys off items
   destroyed, so fewer deaths means fewer fresh drops automatically; but "no budget makes
   deaths", so minting still falls with deaths per day.
5. **Priced-out falls.** Fewer runs a day means less spend; budgets bind less (39 % of
   runner-days priced out at baseline). Good for participation, bad for burn.
6. **Optional rooms are a new flow the model lacks.** A side room taken by a fraction of runners
   with extra death chance and an extra roll is "let delvers choose a depth with better odds
   deeper" (A2) made concrete; the model has no such term.

**What to measure in `sim/economy2.py` (not run here; a pre-registered patch in the
`treadmill.py` style, model never edited):**

- *E1, run length.* Grid `p_run` ∈ {0.5, 0.25, 0.125} × `d0` scaling ∈ {none, exposure-neutral:
  `d0` × 0.5/`p_run`} × wear per run ∈ {0.08, 0.16, 0.32} (per-run wear scaled with length or
  not); `s` = ⅓; 5 seeds; 10,000 days. Report `mint_ok`, supply slope, burn/day split into mint /
  repair / fee, runs/day, priced-out, `p1`, and treadmill's value destroyed per value wagered.
  Hypotheses to write down first: (a) exposure-neutral `d0` with scaled wear leaves every
  per-day flow within noise of baseline (a null check); (b) `p_run` 0.25 with unscaled `d0`
  fails `mint_ok` like `d0` 0.05 did; (c) unscaled wear halves `burn_repair_d`.
- *E2, optional risk.* Fraction `f_opt` ∈ {0, 0.25, 0.5} of runners take a side room: death
  chance × (1 + Δ), Δ ∈ {0.5, 1.0}, and one extra fresh-drop roll at `q_fresh`. Does chosen risk
  restore `mint_ok` at `d0` 0.08 and 0.06 where mastery killed it, and at what cost in fresh
  drops under the budget?
- *E3, operator line.* `sim/operator_fee.py` with wear per run halved: confirm the repair
  income halves and whether the 0.0012 ETH fee still passes the wallet stress.
- *E4, cross-check.* `sim/population.py` says per-head flows are flat from N = 50; half the
  runs per head is not the same as half the heads (budgets differ) — compare `p_run` 0.25 at
  N = 600 with `p_run` 0.5 at N = 300.

## 5. Recommendations

### v0 (unchanged, one rule added)
- Six rooms in a line, the Turnkey at the end, 2–4 minutes. The operator could not beat it in
  2–3 runs and called that good; RotMG's hardest dungeon is the same shape with gates.
- Add only what the red team already requires: a **sealed boss door with a ready plate**
  (rule 10). It is the one interactable v0 needs and it is a rule, not content.
- Nothing else. Scope is the risk (SPEC §7).

### Dungeon two — "the second dungeon"
A concrete shape, about twice the slice:

```
hall ── A ── B ── C ──── D ──── F(miniboss) ── [sealed door] ── BOSS
             │    │      │
             K    └─ E ──┘        E: dark room (no torches), the far side of the loop
             │
             T                    K: optional miniboss, drops the key (one room deep)
                                  T: locked treasure room, needs the key (one room deep, off K)
```

- **Eleven rooms**, a Gungeon/Isaac-style graph: a spine of five fights, one loop (C–D–E) so the
  party can split and rejoin, two dead ends one room deep. Map about 192×90 tiles (the slice is
  128×60). Target 5–7 minutes for a party; measure, do not assume.
- **Three interactables that earn their place:**
  1. *Key and lock.* The miniboss in K drops the key as a carried item (the slice's slot-3 key
     already exists). T's door opens only to a carrier. Lost on death, left behind on recall:
     the treasure is paid for only through the seal.
  2. *The dark branch.* E has no wall torches and the light radius drops by a third; enemies
     there drop a tier up. The lantern-bearer's own mechanic; Darkest Dungeon's trade with the
     numbers to be set by play.
  3. *The sealed boss door with the ready plate* (already required). Anyone not on the plate
     when it closes is recalled with wager and no loot; the boss scales to who is inside.
- **Readability kit** (cheap, all rendering): a minimap built from `map` and a seen-rooms flag; a
  progress count ("3 of 5 halls broken"); a torch colour per branch (ember on the spine,
  verdigris on the loop, none in E); the miniboss becomes a marker once found (Lost Halls).
- **Generation:** a hand-authored graph (the eleven nodes above) with room prefabs from the art
  bank's tilesets; the seed picks prefab variants, places enemies and decals, jitters room
  positions. Layout seed public, rolls under the committed secret.
- **Prototype order in `proto/visual/index.html`:**
  1. `genMap`: `rooms[]` gets `links`; corridors are carved per link, not per index; a room
     flag for `dark`, `boss`, `locked`. A day.
  2. A tile value 3 = door (solid until `G.doors[id].open`); sealed-door logic on the boss
     room; the ready plate as a floor region with a tick timer.
  3. The key: `ITEMS.key2 {slot:3, key:true}`; the locked door checks `carried`.
  4. The dark room: skip torch placement where `room.dark`; `G.st.light` × 0.66 inside it;
     enemy wake range × 1.5 there.
  5. Minimap and progress count in the HUD.
  6. **Measure:** 60 seeded runs with the ally bots (red team agenda step 2): deaths, run
     length, how often K and T are taken, deaths inside E versus outside. These numbers feed E1
     and E2 in §4.
- **Leave out of dungeon two:** traps, switches, breakable walls, two-player plates, timed
  doors, anything that needs twenty people to agree.

### Later
- Mazes and grids (Lost Halls' shape), only with teleport-to-ally or voice; probably never.
- Hunt-the-N-switches with a 7-of-8 reveal; escort mechanics with contesting (Shatters).
- Lights-out and other shoot-to-solve puzzles as prefab rooms.
- Breakable walls and secret rooms (Gungeon's 90 %-of-floors rule is a good default).
- Timed doors (after the hard run length, red team D5) and killstreak / no-hit doors.
- Dungeon modifiers: a ruleset roll per instance with a loot boost — "more to do" with no map.
- A daily shared layout seed ("the day's delve") once the exchange exists, as a market event.
- A hidden hard-mode route (Shatters 2022) once there is a player base that wants one.
- Wear per stage in the contract, if E1 shows per-run wear is the problem.

## Could not verify

- **Typical run lengths** for any RotMG dungeon. Only world records were obtainable
  (speedrun.com API, full pets, mostly solo); community estimates were not found on a page.
- **Hades' chamber counts** (14 Tartarus / 10 Asphodel / 12 Elysium / 6 Styx) appeared only in
  a search-engine summary attributed to gamepressure.com and primagames.com; the pages fetched
  did not contain them (one was an index, one returned 403; hades.wiki.gg returned 401).
- **The Supergiant quote** that modular rooms were "more effort" than making more rooms: in a
  search summary, not on a page I read. Gorinstein's Kotaku quotes are the ones cited.
- **Dead Cells "50:50 random and curated"**: search summary of the deepnight article; the fetched
  summary of the article did not include the ratio.
- **Darkest Dungeon's per-band numbers** differ between the fandom wiki (blocked) and wiki.gg;
  wiki.gg's are cited.
- **Gungeon's "nearly 300 prefabs"** and all generation detail are Boris the Brave's reverse
  engineering, not the developer's statement.
- **RotMG's generator.** No official documentation or source was found; "procedurally generated"
  for Lost Halls and "preset layouts" for the Shatters village are the wiki's words; "fully
  handmade" is Deca's. Whether other dungeons draw from layout pools is unknown.
- **Shatters record comparison.** The 4.2-minute group record (2021-03) predates the August 2021
  rework; the 22.4-minute solo record (2022-02) is after it; they are different categories, so
  "the rework made it five times longer" is not a valid reading.
- **Maze-tedium essays.** The gamedev.net entry found by search returned 403; the quotable lines
  in the search summary were from unnamed itch.io posts and are not cited. The behavioural
  evidence (Lost Halls' wiki, the Shatters' slowdown update, "rushing") stands on its own.
- **RotMG dungeons before Feb 2020** having an 85 cap "loosely enforced" is the wiki's history
  note; the current 50 is the wiki's current text (last updated 2025–2026 per page headers).
- Fandom wiki pages (Spelunky daily/dark levels) were read through search summaries only;
  the pages themselves returned a Cloudflare challenge.
