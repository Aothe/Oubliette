"""Economy simulation v1 (SPEC §8 step 2, second pass): binding budgets, a closed token ledger, explicit
merchants, demand for every tier and the SPEC §3.5 loot lottery.

v0 (`sim/economy.py`, frozen: it is the artifact that reproduces the v0 §5 row) settled s against d0 but
could not set the fee constants or test price coupling: no budget ever bound, its implicit market paid
sellers from no balance, nothing bought t2/t3 and recycled loot went first-come by index. v1 closes the
four gaps. It is standalone, not an import of v0: v0's `P` means different things (a scalar income, a
price rule instead of merchants), and coupling a moving file to a frozen one would let a v1 edit move
the v0 row. The item constants (tiers, death multipliers, mint and repair costs, drops, durability) are
v0's, copied by value.

Model (one day = income, gear-up, deaths, drops, repair, selling, quotes):
  ledger    tokens are integers (1 token = 100 units). The ONLY source is a purchase with ETH at the
            exogenous price tpe (token per ETH) - an agent's own decision, out of its own ETH wallet; the
            ONLY exits are burns (mint, repair, exchange fee). No agent sells token back. Asserted every
            day, exactly: purchases - burns == change in the sum of every balance; items likewise:
            mints + fresh drops - destroyed - broken == change in supply. The game never emits the token.
  budgets   delver i earns e_i ETH/day into a wallet capped at H = 30 days of income (unspent budget
            beyond that goes elsewhere). e_i is lognormal, sigma 1.2 (top 5 % of delvers hold a third
            of all game budget). CALIBRATION RULE (fixed before any run): the MEDIAN e_i buys exactly
            the expected token-equivalent cost of playing tier 1 on every run-day in the reference
            economy (P() defaults: d0 0.10, mint 120 token + 0.002 ETH, repair 30, 50k token/ETH),
            ignoring loot income - the median delver just breaks even on the cheapest gear. Incomes
            are then held fixed in ETH across every experiment. Token is bought just-in-time: only the
            shortfall of a purchase the delver has decided to make.
  delvers   N = 600, risk appetite r, skill k (v0's). Each day each runs with p 0.5; a runner with no
            gear gears up or, if it can afford no tier, sits out ("priced out"). Tier choice: maximise
            U(t) = -p_death(t) * (W_i + c_t) over the tiers it owns (c = the item's market value) or can
            afford (c = cheapest source: a delver listing, a merchant's ask, or minting at mint token +
            mint ETH). W_i = (1 - r_i) * H * e_i * tpe is the value of surviving a run: a month of game
            budget, discounted by risk appetite - so the rich and the careful buy safety (t2/t3) when
            its price is right, and demand for every tier comes from the price, not a quota. Worn gear
            below the durability floor is repaired (burn) if affordable and cheaper than replacing it,
            else it breaks. Spares: keep up to 3 of the preferred tier, list everything else.
  merchants M = 8, each with a stake K0 = its target inventory at base prices (8/4/1 items -> 4,000
            token, bought with ETH at genesis), topped back up from its own ETH budget (the mean
            delver's). Each posts a bid and an ask per tier around a mid anchored to the PUBLIC price
            (SPEC §3.7: price history is public; an EMA, weight 0.1, of each day's volume-weighted
            trade price) and skewed by its own inventory - restocking: mid = public * exp(-0.1 *
            (inv - target) / target). Spread = own margin U(5 %, 25 %) + the fee, passed through; ask
            <= the mint-equivalent (nobody pays more than minting); no bid at 3x target inventory or
            without the cash. Profit/loss (equity at the public price, less top-ups) and inventory are
            outputs. (A first draft quoted on inventory alone, blind to where the market cleared, and
            bought high to sell low; the public anchor replaced it before any sweep.)
  exchange  GE-style offers. A seller with surplus sells at once to the best merchant bid if that bid
            is within its time preference (U(0, 20 %) per delver) of the listing price, else lists at
            the mid of the best merchant bid and ask; a buyer takes the cheapest of delver listings,
            merchant asks and minting. Unsold after 3 days, a listing goes to the best merchant bid,
            else is relisted at the day's price. The fee is paid by the seller and burned (OSRS GE
            tax), on every trade, delver or merchant.
  loot      survivors who find the chest (p q_loot) share the recycled pool, one item each. Allocation
            is a switch: "index" (v0: lowest index first), "uniform" (random finishers) or "weighted"
            (SPEC §3.5, the default: finishers drawn by contribution = (0.25 + skill) / gear death
            multiplier, without replacement, the first drawn taking the biggest item). Others may draw
            fresh boss gear (q_fresh, v0's). Six seeded RNG streams (population, running, death, drops,
            lottery, buyer order), so a shocked run is bit-identical to its control until the shock and
            s = 0 (empty pool) is bit-identical under every allocation - both are checked.

Run `--sweep` for the five experiments - A: s x d0; B: fee x mint x repair; C: token_per_eth x0.5 / x2
on day 5,000, paired by seed with A; D: loot allocation; E: calibration sensitivity - 427 runs of 10,000
days (~10 min on 8 workers), one flushed line per run to stdout and sim/out/sweep2.log, sweep2.csv,
sweep2_summary.csv and three figures. `--single --s 0.33 --d0 0.1` runs one configuration.

Findings (sweep, 2026-09-27; SPEC §5, v1 row). Pass/fail rules are constants below, fixed before the run.
  A  Nothing inflates once budgets bind: total supply is flat (|slope| <= 1.1 %/yr, every seed) in all nine
     s x d0 cells. A glut crashes gear to 10-15 % of its mint cost, which lets the priced-out in (~180 -> 290
     runs/day) and makes worn gear cheaper than its repair, so it is scrapped (2-6 items/day): participation
     and scrapping are balancing flows v0 could not have. The verdict turns on minting: s = 0 ROBUST at d0
     .10/.20; s = 1/3 viable at .10 (mint_ok .73-.76) and ROBUST at .20 - in total supply, not circulation
     only; s = 2/3 viable at .20 only; minting dies at d0 .05 (s >= 1/3) and s = 2/3, d0 .10, and nearly at
     s = 0, d0 .05 (.22). Budgets bind: 39 % of runner-days priced out at s = 1/3, d0 .10 (22-63 % over
     wallet caps 60-15 days). Where minting is the marginal source t1 trades at the mint-equivalent (~210 of
     220 token), so the mint cost is the entry price. t2/t3 carry 8-76 % of runs, supplied by drops alone.
  B  Every one of 90 fee cells is stable; the constants do three different things. Mint cost is the
     participation dial (x0.5 / x1 / x2: 201 / 174 / 131 runs/day, 33 / 42 / 56 % priced out, s = 0). Repair is
     a near-free sink (10 -> 90 token: +680-1,100 burn/day for -1.6 to -3.4 % runs - it taxes budgets that would
     overflow anyway). The exchange fee costs delvers nothing and merchants 0.5-1.8 token/day per point.
     The 4 tightest-margin merchants carry 96-98 % of merchant volume and all its P&L: pooled, merchants
     profit at s = 1/3 for fee <= 5 % (+8 to +12 token/day), break even at 10 %, lose at 20 % (51/54 runs);
     at s = 0 they lose at every fee. Per seed the sign follows the tightest margin drawn (9 % profits, 6 %
     loses). Pre-registered region (stable + merchants in profit on every seed + runs >= 90 % of the
     most-played cell): 0/90 cells - negative.
  C  A 2x move in the token price re-equilibrates every cell (verdict unchanged, mint_ok >= .64) and never
     recovers: token dearer -> runs -16 to -27 %, burn -21 to -28 %, +10 to +14 pp priced out; cheaper -> runs
     +17 to +20 %, burn +21 to +28 %. A cheaper token lifts runs at once (0-26 days to within 5 % of final);
     a dearer one bleeds them over 190-844 days as token savings run down; mints overshoot (-80 % / +113 %
     at s = 1/3, d0 .10). The economy survives the chart; its size is the chart.
  D  Loot allocation moves who gets loot (Gini .82-.94 index, .26-.56 weighted, .07-.46 uniform) and merchant
     volume (index +1-3 items/day), not stability, minting or burn (index also costs ~10 runs/day at s = 2/3,
     d0 .20); s = 0 is bit-identical under all three.
  Limits: no agent sells token back, so loot winners hoard what they earn (+205 token/day at s = 1/3, d0 .10:
  21 % of all token bought) - in a real market that is sell pressure on a price held exogenous here;
  survival value scales with ETH income, not token wealth, so token-rich winners do not upgrade; no naked
  runs; merchant margins are drawn, not learned.
"""
import argparse, csv, hashlib, math, time
import multiprocessing as mp
from collections import deque
from dataclasses import dataclass
from pathlib import Path
import numpy as np

OUT = Path(__file__).resolve().parent / "out"
U = 100                                   # 1 token = 100 units: every balance, price, fee and burn is an integer

@dataclass(frozen=True)
class P:
    days: int = 10_000
    N: int = 600                          # delvers
    p_run: float = 0.5
    d0: float = 0.10
    s: float = 0.33                       # recycled fraction of a dead delver's equipped item (SPEC §3.5)
    q_loot: float = 0.35                  # chance a survivor finds the chest (draws from the recycled pool)
    q_fresh: float = 0.03                 # chance a survivor without loot gets FRESH boss gear
    tier_death: tuple = (2.0, 1.0, 0.8, 0.6)
    tier_base_price: tuple = (0, 100, 400, 1600)   # merchants' opening mids and stake
    mint_cost: tuple = (0, 120, 480, 1900)         # token burned to mint, x mint_scale
    mint_eth: tuple = (0, 0.002, 0.005, 0.01)      # ETH on mint -> treasury (SPEC §3.2); paid from the delver's ETH budget
    mint_scale: float = 1.0
    fresh_drop_w: tuple = (0.70, 0.25, 0.05)
    durability_loss: float = 0.08
    repair_floor: float = 0.25
    repair_cost: float = 30.0                      # token burned per repair
    fee: float = 0.02                              # exchange fee, seller pays, burned
    token_per_eth: float = 50_000.0
    shock_at: int = -1                             # day token_per_eth is multiplied by `shock` (-1: never)
    shock: float = 1.0
    sigma: float = 1.2                             # lognormal sd of log ETH income
    H: int = 30                                    # ETH wallet cap, days of income; also the survival-value horizon
    vault_keep: int = 3
    M: int = 8                                     # merchants
    m_target: tuple = (0, 8, 4, 1)                 # merchant target inventory per tier
    m_cap: int = 3                                 # no bid at m_cap x target
    m_spread: tuple = (0.05, 0.25)                 # merchant margin range (spread = margin + fee)
    kappa: float = 0.10                            # merchant inventory skew: mid = public price * exp(-kappa * (inv - target) / target)
    lam: float = 0.10                              # public price index: EMA weight on each day's volume-weighted trade price (SPEC §3.7: price history is public)
    list_days: int = 3
    impatience: float = 0.20                       # delver time preference ~ U(0, impatience)
    alloc: str = "weighted"                        # recycled-loot allocation: index | uniform | weighted
    seed: int = 0

def e_median(r=P()):
    """The calibration rule: ETH/day at which the median delver exactly affords tier 1 on every run-day."""
    runs_per_repair = math.ceil((1 - r.repair_floor) / r.durability_loss)
    per_run = r.d0 * 0.7 * r.tier_death[1] * (r.mint_cost[1] + r.mint_eth[1] * r.token_per_eth) + r.repair_cost / runs_per_repair   # E[1 - 0.6 skill] = 0.7
    return r.p_run * per_run / r.token_per_eth
E_MED = e_median()

COLS = ("supply", "s1", "s2", "s3", "equipped", "vault", "listed", "minv", "loot", "want", "runs", "r1", "r2", "r3", "short", "deaths", "destroyed", "recycled",
        "broke", "repaired", "minted", "m1", "m2", "m3", "fresh", "looted", "from_vault", "p2p", "m_sold", "m_bought", "burn_mint", "burn_repair", "burn_fee",
        "burned", "bought", "tok_delvers", "tok_merchants", "m_equity", "m_topup", "ref1", "ref2", "ref3", "tv1", "tv2", "tv3", "tn1", "tn2", "tn3", "treasury", "tpe")
CNT = ("buy", "short", "from_vault", "p2p", "m_sold", "m_bought", "burn_mint", "burn_repair", "burn_fee", "m1", "m2", "m3", "repaired", "broke")

def run(p: P):
    g_pop, g_run, g_die, g_drop, g_lot, g_ord = (np.random.default_rng(x) for x in np.random.SeedSequence(p.seed).spawn(6))
    N, M, T3 = p.N, p.M, (1, 2, 3)
    risk, skill, z = g_pop.uniform(0.1, 0.9, N), g_pop.uniform(0.0, 1.0, N), g_pop.standard_normal(N)
    hm = g_pop.uniform(*p.m_spread, M) + p.fee; dlt = g_pop.uniform(0.0, p.impatience, N).tolist()   # time preference: sell now if the bid is within dlt of the listing price
    ph = np.array(p.tier_base_price, float) * U                             # public price index per tier, units
    e = E_MED * np.exp(p.sigma * z); Wc = (1 - risk) * p.H * e * U          # ETH/day; survival value = Wc * tpe units
    pdb, td, lw = p.d0 * (1 - 0.6 * skill), np.array(p.tier_death), 0.25 + skill
    mint_u = [0] + [int(round(c * p.mint_scale * U)) for c in p.mint_cost[1:]]
    rep_u, fbp = int(round(p.repair_cost * U)), int(round(p.fee * 10_000))
    tgt, cap = np.array((1,) + p.m_target[1:], float), [0] + [p.m_cap * x for x in p.m_target[1:]]
    K0 = sum(p.m_target[t] * p.tier_base_price[t] for t in T3) * U
    em = E_MED * math.exp(P.sigma ** 2 / 2)                                   # merchants' ETH/day: the reference mean delver's
    fw = np.cumsum(p.fresh_drop_w); tpe = p.token_per_eth; treasury = 0.0; topup = 0
    eth = p.H * e; tok = np.zeros(N, np.int64); eq = np.zeros(N, np.int64); dur = np.ones(N); vault = np.zeros((N, 4), np.int64)
    won = np.zeros(N, np.int64); ran_lq = np.zeros(N, np.int64); lq0 = p.days * 3 // 4
    meth, mcash, minv = [p.H * em] * M, [K0] * M, [[0] * 4 for _ in range(M)]; mtop, mvol = [0] * M, [0] * M
    mstake = lambda: [mcash[m] + float(np.array(minv[m][1:], float) @ ph[1:]) - mtop[m] for m in range(M)]   # equity at the public price, less top-ups
    pool = np.zeros(4, np.int64); books = {t: [] for t in T3}; nbook = [0] * 4
    genesis = M * K0; bal_prev, sup_prev = sum(mcash), 0; assert bal_prev == genesis   # genesis: each merchant's stake, bought with ETH before day 0
    R = {k: np.zeros(p.days) for k in COLS}
    c = tv = tn = tU = ask = bid = None

    def pay(i, x):                        # delver i pays x units, buying only the shortfall with ETH - the only way token enters
        sh = x - int(tok[i])
        if sh > 0: eth[i] = max(eth[i] - sh / tU, 0.0); tok[i] += sh; c["buy"] += sh
        tok[i] -= x
    def mkt(t):                           # cheapest secondary offer in tier t: (price, 0, listing batch) or (price, 1, merchant)
        best = None
        for b in books[t]:
            if b[2] and (best is None or b[0] < best[0]): best = (b[0], 0, b)
        for m in range(M):
            if minv[m][t] > 0 and (best is None or ask[m][t] < best[0]): best = (ask[m][t], 1, m)
        return best
    def bestbid(t):
        best = None
        for m in range(M):
            b = bid[m][t]
            if b >= 1 and minv[m][t] < cap[t] and mcash[m] >= b and (best is None or b > bid[best][t]): best = m
        return best
    def refp(t):                          # listing price: mid of the best bid and the best ask (a merchant in stock, else minting)
        a = min([ask[m][t] for m in range(M) if minv[m][t] > 0] + [meq[t]]); m = bestbid(t)
        return (a + (bid[m][t] if m is not None else 0)) // 2
    def take(i, t, o):                    # delver i buys offer o; the seller pays the fee, burned
        price, kind, ref = o; pay(i, price); f = price * fbp // 10_000; c["burn_fee"] += f; tv[t] += price; tn[t] += 1
        if kind == 0: sl = ref[2].popleft(); tok[sl] += price - f; nbook[t] -= 1; c["p2p"] += 1
        else: mcash[ref] += price - f; minv[ref][t] -= 1; c["m_sold"] += 1; mvol[ref] += day >= lq0
    def dump(i, t):                       # delver i sells one tier-t item to the best merchant bid
        m = bestbid(t)
        if m is None: return False
        b = bid[m][t]; f = b * fbp // 10_000; mcash[m] -= b; minv[m][t] += 1; tok[i] += b - f; c["burn_fee"] += f; c["m_bought"] += 1; tv[t] += b; tn[t] += 1; mvol[m] += day >= lq0
        return True

    for day in range(p.days):
        if day == p.shock_at: tpe *= p.shock
        if day == lq0: st0 = mstake()
        tU = tpe * U; c = dict.fromkeys(CNT, 0); tv, tn = [0] * 4, [0] * 4
        eth = np.minimum(eth + e, p.H * e); meth = [min(x + em, p.H * em) for x in meth]
        for m in range(M):                # merchants top their cash back up to the stake from their own ETH budget
            x = min(K0 - mcash[m], int(meth[m] * tU))
            if x > 0: mcash[m] += x; meth[m] = max(meth[m] - x / tU, 0.0); c["buy"] += x; topup += x; mtop[m] += x
        meq = [0] + [mint_u[t] + int(round(p.mint_eth[t] * tU)) for t in T3]   # token-equivalent of minting, units
        mu = ph * np.exp(-p.kappa * (np.array(minv, float) - tgt) / tgt)        # quotes: the public price, skewed by own inventory (restocking)
        mu = np.clip(mu, U, np.maximum(np.array([U] + meq[1:], float) / (1 + hm[:, None] / 2), U))
        ask = np.minimum(np.round(mu * (1 + hm[:, None] / 2)), meq).astype(np.int64).tolist()
        bid = np.round(mu * (1 - hm[:, None] / 2)).astype(np.int64).tolist()
        # gear-up: naked runners, in random order
        runners = g_run.random(N) < p.p_run; want = int(runners.sum())
        ref = [0] + [refp(t) for t in T3]; mk = [None] + [mkt(t) for t in T3]
        lo = min(min(mk[t][0], meq[t]) if mk[t] else meq[t] for t in T3)
        for i in g_ord.permutation(np.flatnonzero(runners & (eq == 0))):
            vi = vault[i]; has = vi[1] or vi[2] or vi[3]; ti = int(tok[i]); b = ti + int(eth[i] * tU)
            if not has and b < lo: runners[i] = False; c["short"] += 1; continue
            W, best = Wc[i] * tpe, None
            for t in T3:
                if vi[t]: cost, o = ref[t], "v"
                else:
                    o = mk[t]
                    if o is not None and o[0] > b: o = None
                    if eth[i] >= p.mint_eth[t] and ti + int((eth[i] - p.mint_eth[t]) * tU) >= mint_u[t] and (o is None or meq[t] < o[0]): o = "mint"
                    if o is None: continue
                    cost = meq[t] if o == "mint" else o[0]
                u = -pdb[i] * td[t] * (W + cost)
                if best is None or u > best[0]: best = (u, t, o)
            if best is None: runners[i] = False; c["short"] += 1; continue
            _, t, o = best
            if o == "v": vault[i, t] -= 1; c["from_vault"] += 1
            elif o == "mint": eth[i] -= p.mint_eth[t]; treasury += p.mint_eth[t]; pay(i, mint_u[t]); c["burn_mint"] += mint_u[t]; c[f"m{t}"] += 1
            else: take(i, t, o); mk[t] = mkt(t)
            eq[i] = t; dur[i] = 1.0
        # the dungeon
        armed = runners & (eq > 0); rt = np.bincount(eq[armed], minlength=4)
        if day >= lq0: ran_lq += armed
        rd, rs = g_die.random(N), g_die.random(N)
        died = armed & (rd < pdb * td[eq]); rec = died & (rs < p.s)
        np.add.at(pool, eq[rec], 1); deaths, recycled = int(died.sum()), int(rec.sum()); eq[died] = 0
        surv = armed & ~died; r1, r2, r3 = g_drop.random(N), g_drop.random(N), g_drop.random(N)
        elig = np.flatnonzero(surv & (r1 < p.q_loot)); got = np.zeros(N, bool); k = min(int(pool[1:].sum()), len(elig))
        if k:
            items = g_lot.permutation(np.repeat(np.arange(1, 4), pool[1:]))[:k]
            if p.alloc == "index": win = elig[:k]
            elif p.alloc == "uniform": win = g_lot.permutation(elig)[:k]
            else: w = lw[elig] / td[eq[elig]]; win = g_lot.choice(elig, k, replace=False, p=w / w.sum()); items = np.sort(items)[::-1]
            vault[win, items] += 1; pool -= np.bincount(items, minlength=4); won[win] += 1; got[win] = True
        fr = np.flatnonzero(surv & ~got & (r2 < p.q_fresh)); vault[fr, 1 + (r3[fr] > fw[0]) + (r3[fr] > fw[1])] += 1
        dur[surv] -= p.durability_loss
        for i in np.flatnonzero(surv & (dur < p.repair_floor)):
            t = eq[i]; repl = min(mk[t][0], meq[t]) if mk[t] else meq[t]
            if rep_u <= repl and int(tok[i]) + int(eth[i] * tU) >= rep_u: pay(i, rep_u); c["burn_repair"] += rep_u; dur[i] = 1.0; c["repaired"] += 1
            else: eq[i] = 0; c["broke"] += 1
        # selling: expired listings go to the best merchant bid, the rest relist; spares beyond the preferred tier are listed
        ref = [0] + [refp(t) for t in T3]; new = {}
        for t in T3:
            keep, nb = [], deque()
            for bt in books[t]:
                if day - bt[1] >= p.list_days:
                    while bt[2] and dump(bt[2][0], t): bt[2].popleft(); nbook[t] -= 1
                    nb.extend(bt[2])
                elif bt[2]: keep.append(bt)
            books[t] = keep; new[t] = nb
        refa = np.array(ref[1:], float); ba = tok + (eth * tU).astype(np.int64)
        Ut = -(pdb[:, None] * td[1:]) * ((Wc * tpe)[:, None] + refa)
        Ut[(vault[:, 1:] == 0) & (ba[:, None] < refa)] = -np.inf
        ts = 1 + Ut.argmax(1); ar = np.arange(N); keep = np.zeros_like(vault); keep[ar, ts] = np.minimum(vault[ar, ts], p.vault_keep)
        sur = vault - keep; sur[:, 0] = 0
        for t in T3:
            ids = np.flatnonzero(sur[:, t])
            if len(ids):
                vault[ids, t] -= sur[ids, t]
                for i in g_ord.permutation(np.repeat(ids, sur[ids, t])).tolist():   # sellers in random order: sell now to a merchant, or list
                    m = bestbid(t)
                    if not (m is not None and bid[m][t] >= (1 - dlt[i]) * ref[t] and dump(i, t)): new[t].append(i); nbook[t] += 1
            if new[t]: books[t].append([ref[t], day, new[t]])
        mi = np.array(minv, float)
        for t in T3:
            if tn[t]: ph[t] += p.lam * (tv[t] / tn[t] - ph[t])                  # the day's trades move the public price
        # ledger and item checks - exact
        minted = c["m1"] + c["m2"] + c["m3"]; burned = c["burn_mint"] + c["burn_repair"] + c["burn_fee"]; fresh = len(fr)
        bal = int(tok.sum()) + sum(mcash)
        assert bal - bal_prev == c["buy"] - burned, f"token ledger broken, day {day}: d(balances) {bal - bal_prev} != purchases {c['buy']} - burns {burned}"
        assert tok.min() >= 0 and min(mcash) >= 0 and eth.min() >= 0, f"negative balance, day {day}"
        per = np.bincount(eq, minlength=4) + vault.sum(0) + np.array(nbook) + mi.sum(0).astype(np.int64) + pool
        sup = int(per[1:].sum())
        assert sup - sup_prev == minted + fresh - (deaths - recycled) - c["broke"], f"item ledger broken, day {day}"
        bal_prev, sup_prev = bal, sup
        r = R; d = day
        for k_, v in (("supply", sup), ("s1", per[1]), ("s2", per[2]), ("s3", per[3]), ("equipped", int((eq > 0).sum())), ("vault", int(vault[:, 1:].sum())),
                      ("listed", sum(nbook)), ("minv", int(mi[:, 1:].sum())), ("loot", int(pool[1:].sum())), ("want", want), ("runs", int(armed.sum())),
                      ("r1", rt[1]), ("r2", rt[2]), ("r3", rt[3]), ("deaths", deaths), ("destroyed", deaths - recycled), ("recycled", recycled), ("minted", minted),
                      ("fresh", fresh), ("looted", k), ("burned", burned), ("bought", c["buy"]), ("tok_delvers", int(tok.sum())), ("tok_merchants", sum(mcash)),
                      ("m_equity", sum(mcash) + float((mi[:, 1:] @ ph[1:]).sum())), ("m_topup", topup), ("ref1", ref[1]), ("ref2", ref[2]), ("ref3", ref[3]),
                      ("tv1", tv[1]), ("tv2", tv[2]), ("tv3", tv[3]), ("tn1", tn[1]), ("tn2", tn[2]), ("tn3", tn[3]), ("treasury", treasury), ("tpe", tpe)):
            r[k_][d] = v
        for k_ in CNT[1:]: r[k_][d] = c[k_]
    tight = np.argsort(hm)[:M // 2]; wide = np.argsort(hm)[M // 2:]; dm = (np.array(mstake()) - np.array(st0)) / (p.days - lq0) / U   # merchant P&L/day, last quarter
    x = dict(genesis=genesis, m_pnl_tight=float(dm[tight].sum()), m_pnl_wide=float(dm[wide].sum()), m_vol_tight=float(sum(mvol[m] for m in tight) / max(sum(mvol), 1)),
             m_margin=float(np.mean(hm) - p.fee), loot_gini=gini(won), loot_top10_income=share_top(won, e), loot_top10_skill=share_top(won, skill),
             excluded=float((ran_lq == 0).mean()), won_total=int(won.sum()), tok_top10_income=share_top(tok, e), tok_top10=float(np.sort(tok)[-N // 10:].sum() / max(tok.sum(), 1)),
             tok_idle=float(tok[ran_lq == 0].sum() / max(tok.sum(), 1)))
    return R, x

def gini(v):
    v = np.sort(np.asarray(v, float)); n = len(v)
    return float((2 * np.arange(1, n + 1) - n - 1) @ v / (n * v.sum())) if v.sum() > 0 else 0.0
def share_top(v, by, q=0.9):
    return float(v[by >= np.quantile(by, q)].sum() / v.sum()) if v.sum() > 0 else float("nan")

def summarize(p: P, R, x):
    a = p.days * 3 // 4; n = p.days - a; q = {k: v[a:] for k, v in R.items()}; t = np.arange(n)
    m = lambda k: float(q[k].mean()); fit = lambda y: float(np.polyfit(t, y, 1)[0])
    sup = q["supply"]; circ = sup - q["listed"]; want = q["want"].sum()
    vw = lambda i: float(q[f"tv{i}"].sum() / q[f"tn{i}"].sum() / U) if q[f"tn{i}"].sum() else float("nan")
    return dict(supply=m("supply"), net_d=fit(sup), slope_yr=fit(sup) / max(m("supply"), 1) * 365, circ_slope_yr=fit(circ) / max(float(circ.mean()), 1) * 365,
                mint_ok=float((q["minted"] > 0).mean()), mint_ok_t1=float((q["m1"] > 0).mean()), minted_d=m("minted"), m1_d=m("m1"), m2_d=m("m2"), m3_d=m("m3"),
                fresh_d=m("fresh"), destroyed_d=m("destroyed") + m("broke"), recycled_d=m("recycled"), deaths_d=m("deaths"), runs_d=m("runs"),
                t2t3_share=float((q["r2"] + q["r3"]).sum() / max(q["runs"].sum(), 1)), priced_out=float(q["short"].sum() / want) if want else float("nan"),
                excluded=x["excluded"], burn_d=m("burned") / U, burn_mint_d=m("burn_mint") / U, burn_repair_d=m("burn_repair") / U, burn_fee_d=m("burn_fee") / U,
                bought_d=m("bought") / U, repaired_d=m("repaired"), broke_d=m("broke"), p2p_d=m("p2p"), mvol_d=m("m_sold") + m("m_bought"),
                m_pnl_d=fit(q["m_equity"] - q["m_topup"]) / U, m_inv=m("minv"), m_cash=m("tok_merchants") / U, listed=m("listed"), s23=m("s2") + m("s3"),
                p1=vw(1), p2=vw(2), p3=vw(3), ref1=m("ref1") / U, loot_gini=x["loot_gini"], loot_top10_income=x["loot_top10_income"],
                loot_top10_skill=x["loot_top10_skill"], tok_delvers=m("tok_delvers") / U, tok_top10=x["tok_top10"], tok_top10_income=x["tok_top10_income"], tok_idle=x["tok_idle"], treasury=float(q["treasury"][-1]),
                m_pnl_tight=x["m_pnl_tight"], m_pnl_wide=x["m_pnl_wide"], m_vol_tight=x["m_vol_tight"], m_margin=x["m_margin"])

# --- the sweep: five experiments, pass/fail rules fixed before any of them ran ------------------------------------------------------------
VIABLE, ROBUST, FLAT = 0.5, 0.9, 0.01    # v0's rule, on TOTAL supply (v1 has a buyer for every tier): mint_ok >= .5 (.9) and |supply slope| <= 1 %/yr, every seed
BINDS = 0.05                             # budgets bind iff the baseline priced-out rate >= 5 % of runner-days; below it the calibration failed
PART = 0.90                              # fee region: runs/day >= 90 % of the best cell's, and merchants' P&L >= 0, and VIABLE, on every seed
RECOVER, SETTLE = 0.05, 0.05             # coupling: recovers iff last-quarter runs/day within 5 % of control; settle = days until the 100-day gap stays within 5 % of its final value
SEC_PER_KDAY = 1.1                       # one run on one of 8 busy workers; the start-up estimate only
S_A, D_A = (0.0, 0.33, 0.66), (0.05, 0.10, 0.20)
FEES, MINTS, REPAIRS = (0.0, 0.02, 0.05, 0.10, 0.20), (0.5, 1.0, 2.0), (10.0, 30.0, 90.0)
SHOCKS = (0.5, 2.0)
CALIB = ((0.8, 30), (1.6, 30), (1.2, 15), (1.2, 60))
KEYS = ("s", "d0", "fee", "mint_scale", "repair_cost", "alloc", "shock", "sigma", "H", "seed")

def jobs(days):
    H, js = days // 2, []
    js += [("A", dict(s=s, d0=d0, seed=sd)) for s in S_A for d0 in D_A for sd in range(5)]
    js += [("B", dict(s=s, d0=0.10, fee=f, mint_scale=m, repair_cost=rc, seed=sd)) for s in (0.0, 0.33) for f in FEES for m in MINTS for rc in REPAIRS for sd in range(3)]
    js += [("C", dict(s=s, d0=d0, shock=x, shock_at=H, seed=sd)) for s in (0.0, 0.33) for d0 in (0.10, 0.20) for x in SHOCKS for sd in range(5)]
    js += [("D", dict(s=s, d0=d0, alloc=al, seed=sd)) for s in S_A for d0 in (0.10, 0.20) for al in ("index", "uniform") for sd in range(5)]
    js += [("E", dict(s=0.33, d0=0.10, sigma=sg, H=h, seed=sd)) for sg, h in CALIB for sd in range(3)]
    return [(i, days, g, kw) for i, (g, kw) in enumerate(js, 1)]

def fp(R, upto=None):
    return hashlib.sha1(np.stack([R[k][:upto] for k in COLS]).tobytes()).hexdigest()[:12]

def one(job):
    i, days, grid, kw = job; t0 = time.time(); p = P(days=days, **kw)
    R, x = run(p); H = days // 2
    rec = dict(idx=i, grid=grid, days=days) | {k: getattr(p, k) for k in KEYS} | summarize(p, R, x) | dict(fp=fp(R), fp_half=fp(R, H))
    ds = lambda v: v[:days // 10 * 10].reshape(-1, 10).mean(1)
    ser = None
    if grid in ("A", "C"):
        ser = {k: ds(R[k]) for k in ("supply", "runs", "minted", "burned", "short", "want", "m_sold", "m_bought", "listed", "minv", "ref1")}
    return rec, ser, time.time() - t0

def verdict(rs):
    ok = all(r["mint_ok"] >= VIABLE and abs(r["slope_yr"]) <= FLAT for r in rs)
    return "ROBUST" if ok and all(r["mint_ok"] >= ROBUST for r in rs) else "viable" if ok else "no"

def sweep(days, workers):
    js = jobs(days); n = len(js); H = days // 2; t0 = time.time(); log = open(OUT / "sweep2.log", "w")
    def say(x=""): print(x, flush=True); log.write(x + "\n"); log.flush()
    cnt = {g: sum(j[2] == g for j in js) for g in "ABCDE"}
    say(f"sweep2: {n} runs ({', '.join(f'{g} {v}' for g, v in cnt.items())}), {days} days each, {workers} workers; estimate ~{n * days / 1000 * SEC_PER_KDAY / workers / 60:.0f} min"
        f" | calibration: median delver {E_MED * 1e6:.1f} uETH/day = {E_MED * P.token_per_eth:.2f} token/day at {P.token_per_eth:,.0f} token/ETH, lognormal sigma {P.sigma}, wallet cap {P.H} days")
    R, SER, cpu = {}, {}, 0.0
    with mp.Pool(workers) as pool:
        for k, (r, ser, dt) in enumerate(pool.imap_unordered(one, js), 1):
            R[r["idx"]] = r; SER[r["idx"]] = ser; cpu += dt; el = time.time() - t0
            say(f"[{k:3d}/{n}] #{r['idx']:<3d} {r['grid']} s={r['s']:.2f} d0={r['d0']:.2f} fee={r['fee']:.2f} mint x{r['mint_scale']:.1f} rep {r['repair_cost']:2.0f} {r['alloc'][:3]}"
                f" shock x{r['shock']:.1f} sig {r['sigma']:.1f} H {r['H']:2d} seed={r['seed']} | {dt:5.1f}s t+{el:5.0f}s eta {el / k * (n - k):5.0f}s"
                f" | supply {r['supply']:6.0f} slope/yr {r['slope_yr']:+.3f} circ {r['circ_slope_yr']:+.3f} mint_ok {r['mint_ok']:.2f} priced-out {r['priced_out']:.1%}"
                f" runs/d {r['runs_d']:5.1f} burn/d {r['burn_d']:6.0f} merch vol/d {r['mvol_d']:5.2f} pnl/d {r['m_pnl_d']:+6.1f}")
    say(f"all {n} runs finished: {time.time() - t0:.0f} s wall, {cpu:.0f} s summed over runs; token ledger and item ledger asserted exact on every day of every run")
    R = [R[i] for i in sorted(R)]
    with open(OUT / "sweep2.csv", "w", newline="") as fh: w = csv.DictWriter(fh, R[0].keys()); w.writeheader(); w.writerows(R)
    report(R, SER, days, say)
    log.close()

def report(R, SER, days, say):
    H = days // 2; out = []
    g = lambda rs, **kw: [r for r in rs if all(r[k] == v for k, v in kw.items())]
    st = lambda rs, k: np.array([r[k] for r in rs], float)
    D = P(); base = dict(fee=D.fee, mint_scale=1.0, repair_cost=D.repair_cost, alloc="weighted", shock=1.0, sigma=D.sigma, H=D.H)
    A = [r for r in R if r["grid"] == "A"]
    def add(table, rs, keys, **cfg):
        for k in keys: v = st(rs, k); out.append(dict(table=table) | {c: cfg.get(c, "") for c in ("s", "d0", "fee", "mint_scale", "repair_cost", "alloc", "shock", "sigma", "H")}
                                                   | dict(metric=k, n=len(v), mean=v.mean(), std=v.std(), min=v.min(), max=v.max()))
    MK = ("supply", "net_d", "slope_yr", "circ_slope_yr", "mint_ok", "mint_ok_t1", "minted_d", "m1_d", "m2_d", "m3_d", "fresh_d", "destroyed_d", "recycled_d", "deaths_d",
          "runs_d", "t2t3_share", "priced_out", "excluded", "burn_d", "burn_mint_d", "burn_repair_d", "burn_fee_d", "bought_d", "p2p_d", "mvol_d", "m_pnl_d", "m_inv",
          "listed", "s23", "p1", "p2", "p3", "loot_gini", "loot_top10_income", "tok_delvers", "tok_top10", "m_pnl_tight", "m_pnl_wide", "m_vol_tight", "repaired_d", "broke_d")
    # (A) ------------------------------------------------------------------------------------------------------------------------------------------
    say(f"\n(A) equilibrium under binding budgets: s x d0, seeds 0-4, weighted lottery, v0's fee constants; last quarter (days {days * 3 // 4}-{days - 1}); mean over seeds [min, max]")
    say(f"    verdict: mint_ok (share of days with >= 1 mint) >= {VIABLE} (ROBUST >= {ROBUST}) and |total supply slope| <= {FLAT:.0%}/yr on every seed. v0 (SPEC §5): s=0 d0 .1/.2 ROBUST, s=.33 d0 .1/.2 viable (circulation only), rest no")
    say(f"{'s':>5} {'d0':>5} | {'supply':>6} {'slope/yr [min, max]':>23} {'net/d':>6} | {'mint_ok':>7} {'mint/d':>6} {'t1/t2/t3 mints':>15} {'t2t3 runs':>9} | {'runs/d':>6} {'priced-out':>10} {'excl':>5} | {'burn/d':>6} {'p1':>5} {'p2':>5} {'p3':>6} | {'mvol/d':>6} {'pnl/d':>6} {'tight/wide':>11} {'listed':>6} | verdict")
    for s in S_A:
        for d0 in D_A:
            rs = g(A, s=s, d0=d0); add("A", rs, MK, s=s, d0=d0, **base); v = {k: st(rs, k) for k in MK}
            say(f"{s:5.2f} {d0:5.2f} | {v['supply'].mean():6.0f} {v['slope_yr'].mean():+7.3f} [{v['slope_yr'].min():+.3f},{v['slope_yr'].max():+.3f}] {v['net_d'].mean():+6.2f} | {v['mint_ok'].mean():5.2f}"
                f" [{v['mint_ok'].min():.2f}] {v['minted_d'].mean():5.2f} {v['m1_d'].mean():5.2f}/{v['m2_d'].mean():4.2f}/{v['m3_d'].mean():4.2f} {v['t2t3_share'].mean():9.1%} | {v['runs_d'].mean():6.1f}"
                f" {v['priced_out'].mean():10.1%} {v['excluded'].mean():5.1%} | {v['burn_d'].mean():6.0f} {v['p1'].mean():5.0f} {v['p2'].mean():5.0f} {v['p3'].mean():6.0f} | {v['mvol_d'].mean():6.2f}"
                f" {v['m_pnl_d'].mean():+6.1f} {v['m_pnl_tight'].mean():+5.1f}/{v['m_pnl_wide'].mean():+5.1f} {v['listed'].mean():6.0f} | {verdict(rs)}")
    bl = g(A, s=0.33, d0=0.10); po = st(bl, "priced_out")
    say(f"budgets bind? baseline (s=.33, d0=.10) priced-out rate {po.mean():.1%} [{po.min():.1%}, {po.max():.1%}] of runner-days, {st(bl, 'excluded').mean():.1%} of delvers never ran in the last quarter"
        f" -> {'BINDS' if po.min() >= BINDS else 'CALIBRATION FAILED (< %.0f %%)' % (BINDS * 100)}; every A run: priced-out {st(A, 'priced_out').min():.1%}-{st(A, 'priced_out').max():.1%}")
    # (B) ------------------------------------------------------------------------------------------------------------------------------------------
    B = [r for r in R if r["grid"] == "B"]
    say(f"\n(B) fee constants: exchange fee x mint cost (token part, every tier) x repair cost; d0 0.10, seeds 0-2; last-quarter means over seeds")
    say(f"    viable cell: VIABLE on every seed AND merchants' P&L/day >= 0 on every seed AND runs/day >= {PART:.0%} of the most-played cell's (same s). Headline: the viable cell with the most burn")
    BK = ("runs_d", "priced_out", "excluded", "burn_d", "burn_mint_d", "burn_repair_d", "burn_fee_d", "minted_d", "mint_ok", "slope_yr", "mvol_d", "p2p_d", "m_pnl_d", "p1", "t2t3_share", "supply",
          "repaired_d", "broke_d", "m_pnl_tight", "m_pnl_wide", "m_vol_tight")
    region = {}
    for s in (0.0, 0.33):
        cells = {(f, m, rc): g(B, s=s, fee=f, mint_scale=m, repair_cost=rc) for f in FEES for m in MINTS for rc in REPAIRS}
        top = max(st(rs, "runs_d").mean() for rs in cells.values())
        say(f"\n  s = {s:g}: most-played cell {top:.1f} runs/day -> participation floor {PART * top:.1f}")
        say(f"  {'fee':>5} {'mint':>4} {'rep':>3} | {'runs/d':>6} {'priced-out':>10} {'excl':>5} | {'burn/d':>6} {'mint':>5} {'repair':>6} {'fee':>5} | {'mint/d':>6} {'mint_ok':>7} {'slope/yr':>8} | {'mvol/d':>6} {'p2p/d':>5} {'pnl/d':>6} {'p1':>5} {'t2t3':>5} | verdict")
        for (f, m, rc), rs in cells.items():
            add("B", rs, BK, s=s, d0=0.10, fee=f, mint_scale=m, repair_cost=rc, alloc="weighted", shock=1.0, sigma=D.sigma, H=D.H); v = {k: st(rs, k) for k in BK}
            vd = verdict(rs); ok = vd != "no" and v["m_pnl_d"].min() >= 0 and v["runs_d"].min() >= PART * top
            region[(s, f, m, rc)] = (ok, v["burn_d"].mean(), v["runs_d"].mean(), vd, v["m_pnl_d"].min(), v["priced_out"].mean())
            say(f"  {f:5.2f} {m:4.1f} {rc:3.0f} | {v['runs_d'].mean():6.1f} {v['priced_out'].mean():10.1%} {v['excluded'].mean():5.1%} | {v['burn_d'].mean():6.0f} {v['burn_mint_d'].mean():5.0f} {v['burn_repair_d'].mean():6.0f}"
                f" {v['burn_fee_d'].mean():5.0f} | {v['minted_d'].mean():6.2f} {v['mint_ok'].mean():7.2f} {v['slope_yr'].mean():+8.3f} | {v['mvol_d'].mean():6.2f} {v['p2p_d'].mean():5.2f} {v['m_pnl_d'].mean():+6.1f}"
                f" {v['p1'].mean():5.0f} {v['t2t3_share'].mean():5.1%} | {vd}{' REGION' if ok else ''}")
        vc = {k: v for k, v in region.items() if k[0] == s and v[0]}
        if vc:
            kb = max(vc, key=lambda k: vc[k][1]); ref = region[(s, D.fee, 1.0, D.repair_cost)]
            say(f"  s = {s:g}: {len(vc)}/{len(cells)} cells viable; max-burn viable cell fee {kb[1]:.2f} mint x{kb[2]:.1f} repair {kb[3]:.0f}: burn {vc[kb][1]:.0f}/day at {vc[kb][2]:.1f} runs/day,"
                f" priced-out {vc[kb][5]:.1%} (v0 constants: burn {ref[1]:.0f}/day, {ref[2]:.1f} runs/day, {'viable' if ref[0] else 'NOT viable'});"
                f" viable fees {sorted({k[1] for k in vc})}, mint scales {sorted({k[2] for k in vc})}, repairs {sorted({k[3] for k in vc})}")
        else: say(f"  s = {s:g}: NO viable cell")
    # (C) ------------------------------------------------------------------------------------------------------------------------------------------
    C = [r for r in R if r["grid"] == "C"]; pairs = []
    say(f"\n  merchants by margin (B, pooled over mint x repair, seeds 0-2): the 4 tightest vs the 4 widest merchants of each run, last-quarter change in equity at the public price less top-ups; the seed sets the merchant population (mean margin: "
        + ", ".join(f"seed {sd} {np.mean([r['m_margin'] for r in g(B, seed=sd)]):.3f}" for sd in range(3)) + ")")
    say(f"  {'s':>5} {'fee':>5} | {'pnl/d all':>9} {'tight 4':>8} {'wide 4':>8} | {'tight share of volume':>21} | pnl/d by seed")
    for s in (0.0, 0.33):
        for f in FEES:
            rs = g(B, s=s, fee=f)
            say(f"  {s:5.2f} {f:5.2f} | {(st(rs, 'm_pnl_tight') + st(rs, 'm_pnl_wide')).mean():+9.1f} {st(rs, 'm_pnl_tight').mean():+8.1f} {st(rs, 'm_pnl_wide').mean():+8.1f} | {st(rs, 'm_vol_tight').mean():21.1%} | "
                + " ".join(f"{(st(g(rs, seed=sd), 'm_pnl_tight') + st(g(rs, seed=sd), 'm_pnl_wide')).mean():+6.1f}" for sd in range(3)))
    say(f"\n(C) price coupling: token_per_eth x0.5 (token dearer: gear costs 2x in ETH) or x2 (token cheaper) on day {H}; paired with the A control of the same (s, d0, seed)")
    say(f"    gap = shocked - control, 100-day means, relative to control's post-shock mean; peak = largest |30-day gap| in the {min(2000, days - H)} days after; final = last quarter; settle = days after the shock until the 100-day gap stays within {SETTLE:.0%} of final."
        f" recovers iff |final runs gap| <= {RECOVER:.0%}; re-equilibrates iff the shocked run is still VIABLE (minting alive, supply flat)")
    say(f"{'s':>5} {'d0':>5} {'shock':>5} | {'pre-shock identical':>19} | {'runs peak':>9} {'final':>7} {'settle':>6} | {'mints peak':>10} {'final':>7} {'settle':>6} | {'burn peak':>9} {'final':>7} {'settle':>6}"
        f" | {'priced-out ctl -> shock (pp)':>28} | {'mint_ok ctl -> shock':>20} | verdict")
    for s in (0.0, 0.33):
        for d0 in (0.10, 0.20):
            for x in SHOCKS:
                ps = [(cc, sh) for sh in g(C, s=s, d0=d0, shock=x) for cc in g(A, s=s, d0=d0, seed=sh["seed"])]
                tr = [transient(SER[cc["idx"]], SER[sh["idx"]], H, days) for cc, sh in ps]; pairs += [(cc, sh, t_) for (cc, sh), t_ in zip(ps, tr)]
                same = sum(cc["fp_half"] == sh["fp_half"] for cc, sh in ps)
                tm = lambda k: np.array([t_[k] for t_ in tr])
                rows = [dict(same=float(cc["fp_half"] == sh["fp_half"]), **t_, po_ctl=cc["priced_out"], po_shock=sh["priced_out"], mo_ctl=cc["mint_ok"], mo_shock=sh["mint_ok"],
                             runs_lq=sh["runs_d"] / cc["runs_d"] - 1, burn_lq=sh["burn_d"] / cc["burn_d"] - 1, mint_lq=sh["minted_d"] / max(cc["minted_d"], 1e-9) - 1) for (cc, sh), t_ in zip(ps, tr)]
                add("C", rows, rows[0].keys(), s=s, d0=d0, shock=x, **{k: v for k, v in base.items() if k != "shock"})
                rec_ = all(abs(r_["runs_lq"]) <= RECOVER for r_ in rows); vc_, vs_ = verdict([cc for cc, _ in ps]), verdict([sh for _, sh in ps]); veq = vs_ != "no"
                say(f"{s:5.2f} {d0:5.2f} {x:5.1f} | {same:14d}/{len(ps)} | {tm('runs_peak').mean():+9.1%} {tm('runs_final').mean():+7.1%} {tm('runs_settle').mean():6.0f} | {tm('minted_peak').mean():+10.1%}"
                    f" {tm('minted_final').mean():+7.1%} {tm('minted_settle').mean():6.0f} | {tm('burned_peak').mean():+9.1%} {tm('burned_final').mean():+7.1%} {tm('burned_settle').mean():6.0f}"
                    f" | {100 * np.mean([cc['priced_out'] for cc, _ in ps]):12.1f} -> {100 * np.mean([sh['priced_out'] for _, sh in ps]):5.1f} ({100 * np.mean([sh['priced_out'] - cc['priced_out'] for cc, sh in ps]):+5.1f})"
                    f" | {np.mean([cc['mint_ok'] for cc, _ in ps]):8.2f} -> {np.mean([sh['mint_ok'] for _, sh in ps]):.2f} [{min(sh['mint_ok'] for _, sh in ps):.2f}]"
                    f" | {vc_} -> {vs_}: {'re-equilibrates' if veq else 'DOES NOT re-equilibrate'}, {'recovers' if rec_ else 'does not recover'} (last-quarter runs {np.mean([r_['runs_lq'] for r_ in rows]):+.1%}, mints {np.mean([sh['minted_d'] for _, sh in ps]):.2f}/d)")
    # (D) ------------------------------------------------------------------------------------------------------------------------------------------
    Dg = [r for r in R if r["grid"] == "D"]
    say(f"\n(D) recycled-loot allocation: index (v0) / uniform / weighted (SPEC §3.5, from A); d0 .10/.20, seeds 0-4; mean over seeds. s = 0 has an empty pool: a null control, must be bit-identical")
    say(f"    effect = alloc - weighted, paired by seed; 'changes' iff the sign agrees on all 5 seeds and |mean| >= 5 % of weighted's mean")
    DK = ("loot_gini", "loot_top10_income", "loot_top10_skill", "mint_ok", "minted_d", "mvol_d", "p2p_d", "slope_yr", "supply", "priced_out", "runs_d", "burn_d", "t2t3_share", "m_pnl_d")
    say(f"{'s':>5} {'d0':>5} {'alloc':>8} | {'identical':>9} | {'gini':>5} {'top10% inc':>10} {'top10% skill':>12} | {'mint_ok':>7} {'mint/d':>6} {'mvol/d':>6} {'p2p/d':>5} {'slope/yr':>8} {'supply':>6} {'priced-out':>10} {'runs/d':>6} {'burn/d':>6} | changes vs weighted")
    for s in S_A:
        for d0 in (0.10, 0.20):
            wt = g(A, s=s, d0=d0)
            for al in ("index", "uniform", "weighted"):
                rs = wt if al == "weighted" else g(Dg, s=s, d0=d0, alloc=al); v = {k: st(rs, k) for k in DK}
                add("D", rs, DK, s=s, d0=d0, alloc=al, **{k: v_ for k, v_ in base.items() if k != "alloc"})
                same = sum(a_["fp"] == b_["fp"] for a_ in rs for b_ in wt if a_["seed"] == b_["seed"])
                ch = []
                if al != "weighted":
                    for k in ("loot_gini", "mint_ok", "minted_d", "mvol_d", "slope_yr", "priced_out", "runs_d", "burn_d"):
                        dl = np.array([a_[k] - b_[k] for a_ in rs for b_ in wt if a_["seed"] == b_["seed"]]); ref_ = abs(st(wt, k).mean())
                        if (np.all(dl > 0) or np.all(dl < 0)) and abs(dl.mean()) >= 0.05 * max(ref_, 1e-9): ch.append(f"{k} {dl.mean():+.3g}")
                say(f"{s:5.2f} {d0:5.2f} {al:>8} | {same:5d}/{len(rs)} | {v['loot_gini'].mean():5.2f} {v['loot_top10_income'].mean():10.1%} {v['loot_top10_skill'].mean():12.1%} | {v['mint_ok'].mean():7.2f}"
                    f" {v['minted_d'].mean():6.2f} {v['mvol_d'].mean():6.2f} {v['p2p_d'].mean():5.2f} {v['slope_yr'].mean():+8.3f} {v['supply'].mean():6.0f} {v['priced_out'].mean():10.1%} {v['runs_d'].mean():6.1f}"
                    f" {v['burn_d'].mean():6.0f} | {'; '.join(ch) if al != 'weighted' else '-'}")
    # (E) ------------------------------------------------------------------------------------------------------------------------------------------
    E = [r for r in R if r["grid"] == "E"]
    say(f"\n(E) calibration sensitivity, s=.33 d0=.10, seeds 0-2 (median income fixed by the rule; spread and wallet cap moved)")
    say(f"{'sigma':>5} {'H':>3} | {'priced-out':>10} {'excl':>5} {'runs/d':>6} {'burn/d':>6} {'mint/d':>6} {'t2t3':>5} {'slope/yr':>8} {'mvol/d':>6} | verdict")
    for sg, h in ((D.sigma, D.H),) + CALIB:
        rs = g(A, s=0.33, d0=0.10) if (sg, h) == (D.sigma, D.H) else g(E, sigma=sg, H=h); v = {k: st(rs, k) for k in MK}
        add("E", rs, MK, s=0.33, d0=0.10, sigma=sg, H=h)
        say(f"{sg:5.1f} {h:3d} | {v['priced_out'].mean():10.1%} {v['excluded'].mean():5.1%} {v['runs_d'].mean():6.1f} {v['burn_d'].mean():6.0f} {v['minted_d'].mean():6.2f} {v['t2t3_share'].mean():5.1%}"
            f" {v['slope_yr'].mean():+8.3f} {v['mvol_d'].mean():6.2f} | {verdict(rs)}{'  (baseline, from A)' if (sg, h) == (D.sigma, D.H) else ''}")
    with open(OUT / "sweep2_summary.csv", "w", newline="") as fh: w = csv.DictWriter(fh, out[0].keys()); w.writeheader(); w.writerows(out)
    # checks ------------------------------------------------------------------------------------------------------------------------------------
    dup = [(b, a) for b in g(B, fee=D.fee, mint_scale=1.0, repair_cost=D.repair_cost) for a in A if (a["s"], a["d0"], a["seed"]) == (b["s"], b["d0"], b["seed"])]
    same = sum(all(repr(b[k]) == repr(a[k]) for k in b if k not in ("idx", "grid")) for b, a in dup)
    say(f"\nchecks: {same}/{len(dup)} configs run in both A and B (separate processes) agree on every field;"
        f" {sum(cc['fp_half'] == sh['fp_half'] for cc, sh, _ in pairs)}/{len(pairs)} shock/control pairs bit-identical before the shock;"
        f" token ledger (purchases - burns == change in balances) and item ledger held exactly on every day of all {len(R)} runs (asserted in run())")
    plot(R, SER, days, pairs)
    say(f"done: wrote {OUT / 'sweep2.csv'}, {OUT / 'sweep2_summary.csv'}, {OUT / 'sweep2.log'}, {OUT / 'sweep2_equilibrium.png'}, {OUT / 'sweep2_fees.png'}, {OUT / 'sweep2_shock.png'}")

def roll(x, w): return np.convolve(x, np.ones(w) / w, mode="valid")

def transient(c, s, H, days):
    """Shock minus control on 10-day bins, from the shock on."""
    h = H // 10; out = {}
    for k in ("runs", "minted", "burned"):
        a, b = c[k][h:], s[k][h:]; L = max(a.mean(), 1e-9)
        g30 = roll(b - a, 3) / L; g100 = roll(b - a, 10) / L; n2 = min(200, len(g30))
        fin = (b[-len(b) // 2:].mean() - a[-len(a) // 2:].mean()) / L          # last quarter of the run = second half of the post-shock period
        pk = g30[:n2][np.argmax(np.abs(g30[:n2]))]
        off = np.flatnonzero(np.abs(g100 - fin) > SETTLE)
        out |= {f"{k}_peak": float(pk), f"{k}_final": float(fin), f"{k}_settle": float((off[-1] + 10) * 10 if len(off) else 0)}
    return out

def plot(R, SER, days, pairs):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    ink, ink2, bg, c1, c2, c3 = "#0b0b0b", "#52514e", "#fcfcfb", "#2a78d6", "#eb6834", "#1baf7a"   # dataviz reference palette, slots 1-3 (all-pairs safe)
    seq = ("#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281")                             # sequential blue, ordinal steps 250-650
    plt.rcParams.update({"figure.facecolor": bg, "axes.facecolor": bg, "axes.edgecolor": "#c3c2b7", "axes.labelcolor": ink2, "xtick.color": ink2, "ytick.color": ink2, "text.color": ink,
                         "axes.grid": True, "grid.color": "#e1e0d9", "grid.linewidth": 0.6, "axes.spines.top": False, "axes.spines.right": False, "font.size": 9, "axes.titlesize": 9.5})
    x = np.arange(days // 10) * 10 + 5; A = [r for r in R if r["grid"] == "A"]
    # 1. equilibrium trajectories ------------------------------------------------------------------------------------------------------------
    fig, ax = plt.subplots(len(S_A), len(D_A), figsize=(13, 11.5), sharex=True)
    for i, s in enumerate(S_A):
        for j, d0 in enumerate(D_A):
            a = ax[i, j]; rs = [r for r in A if (r["s"], r["d0"]) == (s, d0)]
            for r in rs:
                S = SER[r["idx"]]; a.plot(x, S["supply"], c=c1, lw=1, label="items in existence" if r["seed"] == 0 else None)
                a.plot(x, S["listed"] + S["minv"], c=c2, lw=0.8, label="idle: listed by delvers + merchant inventory" if r["seed"] == 0 else None)
            f = lambda k: np.mean([r[k] for r in rs])
            a.set_title(f"s = {s:g}, d0 = {d0:g}: {verdict(rs)}\nmint_ok {min(r['mint_ok'] for r in rs):.2f}-{max(r['mint_ok'] for r in rs):.2f} · supply {f('slope_yr'):+.1%}/yr\n"
                        f"{f('runs_d'):.0f} runs/d · priced out {f('priced_out'):.0%} · burn {f('burn_d'):.0f}/d", loc="left")
            a.set_ylim(bottom=0); a.set_xlim(0, days)
            if j == 0: a.set_ylabel("items")
            if i == len(S_A) - 1: a.set_xlabel("day (10-day means)")
    fig.suptitle(f"(A) Item supply over {days:,} days under binding budgets, seeds 0-4 overlaid\nverdict: mint_ok >= {VIABLE} (ROBUST >= {ROBUST}) and |supply slope| <= {FLAT:.0%}/yr on every seed", y=0.995)
    fig.legend(*ax[0, 0].get_legend_handles_labels(), loc="upper center", bbox_to_anchor=(0.5, 0.955), ncol=2, frameon=False)
    fig.tight_layout(rect=(0, 0, 1, 0.935)); fig.savefig(OUT / "sweep2_equilibrium.png", dpi=110); plt.close(fig)
    # 2. the fee trade-off --------------------------------------------------------------------------------------------------------------------
    B = [r for r in R if r["grid"] == "B"]; D = P()
    fig, ax = plt.subplots(1, 2, figsize=(14, 5.6))
    for a, s in zip(ax, (0.0, 0.33)):
        cells = [(f, m, rc, [r for r in B if (r["s"], r["fee"], r["mint_scale"], r["repair_cost"]) == (s, f, m, rc)]) for f in FEES for m in MINTS for rc in REPAIRS]
        top = max(np.mean([r["runs_d"] for r in rs]) for *_, rs in cells)
        pts = []
        for f, m, rc, rs in cells:
            rn, bn = np.mean([r["runs_d"] for r in rs]), np.mean([r["burn_d"] for r in rs])
            ok = verdict(rs) != "no" and min(r["m_pnl_d"] for r in rs) >= 0 and min(r["runs_d"] for r in rs) >= PART * top
            col = seq[FEES.index(f)]; pts.append((rn, bn, ok, f, m, rc))
            a.scatter(rn, bn, s=46, marker="o", facecolors=col if ok else bg, edgecolors=col, linewidths=1.6, zorder=3)
        fr = sorted((p_ for p_ in pts), key=lambda p_: -p_[0]); front, best = [], -1
        for p_ in fr:
            if p_[1] > best: front.append(p_); best = p_[1]
        a.plot([p_[0] for p_ in front], [p_[1] for p_ in front], c=ink2, lw=0.8, ls="-", zorder=2, label="frontier: most burn at each participation" if s == 0.0 else None)
        a.axvline(PART * top, c=ink2, lw=0.8, ls="--"); a.text(PART * top, 0.02, f" participation floor:\n {PART:.0%} of the most-played cell", transform=a.get_xaxis_transform(), va="bottom", color=ink2, fontsize=8)
        for p_ in pts:
            if (p_[3], p_[4], p_[5]) == (D.fee, 1.0, D.repair_cost): a.annotate("v0 constants", (p_[0], p_[1]), xytext=(8, -12), textcoords="offset points", color=ink, fontsize=8)
        vok = [p_ for p_ in pts if p_[2]]
        if vok:
            kb = max(vok, key=lambda p_: p_[1]); a.annotate(f"max-burn viable: fee {kb[3]:.0%}, mint x{kb[4]:g}, repair {kb[5]:.0f}", (kb[0], kb[1]), xytext=(-10, 12), textcoords="offset points", ha="right", color=ink, fontsize=8)
        a.set_title(f"s = {s:g}, d0 = 0.10: {len(vok)}/{len(pts)} cells viable (filled)", loc="left"); a.set_xlabel("runs per day (participation)"); a.set_ylabel("token burned per day (the sink)")
    for k, f in enumerate(FEES): ax[1].scatter([], [], s=46, facecolors=seq[k], edgecolors=seq[k], label=f"exchange fee {f:.0%}")
    ax[1].scatter([], [], s=46, facecolors=bg, edgecolors=ink2, label="hollow: not viable")
    h_, l_ = ax[0].get_legend_handles_labels(); h2, l2 = ax[1].get_legend_handles_labels()
    fig.legend(h_ + h2, l_ + l2, loc="lower center", ncol=7, frameon=False, fontsize=8)
    fig.suptitle(f"(B) The fee trade-off: 45 cells (fee x mint cost x repair cost) per panel, 3 seeds each. Viable = stable + minting + merchants in profit + runs >= {PART:.0%} of the best cell", x=0.01, ha="left")
    fig.tight_layout(rect=(0, 0.06, 1, 1)); fig.savefig(OUT / "sweep2_fees.png", dpi=110); plt.close(fig)
    # 3. the price-shock transient ------------------------------------------------------------------------------------------------------------
    H = days // 2; h = H // 10; t = (np.arange(days // 10 - h) * 10 + 5)
    fig, ax = plt.subplots(1, 4, figsize=(16, 4.6))
    for sx, col, lab in ((0.5, c2, "token x2 dearer (token_per_eth x0.5)"), (2.0, c1, "token x2 cheaper (token_per_eth x2)")):
        ps = [(cc, sh) for cc, sh, _ in pairs if sh["shock"] == sx]
        for k_, (key, a) in enumerate(zip(("runs", "minted", "burned", "po"), ax)):
            gs = []
            for cc, sh in ps:
                C_, S_ = SER[cc["idx"]], SER[sh["idx"]]
                if key == "po": gap = 100 * (S_["short"][h:] / np.maximum(S_["want"][h:], 1) - C_["short"][h:] / np.maximum(C_["want"][h:], 1))
                else: gap = 100 * (S_[key][h:] - C_[key][h:]) / max(C_[key][h:].mean(), 1e-9)
                gs.append(roll(gap, 3)); a.plot(t[1:-1], gs[-1], c=col, lw=0.5, alpha=0.25)
            a.plot(t[1:-1], np.mean(gs, 0), c=col, lw=2, label=lab if k_ == 0 else None)
    for a, tt in zip(ax, ("(a) runs per day, % vs control", "(b) mints per day, % vs control", "(c) token burned per day, % vs control", "(d) priced-out rate, pp vs control")):
        a.axhline(0, c=ink2, lw=0.8); a.set_title(tt, loc="left"); a.set_xlabel(f"days after the shock (30-day means)"); a.set_xlim(0, days - H)
    ax[0].legend(frameon=False, loc="lower right", fontsize=8)
    fig.suptitle(f"(C) Price coupling: token_per_eth moves on day {H}; shocked minus control, paired by seed ({len(pairs)} pairs over s in (0, .33) x d0 in (.1, .2)); thin = one pair, bold = mean", x=0.01, ha="left")
    fig.tight_layout(); fig.savefig(OUT / "sweep2_shock.png", dpi=110); plt.close(fig)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sweep", action="store_true"); ap.add_argument("--single", action="store_true"); ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--days", type=int, default=None); ap.add_argument("--seed", type=int, default=0)
    for k in ("s", "d0", "fee", "mint_scale", "repair_cost", "shock", "sigma"): ap.add_argument(f"--{k.replace('_', '-')}", type=float, default=None)
    ap.add_argument("--shock-at", type=int, default=None); ap.add_argument("--alloc", default=None); ap.add_argument("--H", type=int, default=None)
    a = ap.parse_args(); OUT.mkdir(exist_ok=True)
    if a.sweep: return sweep(a.days or 10_000, a.workers)
    kw = {k: getattr(a, k) for k in ("s", "d0", "fee", "mint_scale", "repair_cost", "shock", "sigma", "shock_at", "alloc", "H") if getattr(a, k) is not None}
    p = P(days=a.days or 2000, seed=a.seed, **kw); t0 = time.time(); R, x = run(p); dt = time.time() - t0
    r = summarize(p, R, x)
    print(f"{p.days} days in {dt:.1f} s | " + " ".join(f"{k}={v:.4g}" if isinstance(v, float) else f"{k}={v}" for k, v in r.items()))

if __name__ == "__main__": main()
