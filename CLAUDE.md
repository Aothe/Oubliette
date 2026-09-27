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
2. `sim/economy.py` — the docstring, then run it. The economy is the first unknown.
3. This file's "hard-won knowledge" — facts measured before this repo existed.

## Quick orientation

- Python 3.11 for the simulations (`requirements.txt`, venv at `.venv`). No game engine, no
  service, no contracts yet. `contracts/` (Foundry) and `game/` come later and are not started.
- `sim/` is the economy: agent-based, seeded, fast. `sim/out/` is gitignored.
- Status: SPEC written 2026-09-25; `sim/economy.py` v0 exists and its 10,000-day, 5-seed sweep
  (`--sweep`, 228 runs) is in SPEC §5: supply is stable iff `(1 − s)·deaths > fresh drops` — flat
  at `s = 0`, `d0` 0.10–0.20; flat in circulation only at `s = ⅓` (nothing in v0 buys t2/t3);
  `s ≥ ⅔` and `d0 = 0.05` fail. No budget ever binds in v0, so the halving and the mint/repair
  costs move only balances and burn: the fee constants and price coupling are still open. Nothing
  else built. Next: a sim with a binding budget, explicit merchants and demand for every tier (SPEC §8).

## Commands

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python sim/economy.py                        # s x d0 grid, 2,000 days, summary table
.venv/bin/python sim/economy.py --days 10000           # the long run
.venv/bin/python sim/economy.py --single --s 0.33 --d0 0.1 --halve-at 1000 --plot   # one config + figure
.venv/bin/python sim/economy.py --sweep                # SPEC §8 step 2: 228 runs x 10,000 days, ~7 min on 8 workers; tail -f sim/out/sweep.log
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

## Related

- **Tracking-tracker** (`Aothe/Tracking-tracker`) — where this was designed;
  `docs/plans/permadeath-mmo.md` is the record, `docs/plans/rh-chain-venture-ideas.md` Round 7
  / B19 the pointer; the A1 listing-forensics rig is what to point at the in-game exchange.
- **Upwind** (`Aothe/upwind`) — the connectome arena; shares the `arbBlockHash` primitive and
  the convert-on-receipt rule for stock.
- **Vector** (`Aothe/vector`) — the Arc launch factory; its fee splitter is the exchange-fee
  pattern.
