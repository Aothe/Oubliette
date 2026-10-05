# Red team: broken strategies and cheats, judged

*2026-10-03. Three independent attackers (protocol, player/guild, market/token) each hunted the
design as written — SPEC with its §2 decisions on skills and recall, `docs/bot-resistance.md`,
`docs/loop-design.md`, the v1 simulation — and the orchestrator added its own candidates and
judged the merged list against the live chain measurements in `probe/chain/`. A fourth lens
(operator/insider/griefer/legal) and the planned three-skeptic pass were cut off by a session
limit; the operator and insider cases below come from the other lenses and the orchestrator.
Every number that came from an in-memory patch of `sim/economy2.py` is marked "probe" and is a
first look, not a §5 result. The death-rate numbers in the Verdict, A1 and A2 have since been
redone, pre-registered, five seeds, in `sim/treadmill.py` (SPEC §5), and are marked "measured".
Constants used: tier-1 gear 120 token + 0.002 ETH ≈ $12, tier 2
$39, tier 3 $129; repair 30 token; fee 2 %; a third of dead gear recycled; the economy needs one
run in 7–14 to end in a death.*

## Verdict — what matters, in order

1. **The death rate is a treadmill, not a dial.** Organised parties stacking Mend, and plain
   mastery, push deaths under the band with no cheat (A1, A2). Realm of the Mad God's maxed
   characters die once per 71 dungeons (`docs/capital.md` §6). Measured (`sim/treadmill.py`):
   the sim's own pass mark fails with a fifth fewer deaths, or with the most skilled quarter
   dying a tenth as often. What dies is minting, and with it the mint ETH that funds the
   piñata; the token burn mostly survives, because repair carries it. The fix is economic, not a
   ban: budget fresh drops against gear destroyed by death, by contract. At half the gear
   destroyed it rescues 9 of the 14 failing cases; at today's death rate it costs a third of
   fresh drops and 4 % of runs. It does not pass where half the players almost never die:
   minting stays alive, but the sink shrinks with the deaths. No budget makes deaths. A quarter
   of the gear destroyed held both hard cases it was tried on; all of it fails.
2. **The wager and the lottery are not yet tied together.** Loot is weighted by contribution and
   level, not by value at risk, so the winning play is the cheapest qualifying kit (B1), many
   cheap wallets (B3), and bought or farmed level (B4, B5). Weight by value wagered and keep
   level out of any roll with a tradeable prize.
3. **Co-op turns strangers into the product.** Survivors gain from shard-mates' deaths (C1),
   one delver can wake the boss and shut recall for twenty (C2), and a disconnect is a death
   that pays the living (C3). v0 is one shard of twenty, so one group can be the whole game.
4. **The chain–server seam needs five rules written before a line of Solidity:** per-run entry
   signed by the player (D2, D4), pull-based claims and no recipient callbacks (D3), a halt rule
   and a hard run length (D5), signed inputs with receipts (D6), and a treasury with no withdraw
   (D8). Each is cheap; each is irreversible if missed, because burns and sales on chain cannot
   be undone.
5. **Randomness:** the SPEC's per-tick public block hashes are readable by a bot before the tick
   (D1); a committed server secret plus a settlement block fixed by rule closes it, and drand
   (verifiable on this chain today) removes even the sequencer when stock payouts start.
6. **The token is the entry price** (E1): a pump prices players out and the "fixed amount"
   rule forbids a response. The fix changes SPEC §2 and is the operator's call.

## A. The death rate

**A1. The heal ball.** *(player lens; holds; severity 5, likelihood 5.)* A guild fills a shard,
six members bring Mend and stagger casts; in the slice a cast heals every delver within 64 px
for 35 HP on a 9 s cooldown with no cap, so six Menders give about 23 HP/s against 2 HP/s of
regeneration on a 100 HP body; bolts stop at the first delver they touch and enemies aim at the
nearest, so a healed front rank absorbs the group's fire; spare seats are sold as carries.
Nothing in SPEC §2 limits how many bring one skill or how heals stack. Measured
(`sim/treadmill.py`, 5 seeds): if the most skilled quarter dies a tenth as often, days with any
mint fall from 75 % to 40 %, under the 50 % pass mark; a third as often is enough to fail
(49–53 %). With half organised, 2 %, and tier-1 gear trades at 63 token against 220 to mint. The
least skilled third carries 40 % of deaths when nobody is organised. Turning difficulty up (d0
0.20) keeps minting alive with half organised (78 % of days) but lands on the unorganised, who
then carry 63 % of all deaths. *Test:* the slice's ally bots with Mend on staggered timers, 60
seeded runs. *Fix:* fresh drops capped at a share of gear destroyed, in the contract. Measured:
at half the gear destroyed, minting holds on 86 % / 75 % of days with a quarter / half
organised, against 40 % / 2 % without. The half-organised case still misses the pass mark on
one seed whose item supply drifts up 1.2 % a year. A cap at a quarter of the gear destroyed
passes it at 90 %. Also: Mend does not stack; bolts hit every delver they cross; aim is a
weighted roll, not "nearest".

**A2. Getting good.** *(player lens; holds; 4, 5.)* Study public replays of deathless clears,
recall on a fixed rule, and the population's death rate falls on its own while the sim holds it
constant for 10,000 days. Measured (`sim/treadmill.py`): days with any mint are 75 % at d0 0.10,
61 % at 0.09, 38 % at 0.08 (fail), none at 0.06. The line is about one death in 18 runs (5.5–5.8 %
against 6.5 % today), or 3.2–3.35 % of the value wagered destroyed by death. At d0 0.06 and
below minting is dead: 57–59 % more runs, on gear at 14–17 % of its mint cost, and the
treasury's mint ETH stops. The sink is funded by the newest and weakest players and needs a
steady supply of them.
*Test:* record deaths by run number in the thirty-run play test; add learning, quitting and
arrivals to the sim. *Fix:* the same fresh-drop budget. Measured: at half the gear destroyed,
minting holds on 76–90 % of days all the way down to d0 0.05, half today's deaths. At today's
death rate it costs a third of fresh drops (5.0 to 3.4 a day), 3.7 % of runs and no change in
the tier-1 price. Also judge the band in value destroyed per value wagered rather than deaths
per run; let delvers choose a depth with better odds deeper.

## B. The wager and the lottery

**B1. Strip the kit.** *(player; holds; 4, 5.)* Loot is weighted "by contribution and level"
(§3.5) with no term for value at risk, and only equipped gear is at risk (§3.1). In the slice a
skill-only delver deals 60 % of a full tier-1 kit's damage for 20 % of the stake; pieces one run
from repair are nearly scrap; tier-2 and tier-3 drops are sold, never worn. Albion's developer
described exactly this against durability-only loss. Probe with survival value set to zero:
tier 3 trades at 13 % of its mint cost and minting falls under the pass mark. *Test:* play the
slice with every slot empty but the skill. *Fix:* a full kit to enter a wagered run, and lottery
weight multiplied by the mint value of what is wagered; wherever a rule keys off deaths, count
value destroyed, not heads. Stake-weighted prizes look more like a pari-mutuel bet — a question
for the counsel pass (§6).

**B2. Contribution pays whatever is cheapest, and the top ten can be bought.** *(player;
holds; 3, 5.)* "Contribution" and "level" are undefined. If it is damage, Sunder beats Mend by
35 % of loot weight and nobody heals; if healing counts, a member stands in slow bolts under
heals; ten members in tier-3 weapons fill every place in "the top five or ten". *Fix:* make
contribution a bar to clear (at least half the median finisher's damage or healing), then weight
qualified finishers by value wagered; the big roll uses the same weights, so splitting across
wallets gains nothing and Mend costs nothing.

**B3. Many cheap wallets.** *(market; holds; 4, 5.)* Twenty wallets with one tier-1 item each
hold every seat in v0's shard for about $236 of gear that is never used up; by the loop
prototype's kit numbers eleven tier-1 wallets deal nine times the damage of one tier-3 wallet for
the same money; a scripted wallet running back-to-back does about 860 runs a day, and under the
sim's per-head fresh roll draws about 26 fresh items a day against 8 destroyed in the whole
economy. *Fix:* no per-head or equal-share roll (the bot-resistance note); fresh drops budgeted
against destruction, in the contract; weight by value at risk; random shard assignment with a
small party cap; in v0, an allow-list of the twenty known wallets.

**B4. Levelled wallets for sale; B5. Soulbound is not.** *(market, protocol; hold; 3, 4.)* Any
rule on an address — level, a progression gate, vesting, "exchange-only" gear, bans, per-wallet
statistics — moves with the wallet, and a contract wallet changes owner in one transaction with
no fee burned. A hundred-run gate costs a script under three hours and an honest newcomer about
200 days. MapleStory Universe found 28,000 purchased verified accounts. *Fix:* let no roll with a
tradeable prize read level, fame or account age; gate the big rolls with a refundable deposit a
fraud finding can take, not with a wait; keep the vesting delay on drops.

**B6. Recall pays fame, and fame may be lottery weight.** *(player; contingent; 3, 4.)* In the
loop prototype the rooms are worth 159 fame and the boss 60, so a rooms-and-recall loop banks
73 % of a full clear's fame with no boss risk. Harmless unless level feeds a roll. *Fix:* bank a
run's fame only through the seal or at the boss; or keep level out of the lottery (B4).

**B7. The boss is a bet you can price; B8. Waiting at the door for a rich hoard.** *(player,
market; hold; 3, 4–5.)* The recycled pool is on chain and the slice shows it in the HUD; recall
is open at the door; nothing limits a run's length. A party reads the prize, recalls on a thin
pool, sends its best players in the cheapest kits on a fat one, or waits at the door (or holds the
boss at a sliver) until a tier-3 kit lands in the pool and takes it. Probe arithmetic: a timed
kill costs about 22 token for a prize of about 490. *Fix:* the dead's gear never pays the run it
died in — each dead kit is raffled among delvers who finished a run in the hour before it died,
by the same weights, settled after the run; a hard time limit per run; the boss scales to who
entered the dungeon, not who stayed.

## C. Co-op

**C1. Own the shard, farm the strangers.** *(player; holds; 4, 4.)* A guild holding 15 of 20
seats raises the other five's death rate without touching them: it stands further back so aimed
volleys land on strangers, wakes packs and walks them onto someone mid-recall (a hit resets it),
heals in a cluster the strangers are not in, and picks when the boss wakes; every stranger who
dies leaves a third of a kit to finishers who are all guild. *Fix:* as B7 — a death never pays the
run it happened in; random assignment with a party cap; aim by weighted roll.

**C2. One delver's step shuts recall for twenty.** *(player; holds; 4, 5; new.)* §2 shuts
recall "from the moment the boss wakes", written for one delver; the slice has one `awake` flag
for all. The cheapest wager in the shard, with Slip, runs into the chamber while the rest are hurt
or mid-recall, and twenty people fight a boss they did not choose. Read the other way (each
delver locks on crossing), outsiders fight short-handed while the puller waits, or steps in at
the end to count as a finisher. Will happen by accident in the first multiplayer test. *Fix:* a
door that seals — a ready plate with a short timer; anyone not on it is recalled with wager and
no loot; the boss scales to the number inside; no late entry.

**C3. Connectivity bounty.** *(protocol; holds; 4, 3.)* Equips and entries are public, so an
attacker knows which run holds the valuable kits; when the boss wakes and recall is shut, a
rented flood of the shard's address for twenty seconds kills everyone standing still; "a
disconnect is never an escape" makes the deaths valid; the attacker is paid as finisher,
merchant or extortionist, and two thirds of each kit no longer exist. *Fix:* the tick is the
clock, so pausing is free — if most of a shard stops acknowledging, the server stops ticking and
logs it; if the pause runs out, the run ends in place and the living leave with their wager and
no loot; burns execute after a delay (D2); an attack-absorbing front for the sockets.

## D. The chain–server seam

**D1. Read the dice, then throw.** *(protocol; holds against SPEC as written; 5, 4.)* §3.4 seeds
each tick from the latest block hash; the hash reaches a bot at the same moment as the server
and one 100 ms block covers six 60 Hz ticks, so a squad holding the boss at one strike from
death can land the kill only on a window whose roll pays its own wallet — ten tries a second,
98.8 % to win a five-way roll in two seconds of holding. MEASURED (`probe/chain/randomness.mjs`):
a Nitro block header is a deterministic function of its parent, the sequencer's clock and L1
view, and the ordered transactions, so whoever is alone in a block can compute its hash before
sending; but sole-user-transaction blocks are only 1.8–6.3 % of blocks (two walks), public RPCs
prune state within minutes, and the sequencer feed is closed to anonymous clients, so grinding a
block is impractical for a player and free only for the sequencer. *Fix (D1):* commit H(S) on
chain at run start and derive every per-tick seed from S, the tick and the run-start block hash,
revealing S at settlement — nobody can read a roll before it is final, and the replay proves
the seed was fixed before play. End-of-run rolls: keccak(S, arbBlockHash(T)) with T fixed by
rule as the first block at or after a number named in the settlement transaction, so neither
the server (which revealed S before T existed) nor a player (who cannot be alone in block T)
chooses the outcome; the EIP-2935 history contract serves the hash for about 10.9 h, so the
25 s window and the re-roll-by-waiting trick disappear. When stock payouts start, roll from a
drand quicknet round instead — the BLS12-381 precompiles are live on this chain and a live
beacon verified on it — which removes even the sequencer from the trust set.

**D2. The settlement key is a kill switch.** *(protocol; holds; 5, 3.)* The chain knows
"equipped", not "entered run R"; a stolen or buggy settlement key can declare every equipped kit
dead and name its own wallets as finishers; a third moves to the thief, two thirds burn, the loot
is on the exchange 0.1 s later, and the replay that exposes it the same day changes nothing.
Per 1,000 delvers in tier-1 kits that is $59,000 of gear in one block. *Fix:* per-run entry
signed by the player (a session key, no pop-up): the contract records "these items are in run R
until time T", and a result may touch only items entered in R — a kit is then exposed 0.2 % of
the time instead of always; the key supplies facts and the contract does the arithmetic (wear is
a fixed 8 points, the recycled third is the contract's roll, recipients must be entrants of R);
burns and loot execute after a delay during which a second, offline key can cancel a batch; a
circuit-breaker on deaths per hour. Gas probe: a per-run entry is about 70,000–90,000 gas,
under a cent.

**D3. Settle-or-reroll.** *(protocol; holds; 4, 4; new.)* A contract wallet whose
token-received hook reverts unless the incoming item is the one it wants stalls the whole
settlement transaction (the server pays each failed attempt), holds twenty locked kits hostage,
and on the exchange freezes an item's bid side with one escrowed offer that reverts every match.
If the roll had to land inside the 256-block window, the stall became a re-roll. *Fix:* never
call a recipient inside settlement or matching: lock gear in place with a flag rather than
escrow, record who is owed what and let each winner collect, credit exchange fills to a balance
the buyer withdraws; store the roll's seed through a call anyone can make. One extra "collect"
transaction per win, about a cent.

**D4. The server reads the chain once.** *(protocol; holds; 4, 3.)* One equipped kit backs
several simultaneous runs on different shards (ten runs at a 10 % death rate expect one death but
can lose at most one kit); consumables moved or listed after the server's snapshot are drunk and
kept; a skill item loaded before the chain lock serves a whole squad. *Fix:* the same per-run
entry as D2 locks, in one transaction, everything the sim will let the delver use and marks it
"in run R"; a second entry fails on chain.

**D5. A run that cannot end.** *(protocol; holds; 4, 3.)* A fuzzed input that crashes the
deterministic sim crashes it again on every resume; a lost signing key, a server that fell over
before the last second of inputs reached disk, or a squad that refuses to finish a woken boss all
leave twenty kits locked with no rule. Every improvised exit is an exploit. *Fix:* the sim can
never fail (checked arithmetic, hard caps, fuzzing in CI — the loop prototype's headless runner
can be fuzzed today); a written halt rule — a run that cannot advance ends where it stopped,
earlier deaths stand, the living leave with their wager and no loot; a hard tick limit per run;
no input acted on before it is on disk; if nothing is posted for a run in 72 hours, each wallet
can unlock its own gear.

**D6. The input log is the server's word.** *(protocol; holds; 4, 3; new.)* Replay proves the
result follows from the log, not that the log is what the players sent: half a second of a rich
delver's inputs dropped during a boss ring looks exactly like lag and replays perfectly; inserted
inputs raise a friend's contribution; and any player who dies can claim the log is forged, with no
answer. *Fix:* the wallet authorises a throwaway key at entry; that key signs each 100 ms input
batch, each batch carrying the hash of the one before; the server answers with a signed receipt
naming the tick it applied; the final hash goes on chain with the result and the log is public
before loot can be sold. What remains — a server that ignores you cannot be proven to have —
is said on the site. Gas probe: posting a whole 20-player log (change records, brotli) is about
27 KB and $0.04 at today's prices; the hash alone is negligible.

**D7. After the secret, the house holds the dice.** *(protocol; holds against the naive
commit-reveal; 4, 2; new.)* With rolls = hash(secret, "the block after the last input"), the
server knows every result first, can slide "the last input" by a tick for a new result every
100 ms, and can crash before revealing a result it dislikes. *Fix:* as D1 — reveal S in the
settlement transaction before block T exists, fix T by rule, let anyone finalise; drand for
anything paid in stock. Then the operator can neither know nor choose a roll, which is what the
guardrail in CLAUDE.md requires.

**D8. The treasury and the upgrade key.** *(protocol; holds; 5, 2.)* v0 pools mint ETH with no
spending rule, so the first draft will have an owner withdraw or an upgrade hook, and whoever
holds that key takes the pot; approvals to upgradeable contracts put the "safe" vault one key
away from gone. *Fix:* the v0 treasury has no withdraw, only a "move to a new treasury" after a
public delay of a week or more, proposed by a multisig; the contracts that hold gear, locks and
ETH are not upgradeable; anything upgradeable holds no approvals; players approve exact amounts.

## E. Market and token

**E1. The coin's chart is the entry price.** *(market; holds; 4, 5.)* Mint prices are fixed
counts of token (§2) and the game's own demand is tiny next to the pool (600 delvers buy about
$52 of token a day), so speculators set the price; a doubling takes a tier-1 kit from $11.80 to
$18.24 and a tenfold move to $69.73; §5 (C) measured 16–27 % fewer runs at 2×, and a probe at
5× and 10× lost 41–43 % and 58–61 % of runs with minting under the pass mark. No intent is needed:
a routine pump-and-dump does it as a side effect, and "nothing hand-tuned to the token price"
forbids a response. *Test:* extend the sim's shock grid to 0.1–10× and a pump-then-dump path;
measure the depth and weekly range of existing Pons coins. *Fix (operator's decision — it changes
§2):* make the token leg of the mint a set ETH value that is bought and burned at a time-averaged
price, or shrink the token share (at 20 % token by value a 10× move raises entry 2.8× instead of
5.9×). Buying depth instead would cost the operator about $120,000 of ETH and as much token.

**E2. Offers go stale when the coin moves.** *(market; holds; 3, 4; new.)* The token cost of
minting moves with the coin while a resting offer does not: after a 25 % rise, minting into
resting buy offers is riskless; after a fall, resting sell offers are under replacement cost.
Each doubling or halving takes a quarter to a third of a year of the merchant loop's modelled
profit. *Fix:* offers expire after 24 h by default and may be pegged to the live mint cost;
every book shows the live mint cost. Designed together with E1.

**E3. Release day is a speed race, and content leaks before the notes.** *(market; holds; 3,
4.)* A public, replayable simulation and a browser client mean new dungeon data reaches machines
before any notes; the counter-gear float is small (about $3,500 at market in the 600-delver
world) and the vault holds it for free; failing a leak, a program next to the sequencer sweeps
every resting sell offer in the first 0.1 s block. §3.1's rule covers notes, not bytes, and not
difficulty or drop-rate changes. *Fix:* every release and parameter change is a market
announcement — commit the content's hash on chain, publish everything at an announced time
24–48 h before the dungeon opens, expire all resting offers at that moment, reopen each book with
a single-price opening auction.

**E4. False prints steer the public price.** *(market; holds if matching is loose; 3, 4.)* Two
wallets pass one thin item back and forth at a chosen price for a 2 % fee on the printed price;
probe: three false tier-3 prints a day at 300 took the published price from about 1,080 to about
325 and real trades to 440–480. Anything that reads the exchange price inherits it. *Fix:* strict
price-then-time matching with open offers only, no private fills; two offers placed in the same
second cannot match; reject trades above mint cost; publish a trailing median that needs
several unrelated parties; let no rule read the exchange price — use the fixed mint price.

**E5. Worn gear sells at the fresh price.** *(player and market, found twice; holds; 2, 5.)*
Offers name a type and a price; items carry their own durability; a piece at 28 % is sold into a
buy offer and the buyer owes a 30-token repair before its second run. *Fix:* only fully repaired
gear can be listed, or an offer names a minimum durability.

**E6. Gear traded outside the exchange pays no fee.** *(market; holds; 2, 5; partly covered.)*
A ten-line swap contract trades gear for ETH with no burn; the fee is 7.5 % of the burn (about
$3 a day per 600 delvers), so the sink barely notices, but price history and the in-game merchants
leave with the volume. *Fix:* move the burn to where it cannot be skipped — a fixed burn the
first time a new owner equips an item it did not mint or win — and cut the exchange's own fee
toward zero so it wins on convenience. Changes who pays; the sim's fee result needs a rerun.

**E7. The stock piñata is small, stops when minting stops, and any top-up goes to the farms.**
*(market; holds; 3, 3; new.)* The pot is 0.002 ETH per tier-1 mint: 8 cents per finishing run at
the baseline, nothing in a glut, about 50 cents a day in v0; conversion at a public moment can be
front-run on a thin stock pool; a paused stock token inside settlement blocks settlement;
operator money added to a pot paid by the roll is an emission by another name and goes to
whoever holds the most finishing weight. *Fix:* pay the pot in ETH as a claim each winner
collects, pro rata to the same weights at set intervals; if stock is kept, convert in small
slices at random blocks with a price limit and pay by claim; never add operator money to a pot
paid by the roll.

## Rules to decide before any contract is written

These close most of the list at once and cost honest players little: (1) fresh drops budgeted
against gear destroyed, enforced by contract; (2) lottery weight = a contribution bar × value
wagered, level never in a tradeable roll; (3) a death never pays the run it happened in; (4)
per-run on-chain entry signed by the player, locking everything used; (5) pull-based claims, no
recipient callbacks, no escrow moves inside settlement; (6) a committed server secret, a
settlement block fixed by rule, drand for stock; (7) a halt rule, a hard run length, a 72-hour
self-unlock; (8) signed input batches with receipts, the log public before loot can be sold; (9)
a treasury with no withdraw and a non-upgradeable core; (10) a sealed boss door with a ready
check; (11) offers expire, only repaired gear lists, releases are announced market events; (12)
the token leg of the mint by value, not by count — the operator's call, since it changes §2.

## Research agenda, in order

1. **Simulate the death-rate treadmill** (A1, A2): organised fraction × death multiplier,
   learning and arrivals, with and without the fresh-drop budget; pre-registered; a §5 row.
   *Done in part (`sim/treadmill.py`, §5): organised fraction × multiplier and uniform mastery,
   with and without the budget. Open: learning and arrivals; b between 0.25 and 0.5 across the
   grid and its cost at today's death rate; the window; a value-weighted budget.*
2. **Measure Mend, stripping and the sealed door in the slice** (A1, B1, C2): 60 seeded runs
   each, scripted allies.
3. **Write the contribution and weighting formula on paper and attack it** (B1–B3) before any
   code; send the stake-weighting question to counsel with the lottery question.
4. **Fuzz the deterministic sim** (D5) through the loop prototype's headless runner; kill and
   resume mid-run.
5. **Prototype signed input batches and receipts** (D6) in the loop prototype; replay one log
   through three browser engines (floats are not fixed-point).
6. **Contract tests on the first draft** (D2–D4, D8): a fuzzer holding only the settlement key;
   a finisher that always reverts; a double entry; who can move treasury ETH.
7. **Extend the sim's price shock to 0.1–10× and a pump-then-dump** (E1, E2); measure real Pons
   coin depth and weekly ranges.
8. **A pre-registered run of the ETH repair fee and the fresh-drop budget together**
   (`docs/capital.md`), since both move the same sink.
9. **Decide the loot pool's scope** — per run, per shard or global with a delay (B7, B8, C1) —
   and simulate the delayed raffle on the v1 death stream.
10. **Counsel:** the lottery shape, stake-weighted prizes, and delivering tokenised debt
    securities to unidentified winners (`docs/capital.md` §6).

## Not verified

- No adversarial pass judged this list; the verdicts are the orchestrator's, informed by the
  live probes. Severity and likelihood are judgements on a 1–5 scale, not measurements.
- Every "probe" number is three seeds or fewer on a patched copy of `sim/economy2.py` that was
  not committed; the W = 0 stripping result, the price shocks (E1) and the false-print result
  are first looks. The organised-party collapse and the fresh-drop budget are measured
  (`sim/treadmill.py`, SPEC §5), but not with learning, quitting or arrivals, a budget weighted
  by value rather than items, any window but 30 days, or a Mend that has been shown to make
  anyone nearly deathless.
- The "buy a block" variant of D1 (a 32 M-gas transaction fills a block and is alone in it) was
  not tested; the odds of being first in a 100 ms window were not measured.
- WoW Classic Hardcore floods and their remedy (C3), the Meebits mint (D3), RotMG dragging
  (C1): from memory; confirm before citing.
- The insider lens did not run: shard assignment by the operator, server-side input censorship
  as a business (D6 covers the mechanism), and cold-start failures (an empty exchange, a token
  nobody sells) are covered only in passing.
