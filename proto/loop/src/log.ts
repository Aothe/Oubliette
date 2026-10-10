// The input log: the run's configuration and every change of any delver's input, by tick. It is
// the whole run — a bot's inputs are logged like a person's, so a replay needs no bot code — and
// with the final hash it is the replay artifact of SPEC §3.4: anyone who runs it through the same
// simulation gets the same deaths. Checkpoints every `checkEvery` ticks locate a divergence.
import { type Input, type RunConfig, type RunState, IDLE, createRun, step, stateHash } from "./sim.ts";

export interface LogFrame { t: number; d: number; i: Input }
export interface InputLog {
  v: 1;
  cfg: RunConfig;
  frames: LogFrame[];
  checkpoints: { t: number; h: string }[];
  end: { tick: number; hash: string; reason: string } | null;
}
export function inputsEqual(a: Input, b: Input): boolean {
  return a.mx === b.mx && a.my === b.my && a.aim === b.aim && a.ax === b.ax && a.ay === b.ay
    && a.fire === b.fire && a.skill === b.skill && a.recall === b.recall && a.ready === b.ready;
}
function copy(i: Input): Input {
  return { mx: i.mx, my: i.my, aim: i.aim, ax: i.ax, ay: i.ay, fire: i.fire, skill: i.skill, recall: i.recall, ready: i.ready };
}

export class Recorder {
  log: InputLog;
  last: Input[];
  checkEvery: number;
  constructor(cfg: RunConfig, checkEvery = 600) {
    this.log = { v: 1, cfg, frames: [], checkpoints: [], end: null };
    this.last = cfg.delvers.map(() => copy(IDLE));
    this.checkEvery = checkEvery;
  }
  /** Record the inputs for the tick about to be stepped (state.tick + 1) and return them. */
  record(tick: number, inputs: readonly (Input | undefined)[]): Input[] {
    for (let d = 0; d < this.last.length; d++) {
      const i = inputs[d] ?? IDLE;
      if (!inputsEqual(i, this.last[d])) { this.last[d] = copy(i); this.log.frames.push({ t: tick, d, i: copy(i) }); }
    }
    return this.last;
  }
  /** Call after each step. */
  after(s: RunState): void {
    if (s.tick % this.checkEvery === 0) this.log.checkpoints.push({ t: s.tick, h: stateHash(s) });
    if (s.phase === "ended" && !this.log.end) this.log.end = { tick: s.tick, hash: stateHash(s), reason: s.reason };
  }
}

export interface ReplayResult { state: RunState; hash: string; ok: boolean; divergedAt: number | null; ticks: number }
/** Run the log through the simulation and compare every checkpoint and the end. */
export function replay(log: InputLog, onTick?: (s: RunState) => void): ReplayResult {
  const s = createRun(log.cfg);
  const cur: Input[] = log.cfg.delvers.map(() => copy(IDLE));
  const endTick = log.end ? log.end.tick : (log.frames.length ? log.frames[log.frames.length - 1].t : 0);
  let fi = 0, ci = 0, divergedAt: number | null = null;
  for (let t = 1; t <= endTick && s.phase === "play"; t++) {
    while (fi < log.frames.length && log.frames[fi].t === t) { const f = log.frames[fi++]; cur[f.d] = copy(f.i); }
    step(s, cur);
    if (onTick) onTick(s);
    if (ci < log.checkpoints.length && log.checkpoints[ci].t === s.tick) {
      if (divergedAt === null && stateHash(s) !== log.checkpoints[ci].h) divergedAt = s.tick;
      ci++;
    }
  }
  const hash = stateHash(s);
  const ok = divergedAt === null && (!log.end || (log.end.hash === hash && log.end.tick === s.tick));
  if (!ok && divergedAt === null) divergedAt = s.tick;
  return { state: s, hash, ok, divergedAt, ticks: s.tick };
}
