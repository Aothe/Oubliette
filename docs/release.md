# The release: the one-dungeon gauge with a Pons-launched token

*2026-10-23. A plan, not a decision — the operator decides, and asked for the smallest release:
"avoid trying to add too many things and causing scope creep to seriously delay the release".
Everything here is drawn from SPEC §2 (decisions), §7 (the v0 line), §8 (what happens next),
`docs/chain.md` §4 (what goes on chain), `docs/red-team.md` (the twelve rules), `docs/capital.md`
and `docs/launchpad.md` (Pons). Sizes are relative (small / medium / large) and are inference; no
build time has been measured for anything in this repo.*

## Verdict

1. **The release is SPEC §7's one dungeon, to gauge interest, and nothing more.** One class, one
   dungeon, one boss, one shard, permadeath with a vault, mint / entry / repair on chain, the
   smallest offer book, a deterministic server with a replay, the browser client with the slice's
   placeholder art. The slice already plays; what does not exist is everything under it.
2. **The token launches on Pons v2 on the day the dungeon opens, not before.** A token with no
   game is a chart (SPEC §2 "fun at $0"; §3.1 "release information public and simultaneous"). The
   launch is one transaction of about $2: pair ETH, creator tax 0, the payout recipient a
   disclosed operator address. The creator fee — 0.7 % of trading volume in ETH — is the third
   revenue line (§2 "How the operator is paid"); the repair leg pays the bills.
3. **Four things are large and only one of them is the game.** In order of risk: the
   deterministic fixed-tick server with its input log and replay (large, and SPEC §5 still marks
   its capacity *assumed*); the client ported onto that server — the slice runs seeded floats and
   must become a renderer of fixed-point state (medium); the contracts — Gear, Items, Runs,
   Treasury and the minimal Exchange — with the twelve rules written into them (medium, plus the
   counsel pass and a review before any of it holds value); wallet login with session keys and a
   relayer so the player signs once per session (medium). Everything else is small.
4. **The cuts** (below) remove nothing from the test "people will burn tokens for gear they can
   lose and trade". They need the operator's yes.
5. **The gates, in order:** the thirty-run play test on the slice as it is · the counsel pass and
   the twelve rules on paper · contracts on the testnet with a throwaway token, fuzzed · the server
   and the client port · a dress rehearsal on the testnet · launch day, scripted and rehearsed.

## 1. What ships — the gauge release

| Piece | What it is | Size | Depends on |
|---|---|---|---|
| The dungeon | the Gaol as the slice plays it today: six rooms, the sealed door, the Turnkey, potions, the tuned rooms | done in the slice; port to the server | the server |
| The server | deterministic, fixed-point, fixed tick; signed 100 ms input batches with receipts; a hard tick limit; the failure rules of `docs/chain.md` §4 written before a line of it; the input log published before loot can sell | **large** | engine choice (SPEC §4) |
| The client | the slice's renderer over the server's state, prediction only; placeholder art stays | medium | the server |
| Login | the wallet is the login (§2); a session key authorised once per session; a relayer so entry is one pop-up-free transaction | medium | — |
| The hub | the village (§2, 2026-10-22) as the lobby: the desks are the chain screens — strongbox, fettering, the gate, the mint, the Roll read from chain events, the Ledger over the exchange | small over what exists; the desks are panels over calls | login, contracts |
| Contracts | `Gear` (ERC-721, lock flag, mint burns token + takes ETH), `Items` (ERC-1155 potions and repair kits), `Runs` (open with a commitment, settle, roll from `arbBlockHash(T)`, the supply rules), `Treasury` (no withdraw), `Exchange` (on-chain offers, §2) | medium | the token address; the twelve rules; counsel |
| The token | Pons v2, launch day (§3 below) | small | nothing |
| Chat | eight canned call-outs on the dungeon channel (§2); local and private messages as text need moderation — see cuts | small | the server |
| Training ground | one preset room with dummies, a door off the village; the tutorial as a card on first login | small | the client |
| Economy constants | `s` = ⅓, `d0` by play (§5), mint 120 token + 0.002 ETH placeholder, repair 30, fee 2 %, the ETH repair leg 0.0012, half the mint ETH to the operator (§2) | decided | — |

## 2. The cuts proposed — the operator's yes or no on each

Each is already not-v0 or is a v0 item whose smallest form is enough for the gauge. None changes
what the release tests.

1. **Chat: canned call-outs only, on every channel, for the gauge.** §2 says local and private
   messages exist from the start; as free text they need the blocked-word list, rate limits and a
   person reading reports (`docs/chat-trade.md`). For the gauge, the same eight call-outs serve
   all three channels; free text arrives with the moderation budget. *Recommended: yes.*
2. **The tutorial is a card, the training ground one room.** No scripted sequence; a page of
   controls on first login, skippable, and one room of dummies off the village. *Recommended: yes.*
3. **The Roll is a list over chain events, no wall art.** Who died, kit, what returned, the cause,
   the seed; the "wall" is the village desk it already has. *Recommended: yes.*
4. **The exchange is the on-chain book and nothing else:** place, fill, cancel, withdraw, the
   price history that falls out of the events. No charts, no item pages, no buy limits yet (the
   Grand Exchange rules in SPEC §4 come with the first city). *Recommended: yes.*
5. **No stock drops, no world boss, no cosmetics, no dungeon two, no same-run re-entry, no keyed
   entry, no drand** — all already not-v0 or §4; stated here so nobody adds one "while we are at
   it". The ETH treasury accumulates, unspent, as §7 says.
6. **The village stays the size the other session built it.** Named desks, no quests, no shops
   beyond the mint; the first city is the Undercroft, after the gauge (§2).
7. **Placeholder art ships.** The gauge tests the loop at $0; the operator liked the look; art
   direction is a decision for after the gauge (SPEC §4 "Art pipeline").
8. **One shard, one region, one server.** Instancing the village, several shards and the
   spectator feed wait for a second dungeon's worth of players.

## 3. The Pons launch, step by step

What the repo knows about Pons v2 is in `docs/capital.md` §3 and `docs/launchpad.md` §1
(measured 2026-10-02/03 and sourced; the docs site refused the sandbox on 2026-10-22, so the
mechanics below rest on those readings and must be re-read on the site before launch day).

1. **Before launch day.** Verify by one simulated transfer that a Pons v2 token's `transfer()` is
   untaxed and how it burns (`probe/chain/pons.mjs`, in progress) — our Gear and Exchange contracts
   move and burn the token on every action. Choose the name and ticker (Appendix A: Oubliette is
   the game; the ticker is open). Decide the payout recipient (an operator multisig, disclosed on
   the site). Set the creator tax to **0** — a tax on swaps is a tax on every player's way in and
   is the one thing Pons cannot lower afterwards.
2. **Launch day, scripted and rehearsed on the testnet with a throwaway token:** (a) the Pons
   launch transaction — about 0.0005 ETH plus ~3.8 M gas, about $2; the whole 1 B supply goes onto
   the bonding curve, the operator receives no allocation and buys nothing; (b) the game's
   contracts deployed with the token's address (Gear needs it to burn; the Exchange to escrow),
   either in the same script or by a one-time initialiser called once and then dead; (c) the
   dungeon opens and the release notes publish the token address, the contract addresses and the
   payout recipient together. Nothing is announced before (a), nothing sold before (c).
3. **After graduation.** At 4.2 ETH raised the curve graduates into a Uniswap v4 pool whose
   liquidity is locked for good; every trade pays 1 %, the creator receives 0.7 % in ETH. Pons can
   redirect that payout after a public three-day delay, so the recipient is watched, not trusted.
4. **What the token must give the contracts:** a plain ERC-20 `transfer` and `transferFrom` with
   no tax (to be measured); a burn — `burn()` if it exists, else transfers to
   `0x…dEaD`, which lowers circulating supply the same way (§3.2 wants supply to fall, nothing
   more); a fixed supply with no mint (Pons tokens are born with all of it on the curve).
5. **The one design item Pons makes concrete: reading the token's value for the mint price**
   (§2 "The mint price", §4). Before graduation the only price is the curve's; after it, the v4
   pool's. The contract needs one source it can read on chain — the pool's time-weighted price once
   the pool exists, the curve's spot price before — and a rule for the hand-over. Decide with the
   contract rules; the red team's price probes (research agenda item 7) test it.
6. **Dependency, stated once:** Pons is a pseudonymous team's unaudited v2 contract (the factory is
   not an upgradeable proxy, measured 2026-10-22). It can change its fee split and buyback policy
   and redirect the creator payout; it cannot unlock the liquidity or mint supply. If it fails, the
   token keeps trading on Uniswap; the game loses the creator fee and nothing else.

## 4. The order of work

Sequence, not dates. Each line names what it needs before it can start.

1. **The thirty-run play test** on the slice as it stands (SPEC §8 step 3; the first human death
   rate). Needs nothing. The result sets `d0` and decides whether the rooms need a different threat.
2. **The twelve rules on paper, then counsel** (`docs/red-team.md`; SPEC §6, §8 step 5): the
   lottery shape, stake-weighted prizes, delivering nothing to US persons in v0 (no stock drops
   makes this easier). Needs nothing; blocks every contract.
3. **The engine choice** (SPEC §4): TypeScript or Rust for the server, the slice's renderer kept
   for the client. Needs nothing; blocks the server.
4. **Contracts on the testnet**, with a throwaway ERC-20 standing in for the Pons token: Gear,
   Items, Runs, Treasury, Exchange; the halt rule and the hard run length written first; a fuzzer
   holding only the settlement key, a finisher that always reverts, a double entry, who can move
   treasury ETH (research agenda item 6). Needs 2 and the Pons probe.
5. **The server**, fixed-point, with the input log and the replay checker; the slice's dungeon,
   enemies, boss, door, potions and skills re-implemented in it. Needs 3; the largest piece.
6. **The client port**: the slice becomes a renderer with prediction over the server's state;
   login, session key, relayer; the village desks as panels over the contracts. Needs 5 and 4.
7. **Dress rehearsal on the testnet**: a scripted launch day end to end, twenty people, a death,
   a settlement, a roll, a claim, a sale. Needs 4–6.
8. **Launch day** (§3). Needs 7 and the counsel pass.

## 5. What this costs, and what it earns

`docs/capital.md`: the on-chain system needs no seed money (a Pons launch is about $2 and the
operator owns no liquidity); the bare-bones budget is $20,900 once plus $464 a month before any
salary; the sensible one $125,700 plus $10,600 a month. With the repair leg, half the mint ETH
and the creator fee, the operator takes about $0.08 per delver per day at the model's price scale
— break-even on bare-bones at about 190 delvers (SPEC §4). The scale is an assumption until real
spend per delver is measured, which the gauge release is for.

## 6. Open, and in whose hands

- **The operator:** the cuts in §2; the engine (§4 step 3); the ticker and the payout recipient;
  when to run the play test.
- **The repo:** the Pons transfer probe; the mint-price source (§3 item 5); the server's capacity
  at twenty players (SPEC §5, *assumed*); build time for every line above (none measured).
- **Counsel:** the lottery shape and stake-weighted prizes (SPEC §6).

## Not verified

Nothing in this plan is measured except what it cites. Build sizes are relative judgements. The
Pons mechanics rest on readings from 2026-10-02/03 and two secondary sources; the docs site must
be re-read before launch day. Whether a twenty-player deterministic server holds at bullet-hell
tick rates in the browser is assumed, not shown (SPEC §5).
