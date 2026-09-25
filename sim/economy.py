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
`--single --s 0.33 --d0 0.1 --plot` for one configuration with a figure in sim/out/, and
`--sweep` for SPEC §8 step 2 in full: 228 runs of 10,000 days on a process pool (s x d0 x seeds 0-4
x a token-income halving on day 5,000, plus a mint/repair cost grid), one line per run in
sim/out/sweep.log, per-run rows in sweep.csv, aggregates in sweep_summary.csv, two figures.
Everything is seeded; a result you cannot reproduce is not a result.

Long-run finding (sweep, 2026-09-25; SPEC §5): minting is the balancing flow - it makes up what
death destroys beyond fresh drops, and dies when death destroys less - so supply is stable iff
(1-s)*deaths > fresh. s = 0 is flat at d0 0.10-0.20; s = 1/3 there is flat in circulation only.
No budget ever binds (income 200 token/delver/day, burn <= 10.2), so the halving and the costs
move only balances, burn and the tier-1 price: v0 cannot test price coupling or set the fee
constants. v0 gaps it exposed: nothing buys t2/t3 (their listings only grow); the implicit market
pays sellers from no balance; recycled loot goes to survivors in index order, not by SPEC §3.5's
lottery.
"""
import argparse, csv, hashlib, time
import multiprocessing as mp
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
    halve_at: int = -1                            # day token_per_eth halves: token income halves, the token doubles vs ETH (-1: never)
    seed: int = 0

def run(p: P, log=False, extra=False):
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
        burned = minted = bought = deaths = destroyed = recycled = repaired = broke = sold = fresh = short = 0
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
                runners[i] = False; short += 1
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
        if extra: rows[-1].update({f"l{t}": int(market[t]) for t in range(1, T + 1)}, short=short, tok_min=float(tok.min()))  # sweep only
    return rows

def summarize(p: P, rows):
    q = rows[len(rows) * 3 // 4:]                      # last quarter
    sup = np.array([r["supply"] for r in q]); days = np.arange(len(q))
    slope = np.polyfit(days, sup, 1)[0] / max(sup.mean(), 1) * 365   # relative per year
    m = lambda k: float(np.mean([r[k] for r in q]))
    return dict(s=p.s, d0=p.d0, supply=float(sup.mean()), slope_yr=float(slope), minted_d=m("minted"), fresh_d=m("fresh"), destroyed_d=m("destroyed") + m("broke"),
                recycled_d=m("recycled"), deaths_d=m("deaths"), burn_d=m("burned"), p1=m("p1"), mint_ok=m("mint_attractive"), treasury=q[-1]["treasury_eth"])

# --- the long-run sweep (SPEC §8 step 2) ------------------------------------------------------------
# main: s x d0 x seeds 0-4 x {no halving, halving on day days/2}. cost: the corner s in {0, .33} x d0 in
# {.1, .2} x mint-cost scale (every tier) x repair cost x seeds 0-2. A run is a pure function of its config,
# so the same command writes the same sweep.csv and sweep_summary.csv; wall-clock goes to the log only.
S_, D0_ = (0.0, 0.33, 0.66, 1.0), (0.05, 0.10, 0.20)
SEC_PER_KDAY = 1.5                     # one run, one of 8 busy workers on the 4C/8T dev box; feeds the start-up estimate only
VIABLE, ROBUST, FLAT = 0.5, 0.9, 0.01  # fixed before the 10k sweep ran: mint_ok >= .5 (>= .9) and |circ slope| <= 1 %/yr on EVERY seed

def jobs(days):
    js = [("main", s, d0, seed, h, 1.0, 30.0) for s in S_ for d0 in D0_ for h in (-1, days // 2) for seed in range(5)]
    js += [("cost", s, d0, seed, -1, m, rc) for s in (0.0, 0.33) for d0 in (0.10, 0.20) for m in (0.75, 1.0, 1.33) for rc in (15.0, 30.0, 60.0) for seed in range(3)]
    return [(i, days) + j for i, j in enumerate(js, 1)]

def one(job):
    i, days, grid, s, d0, seed, h, m, rc = job; t0 = time.time()
    p = P(days=days, s=s, d0=d0, seed=seed, halve_at=h, repair_cost=rc, mint_cost=P.mint_cost if m == 1.0 else tuple(c * m for c in P.mint_cost))
    rows = run(p, extra=True); n = len(rows); a, H, W = n * 3 // 4, days // 2, days // 10
    col = lambda k: np.array([r[k] for r in rows], float)
    lq = lambda k: float(col(k)[a:].mean()); win = lambda k: float(col(k)[H:H + W].mean())
    circ = col("supply") - col("l2") - col("l3")   # circulating: less t2/t3 listings, which nothing in v0 ever buys
    rec = dict(idx=i, grid=grid, s=s, d0=d0, seed=seed, halve_at=h, mint_scale=m, repair_cost=rc, days=days) | summarize(p, rows) | dict(
        end_supply=rows[-1]["supply"], net_d=lq("minted") + lq("fresh") - lq("destroyed") - lq("broke"),   # items/day, = supply slope
        circ=float(circ[a:].mean()), circ_slope_yr=float(np.polyfit(np.arange(n - a), circ[a:], 1)[0] / max(circ[a:].mean(), 1) * 365),
        l1=lq("l1"), l23=lq("l2") + lq("l3"), p2=lq("p2"), p3=lq("p3"), repaired_d=lq("repaired"),
        short=int(col("short").sum()), broke=int(col("broke").sum()), tok_min=rows[-1]["tok_min"],   # budget: runners priced out, repairs unaffordable
        w_mint_ok=win("mint_attractive"), w_minted_d=win("minted"), w_burn_d=win("burned"), w_supply=win("supply"),   # the days//10 after day days//2
        slope800=summarize(p, rows[:800])["slope_yr"] if n >= 800 else float("nan"), slope2000=summarize(p, rows[:2000])["slope_yr"] if n >= 2000 else float("nan"),
        fp=hashlib.sha1(np.array([[v for k, v in r.items() if k != "tok_min"] for r in rows], float).tobytes()).hexdigest()[:12])   # every day, every field but balances
    ds = lambda x: x[:n // 10 * 10].reshape(-1, 10).mean(1).astype(np.float32)
    ser = dict(supply=ds(col("supply")), circ=ds(circ), minted=ds(col("minted")), burned=ds(col("burned")), tok_min=ds(col("tok_min"))) if grid == "main" else None
    return rec, ser, time.time() - t0

def verdict(rs):
    ok = all(r["mint_ok"] >= VIABLE and abs(r["circ_slope_yr"]) <= FLAT for r in rs)
    return "ROBUST" if ok and all(r["mint_ok"] >= ROBUST for r in rs) else "viable" if ok else "no"

def sweep(days, workers):
    js = jobs(days); n = len(js); H = days // 2; t0 = time.time(); log = open(OUT / "sweep.log", "w")
    def say(x=""): print(x, flush=True); log.write(x + "\n"); log.flush()
    nm = sum(j[2] == "main" for j in js)
    say(f"sweep: {n} runs ({nm} main + {n - nm} cost), {days} days each, {workers} workers; estimate ~{n * days / 1000 * SEC_PER_KDAY / workers / 60:.1f} min")
    R, SER, cpu = {}, {}, 0.0
    with mp.Pool(workers) as pool:
        for k, (r, ser, dt) in enumerate(pool.imap_unordered(one, js), 1):
            R[r["idx"]] = r; SER[r["idx"]] = ser; cpu += dt; el = time.time() - t0
            say(f"[{k:3d}/{n}] #{r['idx']:<3d} {r['grid']} s={r['s']:.2f} d0={r['d0']:.2f} seed={r['seed']} halve={r['halve_at']:>5d} mint x{r['mint_scale']:.2f} repair {r['repair_cost']:2.0f}"
                f" | {dt:5.1f}s t+{el:4.0f}s eta {el / k * (n - k):4.0f}s | end supply {r['end_supply']:6d} slope/yr {r['slope_yr']:+.3f} mint_ok {r['mint_ok']:.2f} burn/d {r['burn_d']:5.0f}")
    say(f"all {n} runs finished: {time.time() - t0:.0f} s wall, {cpu:.0f} s summed over runs")
    R = [R[i] for i in sorted(R)]
    with open(OUT / "sweep.csv", "w", newline="") as fh: w = csv.DictWriter(fh, R[0].keys()); w.writeheader(); w.writerows(R)
    main_, cost = [r for r in R if r["grid"] == "main"], [r for r in R if r["grid"] == "cost"]
    g = lambda rs, **kw: [r for r in rs if all(r[k] == v for k, v in kw.items())]
    st = lambda rs, k: np.array([r[k] for r in rs], float)
    out = []
    def add(table, rs, keys, s, d0, h=-1, m=1.0, rc=30.0):
        for k in keys: v = st(rs, k); out.append(dict(table=table, s=s, d0=d0, halve_at=h, mint_scale=m, repair_cost=rc, metric=k, n=len(v), mean=v.mean(), std=v.std(), min=v.min(), max=v.max()))
    MK = ("supply", "end_supply", "slope_yr", "circ_slope_yr", "net_d", "mint_ok", "minted_d", "fresh_d", "destroyed_d", "recycled_d", "burn_d", "p1", "p2", "p3", "l23",
          "slope800", "slope2000", "w_mint_ok", "w_minted_d", "w_burn_d", "short", "broke", "tok_min")
    say(f"\n(1) main grid, {days} days, seeds 0-4: last-quarter means (days {days * 3 // 4}-{days - 1}); mean ± sd over seeds, [min, max] across seeds")
    say(f"    circ = supply less t2/t3 listings (v0 has no buyer for them); net/d = minted + fresh - destroyed (items/day); sink-fresh = destroyed - fresh drops (items/day),"
        f" the margin minting fills; verdict: mint_ok >= {VIABLE} (ROBUST >= {ROBUST}) and |circ| <= {FLAT:.0%}/yr on every seed")
    say(f"{'s':>5} {'d0':>5} {'halve':>5} | {'supply':>13} {'slope/yr [min, max]':>22} {'circ/yr [min, max]':>22} {'net/d':>6} | {'sink-fresh':>10} {'mint_ok [min]':>13} {'mint/d':>6} {'burn/d':>12} {'p1':>10} {'t2t3 listed':>11} | verdict")
    for s in S_:
        for d0 in D0_:
            for h in (-1, H):
                rs = g(main_, s=s, d0=d0, halve_at=h); add("main", rs, MK, s, d0, h); v = {k: st(rs, k) for k in MK}
                say(f"{s:5.2f} {d0:5.2f} {h:5d} | {v['supply'].mean():6.0f} ± {v['supply'].std():4.0f} {v['slope_yr'].mean():+7.3f} [{v['slope_yr'].min():+.3f},{v['slope_yr'].max():+.3f}]"
                    f" {v['circ_slope_yr'].mean():+7.3f} [{v['circ_slope_yr'].min():+.3f},{v['circ_slope_yr'].max():+.3f}] {v['net_d'].mean():+6.2f} | {(v['destroyed_d'] - v['fresh_d']).mean():+10.2f} {v['mint_ok'].mean():5.2f} [{v['mint_ok'].min():.2f}]"
                    f" {v['minted_d'].mean():8.2f} {v['burn_d'].mean():6.0f} ± {v['burn_d'].std():3.0f} {v['p1'].mean():5.0f} ± {v['p1'].std():2.0f} {v['l23'].mean():11.0f} | {verdict(rs)}")
    inc = P.eth_income * P.token_per_eth
    say(f"\n(2) halving: token per ETH halves on day {H} (each delver's token income {inc:.0f} -> {inc / 2:.0f}/day). halve - control, paired by seed; window = days {H}-{H + days // 10 - 1}, last quarter = days {days * 3 // 4}+")
    say(f"{'s':>5} {'d0':>5} | {'identical':>9} | {'dmint_ok win [min, max]':>24} {'dburn/d win [min, max]':>24} | {'dmint_ok lq':>11} {'dburn/d lq':>10} | poorest delver at end, control -> halve")
    for s in S_:
        for d0 in D0_:
            ps = list(zip(g(main_, s=s, d0=d0, halve_at=-1), g(main_, s=s, d0=d0, halve_at=H)))
            dl = [dict(d_w_mint_ok=b["w_mint_ok"] - c["w_mint_ok"], d_w_burn_d=b["w_burn_d"] - c["w_burn_d"], d_w_minted_d=b["w_minted_d"] - c["w_minted_d"], d_mint_ok=b["mint_ok"] - c["mint_ok"],
                       d_burn_d=b["burn_d"] - c["burn_d"], d_supply=b["supply"] - c["supply"], identical=float(b["fp"] == c["fp"]), tok_min_ratio=b["tok_min"] / c["tok_min"]) for c, b in ps]
            add("halving", dl, dl[0].keys(), s, d0, H); v = {k: st(dl, k) for k in dl[0]}
            say(f"{s:5.2f} {d0:5.2f} | {int(v['identical'].sum()):5d}/{len(dl)} | {v['d_w_mint_ok'].mean():+8.3f} [{v['d_w_mint_ok'].min():+.3f},{v['d_w_mint_ok'].max():+.3f}] {v['d_w_burn_d'].mean():+8.1f} [{v['d_w_burn_d'].min():+.1f},{v['d_w_burn_d'].max():+.1f}]"
                f" | {v['d_mint_ok'].mean():+11.3f} {v['d_burn_d'].mean():+10.1f} | {np.mean([c['tok_min'] for c, _ in ps]):9.0f} -> {np.mean([b['tok_min'] for _, b in ps]):9.0f}")
    say(f"\n(3) cost sensitivity, no halving, seeds 0-2: mint cost x scale on every tier (t1 = {P.mint_cost[1]} x scale), repair cost in token; mean over seeds, [min mint_ok]")
    say(f"{'s':>5} {'d0':>5} {'mint':>5} {'repair':>6} | {'supply':>6} {'slope/yr':>8} {'circ/yr':>8} {'mint_ok [min]':>13} {'mint/d':>6} {'repair/d':>8} {'burn/d':>7} {'p1':>5} | verdict")
    CK = ("supply", "slope_yr", "circ_slope_yr", "mint_ok", "minted_d", "repaired_d", "burn_d", "p1", "l1", "net_d")
    for s in (0.0, 0.33):
        for d0 in (0.10, 0.20):
            for m in (0.75, 1.0, 1.33):
                for rc in (15.0, 30.0, 60.0):
                    rs = g(cost, s=s, d0=d0, mint_scale=m, repair_cost=rc); add("cost", rs, CK, s, d0, -1, m, rc); v = {k: st(rs, k) for k in CK}
                    say(f"{s:5.2f} {d0:5.2f} {m:5.2f} {rc:6.0f} | {v['supply'].mean():6.0f} {v['slope_yr'].mean():+8.3f} {v['circ_slope_yr'].mean():+8.3f} {v['mint_ok'].mean():5.2f} [{v['mint_ok'].min():.2f}]"
                        f" {v['minted_d'].mean():8.2f} {v['repaired_d'].mean():8.2f} {v['burn_d'].mean():7.0f} {v['p1'].mean():5.0f} | {verdict(rs)}")
    say(f"\n(4) transient vs steady state: relative supply slope/yr over the last quarter of the first 800 / 2,000 / {days} days, no halving; seed 0 | mean [min, max] over seeds 0-4")
    say(f"{'s':>5} {'d0':>5} | {'800 d':>28} | {'2,000 d':>28} | {f'{days:,} d':>28} | {'circ, last q':>12} {'net items/d':>11}")
    for s in S_:
        for d0 in D0_:
            rs = g(main_, s=s, d0=d0, halve_at=-1); f = lambda k: f"{rs[0][k]:+.3f} | {st(rs, k).mean():+.3f} [{st(rs, k).min():+.3f},{st(rs, k).max():+.3f}]"
            say(f"{s:5.2f} {d0:5.2f} | {f('slope800'):>28} | {f('slope2000'):>28} | {f('slope_yr'):>28} | {st(rs, 'circ_slope_yr').mean():+12.3f} {st(rs, 'net_d').mean():+11.2f}")
    with open(OUT / "sweep_summary.csv", "w", newline="") as fh: w = csv.DictWriter(fh, out[0].keys()); w.writeheader(); w.writerows(out)
    vm = {(s, d0): verdict(g(main_, s=s, d0=d0, halve_at=-1)) for s in S_ for d0 in D0_}
    vc = {(s, d0, m, rc): verdict(g(cost, s=s, d0=d0, mint_scale=m, repair_cost=rc)) for s in (0.0, 0.33) for d0 in (0.10, 0.20) for m in (0.75, 1.0, 1.33) for rc in (15.0, 30.0, 60.0)}
    say(f"\nverdict, main grid (every seed): " + ", ".join(f"s={s:g} d0={d0:g} {v}" for (s, d0), v in vm.items() if v != "no") + f"; all other (s, d0): no")
    say(f"verdict, cost grid: {sum(v == vm[k[:2]] for k, v in vc.items())}/{len(vc)} (s, d0, mint, repair) cells keep their main-grid verdict")
    dup =[(c, r) for c in g(cost, mint_scale=1.0, repair_cost=30.0) for r in g(main_, halve_at=-1) if (r["s"], r["d0"], r["seed"]) == (c["s"], c["d0"], c["seed"])]
    same = sum(all(repr(c[k]) == repr(r[k]) for k in c if k not in ("idx", "grid")) for c, r in dup)   # repr: nan-safe, bit-exact
    say(f"\nchecks: {same}/{len(dup)} configs run in both grids (separate processes) agree on every field; budget never binds? runner-days priced out = {sum(r['short'] for r in R)},"
        f" repairs unaffordable = {sum(r['broke'] for r in R)}, poorest delver at end >= {min(r['tok_min'] for r in R):.0f} token (income {inc:.0f}/day, burn <= {max(r['burn_d'] for r in R) / P.N:.1f}/delver/day)")
    plot(R, SER, days)
    say(f"done: {n} runs, {time.time() - t0:.0f} s wall on {workers} workers; wrote {OUT / 'sweep.csv'}, {OUT / 'sweep_summary.csv'}, {OUT / 'sweep_supply.png'}, {OUT / 'sweep_halving.png'}, {OUT / 'sweep.log'}")
    log.close()

def plot(R, SER, days):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    ink, ink2, bg, c1, c2 = "#0b0b0b", "#52514e", "#fcfcfb", "#2a78d6", "#eb6834"   # dataviz reference palette, slots 1-2
    plt.rcParams.update({"figure.facecolor": bg, "axes.facecolor": bg, "axes.edgecolor": "#c3c2b7", "axes.labelcolor": ink2, "xtick.color": ink2, "ytick.color": ink2, "text.color": ink,
                         "axes.grid": True, "grid.color": "#e1e0d9", "grid.linewidth": 0.6, "axes.spines.top": False, "axes.spines.right": False, "font.size": 9, "axes.titlesize": 9.5})
    H = days // 2; x = np.arange(days // 10) * 10 + 5; main_ = [r for r in R if r["grid"] == "main"]
    fig, ax = plt.subplots(len(S_), len(D0_), figsize=(13, 12.5), sharex=True)
    for i, s in enumerate(S_):
        for j, d0 in enumerate(D0_):
            a = ax[i, j]; rs = [r for r in main_ if (r["s"], r["d0"], r["halve_at"]) == (s, d0, -1)]
            for k, c, lab in (("supply", c1, "all items in existence"), ("circ", c2, "circulating: less t2/t3 listings, which nothing in v0 buys")):
                for r in rs: a.plot(x, SER[r["idx"]][k], c=c, lw=1, label=lab if r["seed"] == 0 else None)
            mo = [r["mint_ok"] for r in rs]
            a.set_title(f"s = {s:g}, d0 = {d0:g}: {verdict(rs)}\nmint_ok {min(mo):.2f}-{max(mo):.2f} · circ {np.mean([r['circ_slope_yr'] for r in rs]):+.1%}/yr · all {np.mean([r['slope_yr'] for r in rs]):+.1%}/yr", loc="left")
            a.set_ylim(bottom=0); a.set_xlim(0, days)
            if j == 0: a.set_ylabel("items")
            if i == len(S_) - 1: a.set_xlabel("day")
    fig.suptitle(f"Item supply over {days:,} days, seeds 0-4 overlaid, no halving. Verdict: mint_ok >= {VIABLE} (ROBUST >= {ROBUST}) and |circ slope| <= {FLAT:.0%}/yr on every seed", y=0.995)
    fig.legend(*ax[0, 0].get_legend_handles_labels(), loc="upper center", bbox_to_anchor=(0.5, 0.972), ncol=2, frameon=False)
    fig.tight_layout(rect=(0, 0, 1, 0.945)); fig.savefig(OUT / "sweep_supply.png", dpi=110); plt.close(fig)
    ps = [(c, b) for c in main_ if c["halve_at"] == -1 for b in main_ if b["halve_at"] == H and (b["s"], b["d0"], b["seed"]) == (c["s"], c["d0"], c["seed"])]
    fig, ax = plt.subplots(1, 3, figsize=(15, 4.6))
    for c, b in ps:
        ax[0].plot(x, SER[c["idx"]]["tok_min"] / 1e6, c=c1, lw=0.8, alpha=0.5); ax[0].plot(x, SER[b["idx"]]["tok_min"] / 1e6, c=c2, lw=0.8, alpha=0.5)
        ax[1].plot(x, SER[b["idx"]]["burned"] - SER[c["idx"]]["burned"], c=c1, lw=0.8); ax[2].plot(x, SER[b["idx"]]["minted"] - SER[c["idx"]]["minted"], c=c1, lw=0.8)
    ax[0].plot([], [], c=c1, label="control"); ax[0].plot([], [], c=c2, label=f"token income halved on day {H}"); ax[0].legend(frameon=False, loc="upper left")
    same = sum(c["fp"] == b["fp"] for c, b in ps)
    for a, t in zip(ax, ("(a) poorest delver's token balance, millions", "(b) tokens burned per day, halve - control", "(c) tier-1 mints per day, halve - control")):
        a.axvline(H, c=ink2, lw=0.8); a.set_title(t, loc="left"); a.set_xlabel("day (10-day means)"); a.set_xlim(0, days)
    for a, k in ((ax[1], "burned"), (ax[2], "minted")):
        mx = max(float(np.abs(SER[b["idx"]][k] - SER[c["idx"]][k]).max()) for c, b in ps); a.set_ylim(-max(1.0, 1.2 * mx), max(1.0, 1.2 * mx))
        a.text(0.02, 0.95, f"max |difference| = {mx:g}; whole trajectory identical in {same}/{len(ps)} pairs", transform=a.transAxes, va="top", color=ink2)
    fig.suptitle(f"Halving vs control, all {len(ps)} (s, d0, seed) pairs: the shock lands on balances (a) and nowhere else (b, c)", x=0.01, ha="left")
    fig.tight_layout(); fig.savefig(OUT / "sweep_halving.png", dpi=110); plt.close(fig)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=None); ap.add_argument("--single", action="store_true")   # days: 2,000 (grid, single), 10,000 (sweep)
    ap.add_argument("--s", type=float, default=0.33); ap.add_argument("--d0", type=float, default=0.10)
    ap.add_argument("--halve-at", type=int, default=-1); ap.add_argument("--plot", action="store_true"); ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--sweep", action="store_true"); ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args(); OUT.mkdir(exist_ok=True)
    if a.sweep: return sweep(a.days or 10_000, a.workers)
    a.days = a.days or 2000
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
