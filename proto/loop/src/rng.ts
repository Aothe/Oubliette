// Integer randomness and hashing. The generator is mulberry32 (the slice's and the art bank's)
// yielding a uint32 instead of a float. `below(n)` is exact for n < 2^21: u * n < 2^53 and the
// division by 2^32 is by a power of two.
//
// Per-tick seeding follows docs/chain.md §3 and docs/red-team.md D1: a run has a committed server
// secret S; the stream for tick t is seeded from H(S, run, t), so no roll can be read before the
// secret is revealed and the replay shows the seed was fixed before play. The production hash is
// keccak; the mixer below stands in for it and nothing else depends on which it is.

export function mix32(h: number, v: number): number {
  h = Math.imul(h ^ v, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
/** A uint32 from a seed and any integers; values are split into 32-bit halves first. */
export function hashInts(seed: number, ...vals: number[]): number {
  let h = mix32(seed >>> 0, 0x9e3779b9);
  for (const v of vals) {
    const hi = Math.floor(v / 4294967296), lo = v - hi * 4294967296;
    h = mix32(h, lo >>> 0);
    h = mix32(h, hi >>> 0);
  }
  return h >>> 0;
}
/** A uint32 from a string, for item ids and labels in the state hash. */
export function hashString(seed: number, s: string): number {
  let h = mix32(seed >>> 0, s.length);
  for (let i = 0; i < s.length; i++) h = mix32(h, s.charCodeAt(i));
  return h >>> 0;
}

export class Rng {
  state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  /** Next uint32. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** Uniform integer in [0, n) for 0 < n < 2^21. */
  below(n: number): number { return Math.floor((this.next() * n) / 4294967296); }
  /** True with probability num/den. */
  chance(num: number, den: number): boolean { return this.below(den) < num; }
  /** Integer in [lo, hi]. */
  range(lo: number, hi: number): number { return lo + this.below(hi - lo + 1); }
  /** -1 or 1. */
  dir(): -1 | 1 { return this.below(2) === 0 ? -1 : 1; }
}

/** The seed of a run: the public dungeon seed, the committed secret, and the entry block. */
export interface RunSeed {
  dungeon: number;        // uint32, public before the run: the layout is the same for every delver
  secret: number[];       // eight uint32 words: the server secret, committed as H(S) before the run
  entryBlock: number;     // uint32 stand-in for the run-start block hash
}

export function tickSeed(seed: RunSeed, tick: number): number {
  return hashInts(0x0b11e77e, ...seed.secret, seed.entryBlock, tick);
}
/** The stream for one tick. */
export function tickRng(seed: RunSeed, tick: number): Rng { return new Rng(tickSeed(seed, tick)); }
/** The stream for settlement: the secret and a block hash fixed by rule after the reveal (D1, D7). */
export function settleRng(seed: RunSeed, settleBlock: number): Rng {
  return new Rng(hashInts(0x5e771e, ...seed.secret, settleBlock, 0xffffffff));
}
/** A seed for a bench run from one integer, so a batch is reproducible from its index. */
export function seedFrom(n: number): RunSeed {
  const secret: number[] = [];
  for (let k = 0; k < 8; k++) secret.push(hashInts(0x5ec4e7, n, k));
  return { dungeon: hashInts(0xd0e0, n), secret, entryBlock: hashInts(0xb10c, n) };
}

/** A running digest over integers: two independent 32-bit lanes, printed as 16 hex digits. */
export class Digest {
  a = 0x811c9dc5;
  b = 0x9747b28c;
  n = 0;
  add(v: number): void {
    if (!Number.isSafeInteger(v)) throw new Error(`non-integer in state: ${v}`);
    const hi = Math.floor(v / 4294967296), lo = (v - hi * 4294967296) >>> 0;
    this.a = mix32(this.a, lo); this.a = mix32(this.a, hi >>> 0);
    this.b = mix32(this.b ^ 0x5bd1e995, lo); this.b = mix32(this.b, hi >>> 0);
    this.n++;
  }
  str(s: string): void { this.add(hashString(0x57, s)); }
  hex(): string {
    return (mix32(this.a, this.n).toString(16).padStart(8, "0") + mix32(this.b, this.n).toString(16).padStart(8, "0"));
  }
}
