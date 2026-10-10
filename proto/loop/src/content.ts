// The slice's content as integer data: items, kits, enemies, the boss, skills, recall, the door.
// Every name and number is a placeholder (SPEC §4); the values in token are the red-team note's
// constants (tier 1 = 120 token, tier 2 about 3.25x, tier 3 about 10.75x). HP and damage are in
// tenths of a hit point; speeds in units per tick at 60 Hz; distances in units (256 = 1 px).
import { px, pps, rad } from "./fixed.ts";

export const TICK_HZ = 60;
export type Slot = 0 | 1 | 2 | 3 | 4 | 5;             // weapon, armour, ring, relic, skill, draught
export const SLOT_NAMES = ["Weapon", "Armour", "Ring", "Relic", "Skill", "Draught"] as const;
export type Tier = 1 | 2 | 3;
export type SkillId = 0 | 1 | 2;                      // Slip, Mend, Sunder
export const SKILL_NAMES = ["Slip", "Mend", "Sunder"] as const;

export interface ItemDef {
  id: string; slot: Slot; tier: Tier; name: string; value: number;
  sprite: string; look: number;                       // art bank sprite id and look index
  skill?: SkillId;
}
export const TIER_VALUE: Record<Tier, number> = { 1: 120, 2: 390, 3: 1290 };
const defs: ItemDef[] = [
  { id: "wand1", slot: 0, tier: 1, name: "Tallow Wand", value: 120, sprite: "wand", look: 0 },
  { id: "wand2", slot: 0, tier: 2, name: "Ember Wand", value: 390, sprite: "wand", look: 1 },
  { id: "wand3", slot: 0, tier: 3, name: "Castellan's Brand", value: 1290, sprite: "wand", look: 2 },
  { id: "robe1", slot: 1, tier: 1, name: "Gaol-cloth Robe", value: 120, sprite: "armour", look: 0 },
  { id: "robe2", slot: 1, tier: 2, name: "Warder's Hauberk", value: 390, sprite: "armour", look: 1 },
  { id: "robe3", slot: 1, tier: 3, name: "Verdigris Plate", value: 1290, sprite: "armour", look: 2 },
  { id: "ring1", slot: 2, tier: 1, name: "Tin Band", value: 120, sprite: "ring", look: 0 },
  { id: "ring2", slot: 2, tier: 2, name: "Signet of the Watch", value: 390, sprite: "ring", look: 1 },
  { id: "ring3", slot: 2, tier: 3, name: "Ring of the Forgotten", value: 1290, sprite: "ring", look: 2 },
  { id: "key3", slot: 3, tier: 3, name: "The Turnkey's Key", value: 1290, sprite: "key", look: 0 },
  { id: "slip1", slot: 4, tier: 1, name: "Moth Feather", value: 120, sprite: "feather", look: 0, skill: 0 },
  { id: "mend1", slot: 4, tier: 1, name: "Moss Poultice", value: 120, sprite: "poultice", look: 0, skill: 1 },
  { id: "sunder1", slot: 4, tier: 1, name: "Breaker's Maul", value: 120, sprite: "maul", look: 0, skill: 2 },
  { id: "flask", slot: 5, tier: 1, name: "Draught", value: 0, sprite: "draught", look: 0 },   // burned on use, never gear
];
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const SKILL_ITEM: Record<SkillId, string> = { 0: "slip1", 1: "mend1", 2: "sunder1" };
export const BY_TIER: Record<Tier, string[]> = { 1: ["wand1", "robe1", "ring1"], 2: ["wand2", "robe2", "ring2"], 3: ["wand3", "robe3", "ring3"] };

/** An item instance: a definition id and its durability in percent. */
export interface Item { id: string; dur: number }
export const DUR_NEW_MIN = 70, DUR_NEW_SPREAD = 30;   // the slice: 70 + rng(30)
export const WEAR_PER_RUN = 8;                        // red team D2: a fixed number, by contract
export function itemValue(it: Item | null): number { return it ? ITEMS[it.id].value : 0; }

/** Kit stats by tier (index 0 = nothing in the slot). */
export const DMG_BY_WEAPON = [80, 120, 170, 240];     // tenths of HP per bolt
export const MAXHP_BY_ARMOUR = [800, 1000, 1300, 1700];
export const FIRE_TICKS_BY_RING = [16, 13, 11, 10];   // 0.26 / 0.22 / 0.19 / 0.16 s
export const LIGHT_BY_RELIC = [88, 114];              // client only, px
export const DELVER = {
  speed: pps(64), recallSpeed: pps(32), hw: px(4), hh: px(3), hitR: px(3) + 128 /* 3.5 px */,
  regenEvery: 3, regen: 1,                            // +0.1 HP every 3 ticks = 2 HP/s
  boltSpeed: pps(178), boltLife: 46, boltY: px(5),    // bolts leave the chest
  packMax: 8, pickupR2: px(12) * px(12),
};
export const SKILL = {
  slip: { cd: 150, ticks: 8, speed: 1408 },           // 5.5 px per tick for 8 ticks, untouchable
  mend: { cd: 540, heal: 350, radius: px(64) },
  sunder: { cd: 360, bolts: 5, spread: rad(0.11), speed: pps(200), life: 52, mult: 3 },
};
export const RECALL = { ticks: 180, lock: 30 };       // hold three seconds; a hit breaks it

export type EnemyKind = "forgotten" | "shade" | "gaoler";
export interface EnemyDef { hp: number; speed: number; keep: number; hitR: number; fire: number; aggro: number; shotY: number }
export const ENEMY: Record<EnemyKind, EnemyDef> = {
  forgotten: { hp: 340, speed: pps(26), keep: px(62), hitR: px(6), fire: 90, aggro: px(125), shotY: px(6) },
  shade: { hp: 200, speed: pps(50), keep: px(48), hitR: px(5), fire: 126, aggro: px(125), shotY: px(6) },
  gaoler: { hp: 1500, speed: pps(17), keep: px(44), hitR: px(7), fire: 162, aggro: px(125), shotY: px(6) },
};
export const ENEMY_RANGE = px(175);
export type BulletKind = "bolt" | "bolt_heavy" | "bone" | "purple" | "red" | "orange" | "big";
export const SHOT = {
  bone: { speed: pps(68), dmg: 70, r: px(2) },
  purple: { speed: pps(58), dmg: 80, r: px(2), spread: rad(0.26) },
  redRing: { speed: pps(44), dmg: 110, r: px(2), n: 10 },
  // the boss
  orange: { speed: pps(50), dmg: 90, r: px(2) },
  redAim1: { speed: pps(82), dmg: 120, r: px(2), spread: rad(0.17), n: 5 },
  purpleRing: { speed: pps(46), dmg: 100, r: px(2), n: 18, offset: rad(0.1745) },
  redAim2: { speed: pps(92), dmg: 120, r: px(2), spread: rad(0.12), n: 3 },
  orange3: { speed: pps(56), dmg: 90, r: px(2) },
  big: { speed: pps(30), dmg: 200, r: px(3), n: 10, life: 420 },
  phaseRing: { speed: pps(50), dmg: 90, r: px(2), n: 24 },
};
export const FOE_BULLET_LIFE = 300;
/** Rooms 1–4 of the slice: [kind, count] pairs per room, scaled by `packScale` percent. */
export const PACKS: [EnemyKind, number][][] = [
  [],
  [["forgotten", 4]],
  [["forgotten", 3], ["shade", 2]],
  [["gaoler", 1], ["forgotten", 3], ["shade", 2]],
  [["gaoler", 2], ["shade", 4]],
];
export const BOSS = {
  hpPerDelver: 9000, hitR: px(13), hw: px(10), hh: px(6), shotY: px(12), speed: 77,
  wanderX: px(46), wanderY: px(26), wanderAx: 1001, wanderAy: 1418,     // angle = t * k / 1024
  spiral1: rad(0.23), spiral3: rad(0.19), portalAfter: 100, portalR2: px(11) * px(11),
  shadeCap: 3,
};
export const DOOR = { readyTicks: 600, openTicks: 180, plateR: 2 /* tiles */ };
export const HARD_TICKS = 36000;                      // ten minutes, then the halt rule
export const FLASK_HEAL = 400;
/** The boss piñata's fresh drops in the slice: a key, a tier 3, two tier 2, two draughts. */
export const BOSS_TABLE: ("key3" | "t3" | "t2" | "flask")[] = ["key3", "t3", "t2", "t2", "flask", "flask"];
export const POOL_MAX = 7;
