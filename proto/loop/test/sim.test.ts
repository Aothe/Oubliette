import { test } from "node:test";
import assert from "node:assert/strict";
import { isqrt, sin, cos, toward, rotate, TURN, Q14, div, len, px } from "../src/fixed.ts";
import { Rng, seedFrom, hashInts } from "../src/rng.ts";
import { genWorld, reachable, T_DOOR, MW, tileAt } from "../src/world.ts";
import { createRun, step, stateHash, snapshot, restore, settle, freshKit, IDLE, type RunConfig, type Input } from "../src/sim.ts";
import { Recorder, replay } from "../src/log.ts";
import { SCENARIOS, configFor, squadFor, playRun, resumeCheck } from "../src/bench.ts";
import { TILE } from "../src/fixed.ts";
import * as C from "../src/content.ts";

test("fixed: isqrt is the exact floor and the sine table keeps its symmetries", () => {
  for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 999999, 2 ** 40 + 12345, 2 ** 52 - 1]) {
    const r = isqrt(n);
    assert.ok(r * r <= n && (r + 1) * (r + 1) > n, `isqrt(${n})`);
  }
  assert.equal(sin(0), 0); assert.equal(sin(TURN / 4), Q14); assert.equal(cos(0), Q14); assert.equal(sin(TURN / 2), 0);
  for (let a = 0; a < TURN; a += 7) {
    assert.equal(sin(a) + sin(a + TURN / 2), 0);
    assert.equal(cos(a), sin(a + TURN / 4));
    const s2 = sin(a) * sin(a) + cos(a) * cos(a);
    assert.ok(Math.abs(s2 - Q14 * Q14) < 2 * Q14 + 2, `unit circle at ${a}`);
  }
  const [vx, vy] = toward(300, -400, 1000);
  assert.ok(Math.abs(len(vx, vy) - 1000) <= 2);
  const [rx, ry] = rotate(10000, 0, TURN / 4);
  assert.ok(Math.abs(rx) <= 1 && Math.abs(ry - 10000) <= 1);
  assert.equal(div(-7, 2), -3); assert.equal(div(7, 2), 3);
});

test("rng: a stream is reproducible and below(n) stays in range", () => {
  const a = new Rng(42), b = new Rng(42);
  for (let i = 0; i < 1000; i++) { const x = a.below(97); assert.equal(x, b.below(97)); assert.ok(x >= 0 && x < 97); }
  assert.notEqual(new Rng(1).next(), new Rng(2).next());
  assert.deepEqual(seedFrom(5), seedFrom(5));
});

test("world: every seed yields a dungeon where the hall reaches the chamber through a sealed door", () => {
  for (let seed = 0; seed < 60; seed++) {
    const w = genWorld(hashInts(0x77, seed));
    assert.equal(w.rooms.length, 6);
    assert.ok(w.route.length >= 11 && w.route.length <= 13, `seed ${seed}: route has ${w.route.length} points`);
    assert.ok(w.plateIndex > 0 && w.plateIndex < w.route.length - 1);
    assert.ok(w.door.cells.some(([tx, ty]) => tileAt(w, tx, ty) === T_DOOR), `seed ${seed}: no door tile`);
    assert.ok(reachable(w, [w.rooms[0].cx, w.rooms[0].cy], w.door.inside), `seed ${seed}: chamber unreachable`);
    assert.ok(w.bossMask[w.door.inside[1] * MW + w.door.inside[0]] === 1);
    assert.ok(w.bossMask[w.door.plate[1] * MW + w.door.plate[0]] === 0, `seed ${seed}: the plate is inside the chamber`);
  }
});

function party(seedN: number, n = 4): RunConfig {
  const rng = new Rng(seedN);
  const delvers = [];
  for (let i = 0; i < n; i++) delvers.push({ name: "T" + i, wager: freshKit((i % 3) as C.SkillId, rng) });
  return { seed: seedFrom(seedN), delvers, door: "sealed", hardTicks: 6000 };
}

test("determinism: the same seed and inputs give the same hash, and a different seed does not", () => {
  const cfg = party(1);
  const a = createRun(cfg), b = createRun(cfg);
  const sa = squadFor(SCENARIOS.party4, cfg, 1), sb = squadFor(SCENARIOS.party4, cfg, 1);
  for (let t = 0; t < 900; t++) { step(a, sa.inputs(a)); step(b, sb.inputs(b)); }
  assert.equal(stateHash(a), stateHash(b));
  const c = createRun(party(2));
  for (let t = 0; t < 900; t++) step(c, squadFor(SCENARIOS.party4, c.cfg, 2).inputs(c));
  assert.notEqual(stateHash(a), stateHash(c));
});

test("replay: a whole run replays from its log to the same hash, checkpoints included", () => {
  const r = playRun(SCENARIOS.party4, 3, [], 600);
  assert.ok(r.log.end, "the run ended");
  assert.ok(r.log.frames.length > 100, "inputs were logged");
  assert.ok(r.stats.replayOk, "replay matched");
  const rp = replay(r.log);
  assert.equal(rp.hash, r.log.end!.hash);
  // tamper with the inputs from a third of the way in and the replay must diverge
  const tampered = JSON.parse(JSON.stringify(r.log));
  const from = tampered.frames[Math.floor(tampered.frames.length / 3)].t;
  for (const f of tampered.frames) if (f.t >= from) f.i.fire = !f.i.fire;
  const bad = replay(tampered);
  assert.equal(bad.ok, false);
  assert.ok(bad.divergedAt !== null && bad.divergedAt >= from);
});

test("resume: a run killed at tick 600 and restored from its snapshot ends on the same hash", () => {
  const r = playRun(SCENARIOS.party4, 4, [], 600);
  assert.ok(r.snap, "snapshot taken");
  assert.ok(resumeCheck(r.log, r.snap!, 600));
  const s = restore(r.snap!);
  assert.equal(s.tick, 600);
  assert.equal(stateHash(s), stateHash(restore(snapshot(s))));
});

test("integers: garbage inputs never put a non-integer into the state or a delver off the map", () => {
  const cfg = party(9, 3);
  const s = createRun(cfg);
  const rng = new Rng(3);
  const junk = [NaN, Infinity, -Infinity, 0.25, 1e300, -1e300, null, undefined] as unknown[];
  for (let t = 0; t < 2000 && s.phase === "play"; t++) {
    const inputs = cfg.delvers.map((): Input => ({
      mx: (rng.below(3) - 1) as -1 | 0 | 1, my: (rng.below(3) - 1) as -1 | 0 | 1, aim: true,
      ax: rng.below(10) === 0 ? (junk[rng.below(junk.length)] as number) : rng.below(MW * TILE), ay: rng.below(10) === 0 ? (junk[rng.below(junk.length)] as number) : rng.below(60 * TILE),
      fire: true, skill: rng.below(8) === 0, recall: rng.below(40) === 0, ready: rng.below(3) === 0,
    }));
    step(s, inputs);
    if (t % 50 === 0) stateHash(s);
    for (const d of s.delvers) assert.ok(d.x >= 0 && d.y >= 0 && d.x < MW * TILE && d.y < 60 * TILE);
  }
  stateHash(s);
});

test("settlement: every wagered item of the dead is burned or pooled exactly once; prizes go only to qualified finishers", () => {
  const cfg = party(11, 4);
  const s = createRun(cfg);
  for (let t = 0; t < 10; t++) step(s, [IDLE, IDLE, IDLE, IDLE]);
  // hand-build an ending: 0 extracted and strong, 1 extracted and weak, 2 dead, 3 recalled with loot left behind
  s.delvers[0].status = "extracted"; s.delvers[0].dealt = 5000; s.delvers[0].carried = [{ id: "ring2", dur: 50 }];
  s.delvers[1].status = "extracted"; s.delvers[1].dealt = 100;
  s.delvers[2].status = "dead"; s.delvers[2].fate = ["burn", "pool", "burn", "", "pool"];
  s.delvers[3].status = "recalled"; s.leftBehind.push({ id: "wand2", dur: 40 });
  s.boss.dead = true; s.phase = "ended"; s.reason = "cleared";
  const poolIn = [{ id: "robe3", dur: 33 }];
  const r = settle(s, { poolIn, settleBlock: 1, fresh: { mode: "table" } });
  assert.equal(r.deaths, 1); assert.equal(r.extracts, 2); assert.equal(r.recalls, 1);
  const dead = r.delvers[2];
  assert.equal(dead.wager.length, 4);
  assert.deepEqual(dead.wager.map((w) => w.fate), ["burn", "pool", "burn", "pool"]);
  assert.equal(r.valueDestroyed, 120 * 2); assert.equal(r.valueRecycled, 120 * 2);
  assert.equal(r.poolOut.length, 2, "the dead's pooled items wait for a later run");
  assert.equal(r.valueWagered, 4 * 480);
  assert.equal(r.finishers, 2);
  assert.equal(r.qualified, 1, "the weak finisher is under the bar");
  assert.equal(r.bar, 2500, "half the upper-median finisher: contributions 100 and 5000");
  assert.equal(r.freshItems, 6);
  assert.equal(r.prizes, 6 + 1 + 1);
  assert.equal(r.awarded, 8);
  assert.equal(r.delvers[0].awarded.length, 8);
  assert.equal(r.delvers[1].awarded.length, 0);
  assert.deepEqual(r.delvers[0].vaulted, [{ id: "ring2", dur: 50 }]);
  assert.equal(r.delvers[0].wager[0].item.dur, s.delvers[0].wager[0]!.dur - C.WEAR_PER_RUN);
  // under a budget of half the value destroyed (120), the key and the tier-3 do not drop
  const b = settle(s, { poolIn, settleBlock: 1, fresh: { mode: "budget", value: 120 } });
  assert.equal(b.freshValue, 0); assert.equal(b.freshItems, 2, "only the draughts fit");
  // nobody extracted: everything carries over
  s.delvers[0].status = "dead"; s.delvers[0].fate = ["burn", "burn", "burn", "", "burn"]; s.delvers[1].status = "dead"; s.delvers[1].fate = ["burn", "burn", "burn", "", "burn"];
  const n = settle(s, { poolIn, settleBlock: 1, fresh: { mode: "table" } });
  assert.equal(n.awarded, 0);
  assert.equal(n.poolOut.length, 2 + 6 + 1 + 1);
});

test("the door: a party readies on the plate, the door opens, seals, and the boss wakes for those inside", () => {
  const r = playRun(SCENARIOS.party4, 5, []);
  assert.ok(r.state.door.phase === "sealed" || r.state.reason === "halt", `door ${r.state.door.phase}, ${r.state.reason}`);
  if (r.state.door.phase === "sealed") assert.ok(r.state.boss.awake);
});
export {};
