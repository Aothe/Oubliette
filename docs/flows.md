# How it works, end to end: the token side and the item side

*2026-10-23. A plain-English map of the system as decided, for the operator. Every row points at
where the rule lives (SPEC §2 decisions, §3 mechanism, `docs/chain.md` §4, `docs/red-team.md`
rules 1–12, `docs/launchpad.md`, `docs/release.md`). Numbers marked "placeholder" are the slice's
or the model's, not decisions. Nothing below is built except the slice; see `docs/release.md`.*

## In one breath

Two currencies, two kinds of thing. **ETH** pays gas and the ETH side of fees; it funds the piñata
and pays the operator. **The game token** is bought on the Pons curve and then on Uniswap, is the
unit of every in-game price, and is only ever **burned**: minting, repairing, trading and
(once simulated) entering all destroy some. **Gear** is a token you own in your wallet; it is at
risk only while locked into a run, and dying destroys two thirds of it and sends a third back to the
world as loot for others. **Consumables** — potions, repair kits, keys — burn when used. The chain
owns ownership and the rules of transfer; the server owns the fight; the input log lets anyone
check the server; the village is the screens over the chain calls.

## 1. The pieces

| Piece | What it is | Lives | Who can change it | Rule |
|---|---|---|---|---|
| The token | a plain ERC-20 born on Pons v2 with all 1 B on the curve; `burn` and `burnFrom`; no mint, no pause, no owner | chain | nobody — fixed supply, only falls | §3.2; `docs/launchpad.md`, measured |
| Gear | one NFT per item (ERC-721): kind, tier, durability, an `inRun` lock, the run id | chain | mint/repair by the player through the contract; the lock by entry and settlement only | §3.5; `chain.md` §4 |
| Items | potions, repair kits, keys (ERC-1155), burned on use, locked into a run like gear | chain | as Gear | §3.5; §2 "Healing", "Keyed entry" |
| Runs | opens a run with a committed secret, settles deaths and wear, rolls loot from the block hash, holds loot in a claims table, enforces the supply rules | chain | the settlement key, bounded to items locked into runs it opened; an offline cancel key during the delay | `chain.md` §3–4; rules 1–8 |
| Treasury | receives the mint ETH that is not the operator's; buys what bosses drop (not v0: it accumulates) | chain | no withdraw; a move to a new treasury after a one-week public delay, by multisig | §3.2; rule 9 |
| Exchange | an on-chain offer book: place, fill, cancel, withdraw; price history falls out of the events | chain | the players, through the contract | §2 "The exchange's book"; §3.7 |
| The server | the deterministic fixed-tick fight; signs a receipt for every input batch; publishes the input log | operator | the operator runs it; anyone replays it | §3.4; rule 8 |
| The client and the village | the renderer; the village's desks are panels over the chain calls | browser | — | §2 "The hub"; §5 |
| Indexer | reads events into the Roll, the price history, the strongbox view | operator (or a vendor) | — | `docs/release.md` |

## 2. Where the money goes

| Action | Who pays | Token | ETH | Where it ends up | Rule |
|---|---|---|---|---|---|
| Buy token on Pons (curve, then the Uniswap v4 pool) | player | — | price + 1 % fee | 0.3 % of the fee to Pons, **0.7 % of volume to the operator** as creator fee; the pool's liquidity is locked for good | `docs/launchpad.md` |
| Mint gear | player | **burned**; the token leg set **by value**, not a fixed count (placeholder 120) | fixed leg (placeholder 0.002) | half to the Treasury, **half to the operator** | §2 "The mint price", "How the operator is paid" |
| Mint a potion, a repair kit, a key | player | **burned** (potion placeholder 15; the key's price simulated first) | key's ETH leg open | as mint, if any | §2 "Potions, the numbers", "Keyed entry" |
| Repair | player | **burned** (placeholder 30) | **0.0012 ETH to the operator** | operator | §2 "How the operator is paid"; §5 |
| Enter a run | player, relayed | — | gas under a cent, sponsorable | — | `chain.md` §4 |
| Use a potion or a key | player | the item is **burned** | — | — | §3.5 |
| Die | the dead | two thirds of the kit **burned**, a third to the **global pool** (delayed) | — | the pool pays later finishers | §3.5 (`s` = ⅓); §2 "The recycled third"; rule 3 |
| Finish a run | — | recycled loot from the pool + fresh drops under a budget tied to gear destroyed | — | the lottery, weighted by contribution × value wagered; **claimed, never pushed** | §3.5; rules 1–3, 5 |
| Trade on the exchange | buyer and seller | price moves seller ← buyer; **fee burned** (placeholder 2 %) | gas | — | §3.7 |
| Settle and roll a run | operator | — | gas, cents per run | — | `chain.md` §2 |
| Boss drops in stock | — | — | the Treasury's ETH converted | winners (not v0) | §3.2; §7 |

What the operator earns, as decided: the repair leg, half the mint ETH, the Pons creator fee.
What the operator never does: hold token, own liquidity, keep the exchange fee, mint anything.

## 3. The life of a run

| # | Step | Where | What happens | The player sees | If it goes wrong |
|---|---|---|---|---|---|
| 1 | Sign in | browser | the wallet is the login; one signature authorises a throwaway session key for the session | the village | — |
| 2 | Fetter | village → chain | choose the kit, the skill, up to five potions, a key; nothing is locked yet | the Fettering post; "at risk once the door seals" | — |
| 3 | The gate | village → chain | stand on the plate; when the shard forms, **one relayed transaction** locks the kit, the skill, the potions and burns the key into run R until time T. A second lock on the same item fails: the chain is the tie-breaker | the door seals; the run begins | nothing fettered → the plate refuses |
| 4 | The run | server | the fight, at a fixed tick; the session key signs each input batch, the server answers each with a signed receipt naming the tick applied; recall saves the wager, never the loot, and shuts when the boss wakes; the sealed door at the boss, the rest recall | the dungeon | a run that cannot advance ends where it stopped: earlier deaths stand, the living leave with their wager and no loot; a hard tick limit |
| 5 | Settle | server → chain | one posting: deaths, each item's death split and wear as a root, each finisher's contribution and value wagered, the input log's hash and where to fetch it, the revealed secret | the death panel, the extraction panel | settlement may touch only items locked into this run; nothing posted within 72 hours → each wallet unlocks its own gear |
| 6 | Roll | chain, by anyone | loot rolled from the committed secret and the block hash fixed by rule after the reveal; recycled items go to a claims table | — | the roll is replayable by anyone from the log |
| 7 | Release | chain | after a one-hour delay (the offline key may cancel a stolen key's batch) locks drop, burns execute, claims open | the Roll row; "yours if you extracted" | the input log is public before any loot from the run can be sold |
| 8 | Collect | village → chain | winners claim; the strongbox updates; unequip at leisure by voucher or by request-and-wait | the strongbox | — |

Keyed entry (§2, in for launch) sits at step 3: a key is burned per entry, so re-entering the same
run costs another key; the boss scales to the head-count at the door. The cap on entries per run
and the key's price are open and simulated before the contracts fix them.

## 4. The life of an item

| State | How it gets there | At risk? | Tradeable? | What can happen next |
|---|---|---|---|---|
| Minted into the strongbox | mint (token burned, ETH taken) or claimed as loot | no | yes — list it on the exchange | fetter it; list it; repair it |
| Listed | an offer on the exchange; the item sits in escrow | no | it is the listing | filled (the buyer withdraws it), cancelled |
| Locked into a run | the entry transaction at the gate | **yes** | no — the lock blocks transfer | survive, die, recall |
| Survived | the run settled with the owner alive | no, after release | yes | wear recorded (lazily, at the next unequip); repair when worn |
| Recalled | the owner recalled before the boss | no | yes | wear applies; nothing picked up comes out |
| Dead | the owner died | — | — | two thirds burned; a third into the global pool, delayed, never back into the run it died in |
| In the pool | the recycled third of dead gear | — | — | drawn by a later run's lottery, into a claims table |
| Claimed | a finisher collects it | no | yes | a new strongbox; the cycle restarts |
| Worn out | durability under the floor | — | not until repaired; worn gear cheaper than its repair gets scrapped | repair (token burned, ETH leg to the operator), or scrap |
| Potion / key | minted or dropped | yes while carried | yes | burned on use; lost on death; a key is burned at the gate |

Nothing ever returns to the dead. Nothing is upgraded, only repaired. Nothing in the slice's
training ground is wagered, won or counted.

## 5. Who holds which power

| Holder | Power | Bound by |
|---|---|---|
| The player's wallet | owns gear and token; authorises a session key per session | — |
| The session key | signs entries and input batches for one session | expires; cannot move items |
| The settlement key (hot) | posts settlements and reveals secrets | only items locked into runs it opened; a one-hour delay before burns and loot execute |
| The cancel key (offline) | cancels a settlement batch during the delay | can only cancel |
| The operator multisig | moves the Treasury to a new one; registers a new dungeon's item kinds; retires a contract; receives the fees | a one-week public delay; cannot mint, change a mint price or touch a vaulted item |
| The operator as Pons fee recipient | re-points the creator payout (to a treasury or splitter) at once | — |
| Pons's owner (a 2-of-3 Safe) | re-points a token's creator payout, after a real three-day delay; changes Pons's fee split and buyback | cannot unlock liquidity or mint supply (measured) |
| Anyone | replays a run from its log; triggers a roll; finalises a run inside the block-hash window | — |

## 6. An evening, in plain words

A player signs in with their wallet and walks into the village. At the broker they swap some ETH
for token on Pons; Pons keeps a sliver and the operator gets 0.7 % of what trades. At the smith
they mint a tier-one kit: the token is burned, the ETH splits between the treasury and the
operator. They buy two potions and a key the same way. At the fettering post they pick the kit and
Slip; at the gate they stand on the plate with nineteen strangers. When the shard forms one
transaction locks everything they are carrying into the run and burns the key. They fight through
six rooms, drink a potion, reach the sealed door, and go in with three others. The Turnkey kills
them. The server posts the run: their wand and robe are burned, their ring goes to the global pool
for some later run to win, both potions are gone, and the Roll records who they were, what they
wore, what killed them and the seed. The survivors' loot is rolled from the block hash and the
committed secret, and goes into a claims table they collect from. A merchant who never enters a
dungeon sees three deaths on the Roll, knows rings are scarcer tonight, and raises the price on
the ring they listed yesterday; when it sells, the fee is burned. The player mints a fresh set and
walks back to the gate.

## 7. Decided, open, and not built

- **Decided (§2):** everything in the tables marked with a rule.
- **Open (§4):** the key's price and how it is got; how "value" is read for the mint price; the
  entry cap per run; the Grand Exchange guard rails; what persists beyond the Roll.
- **Not built:** every contract, the server, the login, the indexer. The slice plays the fight
  and shows the screens. `docs/release.md` is the order of work.
