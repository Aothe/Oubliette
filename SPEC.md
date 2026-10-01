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

### 3.7 The exchange

The GE, not an order book with market clearing at every tick: **offers** (buy X at up to P, sell
X at no less than P), matched by the contract, with price history public. Priced in the game
token; the fee burned. Items are NFTs, so listings are escrowed; consumables are fungible or
semi-fungible (ERC-1155) and trade like commodities. Whether the offer book lives fully on chain
(0.1 s blocks make this plausible on RH Chain) or as an off-chain book with on-chain settlement
is an open question for the new repo. So is whether the walkable market-city (stalls, a Grand
Exchange building) is v1 or later — it is the merchants' *place*, and the place matters to that
loop the way the dungeon matters to the other. Not v0.

**Reuse:** Vector's fee splitter for the exchange fee; the A1 listing-forensics rig turned on
the exchange for wash trading and RMT patterns from day one.

## 4. What the operator has not decided, and should not yet

- **Class and combat design** — RotMG has 17 classes; v0 has one. What makes the loop fun at $0
  is the whole question and it is answered by playing, not by writing.
- **Death-rate tuning** — the economy's death rate `d` and the game's difficulty are the same
  dial. The sim says what `d` the economy needs; the vertical slice says whether that `d` is fun.
  v1 (§5): minting needs `d0` ≥ 0.10 at `s ≤ ⅓` and 0.20 at `s = ⅔`; a higher `d` also prices out more.
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
  off chain. Open, and serious.
- **Exchange mechanism** — on-chain offer book vs off-chain book with on-chain settlement (§3.7).
  The fee is set against the merchant loop, not participation: v1 (§5) — delvers never feel it;
  merchants profit up to 5 % (at `s = ⅓`), break even at 10 %, lose at 20 %.
- **Engine** — a deterministic fixed-tick server in TypeScript or Rust; a canvas/WebGL client
  (Phaser or bespoke). Browser-first: RotMG was a Flash game.
- **Art pipeline** — the bottleneck. Pixel art is the most tractable style for commission or
  generative-plus-hand-finish; still needs a source and a budget.
- **What persists across death** beyond the vault — fame, unlocks, cosmetics, a pet?

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
| Stock tokens on RH Chain transferable to arbitrary addresses | **YES — verified 2026-09-25, live.** SNDK (`0xb90a19ff0af67f7779aff50a882a9cff42446400`, "Sandisk Corporation • Robinhood Token", 18 dec) is an EIP-1967 **beacon proxy** (beacon `0xe10b6f6b…1b00`, implementation `0xb35490d6…5ae2`, 11,614 B) whose implementation exposes `paused()`/`pause()`, AccessControl, `mint`, `permit` and **no blocklist / whitelist / freeze / restrict selectors or strings**; `paused()` = false. Simulated `transfer(1)` succeeds from the MOO pool *and* from an ordinary EOA holder to two never-seen addresses; 2,652 transfers / 487 counterparties in the prior ~5.6 h. **Caveats:** upgradeable through the beacon (Robinhood can add gating later) and pausable — hold stock briefly, pay out promptly, never warehouse it |
| A deterministic fixed-tick server sustains ~50–85 players per shard at bullet-hell tick rates in the browser | **assumed** from RotMG's realm cap; measure |
| RotMG realm cap ≈ 85; permadeath + tradeable items → a decade-old RMT market; the loop retains players with worthless items | **verified 2026-10-01, web.** Realm cap is exactly **85** ([Wikipedia](https://en.wikipedia.org/wiki/Realm_of_the_Mad_God); [RealmEye general realm guide](https://www.realmeye.com/wiki/general-realm-guide) — the cap includes players in the realm's dungeons; full realms queue). **Retention with worthless items:** launched 2011-06-20, still live as Exalt (2020 Unity remaster) — 15 years of permadeath + tradeable items with **no sanctioned cash-out and no standard currency** (item-for-item trade; stat potions as de-facto money). **RMT:** a commercial market operates openly today — [RPGStash](https://www.rpgstash.com/realmofthemadgod/) sells potions and gear for cards/PayPal/BTC with 5-minute delivery, and Steam-group threads hawk life pots for CS:GO/TF2 items — its *age* is not pinned by these sources, so say "live commercial RMT market", not "decade-old", on public surfaces |

## 6. Risks

- **Legal shape.** Permadeath + tradeable value + dice-roll drops is lottery-shaped; NFTs with
  real value; stock payouts. One counsel pass before contracts are written, same line as the
  arena. Also: a game with this shape on a *regulated broker's* chain — permissionless or not,
  the chain operator's tolerance is a question to ask, not assume.
- **Token-price coupling.** The economy is denominated in the token; if the fun depends on the
  price, the game's life is the chart. Mitigated only by §2 "fun at $0" being true.
- **Bots and RMT.** Certain to arrive. §4.
- **Scope.** The single largest risk. §7.
- **The server is the operator's.** Verifiability makes cheating detectable; the operator still
  runs the truth. Say so on the site, as the arena does.
- **Art.** No art, no game.

## 7. Scope: what v0 is, and is not

**v0 — the vertical slice, the smallest thing that tests "people will burn tokens for gear
they can lose and trade":** one class · one dungeon · one boss · ~10 gear items across ~3 tiers
· one shard (~20 players) · permadeath with vault · on-chain mint / equip / unequip / drop ·
durability + repair kits · a minimal offer-based exchange · deterministic server with replay ·
browser client, placeholder pixel art.

**Not v0:** stock/bucket drops (the ETH treasury accumulates, unspent) · world boss across
shards · cosmetics · the market city · crafting · multiple classes · pets · governance ·
anything called "expanded gear system".

**Before v0:** the economy simulation (§8, step 1). If it finds no equilibrium, v0 is redesigned
before it is built.

## 8. What happens next

1. **New repo** (name: Appendix A), seeded with this note as `SPEC.md`, a `CLAUDE.md` in the
   Upwind pattern, and the `feat/` · `fix/` · `update/` · `chore/` conventions.
2. **Agent-based economy simulation** — Python, a day. *Done for v0 (`sim/economy.py --sweep`, §5): it settles `s` against `d`. No budget binds in v0, so the fee constants and the halving need the next sim: a binding budget, explicit merchants with real balances, demand for every tier. Done for v1 (`sim/economy2.py --sweep`, §5): budgets bind and the equilibrium holds; no fee cell passes all tests — mint cost sets participation, repair is a near-free sink, the fee is paid by merchants; a 2× price move re-equilibrates at a different size. Open in the sim: token cash-out, learned merchant spreads, a wealth effect on tier demand.* Populations of delvers (risk appetite,
   skill → death rate) and merchants (spread, inventory); mint, burn, death with recycle
   fraction `s`, durability, repair, trade with fee; token bought exogenously at a price path.
   Run 10,000 simulated days across a grid of `s`, `d`, mint and repair costs, and a
   token-price halving. Outputs: item supply over time, token burn rate, gear price in token,
   whether minting stays attractive, what fraction of value dies vs recycles. **Decides `s` and
   the fee constants before any pixel.**
3. **Loop design** — one class, one dungeon, on paper and then in a throwaway prototype; the
   only question is whether it is fun with worthless items.
4. **Vertical slice** (§7).
5. Contracts (gear, exchange, treasury) once 2–4 say the thing is worth building; the RH Chain
   `blockhash` probe and the stock-transfer check happen first because both can kill the
   design cheaply.

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
