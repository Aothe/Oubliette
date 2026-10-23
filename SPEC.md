# Oubliette — spec v0.1

*The design note that seeds this venture, promoted to the repo's spec. Written 2026-09-25 in the
Tracking-tracker session from the operator's stream of consciousness and the discussion that
rounded it out; Tracking-tracker keeps the note as its record at `docs/plans/permadeath-mmo.md`.
This file is the source of truth — decisions (§2), mechanism (§3), what is open (§4), what is
verified and what is assumed (§5), risks (§6), the v0 line (§7), what happens next (§8). Read it
in full before changing anything. Nothing is built.*

**Status: EXPLORE → feasibility.** Two load-bearing unknowns, in order: (1) does the economy
have a stable equilibrium under the sink/source rules in §3.5 — `sim/economy.py` exists to
settle it; (2) is the core loop fun at $0 — a vertical slice settles that. Two chain facts that
could have killed the design were measured live before this repo existed (§3.6, §5): the
randomness primitive is `ArbSys.arbBlockHash`, and RH Chain stock tokens transfer freely today.
---

## 1. The idea

A top-down, pixel-art, bullet-hell dungeon crawler in the Realm of the Mad God line —
cooperative, real-time, **permadeath** — where gear is on-chain and **what you die wearing is no
longer yours.** Gear is minted by burning a fixed amount of the game's token plus some of the
chain's gas token, and must be *equipped* on chain before it can be taken into a dungeon;
equipping is the wager. Dungeons end in bosses that are piñatas. Dead players' gear partly
returns as loot for whoever finishes and partly burns. Alongside the dungeons, an in-game
exchange priced in the game's token, free to value things as it likes — a Grand Exchange — so
that the game is **two loops in one**: people who play to delve, and people who play the market,
each needing the other.

The economics are the novel part. Every play-to-earn game died of inflation: all source, no
sink. Permadeath is a sink players *choose*, and the drama is the point. Play-to-risk, not
play-to-earn.

## 2. Decisions taken (operator, 2026-09-25)

| Decision | Choice |
|---|---|
| Genre and view | Top-down 2D pixel art, RotMG-style. Low-end hardware; small bug surface; and (§3.4) deterministic by construction. *(Operator said "isometric"; RotMG is top-down. Top-down is cheaper — no depth sorting, 4–8 direction sprites, plain tile maps — and is what is meant here.)* |
| Death | Permadeath. Equipped gear is lost to the player. **Part** returns to the world as loot; the rest is destroyed. Death is a sink, not a plain one. |
| Gear | Individual items as NFTs (Loot-style), not sets. Minted by burning a fixed amount of the game token + some gas token. Must be equipped on chain to be at risk / usable. Repairable, **not upgradeable**. Gear system expandable later. |
| Instances | Sharded simulation, global ledger and global boss (§3.3). Operator accepted this in place of a single global instance. |
| Boss drops | Gear, consumables, and **external assets (tokenised stock, or stock buckets) — never the game's own token.** Reason: anything paid out in the base token gets sold; the treasury must create no sell pressure on it. |
| The token | The exchange's unit of account. Tradeable in wallets like any Pons-launched coin. Bought on the market; **burned** by minting, repair and exchange fees; **never emitted** by the game. |
| Fun at $0 | The core loop must retain players with worthless items. The economy is a layer on top, never the reason to log in. |
| Two loops | Delvers and merchants, RuneScape-style, harmonious in one game. The exchange is a large part of the product, not a menu. |
| Chain | Whatever chain it ends up on — current lean RH Chain (§3.6). |
| First work | Agent-based economy simulation, in the new repo, before a vertical slice. |
| Scope | Hard v0 line (§7). No scope creep to the point where it never ships. |
| Skills | One ability per delver per run, carried as a wagered item: minted, traded and lost on death like the rest. One each, so a party has to coordinate. *(Operator, 2026-10-02.)* |
| Leaving early | A delver may recall before the boss, never at it — "you have to 'lock-in' to the boss if you want the loot". Recall saves what was wagered and none of what was picked up, so a short loop earns nothing and costs wear. *(Operator, 2026-10-02.)* |
| Dungeon size | Size is a tier, not a default. v0 stays six rooms in a line; "bigger" is dungeon two — a short branching graph of ten to twelve rooms with one loop, not a maze and not an open floor — and it is built only after E1 (`docs/dungeons.md`) has measured what a longer run does to the death band and to wear. *(Operator, 2026-10-20, on `docs/dungeons.md`.)* |
| The boss door | Sealed, with a ready plate, in v0: the door closes when the plate fires, whoever is not inside is recalled with the wager and no loot, nobody enters after it, and the boss scales to who is inside. Red team rule 10 and C2, now a decision. *(Operator, 2026-10-20.)* |
| Interactables | Chosen risk in, forced risk out. In, for dungeon two: a dark branch where the lantern is the only light and the loot a tier better; an optional miniboss that drops a key; a locked treasure room the key opens (the key is carried — lost on death, left behind on recall). Out: two-player plates, levers that shut things on others, and traps — griefing tools among strangers who profit from each other's deaths, and traps land on the weakest, who already carry 40 % of deaths. *(Operator, 2026-10-20.)* |
| Re-entry after death | Always a new wager, never a resume: the dead kit is burned or pooled and nothing on chain rolls back. **v0:** the dead rejoin their friends in the *next* run, from the Gatehouse, with a one-click saved loadout (a named list of item ids off chain, one batched transaction). **Same-run re-entry is wanted** — "Intra run re-entries seem like a good way to keep people playing if the dungeon is particularly difficult. Would need balancing to stop a high number of entries in order to overwhelm bosses" — and is built only once three contract rules exist: a death never pays the run it died in (red team rule 3), the lottery is weighted by value wagered (rule 2), the fresh-drop budget counts value destroyed (rule 1). Then: a new signed entry, only before the boss wakes (the lock-in rule from the other side), capped per run, the boss scaled to the head-count at the sealed door. "Deliberate cheap deaths under same-run re-entry" is a treadmill-sim probe before it ships. The dead stay in the run's chat as ghosts, watching the delayed feed, queued for the next run (operator, 2026-10-22). Nothing ever returns gear to the dead. *(Operator, 2026-10-20, on `docs/reentry.md`.)* |
| The training ground, not a free run | Nobody enters a real dungeon with nothing at risk — "allowing a user to enter one of our dungeons without risking anything is a bad idea" (operator, 2026-10-22, reversing the unwagered practice run accepted as a default on 2026-10-20). The $0 way in is a short tutorial on first login and a **training ground** that can be revisited: a preset dungeon with practice dummies — slow projectiles, infinite health, standing still or moving on a set path — the practice range a game is expected to have. No wager, no loot, no lottery, no fame; nothing there counts toward anything. Practice never shares a shard with wagered players. *(Operator, 2026-10-22.)* |
| The recycled third | Goes to a **global pool, with a delay** — "seems logical to me" — so no run can win back what died in it (red team rule 3). The delay is set by the delayed-raffle simulation on the v1 death stream (red team research item 9), not guessed. *(Operator, 2026-10-20.)* |
| Trade | No trade window — in v0 or planned. The exchange is the trade feature: escrowed offers matched by the contract, the fee burned, price history public (§3.7). Gifts are wallet transfers outside the game. "Direct trade" later means a targeted offer on the same book — one wallet can take it, same escrow, same fee, excluded from price history. Off-exchange transfers skip the fee: accepted as a leak in v0 (the red team sized it at ~7.5 % of the burn) and flagged by the forensics rig; closed later, if it grows, by a burn on first equip by a new owner — never by a transfer allow-list. *(Operator, 2026-10-20, on `docs/chat-trade.md`; definitions asked for and given.)* |
| Chat | Three channels from the start — **dungeon** (everyone in the run: the one instance of the dungeon), **local** (those on your screen; in the Gatehouse, the room), **private message** (wallet to wallet, by handle; anyone may message anyone) — built so group and guild channels can be added later. On every channel: signed by the session key the player already has, rate-limited, links stripped, a blocked-word list (drawn up when the system is built), nothing in the game ever asks for a signature from inside a message, kept beside the input log and never in it (the log is public before loot can sell, red team rule 8). **Canned call-outs and free text both, in the end; v0 ships canned call-outs** — a fixed menu of short preset messages, nothing to type and nothing to moderate — because they are far easier to build, and free text follows if the play test shows their absence hurts play. *(Operator, 2026-10-20 and 2026-10-22; supersedes the note's "shard and hall only, no whispers".)* |
| Handles | One chosen handle per wallet, used by chat and by the Roll of the Forgotten; changeable; never unique by force. *(Operator, 2026-10-20.)* |
| The hub | A one-room **Gatehouse** inside v0, in front of the dungeon: the strongbox (the wallet's unlocked gear — the vault is the wallet, there is no vault contract), the fettering post (choose the kit and the skill to wager), the ledger (the exchange's offers), the door (the shard's head-count, the ready plate, seals when the shard forms), the roll (recent deaths) and the mint. Each a panel over a chain call in the slice's style; no combat, no loot, so it does not run on the deterministic server. The market city stays not-v0: the **Undercroft**, with the Reliquary as its exchange hall, comes after the one-dungeon release gauges interest. **Superseded in part on 2026-10-22, after the operator played the Gatehouse in the slice:** the interactables are liked, but the hub is a **village outside the dungeon**, not a room in front of it — "I would prefer to create an area outside of a quote unquote dungeon … like a village … and then you go to where the dungeons are" — with NPCs behind desks for the bank, the exchange and the rest. The six objects keep their jobs as the village's desks and its gate. *(Operator, 2026-10-20 and 2026-10-22, on `docs/hub.md`.)* |
| The dead are named | The **Roll of the Forgotten** is public: who died, by chosen handle, wearing what, what came back as loot, how they died, and a link to the run's replay — the delver's persistence across death, the merchants' news feed, and the one place in the Oubliette where nobody is forgotten. *(Operator, 2026-10-20; the cause and the replay 2026-10-22.)* |
| The wallet is the login | Entering the game is signing in with a wallet: a character on screen, chat and the three chain actions all need one. Watching needs none — the Gatehouse and a run's delayed feed may be open to anyone without a wallet. *(Operator, 2026-10-22.)* |
| Equip is entry | One chain action, not two: the kit is at risk only inside a run, so "equipped but not in a run" never exists. Choose the kit and the skill, join the queue, and when the shard forms one entry transaction is relayed; the run's end unlocks it. `docs/chain.md` §4 is read that way, and the sealed door is a hub object because the hub is where the shard forms. *(Operator, 2026-10-20.)* |
| Healing | **Potions, not regeneration.** A delver brought low heals by drinking a potion — a consumable (§3.5): minted by burning token, dropped by bosses, carried into the run and so at risk, burned on use, traded on the exchange — a merchant good and a sink, not a timer. *(Operator, 2026-10-22, after playing the slice: regeneration let a delver brought low by the boss "just run around and let it refill … maybe isn't the best mechanic"; of the two fixes named — potions, or much slower regeneration when low — "potions is the right direction".)* Open (§4): how a potion is got, how many are carried, how much it heals and how fast, and what natural regeneration remains, if any — to be tried in the slice. |
| Potions, the numbers | Got both ways — minted by burning token, and dropped by the boss — so they are a sink and a merchant good at once. Carry up to five into a run. The slice starts from: each heals about a third of a delver's health over two seconds; natural regeneration off in combat and slow outside it. *(Operator, 2026-10-22.)* |
| The ordinary mobs | Tuned harder, together with potions, so a competent delver lands near the band the economy wants — about one run in seven to fourteen ending in a death. Numbers from play, not from a table. *(Operator, 2026-10-22: they "feel a little bit too easy".)* |
| The village's desks | v0's village has a banker (the strongbox), a broker (the exchange), a smith (mint and repair), a gatekeeper (fettering and the dungeon gate), the Roll of the Forgotten as a wall, and a door to the training ground. *(Operator, 2026-10-22.)* |
| The call-outs | Eight canned call-outs on the dungeon channel for v0: Boss, Help, On me, Wait, Going in, Leaving, Plate, Thanks. *(Operator, 2026-10-22.)* |
| The training ground | A door off the village; a one-time, skippable tutorial on first login; a revisitable training ground with practice dummies — slow projectiles, infinite health, standing still or on a set path. Nothing there is wagered, won or counted. *(Operator, 2026-10-22.)* |
| Dungeon two's band | The band per hour of play: as a dungeon lengthens, each run gets deadlier so that deaths — and the sink — per hour hold (E1, §5: at twice the slice's length, 13 % of runs end in death and mint burn doubles). Tested for feel when dungeon two is prototyped; "more at the door, more at the end" stays untested. *(Operator, 2026-10-22.)* |
| How the operator is paid | Two of the three lines in `docs/capital.md`: an ETH leg on repair paid to the operator (0.0012 ETH a repair, the measured recommendation, §5) and a share of the ETH side of mints (half, in the model). The third — a launchpad's creator fee — waits on a prior question: whether a launchpad is needed at all to get live, and if so which one, given the NFTs and the exchange the game adds — "I just want a quick stab to see whether or not it's 100% necessary". *(Operator, 2026-10-22.)* |
| The mint price | The token leg of the mint is set by value, not by a fixed token count, so a move in the token's price does not price players out or in (red team E1 and rule 12 in `docs/red-team.md`); supersedes "a fixed amount of the game token" in the Gear row. The ETH leg is unchanged. How "value" is read — a pool average, an oracle, a peg — is open (§4). *(Operator, 2026-10-22.)* |
| The exchange's book | On chain: offers placed and filled by the contract, price history free and public, no private order flow, pull-based fills and no recipient callbacks (`docs/chain.md` §4–5). *(Operator, 2026-10-22.)* |

## 3. Mechanism

### 3.1 Two loops, one economy

**The delver.** Enter a dungeon with equipped gear, fight through, kill the boss, extract. Die
and the equipped gear is gone. Progression that survives death lives in two places: the
**vault** (unequipped gear is safe — only what is on-chain-equipped is at risk) and the
**account** (unlocks, cosmetics, knowledge, reputation). Something must persist across death or
players quit after the first one; RotMG's answer was fame, the vault and the pet, and the shape
holds here.

**The merchant.** Never, or rarely, enters a dungeon. Buys and sells gear and consumables on the
exchange, arbitrages across time and dungeon releases, stocks repair kits for delvers,
speculates on which gear the next boss will make valuable. This is the OSRS flipping community
and the crypto-native audience's natural door. The exchange needs what makes the GE a game:
price history, volume, item information, and events that move prices.

**How they need each other.** Delvers are the only source of items and the demand for repairs;
merchants are how a drop becomes liquid and how a delver re-gears after a death. Death removes
supply, so merchants' inventory appreciates on every death — the market profits from the
fallen, which is dark and correct. A new dungeon release is a demand shock: the gear that
counters the new boss reprices, and merchants who read the release notes first win. **Release
information must therefore be public and simultaneous** — an insider on a dungeon release is the
same problem as an insider on a listing, and this repo already has the forensics rig for it.

### 3.2 Money: two currencies, two jobs

- **The game token** — bought on Pons / a DEX with ETH; the exchange's unit of account; burned
  on mint, on repair, and as the exchange fee. The game **never pays it out**. Its supply only
  falls with use. Demand is "I want to mint, repair or trade"; there is no emission to sell.
- **The gas token (ETH on RH Chain)** — pays gas; and the ETH portion of every mint fee is the
  **external-asset treasury**: it buys the tokenised stock (or stock buckets) that bosses drop.
  This is the operator's "plus some of the gas token" steer doing double duty: it is how bosses
  can drop something real without the treasury ever selling the game token. Two currencies, two
  roles, zero sell pressure on the base.

A player's path is fiat/ETH → token → mint or trade. Value leaves the system as burned token
(a sink, good for holders) and as stock paid to boss-killers (funded by ETH that was never the
token). Nothing is minted out of thin air except items, and items have sinks.

### 3.3 Sharded simulation, global world

A bullet-hell with a thousand players on screen is unplayable and a true single shard is
MMO-scale netcode. Shard the *simulation* at ~50–85 players (RotMG's realm cap, for the same
reason) and make the *world* global:

- one dungeon release, every shard runs it — new dungeons are global events, old ones run at
  leisure (the operator's instinct, kept);
- a **world boss** whose health bar is pooled across shards — "the community must deal 40M
  damage" — so everyone was there;
- one global loot pool for the boss's drops; one global exchange; one ledger.

Shared narrative without a shared simulation.

### 3.4 Where the chain goes, and why the server can be checked

**Chain:** ownership and the rules of transfer — mint, burn, equip, unequip, drop, trade,
repair. **Server:** real-time state. The trust problem is that the server decides who died and
who finished: a trusted oracle in the middle of an economy with real money, which is RotMG's
duping problem with extra steps unless the server can be checked.

It can. **The server runs a deterministic simulation**: fixed-point maths, integer tile
physics, a fixed tick, every input logged, and the per-tick randomness seeded from chain block
hashes. Clients are renderers with prediction — they need no determinism. After a run, anyone
replays the input log through the same simulation and gets the same deaths and the same drops;
loot rolls are a function of the replay, so the server cannot pre-know or bias them (the same
"nobody can run ahead of the chain" as the arena, `connectome-arena.md` §3.2). Determinism
makes cheating **detectable**, not impossible; the stronger version — independent replayers,
bonded fraud proofs — comes later if it is ever needed.

This is *easier* than a typical MMO, not harder: no client reconciliation of divergent
simulations, one authoritative deterministic truth, and a replay file that is simultaneously
the anti-cheat record, the verification artifact and the spectator feed. It is also the deeper
reason 2D pixel art is right: no 3D physics engine nondeterminism to fight.

### 3.5 Items: sources and sinks, the whole game in one table

| | Gear (NFT) | Consumables (repair kits, potions) | Cosmetics |
|---|---|---|---|
| **Sources** | mint (burn token + ETH); boss drops (part recycled from the dead, part fresh) | boss drops; mint | mint |
| **Sinks** | **death** (fraction `1 − s` destroyed, `s` recycled as loot — `s ≤ ⅓`, and `⅓` only at `d0` 0.10–0.20: the sink must outrun fresh drops, `(1 − s)·deaths > fresh`, §5); **durability** (degrades per run) | burned on use | none — safe forever, a non-risk revenue line |
| **At risk** | only when on-chain-equipped | when carried | never |
| **Tradeable** | yes, on the exchange | yes | yes |

Two sinks on gear, one continuous (durability → repair kits → burned token) and one dramatic
(death). No upgrades: upgrades are a power source and an inflation vector; repair is a sink.
The recycled fraction `s` is the single most important number in the economy and is the first
output of the simulation, not a guess.

Potions are how a delver heals (§2, 2026-10-22): a consumable like the repair kit — minted by
burning token or dropped by a boss, carried into the run and so at risk, burned on use, traded on
the exchange. Healing is a merchant good and a sink, not a timer.

**Boss drops, distribution:** the recycled gear pool goes to finishers by a lottery weighted by
contribution and level; the top five or ten share a dice roll for the one or two big items; the
stock/bucket drop follows the same roll. All rolls are functions of the replay (§3.4) — public,
unbiasable, and the same lottery-shaped legal question as the arena (§6).

### 3.6 Chain

**RH Chain** (Arbitrum Orbit, chain 4663): ~0.1 s blocks, ~0.13 gwei, permissionless (Pons,
MOO and FLYBRAIN all deployed there), the operator's ecosystem, and tokenised stocks present for
the drops. Arc is a worse fit: Circle's compliance-first posture and a permadeath dice-roll game
are an awkward pair, USDC gas is fine but `PREVRANDAO = 0` makes randomness harder.

**Randomness on RH Chain — measured live on 4663, 2026-09-25** (runtime bytecode injected via
`eth_call` state override, which this RPC supports, so probe contracts need no deploy):
`block.number` is the **Ethereum L1** block number — 26,055,153 against an L2 height of
72,309,222 — and it did not move in 5 s while the L2 advanced 118 blocks; it syncs every
13–15 s (Arbitrum docs, `block-numbers-and-time.mdx`). `blockhash()` returns a nonzero value
that matches no L2 block hash: Arbitrum's documented "cryptographically insecure, pseudo-random"
hash keyed by L1 number (`solidity-support.mdx`). `prevrandao` is the constant 1. So
"seed each tick from the latest block hash" **cannot** use `blockhash` — one new value every
~14 s, sequencer-generated. **`ArbSys(0x64).arbBlockHash(n)` returns the real L2 block hash** —
verified equal to the RPC's hash for two recent blocks — and `arbBlockNumber()` the real L2
height: one fresh hash per ~0.1 s block, readable *on chain* for the last 256 L2 blocks
(~25 s), verifiable *off chain* through the RPC forever. That is the primitive. Trust statement,
stated plainly on the site: L2 block hashes are produced by the sequencer, which is Robinhood;
unpredictable to everyone else. Stock-token transferability: §5.

**Re-measured 2026-10-02/03 (`docs/chain.md`, `probe/chain/`, §5).** The primitive holds and is
not enough on its own: a Nitro block header is a deterministic function of its parent, the
sequencer's clock and the ordered transactions, so whoever is alone in a block could pick its
hash — impractical for a player (2–6 % of blocks hold one transaction, public RPCs prune state
within minutes, the sequencer feed is closed) and free for the sequencer. So every roll mixes
in a server secret committed on chain before the run and revealed at settlement, and the
end-of-run roll reads a block fixed by rule after the reveal (`docs/chain.md` §3). Two facts the
design did not have: the EIP-2935 history contract serves block hashes for ~10.9 h, so the
256-block window is no constraint on end-of-run rolls; and the BLS12-381 precompiles are live,
so a drand beacon verifies on chain — randomness nobody in the game, Robinhood included, can
touch, for when stock payouts start. Costs: base fee 0.02–0.04 gwei and every transaction pays
exactly it; a mint $0.007, an equip $0.004, a settled 20-player run $0.025–0.07 for the
operator. **Platform facts** (measured, and L2BEAT / Robinhood's own docs, 2026-10-03): a
rollup posting blobs to Ethereum; permissioned validators; upgrade keys a 7/8 multisig with no
delay; **sequencer-level transaction filtering, on since 2026-06-24, which can fail any
transaction touching a restricted address, force-included ones too** (filtered hashes 278 →
6,088 on L2BEAT); force inclusion through L1 within four days; a gas subsidy that ended
2026-09-29 (fees −53 % in a week). The terms are permissionless in writing, name no gambling
or lottery clause, and let Robinhood block wallet addresses. Cambria, Gigaverse and three
other games announced for the chain in September 2026; none has outcome data. **The chain
choice stays RH Chain** — nothing in the design needs more than it gives, and the stock
tokens and the launchpad exist nowhere else in this form — with two named exits: Arbitrum One
(the same primitive, no filter, VRF vendors present, thin audience) and Base (the largest
consumer audience, Flashblocks, VRF; loses `arbBlockHash` and the stock tokens). The contracts
are plain EVM and the seed interface should be abstracted so a move costs a redeploy and a
token migration, not a redesign.

### 3.7 The exchange

The GE, not an order book with market clearing at every tick: **offers** (buy X at up to P, sell
X at no less than P), matched by the contract, with price history public. Priced in the game
token; the fee burned. Items are NFTs, so listings are escrowed; consumables are fungible or
semi-fungible (ERC-1155) and trade like commodities. Whether the offer book lives fully on chain
(0.1 s blocks make this plausible on RH Chain) or as an off-chain book with on-chain settlement
is an open question for the new repo — *decided 2026-10-22 (§2): on chain*. So is whether the walkable market-city (stalls, a Grand
Exchange building) is v1 or later — it is the merchants' *place*, and the place matters to that
loop the way the dungeon matters to the other. Not v0. *Decided 2026-10-20 (§2): the city is the
Undercroft, after the one-dungeon release gauges interest; v0 has a village hub instead — a room
in front of the dungeon in the slice's first cut, a village outside it since 2026-10-22
(`docs/hub.md`).*

**Reuse:** Vector's fee splitter for the exchange fee; the A1 listing-forensics rig turned on
the exchange for wash trading and RMT patterns from day one.

## 4. What the operator has not decided, and should not yet

- **Class and combat design** — RotMG has 17 classes; v0 has one. What makes the loop fun at $0
  is the whole question and it is answered by playing, not by writing.
- **Death-rate tuning** — the economy's death rate `d` and the game's difficulty are the same
  dial. The sim says what `d` the economy needs; the vertical slice says whether that `d` is fun.
  v1 (§5): minting needs `d0` ≥ 0.10 at `s ≤ ⅓` and 0.20 at `s = ⅔`; a higher `d` also prices out more.
  *Operator, 2026-10-22, after playing the door-and-Gatehouse trial of the slice: the ordinary mobs
  feel a little too easy, and health regeneration is generous enough that a delver brought low by
  the boss can run around until it refills — "maybe isn't the best mechanic". Two fixes named —
  potions (a consumable, §3.5 — a merchant good and a sink) or much slower regeneration once low —
  and the operator chose potions the same day (§2 "Healing"). After the second pass (2026-10-23)
  the operator found regeneration and potions much better, the Turnkey rightly very hard, the rooms
  "still quite easy", Sunder strong, and wanted longer bolts and faster feet; all four are in the
  slice's third cut (§5), the rooms as the one still open. The economy wants roughly one run in
  7–14 to end in a death.*
- **The stock-bucket mechanism — resolved 2026-09-25.** The model is
  [otcdesks.cash](https://otcdesks.cash) (Solana), read from its own pages. A launcher where a
  coin is paired against **a single tokenised stock or a basket of up to ten** (xStocks —
  AAPLx and the like); its creator fees are claimed automatically and split in one
  transaction: *most is converted into that reward stock and paid to holders pro-rata*, a
  share buys and burns the protocol token, a share goes to a "desk pot", a share is kept.
  **Desks** are NFTs minted with a surcharge whose deposit is burned outright; they earn a
  share of every product's revenue but *pay nothing until activated*. So "stock bucket" = a
  basket of up to ten stock tokens that a fee stream is converted into and distributed. For
  the game: the boss's ETH-side treasury (§3.2) converts into a basket of RH Chain stock tokens
  and the winners' roll pays out in it. The desk lineage is exact for gear — mint by burning,
  earns nothing until activated/equipped — and it suggests one optional variant worth a line:
  rare gear that *captures a share of exchange fees, paid in stock, while equipped*, and is
  lost on death. Yield you can only hold by risking it. Not v0.
- **Bot resistance** — RotMG has fought bot farms for a decade; bots farming dungeons is item
  inflation. Wallet identity plus gas costs rate-limit *on-chain* actions, but the run itself is
  off chain. Open, and serious. Red-teamed 2026-10-03 beyond bots (`docs/red-team.md`, §5): the
  finding that can end the economy needs no cheat — organised parties stacking Mend, and plain
  mastery, push deaths under the band (Realm of the Mad God's maxed characters die once per 71
  dungeons); the wager and the lottery are not yet tied together (the cheapest qualifying kit,
  many cheap wallets, bought level); co-op makes strangers the product (survivors profit from
  shard-mates' deaths, one delver can wake the boss for twenty); and five seam rules — per-run
  entry signed by the player, pull-based claims, a halt rule, signed inputs with receipts, a
  treasury with no withdraw — must be written before any contract. Twelve rules to decide
  before contracts and a ten-step research agenda are in the note; proposals, not decisions.
  Researched 2026-10-02 (`docs/bot-resistance.md`, §5): what
  matters here is, in order, automation that avoids death (it removes the sink), an on-chain
  dupe (it cannot be rolled back), many wallets farming per-head rewards (the "top five or ten
  share a dice roll" of §3.5 is the exposed part), and bans that cannot claw back; exchange bots
  and RMT are not the threat. Its recommendations are proposals, not decisions.
- **Exchange mechanism — decided 2026-10-22 (§2): the on-chain book.** The evidence it rested on:
  The fee is set against the merchant loop, not participation: v1 (§5) — delvers never feel it;
  merchants profit up to 5 % (at `s = ⅓`), break even at 10 %, lose at 20 %. Gas measured
  2026-10-02 (§5): an on-chain offer costs $0.006 to place and $0.006 to fill, a signed off-chain
  order $0 to place and 38 % less to fill; `docs/chain.md` §4–5 recommends the on-chain book for
  v0 (free price history, no private order flow) with pull-based fills and no recipient
  callbacks, and lays out what else goes on chain per run.
- **How the operator is paid — decided 2026-10-22 (§2) but for the launchpad question** (`docs/capital.md`,
  2026-10-03). As written, §3.2 sends every dollar a player spends to whoever sold them the
  token or into the drops treasury; cosmetics (§3.5) are the only operator line and are not v0.
  Three lines fit the guardrails and need a decision each: an ETH leg on repair paid to the
  operator (§3.5; measured, §5: 0.0012 ETH a repair pays $1,211 a month per 600 delvers for
  0.35–0.74 % fewer runs and holds under tighter and looser budgets; twice that fails the stress
  test, and four times that makes a repair dearer than minting, so the income falls), a share of
  the ETH side of mints (§3.2; halves the drops pot and changes nothing else in the model), and
  the launchpad's creator fee (Pons pays 0.7 % of trading volume in ETH; name the recipient).
  Rejected on the guardrails: an operator token allocation, owning the liquidity, keeping the
  exchange fee — each needs the operator to hold or sell the token. With all three lines the
  operator takes about $0.08 per delver per day at the model's price scale, so bare-bones costs
  need about 190 delvers and a sensible run-rate about 4,400; the scale is an assumption until
  real spend per delver is measured. *Decided (§2, 2026-10-22): the repair leg and the mint share, yes;
  the creator fee waited on whether a launchpad is needed at all — checked the same day
  (`docs/launchpad.md`, §5): not for the token, only for a public price without the operator owning
  liquidity; Pons v2 or Uniswap Labs' Pools.trade, same day either way, Pools.trade recommended unless
  the Pons creator fee is wanted ($11 a month per 600 delvers in the model); the operator's choice.*
- **Engine** — a deterministic fixed-tick server in TypeScript or Rust; a canvas/WebGL client
  (Phaser or bespoke). Browser-first: RotMG was a Flash game.
- **Art pipeline** — the bottleneck. Pixel art is the most tractable style for commission or
  generative-plus-hand-finish; still needs a source and a budget. Placeholder art for v0 can be
  drawn in code (§5, `proto/visual/`), and art for dungeons after the first is banked the same
  way in `art/` (§5, §7); art direction and anything illustrated still need both.
- **What persists across death** beyond the vault — fame, unlocks, cosmetics, a pet? *The Roll of
  the Forgotten (§2, 2026-10-20) is the first answer: the name and the death persist, in public.
  Fame, unlocks and a pet stay open, and the red team's B4 keeps every one of them out of a
  tradeable roll.*
- **Skills and recall — decided in §2, the numbers are not.** In the slice (`proto/visual/`):
  three skill items — Slip (a dash through bolts), Mend (heals every delver nearby), Sunder (a
  heavy strike) — chosen in the entry hall and locked once the delver leaves it; recall takes
  three seconds, any hit breaks it, and it is shut from the moment the boss wakes. Open: which
  skills and how many; whether skill items have tiers and drop; cooldowns; three seconds or not.
  Both Mend and recall lower deaths, so the 7–14 % of runs the economy needs to end in a death
  (§5) has to be re-measured with people. Why recall pays nothing: a reward with no risk
  attached is the inflation of §5's first result, whoever farms it, person or bot.
- **Run length against the band — E1 has run (2026-10-22, §5); the choice is still the operator's**
  (`docs/dungeons.md`, "E1 — result"). The sims count in runs, and dungeon two is longer. E1 found that
  halving the runs a day at the same per-run danger does not kill minting — the analogy with `d0` 0.05
  was wrong: `d0` 0.05 cuts deaths but not boss drops, fewer runs cut both — it shrinks the economy per
  hour of play in proportion: at twice the slice's length the mint burn halves and sits on the
  pre-registered floor; at four times it fails. Raising per-run danger with length (the band per hour
  of play) more than restores the sink — mints double, because boss drops are paid per run — at 13 %
  of runs ending in death at twice the length and 27 % at four times, and 4.5–6.4 % fewer runs. Wear
  per stage puts repair burn back where it is for about 1 % of runs and does not touch minting. Decided
  2026-10-22 (§2): the band per hour, tested for feel when dungeon two is prototyped. The choices were:
  the band per run (runs as safe as today, a smaller burn per hour) or the band per
  hour (the burn kept, every run deadlier) — or "more at the door, more at the end" (a dearer entry and
  richer drops per run, size as a tier), which E1 did not test; the band-per-hour overshoot suggests a
  longer, deadlier dungeon has room for more drops per run (inference, not run). Also open: the hard
  run length itself (red team rule 7) — a number before the server is written — and whether the
  lantern burning down is its visible form (to test in the slice, not decided).
- **Same-run re-entry, and the training ground — the numbers** (`docs/reentry.md`). The cap on
  entries per run is undecided; the operator (2026-10-22) is unsure of a count and floated **keyed
  entry** instead: a dungeon needs a key — an item, or a set of items — to enter, a player may enter
  as many times as they hold keys, and the key could be a revenue line. To weigh before deciding: a
  key is a second per-run price on top of the kit, and the v1 model says the per-run price is the
  participation dial (§5: doubling the mint cost loses 22–25 % of runs, and 39 % of runner-days are
  already priced out); a key priced in token is a burn, and a key with an ETH leg to the operator
  has the shape of the repair fee measured above; and a key limits entries by wealth, not by count,
  so the boss still has to scale to the head-count at the seal. Keys as consumables fit §3.5 —
  burned on use, a merchant good — and dungeon two's key is already a carried item
  (`docs/dungeons.md`). To simulate with the delayed raffle (red team research item 9), which also
  sets the delay on the global pool. Also open: how the boss scales to the head-count at the seal;
  what the tutorial and the training ground (§2) contain — a preset room, dummies with slow
  projectiles, infinite health, a set path — and the rule that nothing there pays or counts (a
  reward with no risk attached is the inflation of §5's first result). Decided 2026-10-22: the dead
  stay in the run's chat as ghosts (§2). First thing to time in the play test: death to back in a
  run, target under a minute.
- **Chat, and the exchange's guard rails** (`docs/chat-trade.md`). The canned call-out set itself —
  which calls, how many, on which keys; the slice is where to try them — and the play-test question
  of whether their absence of free text hurts play. When free text arrives, and in private messages
  from day one (open to anyone, §2), the barriers carry the load — links blocked, a blocked-word
  list, rate limits, drawn up when the system is built — since a wallet-drainer link in a private
  message is the one chat attack that ends in a signature; and the moderation budget (a hosted
  filter is about $2 per thousand messages; the cost is the person who reads reports). For §3.7: the
  Grand Exchange's four-hour buy limit per item and its cap on open offers per player, two rules the
  exchange does not yet name; and the first-equip burn, to re-run the fee cells of `sim/economy2.py`
  with the burn moved.
- **The village, and the hub's limits** (`docs/hub.md`). Now that the hub is a village outside the
  dungeon (§2, 2026-10-22): its size, which NPC desks it has beyond the bank and the exchange, how
  far the walk to the dungeon is, and whether the Undercroft is then this village grown or a second
  place; the gate's timer; the instance cap (reference hubs run 16–100; the ledger, the roll and the
  shard queue must be global, and the queue must span instances or the hub's cap becomes the shard's
  cap); what a wallet-less spectator sees of the village and of a run, and with what delay (the run
  feed is delayed anyway, red team rule 8). RotMG's paid vault slots do not transfer, because the
  vault is the wallet, so `docs/capital.md` must not count on them.
- **Reading the token's value for the mint price** (§2, 2026-10-22). The token leg of a mint is now a
  value, so something has to say what the token is worth at mint time: a time-weighted average from
  the launch pool or a DEX pool, an oracle, or a peg the operator sets — and each is a thing an
  attacker can move or the operator can be accused of moving. The red team's price probes (research
  agenda item 7: 0.1–10× and a pump-then-dump) are the test, and the choice belongs with the contract
  rules.

## 5. Verified vs assumed

Nothing is verified yet; this table exists so the next session fills it the way the arena's was
filled — every finding with the script or source that proves it.

| Claim | Status |
|---|---|
| The economy has a stable equilibrium under §3.5 with some `s`, `d`, mint and repair rates | **Verified in the v0 model — 10,000 days × 5 seeds, a token-income halving, a mint/repair cost grid; 228 runs, byte-reproducible (2026-09-25): stable iff `(1 − s)·deaths > fresh drops`, robustly at `s = 0`, `d0` 0.10–0.20.** Minting is the balancing flow: where death destroys more than fresh drops add, minting makes up the gap to within < 1 item/day; where it destroys less, minting dies and the excess piles up — why fresh boss gear at 35 % of runs inflated at any `s` (first smoke run; `q_fresh` is now rare by default). Every seed, last quarter: `s = 0`, `d0` 0.10 / 0.20 (1 run in 15 / 7 dies) is **flat** — +0.3 / −0.1 %/yr, mint beats buying on ≥ 97 % of days, 11.7 / 33.2 mints and 2.0k / 4.4k token burned a day. `s = ⅓` there is flat **in circulation only** (mint_ok 0.55–0.76, 5.8 / 20.2 mints/day): its t2/t3 surplus, 0.3–0.55 items/day, piles up listed because nothing in v0 buys t2/t3 (p2 19–29 token vs t1 120–135). **Fail:** `s ≥ ⅔` (mint_ok ≤ 0.37) and `d0 = 0.05` at any `s`. **The 800-day result was transient, read through a misleading metric:** `s = 0`'s +8–9 %/yr went to 0; `s = 1`'s +43–49 %/yr is a constant +6.6–8.4 items/day that reads +4 %/yr at 10k — under linear growth relative slope is 365/t, and every `s > 0` reads +3–4 %/yr at 10k; judge by circulating slope, items/day, mint_ok. **Negative — v0 cannot set the fee constants or test price coupling:** no budget ever binds (income 200 token/delver/day, burn ≤ 10.2; 0 priced-out runner-days, 0 unaffordable repairs), so the halving is a no-op (60/60 halve/control pairs identical in every field but balances) and mint ×0.75–1.33 × repair 15–60 moves only burn, the tier-1 price and supply ≤ 4 % (36/36 cells keep their verdict). **Not verified:** a binding budget, explicit merchants (the implicit one pays sellers from no balance), t2/t3 demand, recycled-loot allocation (v0: first-come by index, not the §3.5 lottery), the v0 price rule | `sim/economy.py --sweep` (~7 min, 8 workers) → `sim/out/sweep.csv`, `sweep_summary.csv`, `sweep.log`; `--days 800` reproduces the first result, bit-exact in the sweep's first 800 days |
| v1: the equilibrium under binding budgets, a closed token ledger, explicit merchants, t2/t3 demand and the §3.5 lottery; the fee constants; token-price coupling | **Verified in the v1 model — 10,000 days, 427 runs, byte-reproducible; token and item ledgers asserted exact on every day of every run, so nothing is emitted (2026-09-27).** Calibration, fixed first: the median delver's ETH budget buys exactly tier 1 on every run-day of the reference economy; lognormal σ 1.2; wallet ≤ 30 days → **budgets bind: 39 % of runner-days priced out at `s = ⅓`, `d0` 0.10** (22–63 % across wallet caps 60–15 days; verdict unchanged). **(A) Nothing inflates:** supply flat (\|slope\| ≤ 1.1 %/yr, every seed) in all nine `s` × `d0` cells — a glut crashes gear to 10–15 % of mint cost, which lets the priced-out in (~180 → 290 runs/day) and makes worn gear cheaper than its repair, so it is scrapped (2–6/day). The verdict turns on minting: `s = 0` ROBUST at `d0` 0.10/0.20; **`s = ⅓` viable at 0.10 (mint_ok 0.73–0.76) and ROBUST at 0.20 — in total supply, no longer circulation only**; `s = ⅔` viable at 0.20 only; minting dies at `d0` 0.05 (`s ≥ ⅓`) and at `s = ⅔`, `d0` 0.10, and nearly at `s = 0`, `d0` 0.05 (0.22). Where minting is the marginal source t1 trades at the mint-equivalent (~210 of 220 token): **the mint cost is the entry price.** t2/t3 carry 8–76 % of runs, supplied by drops alone (≤ 0.31 mints/day in any run). **(B) Fee constants — negative on the pre-registered test** (stable, merchants in profit on every seed, runs ≥ 90 % of the most-played cell): **0/90 cells** (fee 0–20 % × mint ×0.5–2 × repair 10–90 token, `s` 0 and ⅓, `d0` 0.10). All 90 are stable; the constants do three different things. **Mint cost is the participation dial** (×0.5/1/2 → 201/174/131 runs/day, 33/42/56 % priced out, `s = 0`). **Repair is a near-free sink** (10 → 90: +680–1,100 burn/day for −1.6 to −3.4 % runs). **The fee is paid by merchants** (0 → 20 %: +260–510 burn/day, no participation cost, merchant P&L −0.5 to −1.8 token/day per point). The 4 tightest-margin merchants of 8 carry 96–98 % of merchant volume and all its P&L; pooled, merchants profit at `s = ⅓` for fee ≤ 5 % (+8 to +12 token/day), break even at 10 %, lose at 20 % (51/54 runs); at `s = 0` (fresh drops only) they lose at every fee; per seed the sign follows the tightest margin drawn (9 % profits, 6 % loses). **Fee region, pre-registered: none. Read from the grid, not a pass:** at `s = ⅓` a fee ≤ 5 % keeps the merchant loop in profit, repair can rise to 90 for ≤ 3.4 % of runs, and the mint cost is the one real trade — doubling it from v0's costs 22–25 % of runs, halving it gains 14–16 %. **(C) Coupling — re-equilibrates, never recovers:** token ×2 dearer → runs −16 to −27 %, burn −21 to −28 %, +10 to +14 pp priced out; ×2 cheaper → runs +17 to +20 %, burn +21 to +28 %; all 8 cells keep their verdict and minting (mint_ok ≥ 0.64). A cheaper token lifts runs at once (within 5 % of final in 0–26 days); a dearer one bleeds them over months (190–844 days) as token savings run down; mints overshoot (−80 % / +113 % at `s = ⅓`, `d0` 0.10), and their settling time is not resolvable at the pre-registered 5 % band (100-day mint counts are noisier). **The §6 risk is confirmed in size, not survival: the economy outlives a 2× move, and its participation and burn track the price.** **(D) Loot allocation** (index / uniform / §3.5 weighted) moves concentration (Gini 0.82–0.94 / 0.07–0.46 / 0.26–0.56) and merchant volume (index +1–3 items/day), not stability, minting or burn (index also costs ~10 runs/day at `s = ⅔`, `d0` 0.20). **Model limits:** no agent sells token back — loot winners hoard (+205 token/day at `s = ⅓`, `d0` 0.10, 21 % of all token bought: sell pressure on a price this model holds exogenous); survival value scales with ETH income, not token wealth; no naked runs; merchant margins drawn, not learned | `sim/economy2.py --sweep` (~10 min, 8 workers) → `sim/out/sweep2.csv`, `sweep2_summary.csv`, `sweep2.log`, `sweep2_equilibrium.png`, `sweep2_fees.png`, `sweep2_shock.png`; v0 stays reproducible by `sim/economy.py --sweep` |
| The loop is fun at $0 | **unverified** — vertical slice |
| RH Chain `blockhash` usable per §3.4 | **NO — verified 2026-09-25, live.** `block.number` is the L1 number (syncs every 13–15 s; +0 in 5 s while L2 +118), `blockhash()` is an L1-keyed pseudo-random value matching no L2 hash, `prevrandao` = 1. **Use `ArbSys(0x64).arbBlockHash`**: real L2 hashes, verified equal to the RPC's, 256-block on-chain window. Applies to the arena too (`Aothe/upwind` SPEC §3.2) |
| RH Chain RPC honours `eth_call` state overrides — probe contracts without deploying | **verified** — same probe |
| Which bot and cheat behaviours threaten this design | **researched 2026-10-02, web; facts sourced, design conclusions inferred and not simulated.** Death-avoidance cheats exist for RotMG's current client today — an open-source suite with auto-escape, auto-dodge and auto-aim, $2 prebuilt — and Deca reported autododge detection only in 2026 ("over 700" permanent bans since a May terms update). RotMG's 2012–13 dupes "devastated the player-run economy" and were cured by making items untradeable; an on-chain game has no such remedy (Gala, May 2024: 5 B tokens minted from a compromised wallet, ~$22M sold in 45 minutes). Jagex bans ~67,000 OSRS accounts a week and says new bots replace them. **For this design:** an instant escape is the cheapest cheat and a slow one the cheapest defence (the slice's recall); the equal split among the "top five or ten" (§3.5) rewards running many wallets where a contribution-weighted roll does not; per-tick randomness from public block hashes is readable by a bot. **Not verified:** see the list at the end of the note | `docs/bot-resistance.md` |
| Stock tokens on RH Chain transferable to arbitrary addresses | **YES — verified 2026-09-25, live.** SNDK (`0xb90a19ff0af67f7779aff50a882a9cff42446400`, "Sandisk Corporation • Robinhood Token", 18 dec) is an EIP-1967 **beacon proxy** (beacon `0xe10b6f6b…1b00`, implementation `0xb35490d6…5ae2`, 11,614 B) whose implementation exposes `paused()`/`pause()`, AccessControl, `mint`, `permit` and **no blocklist / whitelist / freeze / restrict selectors or strings**; `paused()` = false. Simulated `transfer(1)` succeeds from the MOO pool *and* from an ordinary EOA holder to two never-seen addresses; 2,652 transfers / 487 counterparties in the prior ~5.6 h. **Caveats:** upgradeable through the beacon (Robinhood can add gating later) and pausable — hold stock briefly, pay out promptly, never warehouse it |
| What each on-chain action costs on RH Chain, and what a day of play costs players and the operator | **Measured 2026-10-02, live-validated.** A 650-line measuring-stick contract set (not the contracts) run as one fresh transaction per action in a local Cancun EVM, then all 44 actions replayed on chain 4663 through `eth_simulateV1` with a state override — 44/44 match to the gas unit. At 0.032 gwei and ETH $2,683: mint 76,649–93,737 gas ($0.007–0.008); equip a kit of 4 47,329 ($0.004); repair 47,940; an on-chain offer 69,706–71,338 to place, 74,279–75,157 to fill; a signed order 89,254 to fill; openRun 71,416 (commitment) to 528,725 (roster of 20 in storage); settleRun for 20 players with 2 dead 128,545 (lazy wear) / 540,471 (eager); rollLoot 95,321; an 85-player settle 352,431 / 2,030,992 — 6.3 % of the 32 M limit. A delver-day costs the player $0.013–0.016; a 20-player run costs the operator $0.025–0.071; 1,000 daily delvers $13–16 + $4–11 a day; 50,000 about 1 % of the chain's long-run pricing target. A full 20-player input log is ~27 KB compressed ($0.04 as calldata, checked live); its hash is $0.00004. The L1 data charge is intermittently zero (26 of 52 sampled moments) and never more than 0.05 % of a transaction's gas when on. **Not verified:** real contracts with access control and events will cost tens of percent more; the chain's worst base fee (2 gwei, 2026-09-04) multiplies everything by ~65 | `cd probe/chain/gas && npm ci && node gas.mjs` → `probe/chain/gas/out/`; `docs/chain.md` §2 |
| `arbBlockHash` can be predicted or biased, and by whom; alternatives | **Measured 2026-10-02, live.** A block's hash was rebuilt byte for byte from public inputs; sole-user-transaction blocks are 1.8–6.3 % of blocks; state is pruned from public RPCs after 90–6,200 blocks; the sequencer feed returns 403 → a player cannot grind a block in practice, the sequencer can. `arbBlockHash` reaches exactly n−1…n−256 and reverts outside; the EIP-2935 history contract at `0x0000F90827…2935` serves n−1…n−393,168 (~10.9 h) for 3,175 gas; EIP-2537 BLS12-381 precompiles work and a live drand quicknet beacon verified on chain (pairing passed, wrong round rejected); no VRF vendor has code on 4663. Protocol adopted in `docs/chain.md` §3: committed server secret per run, per-tick seeds from it, end-of-run roll from `keccak(secret, arbBlockHash(T))` with T fixed by rule after the reveal and finalised by anyone within the history window, drand for stock payouts. **Not verified:** the rate a well-placed sender could land alone in a block (one funded transaction would settle it; none sent); Timeboost status | `node probe/chain/randomness.mjs` → `probe/chain/out/randomness.txt`; `docs/chain.md` §3 |
| RH Chain census: cadence, fees, finality, control, infrastructure | **Measured 2026-10-02/03, live.** 9.9 blocks/s (interval 101 ms, no empty second in 6,000 blocks; produced on demand); 57 user tx/s, median 5 per block, 18.6 % revert; every transaction pays exactly the base fee (0.0314 gwei; 0.02–2.03 gwei over the chain's life); 32 M gas per transaction and per block; rollup (`DataAvailabilityCommittee=false`, blob batches every ~24 s); safe +743 s, finalized +1,119 s, force inclusion ≤ 4 days, confirm period 6.4 days, validator whitelist on; 2 chain owners; **transaction filtering enabled since 2026-06-24 with one filterer**; ArbOS 61, Osaka-level EVM except BLOBBASEFEE, EIP-7702 supported, max code 98,304 B; Multicall3, Permit2, EntryPoint v0.6/0.7, Safe factory present, Seaport absent; 194 stock tokens live behind one beacon, none paused, ~$97 M DEX liquidity (HoodScan); 8–11 M transactions a day; the Blockscout API is closed to scripts (Cloudflare), its stats service is open. **Web, 2026-10-03** (sources in `docs/chain.md` §6): terms permissionless, no gambling clause, wallet blocking reserved; L2BEAT not Stage 0, 7/8 upgrade multisig without delay, filtered hashes 278 → 6,088; 7.7 M tx and 384 K active addresses a day after the subsidy ended; Robinhood Wallet (Privy) is the on-ramp; Pimlico, Alchemy, ZeroDev, Goldsky, Envio, OpenSea, Blockscout list the chain; stock tokens' primary issuance is to authorised participants only, secondary trading open, and the terms say nothing about prizes | `node probe/chain/census.mjs > probe/chain/out/census.txt` (~2 min); `docs/chain.md` §1, §6 |
| The v1 equilibrium survives in a small world, and per-head flows scale linearly | **Verified in the v1 model — N ∈ {25 … 1,200} × 5 seeds × two cells, 150 runs × 10,000 days, pre-registered (docstring hash `cf81bce75085`), byte-identical on re-run (2026-10-02).** Delvers' per-head runs, burn, spend and treasury inflow are within 10 % of the 600-delver world from N = 50 up at `d0` 0.10 and from N = 25 at 0.20, under merchants scaled with N and under 8 fixed. The sim's own verdict passes at N 400–600 (0.10) and from 100–200 (0.20); what fails below is the count-based `mint_ok` (days with a mint fall with N by construction — on exposure-matched windows minting is alive at every N) and the 1 %/yr slope rule on the worst seed (noise in a small stock). Gear-up passes at every N; one merchant profits on 30/30 seeds at N 25–100. **Negative:** merchants do not scale — at N = 1,200 the pooled book loses on 16 of 20 runs under both rules (fixed per-merchant targets against a growing flow; inference), so the pre-registered "every larger N passes too" clause fails every N and is reported, not retuned. Daily flows at N = 600, in dollars at 50,000 token/ETH and ETH $2,682: gross player spend $68 a day at `s = ⅓`, `d0` 0.10 ($0.11 per delver, $0.37 per run), $99–209 in the other reference cells; the ETH treasury takes $15–89 a day. **Not verified:** that a 25–100-delver world is fun or liquid; the dollar scale (budgets are calibrated to prices); nobody sells token back | `.venv/bin/python sim/population.py` (~5 min, 4 workers; `--repro` 6 s) → `sim/out/population.csv`, `population.log`; `docs/capital.md` §1–2 |
| Starting capital and the self-sustaining point | **Sized 2026-10-03 from sourced benchmarks and the model; not a measurement of demand** (`docs/capital.md`). The on-chain system needs no seed money (a Pons launch costs ~$2 with no liquidity from the operator — factory getters read live; the treasury fills from mints; merchants self-fund). Proving fun costs < $200 a month. Budgets from sourced unit prices: bare-bones $20,900 once + $10,000 bounty reserve + $464 a month; sensible $125,700 + $25,000 + $10,600 a month; well-funded $462,900 + $150,000 + $68,800 a month; one salary doubles the sensible run-rate. As specified the operator earns nothing; with an ETH repair fee of 0.0012 ETH, half the mint ETH and the creator fee, $0.0796 per delver per day (measured, next row) → bare-bones breaks even at ~190 delvers, $2k a month at ~830, the sensible run-rate at ~4,400, $40k at ~16,500, all linear in the assumed $11.80 kit. Precedents: EVE destroys 70 % of what dies and drops 30 % (CCP data, four months of 2026); Albion destroys each item at 30 %; RotMG characters die once per 16 completed dungeons, once per 71 when fully maxed (RealmEye sample; biased); Cambria kept 7–8 % of season spend; three apps on RH Chain already pay random tokenised-stock prizes. **Not verified:** the five-skeptic check of these notes was cut off by a session limit (the orchestrator re-ran the population repro, the Pons getters and the budget script); real spend per delver; growth and churn, so no date for break-even. The repair-fee line, first sized from three seeds on a patched copy, is now measured (next row) | `docs/capital.md`; the budget itemising, the Pons reads and the precedent measurements were in a session scratch folder wiped on 2026-10-03 — their figures cannot be re-run from the repo |
| An ETH fee on repair, paid to the operator, earns its keep without costing play; a share of the mint ETH moves only where that ETH lands | **Verified in the v1 model, pre-registered (docstring hash `954116052b2b`) — 335 runs × 10,000 days, byte-identical on re-run (2026-10-03).** `economy2.py` is patched in memory, never edited, every anchor asserted unique; at zero fee the patch is economy2 (50/50 controls equal the unpatched run in fingerprint and every summary field), and an ETH ledger — what delvers pay lands in the treasury or with the operator — joins the token and item ledgers, exact every day. Incomes stay at the v1 calibration: a fee is a price. **The first look holds:** at `s = ⅓`, `d0` 0.10, 600 delvers, 0.0006 / 0.0012 / 0.0024 ETH a repair pays the operator $19.95 / $39.81 / $77.12 a day (ETH $2,682) for −0.5 / −0.7 / −2.8 % runs; burn, minting, supply and merchants do not move; in the four reference cells 0.0012 earns $21–40 a day for −0.35 to −0.74 % runs. **Pre-registered rule** (verdict unchanged, runs ≥ 95 % of the fee-free control, merchant P&L within one seed spread): 0.0006–0.0024 pass in all four cells; **0.0048 fails three of four** — a tier-1 repair (30 token + 240 token-equivalent) then costs more than minting (220), so repairs fall 12.5 → 2.7 a day, 8.6 items a day are scrapped and re-minted, runs fall 4.7–8.8 % and the operator earns less than at 0.0024. **Stress** (wallet cap 15/30/60 days × income spread σ 0.8/1.2): **0.0012 passes all six** (runs +0.2 to −2.4 %); **0.0024 fails four** — runs −5.5 / −6.8 % with a 60-day cap, and the verdict at σ 0.8 on one seed's supply slope (+1.005 / +1.04 %/yr against the 1 %/yr line). Predicted wrong: looser budgets make the fee dearer in runs, because more of the poor play, at their margin. **Half the mint ETH to the operator changes nothing but the treasury** (100/100 pairs identical in every other column): $7.61 a day at the reference cell. **Recommended, by the pre-registered rule: 0.0012 ETH**; with half the mint ETH and the Pons creator fee the operator takes $0.0796 per delver per day (first look: $0.0794). **Who pays, and why it is nearly free:** delvers spend 11.2 % of their ETH income at baseline (88.8 % overflows the 30-day wallet; 6–37 % across every control). The poorest fifth never plays; the top three fifths pay the fee in proportion to their runs, but it is 19 % of the middle fifth's income against 3.7 % of the top fifth's (the middle fifth's game spending goes from 23 % of its income to 43 %); two thirds of the runs lost are the second fifth's. **Not verified:** real budgets — the result rests on the model's slack; a token-price move (the cliff is where 30 token + the fee passes the mint-equivalent, near 0.003 ETH if the token halves in price — inference); the sweep's summary crashed after every run and the CSV were written (a division by zero), and its tables were rebuilt from the CSV (`--report`, no run) | `.venv/bin/python sim/operator_fee.py` (~30 min, 3 workers; `--repro` 23 s; `--report` rebuilds the tables) → `sim/out/operator_fee.csv`, `operator_fee.log`; `docs/capital.md` §3–4 |
| Which strategies and cheats beyond bots break this design | **Red-teamed 2026-10-03 — three independent lenses (protocol, player and guild, market and token) plus the orchestrator's candidates, merged into 27 entries and judged against the live chain probes; a fourth lens and the planned skeptic pass were cut off by a session limit, so the verdicts are one reader's** (`docs/red-team.md`). In order: the death rate decays with organisation and mastery and the reference economy has about a fifth of headroom (the first-look probes said an organised quarter dying a tenth as often takes days-with-a-mint from 75 % to 39 % and a fresh-drop budget tied to gear destroyed restores 75–83 %; **measured since, next row: 75 % → 40 %, and 86 % with the budget**); loot weighted by contribution and level with no term for value at risk rewards the cheapest kit, many wallets and bought level; survivors profit from shard-mates' deaths and one delver can shut recall for twenty; the settlement key can declare every equipped kit dead unless entry is per run; a reverting recipient can stall settlement; the per-tick public seed of §3.4 lets a bot time the kill; mint prices fixed in token make the coin's chart the entry price (probe: 5× dearer loses 41–43 % of runs, 10× 58–61 %). **Not verified:** every remaining probe number — price shocks, stripping, false prints (≤ 3 seeds, patched copies, not committed); the death-rate probes are redone in the next row; severity and likelihood are judgements | `docs/red-team.md`; probes named there |
| Organisation and mastery break the sink, and a fresh-drop budget tied to gear destroyed, enforced by contract, holds it (red team A1, A2) | **Measured in the v1 model, pre-registered — 210 runs × 10,000 days × 5 seeds, byte-reproducible; with both additions off the patched model is `economy2` bit for bit (10/10 grid runs, 5/5 off-grid pairs); both ledgers exact every day (2026-10-03).** Pass = `economy2`'s verdict, unchanged, and *the sink holds*: mint burn ≥ half the fix-free reference (per-head rule, nobody organised, design `d0`) on every seed. **Breaks — the probes were right.** Under today's per-head fresh roll, at `s = ⅓`, `d0` 0.10: the most skilled quarter dying a tenth as often takes days-with-a-mint from 75 % to 40 % (fail; a third as often: 49–53 %, fail); half, to 2 %, tier 1 trading at 63 token against its 220 mint-equivalent; uniform mastery fails from `d0` 0.08 (38 %) and passes at 0.09 (61 %). The line is 5.5–5.8 % deaths per run (reference 6.5 %) or 3.2–3.35 % of value wagered destroyed by death (reference 3.8 %): **about a fifth of headroom.** At `d0` 0.20 it breaks from half organised, on the sink (minting alive; mint burn 442–641 a day on average against a reference of 1,258, under the floor of 629 on at least one seed). **What dies is minting, not the burn:** where minting dies (7 cells), tier 1 trades at 29–155 token, runs rise 24–59 % (priced out 39 % → 4–25 %), mint ETH to the treasury falls from 0.0057 to ≤ 0.0003 ETH/day, and total burn falls only 7–22 % because repair burn rises with the extra runs. The least skilled third carries 38–40 % of deaths with nobody organised and 63–65 % with half organised (86 % with three quarters). **The budget (fresh drops a day ≤ b × items destroyed by death over the previous 30 days ÷ 30; not recycled, not scrapped) at b = 0.5 passes 9 of the 14 failing cells:** all uniform mastery down to `d0` 0.05 (half the deaths; days-with-a-mint 76–90 %), an organised quarter, and every cell where the organised die a third as often but three quarters at `d0` 0.20. It fails 5: half or three quarters dying a tenth as often at `d0` 0.10 — minting alive (62–77 %), sink held, one seed's supply drifting +1.1–1.2 %/yr against the 1 % line — and at `d0` 0.20 on the sink's size (mint burn 327–583 against a floor of 629): **a budget cannot make deaths.** b = 0.25 passes both cells it ran, including half dying a tenth as often (90 % of days); b = 1.0 fails both (16–23 %). **Cost at the design point** (`d0` 0.10, nobody organised, b 0.5): fresh drops 5.0 → 3.4 a day, runs −3.7 %, priced out +2.3 points; tier 1 unchanged at 96 % of mint; merchant P&L unchanged; mint burn and treasury ETH +53 %. At `d0` 0.20 it barely binds. The pre-registered cost test (runs ≥ 95 %, priced out ≤ +5 points against per-head) fails at `d0` ≤ 0.08 — against per-head arms whose minting is dying: the runs it "costs" there are a glut's. Pre-registered recommendation: **b = 0.25** (two cells; its design-point cost not run); W = 30, untested. Probe claims: 8 of 9 held within tolerance; the budget under mastery did better than probed at `d0` 0.08–0.10 (87–92 % against 75–77 %). **Not verified:** learning, quitting and arrivals; a budget weighted by value, not items; any W but 30; b between 0.25 and 0.5 across the grids; whether the slice's Mend makes anyone nearly deathless | `sim/treadmill.py` (~20 min, 3 workers; reads `economy2.py` and patches it in memory, every anchor asserted unique) → `sim/out/treadmill.csv`, `treadmill.log`; `--repro` re-runs one cell byte-identically; `--report` reprints the tables |
| v0's placeholder pixel art (§7) can be drawn in code, with no art source and no budget | **shown; a first impression, not a play test (2026-10-02).** One self-contained page draws everything at runtime from letter grids — a 35-colour palette, 16 px tiles, 16×16 delvers and enemies, a 32×32 boss, 12×12 icons for ten gear items in three tiers, a 3×5 bitmap font — and plays: five rooms and a boss chamber from a seed, three bot delvers, a three-phase boss that bursts into bags, the §3.5 one-in-three death split, extraction. Run headless through the boss, a death and an extraction with no script errors, at desktop and phone widths. **Operator, two or three runs by hand:** did not beat it, counted that in its favour, and liked the style and feel. **Not verified:** that it is fun at $0 — a few runs are not that test — or that this is the art direction — the class, the boss, every name and stat are inventions (§4); two rules go beyond this spec (carried loot is lost on death; boss drops are pick-up bags, not the §3.5 lottery); the simulation is seeded floats, not fixed-point. Illustration — key art, a logo, large portraits — is outside what this method produces. **Added 2026-10-22, not yet played by the operator:** the sealed boss door with a three-second ready plate (§2 "The boss door": the rest recall with the wager, the door seals, the Turnkey's health scales to the head-count — 3600 × (0.4 + 0.15 n), a placeholder rule) and the one-room Gatehouse before every run (§2 "The hub": strongbox, fettering post, ledger as an honest placeholder, the shard door with the same plate, the Roll of the Forgotten with the cause of death and the seed standing in for a replay, the mint); the seed-0x0B11E77E dungeon is tile-identical to before; 20 screenshots and a headless Gatehouse → door → boss → death → Roll pass with no page errors. **Operator, 2026-10-22, played it:** "it's good"; the Gatehouse's interactables liked, but the hub should be a village outside the dungeon with NPCs behind desks (§2); the ordinary mobs a little too easy and regeneration too generous when low (§4); one defect — the player could be caught inside the portcullis as it sealed and escape only by Slip — fixed the same day (the door seals once the whole body is through, and anyone still in the doorway may walk out either way). **Added 2026-10-22, potions and the mobs (§2 "Healing", "Potions, the numbers", "The ordinary mobs"):** potions sold at the Mint (15 token, a placeholder) and dropped by the Turnkey (three) and now and then by mobs; five in the pouch; Q to drink a third of max health over two seconds, one at a time; no regeneration within four seconds of a hit taken or a shot fired, 0.5 HP/s after (was 2 HP/s always); lost on death, kept on extraction, the ones brought in kept on recall; the ally bots carry two and drink under 40 %. The ordinary mobs: more health, faster and harder bolts, shorter reloads, a wider wake — counts and the Turnkey unchanged. A headless autopilot (`proto/visual/proxy.cjs`, 80 seeded runs each way) died 7 of 80 before and 16 of 80 after, every death in the boss room: the rooms now wear the party down rather than kill a bot that dodges well — a sanity check, not the target. **Not verified:** that a person now dies about one run in seven to fourteen; the proxy is not a person. **Operator, 2026-10-23, played it:** the slower regeneration and the potions "feel a lot better"; the Turnkey "very difficult now, which is a good thing"; "the feel of the game is good"; but the rooms "still feel quite easy", Sunder "quite strong", and bolts should go further and feet move faster. **Tuning pass two, the same day:** player bolts +24 % range (136 → 169 px), feet +12 % (64 → 72 px/s; allies 58 → 65), Sunder a third weaker (×3 → ×2 a bolt) and 6 → 8 s; the rooms: faster, harder bolts (Forgotten 76 → 100 px/s, 9 → 11; Shade a fan of five, 66 → 84; Gaoler a ring of 14 at 60, 13 → 15), shots that lead the target, one more body in rooms 1 and 2, the last Gaoler always drops a potion; the Turnkey's bolts sped up only enough to hold him against faster delvers (16 of 80 proxy deaths before and after, 4 of 80 with the feel changes alone); the rooms kill the proxy once in 80 where they never did. **Not verified:** that the rooms now feel dangerous to a person — the bot dodges by proximity and the allies draw the fire | `proto/visual/index.html` — open it; `node proto/visual/shots.cjs` → `proto/visual/out/` |
| Art for dungeons after the first can be banked ahead, in the same style, as data | **banked, not judged (2026-10-02).** `art/` holds 99 sprites — 191 looks once recolours are counted — as letter grids over the slice's 35-colour palette: 4 class looks, 17 enemies, 5 bosses, 17 gear families in three tiers plus 6 relics, the slice's 3 skill items, 9 consumables, 20 props, 9 projectile shapes, 9 interface icons, and 5 dungeon tilesets from one tile generator. A gallery page draws all of it, each dungeon as a mock room with its cast. `check.cjs` validates every sprite against the palette and confirms that the 22 sprites the slice draws are identical to the slice's own copies. **Not verified:** nothing banked has been in a playable dungeon; every name, class and dungeon theme is a placeholder (§4); no stats, drop tables or behaviour attach to any of it; the slice does not load the bank — it still carries its own copy | `art/index.html` — open it; `node art/check.cjs`; `node art/shots.cjs` → `art/out/` |
| How dungeons should grow after the first, and which interactables fit a co-op permadeath game | **Researched 2026-10-05 from the reference games, sourced; a design judgement, not a measurement** (`docs/dungeons.md`, sources in `docs/dungeons-web-notes.md`). RotMG's hardest dungeon (Oryx's Sanctuary) is the slice's shape with gates — three gated rooms, a miniboss, a corridor, the boss; its 64–81-room mazes work only with teleport and 20–30 people on voice; the room-graph roguelikes (Isaac, Gungeon, Hades, Dead Cells) use 7–12 rooms, one loop, dead ends one room deep. Two-player plates and traps are griefing tools where strangers profit from a death; chosen risk (a dark branch, an optional miniboss) is the lever mastery does not erode. A sizing sketch (`docs/dungeons-layouts.txt`, 20 seeds): the slice ~4.3 min on the spine, the eleven-room graph ~5.3 (7.8 with every side room), a sixteen-room one ~6.9 (11.3). **Decided on it (§2, 2026-10-20):** v0 six rooms plus the sealed door; dungeon two after E1. **Not verified:** E1–E4 are written, not run; typical RotMG run lengths; Hades' chamber counts; RotMG's own generator; the sizing generator was a scratch script and is not in the repo, so its table cannot be re-run; several fandom pages were read through search summaries only | `docs/dungeons.md`; E1–E4 pre-registered there for `sim/economy2.py` in the `sim/treadmill.py` style |
| How a dead player gets back in, and whether re-entry can be made safe | **Researched 2026-10-05, sourced; design inference, not simulated** (`docs/reentry.md`, sources in `docs/reentry-chat-trade-web-notes.md` part A). Every reference permadeath game re-enters with a new character and banks progress account-side (RotMG, Diablo hardcore, Hades, Dead Cells); Tarkov's Scav run is the free loadout; RotMG closes a dungeon portal 30 s after it opens, so the same instance cannot be rejoined. Same-run re-entry breaks three red team rules until they are in the contract: a death would feed the pool of its own run (rule 3), the cheapest kit would win the lottery (rule 2), and cheap deliberate deaths would count as destruction and unlock fresh drops (rule 1 — `sim/treadmill.py` counts items, not value). A loadout needs no new contract — equipping a kit of four is one $0.004 transaction (the gas row above); a kit NFT costs more gas and makes a contract the recipient (red team D3). **Decided on it (§2):** next-run re-entry in v0, same-run after the rules, the recycled third to a global pool with a delay (2026-10-20); the unwagered run, accepted as a default on 2026-10-20, was reversed on 2026-10-22 for a tutorial and a training ground — nobody enters a real dungeon with nothing at risk. **Not verified:** any RotMG chat or trade gate by rank; Tarkov beyond Wikipedia and one patch report; a batched mint-and-equip (inferred ~$0.03, not measured); whether a live ghost camera harms a co-op shard; none of the rules is simulated — "deliberate cheap deaths under same-run re-entry" is a treadmill probe to run before it ships | `docs/reentry.md` |
| Whether a chat and a trade window belong in v0, and what each costs | **Researched 2026-10-05, sourced; design inference** (`docs/chat-trade.md`, sources in `docs/reentry-chat-trade-web-notes.md` part B). RotMG never had a market — its market is a fan site and its trade window a documented scam list (the deselect trick, look-alike items, the multi-window swap); OSRS removed free trade in December 2007 against real-money trading and restored it in February 2011 after a referendum, and the RMT moved; the Grand Exchange replaced shouting with matched offers and carries a four-hour buy limit per item and a cap on open offers. Wallet-drainer phishing took about $494 M from 332,000 addresses in 2024 (Scam Sniffer): no links, no signature asked from inside a message. OpenSea abandoned allow-list fee enforcement in August 2023. **Decided on it (§2, 2026-10-20 and 2026-10-22):** no trade window; dungeon, local and private channels, canned call-outs first; one handle per wallet. **Not verified:** any official RotMG chat gate by rank or level; the trade-window countdown; several Tarkov and Diablo IV details come from secondary pages; the 7.5 % and $3-a-day leak figures are the red team's estimates, not measurements | `docs/chat-trade.md` |
| What a hub is for, and how much of one v0 needs | **Researched 2026-10-05 from eight reference games, sourced; design inference** (`docs/hub.md`, sources in `docs/hub-web-notes.md`). Every hub that works holds something the game cannot take (RotMG's Nexus: the escape, the vault, the portals; OSRS's Grand Exchange: the market as a place; Tarkov's hideout: offline progression); where hubs broke it was chat and crowding, never the vault; RotMG ran nine months with no hub (public January 2010, the Nexus October 2010). Two findings change the spec's picture: the vault is the wallet (equip is a lock flag, `docs/chain.md` §4, so there is no vault contract and no slot revenue), and equip and entry can be one action. The art bank holds the room's props; the cost is the screens. **Decided on it (§2, 2026-10-20):** a one-room Gatehouse in v0; the dead named on the Roll; equip is entry; the Undercroft after the gauge. **Not verified:** fandom and poewiki pages were read via the Wayback Machine; the RotMG Nexus per-instance cap (300) is inferred from the server cap; Sea of Thieves outposts as safe zones; the PoE trade manifesto; every head-count, bandwidth and build-time figure is inference | `docs/hub.md` |
| What a longer dungeon run does to the v1 economy's sink, and what per-run danger and wear must do with length (`docs/dungeons.md` E1, with E4) | **Measured in the v1 model, pre-registered (docstring hash `e6e7df195808`) — 80 runs × 10,000 days × 5 seeds, byte-reproducible (`--repro` 5/5 rows); with nothing switched on the patched model is `economy2` bit for bit (5/5 reference runs, 3/3 off-grid pairs moving `p_run`, `d0`, wear and N); both ledgers exact every day; incomes held at the v1 calibration in every cell; no arm degenerate (largest per-run death chance 0.40) (2026-10-22).** `p_run` stands for run length at the same play time a day (0.25 = twice the slice, 0.125 = four times), so "a day" reads "an hour of play"; `s` = ⅓. Pass = `economy2`'s verdict, unchanged, and the sink holds (mint burn ≥ half the reference's 341 token a day on every seed). **The band per run (`d0` 0.10 at every length) makes a smaller economy, not a dead one:** every flow per hour of play falls with runs — at twice / four times the length, runs 182 → 91 → 45 a day, deaths 11.8 → 5.9 → 3.0, mints 2.84 → 1.45 → 0.73, mint burn 341 → 174 → 88 token, total burn 773 → 389 → 195, treasury ETH halved and quartered — while nothing per run moves (6.5 % of runs end in death, 3.8 % of value wagered is destroyed, tier 1 at 210 of 220 token, 39–40 % priced out). Minting is alive in kind (days with a mint on exposure-matched windows 0.71–0.81 against the reference's 0.73–0.76); the sink is what shrinks: at twice the length it holds by half a token on the worst seed (170.9 against 170.4) and the verdict turns on one seed's supply slope (+1.06 %/yr at wear 0.08, fail; viable at 0.16 and 0.32); at four times it fails (mint burn 82–90, days with a mint 0.39–0.44). **No wealth effect:** runs fall exactly with `p_run` and priced-out does not move — the poor are priced out by the 30-day wallet cap, not by how often they run — so the spare budget goes unspent (11.2 % → 5.8 % → 2.9 % of ETH income). **Per-run danger raised with length (the band per hour, `d0` 0.20 / 0.40) more than restores the sink:** deaths a day stay at the reference's (11.6 / 11.5 against 11.8) but fresh drops are a per-run reward and fall with runs (5.0 → 2.1 → 0.8 a day), so mints a day double / rise 2.4× (5.6 / 6.9), mint burn 657–687 / 812–861, total burn +34 / +38 %, treasury ETH ×2.0 / ×2.4, every cell ROBUST (days with a mint 0.97–1.00); value destroyed a day falls 24.5 / 35.5 % because t2/t3, supplied only by drops, fall from 24 % of runs to 11 / 4.5 %. Cost: 13.4 % / 27.2 % of runs end in death (the least skilled third 17.6 / 35.6 %), runs −4.5 / −6.4 % and priced out +2.8 / +3.9 points against the band per run. **Wear moves repair burn and nothing else** (mint burn is the same in every wear arm): wear per stage brings repair burn back to 1.17× the reference at twice the length (−1.1 % runs) and 1.05× at four times (−0.8 %); at today's length doubling / quadrupling wear burns 2.3 / 4.0× for −2.2 / −5.8 % runs; it cannot rescue the band per run at four times the length. **Pre-registered hypotheses:** H1, the null (band per hour with wear per stage changes nothing), **fails** — deaths a day within seed noise, every other flow outside (mints +98 / +142 %, fresh drops −58 / −84 %, value destroyed −24.5 / −35.5 %, burn +34 / +38 %): the drop table is per run. H2 (twice the length at today's danger fails like `d0` 0.05) **fails** — days with a mint 0.56–0.61, minting alive: `d0` 0.05 cuts deaths against the same fresh drops per run, fewer runs cut both. H3 (unchanged wear halves repair burn) **holds** (0.50×). **E4** (half the runs per head is not half the heads) **fails**: 600 delvers at `p_run` 0.25 and 300 at 0.5 match within seed noise in runs (90.8 / 88.4), mints (1.45 / 1.49), burn (389 / 385) and the tier-1 price — in this model half the runs per head is half the heads. Two predictions were wrong (a wealth effect; E4 differing) and are reported, not retuned. "More at the door, more at the end" — a dearer entry and richer drops per run — was not in the grid. **Not verified:** that players keep their hours of play when runs lengthen; real budgets (with the model's slack, cadence prices nobody out); a drop table per dungeon; whether 13–27 % of runs ending in death is fun; E2 and E3 not run | `.venv/bin/python sim/run_length.py` (~4 min, 3 workers; reads `economy2.py`, applies `treadmill.py`'s six patches unchanged plus one, in memory, every anchor asserted unique) → `sim/out/run_length.csv`, `run_length.log`; `--repro` re-runs one cell byte-identically; `--report` reprints the tables; `docs/dungeons.md` "E1 — result" |
| Whether a creator launchpad is needed to launch the token, and which | **Researched 2026-10-22, a quick stab: about 25 web fetches and two read-only RPC reads; verdict inferred, not decided** (`docs/launchpad.md`). Not needed for the token itself — a plain ERC-20, and Uniswap v2, v3, v4 and UniswapX are live on 4663 as its primary AMM (Uniswap's post of 2026-07-02, re-read here); needed for one thing: a public price without the operator owning liquidity, which the guardrails forbid — a launchpad is a bonding curve whose buyers' ETH becomes the locked pool. Two live: Pons v2 (pseudonymous team, v2 unaudited, ~$2 to launch, the creator earns 0.7 % of volume in ETH, the payout redirectable after a public three-day delay; the factory is not an upgradeable proxy — MEASURED: EIP-1967 slots all zero; ~$29 M of fees in 30 days per DefiLlama's API) and Pools.trade (Uniswap Labs, since 2026-08-05: Instant, or a four-hour Crowd sale with a $10 k bar; a permanently locked v4 pool; 0.25 % LP fee, creator up to 0.05 %; no launchpad fee; no vetting — re-read here). Noxa and Vlad.fun, the chain's other two launchpads, are dead. Neither touches the gear NFTs or the game's exchange; the one thing to rule out is a tax inside the token's own `transfer()`. Recommendation: Pools.trade unless the Pons creator fee is wanted ($11 a month per 600 delvers at the model's volume against under $1); neither pays the bills, the repair fee does. **Not verified:** docs.ponsfamily.com returned 403 today, so the Pons facts rest on the 2026-10-02/03 reading and two secondary sources; that either launched token's `transfer()` is untaxed (one simulated transfer settles it); Pools.trade's lock control and admin powers; Robinhood Wallet's swap support; pool-creation gas on 4663 | `docs/launchpad.md` |
| A deterministic fixed-tick server sustains ~50–85 players per shard at bullet-hell tick rates in the browser | **assumed** from RotMG's realm cap; measure |
| RotMG realm cap ≈ 85; permadeath + tradeable items → a decade-old RMT market; the loop retains players with worthless items | **verified 2026-10-01, web.** Realm cap is exactly **85** ([Wikipedia](https://en.wikipedia.org/wiki/Realm_of_the_Mad_God); [RealmEye general realm guide](https://www.realmeye.com/wiki/general-realm-guide) — the cap includes players in the realm's dungeons; full realms queue). **Retention with worthless items:** launched 2011-06-20, still live as Exalt (2020 Unity remaster) — 15 years of permadeath + tradeable items with **no sanctioned cash-out and no standard currency** (item-for-item trade; stat potions as de-facto money). **RMT:** a commercial market operates openly today — [RPGStash](https://www.rpgstash.com/realmofthemadgod/) sells potions and gear for cards/PayPal/BTC with 5-minute delivery, and Steam-group threads hawk life pots for CS:GO/TF2 items — its *age* is not pinned by these sources, so say "live commercial RMT market", not "decade-old", on public surfaces |

## 6. Risks

- **Legal shape.** Permadeath + tradeable value + dice-roll drops is lottery-shaped; NFTs with
  real value; stock payouts. One counsel pass before contracts are written, same line as the
  arena. Also: a game with this shape on a *regulated broker's* chain — permissionless or not,
  the chain operator's tolerance is a question to ask, not assume. Added 2026-10-03
  (`docs/capital.md` §6): Robinhood's stock tokens are "tokenized debt securities" not to be
  "offered, sold or delivered" to US persons, enforced at the front end only — a game that
  sends them to unidentified winners is the party delivering them; New York sued Valve over
  resellable loot-box prizes in February 2026 while Austria's Supreme Court judged loot boxes
  inside a skill game with the game — the more the roll is weighted by skilled play, the better.
- **No revenue line.** As specified the operator earns nothing and the simulated economy at
  600 delvers moves $68 a day (`docs/capital.md`). Until §4's revenue decision is taken, every
  budget is funded from outside the game.
- **Token-price coupling.** The economy is denominated in the token; if the fun depends on the
  price, the game's life is the chart. Mitigated only by §2 "fun at $0" being true.
- **Bots and RMT.** Certain to arrive. §4.
- **Scope.** The single largest risk. §7.
- **The server is the operator's.** Verifiability makes cheating detectable; the operator still
  runs the truth. Say so on the site, as the arena does.
- **Art.** No art, no game.

## 7. Scope: what v0 is, and is not

**v0 — the vertical slice, the smallest thing that tests "people will burn tokens for gear they can
lose and trade":** one class · one dungeon · one boss · six rooms in a line behind a sealed boss
door with a ready plate · ~10 gear items across ~3 tiers · one skill per delver, a wagered item · a
recall that pays nothing and stops at the boss · one shard (~20 players) · a village hub outside the
dungeon — NPC desks for the strongbox, the fettering, the ledger, the roll and the mint, and the way
to the dungeon · permadeath with vault · re-entry into the next run with a saved loadout · a
tutorial and a training ground with practice dummies (no wager, no loot) · on-chain mint / equip /
unequip / drop · durability + repair kits · a minimal offer-based exchange · dungeon, local and
private chat beside the log · deterministic server with replay · browser client, placeholder pixel
art.

**Not v0:** stock/bucket drops (the ETH treasury accumulates, unspent) · world boss across shards ·
cosmetics · the market city — the Undercroft (`docs/hub.md`), after the one-dungeon release gauges
interest · dungeon two — the eleven-room graph, the dark branch, the key and the locked room
(`docs/dungeons.md`, after E1) · same-run re-entry (`docs/reentry.md`, after red team rules 1–3 are
in the contract) · targeted offers (`docs/chat-trade.md`); a trade window, ever · crafting ·
multiple classes · pets · governance · anything called "expanded gear system" · everything in `art/`
that the slice does not already draw (four more dungeon tilesets with their casts and bosses, three
more class looks, fourteen more gear families).

**The first release is the one dungeon, to gauge interest (operator, 2026-10-02).** Art for more
is banked ahead in `art/` so that continuing is cheap if the interest is there. It is data and a
gallery page, wired into nothing: banking a sprite does not move it into v0.

**Before v0:** the economy simulation (§8, step 1). If it finds no equilibrium, v0 is redesigned
before it is built.

## 8. What happens next

1. **New repo** (name: Appendix A), seeded with this note as `SPEC.md`, a `CLAUDE.md` in the
   Upwind pattern, and the `feat/` · `fix/` · `update/` · `chore/` conventions.
2. **Agent-based economy simulation** — Python, a day. *Done for v0 (`sim/economy.py --sweep`, §5): it settles `s` against `d`. No budget binds in v0, so the fee constants and the halving need the next sim: a binding budget, explicit merchants with real balances, demand for every tier. Done for v1 (`sim/economy2.py --sweep`, §5): budgets bind and the equilibrium holds; no fee cell passes all tests — mint cost sets participation, repair is a near-free sink, the fee is paid by merchants; a 2× price move re-equilibrates at a different size. Open in the sim: token cash-out, learned merchant spreads, a wealth effect on tier demand. E1 — run length against the band and wear (`docs/dungeons.md`) — is done, before dungeon two as asked (`sim/run_length.py`, §5, 2026-10-22): a longer run at today's per-run danger shrinks the sink per hour of play in proportion, per-run danger raised with length more than restores it, wear per stage restores repair burn only; which to build is the operator's choice (§4).* Populations of delvers (risk appetite,
   skill → death rate) and merchants (spread, inventory); mint, burn, death with recycle
   fraction `s`, durability, repair, trade with fee; token bought exogenously at a price path.
   Run 10,000 simulated days across a grid of `s`, `d`, mint and repair costs, and a
   token-price halving. Outputs: item supply over time, token burn rate, gear price in token,
   whether minting stays attractive, what fraction of value dies vs recycles. **Decides `s` and
   the fee constants before any pixel.**
3. **Loop design** — one class, one dungeon, on paper and then in a throwaway prototype; the
   only question is whether it is fun with worthless items.
4. **Vertical slice** (§7). *Next in the slice (2026-10-20): the sealed boss door with its ready plate
   and the one-room Gatehouse (`docs/dungeons.md`, `docs/hub.md`), then the thirty-run play test with
   people — nobody has measured a human death rate, and Mend and recall both lower it.*
5. Contracts (gear, exchange, treasury) once 2–4 say the thing is worth building; the RH Chain
   `blockhash` probe and the stock-transfer check happen first because both can kill the
   design cheaply. *Before the first line of Solidity: the twelve rules in `docs/red-team.md`
   ("Rules to decide before any contract is written") and the counsel questions it and
   `docs/capital.md` raise (stake-weighted prizes; delivering stock tokens to winners).*

---

## Appendix A — Name candidates

Short, works as repo + token ticker + site, and says something true about the game. Collisions
noted where known; trademark search is not possible from this sandbox and must be done before
choosing.

| Name | Why | Notes |
|---|---|---|
| **Oubliette** | A dungeon whose name means *the place of forgetting* (French *oublier*). Permadeath is being forgotten; the dungeon is the game. Distinctive, real, dark in the right way. | Costs a pronunciation (oo-blee-ET). The obscure PLATO game is **1977** (DOS port 1983). Collision scan (2026-10-01, web): several tiny indie titles on itch.io, a 2023 Playdate game *Down the Oubliette*, a Steam developer label "Oubliette" (2018) — nothing dominant; a first-pass USPTO/Justia search surfaces **no live games-class mark**, but that is a scan, not clearance — counsel does the real search before anything public. Ticker awkward — pair with a short token name. **My pick for the game.** |
| **Forfeit** | The mechanic in one word: die and your gear is forfeit. Verb and noun, plain English, honest about the risk. | Best as a ticker ($FORFEIT). Slightly negative framing — which is the point. **My pick if you want plain English, and a strong token name under any game name.** |
| **Hazard** | The medieval dice game that gave English the word for risk. Permadeath plus dice-roll drops, in one word people already know. | Common word; likely collisions in games and crypto. |
| **Reliquary** | Where relics of the dead are kept. Dead players' gear becomes relics others claim; the exchange is the reliquary. Elegant, fits the merchant loop especially. | Long. |
| **Spoils** | Loot — and *to spoil* is to go bad, which is what your gear does when you die. Short, double meaning. | Generic-ish. |
| **Undercroft** | The vault beneath. Where the exchange and the market-city would live. | Better for the city than the game. |
| **Ossuary** | The bone-house. Darker than Oubliette; same idea with less mystery. | Grim. |

Avoid: *Hardcore* (a mode name everywhere), *Bazaar* (Rare's 2024 game), *Relic* (Relic
Entertainment), *Stake* (crypto collision), *Delve* (widely used).

## Appendix B — Considered and rejected

| Idea | Why not |
|---|---|
| Single global simulation | Unplayable at bullet-hell density; MMO-scale netcode; unverifiable. Shard the sim, globalise the world (§3.3). |
| Dropped gear fully recycled as loot | Removes the only sink; item supply only grows; prices → 0; minting stops; the token loses its sink. Partial recycle + durability (§3.5). |
| Bosses dropping the game token | Every payout gets sold; the treasury becomes sell pressure. Operator's rule: never. Stock/buckets funded by the ETH side (§3.2). |
| Gear upgrades | A power source and an inflation vector. Repair only. |
| Play-to-earn emissions | The thing that killed the genre. The game emits items, never the token. |
| Isometric / 3D | Cost, bug surface, and nondeterminism. Top-down 2D (§2, §3.4). |
| Building the game first | The engine is known technology and the fun is proven by RotMG; the economy is the unknown and the killer. Simulate it first (§8). |

## Appendix C — Related

- `connectome-arena.md` §3.2 (seed the sim from block hashes), §3.5 (external-asset pool,
  stock-token transfer caveat) — reused here verbatim; now the spec of `Aothe/upwind`.
- B15 in `rh-chain-venture-ideas.md` — the cousin: fee-funded strategies inside *other* games'
  economies. This one owns an economy.
- Vector (`Aothe/vector`) — fee splitter; `Aothe/Tracking-tracker` — the A1 forensics rig for
  the exchange.
