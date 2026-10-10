// The simulation: one class, one dungeon, one boss, on a fixed 60 Hz tick in integers. The server
// of SPEC §3.4 in miniature — inputs in, state out, nothing else. Every number in the state is an
// integer (stateHash throws otherwise); every roll comes from the committed secret's per-tick
// stream; the step order is fixed, so a log of inputs replays to the same hash on any engine.
//
// What is the slice's and what is new: rooms, enemies, the Turnkey's phases, skills and recall
// are the slice's numbers (content.ts). New, from docs/red-team.md: a sealed boss door with a
// ready plate (C2), the boss scaled to who is inside, a hard run length and a halt rule (D5),
// and settlement as the §3.5 lottery weighted by value wagered behind a contribution bar (B1–B3),
// with the dead's gear paying a later run (B7, C1) and fresh drops under a budget (A1, A2).
import { ONE, TILE, TURN, div, floorDiv, px, len, dist2, toward, towardTurned, fromAngle, cos, sin, Q14, sign, abs } from "./fixed.ts";
import { Rng, Digest, tickRng, settleRng, hashInts, type RunSeed } from "./rng.ts";
import * as C from "./content.ts";
import { type World, genWorld, boxFree, solidAt, inBossRoom, tileCentre } from "./world.ts";

export type Status = "in" | "dead" | "recalled" | "extracted" | "halted";
export interface Input {
  mx: -1 | 0 | 1; my: -1 | 0 | 1;
  aim: boolean; ax: number; ay: number;     // a point in the world, units
  fire: boolean; skill: boolean; recall: boolean; ready: boolean;
}
export const IDLE: Readonly<Input> = Object.freeze({ mx: 0, my: 0, aim: false, ax: 0, ay: 0, fire: false, skill: false, recall: false, ready: false });

export interface DelverSpec { name: string; wager: (C.Item | null)[] }
export type DoorMode = "sealed" | "open";
export interface RunConfig {
  seed: RunSeed;
  delvers: DelverSpec[];
  door: DoorMode;
  packScale?: number;          // percent of the slice's enemy counts; default 100
  hardTicks?: number;          // default C.HARD_TICKS
  bossHpPerDelver?: number;    // default C.BOSS.hpPerDelver
  danger?: number;             // percent scaling of every hit a delver takes; default 100. SPEC §4: the
                               // death rate and the difficulty are the same dial, and this is the dial
}

export interface Delver {
  id: number; name: string; x: number; y: number; face: -1 | 1; moving: boolean;
  hp: number; maxhp: number; dmg: number; fireTicks: number; skill: C.SkillId | -1; light: number;
  cd: number; scd: number; dash: number; ddx: number; ddy: number; recall: number; rlock: number; flash: number; fullAt: number;
  wager: (C.Item | null)[]; carried: C.Item[]; fate: ("burn" | "pool" | "")[];
  status: Status; outAt: number; locked: boolean; ready: boolean; sealedOut: boolean;
  dealt: number; healed: number; taken: number; shots: number; mends: number;
}
export interface Enemy { id: number; kind: C.EnemyKind; x: number; y: number; hp: number; maxhp: number; awake: boolean; cd: number; dir: -1 | 1; face: -1 | 1; flash: number; ph: number }
export interface Boss { x: number; y: number; hx: number; hy: number; hp: number; maxhp: number; t: number; a: number; phase: 1 | 2 | 3; awake: boolean; dead: boolean; deadAt: number; face: -1 | 1; flash: number }
export interface Bullet { id: number; x: number; y: number; vx: number; vy: number; kind: C.BulletKind; dmg: number; r: number; foe: boolean; owner: number; life: number }
export interface Bag { id: number; x: number; y: number; vx: number; vy: number; item: C.Item | null; t: number }
export type DoorPhase = "none" | "shut" | "counting" | "open" | "sealed";
export type EndReason = "" | "cleared" | "wiped" | "empty" | "halt";

export type Event =
  | { k: "hit"; who: number; x: number; y: number; dmg: number }
  | { k: "hurt"; x: number; y: number; dmg: number; boss: boolean; owner: number }
  | { k: "die"; who: number; x: number; y: number; burned: number; pooled: number }
  | { k: "kill"; kind: C.EnemyKind; x: number; y: number }
  | { k: "gone"; x: number; y: number; kind: C.BulletKind }
  | { k: "wake"; n: number } | { k: "phase"; phase: number; x: number; y: number } | { k: "bossdead"; x: number; y: number } | { k: "portal"; x: number; y: number }
  | { k: "mend"; who: number; x: number; y: number; n: number } | { k: "dash"; who: number; x: number; y: number } | { k: "sunder"; who: number; x: number; y: number }
  | { k: "recallbroken"; who: number } | { k: "recalled"; who: number; left: number } | { k: "extract"; who: number; carried: number }
  | { k: "pickup"; who: number; x: number; y: number; item: C.Item | null } | { k: "full"; who: number; x: number; y: number }
  | { k: "door"; phase: DoorPhase } | { k: "sealedout"; who: number; left: number } | { k: "halt"; n: number } | { k: "spawn"; kind: C.EnemyKind; x: number; y: number };

export interface RunState {
  cfg: RunConfig; tick: number; phase: "play" | "ended"; reason: EndReason;
  world: World;
  delvers: Delver[]; enemies: Enemy[]; boss: Boss; bullets: Bullet[]; bags: Bag[]; nextId: number;
  door: { phase: DoorPhase; timer: number }; portal: boolean; leftBehind: C.Item[];
  events: Event[];
}

function kitStats(wager: (C.Item | null)[]): { dmg: number; maxhp: number; fireTicks: number; skill: C.SkillId | -1; light: number } {
  const tier = (slot: number): number => { const it = wager[slot]; return it ? C.ITEMS[it.id].tier : 0; };
  const sk = wager[4] ? C.ITEMS[wager[4].id].skill : undefined;
  return {
    dmg: C.DMG_BY_WEAPON[tier(0)], maxhp: C.MAXHP_BY_ARMOUR[tier(1)], fireTicks: C.FIRE_TICKS_BY_RING[tier(2)],
    skill: sk === undefined ? -1 : sk, light: C.LIGHT_BY_RELIC[wager[3] ? 1 : 0],
  };
}
export function mkItem(id: string, rng: Rng): C.Item { return { id, dur: C.DUR_NEW_MIN + rng.below(C.DUR_NEW_SPREAD) }; }
/** A fresh tier-1 kit with the given skill, as the slice mints one. */
export function freshKit(skill: C.SkillId, rng: Rng): (C.Item | null)[] {
  return [mkItem("wand1", rng), mkItem("robe1", rng), mkItem("ring1", rng), null, { id: C.SKILL_ITEM[skill], dur: 90 }];
}
export function wagerValue(wager: (C.Item | null)[]): number { let v = 0; for (const it of wager) v += C.itemValue(it); return v; }

/** Reject a config the simulation could not replay: every number a safe integer, every item known. */
export function validateConfig(cfg: RunConfig): void {
  const int = (v: unknown, what: string): void => { if (!Number.isSafeInteger(v)) throw new Error(`config: ${what} must be a safe integer, got ${String(v)}`); };
  int(cfg.seed.dungeon, "seed.dungeon"); int(cfg.seed.entryBlock, "seed.entryBlock");
  if (!Array.isArray(cfg.seed.secret) || cfg.seed.secret.length === 0) throw new Error("config: seed.secret must be a non-empty array");
  cfg.seed.secret.forEach((w, i) => int(w, `seed.secret[${i}]`));
  for (const k of ["packScale", "hardTicks", "bossHpPerDelver", "danger"] as const) if (cfg[k] !== undefined) int(cfg[k], k);
  if (cfg.door !== "sealed" && cfg.door !== "open") throw new Error(`config: door must be sealed or open, got ${String(cfg.door)}`);
  if (!Array.isArray(cfg.delvers) || cfg.delvers.length === 0) throw new Error("config: at least one delver");
  cfg.delvers.forEach((d, i) => {
    if (typeof d.name !== "string" || !Array.isArray(d.wager) || d.wager.length !== 5) throw new Error(`config: delver ${i} needs a name and five wager slots`);
    d.wager.forEach((it, slot) => {
      if (it === null) return;
      if (!C.ITEMS[it.id]) throw new Error(`config: delver ${i} slot ${slot}: unknown item ${String(it.id)}`);
      if (C.ITEMS[it.id].slot !== slot) throw new Error(`config: delver ${i}: ${it.id} does not go in slot ${slot}`);
      int(it.dur, `delver ${i} slot ${slot} dur`);
    });
  });
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o as object)) deepFreeze((o as Record<string, unknown>)[k]); }
  return o;
}
/** The simulation keeps its own frozen copy of the config: nothing a caller does to its object afterwards reaches a live run. */
export function createRun(cfgIn: RunConfig): RunState {
  validateConfig(cfgIn);
  const cfg = deepFreeze(structuredClone(cfgIn));
  const world = genWorld(cfg.seed.dungeon);
  const rng = tickRng(cfg.seed, 0);
  const [sx, sy] = world.spawn;
  // the shard spawns on a grid in the hall, 10 px apart, as square as the count allows
  const n = cfg.delvers.length;
  let cols = 3;
  while (cols * cols * 10 < n * 14) cols++;
  const rows = div(n - 1, cols);
  const delvers: Delver[] = cfg.delvers.map((spec, i) => {
    const st = kitStats(spec.wager);
    const col = i % cols, row = div(i, cols);
    return {
      id: i, name: spec.name, x: sx + (2 * col - (cols - 1)) * px(5), y: sy + (2 * row - rows) * px(5), face: 1, moving: false,
      hp: st.maxhp, maxhp: st.maxhp, dmg: st.dmg, fireTicks: st.fireTicks, skill: st.skill, light: st.light,
      cd: 0, scd: 0, dash: 0, ddx: 0, ddy: 0, recall: 0, rlock: 0, flash: 0, fullAt: -1000,
      wager: spec.wager.map((it) => (it ? { id: it.id, dur: it.dur } : null)), carried: [], fate: ["", "", "", "", ""],
      status: "in", outAt: 0, locked: false, ready: false, sealedOut: false, dealt: 0, healed: 0, taken: 0, shots: 0, mends: 0,
    };
  });
  const s: RunState = {
    cfg, tick: 0, phase: "play", reason: "", world, delvers, enemies: [], bullets: [], bags: [], nextId: 1,
    boss: null as unknown as Boss, door: { phase: cfg.door === "sealed" ? "shut" : "none", timer: 0 }, portal: false, leftBehind: [], events: [],
  };
  const scale = cfg.packScale ?? 100;
  for (let i = 1; i < 5; i++) {
    const r = world.rooms[i];
    for (const [kind, n] of C.PACKS[i]) {
      const count = div(n * scale, 100);
      for (let k = 0; k < count; k++) {
        const x = r.x * TILE + div(3 * TILE, 2) + rng.below((r.w - 3) * TILE);
        const y = r.y * TILE + div(3 * TILE, 2) + rng.below((r.h - 3) * TILE);
        spawnEnemy(s, kind, x, y, rng, false);
      }
    }
  }
  const br = world.rooms[5];
  const bx = div((2 * br.x + br.w) * TILE, 2), by = div((2 * br.y + br.h) * TILE, 2);
  s.boss = { x: bx, y: by, hx: bx, hy: by, hp: 1, maxhp: 1, t: 0, a: 0, phase: 1, awake: false, dead: false, deadAt: 0, face: 1, flash: 0 };
  return s;
}

function spawnEnemy(s: RunState, kind: C.EnemyKind, x: number, y: number, rng: Rng, awake: boolean): Enemy {
  const D = C.ENEMY[kind];
  const e: Enemy = { id: s.nextId++, kind, x, y, hp: D.hp, maxhp: D.hp, awake, cd: 30 + rng.below(60), dir: rng.dir(), face: 1, flash: 0, ph: rng.below(100) };
  s.enemies.push(e);
  return e;
}
function doorShut(s: RunState): boolean { const p = s.door.phase; return p === "shut" || p === "counting" || p === "sealed"; }
function tryMove(s: RunState, e: { x: number; y: number }, hw: number, hh: number, vx: number, vy: number): void {
  const shut = doorShut(s);
  if (vx !== 0 && boxFree(s.world, e.x + vx, e.y, hw, hh, shut)) e.x += vx;
  if (vy !== 0 && boxFree(s.world, e.x, e.y + vy, hw, hh, shut)) e.y += vy;
}
function shoot(s: RunState, x: number, y: number, vx: number, vy: number, kind: C.BulletKind, dmg: number, r: number, foe: boolean, owner: number, life: number): void {
  s.bullets.push({ id: s.nextId++, x, y, vx, vy, kind, dmg, r, foe, owner, life });
}
function living(s: RunState): Delver[] { return s.delvers.filter((d) => d.status === "in"); }
function nearestDelver(s: RunState, x: number, y: number): Delver | null {
  let best: Delver | null = null, bd = Number.MAX_SAFE_INTEGER;
  for (const d of s.delvers) {
    if (d.status !== "in") continue;
    const q = dist2(x, y, d.x, d.y);
    if (q < bd) { bd = q; best = d; }
  }
  return best;
}
function onPlate(s: RunState, d: Delver): boolean {
  const [pxl, pyl] = tileCentre(s.world.door.plate[0], s.world.door.plate[1]);
  const r = px(16 * C.DOOR.plateR + 8);
  return dist2(d.x, d.y, pxl, pyl) <= r * r;
}
function dropBag(s: RunState, x: number, y: number, item: C.Item | null, burst: boolean, rng: Rng): void {
  const a = rng.below(TURN), v = burst ? 256 + rng.below(563) : 102;
  const [vx, vy0] = fromAngle(a, v);
  s.bags.push({ id: s.nextId++, x, y, vx, vy: floorDiv(vy0 * 4, 5), item, t: 0 });
}
function leave(s: RunState, d: Delver, status: Status): number {
  d.status = status; d.outAt = s.tick; d.recall = 0; d.ready = false;
  const n = d.carried.length;
  for (const it of d.carried) s.leftBehind.push(it);
  d.carried = [];
  return n;
}
function wakeBoss(s: RunState, n: number): void {
  const b = s.boss, per = s.cfg.bossHpPerDelver ?? C.BOSS.hpPerDelver;
  b.awake = true; b.maxhp = per * Math.max(1, n); b.hp = b.maxhp;
  s.events.push({ k: "wake", n });
}

/** The canonical form of an input: what the simulation acts on, and what the log records. */
export function sanitize(i: Input | undefined): Input {
  if (!i) return IDLE;
  const num = (v: number, lim: number): number => (Number.isFinite(v) ? Math.max(-lim, Math.min(lim, Math.trunc(v))) : 0);
  return {
    mx: sign(num(i.mx, 1)), my: sign(num(i.my, 1)), aim: !!i.aim, ax: num(i.ax, 1 << 24), ay: num(i.ay, 1 << 24),
    fire: !!i.fire, skill: !!i.skill, recall: !!i.recall, ready: !!i.ready,
  };
}

function updateDelver(s: RunState, d: Delver, raw: Input | undefined, rng: Rng): void {
  const inp = sanitize(raw);
  if (d.flash > 0) d.flash--;
  if (d.scd > 0) d.scd--;
  if (d.rlock > 0) d.rlock--;
  if (d.cd > 0) d.cd--;
  if (s.tick % C.DELVER.regenEvery === 0 && d.hp < d.maxhp) d.hp = Math.min(d.maxhp, d.hp + C.DELVER.regen);
  const mayRecall = !d.locked && (s.cfg.door === "sealed" || !s.boss.awake);
  const rec = inp.recall && mayRecall && d.rlock <= 0 && d.dash <= 0;
  d.moving = inp.mx !== 0 || inp.my !== 0;
  if (d.dash > 0) {
    d.dash--;
    tryMove(s, d, C.DELVER.hw, C.DELVER.hh, d.ddx, d.ddy);
  } else if (d.moving) {
    const [vx, vy] = toward(inp.mx, inp.my, rec ? C.DELVER.recallSpeed : C.DELVER.speed);
    tryMove(s, d, C.DELVER.hw, C.DELVER.hh, vx, vy);
  }
  if (inp.aim) d.face = inp.ax < d.x ? -1 : 1; else if (inp.mx !== 0) d.face = inp.mx;
  if (inp.skill && d.scd <= 0 && !rec && d.dash <= 0 && d.skill >= 0) useSkill(s, d, inp, rng);
  if (rec) {
    if (++d.recall >= C.RECALL.ticks) { const left = leave(s, d, "recalled"); s.events.push({ k: "recalled", who: d.id, left }); return; }
  } else d.recall = 0;
  if (inp.fire && inp.aim && !rec && d.dash <= 0 && d.cd <= 0) {
    d.cd = d.fireTicks; d.shots++;
    const oy = d.y - C.DELVER.boltY;
    const [vx, vy] = toward(inp.ax - d.x, inp.ay - oy, C.DELVER.boltSpeed);
    if (vx !== 0 || vy !== 0) shoot(s, d.x, oy, vx, vy, "bolt", d.dmg, px(2), false, d.id, C.DELVER.boltLife);
  }
  d.ready = s.door.phase !== "none" && inp.ready && onPlate(s, d);
  for (let i = s.bags.length - 1; i >= 0; i--) {
    const b = s.bags[i];
    if (b.t < 24 || dist2(b.x, b.y, d.x, d.y) > C.DELVER.pickupR2) continue;
    if (!b.item) { d.hp = Math.min(d.maxhp, d.hp + C.FLASK_HEAL); s.events.push({ k: "pickup", who: d.id, x: d.x, y: d.y, item: null }); s.bags.splice(i, 1); }
    else if (d.carried.length < C.DELVER.packMax) { d.carried.push(b.item); s.events.push({ k: "pickup", who: d.id, x: d.x, y: d.y, item: b.item }); s.bags.splice(i, 1); }
    else if (s.tick - d.fullAt > 90) { d.fullAt = s.tick; s.events.push({ k: "full", who: d.id, x: d.x, y: d.y }); }
  }
  if (s.portal && dist2(d.x, d.y, s.boss.hx, s.boss.hy) < C.BOSS.portalR2) {
    const n = d.carried.length;
    d.status = "extracted"; d.outAt = s.tick; d.recall = 0;
    s.events.push({ k: "extract", who: d.id, carried: n });
    return;
  }
  if (s.cfg.door === "open" && !s.boss.awake && !s.boss.dead && inBossRoom(s.world, d.x, d.y)) {
    const alive = living(s);
    for (const o of alive) o.locked = true;
    wakeBoss(s, alive.length);
  }
}
function useSkill(s: RunState, d: Delver, inp: Input, rng: Rng): void {
  const oy = d.y - C.DELVER.boltY;
  if (d.skill === 0) {
    let dx = inp.mx, dy = inp.my;
    if (dx === 0 && dy === 0) { if (inp.aim) { dx = inp.ax - d.x; dy = inp.ay - oy; } else { dx = d.face; dy = 0; } }
    if (dx === 0 && dy === 0) dx = 1;
    [d.ddx, d.ddy] = toward(dx, dy, C.SKILL.slip.speed);
    d.dash = C.SKILL.slip.ticks; d.scd = C.SKILL.slip.cd;
    s.events.push({ k: "dash", who: d.id, x: d.x, y: d.y });
  } else if (d.skill === 1) {
    let n = 0;
    const r2 = C.SKILL.mend.radius * C.SKILL.mend.radius;
    for (const t of s.delvers) {
      if (t.status !== "in" || dist2(d.x, d.y, t.x, t.y) > r2) continue;
      const before = t.hp;
      t.hp = Math.min(t.maxhp, t.hp + C.SKILL.mend.heal);
      d.healed += t.hp - before; n++;
    }
    d.mends++; d.scd = C.SKILL.mend.cd;
    s.events.push({ k: "mend", who: d.id, x: d.x, y: d.y, n });
  } else {
    let dx = d.face, dy = 0;
    if (inp.aim) { dx = inp.ax - d.x; dy = inp.ay - oy; if (dx === 0 && dy === 0) dx = d.face; }
    const K = C.SKILL.sunder;
    for (let i = -2; i <= 2; i++) {
      const [vx, vy] = towardTurned(dx, dy, i * K.spread, K.speed);
      if (vx !== 0 || vy !== 0) shoot(s, d.x, oy, vx, vy, "bolt_heavy", d.dmg * K.mult, px(3), false, d.id, K.life);
    }
    d.scd = K.cd;
    s.events.push({ k: "sunder", who: d.id, x: d.x, y: d.y });
  }
}
function hurtDelver(s: RunState, t: Delver, dmg: number, rng: Rng): void {
  dmg = div(dmg * (s.cfg.danger ?? 100), 100);
  t.hp -= dmg; t.flash = 6; t.taken += dmg;
  s.events.push({ k: "hit", who: t.id, x: t.x, y: t.y, dmg });
  if (t.recall > 0) s.events.push({ k: "recallbroken", who: t.id });
  t.recall = 0; t.rlock = C.RECALL.lock;
  if (t.hp <= 0) killDelver(s, t, rng);
}
function killDelver(s: RunState, t: Delver, rng: Rng): void {
  t.hp = 0; t.status = "dead"; t.outAt = s.tick; t.recall = 0; t.ready = false;
  let burned = 0, pooled = 0;
  for (let i = 0; i < 5; i++) {
    if (!t.wager[i]) { t.fate[i] = ""; continue; }
    if (rng.chance(1, 3)) { t.fate[i] = "pool"; pooled++; } else { t.fate[i] = "burn"; burned++; }
  }
  for (const it of t.carried) s.bags.push({ id: s.nextId++, x: t.x, y: t.y, vx: 0, vy: 0, item: it, t: 0 });
  t.carried = [];
  s.events.push({ k: "die", who: t.id, x: t.x, y: t.y, burned, pooled });
}
function updateEnemy(s: RunState, e: Enemy, rng: Rng): void {
  if (e.flash > 0) e.flash--;
  const t = nearestDelver(s, e.x, e.y);
  if (!t) return;
  const dx = t.x - e.x, dy = t.y - e.y, d = len(dx, dy) || 1, D = C.ENEMY[e.kind];
  if (!e.awake) { if (d < D.aggro || e.hp < e.maxhp) e.awake = true; else return; }
  e.face = dx < 0 ? -1 : 1;
  const ux = div(dx * 1024, d), uy = div(dy * 1024, d);
  let mx = 0, my = 0;
  if (e.kind === "shade") {
    const pull = div((d - D.keep) * 1024, D.keep);
    mx = -uy * e.dir + div(ux * pull, 1024); my = ux * e.dir + div(uy * pull, 1024);
  } else {
    if (d > div(D.keep * 6, 5)) { mx = ux; my = uy; } else if (d < div(D.keep * 7, 10)) { mx = -ux; my = -uy; }
    mx += div(-uy * e.dir, 2); my += div(ux * e.dir, 2);
  }
  const [vx, vy] = toward(mx, my, D.speed);
  tryMove(s, e, C.DELVER.hw, C.DELVER.hh, vx, vy);
  if (rng.chance(8, 1000)) e.dir = e.dir === 1 ? -1 : 1;
  e.cd--;
  if (e.cd <= 0 && d < C.ENEMY_RANGE) {
    e.cd = div(D.fire * (80 + rng.below(41)), 100);
    const sx = e.x, sy = e.y - D.shotY, ax = t.x - sx, ay = t.y - C.DELVER.boltY - sy;
    if (e.kind === "forgotten") {
      const [vx2, vy2] = toward(ax, ay, C.SHOT.bone.speed);
      shoot(s, sx, sy, vx2, vy2, "bone", C.SHOT.bone.dmg, C.SHOT.bone.r, true, -1, C.FOE_BULLET_LIFE);
    } else if (e.kind === "shade") {
      for (let i = -1; i <= 1; i++) {
        const [vx2, vy2] = towardTurned(ax, ay, i * C.SHOT.purple.spread, C.SHOT.purple.speed);
        shoot(s, sx, sy, vx2, vy2, "purple", C.SHOT.purple.dmg, C.SHOT.purple.r, true, -1, C.FOE_BULLET_LIFE);
      }
    } else {
      const o = rng.below(98);
      for (let i = 0; i < C.SHOT.redRing.n; i++) {
        const [vx2, vy2] = fromAngle(o + div(i * TURN, C.SHOT.redRing.n), C.SHOT.redRing.speed);
        shoot(s, sx, sy, vx2, vy2, "red", C.SHOT.redRing.dmg, C.SHOT.redRing.r, true, -1, C.FOE_BULLET_LIFE);
      }
    }
  }
}
function updateBoss(s: RunState, rng: Rng): void {
  const b = s.boss;
  if (b.flash > 0) b.flash--;
  if (!b.awake || b.dead) return;
  b.t++;
  const ph: 1 | 2 | 3 = b.hp * 3 > b.maxhp * 2 ? 1 : b.hp * 3 > b.maxhp ? 2 : 3;
  const sx = b.x, sy = b.y - C.BOSS.shotY;
  if (ph !== b.phase) {
    b.phase = ph;
    s.events.push({ k: "phase", phase: ph, x: b.x, y: b.y });
    for (let i = 0; i < C.SHOT.phaseRing.n; i++) {
      const [vx, vy] = fromAngle(div(i * TURN, C.SHOT.phaseRing.n), C.SHOT.phaseRing.speed);
      shoot(s, sx, sy, vx, vy, "orange", C.SHOT.phaseRing.dmg, C.SHOT.phaseRing.r, true, -1, C.FOE_BULLET_LIFE);
    }
  }
  const tx = b.hx + floorDiv(cos(floorDiv(b.t * C.BOSS.wanderAx, 1024)) * C.BOSS.wanderX, Q14);
  const ty = b.hy + floorDiv(sin(floorDiv(b.t * C.BOSS.wanderAy, 1024)) * C.BOSS.wanderY, Q14);
  const wx = tx - b.x, wy = ty - b.y;
  if (len(wx, wy) > ONE) { const [vx, vy] = toward(wx, wy, C.BOSS.speed); tryMove(s, b, C.BOSS.hw, C.BOSS.hh, vx, vy); }
  const t = nearestDelver(s, b.x, b.y);
  if (!t) return;
  const ax = t.x - sx, ay = t.y - C.DELVER.boltY - sy;
  b.face = t.x < b.x ? -1 : 1;
  const S = C.SHOT;
  if (ph === 1) {
    if (b.t % 8 === 0) {
      b.a = (b.a + C.BOSS.spiral1) % TURN;
      for (const a of [b.a, b.a + TURN / 2]) { const [vx, vy] = fromAngle(a, S.orange.speed); shoot(s, sx, sy, vx, vy, "orange", S.orange.dmg, S.orange.r, true, -1, C.FOE_BULLET_LIFE); }
    }
    if (b.t % 170 === 90) for (let i = -2; i <= 2; i++) {
      const [vx, vy] = towardTurned(ax, ay, i * S.redAim1.spread, S.redAim1.speed);
      shoot(s, sx, sy, vx, vy, "red", S.redAim1.dmg, S.redAim1.r, true, -1, C.FOE_BULLET_LIFE);
    }
  } else if (ph === 2) {
    if (b.t % 72 === 0) {
      const o = (div(b.t, 72) % 2) * S.purpleRing.offset;
      for (let i = 0; i < S.purpleRing.n; i++) { const [vx, vy] = fromAngle(o + div(i * TURN, S.purpleRing.n), S.purpleRing.speed); shoot(s, sx, sy, vx, vy, "purple", S.purpleRing.dmg, S.purpleRing.r, true, -1, C.FOE_BULLET_LIFE); }
    }
    if (b.t % 110 === 55) for (let i = -1; i <= 1; i++) {
      const [vx, vy] = towardTurned(ax, ay, i * S.redAim2.spread, S.redAim2.speed);
      shoot(s, sx, sy, vx, vy, "red", S.redAim2.dmg, S.redAim2.r, true, -1, C.FOE_BULLET_LIFE);
    }
    if (b.t % 540 === 200) {
      let n = 0;
      for (const e of s.enemies) if (e.kind === "shade") n++;
      if (n < C.BOSS.shadeCap) for (let i = 0; i < 2; i++) {
        const x = b.x + (i ? px(40) : -px(40));
        spawnEnemy(s, "shade", x, b.y, rng, true);
        s.events.push({ k: "spawn", kind: "shade", x, y: b.y });
      }
    }
  } else {
    if (b.t % 7 === 0) {
      b.a = (b.a + C.BOSS.spiral3) % TURN;
      const [vx, vy] = fromAngle(b.a, S.orange3.speed); shoot(s, sx, sy, vx, vy, "orange", S.orange3.dmg, S.orange3.r, true, -1, C.FOE_BULLET_LIFE);
      const [vx2, vy2] = fromAngle(TURN / 2 - div(b.a * 13, 10), S.orange3.speed); shoot(s, sx, sy, vx2, vy2, "purple", S.orange3.dmg, S.orange3.r, true, -1, C.FOE_BULLET_LIFE);
    }
    if (b.t % 150 === 0) {
      const o = rng.below(TURN);
      for (let i = 0; i < S.big.n; i++) { const [vx, vy] = fromAngle(o + div(i * TURN, S.big.n), S.big.speed); shoot(s, sx, sy, vx, vy, "big", S.big.dmg, S.big.r, true, -1, S.big.life); }
    }
  }
}
function killEnemy(s: RunState, e: Enemy, rng: Rng): void {
  s.events.push({ k: "kill", kind: e.kind, x: e.x, y: e.y });
  const q = rng.below(100);
  if (e.kind === "gaoler") {
    if (q < 30) dropBag(s, e.x, e.y, null, false, rng);
    else if (q < 80) dropBag(s, e.x, e.y, mkItem(C.BY_TIER[2][rng.below(3)], rng), false, rng);
    else dropBag(s, e.x, e.y, mkItem(C.BY_TIER[1][rng.below(3)], rng), false, rng);
  } else if (e.kind === "forgotten") {
    if (q < 12) dropBag(s, e.x, e.y, null, false, rng);
    else if (q < 20) dropBag(s, e.x, e.y, mkItem(C.BY_TIER[1][rng.below(3)], rng), false, rng);
  } else if (q < 10) dropBag(s, e.x, e.y, null, false, rng);
}
function killBoss(s: RunState): void {
  const b = s.boss;
  b.dead = true; b.hp = 0; b.deadAt = s.tick;
  s.events.push({ k: "bossdead", x: b.x, y: b.y });
  for (const bl of s.bullets) if (bl.foe) { bl.life = 0; s.events.push({ k: "gone", x: bl.x, y: bl.y, kind: bl.kind }); }
  for (const e of s.enemies) if (e.awake) { e.hp = 0; s.events.push({ k: "kill", kind: e.kind, x: e.x, y: e.y }); }
}
function updateBullets(s: RunState, rng: Rng): void {
  const B = s.boss, shut = doorShut(s);
  for (const b of s.bullets) {
    if (b.life <= 0) continue;
    b.x += b.vx; b.y += b.vy; b.life--;
    let gone = b.life <= 0 || solidAt(s.world, b.x, b.y + px(4), shut);
    if (!gone) {
      if (!b.foe) {
        for (const e of s.enemies) {
          if (e.hp <= 0) continue;
          const rr = b.r + C.ENEMY[e.kind].hitR;
          if (dist2(b.x, b.y, e.x, e.y - C.ENEMY[e.kind].shotY) < rr * rr) {
            e.hp -= b.dmg; e.flash = 4; e.awake = true; gone = true;
            if (b.owner >= 0) s.delvers[b.owner].dealt += b.dmg;
            s.events.push({ k: "hurt", x: e.x, y: e.y, dmg: b.dmg, boss: false, owner: b.owner });
            if (e.hp <= 0) killEnemy(s, e, rng);
            break;
          }
        }
        if (!gone && B.awake && !B.dead) {
          const rr = b.r + C.BOSS.hitR;
          if (dist2(b.x, b.y, B.x, B.y - C.BOSS.shotY) < rr * rr) {
            B.hp -= b.dmg; B.flash = 2; gone = true;
            if (b.owner >= 0) s.delvers[b.owner].dealt += b.dmg;
            s.events.push({ k: "hurt", x: B.x, y: B.y, dmg: b.dmg, boss: true, owner: b.owner });
            if (B.hp <= 0) killBoss(s);
          }
        }
      } else {
        for (const t of s.delvers) {
          if (t.status !== "in" || t.dash > 0) continue;
          const rr = b.r + C.DELVER.hitR;
          if (dist2(b.x, b.y, t.x, t.y - C.DELVER.boltY) < rr * rr) { hurtDelver(s, t, b.dmg, rng); gone = true; break; }
        }
      }
    }
    if (gone) { if (b.life > 0) s.events.push({ k: "gone", x: b.x, y: b.y, kind: b.kind }); b.life = 0; }
  }
}
function updateBags(s: RunState): void {
  for (const b of s.bags) {
    b.t++;
    if (abs(b.vx) + abs(b.vy) > 5) {
      if (!solidAt(s.world, b.x + b.vx, b.y, true)) b.x += b.vx; else b.vx = -div(b.vx, 2);
      if (!solidAt(s.world, b.x, b.y + b.vy, true)) b.y += b.vy; else b.vy = -div(b.vy, 2);
      b.vx = div(b.vx * 92, 100); b.vy = div(b.vy * 92, 100);
    }
  }
}
function updateDoor(s: RunState): void {
  const dr = s.door;
  if (dr.phase === "none" || dr.phase === "sealed") return;
  const alive = living(s);
  if (dr.phase === "shut") {
    if (alive.some((d) => d.ready)) { dr.phase = "counting"; dr.timer = C.DOOR.readyTicks; s.events.push({ k: "door", phase: "counting" }); }
    return;
  }
  if (dr.phase === "counting") {
    dr.timer--;
    const all = alive.length > 0 && alive.every((d) => d.ready);
    if (all || dr.timer <= 0) { dr.phase = "open"; dr.timer = C.DOOR.openTicks; s.events.push({ k: "door", phase: "open" }); }
    return;
  }
  dr.timer--;
  if (dr.timer > 0) return;
  dr.phase = "sealed"; s.events.push({ k: "door", phase: "sealed" });
  let n = 0;
  for (const d of alive) {
    if (inBossRoom(s.world, d.x, d.y)) { d.locked = true; n++; }
    else { const left = leave(s, d, "recalled"); d.sealedOut = true; s.events.push({ k: "sealedout", who: d.id, left }); }
  }
  if (n > 0) wakeBoss(s, n);
}

/** Advance one tick. `inputs[i]` is delver i's input for this tick; missing entries are idle. */
export function step(s: RunState, inputs: readonly (Input | undefined)[]): void {
  if (s.phase !== "play") return;
  s.tick++;
  s.events = [];
  const rng = tickRng(s.cfg.seed, s.tick);
  for (const d of s.delvers) if (d.status === "in") updateDelver(s, d, inputs[d.id], rng);
  for (const e of s.enemies) if (e.hp > 0) updateEnemy(s, e, rng);
  updateBoss(s, rng);
  updateBullets(s, rng);
  updateBags(s);
  updateDoor(s);
  if (s.boss.dead && !s.portal && s.tick >= s.boss.deadAt + C.BOSS.portalAfter) { s.portal = true; s.events.push({ k: "portal", x: s.boss.hx, y: s.boss.hy }); }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
  s.bullets = s.bullets.filter((b) => b.life > 0);
  const hard = s.cfg.hardTicks ?? C.HARD_TICKS;
  const alive = living(s);
  if (alive.length === 0) {
    s.phase = "ended";
    s.reason = s.boss.dead ? "cleared" : s.delvers.every((d) => d.status === "dead") ? "wiped" : "empty";
  } else if (s.tick >= hard) {
    for (const d of alive) leave(s, d, "halted");
    s.phase = "ended"; s.reason = "halt";
    s.events.push({ k: "halt", n: alive.length });
  }
}

/* ---------- settlement: the §3.5 lottery under the red-team rules ---------- */
export type FreshPolicy = { mode: "table" } | { mode: "budget"; value: number };
export interface SettleOpts { poolIn: C.Item[]; settleBlock: number; fresh: FreshPolicy }
export interface WagerFate { item: C.Item; fate: "burn" | "pool" | "wear" }
export interface DelverResult {
  id: number; name: string; status: Status; outAt: number; wager: WagerFate[]; vaulted: C.Item[]; awarded: C.Item[];
  wagered: number; contribution: number; qualified: boolean; dealt: number; healed: number; taken: number; shots: number; mends: number;
}
export interface RunResult {
  reason: EndReason; ticks: number; bossKilled: boolean; delvers: DelverResult[];
  finishers: number; qualified: number; bar: number;
  deaths: number; recalls: number; sealedOut: number; extracts: number; halted: number;
  valueWagered: number; valueDestroyed: number; valueRecycled: number; valueLeft: number;
  freshValue: number; freshItems: number; prizes: number; awarded: number;
  poolOut: C.Item[];
}
export function settle(s: RunState, opts: SettleOpts): RunResult {
  const rng = settleRng(s.cfg.seed, opts.settleBlock);
  const out: DelverResult[] = [];
  const poolOut: C.Item[] = [];
  let valueWagered = 0, valueDestroyed = 0, valueRecycled = 0, deaths = 0, recalls = 0, extracts = 0, halted = 0;
  for (const d of s.delvers) {
    const wager: WagerFate[] = [];
    const wagered = wagerValue(d.wager);
    valueWagered += wagered;
    for (let i = 0; i < 5; i++) {
      const it = d.wager[i];
      if (!it) continue;
      if (d.status === "dead") {
        const fate = d.fate[i] === "pool" ? "pool" : "burn";
        wager.push({ item: { id: it.id, dur: it.dur }, fate });
        if (fate === "pool") { poolOut.push({ id: it.id, dur: it.dur }); valueRecycled += C.itemValue(it); } else valueDestroyed += C.itemValue(it);
      } else wager.push({ item: { id: it.id, dur: Math.max(0, it.dur - C.WEAR_PER_RUN) }, fate: "wear" });
    }
    if (d.status === "dead") deaths++; else if (d.status === "recalled" && !d.sealedOut) recalls++; else if (d.status === "extracted") extracts++; else if (d.status === "halted") halted++;
    out.push({
      id: d.id, name: d.name, status: d.status, outAt: d.outAt, wager, vaulted: d.status === "extracted" ? d.carried.map((it) => ({ id: it.id, dur: it.dur })) : [], awarded: [],
      wagered, contribution: d.dealt + d.healed, qualified: false, dealt: d.dealt, healed: d.healed, taken: d.taken, shots: d.shots, mends: d.mends,
    });
  }
  const sealedOut = s.delvers.filter((d) => d.sealedOut).length;
  const finishers = out.filter((r) => r.status === "extracted");
  const contribs = finishers.map((r) => r.contribution).sort((a, b) => a - b);
  const bar = contribs.length ? div(contribs[div(contribs.length, 2)], 2) : 0;   // half the upper median finisher
  const qualified = finishers.filter((r) => { r.qualified = r.contribution >= bar; return r.qualified; });
  const prizes: C.Item[] = [];
  let freshValue = 0, freshItems = 0, valueLeft = 0;
  for (const it of s.leftBehind) valueLeft += C.itemValue(it);
  if (s.boss.dead) {
    let budget = opts.fresh.mode === "budget" ? opts.fresh.value : Number.MAX_SAFE_INTEGER;
    for (const entry of C.BOSS_TABLE) {
      const id = entry === "t3" ? C.BY_TIER[3][rng.below(3)] : entry === "t2" ? C.BY_TIER[2][rng.below(3)] : entry;
      const value = C.ITEMS[id].value;
      if (value > budget) continue;
      budget -= value; freshValue += value; freshItems++;
      prizes.push(mkItem(id, rng));
    }
    for (const it of opts.poolIn.slice(0, C.POOL_MAX)) prizes.push({ id: it.id, dur: it.dur });
    for (const it of opts.poolIn.slice(C.POOL_MAX)) poolOut.push({ id: it.id, dur: it.dur });
    for (const it of s.leftBehind) prizes.push({ id: it.id, dur: it.dur });
  } else {
    for (const it of opts.poolIn) poolOut.push({ id: it.id, dur: it.dur });
    for (const it of s.leftBehind) poolOut.push({ id: it.id, dur: it.dur });
  }
  prizes.sort((a, b) => C.itemValue(b) - C.itemValue(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.dur - b.dur);
  let awarded = 0;
  if (qualified.length) {
    const total = qualified.reduce((acc, r) => acc + Math.max(1, r.wagered), 0);
    for (const it of prizes) {
      let roll = rng.below(total);
      for (const r of qualified) { roll -= Math.max(1, r.wagered); if (roll < 0) { r.awarded.push(it); awarded++; break; } }
    }
  } else for (const it of prizes) poolOut.push(it);
  return {
    reason: s.reason, ticks: s.tick, bossKilled: s.boss.dead, delvers: out,
    finishers: finishers.length, qualified: qualified.length, bar,
    deaths, recalls, sealedOut, extracts, halted,
    valueWagered, valueDestroyed, valueRecycled, valueLeft, freshValue, freshItems, prizes: prizes.length, awarded, poolOut,
  };
}

/* ---------- the replay artifact: hash, snapshot, restore ---------- */
const STATUS_CODE: Record<Status, number> = { in: 0, dead: 1, recalled: 2, extracted: 3, halted: 4 };
function hashItem(h: Digest, it: C.Item | null): void { if (it) { h.str(it.id); h.add(it.dur); } else h.add(-1); }
/** A digest of everything that decides the future, the config included. Throws on any non-integer.
 *  The secret enters as one mixed word; in production the on-chain commitment H(S) would stand here. */
export function stateHash(s: RunState): string {
  const h = new Digest();
  const c = s.cfg;
  h.add(c.seed.dungeon); h.add(c.seed.entryBlock); h.add(hashInts(0xc0, ...c.seed.secret));
  h.str(c.door); h.add(c.packScale ?? 100); h.add(c.hardTicks ?? C.HARD_TICKS); h.add(c.bossHpPerDelver ?? C.BOSS.hpPerDelver); h.add(c.danger ?? 100);
  h.add(s.tick); h.add(s.phase === "play" ? 0 : 1); h.str(s.reason); h.str(s.door.phase); h.add(s.door.timer); h.add(s.portal ? 1 : 0); h.add(s.nextId);
  h.add(s.delvers.length);
  for (const d of s.delvers) {
    h.add(d.id); h.add(d.x); h.add(d.y); h.add(d.face); h.add(d.moving ? 1 : 0); h.add(d.hp); h.add(d.maxhp); h.add(d.dmg); h.add(d.fireTicks); h.add(d.skill); h.add(d.light);
    h.add(d.cd); h.add(d.scd); h.add(d.dash); h.add(d.ddx); h.add(d.ddy); h.add(d.recall); h.add(d.rlock); h.add(d.flash); h.add(d.fullAt);
    h.add(STATUS_CODE[d.status]); h.add(d.outAt); h.add(d.locked ? 1 : 0); h.add(d.ready ? 1 : 0); h.add(d.sealedOut ? 1 : 0);
    h.add(d.dealt); h.add(d.healed); h.add(d.taken); h.add(d.shots); h.add(d.mends);
    for (const it of d.wager) hashItem(h, it);
    h.add(d.carried.length); for (const it of d.carried) hashItem(h, it);
    for (const f of d.fate) h.str(f);
  }
  h.add(s.enemies.length);
  for (const e of s.enemies) { h.add(e.id); h.str(e.kind); h.add(e.x); h.add(e.y); h.add(e.hp); h.add(e.maxhp); h.add(e.awake ? 1 : 0); h.add(e.cd); h.add(e.dir); h.add(e.face); h.add(e.flash); h.add(e.ph); }
  const b = s.boss;
  h.add(b.x); h.add(b.y); h.add(b.hx); h.add(b.hy); h.add(b.hp); h.add(b.maxhp); h.add(b.t); h.add(b.a); h.add(b.phase); h.add(b.awake ? 1 : 0); h.add(b.dead ? 1 : 0); h.add(b.deadAt); h.add(b.face); h.add(b.flash);
  h.add(s.bullets.length);
  for (const bl of s.bullets) { h.add(bl.id); h.add(bl.x); h.add(bl.y); h.add(bl.vx); h.add(bl.vy); h.str(bl.kind); h.add(bl.dmg); h.add(bl.r); h.add(bl.foe ? 1 : 0); h.add(bl.owner); h.add(bl.life); }
  h.add(s.bags.length);
  for (const bg of s.bags) { h.add(bg.id); h.add(bg.x); h.add(bg.y); h.add(bg.vx); h.add(bg.vy); hashItem(h, bg.item); h.add(bg.t); }
  h.add(s.leftBehind.length); for (const it of s.leftBehind) hashItem(h, it);
  return h.hex();
}
/** Everything but the derived world and the transient events, as JSON. */
export function snapshot(s: RunState): string {
  const { world: _w, events: _e, ...rest } = s;
  return JSON.stringify(rest);
}
export function restore(json: string): RunState {
  const rest = JSON.parse(json) as Omit<RunState, "world" | "events">;
  validateConfig(rest.cfg);
  deepFreeze(rest.cfg);
  return { ...rest, world: genWorld(rest.cfg.seed.dungeon), events: [] };
}
