# Oubliette

A permadeath dungeon crawler in the Realm of the Mad God line — top-down pixel art, cooperative,
real-time — where gear is on chain and what you die wearing is no longer yours. Gear is minted by
burning the game token plus gas and equipped on chain as the wager. Bosses are piñatas. A
Grand-Exchange-style market makes delvers and merchants two loops in one game. Play-to-risk,
not play-to-earn: permadeath is the sink the genre never had.

**Source of truth: `SPEC.md`.** Read it in full before making changes — decisions already taken
(§2), the mechanism (§3), what is open (§4), verified-vs-assumed (§5), risks (§6), the v0 line
(§7), what happens next (§8), rejected alternatives (Appendix B).

**Orientation for a new session — read in this order:**
1. `SPEC.md` — what the system is, what has been decided, what has been shown.
2. `sim/economy.py`, then `sim/economy2.py` (v1) — the docstrings, then run them. The economy is the first unknown.
3. This file's "hard-won knowledge" — facts measured before this repo existed.

## Quick orientation

- Python 3.11 for the simulations (`requirements.txt`, venv at `.venv`). No game engine, no
  service, no contracts yet. `contracts/` (Foundry) and `game/` come later and are not started.
- `proto/visual/` is the visual slice (2026-10-02): one self-contained `index.html`, no build, no
  dependencies, no image files — every sprite is a letter grid in the source, coloured from one
  35-entry palette and drawn at runtime. Placeholder art and invented names (class, boss, items);
  it decides nothing (SPEC §4, §5) and is not `game/`. It carries the operator's two additions
  (SPEC §2): one skill per delver, a wagered item chosen in the entry hall and then locked
  (Slip / Mend / Sunder, Space), and a three-second recall (R) that saves the wager but not the
  loot and is shut once the boss wakes. Open the file in a browser;
  `node proto/visual/shots.cjs` screenshots each game state into `proto/visual/out/` (gitignored).
- `art/` is the art bank (2026-10-02): every sprite as data — `bank.js` (the palette, the loader,
  the tile generator), `creatures.js`, `items.js`, `world.js` — and `index.html`, a gallery that
  draws all of it. 99 sprites, 191 looks with recolours, five dungeon tilesets. Banked for
  dungeons after the first (SPEC §7, not-v0): wired into nothing, every name a placeholder. The
  slice does not load it and still carries its own copy of the 22 sprites it draws.
  `node art/check.cjs` validates the bank and fails if those copies drift;
  `node art/shots.cjs` screenshots the gallery into `art/out/` (gitignored).
- `sim/` is the economy: agent-based, seeded, fast. `sim/out/` is gitignored.
- `probe/chain/` holds read-only measurements of RH Chain (2026-10-02/03): `census.mjs` (cadence,
  fees, finality, control, infrastructure), `randomness.mjs` (block-hash predictability, the
  EIP-2935 history window, drand on the BLS precompiles) and `gas/` (a measuring-stick contract
  set, not the contracts, with every action replayed live). Outputs go to `probe/chain/out/` and
  `probe/chain/gas/out/` (gitignored). `docs/chain.md` is the reading.
- Status: SPEC written 2026-09-25; `sim/economy.py` v0 exists and its 10,000-day, 5-seed sweep
  (`--sweep`, 228 runs) is in SPEC §5: supply is stable iff `(1 − s)·deaths > fresh drops` — flat
  at `s = 0`, `d0` 0.10–0.20; flat in circulation only at `s = ⅓` (nothing in v0 buys t2/t3);
  `s ≥ ⅔` and `d0 = 0.05` fail. No budget ever binds in v0, so the halving and the mint/repair
  costs move only balances and burn. `sim/economy2.py` is v1 (2026-09-27; v0 stays frozen as the
  artifact of its §5 row): closed token ledger asserted exact daily, binding budgets (39 % of
  runner-days priced out at baseline), explicit merchants, t2/t3 demand, the §3.5 lottery; its
  427-run `--sweep` is in SPEC §5. Nothing inflates once budgets bind; `s = ⅓` is viable at `d0`
  0.10 and robust at 0.20. The fee test is negative (0/90 cells): mint cost sets participation,
  repair is a near-free sink, the fee is paid by merchants. A 2× token-price move re-equilibrates
  but participation tracks the price. `sim/population.py` (2026-10-02) scans N 25–1,200 on v1:
  per-head flows are flat from ~50 delvers up, so results scale linearly; merchants do not
  scale. `docs/capital.md` sizes the money: the on-chain system needs no seed capital, the
  operator earns nothing as specified, and three budgets with break-even head-counts are given.
  `sim/operator_fee.py` (2026-10-03) measures the operator's main line on v1: 0.0012 ETH a
  repair pays $1,211 a month per 600 delvers for < 1 % of runs and survives a wallet / income
  stress; it is nearly free only because the model's delvers spend 11 % of their budgets.
  Nothing else built. Next: SPEC §8 step 3, or a v2 sim for the gaps §8 step 2 lists (token
  cash-out, learned merchant spreads, a wealth effect on demand, real budgets).

## Commands

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python sim/economy.py                        # s x d0 grid, 2,000 days, summary table
.venv/bin/python sim/economy.py --days 10000           # the long run
.venv/bin/python sim/economy.py --single --s 0.33 --d0 0.1 --halve-at 1000 --plot   # one config + figure
.venv/bin/python sim/economy.py --sweep                # SPEC §8 step 2: 228 runs x 10,000 days, ~7 min on 8 workers; tail -f sim/out/sweep.log
.venv/bin/python sim/economy2.py --sweep               # v1: budgets, merchants, fees, coupling, lottery; 427 runs x 10,000 days, ~10 min; tail -f sim/out/sweep2.log
.venv/bin/python sim/economy2.py --single --s 0.33 --d0 0.1 --fee 0.05   # one v1 config, 2,000 days, summary line
node probe/chain/census.mjs > probe/chain/out/census.txt   # live RH Chain census, read-only, ~2 min
node probe/chain/randomness.mjs > probe/chain/out/randomness.txt   # block-hash predictability, history window, drand
cd probe/chain/gas && npm ci && node gas.mjs               # per-action gas, local EVM + live replay, ~2 min
.venv/bin/python sim/population.py                     # minimum viable population on v1: 150 runs, ~5 min on 4 workers; tail -f sim/out/population.log; --repro 6 s
.venv/bin/python sim/operator_fee.py                   # operator ETH fee on repair, patched v1: 335 runs, ~30 min on 3 workers; tail -f sim/out/operator_fee.log; --repro 23 s, --report, --check
.venv/bin/python sim/treadmill.py                      # red team A1/A2: organisation x mastery x fresh-drop budget on v1, pre-registered; 210 runs x 10,000 days, ~20 min on 3 workers; tail -f sim/out/treadmill.log; --repro, --report
```

## Working agreements

1. Branches: `feat/`, `fix/`, `update/`, `chore/`. Single-line commit subjects. Small PRs, one
   thing each.
2. `SPEC.md` stays the source of truth. Operator additions get a SPEC section in the same PR.
   Every finding — positive or negative — goes into the §5 table with the script or source that
   proves it. A claim not in §5 as *verified* does not go on any public surface.
3. **The game must be fun at $0.** Any mechanic whose fun depends on the token price is a casino
   with sprites and is rejected on that ground alone (SPEC §2).
4. **The game never pays out its own token.** Sinks burn it; the ETH side of fees buys what
   bosses drop. No emissions, ever (SPEC §3.2).
5. **Scope is the risk.** v0 is one class, one dungeon, one boss, one shard (SPEC §7). Anything
   not in v0 goes in the SPEC's not-v0 list, not in the code.
6. Simulations are seeded; a result you cannot reproduce is not a result.
7. Never log or commit secrets. Outputs and data are never committed.

## Hard-won knowledge — measured before this repo existed, do not re-learn

- **RH Chain randomness (measured live on 4663, 2026-09-25).** `block.number` is the Ethereum
  L1 block number and syncs every 13–15 s; `blockhash()` is an L1-keyed pseudo-random value
  that matches no L2 block; `prevrandao` is the constant 1. **Use
  `ArbSys(0x64).arbBlockHash(n)`** — real L2 hashes, one per ~0.1 s block, verified equal to
  the RPC's, readable on chain for the last 256 blocks and off chain forever. Seeding a
  deterministic simulation per tick from `blockhash` would silently give one value per ~14 s.
  **Re-measured 2026-10-02/03 (`probe/chain/`, `docs/chain.md`):** a block's hash is computable in
  advance by whoever is alone in it (impractical for a player, free for the sequencer), so rolls
  mix in a server secret committed before the run; the **EIP-2935 history contract**
  `0x0000F90827F1C53a10cb7A02335B175320002935` serves hashes for ~393,000 blocks (~10.9 h), so
  the 256-block window is no constraint on end-of-run rolls; **BLS12-381 precompiles are live**
  and drand quicknet verifies on chain; no VRF vendor is deployed; the sequencer feed is closed
  to anonymous clients; every transaction pays exactly the base fee (0.02–0.04 gwei); the chain
  has sequencer-level transaction filtering switched on and a 7/8 upgrade multisig with no
  delay. `eth_simulateV1` with state overrides replays actions on the live chain to the gas unit.
- **RH Chain stock tokens transfer freely today.** SNDK
  (`0xb90a19ff0af67f7779aff50a882a9cff42446400`) is a beacon proxy whose implementation has no
  blocklist / whitelist / freeze logic; simulated transfers to never-seen addresses succeed from
  a pool and from an EOA. It is **upgradeable via the beacon and pausable** — hold stock for one
  hop, pay out promptly, never warehouse it.
- **The RH Chain RPC honours `eth_call` state overrides** — inject runtime bytecode at any
  address and call it. Probe contracts need no deploy and no key.
- **Full recycling of dead gear removes the only sink** and the economy inflates to nothing;
  partial recycling plus durability is the design (SPEC §3.5). The sim exists to set the numbers.
- **Sharded simulation, global world.** A bullet-hell with a thousand players on screen is
  unplayable and a single global shard is MMO-scale netcode. ~50–85 per shard, pooled world
  boss, one loot pool, one ledger (SPEC §3.3).
- **A deterministic fixed-tick server with an input log is easier than a typical MMO, not
  harder**, and it is the anti-cheat, the verification artifact and the spectator feed at once
  (SPEC §3.4). Fixed-point maths; clients are renderers.
- **RotMG is top-down, not isometric.** Top-down is cheaper and deterministic by construction.
- **"Stock buckets" = otcdesks.cash:** a coin paired with one stock or a basket of up to ten,
  fees converted into it and paid to holders; desks are burned-deposit NFTs that earn nothing
  until activated — the exact lineage of mint-then-equip.
- Sandbox egress blocked when this was written: `docs.arbitrum.io`, `api.github.com`, most
  journals. Reachable: `raw.githubusercontent.com`, `github.com` (git), `storage.googleapis.com`,
  the RH Chain RPC (via curl; Python `urllib` fails the proxy handshake — use curl or requests).

## Hard guardrails

- **The operator holds no privileged information about drops or dungeon releases** and no
  position that benefits from either. Release information is public and simultaneous (SPEC §3.1).
- **No emissions of the game token** (agreement 4). **No upgrades to gear** — repair only.
- **Nothing hand-tuned to the token price.** The economy is denominated in it; the fun is not.
- One counsel pass before any payout contract is written: permadeath + tradeable value +
  dice-roll drops has the lottery shape (SPEC §6).
- **The death rate is a treadmill, not a dial** (`docs/red-team.md` A1–A2): organisation and
  mastery push deaths under the band with no cheat. Any rule that keys off deaths per run
  (the 7–14 % band, a fresh-drop budget) must count value destroyed, not heads, and fresh drops
  must be budgeted against gear actually destroyed — by contract, not by the server.
- **Burns and sales on chain cannot be undone.** Settlement may touch only items a player
  entered into that run; loot is claimed, never pushed; a server secret is committed before
  every run; a halt rule and a hard run length are written before the server is.

## Related

- **Tracking-tracker** (`Aothe/Tracking-tracker`) — where this was designed;
  `docs/plans/permadeath-mmo.md` is the record, `docs/plans/rh-chain-venture-ideas.md` Round 7
  / B19 the pointer; the A1 listing-forensics rig is what to point at the in-game exchange.
- **Upwind** (`Aothe/upwind`) — the connectome arena; shares the `arbBlockHash` primitive and
  the convert-on-receipt rule for stock.
- **Vector** (`Aothe/vector`) — the Arc launch factory; its fee splitter is the exchange-fee
  pattern.
