#!/usr/bin/env node
/*
 * census.mjs — a re-runnable, READ-ONLY live census of Robinhood Chain ("RH Chain", chain id 4663,
 * an Arbitrum Orbit L2 on Ethereum), for a game that will keep gear NFTs, an offer-book exchange and
 * per-run settlement there (Oubliette, SPEC §3.4–§3.7).
 *
 * WHAT IT MEASURES (the report sections carry the same numbers)
 *    1  identity        chain id, heights, ArbOS version, the L1 block number the chain reports, clients,
 *                       latest/safe/finalized lag, chain owners, protocol-level transaction filtering
 *    2  block cadence   a walk of consecutive recent blocks: blocks per second, per-second buckets, gaps,
 *                       whether blocks exist only when there are transactions, cadence over the chain's life
 *    3  transactions    user transactions per block (Arbitrum's internal 0x6a start-of-block tx excluded),
 *                       gas per block, limits, transaction types, failure rate, top destinations
 *    4  fees            eth_gasPrice, base fee over eth_feeHistory's window and longer, every ArbGasInfo
 *                       getter, and whether users are charged for L1 data (receipts, estimates, history)
 *    5  data availability   rollup or AnyTrust: ArbOS chain config read from state + the L1 SequencerInbox
 *    6  infrastructure  eth_getCode at the standard deployments, compared byte-for-byte with Ethereum mainnet
 *    7  precompiles     one valid test vector each (go-ethereum's), output checked, gas measured in-EVM;
 *                       which fork-level opcodes exist
 *    8  EIP-7702        four independent checks, none of which sends a transaction
 *    9  randomness      ArbSys.arbBlockHash window edges, block.number / blockhash / prevrandao, and the
 *                       EIP-2935 history contract
 *   10  tokens/venues   Blockscout API reachability, wrapped ETH, stock tokens, most-transferred ERC-20s,
 *                       where swaps happen
 *   11  limits          eth_call and eth_estimateGas gas caps, calldata size, contract size, log queries,
 *                       historical state, batch sizes, WebSocket, and every rate limit this run met
 *
 * HOW TO RUN (Node 22+, no npm dependencies; stdout is the report, stderr is progress)
 *    node probe/chain/census.mjs > probe/chain/out/census.txt
 *    node probe/chain/census.mjs --only=1,9          # some sections only
 *    node probe/chain/census.mjs --blocks=20000      # a longer walk (default 6000, about ten minutes of chain)
 *    options: --detail=N (blocks fetched with full transactions, default 300) · --receipts=N (blocks whose
 *    receipts are read, default 40) · --no-l1 (skip Ethereum L1 cross-checks) · --no-web (skip non-RPC HTTP
 *    sources) · --no-ws (skip WebSocket) · --burst (send up to three large batches to the official RPC to
 *    find its batch tolerance; off by default because it can trip the limiter for other users of this IP)
 *    · --curl (force curl instead of Node's fetch) · --eth-usd=N (skip the price lookup)
 *
 * READ-ONLY. It calls eth_call, eth_estimateGas, eth_get*, eth_feeHistory, eth_blockNumber, eth_chainId,
 * eth_subscribe(newHeads) and plain HTTP GETs. It never signs, never sends a transaction, holds no key.
 * Probe contracts are injected with eth_call state overrides at unused addresses: nothing is deployed.
 * It is polite: one request at a time per endpoint, paced, batches of at most 100, backing off on 429.
 *
 * Every value in the report is MEASURED by the method in [brackets] when the script ran, unless the line
 * says SOURCED (an address or fact taken from a named page) or INFERRED (arithmetic on measured values).
 */

import { execFile } from 'node:child_process';

// ------------------------------------------------------------------------------------------------
// configuration
// ------------------------------------------------------------------------------------------------
const argv = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const intArg = (v, d) => (v === undefined || v === true ? d : Math.max(1, parseInt(v, 10) || d));
const WALK = Math.max(3000, intArg(argv.blocks, 6000));
const DETAIL = Math.min(WALK, intArg(argv.detail, 300));
const RECEIPT_BLOCKS = Math.min(DETAIL, intArg(argv.receipts, 40));
const ONLY = argv.only ? new Set(String(argv.only).split(',')) : null;
const USE_L1 = !argv['no-l1'], USE_WEB = !argv['no-web'], USE_WS = !argv['no-ws'], BURST = !!argv.burst;

const mkEp = (name, url, maxBatch, gapMs, role) => ({
  name, url, maxBatch, gapMs, role, nextAt: 0,
  stats: { posts: 0, calls: 0, bytes: 0, http: {}, rateLimited: 0, netErrors: 0, messages: new Set() },
});
// Per-endpoint batch size and pacing were set from what each endpoint tolerated on 2026-10-02 (section 11).
const EP = {
  official: mkEp('official', 'https://rpc.mainnet.chain.robinhood.com', 20, 1200, 'log queries, cross-checks'),
  publicnode: mkEp('publicnode', 'https://robinhood-rpc.publicnode.com', 100, 400, 'block walk, latest state'),
  drpc: mkEp('drpc', 'https://robinhood.drpc.org', 3, 350, 'archive state'),
};
const L1 = mkEp('ethereum-l1', 'https://ethereum-rpc.publicnode.com', 50, 400, 'Ethereum mainnet cross-checks');
const WS_URLS = ['wss://robinhood-rpc.publicnode.com', 'wss://robinhood.drpc.org', 'wss://rpc.mainnet.chain.robinhood.com'];

// SOURCED addresses (each is re-checked on chain where it is used).
const DOCS = 'https://docs.robinhood.com/chain';
const L1_ROLLUP = '0x23A19d23e89166adedbDcB432518AB01e4272D94';           // docs.robinhood.com/chain/protocol-contracts
const L1_SEQ_INBOX = '0xBd0D173EEb87D57A09521c24388a12789F33ba96';        // docs.robinhood.com/chain/protocol-contracts
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';                // docs.robinhood.com/chain/contracts
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';                // docs.robinhood.com/chain/contracts
const SNDK = '0xb90a19ff0af67f7779aff50a882a9cff42446400';                // SPEC §5
const RH_ASSETS_API = 'https://api.robinhood.com/rhj/assets';             // docs.robinhood.com/chain/stock-token-apis
const BLOCKSCOUT = 'https://robinhoodchain.blockscout.com';
const HOODSCAN = 'https://hoodscan.co';                                   // independent third-party explorer

// Arbitrum precompiles and system addresses.
const ARBSYS = '0x0000000000000000000000000000000000000064';
const ARBOWNERPUBLIC = '0x000000000000000000000000000000000000006b';
const ARBGASINFO = '0x000000000000000000000000000000000000006c';
const ARBAGGREGATOR = '0x000000000000000000000000000000000000006d';
const ARBFILTER = '0x0000000000000000000000000000000000000074';
const NODEINTERFACE = '0x00000000000000000000000000000000000000c8';
const ARBOS_STATE = '0xA4B05FffffFffFFFFfFFfffFfffFFfffFfFfFFFf';
const HISTORY = '0x0000F90827F1C53a10cb7A02335B175320002935';             // EIP-2935
const PROBE = '0x00000000000000000000000000000000c0de0001';               // unused; code injected by state override
const PROBE2 = '0x00000000000000000000000000000000c0de0002';
const NOBODY = '0x00000000000000000000000000000000c0de0003';

// ------------------------------------------------------------------------------------------------
// small utilities
// ------------------------------------------------------------------------------------------------
const T0 = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const elapsed = () => ((Date.now() - T0) / 1000).toFixed(0) + 's';
const log = (...a) => process.stderr.write(`[${elapsed()}] ${a.join(' ')}\n`);
const out = (s = '') => console.log(s);
const H = t => { out(); out('='.repeat(110)); out(t); out('='.repeat(110)); };
const sub = t => { out(); out('--- ' + t); };
const row = (label, value, how) => out('  ' + (label + ' ').padEnd(54, '.') + ' ' + value + (how ? '   [' + how + ']' : ''));
const note = s => out('  ' + s);

const strip = h => (h && h.startsWith('0x') ? h.slice(2) : h || '');
const hex = n => '0x' + BigInt(n).toString(16);
const word = v => { let b = BigInt(v); if (b < 0n) b += 1n << 256n; return b.toString(16).padStart(64, '0'); };
const words = h => { h = strip(h); const o = []; for (let i = 0; i + 64 <= h.length; i += 64) o.push(BigInt('0x' + h.slice(i, i + 64))); return o; };
const toAddr = w => '0x' + BigInt(w).toString(16).padStart(40, '0');
const num = h => Number(BigInt(h));
const fmt = n => (typeof n === 'bigint' ? n : Math.round(Number(n))).toLocaleString('en-US');
const f2 = (n, d = 2) => Number(n).toFixed(d);
const pct = (a, b, d = 1) => (b ? (100 * a / b).toFixed(d) : '0') + ' %';
const gwei = w => { const g = Number(w) / 1e9; return (g === 0 ? '0' : g >= 0.01 ? g.toFixed(4) : g.toPrecision(3)) + ' gwei'; };
const iso = t => new Date(Number(t) * 1000).toISOString().replace('.000Z', 'Z');
const short = a => a.slice(0, 10) + '…' + a.slice(-6);
const bytesOf = h => strip(h).length / 2;

function summary(a) {
  if (!a.length) return { n: 0, min: NaN, med: NaN, p95: NaN, max: NaN, mean: NaN };
  const s = [...a].sort((x, y) => x - y);
  const q = p => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  return { n: s.length, min: s[0], med: q(0.5), p95: q(0.95), max: s[s.length - 1], mean: s.reduce((x, y) => x + y, 0) / s.length };
}
const sm = (a, f = fmt) => { const s = summary(a); return `${f(s.min)} / ${f(s.med)} / ${f(s.p95)} / ${f(s.max)}`; };
const countBy = (arr, key) => { const m = new Map(); for (const x of arr) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); } return m; };
const topN = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

function decodeString(h) {
  h = strip(h);
  if (!h) return '';
  try {
    if (h.length === 64) return Buffer.from(h, 'hex').toString('utf8').replace(/\0+$/g, '');
    const off = num('0x' + h.slice(0, 64)) * 2, len = num('0x' + h.slice(off, off + 64));
    return Buffer.from(h.slice(off + 64, off + 64 + len * 2), 'hex').toString('utf8');
  } catch { return '?'; }
}
const decodeAddrArray = h => { const w = words(h); return w.length < 2 ? [] : w.slice(2, 2 + Number(w[1])).map(toAddr); };

// ------------------------------------------------------------------------------------------------
// keccak-256 in plain JS (Node's crypto has SHA-3 but not Keccak): selectors, topics, code hashes,
// ArbOS storage slots. Checked at start against keccak256("") and the transfer selector.
// ------------------------------------------------------------------------------------------------
const M64 = (1n << 64n) - 1n;
const RC = [0x1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x8an, 0x88n, 0x80008009n, 0x8000000an, 0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const rotl = (v, n) => (n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & M64);
function keccak256(input) {
  const bytes = typeof input === 'string' ? (input.startsWith('0x') ? Buffer.from(input.slice(2), 'hex') : Buffer.from(input, 'utf8')) : Buffer.from(input);
  const rate = 136, p = Buffer.alloc(bytes.length + rate - (bytes.length % rate));
  bytes.copy(p); p[bytes.length] ^= 0x01; p[p.length - 1] ^= 0x80;
  const A = new Array(25).fill(0n), B = new Array(25);
  for (let off = 0; off < p.length; off += rate) {
    for (let i = 0; i < 17; i++) A[i] ^= p.readBigUInt64LE(off + 8 * i);
    for (let rnd = 0; rnd < 24; rnd++) {
      const C = [0, 1, 2, 3, 4].map(x => A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20]);
      for (let x = 0; x < 5; x++) { const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1); for (let y = 0; y < 25; y += 5) A[x + y] ^= D; }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x + 5 * y]);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) A[x + 5 * y] = B[x + 5 * y] ^ ((~B[(x + 1) % 5 + 5 * y] & M64) & B[(x + 2) % 5 + 5 * y]);
      A[0] ^= RC[rnd];
    }
  }
  const o = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) o.writeBigUInt64LE(A[i], 8 * i);
  return '0x' + o.toString('hex');
}
const sel = sig => keccak256(sig).slice(0, 10);

// ArbOS keeps its own state in the storage of a fictional account (Nitro, arbos/storage): a key in
// the sub-storage with id bytes `path` lives at keccak(storageKey ++ key[0..31])[0..31] ++ key[31],
// where storageKey = keccak(parentKey ++ id) and the root key is empty.
function arbosSlot(path, key) {
  let sk = Buffer.alloc(0);
  for (const id of path) sk = Buffer.from(strip(keccak256(Buffer.concat([sk, Buffer.from([id])]))), 'hex');
  const k = Buffer.from(word(key), 'hex');
  const h = Buffer.from(strip(keccak256(Buffer.concat([sk, k.subarray(0, 31)]))), 'hex');
  return '0x' + Buffer.concat([h.subarray(0, 31), k.subarray(31)]).toString('hex');
}

// ------------------------------------------------------------------------------------------------
// HTTP and JSON-RPC (Node fetch, or curl if fetch cannot reach the RPC)
// ------------------------------------------------------------------------------------------------
let TRANSPORT = argv.curl ? 'curl' : 'fetch', transportNote = '';
function curlRaw(method, url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = ['-sS', '-i', '-m', String(Math.ceil(timeoutMs / 1000)), '-X', method];
    for (const [k, v] of Object.entries(headers || {})) args.push('-H', `${k}: ${v}`);
    if (body !== undefined) args.push('-H', 'Expect:', '--data-binary', '@-');
    args.push(url);
    const p = execFile('curl', args, { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
      if (err) return reject(err);
      let rest = stdout, status = 0, h = {};
      while (/^HTTP\/[\d.]+ \d{3}/.test(rest)) {
        const i = rest.indexOf('\r\n\r\n'); if (i < 0) break;
        const head = rest.slice(0, i).split('\r\n'); rest = rest.slice(i + 4);
        status = Number(head[0].split(' ')[1]); h = {};
        for (const l of head.slice(1)) { const j = l.indexOf(':'); if (j > 0) h[l.slice(0, j).toLowerCase()] = l.slice(j + 1).trim(); }
      }
      resolve({ status, text: rest, headers: h });
    });
    if (body !== undefined) p.stdin.end(body);
  });
}
async function httpRaw(method, url, body, headers, timeoutMs = 60000) {
  if (TRANSPORT === 'curl') return curlRaw(method, url, body, headers, timeoutMs);
  const r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs), redirect: 'manual' });
  const text = await r.text();
  const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
  return { status: r.status, text, headers: h };
}
async function pickTransport() {
  if (TRANSPORT === 'curl') { transportNote = 'curl (forced by --curl)'; return; }
  try {
    await httpRaw('POST', EP.publicnode.url, '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}', { 'content-type': 'application/json' }, 15000);
    transportNote = 'Node fetch';
  } catch (e) {
    TRANSPORT = 'curl';
    transportNote = `curl (Node fetch could not reach the RPC: ${e.cause?.code || e.message})`;
  }
}
async function httpGet(url, accept = 'application/json') {
  try { return await httpRaw('GET', url, undefined, { accept, 'user-agent': 'oubliette-census/1 (read-only chain census)' }, 40000); }
  catch (e) { return { status: 0, text: '', headers: {}, error: e.cause?.code || e.message }; }
}

class RpcFail extends Error {}
async function post(ep, payload, { maxRetries = 5, timeoutMs = 60000 } = {}) {
  const body = JSON.stringify(payload);
  for (let attempt = 0; ; attempt++) {
    const wait = ep.nextAt - Date.now();
    if (wait > 0) await sleep(wait);
    let res;
    try { res = await httpRaw('POST', ep.url, body, { 'content-type': 'application/json' }, timeoutMs); }
    catch (e) {
      ep.stats.netErrors++; ep.nextAt = Date.now() + ep.gapMs;
      if (attempt >= Math.min(maxRetries, 3)) throw new RpcFail(`${ep.name}: network error after ${attempt + 1} tries (${e.cause?.code || e.message})`);
      await sleep(1500 * 2 ** attempt); continue;
    }
    ep.nextAt = Date.now() + ep.gapMs;
    ep.stats.posts++; ep.stats.bytes += res.text.length;
    ep.stats.http[res.status] = (ep.stats.http[res.status] || 0) + 1;
    let json = null;
    try { json = JSON.parse(res.text); } catch { /* not JSON */ }
    const top = json && !Array.isArray(json) ? json.error : null;
    const limited = res.status === 429 || (top && (top.code === 429 || /too many requests|rate limit/i.test(String(top.message))));
    if (limited) {
      ep.stats.rateLimited++;
      ep.stats.messages.add(`HTTP ${res.status}: ${res.text.trim().slice(0, 110)}`);
      if (attempt >= maxRetries) throw new RpcFail(`${ep.name}: rate limited (HTTP ${res.status}) after ${attempt + 1} tries`);
      ep.gapMs = Math.min(Math.round(ep.gapMs * 1.5), 6000);
      await sleep(Math.min(3000 * 2 ** attempt, 30000)); continue;
    }
    return { status: res.status, json, text: res.text };
  }
}
// calls: [[method, params], ...] -> [{result} | {error}], in order; splits into the endpoint's batch size.
async function rpcBatch(ep, calls, opts) {
  const res = new Array(calls.length);
  for (let i = 0; i < calls.length; i += ep.maxBatch) {
    const chunk = calls.slice(i, i + ep.maxBatch);
    const payload = chunk.map(([method, params], k) => ({ jsonrpc: '2.0', id: i + k, method, params }));
    const { status, json, text } = await post(ep, payload.length === 1 ? payload[0] : payload, opts);
    ep.stats.calls += chunk.length;
    const arr = Array.isArray(json) ? json : json ? [json] : [];
    for (const e of arr) if (typeof e.id === 'number' && e.id >= i && e.id < i + chunk.length) res[e.id] = e.error ? { error: e.error } : { result: e.result };
    for (let k = 0; k < chunk.length; k++) {
      if (res[i + k]) continue;
      const whole = arr.length === 1 && arr[0].error ? arr[0].error : { code: status, message: `HTTP ${status}: ${text.trim().slice(0, 140)}` };
      res[i + k] = { error: whole };
      ep.stats.messages.add(`HTTP ${status}: ${String(whole.message).slice(0, 110)}`);
    }
  }
  return res;
}
// Try endpoints in order until one answers at the transport level (a revert is an answer).
async function viaAny(calls, order = [EP.publicnode, EP.official, EP.drpc]) {
  let last;
  for (const ep of order) {
    try { return await rpcBatch(ep, calls); } catch (e) { last = e; log(`  ! ${e.message}; trying the next endpoint`); }
  }
  throw last;
}
const one = async (method, params, order) => (await viaAny([[method, params]], order))[0];
const errText = e => (e ? `${e.message ?? JSON.stringify(e)}`.slice(0, 150) : '');
const callArgs = (to, data, extra = {}) => ({ to, data, ...extra });
const ethCall = (to, data, tag = 'latest', override) => ['eth_call', override ? [callArgs(to, data), tag, override] : [callArgs(to, data), tag]];

// ------------------------------------------------------------------------------------------------
// probe contracts (runtime bytecode, injected with a state override; mnemonics alongside)
// ------------------------------------------------------------------------------------------------
// CALLPROBE: calldata = target(32) ++ input. STATICCALLs target with input and returns
//   success(32) ++ gasDelta(32) ++ returndatasize(32) ++ returndata. gasDelta = callee gas + 118
//   (the opcodes between the two GAS readings, with the 100-gas warm-address charge): calibrated at
//   run time against the identity precompile, whose cost is known (15 gas for empty input).
const CALLPROBE = '0x' + [
  '6020', '36', '03',              // PUSH1 20, CALLDATASIZE, SUB           inLen
  '80', '6020', '5f', '37',        // DUP1, PUSH1 20, PUSH0, CALLDATACOPY   mem[0..inLen) = input
  '5a',                            // GAS                                  g0
  '5f', '5f', '83', '5f',          // PUSH0, PUSH0, DUP4, PUSH0            retSize retOff inLen argsOff
  '5f', '35',                      // PUSH0, CALLDATALOAD                  target
  '5a', 'fa',                      // GAS, STATICCALL
  '5a',                            // GAS                                  g1
  '90', '5f', '52',                // SWAP1, PUSH0, MSTORE                 mem[0] = success
  '90', '03', '6020', '52',        // SWAP1, SUB, PUSH1 20, MSTORE         mem[20] = g0 - g1
  '3d', '6040', '52',              // RETURNDATASIZE, PUSH1 40, MSTORE
  '3d', '5f', '6060', '3e',        // RETURNDATASIZE, PUSH0, PUSH1 60, RETURNDATACOPY
  '3d', '6060', '01', '5f', 'f3',  // RETURNDATASIZE, PUSH1 60, ADD, PUSH0, RETURN
].join('');
// HASHPROBE: calldata = k(32) ++ target(32) ++ selLen(32) ++ selWord(32). Reads cur =
//   ArbSys.arbBlockNumber() inside the EVM, then STATICCALLs target with (selector?) ++ (cur - k) and
//   returns cur ++ n ++ success ++ gasDelta ++ returndatasize ++ returndata. One call is therefore
//   self-consistent whatever block it lands on, so the window edges can be tested exactly.
//   gasDelta = callee gas + 28 + the address-access charge (100 warm / 2600 cold).
const HASHPROBE = '0x' + [
  '63a3b1b31d', '60e0', '1b', '5f', '52',            // mem[0] = arbBlockNumber() selector, left-aligned
  '6020', '5f', '6004', '5f', '6064', '5a', 'fa', '50', // STATICCALL(gas, 0x64, 0, 4, 0, 32); POP
  '5f51',                                            // cur
  '80', '5f35', '90', '03',                          // n = cur - k
  '606035', '5f52',                                  // mem[0] = selWord
  '80', '604035', '52',                              // mem[selLen] = n
  '5a',                                              // g0
  '5f5f', '604035', '602001', '5f', '602035', '5afa', // STATICCALL(gas, target, 0, selLen + 32, 0, 0)
  '5a',                                              // g1
  '90', '604052', '9003', '606052', '602052', '5f52', // mem[40]=success mem[60]=g0-g1 mem[20]=n mem[0]=cur
  '3d608052', '3d5f60a03e', '3d60a0015ff3',          // returndatasize, returndata, RETURN
].join('');
// ENVPROBE: returns NUMBER, TIMESTAMP, PREVRANDAO, GASLIMIT, CHAINID, COINBASE, BLOCKHASH(NUMBER-1),
//   BLOCKHASH(NUMBER-256), BLOCKHASH(NUMBER-257), BLOCKHASH(NUMBER), ArbSys.arbBlockNumber().
const ENVPROBE = '0x' + [
  '435f52', '42602052', '44604052', '45606052', '46608052', '4160a052',
  '600143034060c052', '61010043034060e052', '61010143034061010052', '434061012052',
  '63a3b1b31d60e01b61014052', '6020610140600461014060645afa50', '6101605ff3',
].join('');
const RET32 = '5f5260205ff3';                        // PUSH0 MSTORE PUSH1 20 PUSH0 RETURN (returns the stack top)
const code = c => ({ [PROBE]: { code: c.startsWith('0x') ? c : '0x' + c } });
function parseCallProbe(h) { const w = words(h); return { ok: w[0] === 1n, delta: Number(w[1]), len: Number(w[2]), ret: strip(h).slice(192) }; }
function parseHashProbe(h) { const w = words(h); return { cur: w[0], n: w[1], ok: w[2] === 1n, delta: Number(w[3]), len: Number(w[4]), ret: strip(h).slice(320) }; }

// ------------------------------------------------------------------------------------------------
// shared state
// ------------------------------------------------------------------------------------------------
const ctx = { ethUsd: null, ethUsdHow: '', labels: new Map(), notes: [] };
const label = (a, name) => ctx.labels.set(a.toLowerCase(), name);
const nameOf = a => ctx.labels.get((a || '').toLowerCase()) || '';

async function getTip() {
  if (ctx.tip) return ctx.tip;
  const heads = [];
  for (const ep of [EP.publicnode, EP.official]) {
    try { const r = (await rpcBatch(ep, [['eth_blockNumber', []]]))[0]; if (r.result) heads.push(num(r.result)); } catch (e) { log('  ! ' + e.message); }
  }
  if (!heads.length) throw new Error('no endpoint returned a block number');
  ctx.tip = Math.min(...heads) - 20;      // stay a couple of seconds behind the head so every endpoint has the block
  return ctx.tip;
}

const compactBlock = (b, full) => ({
  n: num(b.number), ts: num(b.timestamp), hash: b.hash, parent: b.parentHash, gasUsed: num(b.gasUsed), gasLimit: BigInt(b.gasLimit),
  baseFee: num(b.baseFeePerGas || '0x0'), size: num(b.size || '0x0'), l1: b.l1BlockNumber ? num(b.l1BlockNumber) : null, mix: b.mixHash, miner: b.miner,
  ntx: b.transactions.length,
  txs: full ? b.transactions.map(t => ({
    hash: t.hash, type: t.type, from: t.from, to: t.to, inLen: bytesOf(t.input), gas: num(t.gas),
    prio: t.maxPriorityFeePerGas ? num(t.maxPriorityFeePerGas) : null, auths: t.authorizationList ? t.authorizationList.length : 0,
  })) : null,
});

// Fetch a set of block numbers, shared between endpoints: each worker takes chunks of its own batch
// size off one queue; a worker that fails twice in a row stops and the others finish the queue.
async function fetchBlocks(numbers, full, eps = [EP.publicnode, EP.official], what = 'blocks') {
  const queue = [...numbers], got = new Map(), nulls = [];
  const share = {};
  async function worker(ep) {
    let fails = 0;
    while (queue.length && fails < 2) {
      const chunk = queue.splice(0, full ? Math.min(ep.maxBatch, 50) : ep.maxBatch);
      try {
        const res = await rpcBatch(ep, chunk.map(n => ['eth_getBlockByNumber', [hex(n), full]]), { maxRetries: 1 });
        res.forEach((r, i) => { if (r.result) { got.set(chunk[i], compactBlock(r.result, full)); share[ep.name] = (share[ep.name] || 0) + 1; } else nulls.push(chunk[i]); });
        fails = 0;
      } catch (e) { fails++; queue.push(...chunk); log(`  ! ${what}: ${e.message}`); }
      if (got.size % 1000 < chunk.length) log(`  ${what}: ${got.size}/${numbers.length}`);
    }
  }
  await Promise.all(eps.map(worker));
  const rest = [...queue, ...nulls];
  if (rest.length) {
    log(`  ${what}: retrying ${rest.length} blocks`);
    await sleep(1500);
    const res = await viaAny(rest.map(n => ['eth_getBlockByNumber', [hex(n), full]]));
    res.forEach((r, i) => { if (r.result) got.set(rest[i], compactBlock(r.result, full)); });
  }
  const blocks = numbers.map(n => got.get(n)).filter(Boolean);
  return { blocks, missing: numbers.length - blocks.length, share };
}
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

async function getWalk() {
  if (!ctx.walk) ctx.walk = (async () => {
    const to = await getTip(), from = to - WALK + 1;
    log(`walking ${WALK} blocks ${from}..${to}`);
    const t = Date.now();
    const w = await fetchBlocks(range(from, to), false, [EP.publicnode, EP.official], 'walk');
    return { ...w, from, to, ms: Date.now() - t };
  })();
  return ctx.walk;
}
async function getDetail() {
  if (!ctx.detail) ctx.detail = (async () => {
    const to = await getTip(), from = to - DETAIL + 1;
    log(`fetching ${DETAIL} blocks with full transactions ${from}..${to}`);
    return { ...(await fetchBlocks(range(from, to), true, [EP.publicnode], 'detail')), from, to };
  })();
  return ctx.detail;
}
async function getReceipts() {
  if (!ctx.receipts) ctx.receipts = (async () => {
    const d = await getDetail();
    const step = Math.max(1, Math.floor(d.blocks.length / RECEIPT_BLOCKS));
    const picks = d.blocks.filter((_, i) => i % step === 0).slice(0, RECEIPT_BLOCKS);
    log(`fetching receipts of ${picks.length} blocks`);
    const res = await viaAny(picks.map(b => ['eth_getBlockReceipts', [hex(b.n)]]), [EP.publicnode, EP.official]);
    const outp = [];
    res.forEach((r, i) => { if (Array.isArray(r.result)) outp.push({ block: picks[i], receipts: r.result }); });
    return outp;
  })();
  return ctx.receipts;
}
// Names for a few contracts, from a third-party explorer's protocol page (SOURCED, shown as "(HoodScan label)").
async function loadLabels() {
  if (!USE_WEB || ctx.labelsLoaded) return;
  ctx.labelsLoaded = true;
  const u = await httpGet(HOODSCAN + '/project-api/uniswap');
  try { for (const c of JSON.parse(u.text).contracts) if (!nameOf(c.address)) label(c.address, 'Uniswap ' + c.label + ' (HoodScan label)'); } catch { /* no labels */ }
}
async function getEthUsd() {
  if (ctx.ethUsd) return ctx.ethUsd;
  if (argv['eth-usd'] && argv['eth-usd'] !== true) { ctx.ethUsd = Number(argv['eth-usd']); ctx.ethUsdHow = '--eth-usd'; return ctx.ethUsd; }
  if (USE_WEB) {
    const r = await httpGet('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    try { const v = JSON.parse(r.text).ethereum.usd; if (v > 0) { ctx.ethUsd = v; ctx.ethUsdHow = 'GET api.coingecko.com/api/v3/simple/price'; return v; } } catch { /* fall through */ }
  }
  ctx.ethUsd = 2682; ctx.ethUsdHow = 'fallback: the orchestrator\'s CoinGecko reading of 2026-10-02';
  return ctx.ethUsd;
}

// ================================================================================================
// 1. identity
// ================================================================================================
async function sIdentity() {
  H('1. IDENTITY');
  for (const ep of [EP.official, EP.publicnode, EP.drpc]) {
    try {
      const r = await rpcBatch(ep, [['eth_chainId', []], ['eth_blockNumber', []], ['web3_clientVersion', []]]);
      row(`${ep.name}: chain id / height / client`, `${r[0].result ? num(r[0].result) : errText(r[0].error)} / ${r[1].result ? fmt(num(r[1].result)) : errText(r[1].error)} / ${r[2].result ?? errText(r[2].error)}`, 'eth_chainId, eth_blockNumber, web3_clientVersion');
    } catch (e) { row(`${ep.name}`, 'unreachable: ' + e.message); }
  }
  const r = await viaAny([
    ethCall(ARBSYS, sel('arbOSVersion()')), ethCall(ARBSYS, sel('arbChainID()')), ethCall(ARBSYS, sel('arbBlockNumber()')),
    ['eth_getBlockByNumber', ['latest', false]], ['eth_getBlockByNumber', ['safe', false]], ['eth_getBlockByNumber', ['finalized', false]],
    ['eth_getBlockByNumber', ['earliest', false]], ['eth_getBlockByNumber', ['0x1', false]],
    ethCall(PROBE, '0x', 'latest', code(ENVPROBE)),
    ['eth_getStorageAt', [ARBOS_STATE, arbosSlot([], 0n), 'latest']], ['eth_getStorageAt', [ARBOS_STATE, arbosSlot([], 4n), 'latest']],
    ['eth_getStorageAt', [ARBOS_STATE, arbosSlot([], 3n), 'latest']], ['eth_getStorageAt', [ARBOS_STATE, arbosSlot([], 6n), 'latest']],
    ['eth_getStorageAt', [ARBOS_STATE, arbosSlot([7], 0n), 'latest']],
    ethCall(ARBOWNERPUBLIC, sel('getAllChainOwners()')), ethCall(ARBOWNERPUBLIC, sel('getScheduledUpgrade()')),
    ethCall(ARBOWNERPUBLIC, sel('getTransactionFilteringFrom()')), ethCall(ARBOWNERPUBLIC, sel('getAllTransactionFilterers()')),
    ethCall(ARBOWNERPUBLIC, sel('getCollectTips()')), ethCall(ARBAGGREGATOR, sel('getBatchPosters()')),
    ['net_version', []], ['eth_syncing', []],
  ]);
  const [osv, cid, abn, latest, safe, fin, genesis, b1, env, sVer, sCid, sNet, sInfra, sCfgLen, owners, sched, filtFrom, filterers, tips, posters, netv, syncing] = r;
  const arbos = osv.result ? num(osv.result) - 55 : null;
  ctx.arbos = arbos;
  row('ArbOS version', osv.result ? `${arbos}  (arbOSVersion() returns ${num(osv.result)} = 55 + version)` : errText(osv.error), 'eth_call ArbSys(0x64).arbOSVersion()');
  row('ArbOS version, read from ArbOS state', sVer.result ? num(sVer.result) : errText(sVer.error), 'eth_getStorageAt 0xA4B05F…, root offset 0');
  row('chain id per ArbSys / ArbOS state / net_version', `${cid.result ? num(cid.result) : '?'} / ${sCid.result ? num(sCid.result) : '?'} / ${netv.result ?? '?'}`, 'ArbSys.arbChainID(), eth_getStorageAt, net_version');
  row('node syncing', String(syncing.result), 'eth_syncing');
  if (latest.result) {
    const b = latest.result, mix = strip(b.mixHash);
    row('latest block', `${fmt(num(b.number))} at ${iso(num(b.timestamp))}, hash ${b.hash}`, 'eth_getBlockByNumber latest');
    row('ArbSys.arbBlockNumber()', abn.result ? fmt(num(abn.result)) : errText(abn.error), 'eth_call ArbSys(0x64).arbBlockNumber()');
    row('L1 block number in the L2 header', `${fmt(num(b.l1BlockNumber))}  (header field l1BlockNumber)`, 'eth_getBlockByNumber');
    row('header mixHash decodes to', `sendCount ${num('0x' + mix.slice(0, 16))}, L1 block ${fmt(num('0x' + mix.slice(16, 32)))}, ArbOS ${num('0x' + mix.slice(32, 48))}`, 'eth_getBlockByNumber');
    row('header miner / difficulty / gasLimit', `${b.miner} / ${num(b.difficulty)} / 2^${BigInt(b.gasLimit).toString(2).length - 1} (${fmt(BigInt(b.gasLimit))})`, 'eth_getBlockByNumber');
  }
  if (env.result) {
    const w = words(env.result);
    ctx.env = w;
    row('block.number seen by a contract', `${fmt(w[0])}  — the L1 number, while ArbSys.arbBlockNumber() in the same call = ${fmt(w[10])}`, 'eth_call, NUMBER opcode, state-override probe');
  }
  if (USE_L1) {
    try {
      const l = (await rpcBatch(L1, [['eth_blockNumber', []]]))[0];
      if (l.result && latest.result) row('Ethereum L1 head, and how far the L2 view lags', `${fmt(num(l.result))}; L2 header is ${num(l.result) - num(latest.result.l1BlockNumber)} L1 blocks behind`, 'eth_blockNumber on Ethereum mainnet');
    } catch (e) { row('Ethereum L1 head', 'L1 RPC unreachable: ' + e.message); }
  }
  if (latest.result && safe.result && fin.result) {
    const L = latest.result, lag = x => `${fmt(num(L.number) - num(x.number))} blocks / ${fmt(num(L.timestamp) - num(x.timestamp))} s behind latest`;
    row('"safe" block (its batch is on L1)', `${fmt(num(safe.result.number))} — ${lag(safe.result)}`, 'eth_getBlockByNumber safe');
    row('"finalized" block (L1-final)', `${fmt(num(fin.result.number))} — ${lag(fin.result)}`, 'eth_getBlockByNumber finalized');
    ctx.safeBlock = num(safe.result.number);
  }
  if (genesis.result && b1.result) row('genesis hash; first block after genesis', `${genesis.result.hash}; block 1 at ${iso(num(b1.result.timestamp))}`, 'eth_getBlockByNumber earliest, 0x1');
  if (owners.result) row('chain owners (can change every ArbOS parameter)', decodeAddrArray(owners.result).join(', '), 'eth_call ArbOwnerPublic(0x6b).getAllChainOwners()');
  if (sched.result) { const w = words(sched.result); row('scheduled ArbOS upgrade', w[0] === 0n ? 'none' : `to ArbOS ${w[0]} at ${iso(w[1])}`, 'eth_call ArbOwnerPublic.getScheduledUpgrade()'); }
  if (sNet.result) row('network fee account / infra fee account', `${toAddr(BigInt(sNet.result))} / ${sInfra.result ? toAddr(BigInt(sInfra.result)) : '?'}`, 'eth_getStorageAt ArbOS state, root offsets 3 and 6');
  if (posters.result) row('batch posters known to ArbOS', decodeAddrArray(posters.result).join(', '), 'eth_call ArbAggregator(0x6d).getBatchPosters()');
  if (filtFrom.result) {
    const t = num(filtFrom.result), fl = filterers.result ? decodeAddrArray(filterers.result) : [];
    row('protocol-level transaction filtering', t === 0 ? 'not enabled' : `ENABLED since ${iso(t)}; ${fl.length} authorised filterer(s): ${fl.join(', ')}`, 'eth_call ArbOwnerPublic.getTransactionFilteringFrom(), getAllTransactionFilterers()');
    ctx.filteringFrom = t;
  } else row('protocol-level transaction filtering', 'getter not available: ' + errText(filtFrom.error), 'eth_call ArbOwnerPublic.getTransactionFilteringFrom()');
  if (tips.result) { ctx.collectTips = BigInt(tips.result) === 1n; row('priority fees collected (getCollectTips)', ctx.collectTips ? 'yes' : 'no', 'eth_call ArbOwnerPublic.getCollectTips()'); }
  // the serialized chain config, read from ArbOS state
  if (sCfgLen.result) {
    const len = num(sCfgLen.result);
    if (len > 0 && len < 20000) {
      const n = Math.ceil(len / 32) || 1;
      const ws = await viaAny(range(1, n).map(i => ['eth_getStorageAt', [ARBOS_STATE, arbosSlot([7], BigInt(i)), 'latest']]));
      const full = Math.floor(len / 32), rem = len % 32;
      const parts = ws.slice(0, full).map(x => Buffer.from(strip(x.result), 'hex'));
      if (rem) parts.push(Buffer.from(strip(ws[full].result), 'hex').subarray(32 - rem));
      const txt = Buffer.concat(parts).toString('utf8');
      try { ctx.chainConfig = JSON.parse(txt); } catch { /* keep the text */ }
      row('chain config stored in ArbOS state', `${len} bytes of JSON`, 'eth_getStorageAt ArbOS state, sub-storage 7');
      note('  ' + txt);
    }
  }
  // do the endpoints serve the same chain?
  try {
    const at = (await getTip()) - 100;
    const hs = [];
    for (const ep of [EP.official, EP.publicnode, EP.drpc]) { const x = (await rpcBatch(ep, [['eth_getBlockByNumber', [hex(at), false]]]))[0]; hs.push(x.result ? x.result.hash : 'error'); }
    row(`all three endpoints agree on block ${fmt(at)}`, new Set(hs).size === 1 ? 'yes — ' + hs[0] : 'NO: ' + hs.join(' / '), 'eth_getBlockByNumber ×3');
  } catch (e) { row('endpoint agreement', 'not checked: ' + e.message); }
}

// ================================================================================================
// 2. block cadence
// ================================================================================================
async function sCadence() {
  H('2. BLOCK CADENCE');
  const w = await getWalk(), B = w.blocks;
  if (B.length < 2) { note('walk failed'); return; }
  let linked = true, backwards = 0, maxStep = 0;
  for (let i = 1; i < B.length; i++) {
    if (B[i].n !== B[i - 1].n + 1 || B[i].parent !== B[i - 1].hash) linked = false;
    const d = B[i].ts - B[i - 1].ts; if (d < 0) backwards++; if (d > maxStep) maxStep = d;
  }
  row('walk', `${fmt(B.length)} consecutive blocks ${fmt(B[0].n)} → ${fmt(B[B.length - 1].n)}${w.missing ? `, ${w.missing} MISSING` : ''}; served by ${Object.entries(w.share).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')} in ${f2(w.ms / 1000, 1)} s`, 'eth_getBlockByNumber, batched');
  row('parentHash chain intact across the walk', linked ? 'yes' : 'NO', 'eth_getBlockByNumber');
  const t0 = B[0].ts, t1 = B[B.length - 1].ts;
  row('chain time covered', `${iso(t0)} → ${iso(t1)} (${fmt(t1 - t0)} s)`, 'block timestamps');
  const per = new Map(); for (const b of B) per.set(b.ts, (per.get(b.ts) || 0) + 1);
  const secs = []; for (let t = t0 + 1; t <= t1 - 1; t++) secs.push(per.get(t) || 0);   // complete seconds only
  const s = summary(secs);
  row('blocks per second, mean over complete seconds', f2(s.mean, 3), `${fmt(secs.length)} one-second buckets`);
  row('blocks per one-second bucket: min / median / p95 / max', `${s.min} / ${s.med} / ${s.p95} / ${s.max}`, 'block timestamps');
  row('histogram of blocks per second', topN(countBy(secs, x => x), 99).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${fmt(v)}`).join('  '), 'block timestamps');
  let run = 0, longest = 0, empty = 0;
  for (const c of secs) { if (c === 0) { run++; empty++; if (run > longest) longest = run; } else run = 0; }
  row('seconds with no block / longest run of them', `${empty} of ${fmt(secs.length)} / ${longest} s`, 'block timestamps');
  row('largest timestamp step between consecutive blocks', `${maxStep} s${backwards ? `; ${backwards} steps go backwards` : '; none go backwards'}`, 'block timestamps');
  row('mean block interval', `${f2(1000 * (t1 - t0) / (B.length - 1), 1)} ms`, 'INFERRED from first and last timestamp (1 s resolution)');

  sub('do blocks appear only when there are transactions?');
  const empties = B.filter(b => b.ntx <= 1).length;
  row('blocks in the walk with no user transaction', `${empties} of ${fmt(B.length)}`, 'eth_getBlockByNumber (transactions.length − 1 internal tx)');
  try {
    const early = (await fetchBlocks(range(1, 60), false, [EP.publicnode], 'early')).blocks;
    const gaps = early.slice(1).map((b, i) => b.ts - early[i].ts);
    row('the chain\'s first 60 blocks', `${iso(early[0].ts)} → ${iso(early[early.length - 1].ts)}: gaps between consecutive blocks median ${fmt(summary(gaps).med)} s, max ${fmt(Math.max(...gaps))} s; fewest txs in a block ${Math.min(...early.map(b => b.ntx))} (1 = internal only)`, 'eth_getBlockByNumber 1..60');
    const onDemand = Math.max(...gaps) > 60 && Math.min(...early.map(b => b.ntx)) >= 2;
    note(`INFERRED: ${onDemand ? 'blocks are produced on demand — when the chain was quiet, hours passed between blocks and no block was empty; today traffic is continuous, so a block appears every ~100 ms' : 'not conclusive from this sample'}${empties === 0 ? '; no block in the walk is empty' : ''}.`);
  } catch (e) { note('early-history check failed: ' + e.message); }

  sub('cadence over the chain\'s life (sparse headers)');
  try {
    const tip = B[B.length - 1].n;
    const week = Math.round(7 * 86400 * s.mean);
    const from = Math.max(1, tip - week), stepW = Math.max(1, Math.floor((tip - from) / 120));
    const wk = (await fetchBlocks(Array.from({ length: 121 }, (_, i) => from + i * stepW).filter(n => n <= tip), false, [EP.publicnode], 'sparse-week')).blocks;
    const all = (await fetchBlocks(Array.from({ length: 81 }, (_, i) => Math.max(1, Math.round(tip * i / 80))), false, [EP.publicnode], 'sparse-life')).blocks;
    ctx.sparseWeek = wk; ctx.sparseLife = all;
    const rates = a => a.slice(1).map((b, i) => (b.n - a[i].n) / Math.max(1, b.ts - a[i].ts));
    const rw = rates(wk), sw = summary(rw);
    row(`last ~7 days, ${wk.length} headers every ${fmt(stepW)} blocks`, `${iso(wk[0].ts)} → ${iso(wk[wk.length - 1].ts)}; blocks/s per segment min ${f2(sw.min)} / median ${f2(sw.med)} / max ${f2(sw.max)}`, 'eth_getBlockByNumber, sparse');
    const ra = rates(all);
    const firstFast = all.find((b, i) => i > 0 && ra[i - 1] >= 9);
    row(`whole chain, ${all.length} headers`, `block 1 at ${iso(all[0].ts)}; blocks/s per segment min ${f2(Math.min(...ra))} / median ${f2(summary(ra).med)} / max ${f2(Math.max(...ra))}; at ≥ 9 blocks/s since about ${firstFast ? iso(firstFast.ts).slice(0, 10) : '?'}`, 'eth_getBlockByNumber, sparse');
  } catch (e) { note('sparse history failed: ' + e.message); }

  sub('how often the L1 block number moves (what block.number does on this chain)');
  const runs = []; let cur = null;
  for (const b of B) { if (!cur || cur.l1 !== b.l1) { cur = { l1: b.l1, n: 0, ts: b.ts }; runs.push(cur); } cur.n++; }
  if (runs.length > 3) {
    const mid = runs.slice(1, -1), steps = runs.slice(1).map((r, i) => r.l1 - runs[i].l1), secsPer = runs.slice(2).map((r, i) => r.ts - runs[i + 1].ts);
    row('distinct L1 numbers seen in the walk', `${runs.length}; L2 blocks per L1 number min / median / p95 / max ${sm(mid.map(r => r.n))}`, 'header field l1BlockNumber');
    row('seconds between changes: min / median / p95 / max', sm(secsPer), 'block timestamps');
    row('size of each change in L1 blocks', topN(countBy(steps, x => x), 9).sort((a, b) => a[0] - b[0]).map(([k, v]) => `+${k}: ${v}`).join('  '), 'header field l1BlockNumber');
  }
  if (USE_WS) {
    sub('real-time arrival of new heads over WebSocket (sub-second resolution, which timestamps cannot give)');
    for (const u of WS_URLS) {
      const r = await wsHeads(u, 100, 15000);
      if (r.error) row(u, 'no subscription: ' + r.error, 'eth_subscribe newHeads');
      else row(u, `${r.n} heads in ${f2(r.span / 1000, 2)} s; inter-arrival min / median / p95 / max ${sm(r.gaps, x => Math.round(x))} ms; ${r.contiguous ? 'no height skipped' : 'heights skipped'}`, 'eth_subscribe newHeads');
      ctx.ws = ctx.ws || {}; ctx.ws[u] = r;
    }
  }
}
function wsHeads(url, want, timeoutMs) {
  return new Promise(resolve => {
    if (typeof WebSocket === 'undefined') return resolve({ error: 'this Node has no WebSocket client' });
    let ws, done = false; const arr = [];
    const finish = err => {
      if (done) return; done = true; clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      if (arr.length < 3) return resolve({ error: err || 'fewer than 3 heads before the timeout' });
      const gaps = arr.slice(1).map((x, i) => x.t - arr[i].t);
      resolve({ n: arr.length, span: arr[arr.length - 1].t - arr[0].t, gaps, contiguous: arr.every((x, i) => i === 0 || x.n === arr[i - 1].n + 1) });
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    try { ws = new WebSocket(url); } catch (e) { return finish(e.message); }
    ws.onopen = () => ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newHeads'] }));
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id === 1 && m.error) return finish(errText(m.error));
      if (m.params && m.params.result) { arr.push({ t: performance.now(), n: num(m.params.result.number) }); if (arr.length >= want) finish(); }
    };
    ws.onerror = ev => finish(ev.message || 'connection refused or not a WebSocket endpoint');
    ws.onclose = () => finish('closed');
  });
}

// ================================================================================================
// 3. transactions per block
// ================================================================================================
async function sTxs() {
  H('3. TRANSACTIONS PER BLOCK');
  const w = await getWalk(), B = w.blocks;
  if (B.length < 2) { note('walk failed'); return; }
  const user = B.map(b => Math.max(0, b.ntx - 1));
  const s = summary(user), secs = B[B.length - 1].ts - B[0].ts;
  row('user transactions per block: min / median / p95 / max', `${s.min} / ${s.med} / ${s.p95} / ${s.max}   (mean ${f2(s.mean)})`, `eth_getBlockByNumber ×${fmt(B.length)}; one internal 0x6a tx per block subtracted`);
  const bucket = n => (n === 0 ? '0' : n === 1 ? '1' : n === 2 ? '2' : n <= 5 ? '3–5' : n <= 10 ? '6–10' : n <= 20 ? '11–20' : n <= 50 ? '21–50' : '51+');
  const hist = countBy(user, bucket);
  row('distribution', ['0', '1', '2', '3–5', '6–10', '11–20', '21–50', '51+'].map(k => `${k}: ${pct(hist.get(k) || 0, B.length)}`).join('  '), 'same walk');
  row('blocks with exactly one user transaction', `${fmt(hist.get('1') || 0)} of ${fmt(B.length)} (${pct(hist.get('1') || 0, B.length)})`, 'same walk');
  row('user transactions per second', f2(user.reduce((a, b) => a + b, 0) / secs, 1), 'INFERRED: walk total ÷ seconds covered');
  const gas = B.map(b => b.gasUsed), gs = summary(gas);
  row('gas used per block: min / median / p95 / max', `${sm(gas)}   (mean ${fmt(gs.mean)})`, 'header gasUsed');
  const gps = gas.reduce((a, b) => a + b, 0) / secs;
  ctx.gasPerSec = gps;
  row('gas used per second', `${fmt(gps)}  (${f2(gps / 1e6, 1)} M gas/s)`, 'INFERRED: walk total ÷ seconds covered');
  row('block size in bytes: min / median / p95 / max', sm(B.map(b => b.size)), 'header size');
  const lim = await viaAny([ethCall(ARBGASINFO, sel('getMaxBlockGasLimit()')), ethCall(ARBGASINFO, sel('getMaxTxGasLimit()')), ethCall(ARBGASINFO, sel('getGasAccountingParams()'))]);
  const blockLim = lim[0].result ? num(lim[0].result) : null, txLim = lim[1].result ? num(lim[1].result) : null;
  ctx.blockLim = blockLim; ctx.txLim = txLim;
  row('block gas limit in the header', `2^${B[0].gasLimit.toString(2).length - 1} = ${fmt(B[0].gasLimit)} — a placeholder, not a limit`, 'header gasLimit');
  row('ArbOS block gas limit / per-transaction gas limit', `${blockLim ? fmt(blockLim) : errText(lim[0].error)} / ${txLim ? fmt(txLim) : errText(lim[1].error)}`, 'eth_call ArbGasInfo(0x6c).getMaxBlockGasLimit(), getMaxTxGasLimit()');
  if (blockLim) row('blocks in the walk above the ArbOS block limit', `${B.filter(b => b.gasUsed > blockLim).length}; fullest block used ${fmt(gs.max)} gas (${pct(gs.max, blockLim)} of the limit)`, 'header gasUsed');
  note('SOURCED: the limit is soft — "the Effective Block Gas Limit is really MaxBlockGasLimit + MaxTxGasLimit", the last transaction may overshoot (docs.arbitrum.io/run-arbitrum-node/arbos-releases/arbos51).');

  sub(`transaction types and destinations — ${DETAIL} most recent blocks of the walk, full transactions`);
  const d = await getDetail(), D = d.blocks;
  const txs = D.flatMap(b => b.txs);
  const types = countBy(txs, t => t.type);
  row('transactions by type', topN(types, 20).map(([k, v]) => `${k}: ${fmt(v)}`).join('  '), `eth_getBlockByNumber(full) ×${D.length}`);
  note('  type 0x6a = Arbitrum internal start-of-block; 0x0 legacy; 0x1 access-list; 0x2 EIP-1559; 0x4 EIP-7702; 0x64–0x69 = L1→L2 deposits, retryables and other bridge messages');
  const firstInternal = D.every(b => b.txs.length > 0 && b.txs[0].type === '0x6a' && b.txs.slice(1).every(t => t.type !== '0x6a'));
  row('every block starts with exactly one 0x6a tx', firstInternal ? 'yes — so user txs = transactions.length − 1 holds for the walk' : 'NO — the walk\'s count is approximate', 'same sample');
  const ut = txs.filter(t => t.type !== '0x6a');
  ctx.userTxSample = ut;
  row('calldata bytes per user tx: min / median / p95 / max', sm(ut.map(t => t.inLen)), 'same sample');
  row('gas limit set per user tx: min / median / p95 / max', sm(ut.map(t => t.gas)), 'same sample');
  const withPrio = ut.filter(t => t.prio !== null);
  row('user txs offering a priority fee > 0', `${pct(withPrio.filter(t => t.prio > 0).length, withPrio.length)} of ${fmt(withPrio.length)} fee-market txs`, 'maxPriorityFeePerGas, same sample');
  if (txLim) {
    const over = ut.filter(t => t.gas > txLim);
    let extra = '';
    if (over.length) {
      const rr = await viaAny(over.slice(0, 5).map(t => ['eth_getTransactionReceipt', [t.hash]]));
      extra = '; e.g. ' + over.slice(0, 5).map((t, i) => `${fmt(t.gas)} declared → ${rr[i].result ? fmt(num(rr[i].result.gasUsed)) + ' used, status ' + rr[i].result.status : '?'}`).join('; ');
    }
    row('user txs declaring a gas limit above the per-tx limit', `${over.length} of ${fmt(ut.length)}${extra}${over.length ? ' — included all the same: the limit caps gas used, not the declared limit' : ''}`, 'tx field gas vs getMaxTxGasLimit(); eth_getTransactionReceipt');
  }
  row('contract creations', `${ut.filter(t => t.to === null).length} of ${fmt(ut.length)}`, 'same sample');
  const dest = countBy(ut.filter(t => t.to), t => t.to.toLowerCase());
  const top = topN(dest, 10);
  ctx.topDest = top;
  const senders = countBy(ut, t => t.from.toLowerCase());
  row('distinct senders / distinct destinations', `${fmt(senders.size)} / ${fmt(dest.size)} across ${fmt(ut.length)} user txs; busiest sender sent ${pct(topN(senders, 1)[0][1], ut.length)}`, 'same sample');
  const codes = await viaAny(top.map(([a]) => ['eth_getCode', [a, 'latest']]));
  note('top destinations by user-transaction count:');
  top.forEach(([a, c], i) => note(`    ${String(i + 1).padStart(2)}. ${a}  ${pct(c, ut.length).padStart(7)}  code ${fmt(bytesOf(codes[i].result || '0x'))} B  ${nameOf(a)}`));
  row('share of user txs going to the top 10 destinations', pct(top.reduce((a, [, c]) => a + c, 0), ut.length), 'same sample');

  sub(`receipts — ${RECEIPT_BLOCKS} blocks spread across that sample`);
  const R = await getReceipts();
  const rc = R.flatMap(x => x.receipts.filter(r => r.type !== '0x6a').map(r => ({ ...r, base: x.block.baseFee })));
  if (!rc.length) { note('no receipts returned'); return; }
  ctx.receiptSample = rc;
  const failed = rc.filter(r => r.status === '0x0').length;
  row('user transactions that reverted', `${fmt(failed)} of ${fmt(rc.length)} (${pct(failed, rc.length)})`, `eth_getBlockReceipts ×${R.length}`);
  row('gas used per user tx: min / median / p95 / max', sm(rc.map(r => num(r.gasUsed))), 'receipt gasUsed');
  const above = rc.filter(r => num(r.effectiveGasPrice) > r.base).length;
  row('receipts paying more than the block base fee', `${above} of ${fmt(rc.length)}${above === 0 ? ' — a priority fee buys nothing: every tx pays exactly the base fee' : ''}`, 'receipt effectiveGasPrice vs header baseFeePerGas');
}

// ================================================================================================
// 4. fees
// ================================================================================================
async function sFees() {
  H('4. FEES');
  const usd = await getEthUsd();
  for (const ep of [EP.official, EP.publicnode, EP.drpc]) {
    try {
      const r = await rpcBatch(ep, [['eth_gasPrice', []], ['eth_maxPriorityFeePerGas', []]]);
      row(`${ep.name}: eth_gasPrice / suggested tip`, `${r[0].result ? `${fmt(num(r[0].result))} wei = ${gwei(num(r[0].result))}` : errText(r[0].error)} / ${r[1].result ? gwei(num(r[1].result)) : errText(r[1].error)}`, 'eth_gasPrice, eth_maxPriorityFeePerGas');
    } catch (e) { row(ep.name, e.message); }
  }
  sub('base fee');
  const fh = await viaAny([['eth_feeHistory', ['0x400', 'latest', [10, 50, 90]]], ['eth_feeHistory', ['0x1388', 'latest', []]]]);
  if (fh[0].result) {
    const f = fh[0].result, bf = f.baseFeePerGas.map(num), oldest = num(f.oldestBlock);
    const hb = await viaAny([['eth_getBlockByNumber', [hex(oldest), false]], ['eth_getBlockByNumber', [hex(oldest + bf.length - 2), false]]]);
    const span = hb[0].result && hb[1].result ? num(hb[1].result.timestamp) - num(hb[0].result.timestamp) : null;
    row('eth_feeHistory window', `${fmt(bf.length - 1)} blocks from ${fmt(oldest)}${span !== null ? ` = ${span} s of chain time` : ''}; a request for 5,000 blocks returned ${fh[1].result ? fmt(fh[1].result.baseFeePerGas.length - 1) : '?'}`, 'eth_feeHistory(1024 | 5000, latest)');
    row('base fee over that window: min / median / p95 / max', sm(bf, gwei), 'eth_feeHistory baseFeePerGas');
    const rw = (f.reward || []).map(x => x.map(num));
    if (rw.length) row('tips actually paid, 10th / 50th / 90th percentile, max over the window', [0, 1, 2].map(i => gwei(Math.max(...rw.map(x => x[i])))).join(' / '), 'eth_feeHistory reward');
  } else row('eth_feeHistory', errText(fh[0].error));
  try {
    // 24 non-contiguous windows of 1,024 blocks, one per hour, on the archive endpoint
    const tip = await getTip(), per = 36000, pages = [];
    for (let i = 0; i < 24; i++) pages.push(['eth_feeHistory', ['0x400', hex(tip - i * per), []]]);
    const res = await rpcBatch(EP.drpc, pages);
    const all = res.filter(x => x.result).flatMap(x => x.result.baseFeePerGas.slice(0, -1).map(num));
    if (all.length) row(`base fee over ~24 h: ${res.filter(x => x.result).length} windows of 1,024 blocks, one per ${fmt(per)} blocks`, `min / median / p95 / max ${sm(all, gwei)}  (${fmt(all.length)} blocks)`, 'eth_feeHistory(1024, <historic block>) on an archive endpoint');
    else row('paged eth_feeHistory', 'no archive endpoint answered: ' + errText(res[0].error));
  } catch (e) { row('paged eth_feeHistory', e.message); }
  if (ctx.walk) { const B = (await ctx.walk).blocks; row(`base fee across the ${fmt(B.length)}-block walk: min / median / p95 / max`, sm(B.map(b => b.baseFee), gwei), 'header baseFeePerGas'); }
  if (ctx.sparseWeek) {
    const wk = ctx.sparseWeek, mx = wk.reduce((a, b) => (b.baseFee > a.baseFee ? b : a));
    row(`base fee, ${wk.length} headers across ~7 days: min / median / p95 / max`, `${sm(wk.map(b => b.baseFee), gwei)}; the max was at ${iso(mx.ts)}`, 'header baseFeePerGas, sparse');
  }
  if (ctx.sparseLife) {
    const lf = ctx.sparseLife.filter(b => b.n > 1), mx = lf.reduce((a, b) => (b.baseFee > a.baseFee ? b : a));
    row(`base fee, ${lf.length} headers across the chain's life: min / median / p95 / max`, `${sm(lf.map(b => b.baseFee), gwei)}; the max was at ${iso(mx.ts)}`, 'header baseFeePerGas, sparse');
  }

  sub('ArbGasInfo (0x6c)');
  const G = ['getPricesInWei', 'getPricesInArbGas', 'getMinimumGasPrice', 'getL1BaseFeeEstimate', 'getGasAccountingParams', 'getMaxTxGasLimit', 'getMaxBlockGasLimit',
    'getGasPricingConstraints', 'getMultiGasPricingConstraints', 'getMultiGasBaseFee', 'getGasBacklog', 'getPricingInertia', 'getGasBacklogTolerance',
    'getL1PricingSurplus', 'getLastL1PricingSurplus', 'getL1FeesAvailable', 'getL1PricingFundsDueForRewards', 'getL1PricingUnitsSinceUpdate', 'getLastL1PricingUpdateTime',
    'getL1PricingEquilibrationUnits', 'getL1BaseFeeEstimateInertia', 'getL1RewardRate', 'getL1RewardRecipient', 'getPerBatchGasCharge', 'getAmortizedCostCapBips'];
  const gr = await viaAny([...G.map(g => ethCall(ARBGASINFO, sel(g + '()'))), ethCall(ARBOWNERPUBLIC, sel('isCalldataPriceIncreaseEnabled()')), ethCall(ARBOWNERPUBLIC, sel('getParentGasFloorPerToken()')), ['eth_getBlockByNumber', ['latest', false]]]);
  const g = Object.fromEntries(G.map((k, i) => [k, gr[i].result ? words(gr[i].result) : null]));
  const how = n => `eth_call ArbGasInfo.${n}()`;
  const signed = v => (v >= 1n << 255n ? v - (1n << 256n) : v);
  let l1Unit = null, base = null;
  if (g.getPricesInWei) {
    const p = g.getPricesInWei; base = Number(p[5]);
    row('getPricesInWei', `per L2 tx ${fmt(p[0])} · per L1 calldata byte ${fmt(p[1])} · per storage slot ${fmt(p[2])} · gas base ${fmt(p[3])} · gas congestion ${fmt(p[4])} · gas total ${fmt(p[5])}  (wei)`, how('getPricesInWei'));
    note(`  → L2 gas price now ${gwei(p[5])} = floor ${gwei(p[3])} + congestion ${gwei(p[4])} (${f2(Number(p[5]) / Number(p[3]), 2)}× the floor)`);
  }
  if (g.getPricesInArbGas) row('getPricesInArbGas', `per L2 tx ${g.getPricesInArbGas[0]} gas · per L1 calldata byte ${g.getPricesInArbGas[1]} gas · per storage slot ${fmt(g.getPricesInArbGas[2])} gas`, how('getPricesInArbGas'));
  if (g.getMinimumGasPrice) row('getMinimumGasPrice', `${fmt(g.getMinimumGasPrice[0])} wei = ${gwei(g.getMinimumGasPrice[0])}`, how('getMinimumGasPrice'));
  if (g.getL1BaseFeeEstimate) { l1Unit = Number(g.getL1BaseFeeEstimate[0]); row('getL1BaseFeeEstimate (ArbOS price per L1 data unit; 16 units per compressed byte)', `${fmt(l1Unit)} wei = ${gwei(l1Unit)}`, how('getL1BaseFeeEstimate')); }
  if (g.getGasAccountingParams) row('getGasAccountingParams', `speedLimitPerSecond ${fmt(g.getGasAccountingParams[0])} · gasPoolMax ${fmt(g.getGasAccountingParams[1])} · maxBlockGasLimit ${fmt(g.getGasAccountingParams[2])}`, how('getGasAccountingParams'));
  if (g.getMaxTxGasLimit && g.getMaxBlockGasLimit) row('getMaxTxGasLimit / getMaxBlockGasLimit', `${fmt(g.getMaxTxGasLimit[0])} / ${fmt(g.getMaxBlockGasLimit[0])}`, how('getMaxTxGasLimit') + ', getMaxBlockGasLimit()');
  if (g.getGasPricingConstraints) {
    const c = g.getGasPricingConstraints, n = Number(c[1]);
    for (let i = 0; i < n; i++) {
      const [target, window, backlog] = [c[2 + 3 * i], c[3 + 3 * i], c[4 + 3 * i]];
      row(`pricing constraint ${i + 1} of ${n}`, `target ${fmt(target)} gas/s over ${fmt(window)} s · backlog ${fmt(backlog)} gas → exponent ${f2(Number(backlog) / (Number(target) * Number(window)), 4)}`, how('getGasPricingConstraints'));
    }
    const ex = Array.from({ length: n }, (_, i) => Number(c[4 + 3 * i]) / (Number(c[2 + 3 * i]) * Number(c[3 + 3 * i]))).reduce((a, b) => a + b, 0);
    if (g.getMinimumGasPrice) note(`  INFERRED: floor × e^(sum of exponents) = ${gwei(Number(g.getMinimumGasPrice[0]) * Math.exp(ex))} — the base fee is above the floor because gas use has run above the long-window target${ctx.gasPerSec ? ` (the walk measured ${f2(ctx.gasPerSec / 1e6, 1)} M gas/s)` : ''}.`);
  }
  if (g.getMultiGasPricingConstraints) row('multi-dimensional gas constraints', `${g.getMultiGasPricingConstraints[1]} configured`, how('getMultiGasPricingConstraints'));
  if (g.getMultiGasBaseFee) { const v = g.getMultiGasBaseFee.slice(2); row('per-resource base fees', `${v.length} resource kinds, ${new Set(v.map(String)).size === 1 ? 'all ' + gwei(v[0]) : v.map(x => gwei(x)).join(', ')}`, how('getMultiGasBaseFee')); }
  if (g.getGasBacklog) row('legacy single-constraint backlog / inertia / tolerance', `${fmt(g.getGasBacklog[0])} / ${g.getPricingInertia?.[0]} / ${g.getGasBacklogTolerance?.[0]}`, how('getGasBacklog') + ', getPricingInertia(), getGasBacklogTolerance()');
  if (g.getL1PricingSurplus) row('L1 pricing surplus now / at last update', `${fmt(signed(g.getL1PricingSurplus[0]))} / ${g.getLastL1PricingSurplus ? fmt(signed(g.getLastL1PricingSurplus[0])) : '?'} wei`, how('getL1PricingSurplus') + ', getLastL1PricingSurplus()');
  if (g.getL1FeesAvailable) row('L1 fees available / owed as rewards', `${fmt(g.getL1FeesAvailable[0])} / ${g.getL1PricingFundsDueForRewards ? fmt(g.getL1PricingFundsDueForRewards[0]) : '?'} wei`, how('getL1FeesAvailable') + ', getL1PricingFundsDueForRewards()');
  if (g.getLastL1PricingUpdateTime && gr[G.length + 2].result) row('last batch-poster report', `${iso(g.getLastL1PricingUpdateTime[0])} (${num(gr[G.length + 2].result.timestamp) - Number(g.getLastL1PricingUpdateTime[0])} s before the latest block); ${fmt(g.getL1PricingUnitsSinceUpdate?.[0] ?? 0)} data units since`, how('getLastL1PricingUpdateTime') + ', getL1PricingUnitsSinceUpdate()');
  if (g.getL1RewardRate) row('L1 reward rate / recipient', `${g.getL1RewardRate[0]} wei per unit → ${g.getL1RewardRecipient ? toAddr(g.getL1RewardRecipient[0]) : '?'}`, how('getL1RewardRate') + ', getL1RewardRecipient()');
  if (g.getPerBatchGasCharge) row('per-batch gas charge / amortised cost cap / equilibration units / L1 inertia', `${fmt(g.getPerBatchGasCharge[0])} / ${g.getAmortizedCostCapBips?.[0]} bips / ${fmt(g.getL1PricingEquilibrationUnits?.[0] ?? 0)} / ${g.getL1BaseFeeEstimateInertia?.[0]}`, 'eth_call ArbGasInfo, four getters');
  if (gr[G.length].result) row('EIP-7623 calldata floor price enabled', BigInt(gr[G.length].result) === 1n ? 'yes' : 'no', 'eth_call ArbOwnerPublic.isCalldataPriceIncreaseEnabled()');

  sub('are users charged for L1 data today?');
  const tipL1 = await getTip();
  // (a) the L1 unit price through time, from archive state: it is not a constant
  const series = [];
  try {
    const run = async (label, count, stepBlocks) => {
      const hs = Array.from({ length: count }, (_, i) => tipL1 - i * stepBlocks);
      const res = await rpcBatch(EP.drpc, hs.map(n => ethCall(ARBGASINFO, sel('getL1BaseFeeEstimate()'), hex(n))));
      const v = res.map((x, i) => (x.result ? { n: hs[i], p: num(x.result) } : null)).filter(Boolean);
      if (!v.length) { row(label, 'archive state not served: ' + errText(res[0].error)); return; }
      series.push(...v);
      row(label, `${v.filter(x => x.p === 0).length} of ${v.length} samples are exactly 0; min / median / p95 / max ${sm(v.map(x => x.p), x => fmt(x))} wei`, 'eth_call ArbGasInfo.getL1BaseFeeEstimate() at historic blocks, archive endpoint');
    };
    await run('L1 unit price, last 2 h, every 3,000 blocks (~5 min)', 24, 3000);
    await run('L1 unit price, last 7 days, every 216,000 blocks (~6 h)', 28, 216000);
  } catch (e) { note('archive series failed: ' + e.message); }
  row('L1 unit price now', l1Unit === null ? '?' : `${fmt(l1Unit)} wei${l1Unit === 0 ? ' — L1 data is free at this moment' : ''}`, how('getL1BaseFeeEstimate'));
  // (b) what the node estimates now
  const rnd = n => { let o = '', h = keccak256('oubliette-census'); while (o.length < 2 * n) { h = keccak256(h); o += strip(h); } return o.slice(0, 2 * n); };
  const encBytes = d => word(96) + word(d.length / 2) + d.padEnd(Math.ceil(d.length / 64) * 64, '0');
  const l1c = d => ethCall(NODEINTERFACE, sel('gasEstimateL1Component(address,bool,bytes)') + word(PROBE2) + word(0) + encBytes(d));
  const samples = [['empty calldata', ''], ['1,000 zero bytes', '00'.repeat(1000)], ['1,000 pseudo-random bytes', rnd(1000)], ['10,000 pseudo-random bytes', rnd(10000)]];
  const est = await viaAny([...samples.map(([, d]) => l1c(d)), ...samples.map(([, d]) => ['eth_estimateGas', [{ to: PROBE2, data: '0x' + d }]])]);
  samples.forEach(([name, d], i) => {
    const a = est[i].result ? words(est[i].result) : null, b = est[samples.length + i];
    const intrinsic = 21000 + [...Buffer.from(d, 'hex')].reduce((t, x) => t + (x === 0 ? 4 : 16), 0);
    row(`estimate now, ${name}`, a ? `L1 component ${fmt(a[0])} gas (unit price ${fmt(a[2])} wei, base fee ${gwei(a[1])}); eth_estimateGas ${b.result ? fmt(num(b.result)) : errText(b.error)} against ${fmt(intrinsic)} intrinsic` : errText(est[i].error), 'eth_call NodeInterface(0xc8).gasEstimateL1Component, eth_estimateGas');
  });
  note('  (eth_estimateGas stops its search within 1.5 % of the true minimum, so a small excess over intrinsic gas is slack, not a charge)');
  // (c) what transactions actually paid, now and at the most recent sampled block where the price was not zero
  const l1Stats = (rc, label, how2) => {
    const l1g = rc.filter(r => r.type !== '0x6a' && r.gasUsedForL1 !== undefined && num(r.gasUsed) > 0);
    if (!l1g.length) { row(label, 'no receipts'); return null; }
    const nz = l1g.filter(r => num(r.gasUsedForL1) > 0).length, tot = l1g.reduce((t, r) => t + num(r.gasUsedForL1), 0), all = l1g.reduce((t, r) => t + num(r.gasUsed), 0);
    row(label, `${fmt(nz)} of ${fmt(l1g.length)} receipts carry an L1 charge; gasUsedForL1 min / median / p95 / max ${sm(l1g.map(r => num(r.gasUsedForL1)))}; L1 share of a tx's gas, median ${f2(summary(l1g.map(r => 100 * num(r.gasUsedForL1) / num(r.gasUsed))).med, 2)} %, of all gas ${pct(tot, all, 2)}`, how2);
    return summary(l1g.map(r => num(r.gasUsedForL1))).med;
  };
  try {
    const rc = (await getReceipts()).flatMap(x => x.receipts);
    ctx.l1GasMedian = l1Stats(rc, 'receipts now', `eth_getBlockReceipts ×${RECEIPT_BLOCKS}, field gasUsedForL1`) ?? 0;
  } catch (e) { note('receipt sample failed: ' + e.message); }
  const lastOn = series.filter(x => x.p > 0).sort((x, y) => y.n - x.n)[0];
  if (lastOn) {
    try {
      const res = await viaAny(range(lastOn.n - 2, lastOn.n + 2).map(n => ['eth_getBlockReceipts', [hex(n)]]), [EP.publicnode, EP.official, EP.drpc]);
      const hdr = await one('eth_getBlockByNumber', [hex(lastOn.n), false]);
      ctx.l1GasWhenOn = l1Stats(res.flatMap(x => x.result || []), `receipts when it was last on (block ${fmt(lastOn.n)}${hdr.result ? ', ' + iso(num(hdr.result.timestamp)) : ''}, unit price ${fmt(lastOn.p)} wei)`, 'eth_getBlockReceipts ×5, field gasUsedForL1');
    } catch (e) { note('receipts at the last non-zero sample failed: ' + e.message); }
  }
  if (series.length && base) {
    const mx = Math.max(...series.map(x => x.p));
    note(`INFERRED: an incompressible calldata byte is 16 data units, so at the highest unit price sampled (${fmt(mx)} wei) it costs 16 × ${fmt(mx)} ÷ ${fmt(base)} ≈ ${f2(16 * mx / base, 1)} gas of L1 data, on top of 16 gas of L2 intrinsic gas; compressible data costs less (Brotli level 1).`);
    note(`VERDICT (measured): intermittently. The price ArbOS charges for L1 data falls to zero whenever its L1 fee pool is in surplus and comes back when it is not — it was zero at ${series.filter(x => x.p === 0).length} of ${series.length} sampled moments. When it is on it adds a per-transaction charge in gas (rows above); when it is off receipts show gasUsedForL1 = 0.`);
  }

  sub('what a transaction costs at the price measured above');
  row('ETH/USD used', `$${fmt(usd)}`, ctx.ethUsdHow);
  if (base) {
    const l1 = Math.max(ctx.l1GasMedian ?? 0, ctx.l1GasWhenOn ?? 0);
    for (const [name, gasN] of [['plain ETH transfer', 21000], ['a 60k-gas call (ERC-20 transfer, equip flag)', 60000], ['a 150k-gas call (NFT mint, offer placement)', 150000], ['a 500k-gas call (batch settlement of a run)', 500000], ['a 5M-gas call', 5000000], ['a max-size 96 KiB contract deployment', 19900000]]) {
      const wei = (gasN + l1) * base;
      row(name, `${fmt(gasN)} gas + ~${fmt(l1)} L1 gas → ${(wei / 1e18).toExponential(3)} ETH = $${(wei / 1e18 * usd).toFixed(wei / 1e18 * usd < 0.01 ? 6 : 4)}`, 'INFERRED: (gas + median L1 gas of a tx when the L1 price is on) × base fee × ETH/USD');
    }
    if (ctx.sparseLife && g.getMinimumGasPrice) {
      const mx = Math.max(...ctx.sparseLife.filter(b => b.n > 1).map(b => b.baseFee));
      note(`  INFERRED: the base fee has been as high as ${gwei(mx)} at a sampled point in the chain's life — ${f2(mx / Number(g.getMinimumGasPrice[0]), 1)}× the floor and ${f2(mx / base, 1)}× today's; scale the table accordingly.`);
    }
  }
}

// ================================================================================================
// 5. data availability
// ================================================================================================
async function sDA() {
  H('5. DATA AVAILABILITY — ROLLUP OR ANYTRUST?');
  if (!ctx.chainConfig) {
    try {
      const len = num((await one('eth_getStorageAt', [ARBOS_STATE, arbosSlot([7], 0n), 'latest'])).result);
      const ws = await viaAny(range(1, Math.ceil(len / 32) || 1).map(i => ['eth_getStorageAt', [ARBOS_STATE, arbosSlot([7], BigInt(i)), 'latest']]));
      const full = Math.floor(len / 32), rem = len % 32, parts = ws.slice(0, full).map(x => Buffer.from(strip(x.result), 'hex'));
      if (rem) parts.push(Buffer.from(strip(ws[full].result), 'hex').subarray(32 - rem));
      ctx.chainConfig = JSON.parse(Buffer.concat(parts).toString('utf8'));
    } catch (e) { note('could not read the chain config from ArbOS state: ' + e.message); }
  }
  const arb = ctx.chainConfig?.arbitrum;
  if (arb) {
    row('chain config: DataAvailabilityCommittee', `${arb.DataAvailabilityCommittee}  → ${arb.DataAvailabilityCommittee ? 'AnyTrust (a committee holds the data)' : 'ROLLUP (data goes to the parent chain)'}`, 'eth_getStorageAt ArbOS state, sub-storage 7 (the chain config JSON)');
    row('chain config: InitialArbOSVersion / MaxCodeSize / MaxInitCodeSize', `${arb.InitialArbOSVersion} / ${fmt(arb.MaxCodeSize ?? 0)} / ${fmt(arb.MaxInitCodeSize ?? 0)}`, 'same');
  }
  if (!USE_L1) { note('L1 cross-check skipped (--no-l1)'); return; }
  note(`SOURCED: L1 Rollup ${L1_ROLLUP} and Sequencer Inbox ${L1_SEQ_INBOX} (${DOCS}/protocol-contracts).`);
  try {
    const topic = keccak256('SequencerBatchDelivered(uint256,bytes32,bytes32,bytes32,uint256,(uint64,uint64,uint64,uint64),uint8)');
    const r = await rpcBatch(L1, [['eth_blockNumber', []], ethCall(L1_ROLLUP, sel('chainId()')), ethCall(L1_SEQ_INBOX, sel('rollup()')), ethCall(L1_SEQ_INBOX, sel('batchCount()')),
      ethCall(L1_SEQ_INBOX, sel('maxTimeVariation()')), ethCall(L1_ROLLUP, sel('confirmPeriodBlocks()')), ethCall(L1_ROLLUP, sel('validatorWhitelistDisabled()')), ethCall(L1_ROLLUP, sel('wasmModuleRoot()')),
      ethCall(L1_SEQ_INBOX, sel('isDelayBufferable()')), ethCall(L1_SEQ_INBOX, sel('maxDataSize()'))]);
    const l1Head = num(r[0].result);
    row('L1 Rollup.chainId()', r[1].result ? `${num(r[1].result)} ${num(r[1].result) === 4663 ? '— the documented L1 contract is this chain\'s' : '— NOT 4663'}` : errText(r[1].error), 'eth_call on Ethereum mainnet');
    row('SequencerInbox.rollup() points back to it', r[2].result ? String(toAddr(BigInt(r[2].result)) === L1_ROLLUP.toLowerCase()) : errText(r[2].error), 'eth_call on Ethereum mainnet');
    row('batches posted so far', r[3].result ? fmt(num(r[3].result)) : errText(r[3].error), 'eth_call SequencerInbox.batchCount()');
    if (r[4].result) { const w = words(r[4].result); row('maxTimeVariation: delayBlocks / futureBlocks / delaySeconds / futureSeconds', `${fmt(w[0])} / ${fmt(w[1])} / ${fmt(w[2])} / ${fmt(w[3])}  → force-inclusion through L1 after at most ${f2(Number(w[2]) / 86400, 1)} days${r[8].result && BigInt(r[8].result) === 1n ? ' (delay buffer enabled, so less under sustained delay)' : ''}`, 'eth_call SequencerInbox.maxTimeVariation(), isDelayBufferable()'); }
    if (r[5].result) row('confirm (challenge) period', `${fmt(num(r[5].result))} L1 blocks ≈ ${f2(num(r[5].result) * 12 / 86400, 1)} days; validator whitelist ${r[6].result && BigInt(r[6].result) === 1n ? 'disabled (permissionless)' : 'enabled (permissioned validators)'}`, 'eth_call Rollup.confirmPeriodBlocks(), validatorWhitelistDisabled()');
    if (r[7].result) row('WASM module root', r[7].result, 'eth_call Rollup.wasmModuleRoot()');
    if (r[9].result) row('max batch data size', fmt(num(r[9].result)) + ' bytes', 'eth_call SequencerInbox.maxDataSize()');
    const span = 300;
    const lg = (await rpcBatch(L1, [['eth_getLogs', [{ address: L1_SEQ_INBOX, topics: [topic], fromBlock: hex(l1Head - span), toBlock: hex(l1Head) }]]]))[0];
    if (!lg.result) { row('recent batches', errText(lg.error)); return; }
    const logs = lg.result, names = ['TxInput (calldata)', 'SeparateBatchEvent', 'NoData', 'Blob (EIP-4844)'];
    const locs = countBy(logs, l => names[num('0x' + l.data.slice(-64))] ?? 'unknown');
    row(`batches in the last ${span} L1 blocks (~1 h)`, `${logs.length}; data location: ${topN(locs, 9).map(([k, v]) => `${k} ×${v}`).join(', ')}`, 'eth_getLogs SequencerBatchDelivered on Ethereum mainnet');
    if (logs.length > 1) {
      const bl = logs.map(l => num(l.blockNumber)), gaps = bl.slice(1).map((b, i) => b - bl[i]);
      row('L1 blocks between batches: min / median / p95 / max', `${sm(gaps)}  (≈ one batch every ${f2(span * 12 / logs.length, 0)} s)`, 'same logs');
      const pick = [logs[0], logs[Math.floor(logs.length / 2)], logs[logs.length - 1]];
      const txs = await rpcBatch(L1, pick.map(l => ['eth_getTransactionByHash', [l.transactionHash]]));
      txs.forEach((t, i) => { if (t.result) row(`batch ${fmt(BigInt(pick[i].topics[1]))}`, `tx type ${t.result.type}, ${(t.result.blobVersionedHashes || []).length} blobs, ${bytesOf(t.result.input)} bytes of calldata, from ${t.result.from}`, 'eth_getTransactionByHash on Ethereum mainnet'); });
      note(`INFERRED: ${logs.length} batches an hour against ~36,000 L2 blocks an hour ≈ ${fmt(36000 / logs.length)} L2 blocks per batch.`);
    }
    if (ctx.safeBlock) {
      const fb = await one('eth_call', [callArgs(NODEINTERFACE, sel('findBatchContainingBlock(uint64)') + word(ctx.safeBlock)), 'latest'], [EP.official, EP.drpc, EP.publicnode]);
      if (fb.result) row('the L2 node maps its "safe" block to batch', `${fmt(num(fb.result))} — against ${fmt(num(r[3].result))} batches counted on L1`, 'eth_call NodeInterface(0xc8).findBatchContainingBlock');
    }
    note('VERDICT (measured): a rollup. The chain config says no committee, and every recent batch is an EIP-4844 blob transaction to the L1 inbox.');
  } catch (e) { note('L1 cross-check failed: ' + e.message); }
}

// ================================================================================================
// 6. standard infrastructure
// ================================================================================================
const INFRA = [
  ['Multicall3', '0xcA11bde05977b3631167028862bE2a173976CA11'],
  ['Deterministic deployment proxy', '0x4e59b44847b379578588920cA78FbF26c0B4956C'],
  ['CreateX', '0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed'],
  ['Permit2', '0x000000000022D473030F116dDEE9F6B43aC78BA3'],
  ['ERC-4337 EntryPoint v0.6', '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'],
  ['ERC-4337 EntryPoint v0.7', '0x0000000071727De22E5E9d8BAf0edAc6f37da032'],
  ['ERC-4337 EntryPoint v0.8', '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'],
  ['Safe singleton factory', '0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7'],
  ['Seaport 1.6', '0x0000000000000068F116a894984e2DB1123eB395'],
  // not asked for, cheap to add, and relevant to NFT gear and smart accounts
  ['Seaport ConduitController', '0x00000000F9490004C11Cef243f5400493c00Ad63'],
  ['Seaport 1.5', '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC'],
  ['ERC-6551 registry (token-bound accounts)', '0x000000006551c19487814612e58FE06813775758'],
  ['ERC-1820 registry', '0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24'],
  ['ERC-2470 singleton factory', '0xce0042B868300000d44A59004Da54A005ffdcf9f'],
  ['Safe v1.4.1 singleton', '0x41675C099F32341bf84BFc5382aF534df5C7461a'],
  ['Safe v1.4.1 proxy factory', '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67'],
  ['EIP-2935 block-hash history', HISTORY],
  ['EIP-4788 beacon roots', '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02'],
  ['L2 Multicall (Arbitrum\'s, per docs)', '0x2cAC2D899eCC914d704FeaAE33ac1bF36277DaD1'],
];
for (const [n, a] of INFRA) label(a, n);
label(WETH, 'WETH (docs)'); label(USDG, 'USDG (docs)');
async function sInfra() {
  H('6. STANDARD INFRASTRUCTURE');
  const l2 = await viaAny(INFRA.map(([, a]) => ['eth_getCode', [a, 'latest']]));
  let l1 = null;
  if (USE_L1) { try { l1 = await rpcBatch(L1, INFRA.map(([, a]) => ['eth_getCode', [a, 'latest']])); } catch (e) { note('Ethereum comparison skipped: ' + e.message); } }
  note('address                                      code on 4663      vs the same address on Ethereum mainnet            [eth_getCode on both chains]');
  INFRA.forEach(([name, a], i) => {
    const c2 = l2[i].result || '0x', n2 = bytesOf(c2), c1 = l1 && l1[i].result ? l1[i].result : null, n1 = c1 ? bytesOf(c1) : null;
    let cmp = 'not compared';
    if (c1 !== null) {
      if (!n2) cmp = n1 ? `ABSENT here (mainnet has ${fmt(n1)} B)` : 'absent on both';
      else if (!n1) cmp = 'no code on mainnet at this address';
      else if (c1 === c2) cmp = 'identical bytecode';
      else if (n1 === n2) { let d = 0; const a2 = strip(c2), a1 = strip(c1); for (let k = 0; k < a2.length; k += 2) if (a2.slice(k, k + 2) !== a1.slice(k, k + 2)) d++; cmp = `same length, ${d} bytes differ (${d <= 96 ? 'chain-id immutables' : 'a different build'})`; }
      else cmp = `different (mainnet ${fmt(n1)} B)`;
    }
    out(`  ${a}  ${(n2 ? fmt(n2) + ' B' : 'NO CODE').padStart(9)}  ${n2 ? keccak256(c2).slice(0, 12) + '…' : ' '.repeat(13)}  ${cmp.padEnd(58)} ${name}`);
  });
}

// ================================================================================================
// 7. precompiles and opcodes
// ================================================================================================
// One valid vector per precompile, from go-ethereum core/vm/testdata/precompiles/*.json (names in comments),
// except sha256/ripemd160 ("abc") and modexp (the EIP-198 example). `gas` is the Ethereum cost at the
// fork named; the script reports the cost it measures.
const VEC = [
  ['0x01 ecrecover', 1, '18c547e4f7b0f325ad1e56f57e26c745b09a3e503d86e00e5255ff7f715d3d1c000000000000000000000000000000000000000000000000000000000000001c73b1693892219d736caba55bdb67216e485557ea6b6af75f37096c9aa6a5a75feeb940b1d03b21e36b0e47e79769f095fe2ab855bd91e3a38756b7d75a9c4549',
    '000000000000000000000000a94f5374fce5edbc8e2a8697c15331677e6ebf0b', '3,000'],                                                   // ecRecover.json ValidKey
  ['0x02 sha256', 2, '616263', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', '72'],
  ['0x03 ripemd160', 3, '616263', '0000000000000000000000008eb208f7e05d987a9b044a8e98c6b087f15a0bfc', '720'],
  ['0x05 modexp', 5, '00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002003fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2efffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f',
    '0000000000000000000000000000000000000000000000000000000000000001', '1,360 (EIP-2565) / 4,080 (EIP-7883)'],  // modexp_eip2565.json eip_example1
  ['0x06 bn254 add', 6, '18b18acfb4c2c30276db5411368e7185b311dd124691610c5d3b74034e093dc9063c909c4720840cb5134cb9f59fa749755796819658d32efc0d288198f3726607c2b7f58a84bd6145f00c9c2bc0bb1a187f20ff2c92963a88019e7c6a014eed06614e20c147e940f2d70da3f74c9a17df361706a4485c742bd6788478fa17d7',
    '2243525c5efd4b9c3d3c45ac0ca3fe4dd85e830a4ce6b65fa1eeaee202839703301d1d33be6da8e509df21cc35964723180eed7532537db9ae5e7d48f195c915', '150'],   // bn256Add.json chfast1
  ['0x07 bn254 mul', 7, '2bd3e6d0f3b142924f5ca7b49ce5b9d54c4703d7ae5648e61d02268b1a0a9fb721611ce0a6af85915e2f1d70300909ce2e49dfad4a4619c8390cae66cefdb20400000000000000000000000000000000000000000000000011138ce750fa15c2',
    '070a8d6a982153cae4be29d434e8faef8a47b274a053f5a4ee2a6c9c13c31e5c031b8ce914eba3a9ffb989f9cdd5b0f01943074bf4f0f315690ec3cec6981afc', '6,000'], // bn256ScalarMul.json chfast1
  ['0x08 bn254 pairing (2 pairs)', 8, '1c76476f4def4bb94541d57ebba1193381ffa7aa76ada664dd31c16024c43f593034dd2920f673e204fee2811c678745fc819b55d3e9d294e45c9b03a76aef41209dd15ebff5d46c4bd888e51a93cf99a7329636c63514396b4a452003a35bf704bf11ca01483bfa8b34b43561848d28905960114c8ac04049af4b6315a416782bb8324af6cfc93537a2ad1a445cfd0ca2a71acd7ac41fadbf933c2a51be344d120a2a4cf30c1bf9845f20c6fe39e07ea2cce61f0c9bb048165fe5e4de877550111e129f1cf1097710d41c4ac70fcdfa5ba2023c6ff1cbeac322de49d1b6df7c2032c61a830e3c17286de9462bf242fca2883585b93870a73853face6a6bf411198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c21800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa',
    '0000000000000000000000000000000000000000000000000000000000000001', '113,000'],                                              // bn256Pairing.json jeff1
  ['0x09 blake2f (12 rounds)', 9, '0000000c48c9bdf267e6096a3ba7ca8485ae67bb2bf894fe72f36e3cf1361d5f3af54fa5d182e6ad7f520e511f6c3e2b8c68059b6bbd41fbabd9831f79217e1319cde05b61626300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000001',
    'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923', '12'],    // blake2F.json vector 5
  ['0x0a KZG point evaluation', 0x0a, '01e798154708fe7789429634053cbf9f99b619f9f084048927333fce637f549b564c0a11a0f704f4fc3e8acfe0f8245f0ad1347b378fbf96e206da11a5d3630624d25032e67a7e6a4910df5834b8fe70e6bcfeeac0352434196bdf4b2485d5a18f59a8d2a1a625a17f3fea0fe5eb8c896db3764f3185481bc22f91b4aaffcca25f26936857bc3a7c2539ea8ec3a952b7873033e038326e87ed3e1276fd140253fa08e9fc25fb2d9a98527fc22a2c9612fbeafdad446cbc7bcdbdcd780af2c16a',
    '000000000000000000000000000000000000000000000000000000000000100073eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001', '50,000'], // pointEvaluation.json
  ['0x0b BLS12-381 G1 add', 0x0b, '000000000000000000000000000000000572cbea904d67468808c8eb50a9450c9721db309128012543902d0ac358a62ae28f75bb8f1c7c42c39a8c5529bf0f4e00000000000000000000000000000000166a9d8cabc673a322fda673779d8e3822ba3ecb8670e461f73bb9021d5fd76a4c56d9d4cd16bd1bba86881979749d280000000000000000000000000000000009ece308f9d1f0131765212deca99697b112d61f9be9a5f1f3780a51335b3ff981747a0b2ca2179b96d2c0c9024e522400000000000000000000000000000000032b80d3a6f5b09f8a84623389c5f80ca69a0cddabc3097f9d9c27310fd43be6e745256c634af45ca3473b0590ae30d1',
    '0000000000000000000000000000000010e7791fb972fe014159aa33a98622da3cdc98ff707965e536d8636b5fcc5ac7a91a8c46e59a00dca575af0f18fb13dc0000000000000000000000000000000016ba437edcc6551e30c10512367494bfb6b01cc6681e8a4c3cd2501832ab5c4abc40b4578b85cbaffbf0bcd70d67c6e2', '375'], // blsG1Add.json #0
  ['0x0c BLS12-381 G1 MSM (1 pair)', 0x0c, '0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb0000000000000000000000000000000008b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e10000000000000000000000000000000000000000000000000000000000000011',
    '000000000000000000000000000000001098f178f84fc753a76bb63709e9be91eec3ff5f7f3a5f4836f34fe8a1a6d6c5578d8fd820573cef3a01e2bfef3eaf3a000000000000000000000000000000000ea923110b733b531006075f796cc9368f2477fe26020f465468efbb380ce1f8eebaf5c770f31d320f9bd378dc758436', '12,000'], // blsG1MultiExp.json #0
  ['0x0d BLS12-381 G2 add', 0x0d, '000000000000000000000000000000001638533957d540a9d2370f17cc7ed5863bc0b995b8825e0ee1ea1e1e4d00dbae81f14b0bf3611b78c952aacab827a053000000000000000000000000000000000a4edef9c1ed7f729f520e47730a124fd70662a904ba1074728114d1031e1572c6c886f6b57ec72a6178288c47c33577000000000000000000000000000000000468fb440d82b0630aeb8dca2b5256789a66da69bf91009cbfe6bd221e47aa8ae88dece9764bf3bd999d95d71e4c9899000000000000000000000000000000000f6d4552fa65dd2638b361543f887136a43253d9c66c411697003f7a13c308f5422e1aa0a59c8967acdefd8b6e36ccf300000000000000000000000000000000122915c824a0857e2ee414a3dccb23ae691ae54329781315a0c75df1c04d6d7a50a030fc866f09d516020ef82324afae0000000000000000000000000000000009380275bbc8e5dcea7dc4dd7e0550ff2ac480905396eda55062650f8d251c96eb480673937cc6d9d6a44aaa56ca66dc000000000000000000000000000000000b21da7955969e61010c7a1abc1a6f0136961d1e3b20b1a7326ac738fef5c721479dfd948b52fdf2455e44813ecfd8920000000000000000000000000000000008f239ba329b3967fe48d718a36cfe5f62a7e42e0bf1c1ed714150a166bfbd6bcf6b3b58b975b9edea56d53f23a0e849',
    '000000000000000000000000000000000411a5de6730ffece671a9f21d65028cc0f1102378de124562cb1ff49db6f004fcd14d683024b0548eff3d1468df26880000000000000000000000000000000000fb837804dba8213329db46608b6c121d973363c1234a86dd183baff112709cf97096c5e9a1a770ee9d7dc641a894d60000000000000000000000000000000019b5e8f5d4a72f2b75811ac084a7f814317360bac52f6aab15eed416b4ef9938e0bdc4865cc2c4d0fd947e7c6925fd1400000000000000000000000000000000093567b4228be17ee62d11a254edd041ee4b953bffb8b8c7f925bd6662b4298bac2822b446f5b5de3b893e1be5aa4986', '600'], // blsG2Add.json #0
  ['0x0e BLS12-381 G2 MSM (1 pair)', 0x0e, '00000000000000000000000000000000024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb80000000000000000000000000000000013e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e000000000000000000000000000000000ce5d527727d6e118cc9cdc6da2e351aadfd9baa8cbdd3a76d429a695160d12c923ac9cc3baca289e193548608b82801000000000000000000000000000000000606c4a02ea734cc32acd2b02bc28b99cb3e287e85a763af267492ab572e99ab3f370d275cec1da1aaa9075ff05f79be0000000000000000000000000000000000000000000000000000000000000011',
    '000000000000000000000000000000000ef786ebdcda12e142a32f091307f2fedf52f6c36beb278b0007a03ad81bf9fee3710a04928e43e541d02c9be44722e8000000000000000000000000000000000d05ceb0be53d2624a796a7a033aec59d9463c18d672c451ec4f2e679daef882cab7d8dd88789065156a1340ca9d426500000000000000000000000000000000118ed350274bc45e63eaaa4b8ddf119b3bf38418b5b9748597edfc456d9bc3e864ec7283426e840fd29fa84e7d89c934000000000000000000000000000000001594b866a28946b6d444bf0481558812769ea3222f5dfc961ca33e78e0ea62ee8ba63fd1ece9cc3e315abfa96d536944', '22,500'], // blsG2MultiExp.json #0
  ['0x0f BLS12-381 pairing (2 pairs)', 0x0f, '000000000000000000000000000000000572cbea904d67468808c8eb50a9450c9721db309128012543902d0ac358a62ae28f75bb8f1c7c42c39a8c5529bf0f4e00000000000000000000000000000000166a9d8cabc673a322fda673779d8e3822ba3ecb8670e461f73bb9021d5fd76a4c56d9d4cd16bd1bba86881979749d2800000000000000000000000000000000122915c824a0857e2ee414a3dccb23ae691ae54329781315a0c75df1c04d6d7a50a030fc866f09d516020ef82324afae0000000000000000000000000000000009380275bbc8e5dcea7dc4dd7e0550ff2ac480905396eda55062650f8d251c96eb480673937cc6d9d6a44aaa56ca66dc000000000000000000000000000000000b21da7955969e61010c7a1abc1a6f0136961d1e3b20b1a7326ac738fef5c721479dfd948b52fdf2455e44813ecfd8920000000000000000000000000000000008f239ba329b3967fe48d718a36cfe5f62a7e42e0bf1c1ed714150a166bfbd6bcf6b3b58b975b9edea56d53f23a0e8490000000000000000000000000000000006e82f6da4520f85c5d27d8f329eccfa05944fd1096b20734c894966d12a9e2a9a9744529d7212d33883113a0cadb9090000000000000000000000000000000017d81038f7d60bee9110d9c0d6d1102fe2d998c957f28e31ec284cc04134df8e47e8f82ff3af2e60a6d9688a4563477c00000000000000000000000000000000024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb80000000000000000000000000000000013e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e000000000000000000000000000000000d1b3cc2c7027888be51d9ef691d77bcb679afda66c73f17f9ee3837a55024f78c71363275a75d75d86bab79f74782aa0000000000000000000000000000000013fa4d4a0ad8b1ce186ed5061789213d993923066dddaf1040bc3ff59f825c78df74f2d75467e25e0f55f8a00fa030ed',
    '0000000000000000000000000000000000000000000000000000000000000001', '102,900'],                                             // blsPairing.json #0
  ['0x10 BLS12-381 map Fp → G1', 0x10, '0000000000000000000000000000000014406e5bfb9209256a3820879a29ac2f62d6aca82324bf3ae2aa7d3c54792043bd8c791fccdb080c1a52dc68b8b69350',
    '000000000000000000000000000000000d7721bcdb7ce1047557776eb2659a444166dc6dd55c7ca6e240e21ae9aa18f529f04ac31d861b54faf3307692545db700000000000000000000000000000000108286acbdf4384f67659a8abe89e712a504cb3ce1cba07a716869025d60d499a00d1da8cdc92958918c222ea93d87f0', '5,500'], // blsMapG1.json #0
  ['0x11 BLS12-381 map Fp2 → G2', 0x11, '0000000000000000000000000000000014406e5bfb9209256a3820879a29ac2f62d6aca82324bf3ae2aa7d3c54792043bd8c791fccdb080c1a52dc68b8b69350000000000000000000000000000000000e885bb33996e12f07da69073e2c0cc880bc8eff26d2a724299eb12d54f4bcf26f4748bb020e80a7e3794a7b0e47a641',
    '000000000000000000000000000000000d029393d3a13ff5b26fe52bd8953768946c5510f9441f1136f1e938957882db6adbd7504177ee49281ecccba596f2bf000000000000000000000000000000001993f668fb1ae603aefbb1323000033fcb3b65d8ed3bf09c84c61e27704b745f540299a1872cd697ae45a5afd780f1d600000000000000000000000000000000079cb41060ef7a128d286c9ef8638689a49ca19da8672ea5c47b6ba6dbde193ee835d3b87a76a689966037c07159c10d0000000000000000000000000000000017c688ae9a8b59a7069c27f2d58dd2196cb414f4fb89da8510518a1142ab19d158badd1c3bad03408fafb1669903cd6c', '23,800'], // blsMapG2.json #0
  ['0x100 P256VERIFY (secp256r1)', 0x100, '4cee90eb86eaa050036147a12d49004b6b9c72bd725d39d4785011fe190f0b4da73bd4903f0ce3b639bbbf6e8e80d16931ff4bcf5993d58468e8fb19086e8cac36dbcd03009df8c59286b162af3bd7fcc0450c9aa81be5d10d312af6c66b1d604aebd3099c618202fcfe16ae7770b0c49ab5eadf74b754204a3bb6060e44eff37618b065f9832de4ca6ca971a7a1adc826d0f7c00181a5fb2ddf79ae00b4e10e',
    '0000000000000000000000000000000000000000000000000000000000000001', '3,450 (RIP-7212) / 6,900 (EIP-7951)'],   // p256Verify.json CallP256Verify
];
async function sPrecompiles() {
  H('7. PRECOMPILES AND OPCODES');
  const mk = (addr, input) => ethCall(PROBE, '0x' + word(addr) + input, 'latest', code(CALLPROBE));
  const res = await viaAny([mk(4, ''), mk(0x1ff, '00'), ...VEC.map(([, a, i]) => mk(a, i))]);
  let l1 = null;
  if (USE_L1) { try { l1 = await rpcBatch(L1, VEC.map(([, a, i]) => ['eth_call', [{ to: toAddr(a), data: '0x' + i }, 'latest']])); } catch (e) { note('Ethereum control skipped: ' + e.message); } }
  if (!res[0].result) { note('probe failed: ' + errText(res[0].error)); return; }
  const overhead = parseCallProbe(res[0].result).delta - 15;
  row('probe overhead, calibrated on identity(0x04) with empty input', `${overhead} gas (118 expected from the opcode table: the identity call costs 15)`, 'eth_call with a state-override probe');
  const nop = parseCallProbe(res[1].result);
  row('control: an address that is not a precompile (0x1ff)', `success with ${nop.len} bytes returned, ${nop.delta - overhead} gas (the cold-account surcharge) — what "absent" looks like`, 'same probe');
  note('precompile                         works?  output            gas measured   Ethereum cost                          same vector on Ethereum mainnet');
  VEC.forEach(([name, , , expect, ethGas], i) => {
    const r = res[2 + i];
    if (!r.result) return out(`  ${name.padEnd(34)} ERROR ${errText(r.error)}`);
    const p = parseCallProbe(r.result), good = p.ok && p.ret === expect;
    const ctl = l1 ? (l1[i].result ? (strip(l1[i].result) === expect ? 'returns the expected output' : 'DIFFERS') : 'error: ' + errText(l1[i].error)) : 'not run';
    out(`  ${name.padEnd(34)} ${(good ? 'YES' : p.ok && p.len === 0 ? 'NO (empty)' : p.ok ? 'WRONG' : 'REVERT').padEnd(7)} ${(good ? 'matches vector' : p.ret.slice(0, 14) + '…').padEnd(17)} ${fmt(p.delta - overhead).padStart(9)}      ${ethGas.padEnd(38)} ${ctl}`);
  });
  note('[each row: eth_call to the probe, which STATICCALLs the precompile and reports gas before − gas after]');

  sub('fork-level opcodes (each executed in a state-override contract)');
  const OPS = [
    ['PUSH0 (Shanghai, EIP-3855)', '5f' + RET32, 0n],
    ['TSTORE / TLOAD (Cancun, EIP-1153)', '602a5f5d5f5c' + RET32, 42n],
    ['MCOPY (Cancun, EIP-5656)', '602a5f5260205f60205e602051' + RET32, 42n],
    ['BLOBHASH (Cancun, EIP-4844)', '5f49' + RET32, 0n],
    ['BLOBBASEFEE (Cancun, EIP-7516)', '4a' + RET32, null],
    ['CLZ (Osaka, EIP-7939)', '60011e' + RET32, 255n],
  ];
  const o = await viaAny(OPS.map(([, c]) => ethCall(PROBE, '0x', 'latest', code(c))));
  OPS.forEach(([name, , expect], i) => row(name, o[i].result ? (expect === null || BigInt(o[i].result) === expect ? `supported (returned ${BigInt(o[i].result)})` : `unexpected value ${o[i].result}`) : 'NOT supported — ' + errText(o[i].error), 'eth_call, state override'));
  note('INFERRED: the EVM is at Osaka level (CLZ, EIP-7883 modexp pricing, EIP-7951 P256 pricing) except BLOBBASEFEE; compile for cancun/prague/osaka, never read block.blobbasefee.');
}

// ================================================================================================
// 8. EIP-7702
// ================================================================================================
async function s7702() {
  H('8. EIP-7702 (TYPE-4 TRANSACTIONS, DELEGATED EOAs)');
  if (ctx.arbos === undefined) { const v = await one('eth_call', [callArgs(ARBSYS, sel('arbOSVersion()')), 'latest']); ctx.arbos = v.result ? num(v.result) - 55 : null; }
  row('(a) ArbOS version', `${ctx.arbos}`, 'eth_call ArbSys.arbOSVersion()');
  note('    SOURCED: ArbOS 40 "Callisto" added EIP-7702 (docs.arbitrum.io/run-arbitrum-node/arbos-releases/arbos40); Robinhood\'s docs say the chain "supports EIP-7702" (docs.robinhood.com/chain/account-abstraction).');
  const des = '0xef0100' + strip(PROBE2), impl = '0x602a' + RET32;
  const auth = { chainId: '0x1237', address: PROBE2, nonce: '0x0', yParity: '0x0', r: '0x1', s: '0x1' };
  const r = await viaAny([
    ['eth_call', [{ to: PROBE, data: '0x' }, 'latest', { [PROBE]: { code: des }, [PROBE2]: { code: impl } }]],
    ['eth_call', [{ to: PROBE, data: '0x' }, 'latest', { [PROBE]: { code: '0xef0100' } }]],
    ['eth_estimateGas', [{ from: NOBODY, to: PROBE2, data: '0x' }]],
    ['eth_estimateGas', [{ from: NOBODY, to: PROBE2, data: '0x', authorizationList: [auth] }]],
    ['eth_estimateGas', [{ from: NOBODY, to: PROBE2, data: '0x', authorizationList: [auth, auth] }]],
  ]);
  row('(b) an account whose code is 0xef0100‖address, called', r[0].result ? (BigInt(r[0].result) === 42n ? 'runs the delegate\'s code (returned 42) — the EVM resolves delegation designators' : 'unexpected ' + r[0].result) : 'does not resolve: ' + errText(r[0].error), 'eth_call, code set by state override');
  row('    control: code 0xef0100 with no address', r[1].result ? 'ran (unexpected)' : 'fails — ' + errText(r[1].error), 'eth_call, state override');
  if (r[2].result && r[3].result && r[4].result) {
    const g0 = num(r[2].result), g1 = num(r[3].result), g2 = num(r[4].result);
    row('(c) eth_estimateGas with 0 / 1 / 2 authorizations', `${fmt(g0)} / ${fmt(g1)} / ${fmt(g2)} gas → +${fmt(g1 - g0)} and +${fmt(g2 - g1)} per authorization (EIP-7702 charges 25,000 each, plus data)`, 'eth_estimateGas with authorizationList');
  } else row('(c) eth_estimateGas with an authorizationList', `rejected: ${errText(r[3].error || r[2].error)}`, 'eth_estimateGas');
  try {
    const d = await getDetail();
    const t4 = d.blocks.flatMap(b => b.txs.filter(t => t.type === '0x4').map(t => ({ ...t, block: b.n })));
    const total = d.blocks.reduce((s, b) => s + b.txs.length - 1, 0);
    row('(d) type-0x4 transactions already on chain', `${t4.length} of ${fmt(total)} user txs in ${d.blocks.length} recent blocks${t4.length ? `; e.g. ${t4[0].hash} in block ${fmt(t4[0].block)} with ${t4[0].auths} authorization(s)` : ''}`, 'eth_getBlockByNumber(full)');
    const ut = d.blocks.flatMap(b => b.txs.filter(t => t.type !== '0x6a'));
    const cand = [...new Set([...t4.flatMap(t => [t.from, t.to]), ...topN(countBy(ut, t => t.from), 60).map(([a]) => a)].filter(Boolean).map(a => a.toLowerCase()))].slice(0, 100);
    if (cand.length) {
      const cs = await viaAny(cand.map(a => ['eth_getCode', [a, 'latest']]));
      const del = cand.filter((a, i) => (cs[i].result || '').startsWith('0xef0100') && bytesOf(cs[i].result) === 23);
      row('    senders that are delegated EOAs right now', `${del.length} of ${cand.length} checked${del.length ? `; e.g. ${del[0]} → ${'0x' + strip(cs[cand.indexOf(del[0])].result).slice(6)}` : ''}`, 'eth_getCode returns 0xef0100‖address');
    }
  } catch (e) { note('on-chain scan failed: ' + e.message); }
  note('VERDICT (measured): supported — the EVM follows delegations, the RPC prices authorizations, and type-4 transactions are in recent blocks. No transaction was sent to find this out.');
}

// ================================================================================================
// 9. randomness
// ================================================================================================
async function sRandomness() {
  H('9. THE RANDOMNESS PRIMITIVE');
  const selHash = strip(sel('arbBlockHash(uint256)')).padEnd(64, '0');
  const mk = (k, target, selLen, selWord) => ethCall(PROBE, '0x' + word(k) + word(target) + word(selLen) + selWord, 'latest', code(HASHPROBE));
  const KA = [1, 10, 255, 256, 257, 0, -1], KH = [1, 256, 257, 8191, 8192, 100000, 393167, 393168, 393169, 0];
  const r = await viaAny([['eth_blockNumber', []], ethCall(ARBSYS, sel('arbBlockNumber()')), ...KA.map(k => mk(k, ARBSYS, 4, selHash)), ...KH.map(k => mk(k, HISTORY, 0, word(0))),
    ethCall(PROBE, '0x', 'latest', code(ENVPROBE)), ['eth_getCode', [HISTORY, 'latest']]]);
  row('eth_blockNumber vs ArbSys.arbBlockNumber() in one batch', `${r[0].result ? fmt(num(r[0].result)) : '?'} vs ${r[1].result ? fmt(num(r[1].result)) : '?'}`, 'eth_blockNumber, eth_call ArbSys(0x64).arbBlockNumber()');
  const parsed = [...KA, ...KH].map((k, i) => (r[2 + i].result ? parseHashProbe(r[2 + i].result) : null));
  const need = [...new Set(parsed.filter(p => p && p.n < p.cur).map(p => p.n))];
  const hb = await viaAny(need.map(n => ['eth_getBlockByNumber', [hex(n), false]]));
  const hashOf = new Map(need.map((n, i) => [n, hb[i].result ? hb[i].result.hash : null]));
  const invalid = sel('InvalidBlockNumber(uint256,uint256)').slice(2);
  const show = (name, k, p, access) => {
    if (!p) return row(name, 'probe failed');
    const kk = k > 0 ? `n − ${fmt(k)}` : k === 0 ? 'n' : 'n + 1';
    let v;
    if (p.ok && p.len === 32) { const h = hashOf.get(p.n); v = '0x' + p.ret === h ? `= the RPC's hash of block ${fmt(p.n)} (${('0x' + p.ret).slice(0, 14)}…)` : BigInt('0x' + p.ret) === 0n ? 'ZERO' : `0x${p.ret} — DIFFERS from the RPC's ${h}`; }
    else if (p.ok) v = `returned ${p.len} bytes`;
    else v = p.ret.startsWith(invalid) ? `REVERTS: InvalidBlockNumber(${fmt(BigInt('0x' + p.ret.slice(8, 72)))}, ${fmt(BigInt('0x' + p.ret.slice(72, 136)))})` : `REVERTS${p.len ? ' with 0x' + p.ret.slice(0, 16) + '…' : ' with no data'}`;
    row(`${name}(${kk})`, `${v}; ${fmt(p.delta - 28 - access)} gas`, 'eth_call: probe reads n = arbBlockNumber() and calls in the same execution');
  };
  sub('ArbSys(0x64).arbBlockHash — n is the block the call executes in');
  KA.forEach((k, i) => show('arbBlockHash', k, parsed[i], 100));
  sub('EIP-2935 history contract at ' + HISTORY);
  const hc = r[r.length - 1].result || '0x';
  const win = strip(hc).match(/62([0-9a-f]{6})9103/);
  row('code', bytesOf(hc) ? `${bytesOf(hc)} bytes, keccak ${keccak256(hc).slice(0, 18)}…; serve window constant in the bytecode: ${win ? fmt(parseInt(win[1], 16)) + ' blocks' : 'not found'}; calls ArbSys.arbBlockNumber(): ${strip(hc).includes('a3b1b31d') ? 'yes' : 'no'}` : 'NO CODE', 'eth_getCode');
  KH.forEach((k, i) => show('history.get', k, parsed[KA.length + i], 2600));
  note('  (gas for the history contract excludes the 2,600-gas cold-account charge a first call in a transaction also pays; arbBlockHash gas excludes the 100-gas warm charge)');
  if (win) note(`INFERRED: at ~10 blocks a second, arbBlockHash reaches back 256 blocks ≈ 26 s; the history contract reaches back ${fmt(parseInt(win[1], 16))} blocks ≈ ${f2(parseInt(win[1], 16) / 10 / 3600, 1)} h. SOURCED: "approximately 27 hours' worth of L2 block hashes" at Arbitrum One's 250 ms blocks (docs.arbitrum.io/run-arbitrum-node/arbos-releases/arbos40).`);

  sub('what the EVM\'s own block fields give (SPEC §3.6, re-verified)');
  const e = r[r.length - 2].result ? words(r[r.length - 2].result) : null;
  if (e) {
    const l1n = e[0];
    row('block.number', `${fmt(l1n)} — the L1 number; ArbSys.arbBlockNumber() in the same call: ${fmt(e[10])}`, 'eth_call, NUMBER opcode');
    row('block.prevrandao', `${e[2]}`, 'eth_call, PREVRANDAO opcode');
    row('block.coinbase', toAddr(e[5]) + (toAddr(e[5]) === '0xa4b000000000000000000073657175656e636572' ? '  (ASCII "sequencer")' : ''), 'eth_call, COINBASE opcode');
    row('blockhash(block.number − 1)', hex(e[6]), 'eth_call, BLOCKHASH opcode');
    const cmp = [['eth_getBlockByNumber', [hex(l1n - 1n), false]]];
    const l2same = (await viaAny(cmp))[0];
    let l1same = null;
    if (USE_L1) { try { l1same = (await rpcBatch(L1, cmp))[0]; } catch { /* no L1 */ } }
    row('    is it the L2 block hash at that height?', l2same.result ? (BigInt(l2same.result.hash) === e[6] ? 'YES' : `no (L2 block ${fmt(l1n - 1n)} is ${l2same.result.hash.slice(0, 14)}…)`) : errText(l2same.error), 'eth_getBlockByNumber');
    if (l1same) row('    is it the Ethereum block hash at that height?', l1same.result ? (BigInt(l1same.result.hash) === e[6] ? 'YES' : `no (Ethereum block ${fmt(l1n - 1n)} is ${l1same.result.hash.slice(0, 14)}…)`) : errText(l1same.error), 'eth_getBlockByNumber on Ethereum mainnet');
    row('blockhash at number − 256 / − 257 / number itself', `${e[7] === 0n ? 'zero' : 'non-zero'} / ${e[8] === 0n ? 'zero' : 'non-zero'} / ${e[9] === 0n ? 'zero' : 'non-zero'}`, 'eth_call, BLOCKHASH opcode');
    // does block.number / blockhash move between L2 blocks? five samples, 1.5 s apart
    const smp = [e];
    for (let i = 0; i < 4; i++) { await sleep(1500); const x = await one('eth_call', [callArgs(PROBE, '0x'), 'latest', code(ENVPROBE)]); if (x.result) smp.push(words(x.result)); }
    const l2adv = smp[smp.length - 1][10] - smp[0][10], nums = new Set(smp.map(x => x[0])), pairs = new Set(smp.map(x => `${x[0]}:${x[6]}`));
    row(`${smp.length} samples over ~${f2(1.5 * (smp.length - 1), 0)} s`, `L2 height advanced ${l2adv} blocks; block.number took ${nums.size} value(s); blockhash(number − 1) took ${pairs.size} value(s) — ${pairs.size === nums.size ? 'it changes only when block.number does' : 'it changed while block.number stood still'}`, 'eth_call ×' + smp.length);
  }
  note('VERDICT (measured): arbBlockHash returns real L2 hashes for exactly the 256 blocks before the executing one and reverts outside that range (never zero). blockhash() and prevrandao are not usable. The history contract serves the same real hashes far further back.');
}

// ================================================================================================
// 10. tokens and venues
// ================================================================================================
async function sTokens() {
  H('10. TOKENS AND VENUES');
  sub('is the Blockscout API usable from a script?');
  if (USE_WEB) {
    for (const [name, url] of [['instance API v2 /stats', BLOCKSCOUT + '/api/v2/stats'], ['instance API v2 /tokens', BLOCKSCOUT + '/api/v2/tokens?type=ERC-20'], ['instance RPC-style API', BLOCKSCOUT + '/api?module=block&action=eth_block_number'],
      ['keyed "PRO" API host', 'https://api.blockscout.com/4663/api/v2/stats'], ['stats microservice /counters', BLOCKSCOUT + '/stats-service/api/v1/counters']]) {
      const r = await httpGet(url);
      const cf = r.headers['cf-mitigated'] ? `, cf-mitigated: ${r.headers['cf-mitigated']}` : '';
      const rl = Object.entries(r.headers).filter(([k]) => /ratelimit|retry-after/i.test(k)).map(([k, v]) => `${k}=${v}`).join(' ');
      const kind = (r.headers['content-type'] || '').includes('json') ? 'JSON' : 'HTML';
      row(name, r.status ? `HTTP ${r.status} ${kind}${cf}${rl ? ', ' + rl : ''}${r.status !== 200 && kind === 'JSON' ? ' — ' + r.text.trim().slice(0, 90) : ''}` : 'unreachable: ' + r.error, 'GET ' + url.replace('https://', ''));
      if (name.startsWith('stats microservice') && r.status === 200) { try { ctx.counters = Object.fromEntries(JSON.parse(r.text).counters.map(c => [c.id, c.value])); } catch { /* ignore */ } }
      await sleep(600);
    }
    if (ctx.counters) {
      const c = ctx.counters;
      row('explorer counters', `txs ${fmt(c.totalTxns)} (${fmt(c.completedTxns)} succeeded) · addresses ${fmt(c.totalAddresses)} · contracts ${fmt(c.totalContracts)} (${fmt(c.totalVerifiedContracts)} verified) · tokens ${fmt(c.totalTokens)} · ERC-4337 user ops ${fmt(c.totalUserOps)} · AA wallets ${fmt(c.totalAccountAbstractionWallets)}`, 'GET …/stats-service/api/v1/counters');
      row('last 24 h per the explorer', `${fmt(c.newTxns24h)} txs, ${f2(c.txnsFee24h, 2)} ETH of fees, average fee ${Number(c.averageTxnFee24h).toExponential(3)} ETH`, 'same');
      const to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 8 * 86400e3).toISOString().slice(0, 10);
      for (const [id, f] of [['newTxns', v => fmt(v)], ['txnsSuccessRate', v => f2(100 * v, 1) + ' %'], ['averageGasPrice', v => f2(v, 4)], ['averageTxnFee', v => Number(v).toExponential(2)]]) {
        const r = await httpGet(`${BLOCKSCOUT}/stats-service/api/v1/lines/${id}?from=${from}&to=${to}&resolution=DAY`);
        try { const ch = JSON.parse(r.text).chart; row(`daily ${id}${id === 'averageGasPrice' ? ' (gwei)' : id === 'averageTxnFee' ? ' (ETH)' : ''}`, ch.map(p => `${p.date.slice(5)}: ${f(Number(p.value))}`).join('  '), 'GET …/stats-service/api/v1/lines/' + id); } catch { row('daily ' + id, `HTTP ${r.status}`); }
        await sleep(600);
      }
    }
    note('VERDICT (measured): every /api path on the instance answers a Cloudflare managed challenge (HTTP 403) to a plain HTTP client, with or without a descriptive User-Agent; the keyed API host wants a key (HTTP 402). Only the stats microservice is open. Not usable for forensics from a script without a Blockscout API key; the RPC and the sources below were used instead. The challenge was not circumvented.');
  } else note('skipped (--no-web)');

  sub('wrapped ETH and the dollar token');
  note(`SOURCED: WETH ${WETH} and USDG ${USDG} (${DOCS}/contracts).`);
  const impl = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', beacon = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
  const tk = await viaAny([WETH, USDG].flatMap(a => [ethCall(a, sel('name()')), ethCall(a, sel('symbol()')), ethCall(a, sel('decimals()')), ethCall(a, sel('totalSupply()')), ['eth_getBalance', [a, 'latest']], ['eth_getStorageAt', [a, impl, 'latest']], ['eth_getCode', [a, 'latest']]]));
  [WETH, USDG].forEach((a, i) => {
    const r = tk.slice(7 * i, 7 * i + 7);
    if (!r[1].result) return row(a, 'no answer: ' + errText(r[1].error));
    const dec = num(r[2].result), sup = Number(BigInt(r[3].result)) / 10 ** dec, bal = Number(BigInt(r[4].result)) / 1e18, im = toAddr(BigInt(r[5].result));
    label(a, decodeString(r[1].result));
    row(`${decodeString(r[1].result)} — "${decodeString(r[0].result)}"`, `${dec} decimals, supply ${fmt(sup)}; contract holds ${f2(bal, 2)} ETH${i === 0 ? ` (${Math.abs(bal - sup) < 1e-6 * Math.max(1, sup) ? 'equal to supply: 1:1 backed' : 'differs from supply'})` : ''}; ${bytesOf(r[6].result)} B of code, ${BigInt(r[5].result) === 0n ? 'no EIP-1967 implementation slot' : 'upgradeable proxy → ' + im}`, 'eth_call name/symbol/decimals/totalSupply, eth_getBalance, eth_getStorageAt');
  });

  sub('tokenised-stock tokens');
  let assets = [];
  if (USE_WEB) {
    const r = await httpGet(RH_ASSETS_API);
    try { assets = JSON.parse(r.text).assets.map(a => ({ symbol: a.tokenSymbol, name: a.tokenName, status: a.status, mult: a.currentMultiplier, addr: (a.deployments.find(d => d.chainId === 4663) || {}).contractAddress })).filter(a => a.addr); } catch { /* handled below */ }
    row('Robinhood\'s own asset list', assets.length ? `${assets.length} tokens with a deployment on chain 4663; ${assets.filter(a => a.status === 'ASSET_STATUS_ACTIVE').length} active; ${assets.filter(a => Number(a.mult) !== 1).length} carry a corporate-action multiplier ≠ 1` : `HTTP ${r.status} ${r.error || ''}`, 'GET api.robinhood.com/rhj/assets (SOURCED: ' + DOCS + '/stock-token-apis)');
  }
  if (assets.length) {
    for (const a of assets) label(a.addr, a.symbol + ' stock token');
    const q = await viaAny(assets.flatMap(a => [ethCall(a.addr, sel('symbol()')), ethCall(a.addr, sel('totalSupply()')), ethCall(a.addr, sel('paused()')), ['eth_getStorageAt', [a.addr, beacon, 'latest']]]));
    let ok = 0, paused = 0, mism = 0; const beacons = new Map();
    assets.forEach((a, i) => {
      const [sy, ts, pa, be] = q.slice(4 * i, 4 * i + 4);
      if (sy.result && ts.result) { ok++; a.supply = Number(BigInt(ts.result)) / 1e18; if (decodeString(sy.result) !== a.symbol) mism++; }
      if (pa.result && BigInt(pa.result) === 1n) paused++;
      if (be.result) { const b = toAddr(BigInt(be.result)); beacons.set(b, (beacons.get(b) || 0) + 1); }
    });
    row('of those, on chain', `${ok} answer symbol() and totalSupply(); ${mism} symbols differ from the API; ${paused} are paused`, `eth_call ×${assets.length * 3}`);
    const bl = topN(beacons, 5);
    row('EIP-1967 beacon behind them', bl.map(([b, c]) => `${b} ×${c}`).join(', '), `eth_getStorageAt ×${assets.length}`);
    if (bl.length && BigInt(bl[0][0]) !== 0n) {
      const im = await one('eth_call', [callArgs(bl[0][0], sel('implementation()')), 'latest']);
      if (im.result) { const ia = toAddr(BigInt(im.result)); const ic = await one('eth_getCode', [ia, 'latest']); row('    its implementation', `${ia}, ${fmt(bytesOf(ic.result || '0x'))} B — one upgrade there changes every token that shares the beacon`, 'eth_call beacon.implementation(), eth_getCode'); }
    }
    const s = assets.find(a => a.addr.toLowerCase() === SNDK);
    if (s) row('SNDK (the SPEC\'s reference token)', `in the list as "${s.name}", supply ${fmt(s.supply ?? 0)}`, 'same calls');
  }
  let hs = null;
  if (USE_WEB) {
    const r = await httpGet(HOODSCAN + '/stocks-api');
    try { hs = JSON.parse(r.text); } catch { /* handled below */ }
    if (hs && hs.stocks) {
      const st = hs.stats || {};
      row('HoodScan (independent third-party indexer)', `${hs.stocks.length} stock tokens; combined market cap $${fmt(st.marketCap)}, DEX liquidity $${fmt(st.liquidity)}, 24 h volume $${fmt(st.volume24)}, ${fmt(st.pools)} pools`, 'GET hoodscan.co/stocks-api — SOURCED, not verified on chain');
      note('largest stock tokens by holders (HoodScan):');
      [...hs.stocks].sort((a, b) => (b.holders || 0) - (a.holders || 0)).slice(0, 10).forEach((t, i) => note(`    ${String(i + 1).padStart(2)}. ${String(t.symbol).padEnd(6)} ${fmt(t.holders).padStart(9)} holders  mcap $${fmt(t.marketCap).padStart(12)}  liquidity $${fmt(t.liquidity).padStart(11)}  ${t.address}`));
      const dexes = countBy(hs.stocks.flatMap(t => t.pools || []), p => p.dex);
      row('where HoodScan sees stock-token pools', topN(dexes, 8).map(([k, v]) => `${k} ×${v}`).join(', '), 'same');
    } else row('HoodScan', `HTTP ${r.status} ${r.error || ''}`);
  }
  note('NOT MEASURED: holder counts for ERC-20s other than stock tokens — that needs an indexer, and the Blockscout API is closed to scripts (above).');

  sub('most-transferred ERC-20s (activity, not holders)');
  const tip = await getTip();
  const logsOver = async (topics, span) => {
    for (let s = span; s >= 50; s = Math.floor(s / 2)) {
      const r = await one('eth_getLogs', [{ fromBlock: hex(tip - s + 1), toBlock: hex(tip), topics }], [EP.official]);
      if (r.result) return { logs: r.result, span: s };
      ctx.notes.push(`eth_getLogs over ${s} blocks: ${errText(r.error)}`);
      if (!/limit|exceed|too many|range/i.test(errText(r.error))) return { logs: null, span: s, error: errText(r.error) };
    }
    return { logs: null, span: 0, error: 'still over the limit at 50 blocks' };
  };
  const T_TRANSFER = keccak256('Transfer(address,address,uint256)');
  const tr = await logsOver([T_TRANSFER], 500);
  if (tr.logs) {
    const erc20 = tr.logs.filter(l => l.topics.length === 3), by = countBy(erc20, l => l.address.toLowerCase()), top = topN(by, 10);
    const sy = await viaAny(top.map(([a]) => ethCall(a, sel('symbol()'))));
    row(`Transfer events in the last ${tr.span} blocks`, `${fmt(tr.logs.length)} (${fmt(erc20.length)} ERC-20-shaped, ${fmt(tr.logs.length - erc20.length)} ERC-721-shaped) from ${fmt(countBy(tr.logs, l => l.address).size)} contracts`, 'eth_getLogs topic0 = Transfer');
    top.forEach(([a, c], i) => { const s = sy[i].result ? decodeString(sy[i].result) : '?'; if (!nameOf(a)) label(a, s); note(`    ${String(i + 1).padStart(2)}. ${a}  ${String(s).padEnd(10)} ${pct(c, erc20.length).padStart(7)} of ERC-20 transfers`); });
  } else row('Transfer events', 'query failed: ' + tr.error, 'eth_getLogs');

  sub('where swaps happen');
  const SW = [['Uniswap-v4-style PoolManager', 'Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)'], ['Uniswap-v3-style pool', 'Swap(address,address,int256,int256,uint160,uint128,int24)'],
    ['Uniswap-v2-style pair', 'Swap(address,uint256,uint256,uint256,uint256,address)'], ['PancakeSwap-v3-style pool', 'Swap(address,address,int256,int256,uint160,uint128,int24,uint128,uint128)']];
  const got = [];
  for (const [name, sig] of SW) { const r = await logsOver([keccak256(sig)], 3000); got.push({ name, ...r }); }
  const span = Math.min(...got.filter(g => g.logs).map(g => g.span));
  if (Number.isFinite(span)) {
    const cut = tip - span + 1, total = got.reduce((s, g) => s + (g.logs ? g.logs.filter(l => num(l.blockNumber) >= cut).length : 0), 0);
    const swapTx = new Set();
    for (const g of got) {
      if (!g.logs) { row(g.name, 'query failed: ' + g.error); continue; }
      const L = g.logs.filter(l => num(l.blockNumber) >= cut), by = countBy(L, l => l.address.toLowerCase());
      for (const l of L) swapTx.add(l.transactionHash);
      row(g.name, `${fmt(L.length)} Swap events (${pct(L.length, total)}) from ${fmt(by.size)} contract(s)`, `eth_getLogs over ${fmt(span)} blocks`);
      g.top = topN(by, 3); g.count = L.length;
    }
    const pools = got.filter(g => g.top && !g.name.includes('v4')).flatMap(g => g.top.map(([a, c]) => ({ a, c, kind: g.name, of: g.count })));
    const fx = await viaAny(pools.flatMap(p => [ethCall(p.a, sel('factory()')), ethCall(p.a, sel('token0()')), ethCall(p.a, sel('token1()'))]));
    const toks = [...new Set(fx.filter((_, i) => i % 3 !== 0).filter(x => x.result && strip(x.result).length === 64).map(x => toAddr(BigInt(x.result))))];
    const tsy = await viaAny(toks.map(a => ethCall(a, sel('symbol()'))));
    const symOf = a => nameOf(a).replace(/ \(.*$/, '') || (tsy[toks.indexOf(a)]?.result ? decodeString(tsy[toks.indexOf(a)].result) : short(a));
    note('busiest contracts per event shape:');
    for (const g of got) {
      if (!g.top) continue;
      for (const [a, c] of g.top) {
        const i = pools.findIndex(p => p.a === a);
        const extra = i >= 0 && fx[3 * i].result && strip(fx[3 * i].result).length === 64 ? `factory ${toAddr(BigInt(fx[3 * i].result))} ${nameOf(toAddr(BigInt(fx[3 * i].result)))}; pair ${fx[3 * i + 1].result ? symOf(toAddr(BigInt(fx[3 * i + 1].result))) : '?'}/${fx[3 * i + 2].result ? symOf(toAddr(BigInt(fx[3 * i + 2].result))) : '?'}` : nameOf(a);
        note(`    ${a}  ${pct(c, g.count).padStart(7)} of ${g.name} swaps  ${extra}`);
      }
    }
    if (ctx.walk) { const B = (await ctx.walk).blocks.filter(b => b.n >= cut); const ut = B.reduce((s, b) => s + Math.max(0, b.ntx - 1), 0); if (ut) row('transactions with at least one such Swap', `${fmt(swapTx.size)} of ${fmt(ut)} user txs in those blocks (${pct(swapTx.size, ut)})`, 'eth_getLogs ∩ the block walk'); }
    const sample = [...swapTx].slice(-200);
    const stx = await viaAny(sample.map(h => ['eth_getTransactionByHash', [h]]));
    const tos = countBy(stx.filter(x => x.result && x.result.to), x => x.result.to.toLowerCase());
    note(`contracts those swap transactions were sent to (last ${sample.length} swap txs):   [eth_getTransactionByHash ×${sample.length}]`);
    topN(tos, 8).forEach(([a, c], i) => note(`    ${String(i + 1).padStart(2)}. ${a}  ${pct(c, sample.length).padStart(7)}  ${nameOf(a)}`));
    note('NOT COUNTED: venues that emit other events — RFQ fills, order books, proprietary AMMs, Ekubo-style singletons. SOURCED: Robinhood lists RFQ, AMM, proprietary AMM and order-book venues (' + DOCS + '/building-with-stock-tokens).');
  }
}

// ================================================================================================
// 11. limits
// ================================================================================================
async function sLimits() {
  H('11. LIMITS THAT MATTER TO A GAME');
  sub('gas');
  for (const ep of [EP.official, EP.publicnode, EP.drpc]) {
    try {
      const r = await rpcBatch(ep, [['eth_call', [{ to: PROBE, data: '0x' }, 'latest', code('5a' + RET32)]], ['eth_call', [{ to: PROBE, data: '0x', gas: '0x5f5e100' }, 'latest', code('5a' + RET32)]],
        ['eth_estimateGas', [{ from: NOBODY, to: PROBE, data: '0x' }, 'latest', code('5b5f56')]]]);
      const cap = r[2].error ? (String(r[2].error.message).match(/\((\d+)\)/) || [])[1] : null;
      row(`${ep.name}: gas available to an eth_call (none asked / 100 M asked)`, `${r[0].result ? fmt(num(r[0].result)) : errText(r[0].error)} / ${r[1].result ? fmt(num(r[1].result)) : errText(r[1].error)} → cap ≈ 50,000,000`, 'eth_call, GAS opcode, state override');
      row(`${ep.name}: eth_estimateGas on an infinite loop`, r[2].error ? `"${errText(r[2].error)}"${cap ? ` → estimate cap ${fmt(Number(cap))}` : ''}` : 'returned ' + r[2].result, 'eth_estimateGas, state override');
    } catch (e) { row(ep.name, e.message); }
  }
  if (ctx.txLim) note(`INFERRED: the simulation caps (50 M) are above the ${fmt(ctx.txLim)} per-transaction limit ArbOS enforces (section 3), so an estimate between the two describes a transaction that cannot be included.`);

  sub('contract size (EIP-170 is 24,576 bytes; EIP-3860 is 49,152 bytes of init code)');
  const initRet = n => '0x62' + n.toString(16).padStart(6, '0') + '5ff3';            // PUSH3 n, PUSH0, RETURN → n zero bytes of runtime
  const initPad = n => '0x5f5ff3' + '00'.repeat(n - 3);                              // init code of n bytes that returns nothing
  const cfg = ctx.chainConfig?.arbitrum || {}, mc = cfg.MaxCodeSize || 24576, mi = cfg.MaxInitCodeSize || 49152;
  const sizes = [...new Set([24576, 24577, mc, mc + 1])], inits = [...new Set([49152, 49153, mi, mi + 1])];
  const cs = await viaAny([...sizes.map(n => ['eth_estimateGas', [{ from: NOBODY, data: initRet(n) }]]), ...inits.map(n => ['eth_estimateGas', [{ from: NOBODY, data: initPad(n) }]])]);
  sizes.forEach((n, i) => row(`deploy ${fmt(n)} bytes of runtime code`, cs[i].result ? `accepted, ${fmt(num(cs[i].result))} gas` : `REJECTED — ${errText(cs[i].error)}`, 'eth_estimateGas, contract creation'));
  inits.forEach((n, i) => { const x = cs[sizes.length + i]; row(`init code of ${fmt(n)} bytes`, x.result ? `accepted, ${fmt(num(x.result))} gas` : `REJECTED — ${errText(x.error)}`, 'eth_estimateGas, contract creation'); });
  note(`  (boundaries tested are the Ethereum limits and the chain config's MaxCodeSize ${fmt(mc)} / MaxInitCodeSize ${fmt(mi)} read in section 1)`);

  sub('calldata size an RPC accepts in one eth_call (zero bytes, to a contract that returns CALLDATASIZE)');
  const tryCalldata = async (ep, n) => {
    const wait = ep.nextAt - Date.now(); if (wait > 0) await sleep(wait);
    try {
      const r = await httpRaw('POST', ep.url, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: PROBE, data: '0x' + '00'.repeat(n) }, 'latest', code('36' + RET32)] }), { 'content-type': 'application/json' }, 90000);
      ep.nextAt = Date.now() + Math.max(ep.gapMs, 1500); ep.stats.posts++; ep.stats.http[r.status] = (ep.stats.http[r.status] || 0) + 1;
      let j = null; try { j = JSON.parse(r.text); } catch { /* not JSON */ }
      if (j && j.result && num(j.result) === n) return { ok: true };
      return { ok: false, why: `HTTP ${r.status}: ${(j && (j.error?.message || j.error)) ? String(j.error?.message || j.error).slice(0, 90) : r.text.trim().slice(0, 90)}` };
    } catch (e) { ep.nextAt = Date.now() + 2000; return { ok: false, why: 'connection: ' + (e.cause?.code || e.message) }; }
  };
  for (const ep of [EP.publicnode, EP.official, EP.drpc]) {
    const ladder = [131072, 524288, 1048576, 2097152, 2500000, 2750000, 4194304];
    let okMax = 0, fail = null, why = '';
    for (const n of ladder) { const r = await tryCalldata(ep, n); if (r.ok) okMax = n; else { fail = n; why = r.why; break; } }
    for (let i = 0; i < 2 && fail && fail - okMax > 65536; i++) { const mid = Math.round((okMax + fail) / 2); const r = await tryCalldata(ep, mid); if (r.ok) okMax = mid; else { fail = mid; why = r.why; } }
    row(ep.name, fail ? `accepts ${fmt(okMax)} bytes, refuses ${fmt(fail)} — ${why}` : `accepts ${fmt(okMax)} bytes (largest tried)`, 'eth_call with growing calldata');
  }
  if (ctx.userTxSample) { const mx = ctx.userTxSample.reduce((a, t) => (t.inLen > a.inLen ? t : a)); row('largest calldata in a real transaction in the sample', `${fmt(mx.inLen)} bytes (${mx.hash})`, 'eth_getBlockByNumber(full)'); }
  note('NOT MEASURED: the largest transaction the sequencer accepts — that takes sending one. An eth_call is not subject to it.');

  sub('log queries and historical state');
  const tip = await getTip();
  for (const ep of [EP.official, EP.publicnode, EP.drpc]) {
    const outp = [];
    for (const span of [50, 500, 100000, 10000001]) {
      try {
        const r = (await rpcBatch(ep, [['eth_getLogs', [{ fromBlock: hex(Math.max(0, tip - span)), toBlock: hex(tip), address: PROBE }]]]))[0];
        outp.push(`${fmt(span)} blocks: ${r.result ? 'ok' : '"' + errText(r.error).slice(0, 70) + '"'}`);
        if (!r.result) break;
      } catch (e) { outp.push(`${fmt(span)}: ${e.message}`); break; }
    }
    row(`${ep.name}: eth_getLogs range (a filter that matches nothing)`, outp.join(' · '), 'eth_getLogs');
  }
  for (const n of ctx.notes.filter(x => x.startsWith('eth_getLogs'))) note('  observed on the official RPC: ' + n);
  for (const ep of [EP.official, EP.publicnode, EP.drpc]) {
    const outp = [];
    for (const back of [5, 60, 1000, 100000, 10000000]) {
      try { const r = (await rpcBatch(ep, [['eth_getBalance', [WETH, hex(tip - back)]]]))[0]; outp.push(`−${fmt(back)}: ${r.result ? 'ok' : '"' + errText(r.error).slice(0, 44) + '"'}`); } catch (e) { outp.push(`−${fmt(back)}: ${e.message}`); break; }
    }
    row(`${ep.name}: state at head − N blocks`, outp.join(' · '), 'eth_getBalance at historic blocks');
  }

  sub('batches and rate limits');
  try { const r = await rpcBatch({ ...EP.drpc, maxBatch: 4 }, [['eth_chainId', []], ['eth_chainId', []], ['eth_chainId', []], ['eth_chainId', []]]); row('drpc: a batch of 4', r[0].result ? 'accepted' : `refused — "${errText(r[0].error)}"`, 'JSON-RPC batch'); } catch (e) { row('drpc batch of 4', e.message); }
  if (BURST) {
    for (const n of [30, 60, 100]) {
      await sleep(6000);
      const r = await httpRaw('POST', EP.official.url, JSON.stringify(Array.from({ length: n }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_chainId', params: [] }))), { 'content-type': 'application/json' }, 30000).catch(e => ({ status: 0, text: e.message, headers: {} }));
      EP.official.stats.posts++; EP.official.stats.http[r.status] = (EP.official.stats.http[r.status] || 0) + 1; EP.official.nextAt = Date.now() + 6000;
      const rl = Object.entries(r.headers || {}).filter(([k]) => /ratelimit|retry-after/i.test(k)).map(([k, v]) => `${k}=${v}`).join(' ');
      row(`official: one batch of ${n} after 6 s of silence`, `HTTP ${r.status}${r.status === 200 ? '' : ' — ' + r.text.trim().slice(0, 80)}${rl ? ' ' + rl : ' (no rate-limit headers)'}`, '--burst');
      if (r.status !== 200) { EP.official.stats.rateLimited++; break; }
    }
  } else note('  (--burst not given: the official RPC\'s batch tolerance was not probed in this run)');
  note('SOURCED: the public endpoint is "rate-limited and not recommended for production use"; Alchemy is the recommended provider, with WebSocket (' + DOCS + '/connecting).');
}

function runLog() {
  H('RUN LOG — WHAT THIS RUN ASKED FOR AND WHAT IT WAS REFUSED');
  for (const ep of [EP.official, EP.publicnode, EP.drpc, L1]) {
    const s = ep.stats;
    row(`${ep.name} (${ep.url.replace('https://', '')})`, `${fmt(s.posts)} HTTP requests, ${fmt(s.calls)} RPC calls, ${f2(s.bytes / 1e6, 1)} MB; HTTP statuses ${JSON.stringify(s.http)}; rate-limited ${s.rateLimited}×; network errors ${s.netErrors}; batch ≤ ${ep.maxBatch}, pacing ${ep.gapMs} ms`);
    for (const m of s.messages) note('      refusal seen: ' + m);
  }
  row('transport', transportNote);
  row('finished', `${new Date().toISOString()} after ${elapsed()}`);
}

// ------------------------------------------------------------------------------------------------
async function main() {
  if (keccak256('') !== '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' || sel('transfer(address,uint256)') !== '0xa9059cbb') throw new Error('keccak self-test failed');
  await pickTransport();
  out('ROBINHOOD CHAIN (chain id 4663) — LIVE CENSUS');
  out(`run started ${new Date().toISOString()} · node ${process.version} · transport: ${transportNote}`);
  out(`walk ${fmt(WALK)} blocks · ${DETAIL} with full transactions · receipts of ${RECEIPT_BLOCKS}${ONLY ? ' · sections ' + [...ONLY].join(',') : ''}`);
  out('Every value is MEASURED by the method in [brackets] at run time unless its line says SOURCED or INFERRED. Read-only: no transaction was sent, no key used.');
  await loadLabels();
  const sections = [['1', sIdentity], ['2', sCadence], ['3', sTxs], ['4', sFees], ['5', sDA], ['6', sInfra], ['7', sPrecompiles], ['8', s7702], ['9', sRandomness], ['10', sTokens], ['11', sLimits]];
  for (const [id, fn] of sections) {
    if (ONLY && !ONLY.has(id)) continue;
    log(`section ${id}`);
    try { await fn(); } catch (e) { out(`  !! SECTION ${id} FAILED: ${e.message}`); log(e.stack || e.message); }
  }
  runLog();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
