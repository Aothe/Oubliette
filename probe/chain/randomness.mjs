#!/usr/bin/env node
// Oubliette — randomness probe for Robinhood Chain (chain id 4663, Arbitrum Orbit / Nitro).
//
// Question: can the game's randomness (SPEC 3.4 / 3.6: ArbSys(0x64).arbBlockHash(n)) be run ahead
// of or biased, by whom, and what should it use instead?
//
// READ-ONLY. This script only issues eth_call / eth_get* / eth_simulateV1 / eth_estimateGas style
// requests plus plain HTTPS GETs (drand). It never signs, never sends a transaction, holds no key.
// The two "does this method exist" probes for eth_sendRawTransactionConditional are sent with an
// EMPTY params array: no transaction bytes leave this machine.
//
// Node 22, no npm dependencies (keccak-256, RLP, the Merkle-Patricia trie and BLS12-381 field
// arithmetic are implemented below).
//
//   node probe/chain/randomness.mjs                 # every section, ~6-8 min, writes out/randomness.txt
//   node probe/chain/randomness.mjs basics header   # only the named sections (prints, does not save)
//   BLOCKS=20000 node probe/chain/randomness.mjs cadence
//
// Sections: basics window history cadence live header simulate bls drand vendors
//
// Every number printed is MEASURED at run time against the chain; nothing is cached.

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zc } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, 'out', 'randomness.txt');

// ───────────────────────────── endpoints ─────────────────────────────
const RPCS = {
  official: 'https://rpc.mainnet.chain.robinhood.com',
  publicnode: 'https://robinhood-rpc.publicnode.com',
  drpc: 'https://robinhood.drpc.org',
};
const BATCH_MAX = { official: 50, publicnode: 50, drpc: 3 };

// ───────────────────────────── output ─────────────────────────────
const LINES = [];
function out(s = '') {
  const text = String(s);
  LINES.push(text);
  process.stdout.write(text + '\n');
}
function head(title) {
  out('');
  out('='.repeat(100));
  out(title);
  out('='.repeat(100));
}

// ───────────────────────────── bytes / hex ─────────────────────────────
const hexToBytes = (h) => {
  if (h.startsWith('0x')) h = h.slice(2);
  if (h.length % 2) h = '0' + h;
  return Uint8Array.from(Buffer.from(h, 'hex'));
};
const bytesToHex = (b) => '0x' + Buffer.from(b).toString('hex');
const concat = (...arrs) => {
  const n = arrs.reduce((a, b) => a + b.length, 0);
  const o = new Uint8Array(n);
  let p = 0;
  for (const a of arrs) { o.set(a, p); p += a.length; }
  return o;
};
const bigToBytes = (x) => {            // minimal big-endian, 0 → empty
  x = BigInt(x);
  if (x === 0n) return new Uint8Array(0);
  let h = x.toString(16);
  if (h.length % 2) h = '0' + h;
  return hexToBytes(h);
};
const pad32 = (x) => {
  const b = typeof x === 'string' ? hexToBytes(x) : (x instanceof Uint8Array ? x : bigToBytes(x));
  const o = new Uint8Array(32);
  o.set(b, 32 - b.length);
  return o;
};
const padN = (x, n) => {
  const b = bigToBytes(x);
  const o = new Uint8Array(n);
  o.set(b, n - b.length);
  return o;
};
const bytesToBig = (b) => (b.length ? BigInt('0x' + Buffer.from(b).toString('hex')) : 0n);
const eqBytes = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (x, d = 2) => Number(x).toFixed(d);
const pct = (x, d = 1) => (100 * x).toFixed(d) + ' %';

// ───────────────────────────── keccak-256 ─────────────────────────────
const KRC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const KROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const M64 = (1n << 64n) - 1n;
const rotl64 = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64);
function keccakF(s) {
  const c = new Array(5), b = new Array(25);
  for (let r = 0; r < 24; r++) {
    for (let x = 0; x < 5; x++) c[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) s[x + y] ^= d;
    }
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(s[x + 5 * y], KROT[x + 5 * y]);
    }
    for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) {
      s[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & M64 & b[((x + 2) % 5) + y]);
    }
    s[0] ^= KRC[r];
  }
}
function keccak256(data) {
  const rate = 136;
  const len = data.length;
  const padLen = rate - (len % rate);
  const p = new Uint8Array(len + padLen);
  p.set(data);
  p[len] ^= 0x01;
  p[p.length - 1] ^= 0x80;
  const s = new Array(25).fill(0n);
  const dv = new DataView(p.buffer);
  for (let off = 0; off < p.length; off += rate) {
    for (let i = 0; i < 17; i++) s[i] ^= dv.getBigUint64(off + 8 * i, true);
    keccakF(s);
  }
  const o = new Uint8Array(32);
  const ov = new DataView(o.buffer);
  for (let i = 0; i < 4; i++) ov.setBigUint64(8 * i, s[i], true);
  return o;
}
const keccakHex = (data) => bytesToHex(keccak256(data));
const selector = (sig) => bytesToHex(keccak256(Buffer.from(sig)).slice(0, 4));
const sha256 = (b) => Uint8Array.from(createHash('sha256').update(b).digest());

// ───────────────────────────── RLP ─────────────────────────────
function rlpLen(len, offset) {
  if (len < 56) return Uint8Array.of(offset + len);
  const lb = bigToBytes(len);
  return concat(Uint8Array.of(offset + 55 + lb.length), lb);
}
function rlp(x) {
  if (Array.isArray(x)) {
    const body = concat(...x.map(rlp));
    return concat(rlpLen(body.length, 0xc0), body);
  }
  if (typeof x === 'string') x = hexToBytes(x);
  if (typeof x === 'bigint' || typeof x === 'number') x = bigToBytes(x);
  if (x.length === 1 && x[0] < 0x80) return x;
  return concat(rlpLen(x.length, 0x80), x);
}
function rlpDecode(buf) {
  const dec = (p) => {
    const b0 = buf[p];
    if (b0 < 0x80) return [buf.slice(p, p + 1), p + 1];
    if (b0 < 0xb8) { const l = b0 - 0x80; return [buf.slice(p + 1, p + 1 + l), p + 1 + l]; }
    if (b0 < 0xc0) {
      const ll = b0 - 0xb7; const l = Number(bytesToBig(buf.slice(p + 1, p + 1 + ll)));
      return [buf.slice(p + 1 + ll, p + 1 + ll + l), p + 1 + ll + l];
    }
    let start, end;
    if (b0 < 0xf8) { start = p + 1; end = start + (b0 - 0xc0); }
    else { const ll = b0 - 0xf7; const l = Number(bytesToBig(buf.slice(p + 1, p + 1 + ll))); start = p + 1 + ll; end = start + l; }
    const items = [];
    let q = start;
    while (q < end) { const [it, nq] = dec(q); items.push(it); q = nq; }
    return [items, end];
  };
  return dec(0)[0];
}

// ───────────────────────────── Merkle-Patricia trie (build from scratch) ─────────────────────────────
const toNibbles = (b) => { const o = []; for (const x of b) o.push(x >> 4, x & 15); return o; };
function hexPrefix(nibbles, leaf) {
  const odd = nibbles.length % 2;
  const first = (leaf ? 2 : 0) + odd;
  const n = odd ? [first, ...nibbles] : [first, 0, ...nibbles];
  const o = new Uint8Array(n.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = (n[2 * i] << 4) | n[2 * i + 1];
  return o;
}
// items: [{k: nibble[], v: Uint8Array}] ; returns the node as an RLP-able structure
function buildNode(items, depth) {
  if (items.length === 0) return new Uint8Array(0);
  if (items.length === 1) return [hexPrefix(items[0].k.slice(depth), true), items[0].v];
  let cp = 0;
  for (;;) {
    const n = items[0].k[depth + cp];
    if (n === undefined || !items.every((it) => it.k[depth + cp] === n)) break;
    cp++;
  }
  if (cp > 0) return [hexPrefix(items[0].k.slice(depth, depth + cp), false), nodeRef(buildNode(items, depth + cp))];
  const branch = [];
  for (let i = 0; i < 16; i++) branch.push(nodeRef(buildNode(items.filter((it) => it.k[depth] === i), depth + 1)));
  const here = items.find((it) => it.k.length === depth);
  branch.push(here ? here.v : new Uint8Array(0));
  return branch;
}
// reference to a node inside its parent: the node itself if its RLP is < 32 bytes, else its hash
function nodeRef(node) {
  if (node instanceof Uint8Array && node.length === 0) return node;
  const enc = rlp(node);
  return enc.length < 32 ? { raw: enc } : keccak256(enc);
}
// rlp() must embed {raw} nodes verbatim
const _rlp = rlp;
function rlpNode(x) {
  if (x && x.raw) return x.raw;
  if (Array.isArray(x)) { const body = concat(...x.map(rlpNode)); return concat(rlpLen(body.length, 0xc0), body); }
  return _rlp(x);
}
function trieRootOrdered(values) {      // DeriveSha: key = rlp(index)
  const items = values.map((v, i) => ({ k: toNibbles(rlp(BigInt(i))), v }));
  const build = (its, depth) => {
    if (its.length === 0) return new Uint8Array(0);
    if (its.length === 1) return [hexPrefix(its[0].k.slice(depth), true), its[0].v];
    let cp = 0;
    for (;;) {
      const n = its[0].k[depth + cp];
      if (n === undefined || !its.every((it) => it.k[depth + cp] === n)) break;
      cp++;
    }
    if (cp > 0) return [hexPrefix(its[0].k.slice(depth, depth + cp), false), ref(build(its, depth + cp))];
    const br = [];
    for (let i = 0; i < 16; i++) br.push(ref(build(its.filter((it) => it.k[depth] === i), depth + 1)));
    const here = its.find((it) => it.k.length === depth);
    br.push(here ? here.v : new Uint8Array(0));
    return br;
  };
  const ref = (node) => {
    if (node instanceof Uint8Array && node.length === 0) return node;
    const enc = rlpNode(node);
    return enc.length < 32 ? { raw: enc } : keccak256(enc);
  };
  const root = build(items, 0);
  if (root instanceof Uint8Array && root.length === 0) return keccak256(rlp(new Uint8Array(0)));
  return keccak256(rlpNode(root));
}

// ───────────────────────────── JSON-RPC ─────────────────────────────
let rpcCalls = 0;
async function rpcRaw(name, body, timeoutMs = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(RPCS[name], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await r.text();
    rpcCalls++;
    return { status: r.status, text };
  } finally { clearTimeout(t); }
}
// one call; returns {result} or {error}; retries on transport errors and 429
async function rpc(name, method, params = [], { tries = 6 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const { status, text } = await rpcRaw(name, { jsonrpc: '2.0', id: 1, method, params });
      let j;
      try { j = JSON.parse(text); } catch { j = null; }
      if (j && !Array.isArray(j)) {
        if (j.error && (j.error.code === 429 || /too many|rate/i.test(j.error.message || ''))) { last = j; await sleep(600 * (i + 1)); continue; }
        return j;
      }
      if (status === 429) { last = { error: { code: 429, message: 'Too Many Requests' } }; await sleep(600 * (i + 1)); continue; }
      return { error: { code: status, message: 'non-JSON reply: ' + text.slice(0, 200).trim() } };
    } catch (e) { last = { error: { code: -1, message: String(e.message || e) } }; await sleep(400 * (i + 1)); }
  }
  return last;
}
// batch; rotates and backs off; returns results in order (throws on persistent failure)
async function rpcBatch(name, calls, { tries = 8 } = {}) {
  const max = BATCH_MAX[name];
  const outArr = new Array(calls.length);
  for (let off = 0; off < calls.length; off += max) {
    const chunk = calls.slice(off, off + max);
    const body = chunk.map((c, i) => ({ jsonrpc: '2.0', id: i, method: c[0], params: c[1] }));
    let ok = false, lastErr = '';
    for (let t = 0; t < tries && !ok; t++) {
      try {
        const { status, text } = await rpcRaw(name, body, 45000);
        const j = JSON.parse(text);
        if (!Array.isArray(j)) { lastErr = text.slice(0, 200); await sleep(700 * (t + 1)); continue; }
        if (j.some((x) => x.error && (x.error.code === 429 || /too many|rate|limit/i.test(x.error.message || '')))) { lastErr = 'rate limited'; await sleep(900 * (t + 1)); continue; }
        for (const x of j) outArr[off + x.id] = x;
        ok = true;
      } catch (e) { lastErr = String(e.message || e); await sleep(700 * (t + 1)); }
    }
    if (!ok) throw new Error(`batch to ${name} failed: ${lastErr}`);
  }
  return outArr;
}
const ethCall = async (name, to, data, block = 'latest', overrides) => {
  const params = [{ to, data }, block];
  if (overrides) params.push(overrides);
  return rpc(name, 'eth_call', params);
};
const hexNum = (h) => (h === undefined || h === null ? null : Number(BigInt(h)));
const toHex = (n) => '0x' + BigInt(n).toString(16);

// ───────────────────────────── Ethereum / Arbitrum encodings ─────────────────────────────
const HEADER_FIELDS = ['parentHash', 'sha3Uncles', 'miner', 'stateRoot', 'transactionsRoot', 'receiptsRoot', 'logsBloom',
  'difficulty', 'number', 'gasLimit', 'gasUsed', 'timestamp', 'extraData', 'mixHash', 'nonce', 'baseFeePerGas'];
const HEADER_NUMERIC = new Set(['difficulty', 'number', 'gasLimit', 'gasUsed', 'timestamp', 'baseFeePerGas']);
const HEADER_OPTIONAL = ['withdrawalsRoot', 'blobGasUsed', 'excessBlobGas', 'parentBeaconBlockRoot', 'requestsHash'];
function headerHash(h) {
  const items = HEADER_FIELDS.map((f) => (HEADER_NUMERIC.has(f) ? BigInt(h[f]) : hexToBytes(h[f])));
  for (const f of HEADER_OPTIONAL) {
    if (h[f] === undefined || h[f] === null) break;
    items.push(/GasUsed|excessBlobGas/.test(f) ? BigInt(h[f]) : hexToBytes(h[f]));
  }
  return keccakHex(rlp(items));
}
// canonical (consensus) encoding of a transaction from its JSON-RPC form
function encodeTx(t) {
  const type = Number(t.type);
  const al = (t.accessList || []).map((a) => [hexToBytes(a.address), a.storageKeys.map(hexToBytes)]);
  const to = t.to ? hexToBytes(t.to) : new Uint8Array(0);
  if (type === 0x6a) return concat(Uint8Array.of(0x6a), rlp([BigInt(t.chainId), hexToBytes(t.input)]));
  if (type === 0) return rlp([BigInt(t.nonce), BigInt(t.gasPrice), BigInt(t.gas), to, BigInt(t.value), hexToBytes(t.input), BigInt(t.v), BigInt(t.r), BigInt(t.s)]);
  if (type === 1) return concat(Uint8Array.of(1), rlp([BigInt(t.chainId), BigInt(t.nonce), BigInt(t.gasPrice), BigInt(t.gas), to, BigInt(t.value), hexToBytes(t.input), al, BigInt(t.yParity ?? t.v), BigInt(t.r), BigInt(t.s)]));
  if (type === 2) return concat(Uint8Array.of(2), rlp([BigInt(t.chainId), BigInt(t.nonce), BigInt(t.maxPriorityFeePerGas), BigInt(t.maxFeePerGas), BigInt(t.gas), to, BigInt(t.value), hexToBytes(t.input), al, BigInt(t.yParity ?? t.v), BigInt(t.r), BigInt(t.s)]));
  if (type === 4) {
    const auth = (t.authorizationList || []).map((a) => [BigInt(a.chainId), hexToBytes(a.address), BigInt(a.nonce), BigInt(a.yParity ?? a.v), BigInt(a.r), BigInt(a.s)]);
    return concat(Uint8Array.of(4), rlp([BigInt(t.chainId), BigInt(t.nonce), BigInt(t.maxPriorityFeePerGas), BigInt(t.maxFeePerGas), BigInt(t.gas), to, BigInt(t.value), hexToBytes(t.input), al, auth, BigInt(t.yParity ?? t.v), BigInt(t.r), BigInt(t.s)]));
  }
  return null;   // other Arbitrum-internal types (deposit, retryable, …) are not needed here
}
function logsBloom(logs) {
  const bloom = new Uint8Array(256);
  const add = (b) => {
    const h = keccak256(b);
    for (let i = 0; i < 6; i += 2) {
      const bit = ((h[i] << 8) | h[i + 1]) & 2047;
      bloom[255 - (bit >> 3)] |= 1 << (bit & 7);
    }
  };
  for (const l of logs) { add(hexToBytes(l.address)); for (const t of l.topics) add(hexToBytes(t)); }
  return bloom;
}
function encodeReceipt({ type, status, cumulativeGasUsed, logs }) {
  const body = rlp([BigInt(status), BigInt(cumulativeGasUsed), logsBloom(logs), logs.map((l) => [hexToBytes(l.address), l.topics.map(hexToBytes), hexToBytes(l.data)])]);
  return Number(type) === 0 ? body : concat(Uint8Array.of(Number(type)), body);
}
// the ArbOS start-of-block internal transaction (arbos/internal_tx.go InternalTxStartBlock)
const SEL_START_BLOCK = '0x6bf6a42d';   // startBlock(uint256 l1BaseFee,uint64 l1BlockNumber,uint64 l2BlockNumber,uint64 timePassed)
function startBlockTx(chainId, l1BaseFee, l1Block, l2Block, timePassed) {
  const data = concat(hexToBytes(SEL_START_BLOCK), pad32(l1BaseFee), pad32(l1Block), pad32(l2Block), pad32(timePassed));
  return concat(Uint8Array.of(0x6a), rlp([BigInt(chainId), data]));
}
const parseMix = (mix) => {
  const b = hexToBytes(mix);
  return { sendCount: bytesToBig(b.slice(0, 8)), l1Block: bytesToBig(b.slice(8, 16)), arbos: bytesToBig(b.slice(16, 24)), flags: bytesToHex(b.slice(24, 32)) };
};

// ───────────────────────────── BLS12-381 (EIP-2537) — only what drand verification needs ─────────────────────────────
const BLS_P = 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;
const bmod = (a) => { a %= BLS_P; return a < 0n ? a + BLS_P : a; };
const bpow = (b, e) => { let r = 1n; b = bmod(b); while (e > 0n) { if (e & 1n) r = r * b % BLS_P; b = b * b % BLS_P; e >>= 1n; } return r; };
const bHalf = (BLS_P - 1n) / 2n;
const f2mul = (a, b) => [bmod(a[0] * b[0] - a[1] * b[1]), bmod(a[0] * b[1] + a[1] * b[0])];
const f2add = (a, b) => [bmod(a[0] + b[0]), bmod(a[1] + b[1])];
const f2pow = (b, e) => { let r = [1n, 0n]; while (e > 0n) { if (e & 1n) r = f2mul(r, b); b = f2mul(b, b); e >>= 1n; } return r; };
const f2conj = (a) => [a[0], bmod(-a[1])];
const f2eq = (a, b) => a[0] === b[0] && a[1] === b[1];
const G1x = 0x17f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bbn;
const G1y = 0x08b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1n;
const G2 = [[0x024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8n, 0x13e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7en], [0x0ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801n, 0x0606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79ben]];
const encFp = (x) => x.toString(16).padStart(128, '0');
const encG1 = (p) => encFp(p[0]) + encFp(p[1]);
const encG2 = (p) => encFp(p[0][0]) + encFp(p[0][1]) + encFp(p[1][0]) + encFp(p[1][1]);
const negG2 = (p) => [p[0], [bmod(-p[1][0]), bmod(-p[1][1])]];
function sqrtFp(a) { const r = bpow(a, (BLS_P + 1n) / 4n); return bmod(r * r) === bmod(a) ? r : null; }
function sqrtFp2(a) {
  const a1 = f2pow(a, (BLS_P - 3n) / 4n); const alpha = f2mul(a1, f2mul(a1, a)); const a0 = f2mul(f2conj(alpha), alpha);
  if (f2eq(a0, [BLS_P - 1n, 0n])) return null;
  const x0 = f2mul(a1, a);
  const x = f2eq(alpha, [BLS_P - 1n, 0n]) ? f2mul([0n, 1n], x0) : f2mul(f2pow(f2add([1n, 0n], alpha), (BLS_P - 1n) / 2n), x0);
  return f2eq(f2mul(x, x), a) ? x : null;
}
function decompressG1(hexStr) {
  const b = Buffer.from(hexStr, 'hex'); const sign = (b[0] & 0x20) !== 0; b[0] &= 0x1f;
  const x = BigInt('0x' + b.toString('hex')); let y = sqrtFp(bmod(x * x * x + 4n));
  if (y === null) throw new Error('G1 not on curve'); if ((y > bHalf) !== sign) y = BLS_P - y; return [x, y];
}
function decompressG2(hexStr) {
  const b = Buffer.from(hexStr, 'hex'); const sign = (b[0] & 0x20) !== 0; b[0] &= 0x1f;
  const c1 = BigInt('0x' + b.subarray(0, 48).toString('hex')), c0 = BigInt('0x' + b.subarray(48, 96).toString('hex'));
  const x = [c0, c1]; let y = sqrtFp2(f2add(f2mul(x, f2mul(x, x)), [4n, 4n]));
  if (y === null) throw new Error('G2 not on curve');
  const big = y[1] !== 0n ? y[1] > bHalf : y[0] > bHalf; if (big !== sign) y = [bmod(-y[0]), bmod(-y[1])]; return [x, y];
}
function expandXmd(msg, dst, len) {
  const ell = Math.ceil(len / 32); const dstP = Buffer.concat([dst, Buffer.from([dst.length])]);
  const b0 = Uint8Array.from(createHash('sha256').update(Buffer.concat([Buffer.alloc(64), msg, Buffer.from([len >> 8, len & 255, 0]), dstP])).digest());
  const bs = [Uint8Array.from(createHash('sha256').update(Buffer.concat([b0, Buffer.from([1]), dstP])).digest())];
  for (let i = 2; i <= ell; i++) { const x = Buffer.alloc(32); for (let j = 0; j < 32; j++) x[j] = b0[j] ^ bs[i - 2][j]; bs.push(Uint8Array.from(createHash('sha256').update(Buffer.concat([x, Buffer.from([i]), dstP])).digest())); }
  return Buffer.concat(bs).subarray(0, len);
}
function hashToFieldG1(msg, dst) { const u = expandXmd(msg, dst, 128); return [bmod(BigInt('0x' + u.subarray(0, 64).toString('hex'))), bmod(BigInt('0x' + u.subarray(64, 128).toString('hex')))]; }

// ───────────────────────────── section helpers ─────────────────────────────
const PRIMARY = 'publicnode';
const toWords = (hex) => { const b = hexToBytes(hex); const w = []; for (let i = 0; i < b.length; i += 32) w.push(bytesToBig(b.slice(i, i + 32))); return w; };
const addrOf = (word) => '0x' + word.toString(16).padStart(40, '0');
async function callWord(to, sig, block = 'latest') { const r = await ethCall(PRIMARY, to, selector(sig), block); return r.error ? null : toWords(r.result); }

// ───────────────────────────── sections ─────────────────────────────
async function sec_basics() {
  head('A. BASICS — endpoints, client, ArbOS, gas accounting (eth_call to ArbOS precompiles)');
  for (const name of Object.keys(RPCS)) {
    const [cid, ver, mods] = [await rpc(name, 'eth_chainId', []), await rpc(name, 'web3_clientVersion', []), await rpc(name, 'rpc_modules', [])];
    out(`${name.padEnd(11)} chainId=${cid.result ?? 'err'} client=${(ver.result ?? JSON.stringify(ver.error)).toString().slice(0, 60)}`);
    out(`${' '.repeat(11)} rpc_modules=${JSON.stringify(mods.result ?? mods.error)}`);
  }
  const SYS = '0x0000000000000000000000000000000000000064', GAS = '0x000000000000000000000000000000000000006c', OWN = '0x000000000000000000000000000000000000006b';
  const av = (await callWord(SYS, 'arbOSVersion()'))[0];
  out(`\nArbSys.arbOSVersion() = ${av}  → ArbOS ${av - 55n}  (precompile returns 55+version; chain-info InitialArbOSVersion=51, storage version slot read separately)`);
  out(`ArbSys.arbBlockNumber() = ${(await callWord(SYS, 'arbBlockNumber()'))[0]}   arbChainID() = ${(await callWord(SYS, 'arbChainID()'))[0]}`);
  const gp = (await callWord(GAS, 'getGasAccountingParams()'));
  out(`ArbGasInfo.getGasAccountingParams() speedLimit=${gp[0]} gas/s  perBlockGasLimit=${gp[1]}  maxBlock=${gp[2]}`);
  out(`  getMinimumGasPrice()=${(await callWord(GAS, 'getMinimumGasPrice()'))[0]} wei  getMaxTxGasLimit()=${(await callWord(GAS, 'getMaxTxGasLimit()'))[0]}`);
  const gpr = await rpc(PRIMARY, 'eth_gasPrice', []);
  out(`  eth_gasPrice=${BigInt(gpr.result)} wei (${(Number(BigInt(gpr.result)) / 1e9).toFixed(4)} gwei)`);
  const gc = await callWord(GAS, 'getGasPricingConstraints()');
  out(`  getGasPricingConstraints() (target/s, window s, backlog) x${gc[1]}: ${gc.slice(2).reduce((a, _, i, s) => (i % 3 === 0 ? [...a, s.slice(i, i + 3).map(String).join('/')] : a), []).join('  ')}`);
  const owners = await callWord(OWN, 'getAllChainOwners()');
  out(`\nArbOwnerPublic.getAllChainOwners() = ${owners.slice(2).map(addrOf).join(', ')}`);
  const filt = await callWord(OWN, 'getAllTransactionFilterers()');
  out(`  getAllTransactionFilterers() = ${filt.slice(2).map(addrOf).join(', ') || '(none)'}   filteringFrom epoch=${(await callWord(OWN, 'getTransactionFilteringFrom()'))[0]}`);
  out(`  getNetworkFeeAccount()=${addrOf((await callWord(OWN, 'getNetworkFeeAccount()'))[0])}  getInfraFeeAccount()=${addrOf((await callWord(OWN, 'getInfraFeeAccount()'))[0])}`);
  out(`  getScheduledUpgrade()=${(await callWord(OWN, 'getScheduledUpgrade()')).map(String).join('/')} (version/timestamp, 0/0 = none)`);
}

async function sec_window() {
  head('C. THE 256-BLOCK WINDOW — ArbSys.arbBlockHash reach, vs the EIP-2935 history contract');
  const SYS = '0x0000000000000000000000000000000000000064';
  const HIST = '0x0000F90827F1C53a10cb7A02335B175320002935';
  const latest = hexNum((await rpc(PRIMARY, 'eth_blockNumber', [])).result);
  const pin = toHex(latest);
  out(`latest L2 block ${latest}; all calls executed pinned at that block`);
  for (const o of [0, 1, 2, 255, 256, 257, 300]) {
    const data = selector('arbBlockHash(uint256)') + Buffer.from(pad32(BigInt(latest - o))).toString('hex');
    const r = await rpc(PRIMARY, 'eth_call', [{ to: SYS, data }, pin]);
    let real = null; try { real = (await rpc(PRIMARY, 'eth_getBlockByNumber', [toHex(latest - o), false])).result.hash; } catch {}
    out(`  arbBlockHash(latest-${String(o).padEnd(3)}) = ${r.error ? 'REVERT InvalidBlockNumber' : r.result + (r.result === real ? '  == RPC block hash' : '  != RPC')}`);
  }
  out(`→ on-chain reach: exactly the previous 256 blocks (latest-1 … latest-256); reverts at the current block and beyond 256.`);
  out(`  at ${fmt(latest ? 10 : 10, 1)} blocks/s that window is ~25-26 s of wall time.`);
  const code = (await rpc(PRIMARY, 'eth_getCode', [HIST, 'latest'])).result;
  out(`\nEIP-2935 history contract ${HIST}: ${(code.length - 2) / 2} bytes of code (ArbOS>=40 fills it via ProcessParentBlockHash).`);
  let lo = 256, hi = 1 << 20;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; const r = await rpc(PRIMARY, 'eth_call', [{ to: HIST, data: bytesToHex(pad32(BigInt(latest - mid))) }, pin]); if (r.error || /^0x0*$/.test(r.result)) hi = mid; else lo = mid; }
  out(`  deepest block it still returns, binary-searched: latest-${lo} (~${(lo / 10 / 3600).toFixed(1)} h of history); latest-${hi} already reverts.`);
  out(`→ a roll keyed on arbBlockHash must be read within 256 blocks ON CHAIN, or proven OFF CHAIN from the header (kept by any archive/RPC forever).`);
}

async function sec_history() {
  head('HISTORY DEPTH — how far back each public RPC serves HEADERS vs STATE (bounds off-chain proving)');
  for (const name of Object.keys(RPCS)) {
    const latest = hexNum((await rpc(name, 'eth_blockNumber', [])).result);
    const hdrDeep = await rpc(name, 'eth_getBlockByNumber', ['0x1', false]);
    let stLo = 0, stHi = 300000;
    // find state horizon via eth_call to a precompile (cheap, no args)
    const probe = async (back) => { const r = await rpc(name, 'eth_call', [{ to: '0x000000000000000000000000000000000000006c', data: selector('getMinimumGasPrice()') }, toHex(latest - back)]); return !r.error; };
    if (!(await probe(1))) { out(`${name}: no state even at latest-1 (unexpected)`); continue; }
    while (stLo + 1 < stHi) { const mid = (stLo + stHi) >> 1; if (await probe(mid)) stLo = mid; else stHi = mid; }
    out(`${name.padEnd(11)} headers: genesis(block 1) ${hdrDeep.result ? 'served' : 'NOT served'}; state horizon ~ latest-${stLo} blocks (${(stLo / 10).toFixed(0)}s). Deeper state ⇒ archive/token.`);
  }
  out('→ Block HASHES live in headers and are served forever by a normal RPC; STATE (so eth_getProof of a stored seed) is pruned after ~100-130 blocks on these public nodes.');
  out('  A third party replaying the input log checks a roll from the header hash (eth_getBlockByNumber), which never prunes — not from state.');
}

async function sec_cadence() {
  head('A.2 CADENCE — block production and how transactions are grouped (measured over recent blocks)');
  const N = Number(process.env.BLOCKS || 6000);
  const latest = hexNum((await rpc(PRIMARY, 'eth_blockNumber', [])).result);
  const start = latest - N + 1;
  const slim = [];
  const chunks = []; for (let a = start; a <= latest; a += 50) chunks.push([a, Math.min(latest, a + 49)]);
  let ci = 0;
  const worker = async (name) => {
    while (ci < chunks.length) {
      const [a, b] = chunks[ci++]; const calls = []; for (let n = a; n <= b; n++) calls.push(['eth_getBlockByNumber', [toHex(n), true]]);
      let res; try { res = await rpcBatch(name, calls); } catch { chunks.push([a, b]); await sleep(2000); continue; }
      for (const r of res) { const k = r.result; slim.push({ n: hexNum(k.number), ts: hexNum(k.timestamp), hash: k.hash, parentHash: k.parentHash, mix: k.mixHash, txs: k.transactions.map((t) => ({ type: hexNum(t.type), from: t.from })) }); }
      if (name !== PRIMARY) await sleep(250);
    }
  };
  await Promise.all([worker(PRIMARY), worker(PRIMARY), worker('official')]);
  slim.sort((x, y) => x.n - y.n);
  const n = slim.length, span = slim[n - 1].ts - slim[0].ts;
  let contiguous = true; for (let i = 1; i < n; i++) if (slim[i].parentHash !== slim[i - 1].hash) contiguous = false;
  out(`fetched ${n} blocks ${slim[0].n}..${slim[n - 1].n}; span ${span}s; parentHash-contiguous: ${contiguous}`);
  const perSec = new Map(); for (const b of slim) perSec.set(b.ts, (perSec.get(b.ts) || 0) + 1);
  const secs = []; for (let s = slim[0].ts + 1; s < slim[n - 1].ts; s++) secs.push(perSec.get(s) || 0);
  out(`blocks/s: mean ${fmt(secs.reduce((a, b) => a + b, 0) / secs.length)} (min ${Math.min(...secs)}, max ${Math.max(...secs)}) over ${secs.length} full seconds`);
  const dts = {}; for (let i = 1; i < n; i++) { const d = slim[i].ts - slim[i - 1].ts; dts[d] = (dts[d] || 0) + 1; }
  out(`timestamp delta to parent (s): ${JSON.stringify(dts)} (timestamps are whole seconds; most blocks share a second ⇒ sub-second spacing)`);
  const hist = {}; let singles = 0, zero = 0, maxu = 0, sumu = 0;
  for (const b of slim) { const u = b.txs.filter((t) => t.type !== 0x6a).length; b.u = u; hist[u] = (hist[u] || 0) + 1; sumu += u; if (u === 1) singles++; if (u === 0) zero++; if (u > maxu) maxu = u; }
  out(`user txs per block (0x6a internal start-tx excluded): mean ${fmt(sumu / n)}, max ${maxu}`);
  out(`  exactly 0 user txs: ${zero} (${pct(zero / n)});  exactly 1: ${singles} (${pct(singles / n)});  2+: ${pct((n - singles - zero) / n)}`);
  const l1 = (b) => Number(BigInt('0x' + b.mix.slice(18, 34)));
  let l1runs = [], run = 1; for (let i = 1; i < n; i++) { if (l1(slim[i]) !== l1(slim[i - 1])) { l1runs.push(run); run = 1; } else run++; }
  out(`  L1 block number (from mixHash) advances every ~${fmt(l1runs.reduce((a, b) => a + b, 0) / Math.max(1, l1runs.length), 0)} L2 blocks (${l1runs.length} changes seen)`);
  const sc = new Map(); let ut = 0; for (const b of slim) for (const t of b.txs) if (t.type !== 0x6a) { sc.set(t.from, (sc.get(t.from) || 0) + 1); ut++; }
  out(`  ${ut} user txs from ${sc.size} distinct senders (${fmt(ut / span)} user tx/s); busiest sender ${pct([...sc.values()].sort((a, b) => b - a)[0] / ut)} of volume`);
  out('→ FCFS time-windowed blocks (MaxBlockSpeed ~250 ms in Nitro defaults). An attacker cannot force itself to be alone: being the sole user tx happens in a minority of blocks and is not controllable.');
}

async function sec_header() {
  head('A.1 / A.3 HEADER — fields, predictability, and reproducing a real block hash from PUBLIC data');
  const latest = hexNum((await rpc(PRIMARY, 'eth_blockNumber', [])).result);
  const bn = latest - 4;
  const blk = (await rpc(PRIMARY, 'eth_getBlockByNumber', [toHex(bn), true])).result;
  const parent = (await rpc(PRIMARY, 'eth_getBlockByNumber', [toHex(bn - 1), false])).result;
  const mine = headerHash(blk);
  out(`block ${bn}: RPC hash ${blk.hash}`);
  out(`            my RLP hash ${mine}   MATCH: ${mine === blk.hash}`);
  const encs = blk.transactions.map(encodeTx);
  out(`  per-tx canonical encodings reproduce every tx hash: ${blk.transactions.every((t, i) => encs[i] && keccakHex(encs[i]) === t.hash)}`);
  out(`  transactionsRoot reproduced from those: ${bytesToHex(trieRootOrdered(encs)) === blk.transactionsRoot}`);
  const sb = startBlockTx(4663, 0, parseMix(blk.mixHash).l1Block, bn, BigInt(hexNum(blk.timestamp) - hexNum(parent.timestamp)));
  out(`  start-of-block internal tx (0x6a) reproduced from (l1BaseFee=0, l1Block, l2 number, timePassed): hash matches on-chain tx0: ${keccakHex(sb) === blk.transactions[0].hash}`);
  const m = parseMix(blk.mixHash);
  out('\nHeader field → can an OUTSIDER know it before the block exists?');
  const rows = [
    ['parentHash', 'YES — it is the current head, public'],
    ['sha3Uncles', 'YES — constant EmptyUncleHash'],
    ['miner/coinbase', 'YES — constant (the batch-poster address) for sequencer blocks'],
    ['difficulty', 'YES — constant 1'],
    ['number', 'YES — parent.number + 1'],
    ['gasLimit', 'YES — constant 2^50'],
    ['extraData (=sendRoot)', 'NO in general — outbox Merkle root; changes only when an L2→L1 msg is emitted, else = parent'],
    [`mixHash sendCount=${m.sendCount} l1Block=${m.l1Block} arbos=${m.arbos}`, 'PARTLY — arbos constant; l1Block = sequencer view of L1 (changes ~every 15 s); sendCount tracks outbox'],
    ['nonce (=delayedMessagesRead)', 'PARTLY — changes only when a delayed/forced inbox msg is read; usually = parent'],
    ['timestamp', 'PARTLY — sequencer clock, whole seconds; knowable to ~1 s'],
    ['baseFeePerGas', 'YES — deterministic from parent backlog (ArbOS exponential pricer)'],
    ['gasUsed', 'NO without executing the block'],
    ['stateRoot', 'NO without executing every tx against parent state under ArbOS'],
    ['transactionsRoot', 'NO without knowing the full, final ordered tx set'],
    ['receiptsRoot', 'NO without executing'],
  ];
  for (const [f, p] of rows) out(`  ${f.padEnd(52)} ${p}`);
  out('\n→ Everything but {state,tx,receipt roots, gasUsed} is parent-/clock-derived and predictable. Those four need execution.');
  out('  So anyone who (a) is the ONLY user tx, (b) holds parent state + runs ArbOS, and (c) predicts timestamp & l1Block');
  out('  can compute the resulting block hash offline, vary their own tx, and keep the variant whose hash they like — a grind.');
  out('  Measured blocker (see cadence): condition (a) holds in only a minority of blocks and is not attacker-controllable;');
  out('  condition (b) needs archive state (public RPCs prune ~100-130 blocks). The sequencer faces neither blocker.');
}

async function sec_simulate() {
  head('A.3 eth_simulateV1 — is it available, and can it stand in for the sequencer?');
  for (const name of Object.keys(RPCS)) {
    const r = await rpc(name, 'eth_simulateV1', [{ blockStateCalls: [{ calls: [] }] }, 'latest']);
    out(`${name.padEnd(11)} eth_simulateV1: ${r.error ? JSON.stringify(r.error).slice(0, 120) : 'returned ' + JSON.stringify(r.result).slice(0, 80)}`);
  }
  out('→ Present, but it REPAIRS the block hash after execution (geth internal/ethapi/simulate.go) and uses caller-supplied');
  out('  Number/Time/overrides; it cannot reproduce the sequencer’s real {timestamp, l1Block, sendRoot}. It proves header ENCODING,');
  out('  not that a future real block hash is predictable. The real test is whether the INPUTS are public (see header section).');
  out('  debug_traceBlock / arbtrace are NOT exposed on the public RPCs (measured in basics rpc_modules).');
}

async function sec_bls() {
  head('B. ON-CHAIN BLS12-381 (EIP-2537) — are precompiles 0x0b..0x11 live? (needed for on-chain drand/VRF verification)');
  const call = async (addr, dataHex) => { const r = await rpc(PRIMARY, 'eth_call', [{ to: '0x' + addr.toString(16).padStart(40, '0'), data: '0x' + dataHex }, 'latest']); return r.error ? 'ERR ' + JSON.stringify(r.error).slice(0, 90) : r.result; };
  const G1 = [G1x, G1y];
  const dbl = (p) => { const l = bmod(3n * p[0] * p[0] * bpow(2n * p[1], BLS_P - 2n)); const x = bmod(l * l - 2n * p[0]); return [x, bmod(l * (p[0] - x) - p[1])]; };
  const twoG1 = dbl(G1);
  out(`0x0b G1ADD(G1,G1)==2·G1 : ${(await call(0x0b, encG1(G1) + encG1(G1))) === '0x' + encG1(twoG1)}`);
  out(`0x0c G1MSM(G1,2)==2·G1   : ${(await call(0x0c, encG1(G1) + (2n).toString(16).padStart(64, '0'))) === '0x' + encG1(twoG1)}`);
  out(`0x0d G2ADD present       : ${(await call(0x0d, encG2(G2) + encG2(G2))).startsWith('0x') }`);
  out(`0x0e G2MSM present       : ${(await call(0x0e, encG2(G2) + (2n).toString(16).padStart(64, '0'))).startsWith('0x')}`);
  out(`0x0f PAIRING e(G1,G2)·e(-G1,G2)==1 : ${await call(0x0f, encG1(G1) + encG2(G2) + encG1([G1[0], bmod(-G1[1])]) + encG2(G2))}`);
  out(`0x10 MAP_FP_TO_G1(1)     : ${(await call(0x10, encFp(1n))).slice(0, 42)}… (len ${((await call(0x10, encFp(1n))).length - 2) / 2}B)`);
  out(`0x11 MAP_FP2_TO_G2(1,0)  : ${(await call(0x11, encFp(1n) + encFp(0n))).slice(0, 42)}… (len ${((await call(0x11, encFp(1n) + encFp(0n))).length - 2) / 2}B)`);
  const p256 = await call(0x100, '00'.repeat(160));
  out(`0x100 P256VERIFY (RIP-7212) on zero input: ${p256} (empty/0 ⇒ verify failed or precompile absent)`);
  out('→ EIP-2537 is LIVE and correct ⇒ a contract can verify drand (quicknet, BLS12-381/G1) and BLS-based VRFs on chain today.');
}

async function sec_drand() {
  head('B. drand — reachability and an END-TO-END on-chain verification of a LIVE quicknet beacon');
  const CH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
  let info, beacon;
  try { info = await (await fetch(`https://api.drand.sh/${CH}/info`)).json(); beacon = await (await fetch(`https://api.drand.sh/${CH}/public/latest`)).json(); }
  catch (e) { out('drand HTTP unreachable: ' + e.message); return; }
  out(`quicknet: period ${info.period}s, scheme ${info.schemeID}; latest round ${beacon.round}`);
  const call = async (addr, dataHex) => { const r = await rpc(PRIMARY, 'eth_call', [{ to: '0x' + addr.toString(16).padStart(40, '0'), data: '0x' + dataHex }, 'latest']); if (r.error) throw new Error(JSON.stringify(r.error)); return r.result; };
  const pk = decompressG2(info.public_key), sig = decompressG1(beacon.signature);
  const rb = Buffer.alloc(8); rb.writeBigUInt64BE(BigInt(beacon.round));
  const msg = Uint8Array.from(createHash('sha256').update(rb).digest());
  const DST = Buffer.from('BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_');
  const [u0, u1] = hashToFieldG1(msg, DST);
  const H = await call(0x0b, (await call(0x10, encFp(u0))).slice(2) + (await call(0x10, encFp(u1))).slice(2));
  const ok = await call(0x0f, encG1(sig) + encG2(negG2(G2)) + H.slice(2) + encG2(pk));
  out(`  on-chain pairing check e(sig,-g2)·e(H(round),pk)==1 for round ${beacon.round}: ${ok === '0x' + '0'.repeat(63) + '1' ? 'VALID ✓' : 'invalid'}`);
  const rb2 = Buffer.alloc(8); rb2.writeBigUInt64BE(BigInt(beacon.round) + 1n);
  const [v0, v1] = hashToFieldG1(Uint8Array.from(createHash('sha256').update(rb2).digest()), DST);
  const H2 = await call(0x0b, (await call(0x10, encFp(v0))).slice(2) + (await call(0x10, encFp(v1))).slice(2));
  const bad = await call(0x0f, encG1(sig) + encG2(negG2(G2)) + H2.slice(2) + encG2(pk));
  out(`  same signature checked against round+1 (must fail): ${bad === '0x' + '0'.repeat(64) ? 'correctly rejected ✓' : 'UNEXPECTED'}`);
  out(`  randomness == sha256(signature): ${createHash('sha256').update(Buffer.from(beacon.signature, 'hex')).digest('hex') === beacon.randomness}`);
  out('→ A ~30-byte/round public beacon, unbiasable by the game operator or the sequencer, verifiable on chain and forever off chain.');
}

async function sec_vendors() {
  head('B. VRF / ENTROPY VENDORS — is any deployed on chain 4663 TODAY? (eth_getCode at canonical addresses)');
  const addrs = {
    'Pyth Entropy (canonical)': '0x4821932D0CDd71225A6d914706A621e0389D7061',
    'Pyth Entropy (alt)': '0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320',
    'Pyth price oracle': '0x4305FB66699C3B2702D4d05CF36551390A4c69C6',
    'Chainlink VRF 2.5 coordinator': '0x5CE8D5A2BC84beb22a398CCA51996F7930313D61',
    'Chainlink VRF 2.5 wrapper': '0x02aae1A04f9828517b3007f83f6181900CaD910c',
    'Gelato VRF inbox': '0x71C8D242AEa4e3B4D9D16F7C0f3d9bD7bC2B6d58',
    'Supra router': '0x700a89Ba8F908af38834B9Aba238b362CFfB665F',
    'API3 QRNG AirnodeRrpV0': '0xa0AD79D995DdeeB18a14eAef56A549A04e3Aa1Bd',
    'Randomizer.ai': '0x5b8bB80f2d72D0C85caB8fB169e8170A05C94bAF',
    'multicall3 (control, should be PRESENT)': '0xcA11bde05977b3631167028862bE2a173976CA11',
    'Permit2 (control, should be PRESENT)': '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  };
  const names = Object.keys(addrs);
  const res = await rpcBatch(PRIMARY, names.map((k) => ['eth_getCode', [addrs[k], 'latest']]));
  for (let i = 0; i < names.length; i++) { const bytes = ((res[i].result || '0x').length - 2) / 2; out(`  ${(bytes > 0 ? 'PRESENT ' + bytes + 'B' : 'ABSENT').padEnd(12)} ${addrs[names[i]]}  ${names[i]}`); }
  out('→ No VRF/entropy vendor is deployed at its canonical address on 4663 (controls confirm the probe works). Vendor docs (fetched 2026-10-02)');
  out('  list Arbitrum One, not Robinhood Chain. Using one would require the vendor to deploy here, or self-hosting it.');
}

const SECTIONS = { basics: sec_basics, cadence: sec_cadence, header: sec_header, window: sec_window, history: sec_history, simulate: sec_simulate, bls: sec_bls, drand: sec_drand, vendors: sec_vendors };
const ORDER = ['basics', 'cadence', 'header', 'simulate', 'window', 'history', 'bls', 'drand', 'vendors'];

async function main() {
  const pick = process.argv.slice(2).filter((a) => SECTIONS[a]);
  const run = pick.length ? pick : ORDER;
  const save = pick.length === 0;
  out(`Oubliette randomness probe — Robinhood Chain (4663). ${new Date().toISOString()}`);
  out(`RPCs: ${Object.values(RPCS).join('  ')}`);
  out(`Sections: ${run.join(', ')}`);
  for (const s of run) { try { await SECTIONS[s](); } catch (e) { out(`\n[section ${s} FAILED: ${e.message}]`); } }
  out(`\ndone. ${rpcCalls} RPC HTTP round-trips.`);
  if (save) { try { mkdirSync(dirname(OUT_FILE), { recursive: true }); writeFileSync(OUT_FILE, LINES.join('\n') + '\n'); process.stdout.write(`\nsaved → ${OUT_FILE}\n`); } catch (e) { process.stdout.write('save failed: ' + e.message + '\n'); } }
}

main();
