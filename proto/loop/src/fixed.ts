// Fixed-point arithmetic for the simulation. Every number the simulation stores is an integer:
// positions in 1/256 px (eight fractional bits), angles in 1/1024 of a turn, trigonometry in
// Q14 from a committed table. Nothing here calls Math.sin, Math.cos, Math.atan2, Math.random or
// any routine whose rounding a JavaScript engine may choose for itself.
//
// Why Math.trunc(a / b) is exact: a / b is correctly rounded (IEEE 754 requires it), and when
// the true quotient is not an integer it is at least 1/|b| away from any integer, which for
// |a| < 2^52 is more than half an ulp of the quotient, so rounding cannot carry it across one.
// Math.sqrt is correctly rounded too, and isqrt corrects the floor by integer comparison anyway.
import { SIN_Q14 } from "./sin-table.ts";

export const ONE = 256;                 // one pixel, in units
export const TILE_PX = 16;
export const TILE = TILE_PX * ONE;      // one tile = 4096 units
export const TURN = 1024;               // angle units per full turn
export const Q14 = 16384;

/** Pixels to units. */
export function px(n: number): number { return n * ONE; }
/** Integer division toward zero. */
export function div(a: number, b: number): number { return Math.trunc(a / b); }
/** Integer division toward minus infinity. */
export function floorDiv(a: number, b: number): number { return Math.floor(a / b); }
export function clamp(n: number, lo: number, hi: number): number { return n < lo ? lo : n > hi ? hi : n; }
export function abs(n: number): number { return n < 0 ? -n : n; }
export function sign(n: number): -1 | 0 | 1 { return n < 0 ? -1 : n > 0 ? 1 : 0; }
/** Floor of the square root of a non-negative integer below 2^53. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}
export function norm(a: number): number { return ((a % TURN) + TURN) % TURN; }
export function sin(a: number): number { return SIN_Q14[norm(a)]; }
export function cos(a: number): number { return SIN_Q14[norm(a + TURN / 4)]; }
export function len(dx: number, dy: number): number { return isqrt(dx * dx + dy * dy); }
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}
/** Rotate (x, y) by an angle. Coordinates stay under 2^22, so the Q14 products stay under 2^37. */
export function rotate(x: number, y: number, a: number): [number, number] {
  const c = cos(a), s = sin(a);
  return [floorDiv(x * c - y * s, Q14), floorDiv(x * s + y * c, Q14)];
}
/** A velocity of `speed` units per tick toward angle `a`. */
export function fromAngle(a: number, speed: number): [number, number] {
  return [floorDiv(cos(a) * speed, Q14), floorDiv(sin(a) * speed, Q14)];
}
/** A velocity of `speed` units per tick along (dx, dy); the zero vector goes nowhere. */
export function toward(dx: number, dy: number, speed: number): [number, number] {
  const l = len(dx, dy);
  if (l === 0) return [0, 0];
  return [div(dx * speed, l), div(dy * speed, l)];
}
/** Velocity along (dx, dy) turned by `a`, at `speed`. Aimed volleys with a spread use this. */
export function towardTurned(dx: number, dy: number, a: number, speed: number): [number, number] {
  const [rx, ry] = rotate(dx, dy, a);
  return toward(rx, ry, speed);
}
/** Pixels per second to units per tick at 60 Hz. */
export function pps(pixelsPerSecond: number): number { return div(pixelsPerSecond * ONE, 60); }
/** Radians (as written in the slice) to angle units, for porting its constants. 0.26 rad -> 42. */
export function rad(r: number): number { return Math.round((r / (2 * Math.PI)) * TURN); }
