"""Minimum viable population: does the v1 economy (sim/economy2.py) survive in a small world, and do its
flows scale linearly with the number of delvers?

SPEC §5's v1 results are for one world of N = 600 delvers and M = 8 merchants; v0 is one shard of ~20
players (SPEC §7), and any launch starts small. This file imports economy2's P, run, summarize, verdict and
fp unchanged - nothing of the model is copied - and moves only N and M.

Design. N in {25, 50, 100, 200, 400, 600, 1200} x seeds 0-4 x two cells, s = 0.33 with d0 0.10 and 0.20 (SPEC
§5: viable and ROBUST at N = 600), 10,000 days, every other constant at P's default (fee 2 %, mint x1, repair
30, weighted lottery, sigma 1.2, H 30, 50,000 token/ETH, no shock). Incomes do not depend on N (E_MED is fixed
at import by economy2's calibration rule), so a small world is the same distribution of budgets, fewer of
them. A seed draws every agent afresh, so worlds of different N are not paired by seed. Also run, at N = 600
only: s = 0 at d0 0.10 and 0.20, seeds 0-4. With the scan's two N = 600 cells these are SPEC §5's four
reference cells, whose daily flows are tabulated in token, ETH and USD, because sweep2_summary.csv lacks the
treasury's ETH inflow and the delver / merchant split of the token bought.

PRE-REGISTRATION - written 2026-10-02 before any run of this file. Nothing in it moves after a run; a badly
chosen threshold is reported, not retuned.
(a) Merchants. Primary rule M = max(1, round(8 N / 600)): N 25/50/100/200/400/600/1200 -> M 1/1/1/3/5/8/16,
    each merchant's targets (8/4/1 items), stake (4,000 token) and ETH budget (the mean delver's) unchanged.
    Rounding leaves the merchant side heavier than 1 per 75 delvers at N 25 (1 per 25) and 200 (1 per 67)
    and lighter at N 100 (1 per 100). Sensitivity: M = 8 at every N. At N = 600 the two rules are one
    configuration, run as two separate jobs: that pair is the run-twice reproducibility check.
(b) Pass rule, per (cell, merchant rule, N), over its five seeds:
    1.  economy2.verdict, unchanged: VIABLE iff on every seed mint_ok (share of last-quarter days with >= 1
        mint) >= 0.5 and |total supply slope| <= 1 %/yr; ROBUST iff also mint_ok >= 0.9 on every seed.
        Stated now: mint_ok counts days, so at a fixed mint rate per head it falls with N. N = 600, s = .33,
        d0 = .10 mints 2.84 a day (sweep2); at that rate per head a 25-delver world mints 0.12 a day and its
        mint_ok is at most ~0.11 however healthy it is. Applied as is.
    1w. Companion, same thresholds on the same exposure: mint_ok_w = share of last-quarter windows of
        w = max(1, round(600 / N)) days (24/12/6/3/2/1/1) with >= 1 mint, so that a window holds about as
        many delver-days as one day at N = 600; verdict_w = economy2.verdict with mint_ok_w in place of
        mint_ok, slope rule unchanged. A window cannot be shorter than a day, so N = 1200 is judged per day,
        the easier test.
    2.  Gear-up: a delver can gear up as in the reference world. Minting has no supply limit in the model
        (economy2 run(): anyone who can pay mints), so a tier-1 source exists on every day at every N by
        construction; what binds is budget against price, which economy2 records as priced_out (share of
        runner-days on which a runner without gear could afford no tier) and excluded (share of delvers who
        never ran in the last quarter). Pass iff, means over seeds, priced_out <= 0.4425 / 0.5008 and
        excluded <= 0.4127 / 0.4450 at d0 0.10 / 0.20: sweep2's N = 600 means (A; SPEC §5) plus 5 points.
    3.  Merchants, pooled P&L not negative: the mean over seeds of economy2's m_pnl_d (last-quarter slope of
        all merchants' equity at the public price less top-ups, token/day) >= 0. The mean, not every seed:
        sweep2 already has 2 of 5 seeds negative at N = 600 in both cells (per seed the sign follows the
        tightest margin drawn), so an every-seed rule would fail the reference itself. Seeds below zero
        are counted and shown.
    PASS = 1 and 2 and 3; PASS_w = 1w and 2 and 3. The smallest passing N is the smallest N of the scan from
    which every larger N passes too.
(c) Per-head flows, per delver per day: runs, token burned, delvers' spend in ETH (token the delvers bought /
    50,000 + mint ETH), ETH into the treasury. Flat at N iff |mean(N) / mean(600) - 1| <= 10 %, means over
    seeds, same cell and rule; shown with +/- 2 standard errors from the seed spread, to tell noise from
    bias. Linear scaling holds down to the smallest N from which every larger N is flat on all four.
    Merchants' own purchases (top-ups) are shown, not tested: under M = 8 they cannot scale with N.
(d) Predictions, not tests: mint_ok fails at the small N while mint_ok_w holds; the seed spread of priced_out
    and of per-head flows is wide at N 25-50 (25 lognormal incomes, sigma 1.2, are a noisy sample of the
    budget distribution); with one merchant the P&L sign follows its one drawn margin; the 1 %/yr slope rule
    may fail at N 25 on noise alone.
END OF PRE-REGISTRATION

Findings (scan, 2026-10-02; added after the run, below the pre-registration, which is unchanged - its SHA-1,
cf81bce75085, heads every log section). 150 runs x 10,000 days, 275 s wall on 4 workers; 10/10 N = 600 pairs
byte-identical, 20/20 N = 600 runs equal sweep2's fingerprints, --repro 5/5 rows byte-identical; both ledgers exact.
  Rule (b) as registered passes no N in any cell or merchant rule: N = 1200 fails rule 3 (pooled merchant P&L -5.9
  to -37.7 token/day, 3-5 of 5 seeds below zero), so "every larger N passes too" fails every N. That clause was
  badly chosen for a small-world question - its failure is at the large end. Reported, not retuned.
  N by N: d0 .10 passes at N 400 and 600 under both merchant rules (viable); d0 .20 from N 100 (one merchant;
  ROBUST from 200) or 200 (M = 8) to 600. Below that, what fails is economy2's count-based mint_ok, as predicted
  (0.08 / 0.32 at N 25), and the 1 %/yr slope rule on the worst seed (1.1-3.9 %/yr at N <= 200; seed means -0.5 to
  +0.7 %/yr, except M = 8, N 50, d0 .20: +1.2 %/yr, every seed positive). On exposure-matched windows minting
  stays alive at every N (mint_ok_w >= 0.51 on every seed at d0 .10 but one, 0.48 at N 50; >= 0.98 at d0 .20).
  Gear-up passes at every N. Merchants profit on average at every N <= 600, one merchant included (N 25-100,
  M = 1: +4.7 to +8.2 token/day, 0/30 seeds below zero).
  Delvers' per-head flows are flat (within 10 % of N = 600 on runs, burn, spend and treasury inflow) from N 50 up at
  d0 .10 and from N 25 up at d0 .20, under both merchant rules. At N 25, d0 .10, mints and treasury inflow per head
  are 28-30 % low (+/- 11 %), spend 11-15 % and burn 10-12 % low, while items per head are 17 % high with one
  merchant (150 % with eight) - inference: a merchant's fixed stock is a larger share of a small world's gear.
  Merchant P&L does not scale: the cheaper half of the merchants carries 82-100 % of merchant volume and all of the
  loss. With the tightest margin drawn >= 7.5 %, 0 of 44 runs lost at N <= 600 and 6 of 10 at N 1200; below 7.5 %,
  11 of 66 and 10 of 10 (margins re-drawn from economy2's population stream, a diagnostic) - inference: each
  merchant's targets and stake are fixed while the cheapest one's flow grows with N. Merchant results do not scale
  linearly; delvers' flows do, down to the N above.

Reproducibility. Seeds are fixed. Every run's full trajectory (every column of economy2's daily record, every
day) is hashed with SHA-1. The N = 600 pairs of (a) must be byte-identical; the N = 600 runs must match
sweep2.csv's fingerprints for the same configurations (run 2026-09-27) when that file is found (--sweep2);
--repro re-runs one cell (N = 25, s = .33, d0 = .10, scaled rule) in fresh processes and compares each
run's CSV row, byte for byte, with population.csv. The SHA-1 of the pre-registration text above is written
at the head of every log section, so an edit to it shows.

Outputs: one line per finished run appended to sim/out/population.log (tail -f it), sim/out/population.csv
(one row per run, no timings, so a rerun is byte-identical), then the summary tables, printed and appended
to the log. At most 4 worker processes: the machine is shared.

  .venv/bin/python sim/population.py               # 150 runs x 10,000 days, ~10 min on 4 workers
  .venv/bin/python sim/population.py --repro       # re-run one cell, compare with population.csv
"""
import argparse, csv, hashlib, io, math, sys, time
import multiprocessing as mp
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from economy2 import COLS, FLAT, OUT, P, U, VIABLE, fp, run, summarize, verdict   # the v1 model, imported unchanged

NS, SEEDS, DAYS, WORKERS = (25, 50, 100, 200, 400, 600, 1200), tuple(range(5)), 10_000, 4
CELLS = ((0.33, 0.10), (0.33, 0.20))              # the scan: SPEC §5's s = 1/3 cells (economy2 runs s = 0.33)
FLOW_CELLS = ((0.0, 0.10), (0.0, 0.20))           # N = 600 only: the other two reference cells, for the flows table
N_REF, M_REF = 600, 8
RULES = {"scaled": lambda N: max(1, round(M_REF * N / N_REF)), "fixed8": lambda N: M_REF}   # (a)
window = lambda N: max(1, round(N_REF / N))       # (b) 1w: days per mint window, ~600 delver-days each
PO_REF = {0.10: 0.3925, 0.20: 0.4508}             # (b) 2: sweep2 (A), N = 600, s = .33, mean priced_out ...
EX_REF = {0.10: 0.3627, 0.20: 0.3950}             # ... and mean excluded
GEAR_TOL, HEAD_TOL = 0.05, 0.10                   # (b) 2 and (c)
USD_PER_ETH = 2682.0                              # a reporting conversion only (CoinGecko, 2026-10-02); never a model input
HEAD = (("runs", "runs_d"), ("burn", "burn_d"), ("spend", "spend_delv_eth_d"), ("treasury", "treasury_eth_d"))   # (c), tested
INFO = (("mints", "minted_d"), ("deaths", "deaths_d"), ("supply", "supply"), ("m top-up", "topup_d"))          # per head, shown only
REPRO = dict(grid="pop", rule="scaled", s=0.33, d0=0.10, N=25)

def prereg_sha():
    d = __doc__; return hashlib.sha1(d[d.index("PRE-REGISTRATION -"):d.index("END OF PRE-REGISTRATION")].encode()).hexdigest()[:12]

def jobs(days):
    js = [("pop", rule, s, d0, N, mf(N), sd) for s, d0 in CELLS for rule, mf in RULES.items() for N in NS for sd in SEEDS]
    js += [("flows", "ref", s, d0, N_REF, M_REF, sd) for s, d0 in FLOW_CELLS for sd in SEEDS]
    return [(i, days) + j for i, j in enumerate(js, 1)]

def one(j):
    idx, days, grid, rule, s, d0, N, M, seed = j
    t0 = time.time(); p = P(days=days, N=N, M=M, s=s, d0=d0, seed=seed)
    R, x = run(p); r = summarize(p, R, x)                                    # run() asserts the token and item ledgers every day
    a = days * 3 // 4; n = days - a; w = window(N); k = n // w; tpe = p.token_per_eth
    treas = float(R["treasury"][-1] - R["treasury"][a - 1]) / n               # ETH into the treasury a day, last quarter
    assert math.isclose(treas, sum(p.mint_eth[t] * r[f"m{t}_d"] for t in (1, 2, 3)), rel_tol=1e-9, abs_tol=1e-12), "treasury != mint ETH"
    topup = float(R["m_topup"][-1] - R["m_topup"][a - 1]) / n / U             # token the merchants bought a day
    rec = dict(idx=idx, grid=grid, rule=rule, s=s, d0=d0, N=N, M=M, seed=seed, days=days, w=w) | r | dict(
        mint_ok_w=float((R["minted"][a:a + k * w].reshape(k, w).sum(1) > 0).mean()),
        treasury_eth_d=treas, topup_d=topup, bought_delv_d=r["bought_d"] - topup,
        spend_eth_d=r["bought_d"] / tpe + treas, spend_delv_eth_d=(r["bought_d"] - topup) / tpe + treas,
        m_pnl_end=x["m_pnl_tight"] + x["m_pnl_wide"],
        sha1=hashlib.sha1(np.stack([R[c] for c in COLS]).tobytes()).hexdigest(), fp=fp(R))
    return rec, time.time() - t0

def logline(k, n, r, dt, el, eta):
    return (f"[{k:3d}/{n}] #{r['idx']:<3d} {r['grid']:5} {r['rule']:6} s={r['s']:.2f} d0={r['d0']:.2f} N={r['N']:<4d} M={r['M']:<2d} seed={r['seed']}"
            f" | {dt:5.1f}s t+{el:5.0f}s eta {eta:5.0f}s | runs/d {r['runs_d']:6.1f} priced-out {r['priced_out']:5.1%} excl {r['excluded']:5.1%}"
            f" mint_ok {r['mint_ok']:.2f} w{r['w']} {r['mint_ok_w']:.2f} slope/yr {r['slope_yr']:+.3f} | burn/d {r['burn_d']:6.0f}"
            f" spend {r['spend_eth_d']:.4f} ETH/d treasury {r['treasury_eth_d']:.5f} ETH/d | merch pnl/d {r['m_pnl_d']:+6.1f} | {r['sha1'][:12]}")

def opener(mode):
    log = open(OUT / "population.log", "a")
    def say(x=""): print(x, flush=True); log.write(x + "\n"); log.flush()
    say(f"\n=== {datetime.now(timezone.utc).isoformat(timespec='seconds')} population.py {mode} | pre-registration sha1 {prereg_sha()} ===")
    return log, say

def scan(days, workers, sweep2):
    js = jobs(days); n = len(js); cost = {j[0]: 40 + j[6] * (1 + j[7] / 16) for j in js}; tot = sum(cost.values())
    log, say = opener(f"scan: {n} runs ({len(NS)} N x {len(SEEDS)} seeds x {len(CELLS)} cells x {len(RULES)} merchant rules + {len(FLOW_CELLS) * len(SEEDS)} flows runs),"
                      f" {days} days each, {workers} workers")
    t0, R, done, busy = time.time(), {}, 0.0, 0.0
    with mp.Pool(workers) as pool:
        for k, (r, dt) in enumerate(pool.imap_unordered(one, sorted(js, key=lambda j: -cost[j[0]])), 1):   # big worlds first: a short tail
            R[r["idx"]] = r; done += cost[r["idx"]]; busy += dt; el = time.time() - t0
            say(logline(k, n, r, dt, el, el / done * (tot - done)))
    wall = time.time() - t0
    say(f"all {n} runs finished: {wall:.0f} s wall, {busy:.0f} s of run time summed over runs; token and item ledgers asserted exact every day of every run (economy2.run)")
    rows = [R[i] for i in sorted(R)]
    with open(OUT / "population.csv", "w", newline="") as fh: w = csv.DictWriter(fh, rows[0].keys()); w.writeheader(); w.writerows(rows)
    report(rows, say, sweep2)
    say(f"done: {wall:.0f} s wall; wrote {OUT / 'population.csv'}, {OUT / 'population.log'}")
    log.close()

def smallest(ok):                                  # smallest N of the scan from which every larger N is ok
    best = None
    for N in sorted(ok, reverse=True):
        if not ok[N]: break
        best = N
    return best

def report(R, say, sweep2):
    g = lambda rs, **kw: [r for r in rs if all(r[k] == v for k, v in kw.items())]
    st = lambda rs, k: np.array([r[k] for r in rs], float)
    mn = lambda rs, k: float(st(rs, k).mean())
    pop, tpe = [r for r in R if r["grid"] == "pop"], P.token_per_eth
    # (1) flows -----------------------------------------------------------------------------------------------------------------------------
    FC = [(s, d0, g(R, grid="flows", s=s, d0=d0)) for s, d0 in FLOW_CELLS] + [(s, d0, g(pop, rule="scaled", s=s, d0=d0, N=N_REF)) for s, d0 in CELLS]
    say(f"\n(1) Daily flows of the four reference cells: N = {N_REF} delvers, M = {M_REF} merchants, default constants (fee 2 %, mint x1, repair 30); last quarter,"
        f" mean over seeds 0-4. 1 token = 1/{tpe:,.0f} ETH; USD at ${USD_PER_ETH:,.0f}/ETH (CoinGecko, 2026-10-02; a reporting conversion, not a model input)")
    say(f"{'':46}" + "".join(f"{f's = {s:g}, d0 = {d0:.2f}':>26}" for s, d0, _ in FC))
    E = lambda eth: f"{eth:.5f} ETH ${eth * USD_PER_ETH:,.2f}"
    e = lambda eth: f"{eth * 1e6:.1f} uETH ${eth * USD_PER_ETH:.3f}"
    per = lambda rs, a, b: float((st(rs, a) / st(rs, b)).mean())
    for lab, f in (("runs a day", lambda rs: f"{mn(rs, 'runs_d'):.1f}"),
                   ("priced-out share of runner-days", lambda rs: f"{mn(rs, 'priced_out'):.1%}"),
                   ("delvers who never ran (last quarter)", lambda rs: f"{mn(rs, 'excluded'):.1%}"),
                   ("mints a day, tier 1 / 2 / 3", lambda rs: f"{mn(rs, 'm1_d'):.2f} / {mn(rs, 'm2_d'):.2f} / {mn(rs, 'm3_d'):.4f}"),
                   ("token burned a day: by minting", lambda rs: f"{mn(rs, 'burn_mint_d'):.0f}"),
                   ("                    by repair", lambda rs: f"{mn(rs, 'burn_repair_d'):.0f}"),
                   ("                    by exchange fee", lambda rs: f"{mn(rs, 'burn_fee_d'):.0f}"),
                   ("                    total", lambda rs: f"{mn(rs, 'burn_d'):.0f}"),
                   ("token bought a day: by delvers", lambda rs: f"{mn(rs, 'bought_delv_d'):.0f}"),
                   ("                    by merchants (top-ups)", lambda rs: f"{mn(rs, 'topup_d'):.0f}"),
                   ("                    total", lambda rs: f"{mn(rs, 'bought_d'):.0f}"),
                   ("token kept (bought - burned) a day", lambda rs: f"{mn(rs, 'bought_d') - mn(rs, 'burn_d'):+.0f}"),
                   ("ETH into the treasury a day (mint ETH)", lambda rs: f"{mn(rs, 'treasury_eth_d'):.5f}"),
                   ("merchant volume, items a day", lambda rs: f"{mn(rs, 'mvol_d'):.2f}"),
                   ("merchant P&L, token a day [seeds < 0]", lambda rs: f"{mn(rs, 'm_pnl_d'):+.1f} [{int((st(rs, 'm_pnl_d') < 0).sum())}/{len(rs)}]"),
                   ("-- in ETH and USD a day --", lambda rs: ""),
                   ("token burned", lambda rs: E(mn(rs, "burn_d") / tpe)),
                   ("token bought, delvers + merchants", lambda rs: E(mn(rs, "bought_d") / tpe)),
                   ("mint ETH into the treasury", lambda rs: E(mn(rs, "treasury_eth_d"))),
                   ("gross player spend (bought + mint ETH)", lambda rs: E(mn(rs, "spend_eth_d"))),
                   ("  per delver (/ N)", lambda rs: e(mn(rs, "spend_eth_d") / N_REF)),
                   ("  per run", lambda rs: e(per(rs, "spend_eth_d", "runs_d"))),
                   ("delvers' spend (no merchant top-ups)", lambda rs: E(mn(rs, "spend_delv_eth_d"))),
                   ("  per delver (/ N)", lambda rs: e(mn(rs, "spend_delv_eth_d") / N_REF)),
                   ("  per run", lambda rs: e(per(rs, "spend_delv_eth_d", "runs_d"))),
                   ("merchant P&L", lambda rs: E(mn(rs, "m_pnl_d") / tpe)),
                   ("treasury, a year", lambda rs: E(mn(rs, "treasury_eth_d") * 365))):
        say(f"{lab:46}" + "".join(f"{f(rs):>26}" for _, _, rs in FC))
    # (2) the population scan ---------------------------------------------------------------------------------------------------------------
    def judge(rs, d0):
        sl = all(abs(r["slope_yr"]) <= FLAT for r in rs); po, ex, pnl = mn(rs, "priced_out"), mn(rs, "excluded"), mn(rs, "m_pnl_d")
        f1 = ([] if all(r["mint_ok"] >= VIABLE for r in rs) else ["mint_ok"]) + ([] if sl else ["slope"])
        f1w = ([] if all(r["mint_ok_w"] >= VIABLE for r in rs) else ["mint_ok_w"]) + ([] if sl else ["slope"])
        f2 = ([] if po <= PO_REF[d0] + GEAR_TOL else ["priced_out"]) + ([] if ex <= EX_REF[d0] + GEAR_TOL else ["excluded"])
        f3 = [] if pnl >= 0 else ["merchants"]
        return dict(v=verdict(rs), vw=verdict([dict(mint_ok=r["mint_ok_w"], slope_yr=r["slope_yr"]) for r in rs]), gear=not f2,
                    ok=not (f1 or f2 or f3), ok_w=not (f1w or f2 or f3), fails=",".join(f1 + f2 + f3) or "PASS", fails_w=",".join(f1w + f2 + f3) or "PASS")
    def rel(rs, ref, k):                           # per-head mean(N) / mean(600) - 1, and 2 standard errors from the seed spread
        a, b = st(rs, k) / rs[0]["N"], st(ref, k) / ref[0]["N"]; ma, mb = a.mean(), b.mean()
        if mb == 0: return float("nan"), float("nan")
        se = math.sqrt((a.std(ddof=1) / math.sqrt(len(a)) / mb) ** 2 + (ma * b.std(ddof=1) / math.sqrt(len(b)) / mb ** 2) ** 2)
        return ma / mb - 1, 2 * se
    say(f"\n(2) Population scan: N delvers x seeds 0-4, s = 0.33, 10,000 days, last quarter; mean over seeds [worst seed]. Pass rules pre-registered in the docstring:"
        f" verdict = economy2.verdict (mint_ok >= {VIABLE}, ROBUST >= 0.9, |slope| <= {FLAT:.0%}/yr, every seed); verdict_w = the same on mint windows of w days;"
        f" gear = mean priced-out and excluded <= the N = 600 sweep2 means + {GEAR_TOL * 100:.0f} pts; merchants = mean pooled P&L >= 0. Per delver a day: runs,"
        f" token burned, delvers' spend and treasury inflow in uETH; p1 = tier-1 trade price, token (mint-equivalent 220)")
    V = {}
    for s, d0 in CELLS:
        for rule in RULES:
            say(f"\n  s = {s:g}, d0 = {d0:.2f}, merchants {'M = max(1, round(8 N / 600))' if rule == 'scaled' else 'M = 8 at every N'}"
                f" | gear limits: priced-out <= {PO_REF[d0] + GEAR_TOL:.1%}, excluded <= {EX_REF[d0] + GEAR_TOL:.1%}")
            say(f"  {'N':>5} {'M':>3} {'w':>3} | {'runs/d':>7} {'priced-out':>15} {'excl':>6} | {'mint_ok':>12} {'mint_ok_w':>12} {'slope/yr [min, max]':>21} | {'verdict':>7} {'verd_w':>7}"
                f" {'gear':>4} {'m_pnl/d [<0]':>13} | {'runs':>5} {'burn':>5} {'spend':>6} {'treas':>6} {'p1':>4} | {'PASS? (fails)':<26} {'PASS_w? (fails)':<26}")
            for N in NS:
                rs = g(pop, rule=rule, s=s, d0=d0, N=N); j = judge(rs, d0); V[(s, d0, rule, N)] = j; v = {k: st(rs, k) for k in rs[0] if isinstance(rs[0][k], float)}
                say(f"  {N:5d} {rs[0]['M']:3d} {rs[0]['w']:3d} | {v['runs_d'].mean():7.1f} {v['priced_out'].mean():6.1%} [{v['priced_out'].max():5.1%}] {v['excluded'].mean():6.1%}"
                    f" | {v['mint_ok'].mean():5.2f} [{v['mint_ok'].min():.2f}] {v['mint_ok_w'].mean():5.2f} [{v['mint_ok_w'].min():.2f}] {v['slope_yr'].mean():+7.3f} [{v['slope_yr'].min():+.3f},{v['slope_yr'].max():+.3f}]"
                    f" | {j['v']:>7} {j['vw']:>7} {'ok' if j['gear'] else 'FAIL':>4} {v['m_pnl_d'].mean():+8.1f} [{int((v['m_pnl_d'] < 0).sum())}/5]"
                    f" | {v['runs_d'].mean() / N:5.3f} {v['burn_d'].mean() / N:5.2f} {v['spend_delv_eth_d'].mean() / N * 1e6:6.1f} {v['treasury_eth_d'].mean() / N * 1e6:6.2f} {np.nanmean(v['p1']):4.0f}"
                    f" | {j['fails']:<26} {j['fails_w']:<26}")
    # (3) per-head flatness -----------------------------------------------------------------------------------------------------------------
    say(f"\n(3) Per-head flows against N = 600, same cell and rule: mean(N) / mean(600) - 1, +/- 2 standard errors from the seed spread. Tested (flat iff within +/-{HEAD_TOL:.0%}):"
        f" runs, token burned, delvers' spend (ETH), treasury inflow (ETH), per delver a day. Shown only: mints, deaths, items in existence, merchants' token bought, per delver")
    LIN = {}
    for s, d0 in CELLS:
        for rule in RULES:
            ref = g(pop, rule=rule, s=s, d0=d0, N=N_REF); flat = {}
            say(f"\n  s = {s:g}, d0 = {d0:.2f}, merchants {rule}")
            say(f"  {'N':>5} | " + " ".join(f"{lab:>15}" for lab, _ in HEAD) + " | flat | " + " ".join(f"{lab:>15}" for lab, _ in INFO))
            for N in NS:
                rs = g(pop, rule=rule, s=s, d0=d0, N=N); dv = [rel(rs, ref, k) for _, k in HEAD]; flat[N] = all(abs(x) <= HEAD_TOL for x, _ in dv)
                say(f"  {N:5d} | " + " ".join(f"{x:+7.1%} +/-{se:5.1%}" for x, se in dv) + f" | {'yes' if flat[N] else 'NO':>4} | "
                    + " ".join(f"{x:+7.1%} +/-{se:5.1%}" for x, se in (rel(rs, ref, k) for _, k in INFO)))
            LIN[(s, d0, rule)] = smallest(flat)
    # (4) verdicts --------------------------------------------------------------------------------------------------------------------------
    say(f"\n(4) Smallest N of the scan from which every larger N passes (pre-registered rule (b)); linear scaling of per-head flows (rule (c))")
    for s, d0 in CELLS:
        for rule in RULES:
            a, b = smallest({N: V[(s, d0, rule, N)]["ok"] for N in NS}), smallest({N: V[(s, d0, rule, N)]["ok_w"] for N in NS})
            def why(m, key):                       # what fails at the next N down (or at the largest N if none passes)
                lower = [N for N in NS if m is None or N < m]
                return f"N = {lower[-1]} fails {V[(s, d0, rule, lower[-1])][key]}" if lower else "every N of the scan passes"
            say(f"  s = {s:g}, d0 = {d0:.2f}, {rule:6}: PASS from N = {a if a is not None else 'none'} ({why(a, 'fails')})"
                f"; PASS_w from N = {b if b is not None else 'none'} ({why(b, 'fails_w')}); per-head flows flat down to N = {LIN[(s, d0, rule)] if LIN[(s, d0, rule)] is not None else 'none'}")
    # checks --------------------------------------------------------------------------------------------------------------------------------
    pairs = [(a, b) for a in g(pop, rule="scaled", N=N_REF) for b in g(pop, rule="fixed8", N=N_REF) if (a["s"], a["d0"], a["seed"]) == (b["s"], b["d0"], b["seed"])]
    same = sum(all(repr(a[k]) == repr(b[k]) for k in a if k not in ("idx", "rule")) for a, b in pairs)
    say(f"\nchecks: {same}/{len(pairs)} N = 600 configurations run twice (scaled and fixed8 jobs) are byte-identical: full-trajectory SHA-1 and every summary field;"
        f" treasury inflow = sum of mints x mint ETH on every run (asserted)")
    sp = Path(sweep2)
    if sp.exists():
        S2 = {(float(r["s"]), float(r["d0"]), int(r["seed"])): r["fp"] for r in csv.DictReader(open(sp)) if r["grid"] == "A"}
        ref = [r for r in R if r["N"] == N_REF and r["rule"] in ("scaled", "ref")]
        say(f"        {sum(S2.get((r['s'], r['d0'], r['seed'])) == r['fp'] for r in ref)}/{len(ref)} N = 600 runs match the fingerprint sweep2 recorded for the same configuration ({sp})")
    else: say(f"        sweep2.csv not found at {sp}: cross-check against sweep2 skipped")

def repro(days, workers):
    path = OUT / "population.csv"
    with open(path, newline="") as fh: lines = fh.read().split("\r\n")
    header = next(csv.reader([lines[0]])); old = {int(next(csv.reader([ln]))[0]): ln for ln in lines[1:] if ln}
    js = [j for j in jobs(days) if (j[2], j[3], j[4], j[5], j[6]) == tuple(REPRO.values())]
    log, say = opener(f"--repro: re-run {len(js)} runs of one cell ({', '.join(f'{k} {v}' for k, v in REPRO.items())}), {days} days, in fresh processes; compare with {path}")
    t0 = time.time()
    with mp.Pool(min(workers, len(js))) as pool: out = pool.map(one, js)
    same = 0
    for rec, dt in out:
        buf = io.StringIO(); csv.DictWriter(buf, header).writerow(rec); new = buf.getvalue().rstrip("\r\n"); ok = new == old.get(rec["idx"]); same += ok
        say(f"  #{rec['idx']:<3d} seed={rec['seed']} {dt:5.1f}s | sha1 {rec['sha1'][:12]} | CSV row {'byte-identical' if ok else 'DIFFERENT'} ({len(new)} bytes)")
    say(f"--repro: {same}/{len(out)} rows byte-identical to {path}; {time.time() - t0:.0f} s wall")
    log.close()

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--workers", type=int, default=WORKERS); ap.add_argument("--days", type=int, default=DAYS)
    ap.add_argument("--repro", action="store_true"); ap.add_argument("--sweep2", default=str(OUT / "sweep2.csv"))
    a = ap.parse_args(); OUT.mkdir(exist_ok=True)
    return repro(a.days, a.workers) if a.repro else scan(a.days, a.workers, a.sweep2)

if __name__ == "__main__": main()
