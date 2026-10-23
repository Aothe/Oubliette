"""Run length (docs/dungeons.md E1, with E4 as its cross-check): what a longer dungeon run does to the v1 economy
(sim/economy2.py) - to the death band, to wear and repair, and to minting, the token's main sink.

The v1 model counts in runs: each day each delver runs with chance p_run (0.5), and death (d0), wear (durability_loss,
0.08 a run), fresh boss drops and the recycled-loot lottery all happen per run. Dungeon two (SPEC §2, docs/dungeons.md)
is about twice the slice's length. docs/dungeons.md argued that halving the runs a day at the same per-run danger halves
deaths and mints a day - the arithmetic of d0 0.05, which kills minting - so either per-run danger rises with length
("more at the door, more at the end": size as a tier) or the band is restated per hour of play and wear moves to per
stage; it asked for E1 before dungeon two is built. This file runs E1 as pre-registered there, and E4.

How. As sim/treadmill.py: this file reads sim/economy2.py from its own folder, applies text patches in memory - every
anchor asserted to occur exactly once, so a change to the model fails loudly here instead of silently moving a result -
and exec's the patched source as a module. economy2.py and treadmill.py are never edited. The patches are treadmill.py's
six, imported from it unchanged (treadmill.PATCHES), then one of this file's own:
  treadmill's six  with f_org 0 and the per-head fresh rule - their defaults, used throughout - they change no draw and
                   no decision; they record value wagered and value destroyed by death a day (at the mint-equivalent),
                   would-be fresh drops, and the deaths per run of the bottom third by skill.
  outputs          records the delvers' total ETH income a day and the largest per-run death chance any armed delver can
                   face in the run (d0 (1 - 0.6 skill) x the tier multiplier, maximised over delvers and tiers 1-3).
Everything E1 and E4 move - p_run, d0, durability_loss, N - is already a field of economy2's P, so the patched model only
adds records: it must equal economy2 bit for bit in every configuration, which is checked (h). economy2's daily token and
item ledger assertions stay in run() and hold on every day of every run.

PRE-REGISTRATION - written 2026-10-22 before any run of this file. Nothing between this line and END OF
PRE-REGISTRATION moves after a run; a badly chosen rule is reported, not retuned.
(a) What the grid stands for. p_run is run length: a delver who plays the same hours a day enters half as often when a
    run takes twice as long, so p_run 0.25 is a dungeon twice the slice's length and 0.125 four times; a model day is
    then a fixed amount of play, and "a day" below reads "per hour of play". Per-run danger: "unchanged" keeps d0 0.10
    (the band stays per run: a longer run is no deadlier); "exposure-neutral" sets d0 = 0.10 x 0.5 / p_run (0.20 at
    p_run 0.25, 0.40 at 0.125), so deaths a day would match the reference if runs a day fell exactly with p_run (the
    band per hour of play). Wear per run 0.08 (economy2's), 0.16, 0.32: 0.08 is wear per run; wear x 0.5 / p_run (0.16
    at p_run 0.25, 0.32 at 0.125) is wear per stage, i.e. per unit of play. The repair floor (0.25) discretises it: a
    repair falls due after ceil(0.75 / wear) runs - 10, 5 and 3 - so wear per stage matches the reference's wear per
    day exactly at p_run 0.25 (5 runs of 4 days, 20 days, as 10 runs of 2) but not at 0.125 (3 runs of 8 days: 24 days).
(b) Incomes. E_MED stays at economy2's calibration, computed by economy2's own rule from P's defaults - p_run 0.5, d0
    0.10, wear 0.08 - and is never re-evaluated per cell: run() reads the module constant E_MED (asserted equal to the
    unpatched module's and to e_median(P())), not e_median(p), so the reference budget is used in every cell and no
    patch is needed for it. The same choice operator_fee.py made for its fee: a longer run changes exposure and wear,
    never what a delver earns a day. Putting p_run, d0 or wear into the rule would change every delver's income with
    the dungeon. Consequence, stated now: fewer runs per head leave more budget per run.
(c) Grid. s = 0.33 throughout (economy2's 1/3, the v1 design point); 10,000 days; seeds 0-4; every other constant at
    P's default (N 600, M 8, fee 2 %, mint x1, repair 30 token, weighted lottery, sigma 1.2, H 30, 50,000 token/ETH, no
    shock); the last quarter (days 7,500-9,999) is judged.
    E1  p_run in {0.5, 0.25, 0.125} x danger in {unchanged, exposure-neutral} x wear in {0.08, 0.16, 0.32}. At p_run
        0.5 the two dangers are one configuration (d0 0.10) and are run once: 3 + 6 + 6 = 15 cells, 75 runs. The
        reference cell is p_run 0.5, d0 0.10, wear 0.08 - economy2's design point.
    E4  p_run 0.5 at N 300, d0 0.10, wear 0.08, seeds 0-4: 5 runs, against E1's p_run 0.25 / unchanged / wear 0.08 cell
        at N 600 - the same runner-days wanted a day (150) from twice the heads. M = 8 in both (P's default): the two
        worlds want the same runs a day, so the same market serves them. Incomes per head are the same, so the 600-head
        world has twice the income.
    80 runs. A seed fixes the population draw (economy2's g_pop stream depends on N and the seed only), so at N 600 every
    arm of a seed has the same 600 delvers - risk, skill, income - and arms are paired by seed.
(d) Death chance, and degenerate arms. economy2's per-run death chance for an armed delver i on tier t is pdb_i x
    tier_death[t] = d0 (1 - 0.6 skill_i) x {1.0, 0.8, 0.6} for tiers 1-3. tier_death[0] = 2.0 is the multiplier for a
    naked delver, and economy2 has no naked runs (only runners holding gear enter the death draw), so it never applies.
    The largest chance in the grid is therefore d0 = 0.40 itself (exposure-neutral at p_run 0.125, skill 0, tier 1),
    under 1: no arm needs clipping. Rule, fixed now: every run records the largest per-run death chance its delvers can
    face (pmax); a run with pmax > 1 is flagged degenerate - economy2's draw (uniform < chance) already clips at 1 - and
    its cell is reported with its realised deaths per run beside its verdict, not dropped. Predicted: none flagged.
    d0 0.40 (about 28 % of runs ending in death) is far outside anything the v1 model or the slice has measured; it is
    reported as the arithmetic of the exposure-neutral rule, not as a playable game.
(e) Rules, per cell (five seeds).
    VERDICT = economy2.verdict, thresholds unchanged: VIABLE iff on every seed mint_ok (share of last-quarter days with
      >= 1 mint) >= 0.5 and |total supply slope| <= 1 %/yr; ROBUST iff also mint_ok >= 0.9 on every seed.
    THE SINK HOLDS iff on every seed mint burn a day >= 0.5 x the reference cell's mean mint burn a day (treadmill.py's
      rule, against E1's reference cell).
    PASS = VERDICT in {viable, ROBUST} and the sink holds.
    Companion, reported and never a pass rule: mint_ok counts days, so where runs a day fall it falls by construction
    (population.py's caveat). mint_ok_w is the share of last-quarter windows of w = round(300 / (N x p_run)) days - the
    reference's runner-days wanted - with >= 1 mint: w = 1, 2, 4 at p_run 0.5, 0.25, 0.125 and 2 for E4. VERDICT_w is
    VERDICT with mint_ok_w in place of mint_ok.
(f) Hypotheses (docs/dungeons.md), tested as written.
    H1  Null check. Exposure-neutral danger with wear scaled by the same factor - (p_run 0.25, d0 0.20, wear 0.16) and
        (p_run 0.125, d0 0.40, wear 0.32) - leaves the daily flows within seed noise of the reference. Flows, each a day:
        deaths; value destroyed by death (the runs' value that dies); mints; fresh drops; burn - total, mint, repair,
        fee. Within seed noise iff the arm's five-seed mean lies inside the reference's five-seed [min, max]. H1 holds
        iff every flow is within noise in both cells; each flow is reported with its difference in per cent.
    H2  p_run 0.25 with unchanged danger and unchanged wear (d0 0.10, wear 0.08) fails the way d0 0.05 fails in v1:
        holds iff the cell's five-seed mean mint_ok < 0.5. Reported beside it: VERDICT, the strong form (minting dead,
        as at d0 0.05-0.06 in treadmill.py: mint_ok <= 0.05 on every seed), mint_ok_w, mint burn against the reference.
    H3  The same cell roughly halves repair burn: holds iff its mean repair burn a day is 0.4-0.6 x the reference's.
    The operator's choice (docs/dungeons.md decision 2, SPEC §4). "More at the door, more at the end" - a dearer entry
    and a richer payout per run, size as a tier - is not in this grid: it needs mint, repair or drop constants per
    dungeon, which E1 does not move. What the grid shows: (i) whether raising per-run danger restores minting - the
    exposure-neutral arm against the unchanged arm at each p_run and wear, by PASS, mint_ok and mint burn; (ii) what wear
    per stage does to repair burn - repair burn and runs a day across the wear arms, against the reference.
    E4  "Half the runs per head is not half the heads": holds iff the p_run 0.25 cell at N 600 and the p_run 0.5 cell at
        N 300 differ in runs a day or in mints a day, where differ = the first's five-seed mean lies outside the
        second's five-seed [min, max]. Reported: runs, priced-out, deaths, mints, mint_ok, burn split, tier-1 price,
        VERDICT, sink.
(g) Reported per run (sim/out/run_length.csv): runs a day; priced-out share; deaths per run (all; bottom third by skill)
    and a day; value wagered and value destroyed by death a day (token, at the mint-equivalent) and their ratio; value
    wagered per run; fresh drops a day; items destroyed by death, scrapped and repaired a day; mints a day, mint_ok,
    mint_ok_w; tier-1 trade price and its ratio to the mint-equivalent (220 token); burn by mint, repair and fee;
    treasury ETH a day; the share of the delvers' ETH income spent; merchant P&L; total supply slope; pmax.
(h) Checks, not results. With nothing switched on the patched model is economy2: the five reference runs (p_run 0.5, d0
    0.10, wear 0.08, N 600, seeds 0-4, 10,000 days) are re-run with unpatched economy2 and must match in economy2.fp, a
    full SHA-1 of every daily column and every field run() returns; so must three off-grid pairs (3,000 days) that move
    E1's parameters: p_run 0.125, d0 0.40, wear 0.32, seed 7; s 0, p_run 0.25, d0 0.20, wear 0.16, fee 10 %, index
    lottery, seed 3; s 0.66, N 300, p_run 0.25, d0 0.05, wear 0.32, token x2 on day 1,500, seed 11.
(i) Predictions, not tests. Fewer runs per head leave more budget per run, so at unchanged danger runs a day fall by less
    than p_run and the priced-out share falls; at exposure-neutral danger deaths come as often in calendar time as at
    the reference and priced-out stays near it. Unchanged danger (the band per run): deaths, items destroyed, fresh drops
    and mints a day all fall with runs, so minting is not dead in kind - per run the sink outruns fresh drops as before -
    but falls in count: mint_ok falls by construction, H2 holds in the weak form and not the strong one, and mint burn
    sits near the sink floor at p_run 0.25 and under it at 0.125. Exposure-neutral danger (the band per hour): deaths a
    day near the reference's while fresh drops - a per-run draw for each survivor - fall with runs, so more gear is
    destroyed than drops, mints a day rise above the reference and the cell passes; H1 therefore fails on fresh drops and
    mints, and at p_run 0.125 on repair burn too ((a): predicted 0.6-0.85 x). Wear per stage brings repair burn a day
    back to about the reference's at p_run 0.25; repair stays a near-free sink (v1 B), so wear moves burn, not runs. E4
    holds: the 600-head world runs and mints more than the 300-head one.
END OF PRE-REGISTRATION

Findings (scan, 2026-10-22; added after the run, below the pre-registration, which is unchanged - its SHA-1,
e6e7df195808, heads every log section). 80 runs + 8 checks, 223 s wall on 3 workers; 5/5 reference runs and 3/3 off-grid
pairs equal unpatched economy2 in fp, full SHA-1 and every field run() returns; --repro 5/5 rows byte-identical; --report
rebuilds the scan's tables exactly; both ledgers exact every day of every run; no arm degenerate (largest per-run death
chance 0.40, as predicted). Before the sweep the code was smoke-tested once at 400 days into a scratch folder (mechanics
only; nothing between the markers moved after it).
  The band per run (d0 0.10 at every length) makes a smaller economy, not a dead one. Every daily flow falls with runs:
  runs 182 -> 91 -> 45 a day (0.50 / 0.25 x), deaths 11.8 -> 5.9 -> 3.0, mints 2.84 -> 1.45 -> 0.73, mint burn 341 -> 174
  -> 88 token, total burn 773 -> 389 -> 195, treasury ETH 0.0057 -> 0.0029 -> 0.0015; per run nothing moves (deaths per
  run 0.065, value destroyed / wagered 0.038, tier 1 at 210 of 220, priced-out 39-40 %, t2/t3 24 % of runs). Minting is
  alive in kind: mint_ok_w 0.71-0.81 against the reference's 0.73-0.76; mint_ok falls (0.56-0.61, 0.39-0.44) by
  construction. The sink per day of play is what shrinks: at p_run 0.25 it holds by half a token on the worst seed (170.9
  against a floor of 170.4) and the verdict turns on one seed's supply slope (wear 0.08: seed 1 +1.06 %/yr, no; wear 0.16
  and 0.32: viable); at 0.125 it fails (mint burn 82-90, verdict no). Predicted wrong: no wealth effect - runs fall exactly
  with p_run and priced-out does not move, because the poor are priced out by the 30-day wallet cap, not by how often
  they run; the spare budget is not spent (share of ETH income spent 11.2 % -> 5.8 % -> 2.9 %).
  The band per hour (exposure-neutral d0 0.20 / 0.40) more than restores the sink. Deaths a day stay at the reference's
  (11.6 / 11.5 against 11.8), but fresh drops are a per-run reward for each survivor and fall with runs (5.0 -> 2.1 -> 0.8
  a day), so mints a day double / rise 2.4 x (5.6 / 6.9), mint burn 657-687 / 812-861, total burn +34 / +38 % at matched
  wear, treasury ETH x2.0 / x2.4; every such cell ROBUST (mint_ok 0.97-1.00). Value destroyed a day falls 24.5 / 35.5 %
  with deaths a day unchanged: t2/t3, supplied only by drops, fall from 24 % of runs to 11 % / 4.5 %, and value wagered
  per run from 427 to 313 / 260 token. Cost: 13.4 % / 27.2 % of runs end in death (the bottom third by skill 17.6 % /
  35.6 %), runs -4.5 % / -6.4 % and priced-out +2.8 / +3.9 points against the band per run at the same length.
  Hypotheses. H1 does not hold: deaths a day within noise (-1.7 / -2.6 %), every other flow outside - mints +98 / +142 %,
  fresh drops -58 / -84 %, value destroyed -24.5 / -35.5 %, burn +34 / +38 %, repair -12 / -42 %, fee -46 / -72 %. The null
  is not null because the drop table is per run (predicted for fresh drops and mints; value destroyed and fee burn not
  predicted; repair at p_run 0.125 is 0.58 x, just under the predicted 0.6-0.85). H2 does not hold: mint_ok 0.59 [0.56,
  0.61] at p_run 0.25 (the cell's verdict is no, on one seed's slope, not on minting); the weak form would hold at 0.125
  (0.42), the strong form (minting dead) holds nowhere. Fewer runs is not d0 0.05: d0 0.05 cuts deaths per run against the
  same fresh drops per run; fewer runs cut both together. H3 holds: repair burn 0.50 x (0.25 x at p_run 0.125).
  Wear moves repair burn and nothing else (mint burn is the same in every wear arm of a p_run and danger). At p_run 0.5,
  wear 0.16 / 0.32 burns 2.3 / 4.0 x the reference's repair for -2.2 / -5.8 % runs. Wear per stage brings repair burn to
  1.17 x the reference at p_run 0.25 (-1.1 % runs) and 1.05 x at 0.125 (-0.8 %) under the band per run; 0.88 x / 0.58 x
  under the band per hour (gear dies before it wears). It cannot rescue the band per run at p_run 0.125: total burn 493
  against 773, mint burn under the floor.
  E4 does not hold as registered: p_run 0.25 at N 600 and p_run 0.5 at N 300 match within seed noise in runs (90.8 /
  88.4 a day), priced-out, deaths and mints a day (1.45 / 1.49), burn (389 / 385) and the tier-1 price; they differ in
  what the bigger world leaves unspent (5.8 % of income against 11.6 %) and in decimals (deaths per run 0.0649 / 0.0658,
  fresh drops 2.49 / 2.41, fee burn 29 / 27). Predicted wrong: in this model half the runs per head is half the heads.
  Their verdicts (no / viable) and sinks (holds / fails, worst seed 167.6) differ on noise at the edge of both rules.
  Not tested here: "more at the door, more at the end" (a dearer entry and richer drops per run); a drop table per dungeon;
  players who play more or fewer hours when runs lengthen; real budgets (with the model's slack, cadence prices nobody
  out); whether 13-27 % deaths per run is fun; E2, E3.

Reproducibility. Seeds are fixed; every run's full trajectory (every economy2 column, every day) is hashed with SHA-1.
--repro re-runs one cell (E1, p_run 0.25, unchanged danger, wear 0.08, seeds 0-4) in fresh processes and compares each
CSV row, byte for byte, with run_length.csv. The SHA-1 of the pre-registration text heads every log section, so an edit
to it shows; so do the SHA-1s of economy2.py and treadmill.py.

Outputs (sim/out/, gitignored): one flushed line per finished run appended to run_length.log (tail -f it),
run_length.csv (one row per grid run, no timings, so a rerun is byte-identical), then the summary tables, printed and
appended to the log. At most 3 worker processes: the machine is shared.

  .venv/bin/python sim/run_length.py            # 80 runs + 8 checks x 10,000 days (checks 3,000), 3 workers
  .venv/bin/python sim/run_length.py --repro    # re-run one cell (5 runs), compare with run_length.csv byte for byte
  .venv/bin/python sim/run_length.py --report   # the summary tables again from run_length.csv, no run
"""
import argparse, csv, hashlib, io, sys, time, types
import multiprocessing as mp
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
SRC, TM_SRC = HERE / "economy2.py", HERE / "treadmill.py"
sys.path.insert(0, str(HERE))
import economy2 as E2                              # the unpatched v1 model: the exactness checks and its constants, unchanged
import treadmill as TM                             # its six patches, reused unchanged; off by default they only record

# --- this file's own patch, applied after treadmill's six; its anchor must occur exactly once in the source they leave ----------------------------
PATCHES = (
    ("outputs",
     "    return R, x\n",
     "    x |= dict(rl_income=float(e.sum()), rl_pmax=float(pdb.max() * td[1:].max()))   # run_length: the delvers' ETH income a day; the largest per-run death chance an armed delver can face\n"
     "    return R, x\n"),
)
RL_X = ("rl_income", "rl_pmax")                    # what this file's patch adds to run()'s x
MUST = ("token ledger broken", "item ledger broken", "fresh = len(fr)",
        "\nE_MED = e_median()\n",                    # (b) the calibration is a module constant, evaluated once at P's defaults ...
        "    e = E_MED * np.exp(p.sigma * z);")      # ... and run() reads it, not e_median(p)

def patched_source():
    src = SRC.read_text()
    for who, ps in (("treadmill", TM.PATCHES), ("run_length", PATCHES)):
        for name, old, new in ps:
            n = src.count(old)
            assert n == 1, f"{who} patch '{name}': anchor found {n} times in {SRC} (after the patches before it), expected exactly 1 - economy2 or treadmill changed; re-anchor before trusting any result"
            src = src.replace(old, new)
    for must in MUST:
        assert src.count(must) == 1, f"economy2's '{must.strip()}' is missing from the patched source, or not unique"
    return src

def load():
    mod = types.ModuleType("economy2_run_length"); mod.__file__ = str(SRC); sys.modules[mod.__name__] = mod
    exec(compile(patched_source(), f"{SRC} [run_length: treadmill's {len(TM.PATCHES)} patches + {len(PATCHES)}]", "exec"), mod.__dict__)
    assert mod.E_MED == E2.E_MED == E2.e_median(E2.P()) and mod.COLS == E2.COLS, "the patch moved the calibration or the record"
    return mod

T = load()                                          # the patched model
U, OUT, COLS = E2.U, E2.OUT, E2.COLS
SEEDS, DAYS, WORKERS, CHECK_DAYS = tuple(range(5)), 10_000, 3, 3_000
S0, D0, W0, PRUN0, N0 = 0.33, 0.10, 0.08, 0.5, 600  # (c) the reference cell: economy2's design point
PRUNS, DANGERS, WEARS = (0.5, 0.25, 0.125), ("unchanged", "neutral"), (0.08, 0.16, 0.32)
N4 = 300                                            # (c) E4: p_run 0.5 at N 300 against p_run 0.25 at N 600
SINK = 0.5                                          # (e) the sink holds: mint burn >= SINK x the reference cell's mean, every seed
H1_CELLS = ((0.25, "neutral", 0.16), (0.125, "neutral", 0.32))
H1_FLOWS = (("deaths/d", "deaths_d"), ("value destroyed/d", "vdes_d"), ("mints/d", "minted_d"), ("fresh/d", "fresh_d"),
            ("burn/d", "burn_d"), ("mint burn/d", "burn_mint_d"), ("repair burn/d", "burn_repair_d"), ("fee burn/d", "burn_fee_d"))
H2_CELL, H3_BAND = (0.25, "unchanged", 0.08), (0.4, 0.6)
REPRO = dict(grid="E1", p_run=0.25, danger="unchanged", wear=0.08)
SEC_PER_RUN = 17.0                                  # one 10,000-day reference run on one of 3 workers (treadmill.py, 2026-10-03); the start-up estimate only

def d0_of(p_run, danger): return D0 if danger == "unchanged" else round(D0 * PRUN0 / p_run, 6)
def window(N, p_run): return max(1, round(N0 * PRUN0 / (N * p_run)))
def prereg_sha():
    d = __doc__; return hashlib.sha1(d[d.index("PRE-REGISTRATION -"):d.index("END OF PRE-REGISTRATION")].encode()).hexdigest()[:12]
def file_sha(f): return hashlib.sha1(f.read_bytes()).hexdigest()[:12]
def sha1(R): return hashlib.sha1(np.stack([R[k] for k in COLS]).tobytes()).hexdigest()
def xhash(x): return hashlib.sha1(repr(sorted((k, v) for k, v in x.items() if k not in TM.TM_X + RL_X)).encode()).hexdigest()[:12]

CELLS = [(pr, dg, w) for pr in PRUNS for dg in (("unchanged",) if pr == PRUN0 else DANGERS) for w in WEARS]

def jobs(days):
    cfg = lambda N, pr, dg, w, sd: dict(days=days, seed=sd, N=N, p_run=pr, danger=dg, d0=d0_of(pr, dg), wear=w)
    js = [("E1", cfg(N0, pr, dg, w, sd)) for pr, dg, w in CELLS for sd in SEEDS]
    js += [("E4", cfg(N4, PRUN0, "unchanged", W0, sd)) for sd in SEEDS]
    return [(i, g, c) for i, (g, c) in enumerate(js, 1)]

def checks(days):
    cs = [("ref", dict(days=days, seed=sd, s=S0, N=N0, p_run=PRUN0, d0=D0, durability_loss=W0), {}) for sd in SEEDS]   # unpatched twin of each reference run
    base = lambda **kw: dict(days=CHECK_DAYS) | kw
    cs += [("pair", base(s=0.33, p_run=0.125, d0=0.40, durability_loss=0.32, seed=7), {}),
           ("pair", base(s=0.0, p_run=0.25, d0=0.20, durability_loss=0.16, fee=0.10, alloc="index", seed=3), {}),
           ("pair", base(s=0.66, N=300, p_run=0.25, d0=0.05, durability_loss=0.32, shock=2.0, shock_at=1500, seed=11), {})]
    return [(-i, "chk", c) for i, c in enumerate(cs, 1)]

def record(idx, grid, c, p, R, x):
    r = T.summarize(p, R, x); a = p.days * 3 // 4; n = p.days - a; q = lambda k: R[k][a:]
    meq1 = (int(round(p.mint_cost[1] * p.mint_scale * U)) + int(round(p.mint_eth[1] * p.token_per_eth * U))) / U
    wag, des, runs = q("wag_v").sum(), q("des_v").sum(), q("runs").sum()
    w = window(p.N, p.p_run); k = n // w
    treas = float(R["treasury"][-1] - R["treasury"][a - 1]) / n                     # ETH into the treasury a day (mint ETH)
    topup = float(R["m_topup"][-1] - R["m_topup"][a - 1]) / n / U                    # token the merchants bought a day
    spend = (r["bought_d"] - topup) / p.token_per_eth + treas                       # ETH the delvers spent a day: token bought + mint ETH
    nan = float("nan")
    return dict(idx=idx, grid=grid) | c | dict(
        deaths_run=r["deaths_d"] / r["runs_d"] if r["runs_d"] else nan, deaths_run_bot3=x["dpr_bot"], bot3_death_share=x["bot_share"],
        vwag_d=float(wag / n / U), vdes_d=float(des / n / U), vdes_vwag=float(des / wag) if wag else nan, vwag_run=float(wag / runs / U) if runs else nan,
        dd_d=float(q("destroyed").mean()), w=w, mint_ok_w=float((R["minted"][a:a + k * w].reshape(k, w).sum(1) > 0).mean()),
        meq1=meq1, p1_rel=r["p1"] / meq1, treasury_eth_d=treas, income_eth_d=x["rl_income"], spend_share=spend / x["rl_income"],
        pmax=x["rl_pmax"], degenerate=int(x["rl_pmax"] > 1)) | r | dict(xhash=xhash(x), sha1=sha1(R), fp=E2.fp(R))

def one(job):
    idx, grid, c = job; t0 = time.time()
    if grid == "chk":
        kind, kw, extra = c
        Ru, xu = E2.run(E2.P(**kw))                                             # unpatched economy2
        out = dict(kind=kind, kw=kw, extra=extra, sha1_u=sha1(Ru), fp_u=E2.fp(Ru), x_u=xhash(xu))
        if kind == "pair":
            Rp, xp = T.run(T.P(**kw, **extra)); out |= dict(sha1_p=sha1(Rp), fp_p=E2.fp(Rp), x_p=xhash(xp))
        return idx, grid, out, time.time() - t0
    p = T.P(days=c["days"], seed=c["seed"], s=S0, N=c["N"], p_run=c["p_run"], d0=c["d0"], durability_loss=c["wear"])
    R, x = T.run(p)                                                             # run() asserts the token and item ledgers every day
    return idx, grid, record(idx, grid, c, p, R, x), time.time() - t0

def logline(k, n, r, dt, el, eta):
    return (f"[{k:3d}/{n}] #{r['idx']:<3d} {r['grid']} N={r['N']:<3d} p_run={r['p_run']:.3f} {r['danger']:>9} d0={r['d0']:.2f} wear={r['wear']:.2f} seed={r['seed']}"
            f" | {dt:5.1f}s t+{el:5.0f}s eta {eta:5.0f}s | runs/d {r['runs_d']:5.1f} priced-out {r['priced_out']:5.1%} | deaths/run {r['deaths_run']:.4f} deaths/d {r['deaths_d']:5.2f}"
            f" vwag/d {r['vwag_d']:6.0f} vdes/d {r['vdes_d']:5.0f} | fresh/d {r['fresh_d']:4.2f} destroyed/d {r['dd_d']:5.2f} scrapped/d {r['broke_d']:4.2f} repairs/d {r['repaired_d']:5.2f}"
            f" | mints/d {r['minted_d']:5.2f} mint_ok {r['mint_ok']:.2f} (w{r['w']} {r['mint_ok_w']:.2f}) p1 {r['p1']:4.0f}/{r['meq1']:.0f}"
            f" | burn/d {r['burn_d']:5.0f} (mint {r['burn_mint_d']:4.0f} repair {r['burn_repair_d']:4.0f} fee {r['burn_fee_d']:3.0f}) | slope/yr {r['slope_yr']:+.4f} pmax {r['pmax']:.3f}"
            f"{' DEGENERATE' if r['degenerate'] else ''} | {r['sha1'][:12]}")

def chkline(k, n, c, dt):
    if c["kind"] == "ref": return f"[{k:3d}/{n}] check: unpatched economy2 {c['kw']} | {dt:5.1f}s | fp {c['fp_u']} sha1 {c['sha1_u'][:12]} x {c['x_u']}"
    same = c["sha1_u"] == c["sha1_p"] and c["fp_u"] == c["fp_p"] and c["x_u"] == c["x_p"]
    return f"[{k:3d}/{n}] check: patched {c['extra'] or '(nothing switched on)'} vs unpatched economy2 {c['kw']} | {dt:5.1f}s | fp {c['fp_p']} vs {c['fp_u']} | {'IDENTICAL' if same else 'DIFFERENT'}"

def opener(mode):
    log = open(OUT / "run_length.log", "a")
    def say(x=""): print(x, flush=True); log.write(x + "\n"); log.flush()
    say(f"\n=== {datetime.now(timezone.utc).isoformat(timespec='seconds')} run_length.py {mode} | pre-registration sha1 {prereg_sha()} | economy2.py sha1 {file_sha(SRC)},"
        f" treadmill.py sha1 {file_sha(TM_SRC)}, {len(TM.PATCHES)} + {len(PATCHES)} patches, every anchor unique | calibration held: median delver {E2.E_MED * 1e6:.1f} uETH/day ===")
    return log, say

def scan(days, workers):
    js, cs = jobs(days), checks(days); allj = cs + js; n = len(allj)
    log, say = opener(f"scan: {len(js)} grid runs (E1 {sum(j[1] == 'E1' for j in js)}, E4 {sum(j[1] == 'E4' for j in js)}) + {len(cs)} exactness checks,"
                      f" {days} days each (off-grid checks {CHECK_DAYS}), {workers} workers; estimate <= ~{(len(js) + 5 + 3 * 2 * CHECK_DAYS / days) * SEC_PER_RUN / workers / 60:.0f} min")
    t0, R, C, busy = time.time(), {}, [], 0.0
    with mp.Pool(workers) as pool:
        for k, (idx, grid, r, dt) in enumerate(pool.imap_unordered(one, allj), 1):
            busy += dt; el = time.time() - t0
            if grid == "chk": C.append(r); say(chkline(k, n, r, dt))
            else: R[idx] = r; say(logline(k, n, r, dt, el, el / k * (n - k)))
    wall = time.time() - t0
    say(f"all {n} runs finished: {wall:.0f} s wall, {busy:.0f} s of run time summed; token and item ledgers asserted exact on every day of every run (economy2.run, patched and unpatched)")
    rows = [R[i] for i in sorted(R)]
    with open(OUT / "run_length.csv", "w", newline="") as fh: w = csv.DictWriter(fh, rows[0].keys()); w.writeheader(); w.writerows(rows)
    report(rows, C, say)
    say(f"done: {wall:.0f} s wall; wrote {OUT / 'run_length.csv'}, {OUT / 'run_length.log'}")
    log.close()

# --- the report -----------------------------------------------------------------------------------------------------------------------------
def G(rows, **kw): return [r for r in rows if all(r[k] == v for k, v in kw.items())]
def st(rs, k): return np.array([r[k] for r in rs], float)
def mn(rs, k):
    v = st(rs, k) if rs else np.array([]); v = v[~np.isnan(v)]
    return float(v.mean()) if len(v) else float("nan")
def lo(rs, k): v = st(rs, k); return float(np.nanmin(v)) if np.any(~np.isnan(v)) else float("nan")
def hi(rs, k): v = st(rs, k); return float(np.nanmax(v)) if np.any(~np.isnan(v)) else float("nan")
def rng(rs, k, f): return f"{mn(rs, k):{f}} [{lo(rs, k):{f}}, {hi(rs, k):{f}}]"
def cell(rows, pr, dg, w): return G(rows, grid="E1", p_run=pr, danger=dg, wear=w)
def verdict_w(rs):
    ok = all(r["mint_ok_w"] >= E2.VIABLE and abs(r["slope_yr"]) <= E2.FLAT for r in rs)
    return "ROBUST" if ok and all(r["mint_ok_w"] >= E2.ROBUST for r in rs) else "viable" if ok else "no"

def report(rows, C, say):
    H = prereg_sha(); ref = cell(rows, PRUN0, "unchanged", W0); floor = SINK * mn(ref, "burn_mint_d"); E4r = G(rows, grid="E4"); J = {}
    def judge(rs):
        v = E2.verdict(rs); sink = all(r["burn_mint_d"] >= floor for r in rs)
        return dict(verdict=v, vw=verdict_w(rs), sink=sink, ok=v != "no" and sink)
    lab = lambda pr, dg, w, N=N0: f"{N:4d} {pr:5.3f} {dg if pr != PRUN0 else '-':>9} {d0_of(pr, dg) if pr != PRUN0 else D0:4.2f} {w:4.2f}"
    hdr = (f"{'N':>4} {'p_run':>5} {'danger':>9} {'d0':>4} {'wear':>4} | {'runs/d':>6} {'p-out':>5} | {'dth/run':>7} {'bot3':>6} {'dth/d':>5} {'vwag/d':>6} {'vdes/d':>6} {'vd/vw':>6} | {'fresh':>5}"
           f" {'destr':>5} {'scrap':>5} {'rep/d':>5} | {'mint/d':>6} {'mint_ok [min]':>13} {'ok_w':>4} | {'p1':>4} {'/meq':>4} | {'burn/d':>6} {'mint':>5} {'rep':>5} {'fee':>4}"
           f" | {'ETH/d':>7} {'spent':>5} | {'pnl/d':>6} | {'slope/yr [max]':>15} | {'pmax':>5} | verdict (w)      sink PASS")
    def line(rs, j):
        m = lambda k: mn(rs, k)
        return (f"{m('runs_d'):6.1f} {m('priced_out'):5.1%} | {m('deaths_run'):7.4f} {m('deaths_run_bot3'):6.4f} {m('deaths_d'):5.2f} {m('vwag_d'):6.0f} {m('vdes_d'):6.0f} {m('vdes_vwag'):6.4f}"
                f" | {m('fresh_d'):5.2f} {m('dd_d'):5.2f} {m('broke_d'):5.2f} {m('repaired_d'):5.2f} | {m('minted_d'):6.2f} {m('mint_ok'):6.2f} [{lo(rs, 'mint_ok'):.2f}] {m('mint_ok_w'):4.2f}"
                f" | {m('p1'):4.0f} {m('p1_rel'):4.0%} | {m('burn_d'):6.0f} {m('burn_mint_d'):5.0f} {m('burn_repair_d'):5.0f} {m('burn_fee_d'):4.0f} | {m('treasury_eth_d'):7.5f} {m('spend_share'):5.1%}"
                f" | {m('m_pnl_d'):+6.1f} | {m('slope_yr'):+7.4f} [{np.abs(st(rs, 'slope_yr')).max():.4f}] | {hi(rs, 'pmax'):5.3f} | {j['verdict']:>7} ({j['vw']:>6}) {'holds' if j['sink'] else 'FAILS':>5} {'PASS' if j['ok'] else 'fail':>4}")
    # (A) every cell --------------------------------------------------------------------------------------------------------------------------
    say(f"\n(A) every cell [prereg {H}]: s = 0.33, 10,000 days, last quarter, mean over seeds 0-4 [worst seed]; incomes held at the reference calibration in every cell."
        f" Sink holds iff mint burn/day >= {SINK} x the reference cell's {mn(ref, 'burn_mint_d'):.0f} = {floor:.0f} token/day on every seed. Columns: runs/d, priced-out share; deaths per run"
        f" (all, bottom third by skill), deaths/d, value wagered/d and destroyed by death/d (token at the mint-equivalent) and their ratio; fresh drops/d, items destroyed by death/d,"
        f" scrapped/d, repairs/d; mints/d, mint_ok [worst], mint_ok_w (windows of 1/2/4 days at p_run .5/.25/.125, 2 for N 300); tier-1 price and / 220 mint-equivalent; burn/d total, mint,"
        f" repair, fee (token); treasury ETH/d, share of delvers' ETH income spent; merchant P&L token/d; supply slope; largest per-run death chance; verdict (verdict on mint_ok_w)")
    say(f"  " + hdr)
    for pr, dg, w in CELLS:
        rs = cell(rows, pr, dg, w); j = J[(pr, dg, w)] = judge(rs)
        if pr != CELLS[max(0, CELLS.index((pr, dg, w)) - 1)][0]: say("")
        say(f"  {lab(pr, dg, w)} | " + line(rs, j))
    j4 = J["E4"] = judge(E4r); say(f"\n  {lab(PRUN0, 'unchanged', W0, N4)} | " + line(E4r, j4) + "   <- E4")
    # (B) seed ranges -------------------------------------------------------------------------------------------------------------------------
    say(f"\n(B) seed ranges [prereg {H}]: mean [min, max] over seeds 0-4")
    say(f"  {'N':>4} {'p_run':>5} {'danger':>9} {'d0':>4} {'wear':>4} | {'runs/d':>20} | {'priced-out':>22} | {'deaths/run':>26} | {'mints/d':>20} | {'mint_ok':>20} | {'mint burn/d':>17}"
        f" | {'repair burn/d':>17} | {'burn/d':>17} | {'p1 token':>17}")
    for c in CELLS + [None]:
        rs, lb = (E4r, lab(PRUN0, "unchanged", W0, N4)) if c is None else (cell(rows, *c), lab(*c))
        say(f"  {lb} | {rng(rs, 'runs_d', '6.1f')} | {rng(rs, 'priced_out', '6.1%')} | {rng(rs, 'deaths_run', '7.4f')} | {rng(rs, 'minted_d', '6.2f')} | {rng(rs, 'mint_ok', '6.2f')}"
            f" | {rng(rs, 'burn_mint_d', '5.0f')} | {rng(rs, 'burn_repair_d', '5.0f')} | {rng(rs, 'burn_d', '5.0f')} | {rng(rs, 'p1', '5.0f')}")
    # (C) hypotheses --------------------------------------------------------------------------------------------------------------------------
    say(f"\n(C) hypotheses [prereg {H}], rules as registered")
    h1 = True
    say(f"  H1 null check: exposure-neutral danger with wear scaled alike; within seed noise iff the arm's mean lies inside the reference's [min, max] over seeds 0-4")
    say(f"     {'flow':<18} | {'reference mean [min, max]':>28} | " + " | ".join(f"{f'p_run {pr:g}, d0 {d0_of(pr, dg):g}, wear {w:g}':>40}" for pr, dg, w in H1_CELLS))
    for name, k in H1_FLOWS:
        parts = []
        for pr, dg, w in H1_CELLS:
            rs = cell(rows, pr, dg, w); m = mn(rs, k); inn = lo(ref, k) <= m <= hi(ref, k); h1 &= inn
            parts.append(f"{m:9.2f} ({m / mn(ref, k) - 1:+7.1%}) {'within' if inn else 'OUTSIDE':>7} {'<10%' if abs(m / mn(ref, k) - 1) <= 0.10 else '>10%':>4}")
        say(f"     {name:<18} | {rng(ref, k, '8.2f'):>28} | " + " | ".join(f"{x:>40}" for x in parts))
    say(f"     -> H1 {'HOLDS' if h1 else 'does NOT hold'}")
    c2 = cell(rows, *H2_CELL); mo2 = mn(c2, "mint_ok"); h2 = mo2 < 0.5; strong = all(r["mint_ok"] <= 0.05 for r in c2)
    say(f"  H2 p_run 0.25, d0 0.10, wear 0.08 fails like d0 0.05 (mean mint_ok < 0.5): mint_ok {rng(c2, 'mint_ok', '.2f')} -> H2 {'HOLDS' if h2 else 'does NOT hold'};"
        f" verdict {J[H2_CELL]['verdict']}; strong form (minting dead, mint_ok <= 0.05 every seed) {'holds' if strong else 'does not hold'}; mint_ok_w {rng(c2, 'mint_ok_w', '.2f')};"
        f" mint burn {rng(c2, 'burn_mint_d', '.0f')} vs reference {mn(ref, 'burn_mint_d'):.0f} ({mn(c2, 'burn_mint_d') / mn(ref, 'burn_mint_d'):.2f} x), sink {'holds' if J[H2_CELL]['sink'] else 'FAILS'}")
    c8 = cell(rows, 0.125, "unchanged", 0.08)
    say(f"     (same at p_run 0.125: mint_ok {rng(c8, 'mint_ok', '.2f')}, verdict {J[(0.125, 'unchanged', 0.08)]['verdict']}, strong form {'holds' if all(r['mint_ok'] <= 0.05 for r in c8) else 'does not hold'},"
        f" mint_ok_w {rng(c8, 'mint_ok_w', '.2f')}, mint burn {mn(c8, 'burn_mint_d') / mn(ref, 'burn_mint_d'):.2f} x the reference)")
    r3 = mn(c2, "burn_repair_d") / mn(ref, "burn_repair_d"); h3 = H3_BAND[0] <= r3 <= H3_BAND[1]
    say(f"  H3 same cell roughly halves repair burn (ratio of means in [{H3_BAND[0]}, {H3_BAND[1]}]): {mn(c2, 'burn_repair_d'):.0f} / {mn(ref, 'burn_repair_d'):.0f} = {r3:.2f} -> H3 {'HOLDS' if h3 else 'does NOT hold'}"
        f" (p_run 0.125: {mn(c8, 'burn_repair_d') / mn(ref, 'burn_repair_d'):.2f} x; runs/d {mn(c2, 'runs_d') / mn(ref, 'runs_d'):.2f} x and {mn(c8, 'runs_d') / mn(ref, 'runs_d'):.2f} x the reference)")
    # (D) the operator's choice ---------------------------------------------------------------------------------------------------------------
    say(f"\n(D) the operator's choice [prereg {H}]. 'More at the door, more at the end' (a dearer entry and a richer payout per run) is NOT in this grid: it needs mint, repair or drop constants per dungeon.")
    say(f"  (i) does raising per-run danger (exposure-neutral) restore minting? unchanged -> exposure-neutral, same p_run and wear")
    say(f"  {'p_run':>5} {'wear':>4} | {'PASS':>11} | {'verdict':>16} | {'mint_ok':>11} | {'mint burn/d':>13} | {'mints/d':>13} | {'fresh/d':>13} | {'deaths/run':>15} | {'runs/d':>13} | {'priced-out':>15} | reading")
    for pr in PRUNS[1:]:
        for w in WEARS:
            a, b = cell(rows, pr, "unchanged", w), cell(rows, pr, "neutral", w); ja, jb = J[(pr, "unchanged", w)], J[(pr, "neutral", w)]
            rd = "restores" if jb["ok"] and not ja["ok"] else "not needed (both pass)" if ja["ok"] and jb["ok"] else "does NOT restore" if not ja["ok"] else "BREAKS it"
            say(f"  {pr:5.3f} {w:4.2f} | {'PASS' if ja['ok'] else 'fail':>4} -> {'PASS' if jb['ok'] else 'fail':>4} | {ja['verdict']:>6} -> {jb['verdict']:>6} | {mn(a, 'mint_ok'):4.2f} -> {mn(b, 'mint_ok'):4.2f}"
                f" | {mn(a, 'burn_mint_d'):5.0f} -> {mn(b, 'burn_mint_d'):5.0f} | {mn(a, 'minted_d'):5.2f} -> {mn(b, 'minted_d'):5.2f} | {mn(a, 'fresh_d'):5.2f} -> {mn(b, 'fresh_d'):5.2f}"
                f" | {mn(a, 'deaths_run'):.4f} -> {mn(b, 'deaths_run'):.4f} | {mn(a, 'runs_d'):5.1f} -> {mn(b, 'runs_d'):5.1f} | {mn(a, 'priced_out'):5.1%} -> {mn(b, 'priced_out'):5.1%} | {rd}")
    say(f"  (ii) what does wear per stage do to repair burn? repair burn/d as a multiple of the reference's {mn(ref, 'burn_repair_d'):.0f}; runs/d against the same p_run and danger at wear 0.08")
    say(f"  {'p_run':>5} {'danger':>9} | " + " | ".join(f"{f'wear {w:g}: repair x, repairs/d, scrapped/d, runs x, burn/d, PASS':>58}" for w in WEARS))
    for pr in PRUNS:
        for dg in (("unchanged",) if pr == PRUN0 else DANGERS):
            b0 = cell(rows, pr, dg, W0); parts = []
            for w in WEARS:
                rs = cell(rows, pr, dg, w); stage = " (per stage)" if abs(w - W0 * PRUN0 / pr) < 1e-9 and pr != PRUN0 else ""
                parts.append(f"{mn(rs, 'burn_repair_d') / mn(ref, 'burn_repair_d'):5.2f} x {mn(rs, 'repaired_d'):5.2f} {mn(rs, 'broke_d'):5.2f} {mn(rs, 'runs_d') / mn(b0, 'runs_d') - 1:+6.1%}"
                             f" {mn(rs, 'burn_d'):5.0f} {'PASS' if J[(pr, dg, w)]['ok'] else 'fail'}{stage:>12}")
            say(f"  {pr:5.3f} {dg if pr != PRUN0 else '-':>9} | " + " | ".join(f"{x:>58}" for x in parts))
    # (E) E4 ----------------------------------------------------------------------------------------------------------------------------------
    a4 = cell(rows, *H2_CELL)
    say(f"\n(E) E4 cross-check [prereg {H}]: p_run 0.25 at N 600 against p_run 0.5 at N 300 (d0 0.10, wear 0.08, M 8); differ iff the N 600 mean lies outside the N 300 [min, max]")
    e4 = {}
    for name, k, f in (("runs/d", "runs_d", "7.1f"), ("priced-out", "priced_out", "7.1%"), ("deaths/run", "deaths_run", "7.4f"), ("deaths/d", "deaths_d", "7.2f"), ("mints/d", "minted_d", "7.2f"),
                       ("mint_ok", "mint_ok", "7.2f"), ("mint_ok_w", "mint_ok_w", "7.2f"), ("fresh/d", "fresh_d", "7.2f"), ("burn/d", "burn_d", "7.0f"), ("mint burn/d", "burn_mint_d", "7.0f"),
                       ("repair burn/d", "burn_repair_d", "7.0f"), ("fee burn/d", "burn_fee_d", "7.0f"), ("p1 token", "p1", "7.0f"), ("spent share", "spend_share", "7.1%"), ("ETH income/d", "income_eth_d", "7.4f")):
        m = mn(a4, k); dif = not (lo(E4r, k) <= m <= hi(E4r, k)); e4[k] = dif
        say(f"  {name:<14} N 600, p_run 0.25: {rng(a4, k, f)} | N 300, p_run 0.5: {rng(E4r, k, f)} | {'DIFFER' if dif else 'same within noise'}")
    say(f"  verdict N 600/0.25 {J[H2_CELL]['verdict']} sink {'holds' if J[H2_CELL]['sink'] else 'FAILS'} | N 300/0.5 {j4['verdict']} sink {'holds' if j4['sink'] else 'FAILS'}"
        f" -> E4 ('half the runs per head is not half the heads') {'HOLDS' if e4['runs_d'] or e4['minted_d'] else 'does NOT hold'}")
    # (F) degenerate arms and checks ----------------------------------------------------------------------------------------------------------
    say(f"\n(F) degenerate arms [prereg {H}]: largest per-run death chance any armed delver could face, over every run: {max(st(rows, 'pmax')):.4f};"
        f" runs flagged degenerate (> 1): {int(st(rows, 'degenerate').sum())} of {len(rows)}. Realised deaths per run at d0 0.40: "
        + "; ".join(f"wear {w:g} {rng(cell(rows, 0.125, 'neutral', w), 'deaths_run', '.4f')}" for w in WEARS))
    say(f"\n(G) checks [prereg {H}]")
    if not C: say("  exactness checks are not re-run by --report: see the scan's (G) section above in this log"); return
    refs = [c for c in C if c["kind"] == "ref"]; ok_ref = 0
    for c in refs:
        r = G(ref, seed=c["kw"]["seed"])[0]; ok_ref += r["sha1"] == c["sha1_u"] and r["fp"] == c["fp_u"] and r["xhash"] == c["x_u"]
    prs = [c for c in C if c["kind"] == "pair"]; ok_pr = sum(c["sha1_u"] == c["sha1_p"] and c["fp_u"] == c["fp_p"] and c["x_u"] == c["x_p"] for c in prs)
    say(f"  patched = economy2: {ok_ref}/{len(refs)} reference runs (p_run 0.5, d0 0.10, wear 0.08, N 600, seeds 0-4, {ref[0]['days']} days) match an unpatched economy2.run in economy2.fp,"
        f" the full SHA-1 of every daily column and every field run() returns; {ok_pr}/{len(prs)} off-grid pairs ({CHECK_DAYS} days, moving p_run, d0, wear and N) likewise")
    say(f"  {len(TM.PATCHES)} treadmill patches + {len(PATCHES)} of this file's, each anchor found exactly once (economy2.py sha1 {file_sha(SRC)}, treadmill.py sha1 {file_sha(TM_SRC)});"
        f" calibration E_MED {E2.E_MED * 1e6:.3f} uETH/day = economy2's, in every cell; token and item ledgers asserted exact every day of every run")

def reload():                                      # --report: the summary again, from run_length.csv (the checks are not re-run)
    STR = ("grid", "danger", "xhash", "sha1", "fp")
    rows = [{k: (v if k in STR else float(v)) for k, v in r.items()} for r in csv.DictReader(open(OUT / "run_length.csv", newline=""))]
    log, say = opener(f"--report: the summary tables again from {OUT / 'run_length.csv'} ({len(rows)} rows), no run")
    report(rows, [], say); log.close()

def repro(days, workers):
    path = OUT / "run_length.csv"
    with open(path, newline="") as fh: lines = fh.read().split("\r\n")
    old = {int(next(csv.reader([ln]))[0]): ln for ln in lines[1:] if ln}; header = next(csv.reader([lines[0]]))
    js = [j for j in jobs(days) if j[1] == REPRO["grid"] and all(j[2][k] == v for k, v in REPRO.items() if k != "grid")]
    log, say = opener(f"--repro: re-run {len(js)} runs of one cell ({', '.join(f'{k} {v}' for k, v in REPRO.items())}), {days} days, in fresh processes; compare with {path}")
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
