// The input log: the run's configuration and every change of any delver's input, by tick. It is
// the whole run — a bot's inputs are logged like a person's, so a replay needs no bot code — and
// with the final hash it is the replay artifact of SPEC §3.4: anyone who runs it through the same
// simulation gets the same deaths. Checkpoints every `checkEvery` ticks locate a divergence.
import { type Input, type RunConfig, type RunState, IDLE, createRun, step, stateHash, sanitize } from "./sim.ts";

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
  lastTick = 0;
  checkEvery: number;
  /** Takes its own copy of the config, so the log is the run as created whatever the caller does later. */
  constructor(cfg: RunConfig, checkEvery = 600) {
    const own = structuredClone(cfg);
    this.log = { v: 1, cfg: own, frames: [], checkpoints: [], end: null };
    this.last = own.delvers.map(() => copy(IDLE));
    this.checkEvery = checkEvery;
  }
  /** Record the inputs for the tick about to be stepped — state.tick + 1 — in their canonical form,
   *  and return the array to step with. Call it once per tick, before `step`. */
  record(s: RunState, inputs: readonly (Input | undefined)[]): Input[] {
    const tick = s.tick + 1;
    if (s.phase !== "play") throw new Error(`record: the run has ended at tick ${s.tick}`);
    if (tick !== this.lastTick + 1) throw new Error(`record: tick ${tick} after ${this.lastTick}; one call per tick, in order`);
    this.lastTick = tick;
    for (let d = 0; d < this.last.length; d++) {
      const i = sanitize(inputs[d]);
      if (!inputsEqual(i, this.last[d])) { this.last[d] = i; this.log.frames.push({ t: tick, d, i: copy(i) }); }
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
/** Run the log through the simulation and compare every checkpoint and the end. A log without an
 *  end is replayed to its last frame or checkpoint, whichever is later, and must get there. */
export function replay(log: InputLog, onTick?: (s: RunState) => void): ReplayResult {
  const s = createRun(log.cfg);
  const cur: Input[] = log.cfg.delvers.map(() => copy(IDLE));
  const lastFrame = log.frames.length ? log.frames[log.frames.length - 1].t : 0;
  const lastCheck = log.checkpoints.length ? log.checkpoints[log.checkpoints.length - 1].t : 0;
  const endTick = log.end ? log.end.tick : Math.max(lastFrame, lastCheck);
  let fi = 0, ci = 0, divergedAt: number | null = null;
  for (let t = 1; t <= endTick && s.phase === "play"; t++) {
    while (fi < log.frames.length && log.frames[fi].t <= t) { const f = log.frames[fi++]; cur[f.d] = sanitize(f.i); }
    step(s, cur);
    if (onTick) onTick(s);
    while (ci < log.checkpoints.length && log.checkpoints[ci].t <= s.tick) {
      if (log.checkpoints[ci].t === s.tick && divergedAt === null && stateHash(s) !== log.checkpoints[ci].h) divergedAt = s.tick;
      ci++;
    }
  }
  const hash = stateHash(s);
  const ok = divergedAt === null && s.tick === endTick && (!log.end || log.end.hash === hash);
  if (!ok && divergedAt === null) divergedAt = s.tick;
  return { state: s, hash, ok, divergedAt, ticks: s.tick };
}
