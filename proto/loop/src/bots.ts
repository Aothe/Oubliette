// Scripted delvers: the slice's ally bots, given a route so a whole shard can run a dungeon with
// nobody at the keyboard. A bot is an input producer and nothing more — it reads the state, it
// never writes it, its randomness is its own, and the simulation cannot tell a bot from a person.
// The log records what it pressed, so a replay needs none of this file.
//
// Policies the red-team bench varies: `skill` (how hard it dodges), a Mend rule with a stagger
// (A1, the heal ball), a recall rule (A2, B7), and the kit it wagers (B1, stripping).
import { type RunState, type Input, type Delver, type RunConfig, IDLE } from "./sim.ts";
import { Rng, hashInts } from "./rng.ts";
import { px, dist2, len, div, sign, abs } from "./fixed.ts";
import * as C from "./content.ts";
import { inBossRoom, lineClear } from "./world.ts";

export interface BotProfile {
  skill: number;        // 0–100: reaction and attention. A bot sees a bullet only once it is (100 - skill)
                        // ticks old, dodges inside a radius that shrinks with skill, and freezes in a lapse
                        // of half a second to a second and a half with a chance of (100 - skill) in 12,000
                        // a tick — about a quarter of the time at 35, one twentieth at 90
  mendAt: number;       // cast Mend when self or a neighbour is under this percent of max HP
  mendStagger: number;  // ticks before the first Mend, so a heal ball staggers its casts
  recallAt: number;     // hold recall under this percent HP while recall is open; 0 = never
  jitter: number;       // aim jitter, px
}
export const PROFILE: BotProfile = { skill: 75, mendAt: 70, mendStagger: 0, recallAt: 0, jitter: 6 };

const FIGHT_RANGE = px(150), BOSS_RANGE = px(210), KEEP = px(70), KEEP_BOSS = px(92), BAND = px(15);
const SLIP_R2 = px(14) * px(14), SUNDER_R = px(70), WP_R = px(8), FOLLOW_R = px(190);

interface Foe { x: number; y: number; boss: boolean; shotY: number }

export class Bot {
  id: number;
  profile: BotProfile;
  rng: Rng;
  wp = 0;
  stillFor = 0; lastX = -1; lastY = -1; nudge = 0; nudgeAxis = 0; lapse = 0; lapses = 0;
  constructor(id: number, profile: BotProfile, seed: number) { this.id = id; this.profile = profile; this.rng = new Rng(seed); }

  /** The nearest awake enemy in range that the bot can actually see; walls are not targets. */
  private target(s: RunState, d: Delver): Foe | null {
    const shut = s.door.phase === "shut" || s.door.phase === "counting" || s.door.phase === "sealed";
    let best: Foe | null = null, bd = FIGHT_RANGE * FIGHT_RANGE;
    for (const e of s.enemies) {
      if (!e.awake) continue;
      const q = dist2(d.x, d.y, e.x, e.y);
      if (q < bd && lineClear(s.world, d.x, d.y - C.DELVER.boltY, e.x, e.y - C.ENEMY[e.kind].shotY, shut)) { bd = q; best = { x: e.x, y: e.y, boss: false, shotY: C.ENEMY[e.kind].shotY }; }
    }
    const b = s.boss;
    if (b.awake && !b.dead) {
      const q = dist2(d.x, d.y, b.x, b.y);
      if (q < BOSS_RANGE * BOSS_RANGE && (!best || q < bd)) best = { x: b.x, y: b.y, boss: true, shotY: C.BOSS.shotY };
    }
    return best;
  }

  /** Decide this tick's input. `leaderWp` is how far the squad's leader has got along the route. */
  think(s: RunState, d: Delver, isLeader: boolean, leader: Delver | null, leaderWp: number): Input {
    const P = this.profile, w = s.world, route = w.route;
    const inp: Input = { ...IDLE };
    let mx = 0, my = 0;                       // a move vector in Q10
    const chestY = d.y - C.DELVER.boltY;
    // advance along the route
    while (this.wp < route.length - 1 && dist2(d.x, d.y, route[this.wp][0], route[this.wp][1]) < WP_R * WP_R) {
      if (this.wp === w.plateIndex && s.door.phase !== "none" && s.door.phase !== "open" && s.door.phase !== "sealed") break;
      this.wp++;
    }
    const foe = this.target(s, d);
    const hpPct = div(d.hp * 100, Math.max(1, d.maxhp));
    const recallOpen = !d.locked && (s.cfg.door === "sealed" || !s.boss.awake) && !s.portal;
    const recalling = P.recallAt > 0 && hpPct < P.recallAt && recallOpen && d.rlock <= 0;
    if (recalling) inp.recall = true;
    if (foe && !recalling) {
      const dx = foe.x - d.x, dy = foe.y - d.y, dd = len(dx, dy) || 1, keep = foe.boss ? KEEP_BOSS : KEEP;
      const ux = div(dx * 1024, dd), uy = div(dy * 1024, dd);
      if (dd > keep + BAND) { mx += ux; my += uy; } else if (dd < keep - BAND) { mx -= ux; my -= uy; }
      const strafe = this.rng.below(100) < 1 ? -1 : 1;    // occasional reversal, as the slice's allies
      mx += div(-uy * 7 * strafe, 10); my += div(ux * 7 * strafe, 10);
      inp.aim = true;
      inp.ax = foe.x + this.rng.range(-px(P.jitter), px(P.jitter));
      inp.ay = foe.y - foe.shotY + this.rng.range(-px(P.jitter), px(P.jitter));
      inp.fire = true;
      if (d.skill === 2 && d.scd <= 0 && dd < SUNDER_R) inp.skill = true;
    } else if (!recalling) {
      let tx: number, ty: number;
      if (!isLeader && leader && dist2(d.x, d.y, leader.x, leader.y) < FOLLOW_R * FOLLOW_R && s.door.phase !== "counting") {
        tx = leader.x + ((this.id % 3) - 1) * px(12); ty = leader.y + ((div(this.id, 3) % 3) - 1) * px(12);
        if (this.wp < leaderWp) this.wp = Math.min(leaderWp, this.wp + 1);
      } else {
        const idx = isLeader ? this.wp : Math.min(this.wp, Math.max(leaderWp, this.wp));
        [tx, ty] = route[idx];
      }
      if (s.portal) { tx = s.boss.hx; ty = s.boss.hy; }
      else if (d.locked && s.boss.awake && !s.boss.dead) {
        // locked in with the boss: walk the route into the chamber, then hold until he is in range
        if (inBossRoom(s.world, d.x, d.y)) { tx = d.x; ty = d.y; } else { [tx, ty] = route[this.wp]; }
      }
      const dx = tx - d.x, dy = ty - d.y;
      if (abs(dx) > px(2) || abs(dy) > px(2)) { mx += dx > px(2) ? 1024 : dx < -px(2) ? -1024 : 0; my += dy > px(2) ? 1024 : dy < -px(2) ? -1024 : 0; }
      // a bag within reach and nothing awake: pick it up
      if (!foe && d.carried.length < C.DELVER.packMax) {
        for (const b of s.bags) {
          if (b.t < 24) continue;
          const q = dist2(d.x, d.y, b.x, b.y);
          if (q < px(60) * px(60)) { mx = sign(b.x - d.x) * 1024; my = sign(b.y - d.y) * 1024; break; }
        }
      }
    }
    // dodge what is coming — what the bot has noticed, within the radius it watches
    const latency = 100 - P.skill, dodgeR = px(10 + div(16 * P.skill, 100)), dodgeR2 = dodgeR * dodgeR;
    let nearest2 = Number.MAX_SAFE_INTEGER, nx = 0, ny = 0;
    for (const b of s.bullets) {
      if (!b.foe) continue;
      const age = (b.kind === "big" ? C.SHOT.big.life : C.FOE_BULLET_LIFE) - b.life;
      if (age < latency) continue;
      const dx = d.x - b.x, dy = chestY - b.y, q = dx * dx + dy * dy;
      if (q < dodgeR2) { const dd = len(dx, dy) || 1; mx += div(dx * 1024 * 16, dd * 10); my += div(dy * 1024 * 16, dd * 10); }
      if (q < nearest2) { nearest2 = q; nx = dx; ny = dy; }
    }
    if (d.skill === 0 && d.scd <= 0 && nearest2 < SLIP_R2 && !recalling) { inp.skill = true; mx = sign(nx) * 1024; my = sign(ny) * 1024; }
    if (d.skill === 1 && d.scd <= 0 && s.tick >= P.mendStagger && P.mendAt > 0 && !recalling) {
      let need = hpPct < P.mendAt;
      if (!need) for (const o of s.delvers) if (o.status === "in" && o.id !== d.id && dist2(d.x, d.y, o.x, o.y) <= C.SKILL.mend.radius * C.SKILL.mend.radius && div(o.hp * 100, Math.max(1, o.maxhp)) < P.mendAt) { need = true; break; }
      if (need) inp.skill = true;
    }
    // the door: stand ready on the plate
    if (s.door.phase === "shut" || s.door.phase === "counting") {
      const plateFoe = foe !== null;
      if (!plateFoe && this.wp >= w.plateIndex) inp.ready = true;
    }
    // stuck? nudge sideways for a while
    if (d.x === this.lastX && d.y === this.lastY && (mx !== 0 || my !== 0) && !foe) this.stillFor++; else this.stillFor = 0;
    this.lastX = d.x; this.lastY = d.y;
    if (this.stillFor > 30 && this.nudge <= 0) { this.nudge = 20; this.nudgeAxis = this.rng.below(2); this.stillFor = 0; }
    if (this.nudge > 0) { this.nudge--; if (this.nudgeAxis === 0) { my = mx !== 0 ? (this.rng.below(2) ? 1024 : -1024) : my; mx = 0; } else { mx = my !== 0 ? (this.rng.below(2) ? 1024 : -1024) : mx; my = 0; } }
    inp.mx = abs(mx) > 300 ? sign(mx) : 0;
    inp.my = abs(my) > 300 ? sign(my) : 0;
    if (recalling) { inp.fire = false; inp.aim = false; }
    // a lapse of attention: the feet stop, the skill hand too; aim and fire carry on
    if (this.lapse > 0) { this.lapse--; inp.mx = 0; inp.my = 0; if (d.skill !== 1) inp.skill = false; }
    else if (!recalling && this.rng.below(12000) < 100 - P.skill) { this.lapse = 30 + this.rng.below(61); this.lapses++; }
    return inp;
  }
}

/** The shard's bots. Index i is delver i; a null profile marks a person whose input the caller
 *  supplies, though a bot stands behind every seat so a person can hand theirs over (`human`). */
export class Squad {
  bots: Bot[];
  humans: Set<number>;
  humanWp = 0;
  constructor(cfg: RunConfig, profiles: (BotProfile | null)[], seed: number) {
    this.bots = cfg.delvers.map((_, i) => new Bot(i, profiles[i] ?? PROFILE, hashInts(seed, i, 0xb07)));
    this.humans = new Set(cfg.delvers.map((_, i) => i).filter((i) => !profiles[i]));
  }
  /** Give a seat to a person or back to its bot. */
  human(id: number, on: boolean): void { if (on) this.humans.add(id); else this.humans.delete(id); }
  /** Inputs for every delver this tick; `human` fills the people's seats (the same input for each). */
  inputs(s: RunState, human: Input = IDLE): Input[] {
    const route = s.world.route;
    let leader: Delver | null = null, leaderWp = 0, leaderIsHuman = false;
    for (const d of s.delvers) {
      if (d.status !== "in") continue;
      if (this.humans.has(d.id)) { leader = d; leaderIsHuman = true; break; }
      if (!leader) leader = d;
    }
    if (leader) {
      if (leaderIsHuman) {
        while (this.humanWp < route.length - 1 && dist2(leader.x, leader.y, route[this.humanWp][0], route[this.humanWp][1]) < px(24) * px(24)) this.humanWp++;
        if (inBossRoom(s.world, leader.x, leader.y)) this.humanWp = route.length - 1;
        leaderWp = this.humanWp;
      } else leaderWp = this.bots[leader.id].wp;
    }
    return s.delvers.map((d) => {
      if (this.humans.has(d.id)) return human;
      if (d.status !== "in") return IDLE;
      return this.bots[d.id].think(s, d, leader === d, leader === d ? null : leader, leaderWp);
    });
  }
}
