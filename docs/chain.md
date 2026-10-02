# The chain: what goes on it, what it costs, and whether RH Chain is the place

*2026-10-03. Everything marked MEASURED comes from the read-only probes in `probe/chain/` (no
transaction was sent, no key used) and reproduces by running them; SOURCED carries the page
opened; the rest is design and labelled so. SPEC §3.4–§3.7 and §4 are the questions; this note
is the first answer and decides nothing on its own.*

## Verdict

1. **RH Chain can carry the whole design today, at a price that rounds to nothing.** MEASURED:
   about 10 blocks a second, every user transaction pays exactly the base fee (0.02–0.04 gwei
   this fortnight; 2 gwei at the chain's worst moment), so a mint is $0.007, an equip $0.004, a
   whole 20-player run settled by the server $0.025–0.07, and a day of 1,000 daily delvers
   costs players about $13 and the operator about $4–10 in gas. At 50,000 daily delvers the
   game would use about 1 % of the chain's long-run pricing target.
2. **The randomness primitive is sound but not sufficient.** MEASURED: `ArbSys.arbBlockHash`
   returns the real hash for exactly the previous 256 blocks; a Nitro header is a deterministic
   function of its parent, the sequencer's clock and the ordered transactions, so a party alone
   in a block could pick its hash — but sole-transaction blocks are 2–6 % of blocks, state is
   pruned from public RPCs within minutes and the sequencer feed is closed, so only the
   sequencer can bias it in practice. The design needs a committed server secret and a
   settlement block fixed by rule (below), and gains two things the SPEC did not know: the
   EIP-2935 history contract serves block hashes for about 10.9 hours, so the 25-second window
   is not a constraint on end-of-run rolls; and the BLS12-381 precompiles are live, so a drand
   beacon verifies on chain — randomness nobody in the game, Robinhood included, can touch.
3. **What goes on chain is ownership, locks, commitments and rolls; what stays off is the
   run.** The on-chain footprint of a run is three transactions by the server and none by the
   player beyond entry; the input log (about 27 KB a run, compressed) is published off chain and
   its hash committed. Per-item wear is cheapest written lazily (one root per run, 5,700 gas
   saved per surviving item) and carried in the unequip voucher for 624 gas.
4. **Platform risk is real and specific.** MEASURED: a rollup posting blobs to Ethereum (no
   data committee) with a permissioned validator set, two chain-owner keys that can change any
   ArbOS parameter, protocol-level transaction filtering switched on since 2026-06-24 with one
   authorised filterer, force-inclusion through L1 after at most four days, and a 6.4-day
   challenge period. The 194 stock tokens sit behind one upgradeable beacon and are pausable.
   The site's trust statement has to name Robinhood as the party that orders blocks and can
   filter transactions.
5. **Chain choice:** see §6 — the web research on terms and alternatives is in
   `scratchpad`-derived notes and summarised there.

## 1. The chain as measured (`probe/chain/census.mjs`, 2026-10-02/03)

| | value | method |
|---|---|---|
| chain, client, ArbOS | 4663; nitro v3.12.1-rc.2; ArbOS 61 | eth_chainId, web3_clientVersion, ArbSys.arbOSVersion |
| EVM level | Osaka except BLOBBASEFEE (PUSH0, TSTORE, MCOPY, CLZ work); EIP-7702 supported; max code size 98,304 B | state-override opcode probes; eth_estimateGas |
| blocks | 9.9 a second, mean interval 101 ms, no empty second in 6,000 blocks; produced on demand (hours between blocks in the chain's first week) | 6,000-block walk, timestamps, newHeads |
| user transactions | 57 a second; per block min/median/p95/max 1/5/12/283; 6.3 % of blocks hold exactly one; 18.6 % of user transactions revert | same walk; receipts |
| gas | 10.7 M gas/s used; limits 32 M per transaction and per block (soft); speed limit 7 M gas/s; pricing targets 60 M gas/s over 15 s and 15 M gas/s over a day | headers; ArbGasInfo |
| fees | base fee 0.0314 gwei now; last 24 h 0.031–0.074 gwei; chain's life 0.02–2.03 gwei; priority fee buys nothing (0 of 210 receipts paid above base); minimum 0.02 gwei | eth_feeHistory, receipts, ArbGasInfo |
| L1 data charge | intermittent: the per-unit price was exactly 0 at 26 of 52 sampled moments and up to 21 M wei; a transaction's L1 share is 0.05 % of its gas when on | ArbGasInfo at historic blocks; receipts |
| data availability | rollup: `DataAvailabilityCommittee=false`; 150 EIP-4844 blob batches an hour to the L1 inbox, one every ~24 s | ArbOS chain config; L1 logs |
| finality | "safe" 743 s behind latest, "finalized" 1,119 s; force inclusion after ≤ 4 days; confirm period 6.4 days; validator whitelist on | eth_getBlockByNumber safe/finalized; L1 Rollup getters |
| control | 2 chain owners; transaction filtering ENABLED since 2026-06-24, 1 filterer; no scheduled upgrade | ArbOwnerPublic |
| block fields a contract sees | `block.number` = L1 number (moves every 14–16 s); `prevrandao` = 1; `blockhash()` unusable; `ArbSys.arbBlockHash(n)` = real hash for n−1…n−256, reverts outside; EIP-2935 history at `0x0000F90827F1C53a10cb7A02335B175320002935` serves n−1…n−393,168 (~10.9 h) for 3,175 gas | state-override probes |
| precompiles | ecrecover, sha256, modexp, bn254, blake2f, KZG, BLS12-381 (EIP-2537, 0x0b–0x11) all work; P256VERIFY (0x100) absent | test vectors |
| standard contracts | Multicall3, Permit2, CreateX, the deterministic deployer, EntryPoint v0.6/0.7, Safe factory present; Seaport absent | eth_getCode (see census §6 for the byte-for-byte comparison) |
| randomness vendors | none: Pyth Entropy, Chainlink VRF, Gelato, Supra, API3, Randomizer.ai have no code at their canonical addresses | eth_getCode |
| explorer | 887 M transactions, 26.6 M addresses, 7.9 M contracts (1.34 M verified), 18 M ERC-4337 user ops; 8–11 M transactions a day; the Blockscout API answers scripts with a Cloudflare challenge, the stats service does not | stats-service counters |
| stock tokens | 194 on Robinhood's asset list, all live, none paused, all behind beacon `0xe10b6f6b…1b00`; HoodScan: $156 M market cap, $97 M DEX liquidity, 983 pools, mostly Uniswap v4/v3 | api.robinhood.com/rhj/assets; eth_call ×582; hoodscan.co |
| venues | WETH `0x0Bd7…AD73`, USDG `0x5fc5…d168`; swaps: Uniswap-v4 PoolManager 60 %, v3 pools 34 % | logs over 3,000 blocks |
| RPC limits | eth_call / estimateGas cap 50 M gas (above the 32 M a transaction may use); eth_getLogs 10 M blocks on the official RPC, 50 on publicnode without a key, 500 on drpc free; calldata 0.4–2.6 MB per call; websockets on publicnode and drpc, not the official RPC | probes |

## 2. What each action costs (`probe/chain/gas/`, 2026-10-02)

Method: a 650-line measuring-stick Solidity file (not the contracts; nothing should be built on
it) compiled with solc 0.8.37, every action run as one fresh signed transaction in a local
Cancun EVM against persisted state, then every one of the 44 actions replayed on the live chain
through `eth_simulateV1` with a state override — **44 of 44 match to the gas unit**. Price basis
0.03226 gwei, ETH $2,683, the L1 term at the week's mean unit price.

| action | L2 gas | USD now | USD at 100× gas |
|---|---|---|---|
| approve token / setApprovalForAll (once per wallet) | 46,463 / 46,120 | $0.004 | $0.40 |
| mint tier 1 — first item / later item | 93,737 / 76,649 | $0.008 / $0.007 | $0.81 / $0.66 |
| equip 1 item / a kit of 4 | 29,704 / 47,329 | $0.003 / $0.004 | $0.26 / $0.41 |
| unequip a kit of 4 by server voucher (ecrecover), with lazy wear | 55,685 | $0.005 | $0.48 |
| unequip by request + finalise after a delay | 31,147 + 52,879 | $0.007 | $0.73 |
| repair | 47,940 | $0.004 | $0.42 |
| consumable mint / use | 49,268 / 29,367 | $0.004 / $0.003 | $0.43 / $0.25 |
| exchange A (on-chain offers): place sell / place buy / fill / cancel | 71,338 / 69,706 / 74,279 / 46,222 | $0.006 / $0.006 / $0.006 / $0.004 | $0.62 / $0.60 / $0.64 / $0.40 |
| exchange B (signed order, on-chain fill): fill / cancel | 89,254 / 28,322 | $0.008 / $0.002 | $0.77 / $0.25 |
| openRun, commitment only / roster of 20 in storage | 71,416 / 186,725 | $0.006 / $0.016 | $0.62 / $1.62 |
| settleRun, 20 players, 2 dead, eager wear on 72 items / lazy wear (one root) | 540,471 / 128,545 | $0.047 / $0.011 | $4.68 / $1.11 |
| rollLoot, 3 pooled items among 18 survivors (reads arbBlockHash) | 95,321 | $0.008 | $0.83 |
| settleRun, 85 players, 9 dead, eager / lazy | 2,030,992 / 352,431 | $0.18 / $0.03 | $17.58 / $3.05 |
| syncWear, one item by Merkle proof (lazy wear's later touch) | 37,110 | $0.003 | $0.32 |
| deployment, five contracts | 5.1 M | $0.44 | $44 |

Scenarios (assumptions in the probe output): **one delver-day** (3 runs, one equip and one
unequip, 0.3 repairs, 0.1 mints, 0.5 exchange actions) costs the player 146,000–188,000 gas =
$0.013–0.016, nothing per run; **one 20-player run** costs the operator 294,000–823,000 gas =
$0.025–0.071 (lazy wear and a hashed roster at the low end); **1,000 daily delvers** = $13–16
for players and $4–11 for the operator a day; **50,000 daily delvers** = $630–815 and $190–535,
about 110,000–180,000 gas/s against a long-window pricing target of 15 M gas/s. At the chain's
worst recorded base fee (2 gwei) multiply by about 65.

Design readings from the numbers: a signed-order exchange is 37–39 % cheaper per completed
trade than on-chain offers and listing is free, but an on-chain book gives price history for
nothing and cannot be front-run from a private order flow; lazy wear saves 5,700 gas per
surviving item at settle and costs 624 gas at the next unequip; hashing the roster instead of
storing it saves 115,000–457,000 gas per run; nothing comes near the 32 M limit (an eager
85-player settle is 6.3 % of it; one transaction would hold about 1,400 players).

**The input log.** 20 players × 60 ticks × 180 s: 432 KB raw, 27 KB as change records with aim
logged on shot ticks and brotli; posting it whole as calldata would be $0.04 a run ($18 a day at
1,000 delvers; checked live, 450,880 gas); the 32-byte hash inside settlement is $0.00004.

## 3. Randomness (`probe/chain/randomness.mjs`, 2026-10-02)

- MEASURED: a live block's hash was rebuilt byte for byte from its header fields, every
  transaction hash, the transactions root, the receipts root, the bloom, and the internal
  start-of-block transaction from public inputs. Predictable in advance: parent, number,
  difficulty (1), gas limit, coinbase, base fee; partly: timestamp (the sequencer's clock, whole
  seconds), the L1 number in `mixHash` (~15 s cadence); not without executing under ArbOS: the
  state, transactions and receipts roots and gas used. So a party that is alone in a block,
  holds the parent state and predicts the clock can choose among its own transaction's variants
  and send the one whose hash it likes — rejected variants cost nothing.
- MEASURED: sole-user-transaction blocks are 1.8–3.9 % (randomness walk) and 6.3 % (census walk)
  of blocks; the sequencer groups transactions FCFS in ~250 ms windows; public RPCs prune state
  after 90–6,200 blocks while headers are served forever; the sequencer feed returns 403 to
  anonymous clients. A player cannot force being alone and cannot evaluate candidates without an
  archive node on the feed. **Only the sequencer (Robinhood) can bias `arbBlockHash` freely.**
  Hashing several consecutive blocks helps the last mover, not the honest party.
- MEASURED: drand quicknet (3 s rounds) verifies on chain through the EIP-2537 precompiles —
  the pairing check passed, a wrong round was rejected, `randomness == sha256(sig)`.
- MEASURED: `eth_simulateV1` repairs the block hash after execution with caller-supplied time
  and number, so it proves header encoding but cannot reproduce a future block hash; debug and
  arbtrace APIs are not exposed.

**Protocol, v0.** *Per tick:* at run start the server commits `H(S_run)` on chain; every per-tick
seed is `keccak(S_run, tick, arbBlockHash(n0))` with `n0` the run-start block; `S_run` is
revealed at settlement. No one can read a roll before it is final, no per-tick chain access, and
the replay proves the seed was fixed before play. *End of run:* the settlement transaction
reveals `S_run`, posts the run's results and names `T` = its own block number + k (k ≈ 50 blocks,
5 s); the roll is `keccak(S_run, arbBlockHash(T))`, computed by a permissionless `roll(runId)`
that anyone may call once block T exists and for the 10.9 hours the history contract serves it;
if nobody calls within that window, the run resolves "wager returned, no loot" rather than
re-rolled. The server revealed S before T existed and cannot choose T twice; a player cannot be
alone in block T; the sequencer could, so the public statement is: *"who wins is decided by a
secret the server locked before the run and a block hash made after it; neither party alone can
choose; Robinhood orders the blocks."* *When stock payouts begin:* roll from the first drand
quicknet round after T, verified on chain — nobody in the game, Robinhood included, can touch
it, and anyone can check it forever.

## 4. What goes on chain, and what does not

**Contracts (v0).** `Token` (the Pons-launched ERC-20; the game only burns it). `Gear` — an
ERC-721 whose per-item word packs kind, tier, durability, an `inRun` lock and the run id; mint
(burn token, take ETH into the treasury), repair (burn token), equip/unequip (lock flag, never
an escrow move), and a `Settlement` role that may change only items locked into a run it opened.
`Items` — ERC-1155 consumables, burned on use, locked into a run the same way. `Runs` —
`openRun(commitment)`, `settleRun(runId, results…)`, `roll(runId)` as in §3, with contract-
enforced supply rules: recycled drops only from items that died in that run, fresh drops drawn
against a budget set from gear destroyed over a trailing window, a cap on deaths per hour, and
loot and burns executed after a delay during which an offline key may cancel a batch. `Exchange`
— on-chain offers for v0 (price history for free, no private order flow, $0.006 a placement),
strict price-then-time matching, fills credited to a balance the buyer withdraws, no recipient
callbacks. `Treasury` — receives mint ETH; no withdraw; a "move to a new treasury" after a
one-week public delay, proposed by a multisig. Gear, locks and the treasury are not upgradeable;
a bug is fixed by a migration players opt into.

**The life of a run.** (1) The player signs once per session: an authorisation for a throwaway
session key. (2) *Entry* — one transaction, relayed so there is no pop-up: locks the kit, the
skill item and any consumables into run R until time T (about 70,000–90,000 gas, under a cent);
a second entry for a locked item fails on chain, so the chain is the tie-breaker (red team D2,
D4). (3) *The run*, off chain: the session key signs each 100 ms input batch, each carrying the
hash of the one before; the server answers each with a signed receipt naming the tick applied
(D6). (4) *Settlement* — the server posts deaths, the per-item death-split and wear as one root,
each finisher's contribution and value wagered, the input-log hash and where to fetch it, and
reveals `S_run`. (5) *Roll* — permissionless, from `arbBlockHash(T)` (§3); recycled items go to
a claims table, never pushed to a wallet (D3). (6) *Release* — locks drop after the delay;
winners collect. (7) *Unequip* at leisure, by voucher or by request-and-wait.

**Data committed per run:** 32 bytes of commitment at open; at settle roughly 20 × (address,
weight, wager, flags) plus a wear root, a log hash and the dead items' ids — about 1–2 KB of
calldata; nothing per tick. **Off chain:** the input log, published to a public bucket before
any loot from that run can be sold, mirrored by anyone who cares; the replay checker; the
spectator feed, delayed.

**Failure rules, written down** (red team D5): a run that cannot advance ends where it stopped,
earlier deaths stand, the living leave with their wager and no loot; a hard tick limit per run;
if most of a shard stops acknowledging, the tick pauses and, if the pause runs out, the same
ending (C3); if nothing is posted for a run within 72 hours, each wallet unlocks its own gear.

**Deliberately not on chain:** positions, health, bullets, the per-tick state, who is in which
shard, chat, fame.

**Keys.** The settlement key is hot and bounded (only items in runs it opened; a delayed effect;
a cancel key held offline); the chain-owner-style powers the game has (moving the treasury,
registering a new dungeon's item kinds, retiring a contract) sit behind a multisig and a public
delay; nothing can mint the token, change a mint price, or touch a vaulted item.

## 5. Open decisions for the operator

1. On-chain offer book (price history, no private flow; $0.006 a placement) or signed orders
   (free listing, 38 % cheaper fills): **recommend the on-chain book for v0.**
2. Lazy wear (one root per run, materialised at the next unequip for 624 gas) or eager (5,700 gas
   per surviving item): **recommend lazy.**
3. Unequip by server voucher (one transaction, needs the server up) or request-and-wait (two
   transactions, needs nothing): **ship both; the wait is the safety valve.**
4. The settlement delay before burns and loot execute (an hour is enough to cancel a stolen
   key's batch): **one hour in v0.**
5. drand from day one, or at the first stock payout: **at the first stock payout; the committed
   secret plus a fixed block is enough while nothing in the pot is worth a sequencer's attention.**
6. Whether to run an archive node on the sequencer feed (the only way to replay rolls without
   trusting an RPC's headers): **not for v0; verify rolls from headers.**

## 6. Which chain

SOURCED (pages opened 2026-10-03; full notes with every URL in `docs/chain-web-notes.md`):

- **Terms and policy.** The chain's terms (updated 2026-08-24) call it permissionless in
  writing, list only generic prohibited uses — no gambling, lottery, sweepstakes or securities
  clause — and reserve the right to "restrict or block specific wallet addresses"
  (https://docs.robinhood.com/chain/terms-of-service). The docs say the sequencer "maintains
  compliance standards through sequencer-level screening" and that blocked transactions "appear
  as though the event never occurred" (https://docs.robinhood.com/chain/differences-from-ethereum/).
  Arbitrum's filter can fail any transaction from or to a restricted address, any transfer of it,
  any call or create targeting it, or by emitted event — a restricted contract address is a
  chain-wide kill — and defeats forced inclusion; Arbitrum One's DAO disabled it
  (https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering).
  L2BEAT: not Stage 0, upgrade keys a 7/8 multisig with no delay (6/8 with a 7-day timelock), two
  whitelisted validators, $2.71 B secured, filtered transaction hashes 278 → 6,088
  (https://l2beat.com/scaling/projects/robinhood). Security Council of 8 with Robinhood holding
  two seats (https://docs.robinhood.com/chain/governance/). Incident 2026-09-04: blocks kept
  coming but blobs missed Ethereum for 14 minutes
  (https://thedefiant.io/news/blockchains/robinhood-chain-never-stopped-but-its-blobs-did-stop-reaching-ethereum-for-14-minutes).
  No app removal or front-end delisting found. Context: Robinhood sells event contracts and is
  litigating with several states over them.
- **Stock tokens.** Primary issuance is to authorised participants only, after KYB; "end users
  may still buy and sell Stock Tokens on-chain"; "standard ERC-20"; the docs invite building on
  them. Nothing in the terms, FAQ or docs on transfers to ineligible persons, use in apps, or
  prizes (https://docs.robinhood.com/chain/stock-tokens/, https://docs.robinhood.com/rhj/faq).
  195 on chain, 193 traded, $2.21 B lifetime DEX volume to 30 August ($1.69 B in August alone),
  NVDA $706 M / SPY $310 M at the top, tail pools ~$3 K a day
  (https://sqd.dev/learn/robinhood-stock-token-volume/).
- **Who is there.** 7.7 M transactions and 384 K active addresses a day on 2026-10-02, fees
  $82 K a day, −53 % in a week (https://www.growthepie.com/chains/robinhood): the Robinhood
  Wallet gas subsidy ended 2026-09-29. The on-ramp is the Robinhood Wallet, built on Privy and
  embedded in the Robinhood app (https://privy.io/blog/bringing-global-financial-markets-onchain-with-robinhood);
  bridges: canonical, LayerZero/Stargate, CCIP, Relay, Across, LiFi. Account abstraction:
  EntryPoints v0.6/0.7/0.8, EIP-7702, with Alchemy, ZeroDev, Privy and Dynamic named by
  Robinhood and Pimlico listing 4663 with 7702 (https://docs.robinhood.com/chain/account-abstraction/,
  https://docs.pimlico.io/guides/supported-chains). Indexers: Goldsky and Envio list the chain.
  OpenSea supports it; Blockscout is the official explorer with contract verification.
- **Games.** Yield Fields, Gigaverse Online, Cambria (announced 2026-09-28), Spy Inc. Agents,
  The Floor — all weeks old, no outcome data
  (https://www.blockchaingamer.biz/news/42971/web3-games-launching-robinhood-chain/).

**Alternatives** (one line each; the primitive the design uses, `arbBlockHash`, exists only on
the Arbitrum stack; VRF presence read from the vendors' deployment lists today):

| chain | fees, blocks | randomness | stock tokens | audience | reading |
|---|---|---|---|---|---|
| Arbitrum One | 250 ms; Timeboost live | arbBlockHash, Chainlink VRF, Pyth Entropy | Dinari (KYC-gated) | thin for games (Treasure left) | the same stack with no filter and VRF vendors; no audience |
| Base | 200 ms Flashblocks, ~$0.02 | VRF, Entropy; OP blockhash is 2 s | Dinari only | the largest consumer audience; the Base app | the best consumer option; loses `arbBlockHash` and the stock tokens; Coinbase's gambling policy is the risk |
| Abstract | ~1.1 s | Entropy | none | Gigaverse ($5.5 M revenue) | a pixel-RPG niche, nothing else |
| Ronin | ~2 s | native VRF, Chainlink | none | Pixels; conflicting DAU data | nothing Base lacks |
| Solana | 400 ms | Switchboard | xStocks and Ondo GM, free transfer | 4 M daily users | a rewrite, not a port |
| MegaETH, Monad | 10 ms / 300 ms | none / Entropy | none | nascent, trading-first | no edge |
| Immutable | — | — | — | pivoted away from games in 2026 | drop |
| own Orbit chain | same primitive, own sequencer, 10 % AEP revenue share | own | bridge RH tokens | zero | later, never v0 |

**Reading.** The chain choice stays RH Chain. For: the only working hash primitive plus BLS
for drand with no vendor needed; 195 stock tokens with real depth and docs that invite
composability; permissionless in writing with the whole wallet, indexer and marketplace stack
live. Against: a growing sequencer-level filter that can kill a contract address chain-wide and
defeat forced inclusion; a regulated broker's keys with instant upgrades and no stated
decentralisation roadmap; an audience that is memecoin traders, unproven post-subsidy. Two named
exits if policy turns: Arbitrum One (redeploy, same code, same primitive, token migration) and
Base (also swap the seed source for VRF or a 2 s block hash and drop stock drops). Abstract the
seed interface now so either costs a redeploy, not a redesign. What only Robinhood or counsel
can answer: whether a dice-roll game with tradeable prizes is tolerated by the filterer, and
whether delivering stock tokens to unidentified winners is the game's exposure.

## Not verified

- The probes ran on 2026-10-02/03 from one network position; the sequencer feed's real-time
  behaviour, Timeboost, and the rate at which a well-placed sender could land alone in a block
  were not measured (one funded test transaction would settle the last; none was sent).
- The deployed Nitro build (v3.12.1-rc.2) is not public; the block-build logic was read at
  v3.11.4, whose header packing and window logic are the same.
- Gas numbers are for a measuring stick, not the contracts; a real implementation with access
  control, events and reentrancy guards will cost more, probably by tens of percent.
- The protocol in §4 is the orchestrator's design from the measurements and the red team; an
  independent architect's draft was lost to the session limit and no one has attacked this
  version yet.
