// The dungeon: six rooms on a 128 x 60 tile map, joined by L-shaped corridors, the last room an
// ellipse with a door. Generated from the public dungeon seed alone, so the layout is the same
// for every delver in the shard and needs no secret. Ported from the slice's genMap.
import { TILE, div } from "./fixed.ts";
import { Rng } from "./rng.ts";

export const MW = 128, MH = 60;
export const T_VOID = 0, T_FLOOR = 1, T_WALL = 2, T_DOOR = 3;
export interface Room { x: number; y: number; w: number; h: number; cx: number; cy: number; boss: boolean }
export interface Door {
  cells: [number, number][];      // the door tiles, a cross-section of the corridor
  plate: [number, number];        // tile outside the door where delvers stand ready
  inside: [number, number];       // first tile inside the chamber
}
export interface World {
  seed: number;
  tiles: Uint8Array;              // MW * MH
  bossMask: Uint8Array;           // 1 where a tile is inside the boss chamber
  rooms: Room[];
  door: Door;
  /** Waypoints in units from the hall to the chamber: each corridor's corner, each room's centre. */
  route: [number, number][];
  plateIndex: number;             // index in `route` of the door plate
  spawn: [number, number];        // units: the hall's centre
}

export function tileAt(w: World, tx: number, ty: number): number {
  return tx < 0 || ty < 0 || tx >= MW || ty >= MH ? T_VOID : w.tiles[ty * MW + tx];
}
/** Whether a point (units) is blocked. The door blocks while `doorShut`. */
export function solidAt(w: World, x: number, y: number, doorShut: boolean): boolean {
  if (x < 0 || y < 0) return true;
  const t = tileAt(w, div(x, TILE), div(y, TILE));
  return t === T_FLOOR ? false : t === T_DOOR ? doorShut : true;
}
export function boxFree(w: World, x: number, y: number, hw: number, hh: number, doorShut: boolean): boolean {
  return !solidAt(w, x - hw, y - hh, doorShut) && !solidAt(w, x + hw, y - hh, doorShut)
    && !solidAt(w, x - hw, y + hh, doorShut) && !solidAt(w, x + hw, y + hh, doorShut);
}
export function inBossRoom(w: World, x: number, y: number): boolean {
  const tx = div(x, TILE), ty = div(y, TILE);
  return tx >= 0 && ty >= 0 && tx < MW && ty < MH && w.bossMask[ty * MW + tx] === 1;
}
export function inRoom(r: Room, x: number, y: number): boolean {
  const tx = div(x, TILE), ty = div(y, TILE);
  return tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
}
/** Centre of a tile, in units. */
export function tileCentre(tx: number, ty: number): [number, number] { return [tx * TILE + TILE / 2, ty * TILE + TILE / 2]; }

function inEllipse(r: Room, tx: number, ty: number): boolean {
  // (u/rw)^2 + (v/rh)^2 <= 1.08 with u, v doubled to keep the half-tile offsets integer
  const ux = 2 * tx + 1 - (2 * r.x + r.w), vy = 2 * ty + 1 - (2 * r.y + r.h);
  return 100 * (ux * ux * r.h * r.h + vy * vy * r.w * r.w) <= 108 * r.w * r.w * r.h * r.h;
}
function nearFloor(tiles: Uint8Array, tx: number, ty: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
    const t = tiles[ny * MW + nx];
    if (t === T_FLOOR || t === T_DOOR) return true;
  }
  return false;
}

export function genWorld(seed: number): World {
  const rng = new Rng(seed);
  const tiles = new Uint8Array(MW * MH), bossMask = new Uint8Array(MW * MH);
  const rooms: Room[] = [];
  const sizes = [[9, 7], [11, 9], [13, 9], [11, 11], [13, 9], [21, 15]];
  let x = 4, cy = 30;
  for (let i = 0; i < 6; i++) {
    const w = sizes[i][0], h = sizes[i][1];
    if (i) cy += rng.below(15) - 7;
    cy = Math.max(5 + (h >> 1), Math.min(MH - 6 - (h >> 1), cy));
    rooms.push({ x, y: cy - (h >> 1), w, h, cx: x + (w >> 1), cy, boss: i === 5 });
    x += w + 4 + rng.below(3);
  }
  for (const r of rooms) for (let ty = r.y; ty < r.y + r.h; ty++) for (let tx = r.x; tx < r.x + r.w; tx++) {
    if (r.boss) { if (!inEllipse(r, tx, ty)) continue; bossMask[ty * MW + tx] = 1; }
    tiles[ty * MW + tx] = T_FLOOR;
  }
  for (let i = 0; i < 5; i++) {
    const a = rooms[i], b = rooms[i + 1];
    for (let tx = a.cx; tx <= b.cx; tx++) for (let k = -1; k <= 1; k++) tiles[(a.cy + k) * MW + tx] = T_FLOOR;
    const y0 = Math.min(a.cy, b.cy), y1 = Math.max(a.cy, b.cy);
    for (let ty = y0; ty <= y1; ty++) for (let k = -1; k <= 1; k++) tiles[ty * MW + b.cx + k] = T_FLOOR;
  }
  // The door: walk the last corridor, horizontal leg then vertical, and seal the corridor's
  // cross-section just before the first chamber tile.
  const a = rooms[4], b = rooms[5];
  const path: [number, number, "h" | "v"][] = [];
  for (let tx = a.cx; tx <= b.cx; tx++) path.push([tx, a.cy, "h"]);
  const step = a.cy < b.cy ? 1 : -1;
  for (let ty = a.cy + step; a.cy !== b.cy && ty !== b.cy + step; ty += step) path.push([b.cx, ty, "v"]);
  let door: Door | null = null;
  let doorAt = -1, plateAt = -1;
  for (let i = 1; i < path.length; i++) {
    const [tx, ty, dir] = path[i];
    if (bossMask[ty * MW + tx] !== 1) continue;
    const [dx, dy] = path[i - 1];
    const cells: [number, number][] = dir === "h"
      ? [[dx, dy - 1], [dx, dy], [dx, dy + 1]]
      : [[dx - 1, dy], [dx, dy], [dx + 1, dy]];
    doorAt = i; plateAt = Math.max(0, i - 3);
    const plate = path[plateAt];
    door = { cells, plate: [plate[0], plate[1]], inside: [tx, ty] };
    break;
  }
  if (!door) throw new Error("no door: the corridor never reached the chamber");
  for (const [tx, ty] of door.cells) if (tiles[ty * MW + tx] === T_FLOOR && bossMask[ty * MW + tx] !== 1) tiles[ty * MW + tx] = T_DOOR;
  // Walls: every void tile touching a floor or door tile.
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    if (tiles[ty * MW + tx] === T_VOID && nearFloor(tiles, tx, ty)) tiles[ty * MW + tx] = T_WALL;
  }
  const route: [number, number][] = [tileCentre(rooms[0].cx, rooms[0].cy)];
  for (let i = 0; i < 4; i++) {
    const p = rooms[i], q = rooms[i + 1];
    route.push(tileCentre(q.cx, p.cy));
    route.push(tileCentre(q.cx, q.cy));
  }
  // The last leg in corridor order: the corner, the plate and the first tile inside the chamber,
  // whichever way round the door falls, then the chamber's centre.
  const cornerAt = b.cx - a.cx;
  const marks = [...new Set([cornerAt, plateAt, doorAt].filter((k) => k < path.length))].sort((x, y) => x - y);
  let plateIndex = -1;
  for (const k of marks) {
    route.push(tileCentre(path[k][0], path[k][1]));
    if (k === plateAt) plateIndex = route.length - 1;
  }
  route.push(tileCentre(b.cx, b.cy));
  if (plateIndex < 0) throw new Error("no plate on the route");
  return { seed, tiles, bossMask, rooms, door, route, plateIndex, spawn: tileCentre(rooms[0].cx, rooms[0].cy) };
}

/** Whether the segment between two points (units) crosses no solid tile, sampled every half tile. */
export function lineClear(w: World, x0: number, y0: number, x1: number, y1: number, doorShut: boolean): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(1, div(Math.max(dx < 0 ? -dx : dx, dy < 0 ? -dy : dy), TILE / 2));
  for (let i = 1; i < n; i++) if (solidAt(w, x0 + div(dx * i, n), y0 + div(dy * i, n), doorShut)) return false;
  return !solidAt(w, x1, y1, doorShut);
}

/** Breadth-first reachability over floor and door tiles, for the tests. */
export function reachable(w: World, from: [number, number], to: [number, number]): boolean {
  const seen = new Uint8Array(MW * MH);
  const q: number[] = [from[1] * MW + from[0]];
  seen[q[0]] = 1;
  const goal = to[1] * MW + to[0];
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    if (i === goal) return true;
    const tx = i % MW, ty = (i - tx) / MW;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const j = ny * MW + nx, t = w.tiles[j];
      if (seen[j] || (t !== T_FLOOR && t !== T_DOOR)) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return false;
}
