"""Agent-based economy simulation for the permadeath MMO (SPEC §3.5, §8 step 1).

The question: under the sink/source rules, does item supply reach a stable level at which
minting is still worth doing and the token keeps burning? The recycled fraction `s` (share of a
dead player's gear that returns as boss loot rather than being destroyed) and the death rate
`d0` are the dials the game cannot pick by taste; this decides them.

Model, deliberately small (v0):
  delvers   N players with risk appetite and skill. Each day some run a dungeon. Runners with
            no gear mint (burn token + pay the ETH fee) or buy on the market, whichever is
            cheaper. Death destroys the equipped item with prob 1-s, recycles it with prob s.
            Survivors may get a drop: recycled loot (q_loot, if the pool has any) or, rarely,
            fresh boss gear (q_fresh). Durability falls per run; below a floor the item is
            repaired (burn token) or breaks.

  First finding (smoke run, 2026-09-25): with fresh boss gear at ~35% of surviving runs the
  economy inflates to tens of items per player whatever s and d0 are - ~95 fresh items a day
  against 8-37 deaths - and nobody ever mints. The sink cannot beat a source that size. Fresh
  gear must be rare (q_fresh) and recycled loot the common drop; that is now the default.
  market    one price per tier, moved by scarcity: price = base * (target / listed)^alpha.
            Delvers list surplus; buyers take from listings. A fee on every trade is burned.
            Merchants are implicit in v0 (the price rule); explicit merchant agents are v1.
  token     bought with an exogenous ETH income at price P (token per ETH). Burned by mint,
            repair and fees. Never emitted by the game. P can halve mid-run to test coupling.
  treasury  the ETH side of mint fees accumulates (SPEC §3.2); v0 does not spend it.

Run `python sim/economy.py` for the s x d0 grid, `--days 10000` for the long run,
`--single --s 0.33 --d0 0.1 --plot` for one configuration with a figure in sim/out/.
Everything is seeded; a result you cannot reproduce is not a result.
"""
import argparse, csv
from dataclasses import dataclass, asdict
from pathlib import Path
import numpy as np

OUT = Path(__file__).resolve().parent / "out"

@dataclass
class P:
    days: int = 2000
    N: int = 600                 # delvers
    p_run: float = 0.5           # chance a delver runs on a given day
    d0: float = 0.10             # base death rate per run, before skill and gear
    s: float = 0.33              # recycled fraction of a dead player's equipped gear (SPEC §3.5)
    q_loot: float = 0.35         # chance a surviving run draws from the recycled loot pool (if non-empty)
    q_fresh: float = 0.03        # chance a surviving run mints FRESH boss gear - the source the sink must beat
    tiers: int = 3
    tier_death: tuple = (2.0, 1.0, 0.8, 0.6)     # naked, t1, t2, t3 multipliers on d0
    tier_base_price: tuple = (0, 100, 400, 1600)  # token, index by tier
    mint_cost: tuple = (0, 120, 480, 1900)        # token burned to mint (index by tier)
    mint_eth: tuple = (0, 0.002, 0.005, 0.01)     # ETH fee on mint -> treasury (SPEC §3.2)
    fresh_drop_w: tuple = (0.70, 0.25, 0.05)      # tier weights for fresh boss gear
    durability_loss: float = 0.08                 # per run
    repair_floor: float = 0.25                    # repair below this or it breaks
    repair_cost: float = 30.0                     # token burned per repair
    fee: float = 0.02                             # exchange fee, burned
    alpha: float = 0.6                            # price elasticity to listed supply
    target_listed: tuple = (0, 60, 25, 8)         # listings at which price == base
    vault_max: int = 3                            # spare items kept before selling surplus
    eth_income: float = 0.004                     # ETH per delver per day
    token_per_eth: float = 50_000.0               # exogenous token price
    halve_at: int = -1                            # day the token price halves (-1: never)
    seed: int = 0

def run(p: P, log=False):
    rng = np.random.default_rng(p.seed)
    N, T = p.N, p.tiers
    risk = rng.uniform(0.1, 0.9, N); skill = rng.uniform(0.0, 1.0, N)
    eq = np.zeros(N, int); dur = np.ones(N)
    vault = np.zeros((N, T + 1), int)
    tok = np.zeros(N); market = np.zeros(T + 1, int); loot = np.zeros(T + 1, int)
    price = np.array(p.tier_base_price, float)
    tpe = p.token_per_eth; treasury = 0.0
    rows = []
    for day in range(p.days):
        if day == p.halve_at: tpe /= 2
        tok += p.eth_income * tpe
        burned = minted = bought = deaths = destroyed = recycled = repaired = broke = sold = fresh = 0
        runners = rng.random(N) < p.p_run
        # gear up: vault first, then buy or mint tier 1 (cheaper of the two)
        need = runners & (eq == 0)
        for i in np.flatnonzero(need):
            have = np.flatnonzero(vault[i, 1:]) + 1
            if len(have):
                t = have[-1] if risk[i] > 0.5 else have[0]; vault[i, t] -= 1; eq[i] = t; dur[i] = 1.0; continue
            t = 1
            buy_px = price[t] * (1 + p.fee)
            if market[t] > 0 and buy_px <= p.mint_cost[t] and tok[i] >= buy_px:
                market[t] -= 1; tok[i] -= buy_px; burned += price[t] * p.fee; bought += 1; eq[i] = t; dur[i] = 1.0
            elif tok[i] >= p.mint_cost[t]:
                tok[i] -= p.mint_cost[t]; burned += p.mint_cost[t]; treasury += p.mint_eth[t]; minted += 1; eq[i] = t; dur[i] = 1.0
            else:
                runners[i] = False
        # deaths
        pd_ = p.d0 * (1 - 0.6 * skill) * np.array(p.tier_death)[eq]
        died = runners & (rng.random(N) < pd_)
        for i in np.flatnonzero(died):
            deaths += 1
            if eq[i] > 0:
                if rng.random() < p.s: loot[eq[i]] += 1; recycled += 1
                else: destroyed += 1
            eq[i] = 0
        # survivors: drops, durability, repair
        surv = runners & ~died
        r1, r2 = rng.random(N), rng.random(N)
        for i in np.flatnonzero(surv):
            if r1[i] < p.q_loot and loot[1:].sum() > 0:
                t = rng.choice(np.arange(1, T + 1), p=loot[1:] / loot[1:].sum()); loot[t] -= 1; vault[i, t] += 1
            elif r2[i] < p.q_fresh:
                t = rng.choice(np.arange(1, T + 1), p=np.array(p.fresh_drop_w)); vault[i, t] += 1; fresh += 1
        dur[surv] -= p.durability_loss
        low = surv & (eq > 0) & (dur < p.repair_floor)
        for i in np.flatnonzero(low):
            if tok[i] >= p.repair_cost: tok[i] -= p.repair_cost; burned += p.repair_cost; dur[i] = 1.0; repaired += 1
            else: eq[i] = 0; broke += 1
        # sell surplus
        for t in range(1, T + 1):
            over = np.flatnonzero(vault[:, t] > p.vault_max)
            for i in over:
                n = vault[i, t] - p.vault_max; vault[i, t] -= n; market[t] += n
                tok[i] += n * price[t] * (1 - p.fee); burned += n * price[t] * p.fee; sold += n
        # price
        for t in range(1, T + 1):
            price[t] = p.tier_base_price[t] * (p.target_listed[t] / max(market[t], 1)) ** p.alpha
        supply = int((eq > 0).sum() + vault[:, 1:].sum() + market[1:].sum() + loot[1:].sum())
        rows.append(dict(day=day, supply=supply, equipped=int((eq > 0).sum()), vault=int(vault[:, 1:].sum()), listed=int(market[1:].sum()),
                         loot=int(loot[1:].sum()), deaths=deaths, destroyed=destroyed, recycled=recycled, minted=minted, fresh=fresh, bought=bought,
                         repaired=repaired, broke=broke, sold=sold, burned=burned, p1=price[1], p2=price[2], p3=price[3],
                         treasury_eth=treasury, mint_attractive=int(price[1] * (1 + p.fee) > p.mint_cost[1])))
    return rows

def summarize(p: P, rows):
    q = rows[len(rows) * 3 // 4:]                      # last quarter
    sup = np.array([r["supply"] for r in q]); days = np.arange(len(q))
    slope = np.polyfit(days, sup, 1)[0] / max(sup.mean(), 1) * 365   # relative per year
    m = lambda k: float(np.mean([r[k] for r in q]))
    return dict(s=p.s, d0=p.d0, supply=float(sup.mean()), slope_yr=float(slope), minted_d=m("minted"), fresh_d=m("fresh"), destroyed_d=m("destroyed") + m("broke"),
                recycled_d=m("recycled"), deaths_d=m("deaths"), burn_d=m("burned"), p1=m("p1"), mint_ok=m("mint_attractive"), treasury=q[-1]["treasury_eth"])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=2000); ap.add_argument("--single", action="store_true")
    ap.add_argument("--s", type=float, default=0.33); ap.add_argument("--d0", type=float, default=0.10)
    ap.add_argument("--halve-at", type=int, default=-1); ap.add_argument("--plot", action="store_true"); ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args(); OUT.mkdir(exist_ok=True)
    if a.single:
        p = P(days=a.days, s=a.s, d0=a.d0, halve_at=a.halve_at, seed=a.seed); rows = run(p)
        f = OUT / f"single_s{a.s}_d{a.d0}.csv"
        with open(f, "w", newline="") as fh: w = csv.DictWriter(fh, rows[0].keys()); w.writeheader(); w.writerows(rows)
        print(summarize(p, rows)); print("wrote", f)
        if a.plot:
            import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
            fig, ax = plt.subplots(3, 1, figsize=(10, 9), sharex=True)
            d = np.array([r["day"] for r in rows])
            ax[0].plot(d, [r["supply"] for r in rows], label="items in existence"); ax[0].plot(d, [r["listed"] for r in rows], label="listed"); ax[0].legend(); ax[0].set_ylabel("items")
            ax[1].plot(d, np.cumsum([r["burned"] for r in rows])); ax[1].set_ylabel("token burned, cumulative")
            ax[2].plot(d, [r["p1"] for r in rows], label="tier-1 price"); ax[2].axhline(p.mint_cost[1], ls="--", c="k", label="tier-1 mint cost"); ax[2].legend(); ax[2].set_ylabel("token"); ax[2].set_xlabel("day")
            fig.suptitle(f"s={a.s} d0={a.d0}" + (f" halve@{a.halve_at}" if a.halve_at >= 0 else "")); fig.tight_layout(); g = OUT / f"single_s{a.s}_d{a.d0}.png"; fig.savefig(g, dpi=100); print("wrote", g)
        return
    print(f"grid: s x d0, {a.days} days, {P().N} delvers; last-quarter means. slope_yr = relative supply change per year (0 = stable)\n")
    print(f"{'s':>5} {'d0':>5} | {'supply':>7} {'slope/yr':>9} {'mint/d':>7} {'fresh/d':>7} {'dstr/d':>7} {'recy/d':>7} {'dead/d':>7} {'burn/d':>9} {'p1':>7} {'mint_ok':>7} {'treas ETH':>10}")
    res = []
    for s in (0.0, 0.33, 0.66, 1.0):
        for d0 in (0.05, 0.10, 0.20):
            r = summarize(P(days=a.days, s=s, d0=d0, seed=a.seed), run(P(days=a.days, s=s, d0=d0, seed=a.seed))); res.append(r)
            print(f"{s:5.2f} {d0:5.2f} | {r['supply']:7.0f} {r['slope_yr']:+9.2f} {r['minted_d']:7.2f} {r['fresh_d']:7.2f} {r['destroyed_d']:7.2f} {r['recycled_d']:7.2f} {r['deaths_d']:7.2f} {r['burn_d']:9.0f} {r['p1']:7.0f} {r['mint_ok']:7.2f} {r['treasury']:10.3f}")
    with open(OUT / "grid.csv", "w", newline="") as fh: w = csv.DictWriter(fh, res[0].keys()); w.writeheader(); w.writerows(res)
    print("\nwrote", OUT / "grid.csv")

if __name__ == "__main__": main()
