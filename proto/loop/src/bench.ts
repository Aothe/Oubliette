// The bench: seeded batches of whole runs with scripted delvers, the measurements the red team
// asked for (docs/red-team.md, research agenda item 2), and the determinism checks — every log
// replayed to its hash, and one run per scenario killed and resumed from a snapshot.
import { type RunConfig, type RunState, type Input, type DoorMode, createRun, step, settle, stateHash, snapshot, restore, freshKit, IDLE, type RunResult } from "./sim.ts";
import { Recorder, replay, type InputLog } from "./log.ts";
import { Squad, PROFILE, type BotProfile } from "./bots.ts";
import { Rng, seedFrom, hashInts } from "./rng.ts";
import * as C from "./content.ts";
import { div, floorDiv } from "./fixed.ts";

export interface Scenario {
  name: string; title: string; delvers: number; door: DoorMode; packScale: number; danger?: number;
  kit: (i: number, rng: Rng) => (C.Item | null)[];
  profile: (i: number) => BotProfile;
}
const skills: C.SkillId[] = [0, 1, 2];
// Reaction skill across the shard: the weakest two fifths are under the lethal line for aimed shots.
const spread = (i: number): number => [90, 35, 60, 75, 45][i % 5];
export const SCENARIOS: Record<string, Scenario> = {
  party4: {
    name: "party4", title: "The slice's party: one leader, three allies, tier-1 kits", delvers: 4, door: "sealed", packScale: 100,
    kit: (i, rng) => freshKit(skills[i % 3], rng), profile: (i) => ({ ...PROFILE, skill: [90, 35, 60, 90][i] }),
  },
  shard20: {
    name: "shard20", title: "A v0 shard of twenty, mixed skills, tier-1 kits", delvers: 20, door: "sealed", packScale: 300,
    kit: (i, rng) => freshKit(skills[i % 3], rng), profile: (i) => ({ ...PROFILE, skill: spread(i) }),
  },
  nomend: {
    name: "nomend", title: "A1 baseline: twenty with Slip and Sunder only, nobody heals", delvers: 20, door: "sealed", packScale: 300,
    kit: (i, rng) => freshKit(i % 2 === 0 ? 0 : 2, rng), profile: (i) => ({ ...PROFILE, skill: spread(i) }),
  },
  healball: {
    name: "healball", title: "A1: twenty, six of them Menders on staggered timers", delvers: 20, door: "sealed", packScale: 300,
    kit: (i, rng) => freshKit(i < 6 ? 1 : skills[i % 2 === 0 ? 0 : 2], rng),
    profile: (i) => ({ ...PROFILE, skill: spread(i), mendAt: i < 6 ? 85 : 0, mendStagger: i < 6 ? i * 90 : 0 }),
  },
  stripped: {
    name: "stripped", title: "B1: twenty, half of them wagering only the skill item", delvers: 20, door: "sealed", packScale: 300,
    kit: (i, rng) => (i % 2 === 0 ? [null, null, null, null, { id: C.SKILL_ITEM[skills[i % 3]], dur: 90 }] : freshKit(skills[i % 3], rng)),
    profile: (i) => ({ ...PROFILE, skill: spread(i) }),
  },
  opendoor: {
    name: "opendoor", title: "C2: twenty with the slice's rule — the first delver in wakes the boss for all", delvers: 20, door: "open", packScale: 300,
    kit: (i, rng) => freshKit(skills[i % 3], rng), profile: (i) => ({ ...PROFILE, skill: spread(i) }),
  },
  shard85: {
    name: "shard85", title: "The realm cap: eighty-five in one shard, for the tick cost", delvers: 85, door: "sealed", packScale: 400,
    kit: (i, rng) => freshKit(skills[i % 3], rng), profile: (i) => ({ ...PROFILE, skill: spread(i) }),
  },
  cautious: {
    name: "cautious", title: "A2: twenty who recall under 45 % HP while recall is open", delvers: 20, door: "sealed", packScale: 300,
    kit: (i, rng) => freshKit(skills[i % 3], rng), profile: (i) => ({ ...PROFILE, skill: spread(i), recallAt: 45 }),
  },
};

/** The bench's danger when a scenario names none; `--danger` on the command line sets it. 400 is
 *  where a bot shard with this skill spread lands in the economy's band (`headless.ts scan`). */
export let DANGER = 400;
export function setDanger(d: number): void { DANGER = d; }
export function configFor(sc: Scenario, run: number): RunConfig {
  const seed = seedFrom(hashInts(0x5ce, run, sc.name.length, ...sc.name.split("").map((c) => c.charCodeAt(0))));
  const kitRng = new Rng(hashInts(0x1c17, run));
  const delvers = [];
  for (let i = 0; i < sc.delvers; i++) delvers.push({ name: `D${i}`, wager: sc.kit(i, kitRng) });
  return { seed, delvers, door: sc.door, packScale: sc.packScale, danger: sc.danger ?? DANGER };
}
export function squadFor(sc: Scenario, cfg: RunConfig, run: number): Squad {
  return new Squad(cfg, cfg.delvers.map((_, i) => sc.profile(i)), hashInts(0xb075, run));
}

export interface RunStats {
  run: number; reason: string; ticks: number; bossKilled: boolean;
  deaths: number; recalls: number; sealedOut: number; extracts: number; halted: number; finishers: number; qualified: number;
  valueWagered: number; valueDestroyed: number; valueRecycled: number; valueLeft: number;
  freshTable: number; freshBudget: number; awardedTable: number; awardedBudget: number; prizesTable: number;
  mends: number; healed: number; shots: number; dealt: number; taken: number;
  replayOk: boolean; simMs: number; replayMs: number; frames: number;
  deathsBySkill: Record<string, number>;
  // B1: delvers who wager only the skill item against the rest — what they stake, win and lose
  stripped: { n: number; wagered: number; prizes: number; deaths: number };
  full: { n: number; wagered: number; prizes: number; deaths: number };
}
/** Play one run to the end with the scenario's squad; returns the state, its log and the stats. */
export function playRun(sc: Scenario, run: number, poolIn: C.Item[], snapshotAt = 0): { state: RunState; log: InputLog; stats: RunStats; result: RunResult; snap: string | null } {
  const cfg = configFor(sc, run);
  const s = createRun(cfg);
  const squad = squadFor(sc, cfg, run);
  const rec = new Recorder(cfg);
  let snap: string | null = null;
  const t0 = Date.now();
  while (s.phase === "play") {
    const inputs = rec.record(s.tick + 1, squad.inputs(s));
    step(s, inputs);
    rec.after(s);
    if (snapshotAt && s.tick === snapshotAt) snap = snapshot(s);
  }
  const simMs = Date.now() - t0;
  const table = settle(s, { poolIn, settleBlock: hashInts(0xb10c, run, 1), fresh: { mode: "table" } });
  const budget = settle(s, { poolIn, settleBlock: hashInts(0xb10c, run, 1), fresh: { mode: "budget", value: floorDiv(table.valueDestroyed, 2) } });
  const t1 = Date.now();
  const rp = replay(rec.log);
  const replayMs = Date.now() - t1;
  let mends = 0, healed = 0, shots = 0, dealt = 0, taken = 0;
  const deathsBySkill: Record<string, number> = {};
  const stripped = { n: 0, wagered: 0, prizes: 0, deaths: 0 }, full = { n: 0, wagered: 0, prizes: 0, deaths: 0 };
  for (const d of s.delvers) {
    mends += d.mends; healed += d.healed; shots += d.shots; dealt += d.dealt; taken += d.taken;
    if (d.status === "dead") { const k = String(sc.profile(d.id).skill); deathsBySkill[k] = (deathsBySkill[k] ?? 0) + 1; }
    const g = d.wager[0] || d.wager[1] || d.wager[2] || d.wager[3] ? full : stripped;
    const r = table.delvers[d.id];
    g.n++; g.wagered += r.wagered; g.deaths += d.status === "dead" ? 1 : 0;
    for (const it of r.awarded) g.prizes += C.itemValue(it);
  }
  const stats: RunStats = {
    run, reason: s.reason, ticks: s.tick, bossKilled: s.boss.dead,
    deaths: table.deaths, recalls: table.recalls, sealedOut: table.sealedOut, extracts: table.extracts, halted: table.halted, finishers: table.finishers, qualified: table.qualified,
    valueWagered: table.valueWagered, valueDestroyed: table.valueDestroyed, valueRecycled: table.valueRecycled, valueLeft: table.valueLeft,
    freshTable: table.freshValue, freshBudget: budget.freshValue, awardedTable: table.awarded, awardedBudget: budget.awarded, prizesTable: table.prizes,
    mends, healed, shots, dealt, taken, replayOk: rp.ok, simMs, replayMs, frames: rec.log.frames.length, deathsBySkill, stripped, full,
  };
  return { state: s, log: rec.log, stats, result: table, snap };
}
/** Continue a run from a snapshot taken at `at`, driving it with the log's inputs; true if the hash matches the log's end. */
export function resumeCheck(log: InputLog, snap: string, at: number): boolean {
  const s = restore(snap);
  if (s.tick !== at) return false;
  const cur: Input[] = log.cfg.delvers.map(() => ({ ...IDLE }));
  let fi = 0;
  while (fi < log.frames.length && log.frames[fi].t <= at) { const f = log.frames[fi++]; cur[f.d] = { ...f.i }; }
  const endTick = log.end ? log.end.tick : 0;
  for (let t = at + 1; t <= endTick && s.phase === "play"; t++) {
    while (fi < log.frames.length && log.frames[fi].t === t) { const f = log.frames[fi++]; cur[f.d] = { ...f.i }; }
    step(s, cur);
  }
  return !!log.end && stateHash(s) === log.end.hash && s.tick === log.end.tick;
}

export interface Summary {
  scenario: string; title: string; runs: number; delvers: number; danger: number;
  bossKillPct: number; deathsPerRun: number; deathPctPerDelver: number; recallsPerRun: number; sealedOutPerRun: number; extractPct: number; haltPct: number;
  meanTicks: number; destroyedPctOfWagered: number; valueDestroyedPerRun: number; freshTablePerRun: number; freshBudgetPerRun: number;
  mendsPerRun: number; healedPerRun: number; replaysOk: number; resumeOk: boolean | null; msPerRun: number;
  deathsBySkill: Record<string, number>;
  strippedShare: { n: number; wagerPct: number; prizePct: number; deathPct: number; fullDeathPct: number } | null;
}
export function summarize(sc: Scenario, runs: RunStats[], resumeOk: boolean | null): Summary {
  const n = runs.length || 1, sum = (f: (r: RunStats) => number): number => runs.reduce((a, r) => a + f(r), 0);
  const pct = (x: number, of: number): number => (of ? Math.round((1000 * x) / of) / 10 : 0);
  const per = (x: number): number => Math.round((100 * x) / n) / 100;
  const deathsBySkill: Record<string, number> = {};
  for (const r of runs) for (const k in r.deathsBySkill) deathsBySkill[k] = (deathsBySkill[k] ?? 0) + r.deathsBySkill[k];
  const sn = sum((r) => r.stripped.n), sw = sum((r) => r.stripped.wagered), fw = sum((r) => r.full.wagered), sp = sum((r) => r.stripped.prizes), fp = sum((r) => r.full.prizes);
  const strippedShare = sn ? { n: sn, wagerPct: pct(sw, sw + fw), prizePct: pct(sp, sp + fp), deathPct: pct(sum((r) => r.stripped.deaths), sn), fullDeathPct: pct(sum((r) => r.full.deaths), sum((r) => r.full.n)) } : null;
  return {
    scenario: sc.name, title: sc.title, runs: runs.length, delvers: sc.delvers, danger: sc.danger ?? DANGER,
    bossKillPct: pct(sum((r) => (r.bossKilled ? 1 : 0)), n), deathsPerRun: per(sum((r) => r.deaths)), deathPctPerDelver: pct(sum((r) => r.deaths), n * sc.delvers),
    recallsPerRun: per(sum((r) => r.recalls)), sealedOutPerRun: per(sum((r) => r.sealedOut)), extractPct: pct(sum((r) => r.extracts), n * sc.delvers), haltPct: pct(sum((r) => (r.reason === "halt" ? 1 : 0)), n),
    meanTicks: Math.round(sum((r) => r.ticks) / n), destroyedPctOfWagered: pct(sum((r) => r.valueDestroyed), sum((r) => r.valueWagered)), valueDestroyedPerRun: per(sum((r) => r.valueDestroyed)),
    freshTablePerRun: per(sum((r) => r.freshTable)), freshBudgetPerRun: per(sum((r) => r.freshBudget)),
    mendsPerRun: per(sum((r) => r.mends)), healedPerRun: per(sum((r) => r.healed)), replaysOk: sum((r) => (r.replayOk ? 1 : 0)), resumeOk, msPerRun: Math.round(sum((r) => r.simMs) / n),
    deathsBySkill, strippedShare,
  };
}
export function runScenario(sc: Scenario, runs: number, onRun?: (st: RunStats) => void): { runs: RunStats[]; summary: Summary } {
  const out: RunStats[] = [];
  let pool: C.Item[] = [];
  let resumeOk: boolean | null = null;
  for (let i = 0; i < runs; i++) {
    const r = playRun(sc, i, pool, i === 0 ? 1800 : 0);
    pool = r.result.poolOut;
    if (i === 0 && r.snap) resumeOk = resumeCheck(r.log, r.snap, 1800);
    out.push(r.stats);
    if (onRun) onRun(r.stats);
  }
  return { runs: out, summary: summarize(sc, out, resumeOk) };
}
export { div as _div };
