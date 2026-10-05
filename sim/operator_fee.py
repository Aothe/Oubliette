"""Operator fee: what an ETH fee on repair, paid to the operator, earns and costs in the v1 economy
(sim/economy2.py), and whether sending a share of the mint ETH to the operator changes anything but where
that ETH lands.

docs/capital.md (2026-10-03) rests most of the operator's income on its line (i), an ETH fee on repair,
measured by a first look whose script was lost: three seeds, one cell, no stress of the budget slack. This
file redoes it. It reads economy2.py from its own folder, applies the patch below in memory - every anchor
asserted to occur exactly once, so a change to the model fails loudly instead of patching the wrong line -
and exec's the result as a module. economy2.py is not edited. With repair_eth = 0 and mint_op_share = 0 the
patched model is economy2: every control run is compared with an unpatched economy2 run of the same
configuration by economy2's own fingerprint (fp) and every summary field.

The patch (lines tagged "[operator_fee]" in the patched source):
  P         gains repair_eth (ETH paid to the operator per repair, default 0) and mint_op_share (share of each
            mint's ETH sent to the operator instead of the treasury, default 0).
  repair    still burns repair_cost token, and now also pays repair_eth out of the delver's ETH wallet to the
            operator. The delver repairs iff the repair token plus the repair ETH at the day's price (its
            token-equivalent, rounded to a unit) is no more than replacing the item (the cheapest of the market
            and minting, as before), and its wallet covers the ETH with enough left to buy any token shortfall;
            else the item breaks, as before.
  mint      the delver pays mint_eth as before; mint_eth x (1 - mint_op_share) goes to the treasury, the rest
            to the operator.
  ledger    beside economy2's exact token and item ledgers, asserted every day: the fall in the delvers' ETH
            wallets over the day (after income) equals the ETH they spent buying token plus the treasury's
            inflow plus the operator's inflow, to 1e-9 ETH (float sums; the smallest payment is 6e-4 ETH); no
            wallet rises within a day.
  outputs   operator ETH by source, daily and per delver; the ETH each delver spent; income lost to the wallet
            cap; repairs economy2 would have made that the fee turned into breakages (too dear against
            replacing, or unaffordable).

PRE-REGISTRATION - written 2026-10-03 before any run of this file. Nothing in it moves after a run; a badly
chosen threshold is reported, not retuned.
(a) Incomes. E_MED stays at economy2's calibration, computed by economy2's own rule from P's defaults (asserted
    equal to the unpatched module's): ETH incomes are a property of the players and are held fixed across every
    experiment, as in the v1 sweep (B, E). Putting the fee into the calibration rule would hand the median
    delver exactly the ETH the fee takes and make it free by construction; a fee is a price, and the question
    is what players do when a price rises. In Grid B sigma and H move: the median income stays E_MED, the mean
    falls with sigma (1.38 x the median at 0.8, 2.05 x at 1.2), H caps the wallet and is also economy2's
    survival-value horizon; merchants keep the reference mean delver's budget (economy2 uses P's class default
    sigma for them).
(b) Grids, 10,000 days, seeds 0-4, every other constant at P's default (exchange fee 2 %, mint x1, repair 30
    token, weighted lottery, 50,000 token/ETH, no shock). At 50,000 token/ETH, repair_eth 0.0006 / 0.0012 /
    0.0024 / 0.0048 ETH is 30 / 60 / 120 / 240 token-equivalent on top of the 30 token burned.
    A    repair_eth in {0, 0.0006, 0.0012, 0.0024, 0.0048} x mint_op_share in {0, 0.5} x (s, d0) in {0, 0.33} x
         {0.10, 0.20}: 200 runs.
    B    stress the slack, s = 0.33, d0 = 0.10: wallet cap H in {15, 30, 60} x income spread sigma in {0.8, 1.2}
         x repair_eth in {0, 0.0012, 0.0024}, mint_op_share 0: 90 runs. H 30, sigma 1.2 repeats 15 Grid A
         configurations as separate jobs: the run-twice check.
    ref  unpatched economy2.run at every control configuration (repair_eth 0, mint_op_share 0) of A and B: 20 + 25
         = 45 runs.
(c) Pass rule, per fee cell (any repair_eth > 0 or mint_op_share > 0), against its own control: the same s, d0,
    H, sigma and seeds 0-4 with repair_eth 0 and mint_op_share 0.
    1. economy2.verdict over the five seeds unchanged (VIABLE: mint_ok >= 0.5 and |total supply slope| <= 1 %/yr
       on every seed; ROBUST: also mint_ok >= 0.9 on every seed; else no);
    2. runs a day, mean over seeds, >= 95 % of the control's mean;
    3. merchants' pooled P&L (economy2's m_pnl_d, token a day), mean over seeds, >= the control's mean minus the
       control's sample standard deviation over its five seeds (ddof 1).
    PASS = 1 and 2 and 3. Descriptive, not a pass rule: a fee cell is "nearly free" iff its runs a day are within
    2 % of the control's and its priced-out share is up by at most 2 points (means over seeds).
(d) Recommendation rule. Of the two fees Grid B stresses (0.0012 and 0.0024 ETH), recommend the one with more
    operator ETH a day at the reference cell (s 0.33, d0 0.10, mint_op_share 0) among those that PASS in all four
    Grid A cells (mint_op_share 0 and 0.5) and all six Grid B cells; if neither does, recommend neither and say
    what fails. If the recommended fee is not nearly free at the reference cell, say so.
(e) Outputs per run, last quarter (days 7,500-9,999), means a day: operator ETH (repair, mint share, total), runs,
    priced-out share of runner-days, share of delvers who never ran, repairs, items scrapped, repairs the fee
    turned into breakages, mints, burn by mint / repair / exchange fee, treasury ETH, merchants' pooled P&L,
    mint_ok, supply slope; the share of all delver ETH income actually spent (the slack: token bought + mint ETH
    + repair ETH, over the sum of incomes) and the share lost to the wallet cap; by delver income quintile: the
    share of operator income it pays, operator ETH as a share of its income, runs per delver a day, the share of
    its income spent. Dollars at $2,682/ETH (CoinGecko, 2026-10-02) and months of 30.42 days, as docs/capital.md:
    reporting conversions, never model inputs.
(f) Predictions, not tests. mint_op_share 0.5 moves nothing but the treasury column: every economy2 column except
    "treasury" identical to its share-0 twin, in every pair. Operator income grows with the fee up to 0.0024; at
    0.0048 a tier-1 repair (30 + 240 = 270 token-equivalent) costs more than minting a new one (220), so tier-1
    repairs stop, worn tier-1 gear is scrapped, and repair income falls to what tiers 2-3 pay. The runs lost fall
    on the lower income quintiles. Less slack (H 15, sigma 0.8) makes every fee dearer in runs.
END OF PRE-REGISTRATION

Findings (sweep, 2026-10-03; added after the run, below the pre-registration, which is unchanged - its SHA-1,
954116052b2b, heads every log section). 335 runs x 10,000 days, 1,786 s wall on 3 workers of a shared machine;
50/50 patched controls equal unpatched economy2 (fp, full SHA-1, every summary field); 100/100 share-0.5 runs equal
their share-0 twins on every column but the treasury; 15/15 run-twice pairs identical; --repro 5/5 rows byte-identical;
token, item and ETH ledgers exact every day. The sweep's first summary crashed on a division by zero (the poorest
income quintile never runs in some controls) after every run and the CSV were written; the tables were rebuilt from the
CSV with --report (no run) and the guard is in place.
  Reference cell (s 0.33, d0 0.10), operator ETH a day per 600 delvers, $ at 2,682: 0.0006 -> 0.0074 ($19.95), 0.0012 ->
  0.0148 ($39.81, $1,211 a month), 0.0024 -> 0.0288 ($77.12), 0.0048 -> 0.0132 ($35.28); runs -0.5 / -0.7 / -2.8 / -8.8 %.
  The lost first look ($19.92 / $39.71 / $76.89, -0.4 / -0.8 / -2.8 %) stands. To 0.0024 burn, minting, supply (-3 % at
  most) and merchants do not move. Across the four cells 0.0012 earns $21-40 a day for -0.35 to -0.74 % runs.
  Rule (c): 0.0006-0.0024 pass in all four cells at both mint shares; 0.0048 fails three of four - the predicted cliff: a
  tier-1 repair (270 token-equivalent) costs more than minting (220), repairs fall 12.5 -> 2.7 a day at the reference
  cell, 8.6 items a day are scrapped and re-minted (mints 2.8 -> 11.2, burn 773 -> 1,475), runs fall 4.7-8.8 %, the
  reference cell's verdict moves viable -> ROBUST (a fail as registered), and the operator earns less than at 0.0024.
  Nearly free: 0.0006 and 0.0012 in every cell; 0.0024 only at s 0.33, d0 0.20 (-1.2 %), elsewhere -2.1 to -2.8 %.
  Grid B: 0.0012 passes all six H x sigma cells (runs +0.2 to -2.4 %, $21-55 a day; nearly free in 5/6, not at H 60,
  sigma 0.8: -2.4 %, +2.0 pts). 0.0024 fails four: runs -5.5 / -6.8 % at H 60, and the verdict at sigma 0.8 with H 15
  and 30 on one seed's supply slope (+1.005 / +1.043 %/yr against the 1 %/yr line). Prediction wrong: looser budgets make
  the fee dearer in runs (H 60: 14-22 % priced out against 34-39 % at H 30, so more of those playing sit at their margin);
  at H 15 it costs -0.1 to -1.0 %, the poor being priced out already.
  mint_op_share 0.5: as predicted, nothing moves but the treasury (100/100); the operator gets $7.61 a day at the
  reference cell ($232 a month), $17.6-44.6 in the other cells.
  Who pays (reference cell, 0.0012): the poorest fifth never plays in the control; the top three fifths pay 30 / 32 /
  34.5 % of the fee, in proportion to their runs, but it is 19 % of the middle fifth's income against 3.7 % of the top
  fifth's (the middle fifth's spending on the game goes from 23 % of its income to 43 %); two thirds of the runs lost are
  the second fifth's (-14 %), which plays 3.5 % of all runs.
  Slack: delvers spend 11.2 % of their ETH income at the reference cell (10.7-11.9 % by seed; 88.8 % overflows the 30-day
  wallet cap), 6.4-37 % across every control. The fee is nearly free because the model leaves the middle fifth room.
  Recommendation (d): 0.0012 ETH - passes everywhere, nearly free at the reference cell; 0.0024 fails four of six
  stress cells. With half the mint ETH and the Pons creator fee (0.7 % of token bought) the operator takes $0.0796 per
  delver per day at the reference cell (the first look: $0.0794).

Reproducibility. Seeds are fixed. Every run's full trajectory (every economy2 column, every day) is hashed with
SHA-1; fp is economy2's own 12-hex fingerprint of it. Checks, reported at the end of the run: every patched
control equals the unpatched economy2 run of its configuration (fp and every summary field); every share-0.5
run equals its share-0 twin on every column but "treasury" (fp_nt) and differs in that one; the 15 Grid B runs at
H 30, sigma 1.2 equal their Grid A twins in every field; --repro re-runs one cell (s 0.33, d0 0.10, repair_eth
0.0012, share 0, seeds 0-4) in fresh processes and compares each CSV row with operator_fee.csv byte for byte.
The SHA-1 of the pre-registration text above heads every log section, so an edit to it shows.

Outputs: one line per finished run appended to sim/out/operator_fee.log (tail -f it), sim/out/operator_fee.csv
(one row per run, no timings, so a re-run is byte-identical), then the summary tables, printed and appended to
the log. At most 3 worker processes: the machine is shared.

  .venv/bin/python sim/operator_fee.py               # 335 runs x 10,000 days, ~30 min on 3 workers
  .venv/bin/python sim/operator_fee.py --repro       # re-run one cell, compare with operator_fee.csv (~25 s)
  .venv/bin/python sim/operator_fee.py --report      # the summary tables again, from operator_fee.csv (no run)
  .venv/bin/python sim/operator_fee.py --check       # patched == unpatched on 4 configurations x 2,000 days (~15 s)
"""
import argparse, csv, hashlib, io, math, sys, time, types
import multiprocessing as mp
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import economy2 as E2                                    # the v1 model, unpatched: every control's reference

SRC = HERE / "economy2.py"
T = "   # [operator_fee]"
PATCHES = (                                              # (name, anchor in economy2.py, replacement); each anchor must occur exactly once
    ("P: two fields", "    seed: int = 0\n",
     "    seed: int = 0\n"
     "    repair_eth: float = 0.0" + T + " ETH paid to the operator per repair, out of the delver's ETH wallet\n"
     "    mint_op_share: float = 0.0" + T + " share of each mint's ETH sent to the operator instead of the treasury\n"),
    ("run: operator state", "treasury = 0.0; topup = 0\n",
     "treasury = 0.0; topup = 0\n"
     "    op_rep = op_mint = 0.0; opi = np.zeros(N); spi = np.zeros(N)" + T + " operator ETH so far; per delver, last quarter: operator ETH paid, ETH spent\n"
     "    OX = {k: np.zeros(p.days) for k in (\"op_rep\", \"op_mint\", \"treas_in\", \"paid\", \"buy_eth\", \"ovf\", \"lost_price\", \"lost_afford\")}" + T + " daily\n"),
    ("day: income overflow", "        eth = np.minimum(eth + e, p.H * e); meth",
     "        OX[\"ovf\"][day] = float(np.maximum(eth + e - p.H * e, 0.0).sum())" + T + " income lost to the wallet cap\n"
     "        eth = np.minimum(eth + e, p.H * e); meth"),
    ("day: opening balances", "        meq = [0] + [mint_u[t]",
     "        ew0 = eth.copy(); b0 = c[\"buy\"]; tr0, or0, om0 = treasury, op_rep, op_mint; rep_eu = int(round(p.repair_eth * tU))" + T + " wallets after income; repair ETH in token units today\n"
     "        meq = [0] + [mint_u[t]"),
    ("gear-up: mint ETH split", "eth[i] -= p.mint_eth[t]; treasury += p.mint_eth[t]",
     "eth[i] -= p.mint_eth[t]; treasury += p.mint_eth[t] - p.mint_eth[t] * p.mint_op_share; op_mint += p.mint_eth[t] * p.mint_op_share;"
     " opi[i] += (day >= lq0) * p.mint_eth[t] * p.mint_op_share"),
    ("repair: token + ETH",
     "            if rep_u <= repl and int(tok[i]) + int(eth[i] * tU) >= rep_u: pay(i, rep_u); c[\"burn_repair\"] += rep_u; dur[i] = 1.0; c[\"repaired\"] += 1\n"
     "            else: eq[i] = 0; c[\"broke\"] += 1\n",
     "            okp = rep_u + rep_eu <= repl" + T + " token + ETH (token-equivalent) no dearer than replacing\n"
     "            oka = eth[i] >= p.repair_eth and int(tok[i]) + int((eth[i] - p.repair_eth) * tU) >= rep_u" + T + " the wallet covers the ETH and any token shortfall\n"
     "            if okp and oka: eth[i] -= p.repair_eth; op_rep += p.repair_eth; opi[i] += (day >= lq0) * p.repair_eth; pay(i, rep_u); c[\"burn_repair\"] += rep_u; dur[i] = 1.0; c[\"repaired\"] += 1\n"
     "            else:\n"
     "                eq[i] = 0; c[\"broke\"] += 1\n"
     "                if rep_u <= repl and int(tok[i]) + int(eth[i] * tU) >= rep_u: OX[\"lost_price\" if not okp else \"lost_afford\"][day] += 1" + T + " economy2 would have repaired\n"),
    ("day: ETH ledger", "        bal_prev, sup_prev = bal, sup\n",
     "        _pd = ew0 - eth; _db = (c[\"buy\"] - b0) / tU; _dt = treasury - tr0; _dr = op_rep - or0; _dm = op_mint - om0" + T + " ETH: delvers' wallets -> token sellers, treasury, operator\n"
     "        assert _pd.min() >= 0, f\"[operator_fee] a delver's ETH rose within day {day}\"\n"
     "        assert abs(float(_pd.sum()) - (_db + _dt + _dr + _dm)) <= 1e-9, f\"[operator_fee] ETH ledger broken, day {day}: delvers paid {float(_pd.sum())!r} != token {_db!r} + treasury {_dt!r} + operator {_dr + _dm!r}\"\n"
     "        OX[\"op_rep\"][day], OX[\"op_mint\"][day], OX[\"treas_in\"][day], OX[\"paid\"][day], OX[\"buy_eth\"][day] = _dr, _dm, _dt, float(_pd.sum()), _db\n"
     "        if day >= lq0: spi += _pd\n"
     "        bal_prev, sup_prev = bal, sup\n"),
    ("run: return the tallies", "    return R, x\n",
     "    x |= dict(OX=OX, opi=opi, spi=spi, ran_lq=ran_lq.copy(), e=e.copy(), op_rep=op_rep, op_mint=op_mint)" + T + "\n"
     "    return R, x\n"),
)

def patched_source():
    src = SRC.read_text()
    for name, old, new in PATCHES:
        n = src.count(old)
        assert n == 1, f"patch '{name}': anchor found {n} times in {SRC} (expected exactly 1) - the model changed; re-read it before re-running"
        src = src.replace(old, new)
    return src

def load():
    name = "economy2_operator_fee"
    mod = types.ModuleType(name); mod.__file__ = str(SRC); sys.modules[name] = mod
    exec(compile(patched_source(), f"{SRC} [patched in memory by operator_fee.py]", "exec"), mod.__dict__)
    assert mod.E_MED == E2.E_MED and mod.COLS == E2.COLS, "the patch moved the calibration or the record"
    return mod
OF = load()                                              # the patched model

CELLS_A = ((0.0, 0.10), (0.0, 0.20), (0.33, 0.10), (0.33, 0.20))   # SPEC §5's four reference cells
REPS_A, SHARES_A = (0.0, 0.0006, 0.0012, 0.0024, 0.0048), (0.0, 0.5)
HS_B, SIGMAS_B, REPS_B = (15, 30, 60), (0.8, 1.2), (0.0, 0.0012, 0.0024)
REF = (0.33, 0.10)                                       # the reference cell
SEEDS, DAYS, WORKERS = tuple(range(5)), 10_000, 3
RUNS_FLOOR, NEAR_RUNS, NEAR_PO = 0.95, 0.02, 0.02        # (c)
REC_FEES = (0.0012, 0.0024)                              # (d)
USD_PER_ETH, MONTH, PONS_CREATOR = 2682.0, 30.42, 0.007  # reporting only: CoinGecko 2026-10-02; capital.md's month; Pons v2 creator share of volume (capital.md §3)
COSTS = (464, 2_000, 5_000, 10_600, 40_000)              # capital.md §4 run-rates, $ a month
KEYS = ("s", "d0", "H", "sigma", "repair_eth", "mint_op_share", "seed")
REPRO = dict(grid="A", s=0.33, d0=0.10, H=30, sigma=1.2, repair_eth=0.0012, mint_op_share=0.0)
NO_T = tuple(k for k in E2.COLS if k != "treasury")

def prereg_sha():
    d = __doc__; return hashlib.sha1(d[d.index("PRE-REGISTRATION -"):d.index("END OF PRE-REGISTRATION")].encode()).hexdigest()[:12]

def jobs(days):
    D, js = E2.P(), []
    js += [("A", dict(s=s, d0=d0, H=D.H, sigma=D.sigma, repair_eth=r, mint_op_share=m, seed=sd)) for s, d0 in CELLS_A for m in SHARES_A for r in REPS_A for sd in SEEDS]
    js += [("B", dict(s=REF[0], d0=REF[1], H=h, sigma=sg, repair_eth=r, mint_op_share=0.0, seed=sd)) for h in HS_B for sg in SIGMAS_B for r in REPS_B for sd in SEEDS]
    ctl = {}
    for _, kw in js:
        if kw["repair_eth"] == 0 and kw["mint_op_share"] == 0: ctl.setdefault(tuple(kw[k] for k in KEYS), kw)
    js += [("ref", kw) for kw in ctl.values()]
    return [(i, days, g, kw) for i, (g, kw) in enumerate(js, 1)]

def hashes(R):
    return dict(sha1=hashlib.sha1(np.stack([R[c] for c in E2.COLS]).tobytes()).hexdigest(), fp=E2.fp(R),
                fp_nt=hashlib.sha1(np.stack([R[c] for c in NO_T]).tobytes()).hexdigest()[:12])

def extras(p, R, x, r):
    a = p.days * 3 // 4; n = p.days - a; X = x["OX"]; m = lambda k: float(X[k][a:].mean())
    e, opi, spi, ran = x["e"], x["opi"], x["spi"], x["ran_lq"]; inc = float(e.sum()) * n
    tpe, N = p.token_per_eth, p.N
    out = dict(rep_tok_eq=round(p.repair_eth * tpe), op_eth_d=m("op_rep") + m("op_mint"), op_rep_d=m("op_rep"), op_mint_d=m("op_mint"),
               op_total=x["op_rep"] + x["op_mint"], treasury_eth_d=m("treas_in"), paid_eth_d=m("paid"), buy_delv_eth_d=m("buy_eth"),
               spent_share=float(X["paid"][a:].sum()) / inc, ovf_share=float(X["ovf"][a:].sum()) / inc,
               lost_price_d=m("lost_price"), lost_afford_d=m("lost_afford"), creator_eth_d=PONS_CREATOR * r["bought_d"] / tpe)
    # cross-checks of the tallies against each other and against economy2's own record
    assert math.isclose(float(opi.sum()), float((X["op_rep"][a:] + X["op_mint"][a:]).sum()), rel_tol=1e-9, abs_tol=1e-12), "per-delver operator tally"
    assert math.isclose(float(spi.sum()), float(X["paid"][a:].sum()), rel_tol=1e-9, abs_tol=1e-12), "per-delver spend tally"
    assert math.isclose(out["treasury_eth_d"], sum(p.mint_eth[t] * (1 - p.mint_op_share) * r[f"m{t}_d"] for t in (1, 2, 3)), rel_tol=1e-9, abs_tol=1e-12), "treasury != mint ETH"
    assert math.isclose(out["op_mint_d"], sum(p.mint_eth[t] * p.mint_op_share * r[f"m{t}_d"] for t in (1, 2, 3)), rel_tol=1e-9, abs_tol=1e-12), "operator mint share"
    assert math.isclose(out["op_rep_d"], p.repair_eth * r["repaired_d"], rel_tol=1e-9, abs_tol=1e-12), "operator repair ETH != repairs x fee"
    assert math.isclose(float(X["paid"].sum()) - float(X["buy_eth"].sum()), float(R["treasury"][-1]) + out["op_total"], rel_tol=1e-9, abs_tol=1e-9), "whole-run ETH"
    assert math.isclose(float(X["buy_eth"][a:].sum()) * tpe * E2.U, float(R["bought"][a:].sum()) - float(R["m_topup"][-1] - R["m_topup"][a - 1]), rel_tol=1e-9), "delver token bought"
    q = np.argsort(np.argsort(e, kind="stable"), kind="stable") * 5 // N           # income quintile 0 (poorest) .. 4
    opt = float(opi.sum())
    for k in range(5):
        g = q == k; ik = float(e[g].sum()) * n
        out |= {f"op_q{k + 1}": float(opi[g].sum()) / opt if opt > 0 else float("nan"), f"burden_q{k + 1}": float(opi[g].sum()) / ik,
                f"runs_q{k + 1}": float(ran[g].sum()) / int(g.sum()) / n, f"spent_q{k + 1}": float(spi[g].sum()) / ik}
    return out

def one(j):
    idx, days, grid, kw = j; t0 = time.time()
    if grid == "ref":                                    # unpatched economy2, the reference for the controls
        p = E2.P(days=days, **{k: v for k, v in kw.items() if k not in ("repair_eth", "mint_op_share")})
        R, x = E2.run(p); r = E2.summarize(p, R, x)
        return dict(idx=idx, grid=grid, days=days) | {k: kw[k] for k in KEYS} | r | hashes(R), time.time() - t0
    p = OF.P(days=days, **kw); R, x = OF.run(p); r = OF.summarize(p, R, x)   # run() asserts the token, item and ETH ledgers every day
    return dict(idx=idx, grid=grid, days=days) | {k: kw[k] for k in KEYS} | r | extras(p, R, x, r) | hashes(R), time.time() - t0

def logline(k, n, r, dt, el, eta):
    head = (f"[{k:3d}/{n}] #{r['idx']:<3d} {r['grid']:3} s={r['s']:.2f} d0={r['d0']:.2f} H={r['H']:<2d} sig={r['sigma']:.1f} rep={r['repair_eth']:.4f} share={r['mint_op_share']:.1f}"
            f" seed={r['seed']} | {dt:5.1f}s t+{el:5.0f}s eta {eta:5.0f}s | ")
    tail = (f"runs/d {r['runs_d']:6.1f} priced-out {r['priced_out']:5.1%} excl {r['excluded']:5.1%} | repairs/d {r['repaired_d']:5.2f} scrapped/d {r['broke_d']:5.2f}"
            f" mint/d {r['minted_d']:5.2f} mint_ok {r['mint_ok']:.2f} slope/yr {r['slope_yr']:+.3f} burn/d {r['burn_d']:6.0f} merch pnl/d {r['m_pnl_d']:+6.1f}")
    if r["grid"] == "ref": return head + "unpatched economy2 | " + tail + f" | fp {r['fp']}"
    return (head + f"operator {r['op_eth_d']:.5f} ETH/d ${r['op_eth_d'] * USD_PER_ETH:6.2f}/d (repair {r['op_rep_d']:.5f}, mint {r['op_mint_d']:.5f}) | " + tail
            + f" | treasury {r['treasury_eth_d']:.5f} ETH/d lost repairs {r['lost_price_d']:.2f}+{r['lost_afford_d']:.2f}/d spent {r['spent_share']:5.1%} of income | fp {r['fp']}")

def opener(mode):
    log = open(E2.OUT / "operator_fee.log", "a")
    def say(x=""): print(x, flush=True); log.write(x + "\n"); log.flush()
    say(f"\n=== {datetime.now(timezone.utc).isoformat(timespec='seconds')} operator_fee.py {mode} | pre-registration sha1 {prereg_sha()} ===")
    return log, say

def sweep(days, workers):
    js = jobs(days); n = len(js); cnt = {g: sum(j[2] == g for j in js) for g in ("A", "B", "ref")}
    log, say = opener(f"sweep: {n} runs (A {cnt['A']}, B {cnt['B']}, ref {cnt['ref']}), {days} days each, {workers} workers"
                      f" | calibration held: median delver {E2.E_MED * 1e6:.1f} uETH/day, sigma and H per run, {E2.P.token_per_eth:,.0f} token/ETH")
    t0, R, busy = time.time(), {}, 0.0
    with mp.Pool(workers) as pool:
        for k, (r, dt) in enumerate(pool.imap_unordered(one, js), 1):
            R[r["idx"]] = r; busy += dt; el = time.time() - t0
            say(logline(k, n, r, dt, el, el / k * (n - k)))
    wall = time.time() - t0
    say(f"all {n} runs finished: {wall:.0f} s wall, {busy:.0f} s of run time summed over runs; token and item ledgers (economy2.run) and the ETH ledger"
        f" (the patch) asserted exact on every day of every run")
    rows = [R[i] for i in sorted(R)]
    fields = list(next(r for r in rows if r["grid"] != "ref").keys())
    with open(E2.OUT / "operator_fee.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fields, restval=""); w.writeheader(); w.writerows(rows)
    report(rows, say)
    say(f"done: {wall:.0f} s wall; wrote {E2.OUT / 'operator_fee.csv'}, {E2.OUT / 'operator_fee.log'}")
    log.close()

# --- the report -----------------------------------------------------------------------------------------------------------------------------
usd = lambda eth: eth * USD_PER_ETH

def report(R, say):
    g = lambda rs, **kw: [r for r in rs if all(r[k] == v for k, v in kw.items())]
    st = lambda rs, k: np.array([r[k] for r in rs], float)
    mn = lambda rs, k: float(st(rs, k).mean())
    A, B, RF = g(R, grid="A"), g(R, grid="B"), g(R, grid="ref"); D = E2.P()
    def judge(rs, cs):
        v, vc = E2.verdict(rs), E2.verdict(cs)
        ru, ruc, po, poc = mn(rs, "runs_d"), mn(cs, "runs_d"), mn(rs, "priced_out"), mn(cs, "priced_out")
        pn, pnc, sdc = mn(rs, "m_pnl_d"), mn(cs, "m_pnl_d"), float(st(cs, "m_pnl_d").std(ddof=1))
        f = ([] if v == vc else [f"verdict {vc}->{v}"]) + ([] if ru >= RUNS_FLOOR * ruc else ["runs"]) + ([] if pn >= pnc - sdc else ["merchants"])
        return dict(ok=not f, fails=",".join(f) or "PASS", near=ru >= (1 - NEAR_RUNS) * ruc and po <= poc + NEAR_PO, v=v, vc=vc,
                    d_runs=ru / ruc - 1, d_po=po - poc, d_pnl=pn - pnc, sd_c=sdc, worst=float((st(rs, "runs_d") / st(cs, "runs_d") - 1).min()))
    HDR = (f"  {'share':>5} {'repair ETH':>10} {'tok-eq':>6} | {'operator ETH/d':>14} {'$/day':>7} {'$/month':>8} {'(repair':>8} {'mint)':>6} | {'runs/d':>6} {'vs ctl':>7}"
           f" {'worst seed':>10} | {'priced-out':>10} {'vs ctl':>7} {'never ran':>9} | {'repairs/d':>9} {'scrapped/d':>10} {'lost: price/afford':>18} | {'mints/d':>7}"
           f" | {'burn mint/repair/fee':>20} | {'treasury ETH/d':>14} | {'merch pnl/d':>11} {'vs ctl':>7} {'ctl sd':>6} | {'mint_ok min':>11} {'slope/yr max|.|':>15}"
           f" | {'spent':>6} {'capped':>6} | verdict | rule (c)  | nearly free")
    def row(rs, cs, share, rep):
        j = judge(rs, cs) if cs is not rs else None; v = {k: mn(rs, k) for k in rs[0] if isinstance(rs[0][k], float)}
        return j, (f"  {share:5.1f} {rep:10.4f} {round(rep * D.token_per_eth):6d} | {v['op_eth_d']:14.5f} {usd(v['op_eth_d']):7.2f} {usd(v['op_eth_d']) * MONTH:8,.0f}"
                   f" {usd(v['op_rep_d']):8.2f} {usd(v['op_mint_d']):6.2f} | {v['runs_d']:6.1f} {(j['d_runs'] if j else 0):+7.2%} {(j['worst'] if j else 0):+10.2%}"
                   f" | {v['priced_out']:10.1%} {100 * (j['d_po'] if j else 0):+6.1f}p {v['excluded']:9.1%} | {v['repaired_d']:9.2f} {v['broke_d']:10.2f}"
                   f" {v['lost_price_d']:9.2f}/{v['lost_afford_d']:<8.2f} | {v['minted_d']:7.2f} | {v['burn_mint_d']:6.0f}/{v['burn_repair_d']:5.0f}/{v['burn_fee_d']:4.0f}    "
                   f" | {v['treasury_eth_d']:14.5f} | {v['m_pnl_d']:+11.1f} {(j['d_pnl'] if j else 0):+7.1f} {float(st(cs, 'm_pnl_d').std(ddof=1)):6.1f}"
                   f" | {st(rs, 'mint_ok').min():11.2f} {np.abs(st(rs, 'slope_yr')).max():15.3f} | {v['spent_share']:6.1%} {v['ovf_share']:6.1%}"
                   f" | {E2.verdict(rs):>7} | {(j['fails'] if j else 'control'):9} | {('yes' if j['near'] else 'NO') if j else '-'}")
    V = {}
    # (A) ---------------------------------------------------------------------------------------------------------------------------------
    say(f"\n(A) Operator fee grid: repair_eth x mint_op_share x the four reference cells, seeds 0-4, 10,000 days, last quarter, means over seeds."
        f" Rule (c): verdict unchanged, runs >= {RUNS_FLOOR:.0%} of control, merchant P&L >= control - control's seed sd. 'nearly free': runs within {NEAR_RUNS:.0%}"
        f" and priced-out up <= {NEAR_PO * 100:.0f} pts. $ at ${USD_PER_ETH:,.0f}/ETH, a month = {MONTH} days. 'lost' = repairs economy2 would have made that the fee"
        f" turned into scrapping (too dear vs replacing / unaffordable). spent = delvers' ETH spent / their income; capped = income lost to the wallet cap")
    for s, d0 in CELLS_A:
        cs = g(A, s=s, d0=d0, repair_eth=0.0, mint_op_share=0.0)
        say(f"\n  s = {s:g}, d0 = {d0:.2f}  (tier-1 trade price {np.nanmean(st(cs, 'p1')):.0f} token, mint-equivalent {D.mint_cost[1] + D.mint_eth[1] * D.token_per_eth:.0f})"); say(HDR)
        for m in SHARES_A:
            for rep in REPS_A:
                rs = g(A, s=s, d0=d0, repair_eth=rep, mint_op_share=m); j, line = row(rs, cs if (rep, m) != (0.0, 0.0) else rs, m, rep); say(line)
                if j: V[("A", s, d0, 30, 1.2, rep, m)] = j
    # who pays ---------------------------------------------------------------------------------------------------------------------------
    say(f"\n(A') Who pays: delvers ranked by ETH income into quintiles (Q1 poorest, 120 delvers each), mint_op_share 0, last quarter. op = share of the operator's"
        f" repair ETH paid by the quintile; burden = operator ETH as a share of the quintile's income; runs = runs per delver a day, fee vs control;"
        f" spent = share of the quintile's income spent, control -> fee")
    say(f"  {'s':>4} {'d0':>4} {'repair ETH':>10} | {'op share Q1..Q5':>34} | {'burden Q1..Q5':>39} | {'runs vs control Q1..Q5':>44} | spent Q1..Q5, control -> fee")
    for s, d0 in CELLS_A:
        cs = g(A, s=s, d0=d0, repair_eth=0.0, mint_op_share=0.0)
        for rep in REPS_A[1:]:
            rs = g(A, s=s, d0=d0, repair_eth=rep, mint_op_share=0.0); Q = range(1, 6)
            rel = lambda k: f"{mn(rs, f'runs_q{k}') / mn(cs, f'runs_q{k}') - 1:+8.2%}" if mn(cs, f"runs_q{k}") > 0 else f"{'no runs':>8}"   # a quintile may never run
            say(f"  {s:4.2f} {d0:4.2f} {rep:10.4f} | " + " ".join(f"{mn(rs, f'op_q{k}'):6.1%}" for k in Q) + " | " + " ".join(f"{mn(rs, f'burden_q{k}'):7.2%}" for k in Q)
                + " | " + " ".join(rel(k) for k in Q) + " | "
                + " ".join(f"{mn(cs, f'spent_q{k}'):.1%}->{mn(rs, f'spent_q{k}'):.1%}" for k in Q))
    # (B) ---------------------------------------------------------------------------------------------------------------------------------
    say(f"\n(B) Stressing the slack: s = {REF[0]:g}, d0 = {REF[1]:.2f}, wallet cap H x income spread sigma x repair_eth, mint_op_share 0, seeds 0-4; each fee row judged"
        f" against the repair_eth 0 row of the same H and sigma (median income fixed at {E2.E_MED * 1e6:.1f} uETH/day; mean = median x exp(sigma^2 / 2))")
    for h in HS_B:
        for sg in SIGMAS_B:
            cs = g(B, H=h, sigma=sg, repair_eth=0.0)
            say(f"\n  H = {h}, sigma = {sg:.1f}"); say(HDR)
            for rep in REPS_B:
                rs = g(B, H=h, sigma=sg, repair_eth=rep); j, line = row(rs, cs if rep else rs, 0.0, rep); say(line)
                if j: V[("B", REF[0], REF[1], h, sg, rep, 0.0)] = j
    # rule (d) ----------------------------------------------------------------------------------------------------------------------------
    say(f"\n(D) Pre-registered recommendation (d): of {REC_FEES}, the fee with more operator ETH at the reference cell among those passing rule (c) in all four"
        f" Grid A cells (share 0 and 0.5) and all six Grid B cells")
    cand = []
    for rep in REC_FEES:
        fa = [f"A s={k[1]:g} d0={k[2]:.2f} share={k[6]:g}: {V[k]['fails']}" for k in V if k[0] == "A" and k[5] == rep and not V[k]["ok"]]
        fb = [f"B H={k[3]} sigma={k[4]:g}: {V[k]['fails']}" for k in V if k[0] == "B" and k[5] == rep and not V[k]["ok"]]
        op = mn(g(A, s=REF[0], d0=REF[1], repair_eth=rep, mint_op_share=0.0), "op_eth_d"); near = V[("A", REF[0], REF[1], 30, 1.2, rep, 0.0)]["near"]
        nb = sum(V[k]["near"] for k in V if k[0] == "B" and k[5] == rep)
        say(f"  repair_eth {rep:.4f}: operator {op:.5f} ETH/d (${usd(op):.2f}/d) at the reference cell; fails: {'; '.join(fa + fb) or 'none'};"
            f" nearly free at the reference cell: {'yes' if near else 'NO'}; nearly free in {nb}/6 Grid B cells")
        if not (fa or fb): cand.append((op, rep, near))
    if cand:
        op, rep, near = max(cand); say(f"  -> recommended: repair_eth {rep:.4f} ETH ({round(rep * D.token_per_eth)} token-equivalent){'' if near else ' - NOT nearly free at the reference cell'}")
    else: say("  -> recommended: neither (see fails)")
    # break-even ----------------------------------------------------------------------------------------------------------------------------
    say(f"\n(E) Break-even per docs/capital.md §4, at the reference cell (s = {REF[0]:g}, d0 = {REF[1]:.2f}, 600 delvers), last-quarter means over seeds 0-4:"
        f" (a) half the mint ETH and (i) the repair fee measured together in the share-0.5 runs; (b) the Pons creator fee = {PONS_CREATOR:.1%} of the token"
        f" bought (delvers + merchants), arithmetic on the measured purchases. Head-count = $ a month / {MONTH} / ($ per delver a day); in brackets, those who run"
        f" on a given day (head-count x runs a day / 600)")
    say(f"  {'lines':>32} | {'(a) $/d':>8} {'(b) $/d':>8} {'(i) $/d':>8} {'total $/d':>9} {'$/delver/d':>10} {'runs/d':>6} | " + " ".join(f"{'$' + format(c, ',') + '/mo':>16}" for c in COSTS))
    lines = [("(b) Pons fee only", 0.0, 0.0, False, False)] + [("(a) + (b)", 0.0, 0.5, True, False)] + [(f"(a) + (b) + (i) at {rep:.4f} ETH", rep, 0.5, True, True) for rep in REPS_A[1:]]
    for lab, rep, m, ua, ui in lines:
        rs = g(A, s=REF[0], d0=REF[1], repair_eth=rep, mint_op_share=m)
        a_, b_, i_ = usd(mn(rs, "op_mint_d")) * ua, usd(mn(rs, "creator_eth_d")), usd(mn(rs, "op_rep_d")) * ui; tot = a_ + b_ + i_; pd = tot / 600; rn = mn(rs, "runs_d")
        say(f"  {lab:>32} | {a_:8.2f} {b_:8.2f} {i_:8.2f} {tot:9.2f} {pd:10.4f} {rn:6.1f} | "
            + " ".join(f"{c / MONTH / pd:8,.0f} ({c / MONTH / pd * rn / 600:5,.0f})" for c in COSTS))
    # checks --------------------------------------------------------------------------------------------------------------------------------
    S = [k for k in RF[0] if k not in ("idx", "grid", "days", "sha1", "fp", "fp_nt") + KEYS]
    pr = [(c, f) for f in RF for c in R if c["grid"] in ("A", "B") and all(c[k] == f[k] for k in KEYS)]
    same = sum(c["fp"] == f["fp"] and c["sha1"] == f["sha1"] and all(repr(c[k]) == repr(f[k]) for k in S) for c, f in pr)
    tw = [(a, b) for a in g(A, mint_op_share=0.5) for b in g(A, mint_op_share=0.0) if all(a[k] == b[k] for k in KEYS if k != "mint_op_share")]
    tw_nt = sum(a["fp_nt"] == b["fp_nt"] for a, b in tw); tw_t = sum(a["fp"] != b["fp"] for a, b in tw)
    du = [(b, a) for b in g(B, H=D.H, sigma=D.sigma) for a in g(A, mint_op_share=0.0) if all(a[k] == b[k] for k in KEYS)]
    dsame = sum(all(repr(a[k]) == repr(b[k]) for k in a if k not in ("idx", "grid")) for b, a in du)
    say(f"\nchecks: {same}/{len(pr)} patched controls (repair_eth 0, share 0) equal the unpatched economy2 run of their configuration - fp, full-trajectory SHA-1 and"
        f" every summary field; {tw_nt}/{len(tw)} share-0.5 runs equal their share-0 twins on every economy2 column but 'treasury' ({tw_t}/{len(tw)} differ in it);"
        f" {dsame}/{len(du)} Grid B runs at H 30, sigma 1.2 equal their Grid A twins in every field (separate jobs); token, item and ETH ledgers asserted exact"
        f" every day of every run; per-run tallies cross-checked (treasury = mints x mint ETH x (1 - share), operator = repairs x fee + mints x mint ETH x share,"
        f" whole-run ETH paid = treasury + operator + token bought)")
    ctl = g(A, s=REF[0], d0=REF[1], repair_eth=0.0, mint_op_share=0.0); allc = st([r for r in A + B if r["repair_eth"] == 0 and r["mint_op_share"] == 0], "spent_share")
    say(f"slack at the reference cell, control: delvers spend {mn(ctl, 'spent_share'):.1%} of their ETH income [{st(ctl, 'spent_share').min():.1%}, {st(ctl, 'spent_share').max():.1%}],"
        f" lose {mn(ctl, 'ovf_share'):.1%} to the {D.H}-day wallet cap; every control run of A and B: spent {allc.min():.1%}-{allc.max():.1%}")

def rebuild():
    """The summary tables again, from operator_fee.csv (as written by the sweep) - no run."""
    path = E2.OUT / "operator_fee.csv"; INT, STR = ("idx", "days", "H", "seed", "rep_tok_eq"), ("grid", "sha1", "fp", "fp_nt")
    with open(path, newline="") as fh:
        rows = [{k: (v if k in STR else int(v) if k in INT else float(v)) for k, v in r.items() if v != ""} for r in csv.DictReader(fh)]
    log, say = opener(f"--report: summary tables rebuilt from {path} ({len(rows)} rows), no run")
    report(rows, say); say(f"done: report rebuilt from {path}"); log.close()

def repro(days, workers):
    path = E2.OUT / "operator_fee.csv"
    with open(path, newline="") as fh: lines = fh.read().split("\r\n")
    header = next(csv.reader([lines[0]])); old = {int(next(csv.reader([ln]))[0]): ln for ln in lines[1:] if ln}
    js = [j for j in jobs(days) if j[2] == REPRO["grid"] and all(j[3][k] == v for k, v in REPRO.items() if k != "grid")]
    log, say = opener(f"--repro: re-run {len(js)} runs of one cell ({', '.join(f'{k} {v}' for k, v in REPRO.items())}), {days} days, in fresh processes; compare with {path}")
    t0 = time.time()
    with mp.Pool(min(workers, len(js))) as pool: out = pool.map(one, js)
    same = 0
    for rec, dt in out:
        buf = io.StringIO(); csv.DictWriter(buf, header, restval="").writerow(rec); new = buf.getvalue().rstrip("\r\n"); ok = new == old.get(rec["idx"]); same += ok
        say(f"  #{rec['idx']:<3d} seed={rec['seed']} {dt:5.1f}s | sha1 {rec['sha1'][:12]} | operator {rec['op_eth_d']:.6f} ETH/d | CSV row {'byte-identical' if ok else 'DIFFERENT'} ({len(new)} bytes)")
    say(f"--repro: {same}/{len(out)} rows byte-identical to {path}; {time.time() - t0:.0f} s wall")
    log.close()

def check(days, workers):
    """Fast self-test: the patch at zero fee is economy2; a mint share moves only the treasury column."""
    cfg = [dict(s=0.0, d0=0.10), dict(s=0.33, d0=0.10), dict(s=0.33, d0=0.20), dict(s=0.33, d0=0.10, H=15, sigma=0.8)]
    js = []
    for i, c in enumerate(cfg):
        kw = dict(H=30, sigma=1.2, seed=i) | c
        js += [(len(js) + 1, days, "ref", kw | dict(repair_eth=0.0, mint_op_share=0.0)), (len(js) + 2, days, "A", kw | dict(repair_eth=0.0, mint_op_share=0.0)),
               (len(js) + 3, days, "A", kw | dict(repair_eth=0.0, mint_op_share=0.5)), (len(js) + 4, days, "A", kw | dict(repair_eth=0.0012, mint_op_share=0.0))]
    t0 = time.time()
    with mp.Pool(workers) as pool: out = [r for r, _ in pool.map(one, js)]
    ok = True
    for k in range(0, len(out), 4):
        f, c, h, x = out[k:k + 4]
        a = f["fp"] == c["fp"] and f["sha1"] == c["sha1"]; b = h["fp_nt"] == c["fp_nt"] and h["fp"] != c["fp"]; ok &= a and b
        print(f"  s={c['s']:.2f} d0={c['d0']:.2f} H={c['H']} sigma={c['sigma']} seed={c['seed']}: unpatched {f['fp']} patched {c['fp']} -> {'identical' if a else 'DIFFERENT'};"
              f" share 0.5 fp_nt {h['fp_nt']} vs {c['fp_nt']} -> {'only the treasury moved' if b else 'UNEXPECTED'}; fee 0.0012: operator {x['op_eth_d']:.5f} ETH/d, runs {x['runs_d']:.1f} vs {c['runs_d']:.1f}")
    print(f"--check: {'PASS' if ok else 'FAIL'} ({days} days, {time.time() - t0:.0f} s)")
    return 0 if ok else 1

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--workers", type=int, default=WORKERS); ap.add_argument("--days", type=int, default=None)
    ap.add_argument("--repro", action="store_true"); ap.add_argument("--check", action="store_true"); ap.add_argument("--report", action="store_true")
    a = ap.parse_args(); E2.OUT.mkdir(exist_ok=True); w = max(1, min(a.workers, WORKERS))   # never more than 3 workers
    if a.check: return check(a.days or 2000, w)
    if a.report: return rebuild()
    return repro(a.days or DAYS, w) if a.repro else sweep(a.days or DAYS, w)

if __name__ == "__main__": sys.exit(main())
