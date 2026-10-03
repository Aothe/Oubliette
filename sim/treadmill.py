"""The death-rate treadmill (docs/red-team.md A1, A2): do organised parties and plain mastery push deaths under
the band the v1 economy needs, and does a fresh-drop budget tied to gear destroyed, enforced by contract, hold
the sink when they do?

The v1 model (sim/economy2.py) holds each delver's death chance fixed for 10,000 days and gives every survivor
without recycled loot the same q_fresh chance of fresh boss gear. The red team argued that guilds stacking heals
and players who get good both lower deaths with no cheat, and that minting - the token's main sink - lives on
deaths, because only a death or a scrapped item makes room for a new item. Its numbers came from first-look
probes on a patched copy of economy2 whose scripts were lost. This file redoes them, reproducibly.

How. This file reads sim/economy2.py from its own folder, applies six text patches in memory - every anchor
asserted to occur exactly once, so a change to the model fails loudly here instead of silently moving a result -
and exec's the patched source as a module. economy2.py is never edited. The patches add, off by default:
  organisation   P.f_org, P.m_org: the f_org of the N delvers with the highest skill draw (economy2's g_pop
                 stream; the top round(f_org N) by skill) have their per-run death chance multiplied by m_org.
  fresh drops    P.fresh_rule = "per-head" (economy2, unchanged) or "budget" (P.b, P.W), defined in (a) below.
and record, without changing any draw: value wagered and value destroyed per day, the would-be fresh drops, and
each delver's deaths in the last quarter. With f_org = 0 and the per-head rule the patched model must be economy2,
bit for bit: checked with economy2's own fingerprint (and a full SHA-1 of every daily column) against an
unpatched economy2.run on the grid's ten reference runs and five off-grid configurations. economy2's daily token
and item ledger assertions stay in run() and hold on every day of every run.

PRE-REGISTRATION - written 2026-10-03 before any run of this file. Nothing between this line and END OF
PRE-REGISTRATION moves after a run; a badly chosen rule is reported, not retuned.
(a) Model additions.
  Organisation. f_org of the N = 600 delvers - those with the highest skill draw - have economy2's per-run death
    chance pdb = d0 (1 - 0.6 skill) multiplied by m_org (times the tier multiplier, as before). Nothing else about
    them changes: economy2's tier choice and spare-keeping score every tier by -pdb_i x tier multiplier x (survival
    value + cost), so scaling pdb_i scales every option alike and an organised delver buys what it bought before;
    it dies less. They keep economy2's lottery weight (0.25 + skill).
  Fresh-drop budget. Draws are economy2's: every survivor without recycled loot whose r2 < q_fresh would get one,
    tier from r3. Under "budget" at most floor(credit_t) of them are granted on day t, where
        credit_t = frac(credit_{t-1}) + b x D_t / W,   D_t = items destroyed by death on days t-W .. t-1,
    in exact integer arithmetic (b in basis points). The fraction carries; a whole unspent item does not (no
    banking: a quiet week cannot fund a burst). Granted in ascending order of the r2 draw: economy2 grants every
    would-be drop, so it has no order of its own; r2 is i.i.d. uniform per delver per day, so this is a fresh
    random order each day that costs no new draw, and no RNG stream shifts. Today's deaths never fund today's
    drops (red-team rule 3: a death never pays the run it happened in).
  "Destroyed" = burned by death: economy2's deaths - recycled. Not recycled items - they are not destroyed, they
    return as loot. Not scrapped ("broke") items, although they also leave the world: (i) scrapping rises in a
    glut - worn gear cheaper than its repair is scrapped (SPEC §5, v1 A) - so counting it would let a glut fund more
    fresh drops, the feedback the budget exists to cut; (ii) scrapping is the holder's choice and cheapest when
    gear is cheapest, so a cartel could scrap near-worthless worn kit to raise the budget it then draws from, while a
    death costs the whole wagered kit; (iii) on chain a death is a fact settled against a run entry (red-team D2),
    a scrap is not. Counted in items, not value, as the red team proposed. Scrapping is reported, not budgeted.
(b) Grids. s = 0.33 (economy2's 1/3) throughout; 10,000 days; every other constant at P's default (fee 2 %, mint
    x1, repair 30, weighted lottery, sigma 1.2, H 30, 50,000 token/ETH, no shock); the last quarter is judged.
  A  organisation: (f_org, m_org) in {(0, -)} + {0.25, 0.5, 0.75} x {0.1, 0.3}; d0 in {0.10, 0.20}; rule in
     {per-head, budget b = 0.5, W = 30}; seeds 0-4. 140 runs.
  B  uniform mastery: f_org = 0; d0 in {0.05, 0.06, 0.07, 0.08, 0.09} (0.10 is A's); both rules; seeds 0-4. 50 runs.
  C  budget sensitivity: b in {0.25, 1.0}, W = 30, at (f_org 0.5, m_org 0.1, d0 0.10) and at (f_org 0, d0 0.05)
     (b = 0.5 there is in A and B); seeds 0-4. 20 runs.
  210 runs. Checks, not results: the ten A runs with f_org = 0 and the per-head rule are re-run with unpatched
  economy2 and must match in economy2.fp, a full SHA-1 of every daily column and every field economy2 returns;
  five off-grid pairs (3,000 days) likewise: s 0 d0 .05; s .66 d0 .20 index lottery; s .33 d0 .10 fee 10 % mint
  x2 repair 90; s .33 d0 .10 token x2 on day 1,500 uniform lottery; and f_org 0.5 with m_org 1.0 (a no-op
  organisation must change nothing).
(c) Rules, per cell (five seeds).
  VERDICT = economy2.verdict, thresholds unchanged: VIABLE iff on every seed mint_ok (share of last-quarter days
    with >= 1 mint) >= 0.5 and |total supply slope| <= 1 %/yr; ROBUST iff also mint_ok >= 0.9 on every seed.
  THE SINK HOLDS iff on every seed mint burn a day >= 0.5 x the mean mint burn a day of the fix-free reference
    cell: per-head rule, f_org 0, s 0.33, at the design d0 - the cell's own d0 in grid A; 0.10 in grids B and C,
    because mastery and organisation are drifts away from the d0 a designer tuned, and v1's design point is
    s 1/3, d0 0.10 (SPEC §5). Mint burn, because minting is the sink the red team says dies; repair and fee burn
    are reported beside it.
  PASS = VERDICT in {viable, ROBUST} and the sink holds.
  BREAKS = a per-head cell that fails PASS. Break point: per (m_org, d0) the smallest f_org that fails; in B the
    largest d0 that fails.
  FIXES = the budget arm PASSes in a cell whose per-head arm fails.
  COST to honest players, tested at f_org 0 at every d0 of A and B (b = 0.5 against per-head, means over seeds):
    acceptable iff runs a day >= 95 % of per-head's and the priced-out share <= per-head's + 5 points. Reported,
    not tested: fresh drops a day, the tier-1 price against its mint-equivalent (220 token), merchant P&L, and the
    unorganised delvers' deaths per run in the organised cells.
  RECOMMENDED b = the largest b in {0.25, 0.5, 1.0} that passes in every cell where it was run (A, B and C) and
    whose cost is acceptable wherever it was measured. W = 30 is the only window run: W is not tested.
  Reported per run (sim/out/treadmill.csv): deaths per run - overall, organised, unorganised, bottom third by
    skill; the share of all deaths carried by the bottom third by skill and by the organised; value destroyed by
    death per value wagered, both at the mint-equivalent (mint token + mint ETH at the token price); runs a day;
    priced-out share; fresh drops a day (granted and would-be); items destroyed by death and scrapped a day; mints
    a day; mint_ok; tier-1 trade price and its ratio to the mint-equivalent; burn by mint, repair and fee; treasury
    ETH a day; merchant P&L a day; total supply slope.
(d) The lost probes' claims (red-team A1, A2, Verdict; SPEC §5 red-team row; <= 3 seeds), each judged on seeds
    0-4: a share holds iff the measured mean is within 10 points of the claim; a level (token, items) iff within
    25 %; a relative change iff within 5 points; "none" iff no seed has mint_ok above 0.05.
    P1  A per-head, d0 .10: mint_ok 0.75 at f_org 0 and 0.39 with f_org .25, m_org .1.
    P2  A per-head, d0 .10, f_org .5, m_org .1: mint_ok 0.02.
    P3  same cell: tier-1 trades at ~60 token; mint burn 6 token a day, against 339 at f_org 0.
    P4  A per-head, d0 .20, f_org .5, m_org .1: mint_ok 0.79; the bottom third by skill carries 63 % of deaths.
    P5  A budget, d0 .10, m_org .1: mint_ok 0.83 with f_org .25 and 0.75 with f_org .5.
    P6  A, d0 .10, f_org 0, budget against per-head: fresh drops 5.0 -> 3.9 a day; runs -3 %.
    P7  B per-head: mint_ok 0.75 at d0 .10, 0.39 at .08, none at .06.
    P8  B budget: mint_ok 0.75-0.77 at every d0 from .10 down to .05.
    P9  Verdict 1: "the sim's own pass mark fails with a fifth fewer deaths" - B per-head, d0 .08, VERDICT = no.
(e) Predictions, not tests. The per-head rule breaks at d0 .10 with an organised quarter at m_org .1 and with half
    at m_org .3; at d0 .20 it survives more. Under the budget minting stays alive in every cell, because with b < 1
    minting must replace at least (1 - b) of the gear destroyed by death plus all scrapped gear; whether the sink
    holds turns on how many deaths are left, and may fail at f_org .75, m_org .1. At f_org 0 the budget costs about
    a fifth of fresh drops and a few per cent of runs, and moves the tier-1 price toward its mint-equivalent.
END OF PRE-REGISTRATION

Findings (scan, 2026-10-03; added after the run, below the pre-registration, which is unchanged - its SHA-1,
225043203dcb, heads every log section). 210 runs + 15 checks, 1,190 s wall on 3 workers; 10/10 reference runs and 5/5
off-grid pairs equal unpatched economy2 in fp, full SHA-1 and every field run() returns; --repro 5/5 rows
byte-identical; both ledgers exact every day of every run.
  Breaks. economy2's per-head rule fails PASS at d0 .10 with an organised quarter (m_org .1: mint_ok 0.40, mint burn
  140 of 341 a day; m_org .3: mint_ok 0.49-0.53, three seeds under 0.5) and under uniform mastery from d0 .08 (mint_ok
  0.38); d0 .09 passes (0.59-0.61). The line sits between 5.5 % and 5.8 % deaths per run (reference 6.5 %: about a fifth
  of headroom), or 3.2-3.35 % of value wagered destroyed by death (reference 3.8 %). At d0 .20 it breaks from half
  organised, on the sink rule: minting alive (mint_ok 0.78 / 0.92 at m_org .1 / .3) but mint burn 442 / 641 against
  1,258. What dies is minting, not the burn: in the seven per-head cells where minting dies (mint_ok <= 0.05: half or
  more organised at d0 .10, three quarters at m_org .1 at d0 .20, d0 <= .06) tier 1 trades at 29-155 token against 220,
  runs rise 24-59 % (priced-out 39 % -> 4-25 %), mint ETH into the treasury falls from 0.0057 to <= 0.0003 ETH a day,
  and total token burn falls only 7-22 % (773 -> 601-719) because repair burn rises with the extra runs (374 -> 536-664).
  Who dies: the bottom third by skill carries 38-40 % of deaths with nobody organised; with m_org .1, 47-48 % with a
  quarter organised, 63-65 % with half, 81-86 % with three quarters. Organised delvers die 0.005-0.012 per run (m_org
  .1), unorganised 0.071-0.088 at d0 .10.
  Fix. The b 0.5 budget passes 9 of the 14 A/B cells where per-head fails: every mastery cell down to d0 .05 (mint_ok
  0.76-0.90, mint burn 243-460), a quarter organised at m_org .1, and every m_org .3 cell but three quarters at d0 .20.
  It fails 5. At d0 .10 with half / three quarters organised at m_org .1, on one seed's supply slope only (seed 1,
  +1.20 / +1.12 %/yr against the 1 % line); minting is alive (mint_ok 0.74-0.77 / 0.62-0.65) and the sink holds. At d0
  .20 with half (m_org .1) and three quarters (both), on the sink: minting alive (0.77-0.92) but mint burn 327-583
  against a floor of 629 - deaths themselves have fallen, and a budget cannot make deaths.
  b. b 0.25 passes both cells it ran (half organised, m_org .1, d0 .10: mint_ok 0.90, mint burn 435; d0 .05: ROBUST, 360).
  b 1.0 fails both (mint_ok 0.16-0.23): fresh drops can then match the gear destroyed and minting has little left to
  replace. Registered recommendation: b = 0.25 - on two cells, with its cost at the design point not run. W = 30 is
  the only window run.
  Cost. At the design point (d0 .10, nobody organised) b 0.5 grants 68 % of the would-be fresh drops (5.03 -> 3.41 a
  day) and costs 3.7 % of runs and 2.3 points of priced-out; tier 1 stays at 210-211 token (96 % of its mint-equivalent),
  merchant P&L is unchanged (+15 token a day), mint burn and treasury ETH rise 53 %. At d0 .20 it barely binds (fresh
  4.10 -> 4.01, runs -0.1 %). The registered cost test fails at d0 <= .08 (runs -7 to -38 %, priced-out +4 to +37
  points), against per-head arms whose minting is dying or dead: the runs the budget "costs" there are the glut's.
  Reported, not retuned. In the two C cells b 0.25 costs 1-4 % more runs than b 0.5, with 1.0-1.2 fresh drops a day.
  Probes. P1-P7 and P9 hold within the registered tolerance (e.g. 0.40 for 0.39, 0.019 for 0.02, 63 token for 60, 7.4
  token a day for 6, 63 % for 63 %). P8 does not hold at d0 .08-.10 - the budget does better than claimed (mint_ok
  0.87-0.92 against 0.75-0.77) - and holds at .05-.07 (0.76-0.85). P5's half-organised cell matches in mint_ok (0.75)
  but fails the full verdict on one seed's slope.
  Not tested here: learning, quitting and arrivals; a budget weighted by value rather than items (one tier-3 drop
  counts as one tier-1 here); W; b between 0.25 and 0.5 across the grids; whether the slice's Mend makes anyone
  nearly deathless.

Reproducibility. Seeds are fixed; every run's full trajectory (every economy2 column, every day) is hashed with
SHA-1. --repro re-runs one cell (A, f_org .5, m_org .1, d0 .10, budget, seeds 0-4) in fresh processes and compares
each CSV row, byte for byte, with treadmill.csv. The SHA-1 of the pre-registration text above heads every log
section, so an edit to it shows; so does the SHA-1 of economy2.py.

Outputs (sim/out/, gitignored): one flushed line per finished run appended to treadmill.log (tail -f it),
treadmill.csv (one row per grid run, no timings, so a rerun is byte-identical), then the summary tables, printed
and appended to the log. At most 3 worker processes: the machine is shared.

  .venv/bin/python sim/treadmill.py            # 210 runs + 15 checks x 10,000 days, ~20 min on 3 workers
  .venv/bin/python sim/treadmill.py --repro    # re-run one cell (5 runs, ~30 s), compare with treadmill.csv byte for byte
  .venv/bin/python sim/treadmill.py --report   # the summary tables again from treadmill.csv, no run
"""
import argparse, csv, hashlib, io, sys, time, types
import multiprocessing as mp
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
SRC = HERE / "economy2.py"
sys.path.insert(0, str(HERE))
import economy2 as E2                              # the unpatched v1 model: the exactness checks and its constants, unchanged

# --- the patch: (name, anchor, replacement); every anchor must occur exactly once in economy2.py -----------------------------------------------
PATCHES = (
    ("P fields",
     "    seed: int = 0\n",
     "    seed: int = 0\n"
     "    f_org: float = 0.0                             # treadmill: the most skilled f_org of delvers are organised ...\n"
     "    m_org: float = 1.0                             # ... and their death chance is multiplied by m_org\n"
     "    fresh_rule: str = \"per-head\"                   # treadmill: per-head (economy2) | budget\n"
     "    b: float = 0.5                                 # treadmill budget: fresh drops a day <= b x items destroyed by death ...\n"
     "    W: int = 30                                    # ... on the previous W days / W\n"),
    ("organisation",
     "    pdb, td, lw = p.d0 * (1 - 0.6 * skill), np.array(p.tier_death), 0.25 + skill\n",
     "    pdb, td, lw = p.d0 * (1 - 0.6 * skill), np.array(p.tier_death), 0.25 + skill\n"
     "    tm_org = np.argsort(np.argsort(-skill, kind=\"stable\"), kind=\"stable\") < int(round(p.f_org * N))   # treadmill: the top f_org by skill\n"
     "    if tm_org.any(): pdb = np.where(tm_org, pdb * p.m_org, pdb)\n"
     "    tm_bot = np.argsort(np.argsort(skill, kind=\"stable\"), kind=\"stable\") < N // 3; tm_dn = np.zeros(N, np.int64)   # bottom third by skill; deaths per delver, last quarter\n"
     "    tm_unit, tm_bb, tm_credit = p.W * 10_000, int(round(p.b * 10_000)), 0   # budget credit in units of 1 / (W x 10,000) item: exact\n"),
    ("records",
     "    R = {k: np.zeros(p.days) for k in COLS}\n",
     "    R = {k: np.zeros(p.days) for k in COLS}\n"
     "    R |= {k: np.zeros(p.days) for k in (\"wag_v\", \"des_v\", \"fresh_want\")}   # treadmill: value wagered / destroyed by death (mint-equivalent, units); would-be fresh drops\n"),
    ("deaths",
     "        died = armed & (rd < pdb * td[eq]); rec = died & (rs < p.s)\n",
     "        died = armed & (rd < pdb * td[eq]); rec = died & (rs < p.s)\n"
     "        tm_mq = np.array(meq, np.int64); R[\"wag_v\"][day] = tm_mq[eq[armed]].sum(); R[\"des_v\"][day] = tm_mq[eq[died & ~rec]].sum()\n"
     "        if day >= lq0: tm_dn += died\n"),
    ("fresh drops",
     "        fr = np.flatnonzero(surv & ~got & (r2 < p.q_fresh)); vault[fr, 1 + (r3[fr] > fw[0]) + (r3[fr] > fw[1])] += 1\n",
     "        fr = np.flatnonzero(surv & ~got & (r2 < p.q_fresh)); R[\"fresh_want\"][day] = len(fr)\n"
     "        if p.fresh_rule == \"budget\":                # treadmill: grant at most floor(credit) of economy2's draws, lowest r2 first\n"
     "            tm_credit = tm_credit % tm_unit + tm_bb * int(R[\"destroyed\"][max(0, day - p.W):day].sum())\n"
     "            fr = fr[np.argsort(r2[fr], kind=\"stable\")[:min(len(fr), tm_credit // tm_unit)]]\n"
     "        else: assert p.fresh_rule == \"per-head\", p.fresh_rule\n"
     "        vault[fr, 1 + (r3[fr] > fw[0]) + (r3[fr] > fw[1])] += 1\n"),
    ("outputs",
     "    return R, x\n",
     "    tm_r = lambda m_: float(tm_dn[m_].sum() / ran_lq[m_].sum()) if ran_lq[m_].sum() else float(\"nan\")\n"
     "    tm_n = max(int(tm_dn.sum()), 1)\n"
     "    x |= dict(n_org=int(tm_org.sum()), dpr_org=tm_r(tm_org), dpr_unorg=tm_r(~tm_org), dpr_bot=tm_r(tm_bot),\n"
     "              org_share=float(tm_dn[tm_org].sum() / tm_n), bot_share=float(tm_dn[tm_bot].sum() / tm_n), deaths_lq=int(tm_dn.sum()))\n"
     "    return R, x\n"),
)
TM_X = ("n_org", "dpr_org", "dpr_unorg", "dpr_bot", "org_share", "bot_share", "deaths_lq")   # what the patch adds to run()'s x

def load():
    src = SRC.read_text()
    for name, old, new in PATCHES:
        n = src.count(old)
        assert n == 1, f"treadmill patch '{name}': anchor found {n} times in {SRC}, expected exactly 1 - economy2 changed; re-anchor before trusting any result"
        src = src.replace(old, new)
    for must in ("token ledger broken", "item ledger broken", "fresh = len(fr)"):
        assert src.count(must) == 1, f"economy2's check '{must}' is missing from the patched source"
    mod = types.ModuleType("economy2_treadmill"); mod.__file__ = str(SRC); sys.modules[mod.__name__] = mod
    exec(compile(src, f"{SRC} [treadmill patch]", "exec"), mod.__dict__)
    return mod

T = load()                                          # the patched model
U, OUT, COLS = E2.U, E2.OUT, E2.COLS
SEEDS, DAYS, WORKERS, CHECK_DAYS, S0 = tuple(range(5)), 10_000, 3, 3_000, 0.33
SINK = 0.5                                          # (c) the sink holds: mint burn >= SINK x the fix-free reference, every seed
COST_RUNS, COST_PO = 0.95, 0.05                     # (c) cost acceptable: runs >= 95 % of per-head, priced-out <= per-head + 5 points
ORG = ((0.0, 1.0),) + tuple((f, m) for f in (0.25, 0.5, 0.75) for m in (0.1, 0.3))
D_A, D_B = (0.10, 0.20), (0.05, 0.06, 0.07, 0.08, 0.09)
B0, W0, B_C = 0.5, 30, (0.25, 1.0)
C_CELLS = ((0.5, 0.1, 0.10), (0.0, 1.0, 0.05))
REPRO = dict(grid="A", f_org=0.5, m_org=0.1, d0=0.10, rule="budget")
SEC_PER_RUN = 17.0                                  # one 10,000-day run on one of 3 workers (measured 2026-10-03); the start-up estimate only

def prereg_sha():
    d = __doc__; return hashlib.sha1(d[d.index("PRE-REGISTRATION -"):d.index("END OF PRE-REGISTRATION")].encode()).hexdigest()[:12]
def src_sha(): return hashlib.sha1(SRC.read_bytes()).hexdigest()[:12]
def sha1(R): return hashlib.sha1(np.stack([R[k] for k in COLS]).tobytes()).hexdigest()
def xhash(x): return hashlib.sha1(repr(sorted((k, v) for k, v in x.items() if k not in TM_X)).encode()).hexdigest()[:12]

def jobs(days):
    js, cfg = [], lambda f, m, d0, rule, b, sd: dict(days=days, seed=sd, s=S0, d0=d0, f_org=f, m_org=m, rule=rule, b=b if rule == "budget" else 0.0, W=W0 if rule == "budget" else 0)
    js += [("A", cfg(f, m, d0, rule, B0, sd)) for d0 in D_A for f, m in ORG for rule in ("per-head", "budget") for sd in SEEDS]
    js += [("B", cfg(0.0, 1.0, d0, rule, B0, sd)) for d0 in D_B for rule in ("per-head", "budget") for sd in SEEDS]
    js += [("C", cfg(f, m, d0, "budget", b, sd)) for f, m, d0 in C_CELLS for b in B_C for sd in SEEDS]
    return [(i, g, c) for i, (g, c) in enumerate(js, 1)]

def checks(days):
    cs = [("ref", dict(days=days, s=S0, d0=d0, seed=sd), {}) for d0 in D_A for sd in SEEDS]      # unpatched twin of each A f_org 0 per-head run
    base = lambda **kw: dict(days=CHECK_DAYS) | kw
    cs += [("pair", base(s=0.0, d0=0.05, seed=7), {}), ("pair", base(s=0.66, d0=0.20, alloc="index", seed=3), {}),
           ("pair", base(s=0.33, d0=0.10, fee=0.10, mint_scale=2.0, repair_cost=90.0, seed=11), {}),
           ("pair", base(s=0.33, d0=0.10, shock=2.0, shock_at=1500, alloc="uniform", seed=5), {}),
           ("pair", base(s=0.33, d0=0.10, seed=2), dict(f_org=0.5, m_org=1.0))]
    return [(-i, "chk", c) for i, c in enumerate(cs, 1)]

def record(idx, grid, c, p, R, x):
    r = T.summarize(p, R, x); a = p.days * 3 // 4; n = p.days - a; q = lambda k: R[k][a:]
    meq1 = (int(round(p.mint_cost[1] * p.mint_scale * U)) + int(round(p.mint_eth[1] * p.token_per_eth * U))) / U
    wag, des, want, got = q("wag_v").sum(), q("des_v").sum(), q("fresh_want").sum(), q("fresh").sum()
    nan = float("nan")
    return dict(idx=idx, grid=grid) | c | dict(
        deaths_run=r["deaths_d"] / r["runs_d"] if r["runs_d"] else nan, deaths_run_org=x["dpr_org"], deaths_run_unorg=x["dpr_unorg"], deaths_run_bot3=x["dpr_bot"],
        bot3_death_share=x["bot_share"], org_death_share=x["org_share"], vdes_vwag=float(des / wag) if wag else nan,
        dd_d=float(q("destroyed").mean()), fresh_want_d=float(q("fresh_want").mean()), fresh_cut=float(1 - got / want) if want else nan,
        meq1=meq1, p1_rel=r["p1"] / meq1, treasury_eth_d=float(R["treasury"][-1] - R["treasury"][a - 1]) / n) | r | dict(xhash=xhash(x), sha1=sha1(R), fp=E2.fp(R))

def one(job):
    idx, grid, c = job; t0 = time.time()
    if grid == "chk":
        kind, kw, extra = c
        Ru, xu = E2.run(E2.P(**kw))                                             # unpatched economy2
        out = dict(kind=kind, kw=kw, extra=extra, sha1_u=sha1(Ru), fp_u=E2.fp(Ru), x_u=xhash(xu))
        if kind == "pair":
            Rp, xp = T.run(T.P(**kw, **extra)); out |= dict(sha1_p=sha1(Rp), fp_p=E2.fp(Rp), x_p=xhash(xp))
        return idx, grid, out, time.time() - t0
    kw = dict(days=c["days"], seed=c["seed"], s=c["s"], d0=c["d0"], f_org=c["f_org"], m_org=c["m_org"], fresh_rule=c["rule"]) | (dict(b=c["b"], W=c["W"]) if c["rule"] == "budget" else {})
    p = T.P(**kw); R, x = T.run(p)                                              # run() asserts the token and item ledgers every day
    return idx, grid, record(idx, grid, c, p, R, x), time.time() - t0

def logline(k, n, r, dt, el, eta):
    rule = f"budget b={r['b']:.2f} W={r['W']}" if r["rule"] == "budget" else "per-head         "
    return (f"[{k:3d}/{n}] #{r['idx']:<3d} {r['grid']} f_org={r['f_org']:.2f} m_org={r['m_org']:.1f} d0={r['d0']:.2f} {rule} seed={r['seed']}"
            f" | {dt:5.1f}s t+{el:5.0f}s eta {eta:5.0f}s | deaths/run {r['deaths_run']:.4f} (org {r['deaths_run_org']:.4f} unorg {r['deaths_run_unorg']:.4f}) bot3 {r['bot3_death_share']:4.0%}"
            f" vd/vw {r['vdes_vwag']:.4f} | runs/d {r['runs_d']:5.1f} priced-out {r['priced_out']:5.1%} | fresh/d {r['fresh_d']:4.2f} (want {r['fresh_want_d']:4.2f})"
            f" destroyed/d {r['dd_d']:5.2f} scrapped/d {r['broke_d']:4.2f} | mints/d {r['minted_d']:5.2f} mint_ok {r['mint_ok']:.2f} p1 {r['p1']:4.0f}/{r['meq1']:.0f}"
            f" | burn/d {r['burn_d']:5.0f} (mint {r['burn_mint_d']:4.0f} repair {r['burn_repair_d']:4.0f} fee {r['burn_fee_d']:3.0f}) treasury {r['treasury_eth_d']:.5f} ETH/d"
            f" | merch pnl/d {r['m_pnl_d']:+6.1f} | slope/yr {r['slope_yr']:+.4f} | {r['sha1'][:12]}")

def chkline(k, n, c, dt):
    if c["kind"] == "ref": return f"[{k:3d}/{n}] check: unpatched economy2 {c['kw']} | {dt:5.1f}s | fp {c['fp_u']} sha1 {c['sha1_u'][:12]} x {c['x_u']}"
    same = c["sha1_u"] == c["sha1_p"] and c["fp_u"] == c["fp_p"] and c["x_u"] == c["x_p"]
    return f"[{k:3d}/{n}] check: patched {c['extra'] or '(off)'} vs unpatched economy2 {c['kw']} | {dt:5.1f}s | fp {c['fp_p']} vs {c['fp_u']} | {'IDENTICAL' if same else 'DIFFERENT'}"

def opener(mode):
    log = open(OUT / "treadmill.log", "a")
    def say(x=""): print(x, flush=True); log.write(x + "\n"); log.flush()
    say(f"\n=== {datetime.now(timezone.utc).isoformat(timespec='seconds')} treadmill.py {mode} | pre-registration sha1 {prereg_sha()} | economy2.py sha1 {src_sha()}, {len(PATCHES)} patches, every anchor unique ===")
    return log, say

def scan(days, workers):
    js, cs = jobs(days), checks(days); allj = cs + js; n = len(allj)
    log, say = opener(f"scan: {len(js)} grid runs (A {sum(j[1] == 'A' for j in js)}, B {sum(j[1] == 'B' for j in js)}, C {sum(j[1] == 'C' for j in js)}) + {len(cs)} exactness checks,"
                      f" {days} days each (off-grid checks {CHECK_DAYS}), {workers} workers; estimate ~{(len(js) + 10 + 5 * 2 * CHECK_DAYS / days) * SEC_PER_RUN / workers / 60:.0f} min")
    t0, R, C, busy = time.time(), {}, [], 0.0
    with mp.Pool(workers) as pool:
        for k, (idx, grid, r, dt) in enumerate(pool.imap_unordered(one, allj), 1):
            busy += dt; el = time.time() - t0
            if grid == "chk": C.append(r); say(chkline(k, n, r, dt))
            else: R[idx] = r; say(logline(k, n, r, dt, el, el / k * (n - k)))
    wall = time.time() - t0
    say(f"all {n} runs finished: {wall:.0f} s wall, {busy:.0f} s of run time summed; token and item ledgers asserted exact on every day of every run (economy2.run, patched and unpatched)")
    rows = [R[i] for i in sorted(R)]
    with open(OUT / "treadmill.csv", "w", newline="") as fh: w = csv.DictWriter(fh, rows[0].keys()); w.writeheader(); w.writerows(rows)
    report(rows, C, say)
    say(f"done: {wall:.0f} s wall; wrote {OUT / 'treadmill.csv'}, {OUT / 'treadmill.log'}")
    log.close()

# --- the report -----------------------------------------------------------------------------------------------------------------------------
def G(rows, **kw): return [r for r in rows if all(r[k] == v for k, v in kw.items())]
def st(rs, k): return np.array([r[k] for r in rs], float)
def mn(rs, k):
    v = st(rs, k) if rs else np.array([]); v = v[~np.isnan(v)]
    return float(v.mean()) if len(v) else float("nan")

def report(rows, C, say):
    H = prereg_sha()
    ref = {d0: mn(G(rows, grid="A", f_org=0.0, d0=d0, rule="per-head"), "burn_mint_d") for d0 in D_A}
    def judge(rs, design):
        v = E2.verdict(rs); sink = all(r["burn_mint_d"] >= SINK * ref[design] for r in rs)
        return dict(verdict=v, sink=sink, ok=v != "no" and sink, mo=min(r["mint_ok"] for r in rs), sl=max(abs(r["slope_yr"]) for r in rs),
                    mb=min(r["burn_mint_d"] for r in rs), floor=SINK * ref[design])
    hdr = (f"{'deaths/run':>10} {'org':>6} {'unorg':>6} {'bot3':>4} {'vd/vw':>6} | {'runs/d':>6} {'p-out':>5} | {'fresh':>5} {'want':>5} {'destr':>5} {'scrap':>5} | {'mint/d':>6}"
           f" {'mint_ok [min]':>13} | {'p1':>4} {'/meq':>4} | {'burn/d':>6} {'mint':>5} {'rep':>5} {'fee':>4} | {'ETH/d':>7} | {'pnl/d':>6} | {'slope/yr [max]':>15} | verdict  sink PASS")
    def line(rs, j):
        m = lambda k: mn(rs, k)
        return (f"{m('deaths_run'):10.4f} {m('deaths_run_org'):6.4f} {m('deaths_run_unorg'):6.4f} {m('bot3_death_share'):4.0%} {m('vdes_vwag'):6.4f} | {m('runs_d'):6.1f} {m('priced_out'):5.1%}"
                f" | {m('fresh_d'):5.2f} {m('fresh_want_d'):5.2f} {m('dd_d'):5.2f} {m('broke_d'):5.2f} | {m('minted_d'):6.2f} {m('mint_ok'):6.2f} [{st(rs, 'mint_ok').min():.2f}]"
                f" | {m('p1'):4.0f} {m('p1_rel'):4.0%} | {m('burn_d'):6.0f} {m('burn_mint_d'):5.0f} {m('burn_repair_d'):5.0f} {m('burn_fee_d'):4.0f} | {m('treasury_eth_d'):7.5f}"
                f" | {m('m_pnl_d'):+6.1f} | {m('slope_yr'):+7.4f} [{np.abs(st(rs, 'slope_yr')).max():.4f}] | {j['verdict']:>7} {'holds' if j['sink'] else 'FAILS':>5} {'PASS' if j['ok'] else 'fail':>4}")
    J = {}
    rl = lambda r: "per-head" if r == "per-head" else "budget"
    # (A) -------------------------------------------------------------------------------------------------------------------------------------
    say(f"\n(A) organisation [prereg {H}]: the most skilled f_org of delvers die m_org as often; s = 0.33, 10,000 days, last quarter, mean over seeds 0-4 [worst seed]."
        f" Budget = b {B0}, W {W0}. Sink holds iff mint burn/day >= {SINK} x the per-head f_org 0 cell at the same d0, every seed. Columns: deaths per run (all, organised, unorganised),"
        f" bottom third's share of deaths, value destroyed by death / value wagered (mint-equivalent); runs/d, priced-out; fresh drops/d granted, would-be; items destroyed by death/d,"
        f" scrapped/d; mints/d, mint_ok; tier-1 price, token, and / mint-equivalent; burn/d total, mint, repair, fee (token); treasury ETH/d; merchant P&L token/d; supply slope")
    for d0 in D_A:
        say(f"\n  d0 = {d0:.2f}: fix-free reference mint burn {ref[d0]:.0f} token/day -> the sink holds at >= {SINK * ref[d0]:.0f} on every seed")
        say(f"  {'f_org':>5} {'m_org':>5} {'rule':>8} | " + hdr)
        for f, m in ORG:
            for rule in ("per-head", "budget"):
                rs = G(rows, grid="A", f_org=f, m_org=m, d0=d0, rule=rule); j = J[("A", f, m, d0, rule, B0 if rule == "budget" else 0.0)] = judge(rs, d0)
                say(f"  {f:5.2f} {m if f else float('nan'):5.1f} {rule:>8} | " + line(rs, j))
    # (B) -------------------------------------------------------------------------------------------------------------------------------------
    say(f"\n(B) uniform mastery [prereg {H}]: f_org 0, d0 lowered for everyone; the sink is judged against the d0 0.10 reference ({ref[0.10]:.0f} -> >= {SINK * ref[0.10]:.0f} token/day); d0 0.10 rows are A's")
    say(f"  {'d0':>5} {'rule':>8} | " + hdr)
    for d0 in (0.10,) + tuple(reversed(D_B)):
        for rule in ("per-head", "budget"):
            rs = G(rows, grid="A" if d0 == 0.10 else "B", f_org=0.0, d0=d0, rule=rule); j = judge(rs, 0.10)
            if d0 != 0.10: J[("B", 0.0, 1.0, d0, rule, B0 if rule == "budget" else 0.0)] = j      # d0 0.10 is judged in A
            say(f"  {d0:5.2f} {rule:>8} | " + line(rs, j))
    # (C) -------------------------------------------------------------------------------------------------------------------------------------
    say(f"\n(C) budget sensitivity [prereg {H}]: b at W {W0}; per-head and b {B0} rows are A's and B's; the sink is judged against the d0 0.10 reference")
    say(f"  {'cell':>26} {'rule':>12} | " + hdr)
    for f, m, d0 in C_CELLS:
        lab = f"f_org {f:.2f} m_org {m:.1f} d0 {d0:.2f}" if f else f"f_org 0 d0 {d0:.2f}"
        src = "A" if d0 == 0.10 else "B"
        for rule, b in (("per-head", 0.0), ("budget", 0.25), ("budget", B0), ("budget", 1.0)):
            g = "C" if b in B_C else src
            rs = G(rows, grid=g, f_org=f, m_org=m, d0=d0, rule=rule, b=b); j = judge(rs, 0.10)
            if b in B_C: J[("C", f, m, d0, rule, b)] = j                                                 # per-head and b 0.5 are judged in A and B
            say(f"  {lab:>26} {rule + (f' b={b:.2f}' if rule == 'budget' else ''):>12} | " + line(rs, j))
    # (D) judgements --------------------------------------------------------------------------------------------------------------------------
    say(f"\n(D) judgements [prereg {H}], rules as registered")
    for d0 in D_A:
        for m in (0.1, 0.3):
            fails = [f for f in (0.25, 0.5, 0.75) if not J[("A", f, m, d0, "per-head", 0.0)]["ok"]]
            fx = {f: J[("A", f, m, d0, "budget", B0)] for f in (0.25, 0.5, 0.75)}
            say(f"  A d0 {d0:.2f} m_org {m:.1f}: per-head BREAKS from f_org {min(fails) if fails else 'never (0.75 passes)'}"
                + (f" (fails at {', '.join(f'{f:g}' for f in fails)})" if fails else "")
                + " | budget b 0.5: " + ", ".join(f"f_org {f:g} {'PASS' if fx[f]['ok'] else 'fail'} ({fx[f]['verdict']}, sink {'holds' if fx[f]['sink'] else 'FAILS'})" for f in (0.25, 0.5, 0.75)))
    bf = [d0 for d0 in D_B if not J[("B", 0.0, 1.0, d0, "per-head", 0.0)]["ok"]]
    say(f"  B per-head: BREAKS at d0 <= {max(bf) if bf else 'none'} (fails at {', '.join(f'{d:.2f}' for d in bf) or 'none'}); budget b 0.5: "
        + ", ".join(f"d0 {d0:.2f} {'PASS' if J[('B', 0.0, 1.0, d0, 'budget', B0)]['ok'] else 'fail'}" for d0 in D_B))
    fixed = [(k, J[k[:4] + ("budget", B0)]["ok"]) for k in J if k[4] == "per-head" and not J[k]["ok"] and k[0] in "AB"]
    say(f"  FIXES: the b 0.5 budget passes {sum(ok for _, ok in fixed)} of the {len(fixed)} A/B cells where per-head fails"
        + (f"; still failing: {', '.join(f'{k[0]} f_org {k[1]:g} m_org {k[2]:g} d0 {k[3]:.2f}' for k, ok in fixed if not ok)}" if any(not ok for _, ok in fixed) else ""))
    def why(k): return (f"{k[0]} f_org {k[1]:g} m_org {k[2]:g} d0 {k[3]:.2f} b {k[5]:g} ({J[k]['verdict']}: worst seed mint_ok {J[k]['mo']:.2f}, |slope| {J[k]['sl']:.2%}/yr;"
                        f" sink {'holds' if J[k]['sink'] else 'FAILS'}: worst seed mint burn {J[k]['mb']:.0f} vs >= {J[k]['floor']:.0f})")
    bfail = [why(k) for k in J if k[4] == "budget" and not J[k]["ok"]]
    say(f"  budget cells failing PASS (any b): {'; '.join(bfail) or 'none'}")
    say(f"\n  COST to honest players at f_org 0 (b 0.5 vs per-head; acceptable iff runs >= {COST_RUNS:.0%} of per-head and priced-out <= per-head + {COST_PO * 100:.0f} points):")
    say(f"  {'d0':>5} | {'runs/d ph -> b':>16} {'ratio':>6} | {'priced-out ph -> b':>19} | {'fresh/d ph -> b':>16} | {'mints/d':>12} | {'p1 ph -> b (/meq)':>20} | {'pnl/d':>13} | {'deaths/run':>15} | cost")
    cost_ok = {}
    for d0 in tuple(reversed(D_B)) + D_A:
        g = "A" if d0 in D_A else "B"; ph, bu = G(rows, grid=g, f_org=0.0, d0=d0, rule="per-head"), G(rows, grid=g, f_org=0.0, d0=d0, rule="budget")
        ra = mn(bu, "runs_d") / mn(ph, "runs_d"); dpo = mn(bu, "priced_out") - mn(ph, "priced_out"); ok = ra >= COST_RUNS and dpo <= COST_PO; cost_ok[d0] = ok
        say(f"  {d0:5.2f} | {mn(ph, 'runs_d'):6.1f} -> {mn(bu, 'runs_d'):6.1f} {ra - 1:+6.1%} | {mn(ph, 'priced_out'):6.1%} -> {mn(bu, 'priced_out'):6.1%} ({dpo * 100:+.1f})"
            f" | {mn(ph, 'fresh_d'):5.2f} -> {mn(bu, 'fresh_d'):5.2f} {mn(bu, 'fresh_d') / mn(ph, 'fresh_d') - 1:+4.0%} | {mn(ph, 'minted_d'):5.2f} -> {mn(bu, 'minted_d'):4.2f}"
            f" | {mn(ph, 'p1'):4.0f} -> {mn(bu, 'p1'):4.0f} ({mn(ph, 'p1_rel'):3.0%}->{mn(bu, 'p1_rel'):3.0%}) | {mn(ph, 'm_pnl_d'):+5.1f} -> {mn(bu, 'm_pnl_d'):+5.1f}"
            f" | {mn(ph, 'deaths_run'):.4f}->{mn(bu, 'deaths_run'):.4f} | {'acceptable' if ok else 'NOT acceptable'}")
    say(f"  unorganised delvers' deaths per run, per-head -> budget, in the organised A cells: "
        + "; ".join(f"d0 {d0:.2f} f {f:g} m {m:g}: {mn(G(rows, grid='A', f_org=f, m_org=m, d0=d0, rule='per-head'), 'deaths_run_unorg'):.4f}->{mn(G(rows, grid='A', f_org=f, m_org=m, d0=d0, rule='budget'), 'deaths_run_unorg'):.4f}"
                    for d0 in D_A for f, m in ORG[1:]))
    passes = {b: all(v["ok"] for k, v in J.items() if k[4] == "budget" and k[5] == b) for b in (0.25, B0, 1.0)}
    cost = {0.25: None, B0: all(cost_ok.values()), 1.0: None}
    rec = [b for b in (1.0, B0, 0.25) if passes[b] and cost[b] is not False]
    say(f"\n  RECOMMENDED b (largest b passing in every cell where it ran, cost acceptable wherever measured): "
        + ", ".join(f"b {b:g}: passes {sum(1 for k in J if k[4] == 'budget' and k[5] == b and J[k]['ok'])} of {sum(1 for k in J if k[4] == 'budget' and k[5] == b)} cells, cost {'acceptable' if cost[b] else 'not measured' if cost[b] is None else 'NOT acceptable'}" for b in (0.25, B0, 1.0))
        + f" -> {('b = %g' % rec[0]) if rec else 'none'}; W = {W0} is the only window run (not tested)")
    # (E) the probes ---------------------------------------------------------------------------------------------------------------------------
    say(f"\n(E) the lost probes' claims [prereg {H}], judged on seeds 0-4 (seeds 0-2 shown for comparison): share within 10 points, level within 25 %, change within 5 points; 'none' = no seed above 0.05")
    A_ = lambda f, m, d0, rule: G(rows, grid="A", f_org=f, m_org=m, d0=d0, rule=rule)
    B_ = lambda d0, rule: G(rows, grid="A" if d0 == 0.10 else "B", f_org=0.0, d0=d0, rule=rule)
    s02 = lambda rs: [r for r in rs if r["seed"] <= 2]
    def claim(lab, rs, k, want, kind):
        got, g3 = mn(rs, k), mn(s02(rs), k)
        ok = abs(got - want) <= 0.10 if kind == "share" else abs(got / want - 1) <= 0.25 if kind == "level" else None
        say(f"  {lab:<78} claim {want:8.3g} | measured {got:8.4g} (seeds 0-2 {g3:8.4g}) | {'HOLDS' if ok else 'does not hold'}")
    claim("P1 A per-head d0 .10 f_org 0: mint_ok", A_(0.0, 1.0, 0.10, "per-head"), "mint_ok", 0.75, "share")
    claim("P1 A per-head d0 .10 f_org .25 m_org .1: mint_ok", A_(0.25, 0.1, 0.10, "per-head"), "mint_ok", 0.39, "share")
    claim("P2 A per-head d0 .10 f_org .5 m_org .1: mint_ok", A_(0.5, 0.1, 0.10, "per-head"), "mint_ok", 0.02, "share")
    claim("P3 same cell: tier-1 trade price, token", A_(0.5, 0.1, 0.10, "per-head"), "p1", 60.0, "level")
    claim("P3 same cell: mint burn, token/day", A_(0.5, 0.1, 0.10, "per-head"), "burn_mint_d", 6.0, "level")
    claim("P3 A per-head d0 .10 f_org 0: mint burn, token/day", A_(0.0, 1.0, 0.10, "per-head"), "burn_mint_d", 339.0, "level")
    claim("P4 A per-head d0 .20 f_org .5 m_org .1: mint_ok", A_(0.5, 0.1, 0.20, "per-head"), "mint_ok", 0.79, "share")
    claim("P4 same cell: bottom third's share of deaths", A_(0.5, 0.1, 0.20, "per-head"), "bot3_death_share", 0.63, "share")
    claim("P5 A budget d0 .10 f_org .25 m_org .1: mint_ok", A_(0.25, 0.1, 0.10, "budget"), "mint_ok", 0.83, "share")
    claim("P5 A budget d0 .10 f_org .5 m_org .1: mint_ok", A_(0.5, 0.1, 0.10, "budget"), "mint_ok", 0.75, "share")
    claim("P6 A per-head d0 .10 f_org 0: fresh drops/day", A_(0.0, 1.0, 0.10, "per-head"), "fresh_d", 5.0, "level")
    claim("P6 A budget d0 .10 f_org 0: fresh drops/day", A_(0.0, 1.0, 0.10, "budget"), "fresh_d", 3.9, "level")
    rc = mn(A_(0.0, 1.0, 0.10, "budget"), "runs_d") / mn(A_(0.0, 1.0, 0.10, "per-head"), "runs_d") - 1
    say(f"  {'P6 A d0 .10 f_org 0: runs, budget vs per-head':<78} claim   -3.0 % | measured {rc:+8.2%} | {'HOLDS' if abs(rc + 0.03) <= 0.05 else 'does not hold'}")
    claim("P7 B per-head d0 .10: mint_ok", B_(0.10, "per-head"), "mint_ok", 0.75, "share")
    claim("P7 B per-head d0 .08: mint_ok", B_(0.08, "per-head"), "mint_ok", 0.39, "share")
    r6 = B_(0.06, "per-head"); nn = all(r["mint_ok"] <= 0.05 for r in r6)
    say(f"  {'P7 B per-head d0 .06: mint_ok none':<78} claim     none | measured {mn(r6, 'mint_ok'):8.4g} [max {st(r6, 'mint_ok').max():.3f}] | {'HOLDS' if nn else 'does not hold'}")
    for d0 in (0.10,) + tuple(reversed(D_B)): claim(f"P8 B budget d0 {d0:.2f}: mint_ok (claim 0.75-0.77: 0.76 +/- 0.10 covers both ends)", B_(d0, "budget"), "mint_ok", 0.76, "share")
    v8 = E2.verdict(B_(0.08, "per-head"))
    say(f"  {'P9 B per-head d0 .08 (a fifth fewer deaths): VERDICT':<78} claim       no | measured {v8:>8} | {'HOLDS' if v8 == 'no' else 'does not hold'}")
    # (F) checks -----------------------------------------------------------------------------------------------------------------------------
    say(f"\n(F) checks [prereg {H}]")
    refs = [c for c in C if c["kind"] == "ref"]; ok_ref = 0
    for c in refs:
        r = G(rows, grid="A", f_org=0.0, d0=c["kw"]["d0"], seed=c["kw"]["seed"], rule="per-head")[0]
        ok_ref += r["sha1"] == c["sha1_u"] and r["fp"] == c["fp_u"] and r["xhash"] == c["x_u"]
    if not C: say("  exactness checks are not re-run by --report: see the scan's (F) section above in this log"); return
    prs = [c for c in C if c["kind"] == "pair"]; ok_pr = sum(c["sha1_u"] == c["sha1_p"] and c["fp_u"] == c["fp_p"] and c["x_u"] == c["x_p"] for c in prs)
    say(f"  both additions off = economy2: {ok_ref}/{len(refs)} A reference runs (f_org 0, per-head, d0 .10/.20, seeds 0-4, 10,000 days) match an unpatched economy2.run in economy2.fp,"
        f" the full SHA-1 of every daily column and every field run() returns; {ok_pr}/{len(prs)} off-grid pairs ({CHECK_DAYS} days, incl. f_org 0.5 with m_org 1.0) likewise")
    say(f"  {len(PATCHES)} patches, each anchor found exactly once in economy2.py (sha1 {src_sha()}); token and item ledgers asserted exact every day of every run")

def reload():                                      # --report: the summary again, from treadmill.csv (the checks are not re-run)
    STR = ("grid", "rule", "xhash", "sha1", "fp")
    rows = [{k: (v if k in STR else float(v)) for k, v in r.items()} for r in csv.DictReader(open(OUT / "treadmill.csv", newline=""))]
    log, say = opener(f"--report: the summary tables again from {OUT / 'treadmill.csv'} ({len(rows)} rows), no run")
    report(rows, [], say); log.close()

def repro(days, workers):
    path = OUT / "treadmill.csv"
    with open(path, newline="") as fh: lines = fh.read().split("\r\n")
    old = {int(next(csv.reader([ln]))[0]): ln for ln in lines[1:] if ln}; header = next(csv.reader([lines[0]]))
    js = [j for j in jobs(days) if all(j[2].get(k, j[1]) == v for k, v in REPRO.items() if k != "grid") and j[1] == REPRO["grid"]]
    log, say = opener(f"--repro: re-run {len(js)} runs of one cell ({', '.join(f'{k} {v}' for k, v in REPRO.items())}, b {B0}, W {W0}), {days} days, in fresh processes; compare with {path}")
    t0 = time.time()
    with mp.Pool(min(workers, len(js))) as pool: out = pool.map(one, js)
    same = 0
    for idx, grid, rec, dt in out:
        buf = io.StringIO(); csv.DictWriter(buf, header).writerow(rec); new = buf.getvalue().rstrip("\r\n"); ok = new == old.get(idx); same += ok
        say(f"  #{idx:<3d} seed={rec['seed']} {dt:5.1f}s | sha1 {rec['sha1'][:12]} | CSV row {'byte-identical' if ok else 'DIFFERENT'} ({len(new)} bytes)")
    say(f"--repro: {same}/{len(out)} rows byte-identical to {path}; {time.time() - t0:.0f} s wall")
    log.close()

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--workers", type=int, default=WORKERS); ap.add_argument("--days", type=int, default=DAYS); ap.add_argument("--repro", action="store_true")
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args(); OUT.mkdir(exist_ok=True)
    assert 1 <= a.workers <= 3, "at most 3 worker processes: the machine is shared"
    return reload() if a.report else repro(a.days, a.workers) if a.repro else scan(a.days, a.workers)

if __name__ == "__main__": main()
