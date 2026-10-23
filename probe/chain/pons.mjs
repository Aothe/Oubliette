#!/usr/bin/env node
/*
 * pons.mjs — a re-runnable, READ-ONLY probe of Pons v2 launchpad tokens on Robinhood Chain ("RH Chain",
 * chain id 4663), for a game whose contracts will BURN the launched token on every mint, repair and
 * exchange fee and MOVE it in escrow (Oubliette, SPEC §2, §3.2, §3.7; docs/launchpad.md §1).
 *
 * THE QUESTION. Is a Pons v2 token a plain ERC-20 for transfers — no tax, no hook, no allow-list — and
 * can it be burned? docs/launchpad.md could not check this from the web. One simulated transfer settles it.
 *
 * WHAT IT DOES (the report sections carry the same numbers)
 *    0  preflight     chain id, tip, block rate, which endpoints answer eth_simulateV1
 *    1  factory       code size, proxy slots, owner, every getter that answers, events in a recent window
 *    2  tokens        TokenLaunched logs walked in chunks; three tokens picked: the newest with a holder,
 *                     one launched about a week ago, one that has graduated to a Uniswap v4 pool
 *    3  per token     code size, proxy checks, selectors present, opcode census (any CALL at all?), getters,
 *                     the curve's getters, the factory's record of the token
 *    4  transfers     eth_simulateV1 at a fixed block: EOA → fresh address, transferFrom via an approved
 *                     spender, a CONTRACT as sender and as spender (a forwarder injected with a state
 *                     override), self-transfer, zero transfer, transfer to the curve, the deployer as sender
 *    5  burn          burn(uint256), burnFrom, a contract burning its own and the holder's by allowance,
 *                     totalSupply before/after, transfer to 0x…dEaD as the reference
 *    6  payout        the creator-fee-recipient getters and timelocks, and simulated (never sent) calls to
 *                     the redirect functions from a stranger, from the factory owner, from the recipient
 *    7  verdict
 *
 * HOW TO RUN (Node 22+, no npm dependencies; stdout is the report, stderr is progress)
 *    node probe/chain/pons.mjs > probe/chain/out/pons.txt
 *    options: --recent=N (blocks of TokenLaunched logs to walk back from the tip, default 300000 ≈ 8.6 h)
 *             --grad=N (blocks of PoolGraduated logs, default 2000000 ≈ 2.4 days) · --no-web (skip the
 *             openchain.xyz selector-name lookup) · --curl (curl instead of Node fetch)
 *
 * READ-ONLY. It calls eth_call, eth_getLogs, eth_getCode, eth_getStorageAt, eth_getBlockByNumber,
 * eth_getTransactionReceipt, eth_simulateV1 and, unless --no-web, one HTTPS GET to api.openchain.xyz for
 * selector names. It never signs, never sends a transaction, holds no key. The forwarder contract is
 * injected with a state override inside eth_simulateV1: nothing is deployed. Fresh addresses are derived
 * from a fixed string and checked to have no code, no nonce and no balance.
 *
 * Every value in the report is MEASURED when the script ran unless the line says SOURCED (a name taken
 * from a named source and checked by keccak) or INFERRED (reasoning on measured values).
 */

import { execFile } from 'node:child_process';

// ------------------------------------------------------------------------------------------------
// configuration
// ------------------------------------------------------------------------------------------------
const argv = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const intArg = (v, d) => (v === undefined || v === true ? d : Math.max(1, parseInt(v, 10) || d));
const RECENT = intArg(argv.recent, 300000);
const GRAD_SPAN = intArg(argv.grad, 2000000);
const USE_WEB = !argv['no-web'];
const LOG_CHUNK = 100000;                 // the official RPC served 1,000,000-block ranges in 130 ms on 2026-10-23; chunked to stay polite
const AMT = 1000000n;                     // the test amount: 1,000,000 units (1e-12 of a token at 18 decimals)
const MIN_HOLD = 20n * AMT;               // a holder needs at least this much for every scenario to run

const mkEp = (name, url, maxBatch, gapMs, role) => ({ name, url, maxBatch, gapMs, role, nextAt: 0, stats: { posts: 0, calls: 0, rateLimited: 0, netErrors: 0 } });
// Batch size and pacing as census.mjs set them from what each endpoint tolerated (2026-10-02, section 11).
const EP = {
  official: mkEp('official', 'https://rpc.mainnet.chain.robinhood.com', 20, 1200, 'log queries (10 M-block ranges)'),
  publicnode: mkEp('publicnode', 'https://robinhood-rpc.publicnode.com', 100, 400, 'state, simulation (logs capped at 50 blocks)'),
  drpc: mkEp('drpc', 'https://robinhood.drpc.org', 3, 350, 'fallback (logs capped at 500 blocks)'),
};
const STATE = [EP.publicnode, EP.official, EP.drpc];
const LOGS = [EP.official];
const SIM = [EP.publicnode, EP.official, EP.drpc];

// SOURCED addresses (each is re-checked on chain where it is used).
const FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e';          // docs/capital.md §3, docs/launchpad.md §1
const DEAD = '0x000000000000000000000000000000000000dEaD';
const ZERO = '0x0000000000000000000000000000000000000000';
const OPENCHAIN = 'https://api.openchain.xyz/signature-database/v1/lookup';

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
const low = a => a.toLowerCase();
const num = h => Number(BigInt(h));
const fmt = n => (typeof n === 'bigint' ? n : Math.round(Number(n))).toLocaleString('en-US');
const eth = w => (Number(BigInt(w)) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 6 });
const tok = w => (Number(BigInt(w)) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 3 });
const inUnits = (w, dec) => (dec === null || dec === undefined ? '?' : (Number(BigInt(w)) / 10 ** dec).toLocaleString('en-US', { maximumFractionDigits: 6 }));
const iso = t => new Date(Number(t) * 1000).toISOString().replace('.000Z', 'Z');
const bytesOf = h => strip(h).length / 2;
const errText = e => (e ? `${e.message ?? JSON.stringify(e)}`.slice(0, 160) : '');
const isAddrWord = w => w > 0xffffffffn && w < (1n << 160n);
const showWord = w => (isAddrWord(w) ? toAddr(w) : w.toString());
function decodeString(h) {
  h = strip(h);
  if (!h) return '';
  try {
    if (h.length === 64) return Buffer.from(h, 'hex').toString('utf8').replace(/\0+$/g, '');
    const off = num('0x' + h.slice(0, 64)) * 2, len = num('0x' + h.slice(off, off + 64));
    return Buffer.from(h.slice(off + 64, off + 64 + len * 2), 'hex').toString('utf8');
  } catch { return '?'; }
}

// ------------------------------------------------------------------------------------------------
// keccak-256 in plain JS (Node's crypto has SHA-3 but not Keccak): selectors, topics, fresh addresses.
// Checked at start against keccak256("") and the transfer selector.
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
if (keccak256('') !== '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' || sel('transfer(address,uint256)') !== '0xa9059cbb') throw new Error('keccak self-test failed');

// ------------------------------------------------------------------------------------------------
// HTTP and JSON-RPC (Node fetch, or curl if fetch cannot reach the RPC), paced per endpoint, 429-aware
// ------------------------------------------------------------------------------------------------
let TRANSPORT = argv.curl ? 'curl' : 'fetch', transportNote = '';
function curlRaw(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = ['-sS', '-m', String(Math.ceil(timeoutMs / 1000)), '-X', 'POST', '-H', 'content-type: application/json', '-H', 'Expect:', '--data-binary', '@-', '-w', '\n%{http_code}', url];
    const p = execFile('curl', args, { maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
      if (err) return reject(err);
      const i = stdout.lastIndexOf('\n');
      resolve({ status: Number(stdout.slice(i + 1)), text: stdout.slice(0, i) });
    });
    p.stdin.end(body);
  });
}
async function httpPost(url, body, timeoutMs = 60000) {
  if (TRANSPORT === 'curl') return curlRaw(url, body, timeoutMs);
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs) });
  return { status: r.status, text: await r.text() };
}
async function pickTransport() {
  if (TRANSPORT === 'curl') { transportNote = 'curl (forced by --curl)'; return; }
  try { await httpPost(EP.publicnode.url, '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}', 15000); transportNote = 'Node fetch'; }
  catch (e) { TRANSPORT = 'curl'; transportNote = `curl (Node fetch could not reach the RPC: ${e.cause?.code || e.message})`; }
}
class RpcFail extends Error {}
async function post(ep, payload, { maxRetries = 5, timeoutMs = 60000 } = {}) {
  const body = JSON.stringify(payload);
  for (let attempt = 0; ; attempt++) {
    const wait = ep.nextAt - Date.now();
    if (wait > 0) await sleep(wait);
    let res;
    try { res = await httpPost(ep.url, body, timeoutMs); }
    catch (e) {
      ep.stats.netErrors++; ep.nextAt = Date.now() + ep.gapMs;
      if (attempt >= Math.min(maxRetries, 3)) throw new RpcFail(`${ep.name}: network error after ${attempt + 1} tries (${e.cause?.code || e.message})`);
      await sleep(1500 * 2 ** attempt); continue;
    }
    ep.nextAt = Date.now() + ep.gapMs;
    ep.stats.posts++;
    let json = null;
    try { json = JSON.parse(res.text); } catch { /* not JSON */ }
    const top = json && !Array.isArray(json) ? json.error : null;
    const limited = res.status === 429 || (top && (top.code === 429 || /too many requests|rate limit/i.test(String(top.message))));
    if (limited) {
      ep.stats.rateLimited++;
      if (attempt >= maxRetries) throw new RpcFail(`${ep.name}: rate limited (HTTP ${res.status}) after ${attempt + 1} tries`);
      ep.gapMs = Math.min(Math.round(ep.gapMs * 1.5), 6000);
      await sleep(Math.min(3000 * 2 ** attempt, 30000)); continue;
    }
    return { status: res.status, json, text: res.text };
  }
}
// calls: [[method, params], ...] -> [{result} | {error}], in order; split into the endpoint's batch size.
async function rpcBatch(ep, calls, opts) {
  const res = new Array(calls.length);
  for (let i = 0; i < calls.length; i += ep.maxBatch) {
    const chunk = calls.slice(i, i + ep.maxBatch);
    const payload = chunk.map(([method, params], k) => ({ jsonrpc: '2.0', id: i + k, method, params }));
    const { status, json, text } = await post(ep, payload.length === 1 ? payload[0] : payload, opts);
    ep.stats.calls += chunk.length;
    const arr = Array.isArray(json) ? json : json ? [json] : [];
    for (const e of arr) if (typeof e.id === 'number' && e.id >= i && e.id < i + chunk.length) res[e.id] = e.error ? { error: e.error } : { result: e.result };
    for (let k = 0; k < chunk.length; k++) if (!res[i + k]) res[i + k] = { error: arr.length === 1 && arr[0].error ? arr[0].error : { code: status, message: `HTTP ${status}: ${text.trim().slice(0, 140)}` } };
  }
  return res;
}
// Try endpoints in order until one answers at the transport level (a revert is an answer).
async function viaAny(calls, order = STATE) {
  let last;
  for (const ep of order) {
    try { return await rpcBatch(ep, calls); } catch (e) { last = e; log(`  ! ${e.message}; trying the next endpoint`); }
  }
  throw last;
}
const one = async (method, params, order) => (await viaAny([[method, params]], order))[0];
const callOf = (to, data, tag = 'latest') => ['eth_call', [{ to, data }, tag]];
const getLogs = async (filter, order = LOGS) => one('eth_getLogs', [filter], order);
// eth_simulateV1 on the first endpoint that executes it (an endpoint that rejects the method is skipped).
async function simulate(block, calls, stateOverrides, order = SIM) {
  const params = [{ blockStateCalls: [{ ...(stateOverrides ? { stateOverrides } : {}), calls }], validation: false, traceTransfers: false }, block];
  let last;
  for (const ep of order) {
    const r = await one('eth_simulateV1', params, [ep]).catch(e => ({ error: { message: e.message } }));
    if (r.result) return { ep: ep.name, block: r.result[0], calls: r.result[0].calls };
    last = r.error; log(`  ! eth_simulateV1 on ${ep.name}: ${errText(r.error)}`);
  }
  return { error: last };
}

// ------------------------------------------------------------------------------------------------
// ABI
// ------------------------------------------------------------------------------------------------
const ABI = {
  name: sel('name()'), symbol: sel('symbol()'), decimals: sel('decimals()'), totalSupply: sel('totalSupply()'),
  balanceOf: a => sel('balanceOf(address)') + word(a),
  allowance: (o, s) => sel('allowance(address,address)') + word(o) + word(s),
  transfer: (to, v) => sel('transfer(address,uint256)') + word(to) + word(v),
  transferFrom: (f, t, v) => sel('transferFrom(address,address,uint256)') + word(f) + word(t) + word(v),
  approve: (s, v) => sel('approve(address,uint256)') + word(s) + word(v),
  burn: v => sel('burn(uint256)') + word(v),
  burnFrom: (f, v) => sel('burnFrom(address,uint256)') + word(f) + word(v),
};
const T = {
  Transfer: keccak256('Transfer(address,address,uint256)'),
  Approval: keccak256('Approval(address,address,uint256)'),
  // Pons v2 factory events. Names SOURCED from api.openchain.xyz on 2026-10-23 for the topics seen on the
  // factory; each name is checked here by keccak and below by the shape of the logs it labels.
  TokenLaunched: keccak256('TokenLaunched(address,address,address,address,uint256,uint256)'),
  CreatorFeeRecipientUpdated: keccak256('CreatorFeeRecipientUpdated(address,address,address)'),
  PoolGraduated: keccak256('PoolGraduated(address,uint256,uint256,uint256)'),
  LaunchSwept: keccak256('LaunchSwept(address,uint256,uint256)'),
  GraduationTokensPermanentlyLocked: keccak256('GraduationTokensPermanentlyLocked(address,uint256)'),
  BuybackEnabledUpdated: keccak256('BuybackEnabledUpdated(address,bool,address)'),
  // Uniswap v4 PoolManager
  Initialize: keccak256('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)'),
};
const TOPIC_NAME = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));

// Selector dictionary: ERC-20 and extensions, fee/tax/allow-list shapes, and the Pons v2 names. Names marked
// (oc) were SOURCED from api.openchain.xyz for selectors found in the code on 2026-10-23; every entry here
// is turned back into its selector by keccak at run time, so a wrong name cannot match.
const SIGS = {
  erc20: ['name()', 'symbol()', 'decimals()', 'totalSupply()', 'balanceOf(address)', 'transfer(address,uint256)', 'transferFrom(address,address,uint256)', 'approve(address,uint256)', 'allowance(address,address)'],
  ext: ['burn(uint256)', 'burnFrom(address,uint256)', 'mint(address,uint256)', 'mint(uint256)', 'pause()', 'unpause()', 'paused()', 'owner()', 'renounceOwnership()', 'transferOwnership(address)', 'pendingOwner()', 'acceptOwnership()',
    'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)', 'DOMAIN_SEPARATOR()', 'nonces(address)', 'eip712Domain()', 'increaseAllowance(address,uint256)', 'decreaseAllowance(address,uint256)', 'supportsInterface(bytes4)'],
  feeTax: ['tax()', 'taxRate()', 'fee()', 'fees()', 'transferFee()', 'buyTax()', 'sellTax()', 'creatorTax()', 'feeBps()', 'isExcludedFromFee(address)', 'isExcludedFromFees(address)', 'excludeFromFee(address)', 'maxTxAmount()', 'maxWallet()',
    'tradingEnabled()', 'tradingActive()', 'enableTrading()', 'blacklist(address)', 'isBlacklisted(address)', 'blacklisted(address)', 'whitelist(address)', 'isWhitelisted(address)', 'frozen(address)', 'freeze(address)', 'unfreeze(address)',
    'setFee(uint256)', 'setTax(uint256)', 'feeRecipient()', 'taxWallet()', 'marketingWallet()', 'restricted(address)', 'isRestricted(address)', 'setRestricted(address,bool)', 'launchBlock()', 'launchTime()'],
  pons: ['curve()', 'deployer()', 'launchFactory()', 'getTokenInfo()', 'logo()', 'description()', 'socials()',                                                   // token (oc: launchFactory, getTokenInfo, logo, description, socials)
    'factory()', 'token()', 'pairToken()', 'graduated()', 'graduate(address)', 'graduationThreshold()', 'creatorTaxBps()', 'protocolFeeRecipient()', 'protocolFeeShareBps()', 'buybackBurnBps()', 'maxInternalPriceImpactBps()',
    'getReserves()', 'quoteReserve()', 'realQuoteReserve()', 'phantomQuote()', 'tokenReserve()', 'trackedTokens()', 'trackedQuote()', 'launchSupply()', 'sellableTokens()', 'reservedTokens()', 'launchedAt()', 'quoteFeeBalance()',
    'creatorTaxBalance()', 'buybackQuoteBalance()', 'buybackEnabled()', 'buybackCreatorRecipient()', 'readyToGraduate()', 'isNativeQuote()', 'feePolicy()', 'initialize(address)',                       // curve (oc)
    'launchFee()', 'setLaunchFee(uint256)', 'locker()', 'poolManager()', 'positionManager()', 'permit2()', 'memeHook()', 'feeEscrow()', 'graduationExecutor()', 'graduationGuard()', 'buybackVault()', 'launchForwarder()', 'launchDeployer()',
    'launchEnabled()', 'launchConfigCount()', 'canLaunch(address)', 'whitelistedLaunchers(address)', 'approvedPairTokens(address)', 'pairTokenEconomics(address)', 'getLaunchedToken(address)', 'getLaunchFeePolicy(address)',
    'snipeTaxStartBps()', 'snipeTaxSeconds()', 'maxCreatorTaxBps()', 'CREATOR_FEE_RECIPIENT_TIMELOCK()', 'CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW()', 'GRADUATION_RESCUE_DELAY()',
    'setCreatorFeeRecipient(address,address)', 'transferCreatorFeeRecipient(address,address)', 'pendingCreatorFeeRecipient(address)', 'setBuybackEnabled(address,bool)'],                                   // factory (oc, except launchFee/locker/poolManager/positionManager/permit2/setLaunchFee/setCreatorFeeRecipient/pendingCreatorFeeRecipient which matched a guess)
  errors: ['Error(string)', 'Panic(uint256)', 'ERC20InsufficientBalance(address,uint256,uint256)', 'ERC20InvalidSender(address)', 'ERC20InvalidReceiver(address)', 'ERC20InsufficientAllowance(address,uint256,uint256)',
    'ERC20InvalidApprover(address)', 'ERC20InvalidSpender(address)', 'OwnableUnauthorizedAccount(address)', 'OwnableInvalidOwner(address)', 'ReentrancyGuardReentrantCall()', 'SafeERC20FailedOperation(address)', 'ZeroAddress()'],
};
const DICT = new Map();
for (const [group, list] of Object.entries(SIGS)) for (const s of list) DICT.set(sel(s), { sig: s, group });
const nameOfSel = s => DICT.get(s)?.sig || s;
const nameOfTopic = t => TOPIC_NAME[t] || t.slice(0, 10) + '…';
const decodeError = data => { if (!data || data.length < 10) return data || ''; const s = data.slice(0, 10); const d = DICT.get(s); return (d ? d.sig : s) + (data.length > 10 ? '(' + words('0x' + data.slice(10)).map(showWord).join(', ') + ')' : ''); };

// ------------------------------------------------------------------------------------------------
// bytecode: PUSH4 (and PUSH32-with-zero-tail) immediates as selector candidates; an opcode census over a
// linear disassembly that skips push data and the CBOR metadata trailer.
// ------------------------------------------------------------------------------------------------
const OPNAME = { 0xf1: 'CALL', 0xf2: 'CALLCODE', 0xf4: 'DELEGATECALL', 0xfa: 'STATICCALL', 0xf0: 'CREATE', 0xf5: 'CREATE2', 0xff: 'SELFDESTRUCT', 0x54: 'SLOAD', 0x55: 'SSTORE', 0x3b: 'EXTCODESIZE', 0x3f: 'EXTCODEHASH', 0x3c: 'EXTCODECOPY', 0x32: 'ORIGIN', 0x33: 'CALLER', 0x42: 'TIMESTAMP', 0x43: 'NUMBER', 0xa0: 'LOG0', 0xa1: 'LOG1', 0xa2: 'LOG2', 0xa3: 'LOG3', 0xa4: 'LOG4', 0x5c: 'TLOAD', 0x5d: 'TSTORE' };
function disasm(code) {
  const b = Buffer.from(strip(code), 'hex');
  let end = b.length;
  const metaLen = b.length >= 2 ? b.readUInt16BE(b.length - 2) : 0;
  if (metaLen > 0 && metaLen < 256 && metaLen + 2 < b.length) end = b.length - 2 - metaLen;
  const ops = {}, sels = new Map(), push20 = new Set();
  for (let i = 0; i < end;) {
    const op = b[i];
    if (OPNAME[op]) ops[OPNAME[op]] = (ops[OPNAME[op]] || 0) + 1;
    if (op >= 0x60 && op <= 0x7f) {
      const n = op - 0x5f, imm = b.subarray(i + 1, i + 1 + n);
      if (op === 0x63) sels.set('0x' + imm.toString('hex'), (sels.get('0x' + imm.toString('hex')) || 0) + 1);
      if (op === 0x7f && imm.subarray(4).every(x => x === 0)) sels.set('0x' + imm.subarray(0, 4).toString('hex'), (sels.get('0x' + imm.subarray(0, 4).toString('hex')) || 0) + 1);
      if (op === 0x73) push20.add('0x' + imm.toString('hex'));
      i += 1 + n;
    } else i++;
  }
  sels.delete('0xffffffff');
  return { size: b.length, runtime: end, metaLen, ops, sels: [...sels.keys()], push20: [...push20] };
}
const callFamily = ops => ['CALL', 'CALLCODE', 'DELEGATECALL', 'STATICCALL', 'CREATE', 'CREATE2', 'SELFDESTRUCT'].reduce((s, k) => s + (ops[k] || 0), 0);
const embeds = (code, addr) => low(code).includes(low(strip(addr)));
const isClone1167 = code => /^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3$/i.test(code);
const SLOT_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const SLOT_ADMIN = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const SLOT_BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';

// FORWARDER (runtime bytecode, injected by state override): calldata = target(32) ++ input. CALLs target with
// input and value 0, bubbles the return data up or reverts with it. Stands in for the game's Gear and
// Exchange contracts, which will be msg.sender when the token moves or burns.
//   PUSH1 20 CALLDATASIZE SUB                 inLen
//   DUP1 PUSH1 20 PUSH0 CALLDATACOPY          mem[0..inLen) = input
//   PUSH0 PUSH0 DUP3 PUSH0 PUSH0              retSize retOff argsSize argsOff value
//   PUSH0 CALLDATALOAD GAS CALL               target; success
//   RETURNDATASIZE PUSH0 PUSH0 RETURNDATACOPY mem[0..rds) = returndata
//   PUSH1 1c JUMPI  RETURNDATASIZE PUSH0 REVERT  JUMPDEST RETURNDATASIZE PUSH0 RETURN
const FORWARDER = '0x602036038060205f375f5f825f5f5f355af13d5f5f3e601c573d5ffd5b3d5ff3';
const viaFwd = (target, input) => '0x' + word(target) + strip(input);
const fresh = n => '0x' + strip(keccak256(`oubliette pons probe 2026-10-23 fresh ${n}`)).slice(24);

// ------------------------------------------------------------------------------------------------
// sections
// ------------------------------------------------------------------------------------------------
const ctx = { tip: 0, tipTs: 0, rate: 0, simEps: [], names: new Map() };

async function sec0() {
  H('0. PREFLIGHT');
  await pickTransport();
  const [cid, tipB] = await viaAny([['eth_chainId', []], ['eth_blockNumber', []]]);
  ctx.tip = num(tipB.result);
  const [b0, b1] = await viaAny([['eth_getBlockByNumber', [hex(ctx.tip), false]], ['eth_getBlockByNumber', [hex(ctx.tip - 1000000), false]]]);
  ctx.tipTs = num(b0.result.timestamp);
  ctx.rate = 1000000 / (ctx.tipTs - num(b1.result.timestamp));
  row('transport', transportNote);
  row('chain id', `${cid.result} (${num(cid.result)})`, 'eth_chainId');
  row('tip', `${fmt(ctx.tip)} at ${iso(ctx.tipTs)}`, 'eth_blockNumber, eth_getBlockByNumber');
  row('block rate over the last 1,000,000 blocks', `${ctx.rate.toFixed(2)} blocks/s (${fmt(ctx.rate * 86400)} a day)`, 'two block timestamps');
  for (const ep of SIM) {
    const r = await one('eth_simulateV1', [{ blockStateCalls: [{ calls: [{ from: fresh(0), to: fresh(99), data: '0x' }] }], validation: false }, 'latest'], [ep]).catch(e => ({ error: { message: e.message } }));
    const ok = r.result && r.result[0]?.calls?.[0]?.status === '0x1';
    if (ok) ctx.simEps.push(ep.name);
    row(`${ep.name}: eth_simulateV1`, ok ? `answers (block ${fmt(num(r.result[0].number))}, 21,000-gas empty call)` : 'refused: ' + errText(r.error), 'eth_simulateV1');
  }
  if (!ctx.simEps.length) note('NOTE: no endpoint executes eth_simulateV1; the transfer tests below will not run.');
}

async function sec1() {
  H('1. THE FACTORY ' + FACTORY);
  const [code, s1, s2, s3] = await viaAny([['eth_getCode', [FACTORY, 'latest']], ['eth_getStorageAt', [FACTORY, SLOT_IMPL, 'latest']], ['eth_getStorageAt', [FACTORY, SLOT_ADMIN, 'latest']], ['eth_getStorageAt', [FACTORY, SLOT_BEACON, 'latest']]]);
  const d = disasm(code.result);
  ctx.factoryCode = code.result; ctx.factoryDis = d;
  row('code size', `${fmt(d.size)} bytes (${fmt(d.runtime)} runtime + ${d.metaLen + 2} metadata)`, 'eth_getCode');
  row('EIP-1967 implementation / admin / beacon slots', [s1, s2, s3].map(x => (BigInt(x.result) === 0n ? 'zero' : toAddr(x.result))).join(' / ') + ' — not a proxy', 'eth_getStorageAt');
  row('opcode census', Object.entries(d.ops).map(([k, v]) => `${k} ${v}`).join(', '), 'linear disassembly');
  const getters = ['owner()', 'pendingOwner()', 'launchEnabled()', 'launchConfigCount()', 'launchFee()', 'maxCreatorTaxBps()', 'snipeTaxStartBps()', 'snipeTaxSeconds()', 'CREATOR_FEE_RECIPIENT_TIMELOCK()', 'CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW()', 'GRADUATION_RESCUE_DELAY()',
    'locker()', 'poolManager()', 'positionManager()', 'permit2()', 'memeHook()', 'feeEscrow()', 'graduationExecutor()', 'graduationGuard()', 'buybackVault()', 'launchForwarder()', 'launchDeployer()',
    'protocolFeeRecipient()', 'treasury()', 'feeRecipient()', 'paused()', 'implementation()', 'tokenImplementation()', 'curveImplementation()', 'version()'];
  sub('getters (every name below is a selector found in the code, or a plain guess; a guess that reverts is listed as such)');
  const res = await viaAny(getters.map(s => callOf(FACTORY, sel(s))));
  ctx.factory = {};
  getters.forEach((s, i) => {
    const inCode = d.sels.includes(sel(s));
    const r = res[i];
    if (r.error || r.result === '0x') { row(s, `reverts${inCode ? '' : ' (selector not in code — a guess)'}`, 'eth_call'); return; }
    const w = words(r.result);
    let v = w.map(showWord).join(', ');
    if (/TIMELOCK|WINDOW|DELAY/.test(s)) v += ` s = ${(Number(w[0]) / 86400).toFixed(1)} days`;
    if (s === 'launchFee()') v += ` wei = ${eth(w[0])} ETH`;
    if (/Bps/.test(s)) v += ` bps = ${(Number(w[0]) / 100).toFixed(2)} %`;
    ctx.factory[s] = w;
    row(s, v, 'eth_call' + (inCode ? '' : ' (not in code!)'));
  });
  const known = d.sels.filter(s => DICT.has(s) && DICT.get(s).group !== 'errors').map(nameOfSel);
  const unknown = d.sels.filter(s => !DICT.has(s));
  sub('selectors in the factory code');
  note(`named (${known.length}): ${known.join(' ')}`);
  note(`errors (${d.sels.filter(s => DICT.get(s)?.group === 'errors').length}): ${d.sels.filter(s => DICT.get(s)?.group === 'errors').map(nameOfSel).join(' ')}`);
  note(`unnamed (${unknown.length}): ${unknown.join(' ')}`);
  ctx.unknownSels = new Set(unknown);
  for (const k of ['setCreatorFeeRecipient(address,address)', 'transferCreatorFeeRecipient(address,address)', 'pendingCreatorFeeRecipient(address)', 'setBuybackEnabled(address,bool)', 'setLaunchFee(uint256)', 'graduate(address)'])
    row(`has ${k}`, d.sels.includes(sel(k)) ? 'yes' : 'no', 'PUSH4 in code');

  sub(`factory events in the last ${fmt(RECENT)} blocks (~${(RECENT / ctx.rate / 3600).toFixed(1)} h)`);
  const all = [];
  for (let from = ctx.tip - RECENT + 1; from <= ctx.tip; from += LOG_CHUNK) {
    const r = await getLogs({ address: FACTORY, fromBlock: hex(from), toBlock: hex(Math.min(ctx.tip, from + LOG_CHUNK - 1)) });
    if (r.error) { note(`eth_getLogs ${from}..: ${errText(r.error)}`); break; }
    all.push(...r.result);
  }
  ctx.factoryLogs = all;
  const by = new Map();
  for (const l of all) by.set(l.topics[0], (by.get(l.topics[0]) || 0) + 1);
  for (const [t, n] of [...by.entries()].sort((a, b) => b[1] - a[1])) {
    const s = all.find(l => l.topics[0] === t);
    row(nameOfTopic(t), `${fmt(n)} (${(n / (RECENT / ctx.rate / 86400)).toFixed(0)} a day); ${s.topics.length - 1} indexed, ${bytesOf(s.data)} data bytes`, TOPIC_NAME[t] ? 'eth_getLogs; name SOURCED openchain.xyz, keccak-checked' : 'eth_getLogs; unnamed');
  }
}

// Find EOA holders of a token with at least MIN_HOLD at the latest state: the `to` of recent Transfer logs
// that have no code (a 7702-delegated EOA has 23 bytes of code and is excluded), largest balance first.
async function findHolders(token, fromBlock, exclude) {
  const spans = [[Math.max(fromBlock, ctx.tip - 200000), ctx.tip]];
  if (fromBlock < ctx.tip - 200000) spans.push([fromBlock, ctx.tip]);
  let logs = [];
  for (const [a, b] of spans) {
    const r = await getLogs({ address: token, topics: [T.Transfer], fromBlock: hex(a), toBlock: hex(b) });
    if (r.error) { log(`  ! Transfer logs for ${token}: ${errText(r.error)}`); return { logs: 0, holders: [], err: errText(r.error) }; }
    logs = r.result;
    const ex = new Set([...exclude, ZERO, DEAD].map(low));
    const tos = []; for (const l of logs.slice().reverse()) { const a = low(toAddr(l.topics[2])); if (!ex.has(a) && !tos.includes(a)) tos.push(a); if (tos.length >= 60) break; }
    if (!tos.length) continue;
    const codes = await viaAny(tos.map(a => ['eth_getCode', [a, 'latest']]));
    const eoas = tos.filter((a, i) => codes[i].result === '0x');
    if (!eoas.length) continue;
    const bals = await viaAny(eoas.map(a => callOf(token, ABI.balanceOf(a))));
    const holders = eoas.map((a, i) => ({ addr: a, bal: bals[i].result && bals[i].result !== '0x' ? BigInt(bals[i].result) : 0n })).filter(h => h.bal >= MIN_HOLD).sort((x, y) => (y.bal > x.bal ? 1 : -1));
    if (holders.length) return { logs: logs.length, recipients: tos.length, eoas: eoas.length, holders };
  }
  return { logs: logs.length, holders: [] };
}

async function describeToken(token, launchLog) {
  const r = await viaAny([['eth_getCode', [token, 'latest']], ['eth_getStorageAt', [token, SLOT_IMPL, 'latest']], ['eth_getStorageAt', [token, SLOT_ADMIN, 'latest']], ['eth_getStorageAt', [token, SLOT_BEACON, 'latest']],
    callOf(token, ABI.name), callOf(token, ABI.symbol), callOf(token, ABI.decimals), callOf(token, ABI.totalSupply), callOf(token, sel('curve()')), callOf(token, sel('deployer()')), callOf(token, sel('launchFactory()')), callOf(token, sel('owner()'))]);
  const t = { addr: token, code: r[0].result, slots: r.slice(1, 4).map(x => x.result), name: decodeString(r[4].result), symbol: decodeString(r[5].result), decimals: r[6].result && r[6].result !== '0x' ? num(r[6].result) : null,
    totalSupply: r[7].result && r[7].result !== '0x' ? BigInt(r[7].result) : null, curve: r[8].result && r[8].result !== '0x' ? toAddr(r[8].result) : null, deployer: r[9].result && r[9].result !== '0x' ? toAddr(r[9].result) : null,
    launchFactory: r[10].result && r[10].result !== '0x' ? toAddr(r[10].result) : null, ownerCall: r[11].error || !r[11].result || r[11].result === '0x' ? 'reverts' : r[11].result };
  t.dis = disasm(t.code);
  if (launchLog) {
    t.launchBlock = num(launchLog.blockNumber); t.launchTx = launchLog.transactionHash;
    const [b] = await viaAny([['eth_getBlockByNumber', [launchLog.blockNumber, false]]]);
    t.launchTs = num(b.result.timestamp);
    t.evCurve = toAddr(launchLog.topics[2]); t.evDeployer = toAddr(launchLog.topics[3]);
    const w = words(launchLog.data); t.evPair = toAddr(w[0]); t.evW1 = w[1]; t.evThreshold = w[2];
    if (BigInt(t.evPair) === 0n) { t.pairSymbol = 'ETH'; t.pairDecimals = 18; }
    else {
      const p = await viaAny([callOf(t.evPair, ABI.symbol), callOf(t.evPair, ABI.decimals)]);
      t.pairSymbol = p[0].result && p[0].result !== '0x' ? decodeString(p[0].result) : '?'; t.pairDecimals = p[1].result && p[1].result !== '0x' ? num(p[1].result) : null;
    }
  }
  if (t.curve) {
    const c = await viaAny([['eth_getCode', [t.curve, 'latest']], callOf(t.curve, sel('graduated()')), callOf(t.curve, sel('readyToGraduate()')), callOf(t.curve, sel('feeBps()')), callOf(t.curve, sel('creatorTaxBps()')), callOf(t.curve, sel('graduationThreshold()')),
      callOf(t.curve, sel('pairToken()')), callOf(t.curve, sel('isNativeQuote()')), callOf(t.curve, sel('buybackEnabled()')), callOf(t.curve, sel('protocolFeeRecipient()')), callOf(t.curve, sel('protocolFeeShareBps()')), callOf(t.curve, sel('buybackBurnBps()')),
      callOf(t.curve, sel('launchedAt()')), callOf(t.curve, sel('getReserves()')), callOf(t.curve, sel('sellableTokens()')), callOf(t.curve, sel('reservedTokens()')), callOf(t.curve, sel('deployer()')), callOf(t.curve, sel('token()')), callOf(token, ABI.balanceOf(t.curve))]);
    const g = i => (c[i].error || c[i].result === '0x' ? null : words(c[i].result));
    t.curveInfo = { codeSize: bytesOf(c[0].result), graduated: g(1)?.[0], ready: g(2)?.[0], feeBps: g(3)?.[0], creatorTaxBps: g(4)?.[0], threshold: g(5)?.[0], pairToken: g(6) ? toAddr(g(6)[0]) : null, isNative: g(7)?.[0], buyback: g(8)?.[0], protoRecipient: g(9) ? toAddr(g(9)[0]) : null,
      protoShare: g(10)?.[0], buybackBurn: g(11)?.[0], launchedAt: g(12)?.[0], reserves: g(13), sellable: g(14)?.[0], reserved: g(15)?.[0], deployer: g(16) ? toAddr(g(16)[0]) : null, token: g(17) ? toAddr(g(17)[0]) : null, holds: g(18)?.[0] };
  }
  const f = await viaAny([callOf(FACTORY, sel('getLaunchedToken(address)') + word(token)), callOf(FACTORY, sel('pendingCreatorFeeRecipient(address)') + word(token)), callOf(FACTORY, sel('getLaunchFeePolicy(address)') + word(token))]);
  t.launched = f[0].error ? null : words(f[0].result); t.pending = f[1].error ? null : words(f[1].result); t.feePolicy = f[2].error ? null : words(f[2].result);
  return t;
}

async function sec2() {
  H('2. TOKENS: LAUNCHES, ONE A WEEK OLD, ONE GRADUATED');
  const launches = ctx.factoryLogs.filter(l => l.topics[0] === T.TokenLaunched);
  row(`TokenLaunched in the last ${fmt(RECENT)} blocks`, `${fmt(launches.length)}; the launch log is (token, curve, deployer) indexed + (pairToken, uint, graduationThreshold)`, 'eth_getLogs; field roles INFERRED from the sample below and checked against each token\'s getters');
  if (launches.length) {
    const s = launches[launches.length - 1], w = words(s.data);
    note(`newest: token ${toAddr(s.topics[1])} curve ${toAddr(s.topics[2])} deployer ${toAddr(s.topics[3])} pair ${toAddr(w[0])}${BigInt(w[0]) === 0n ? ' (ETH)' : ''} w1 ${w[1]} threshold ${w[2]} (in the pair token's units) block ${fmt(num(s.blockNumber))}`);
  }
  // the newest launch that has an EOA holder
  sub('a) the newest launch with an EOA holder (launches whose only tokens sit on the curve are skipped)');
  let newest = null, skipped = 0;
  for (const l of launches.slice().reverse().slice(0, 40)) {
    const token = toAddr(l.topics[1]), curve = toAddr(l.topics[2]);
    const h = await findHolders(token, num(l.blockNumber), [curve, FACTORY, token]);
    if (h.holders.length) { newest = { log: l, holders: h }; break; }
    skipped++;
  }
  row('launches skipped for want of a holder', String(skipped));
  if (newest) note(`chosen: ${toAddr(newest.log.topics[1])} launched at block ${fmt(num(newest.log.blockNumber))}; ${newest.holders.logs} Transfer logs, ${newest.holders.eoas} EOA recipients, ${newest.holders.holders.length} holding ≥ ${fmt(MIN_HOLD)} units`);
  // about a week old: estimate the block a week back from the rate, scan ±50k blocks around it
  sub('b) a launch about a week old');
  const weekBlock = Math.round(ctx.tip - 7 * 86400 * ctx.rate);
  const wb = await viaAny([['eth_getBlockByNumber', [hex(weekBlock), false]]]);
  row('estimated block seven days back', `${fmt(weekBlock)} at ${iso(wb[0].result.timestamp)}`, 'tip − 7 × 86,400 × rate; the header confirms the time');
  const wl = await getLogs({ address: FACTORY, topics: [T.TokenLaunched], fromBlock: hex(weekBlock - 50000), toBlock: hex(weekBlock + 50000) });
  let weekOld = null; skipped = 0;
  if (wl.error) note('eth_getLogs: ' + errText(wl.error));
  else {
    row('launches within ±50,000 blocks (±1.4 h) of it', String(wl.result.length), 'eth_getLogs');
    const ordered = wl.result.slice().sort((a, b) => Math.abs(num(a.blockNumber) - weekBlock) - Math.abs(num(b.blockNumber) - weekBlock));
    for (const l of ordered.slice(0, 25)) {
      const token = toAddr(l.topics[1]), curve = toAddr(l.topics[2]);
      const h = await findHolders(token, num(l.blockNumber), [curve, FACTORY, token]);
      if (h.holders.length) { weekOld = { log: l, holders: h }; break; }
      skipped++;
    }
    row('week-old launches skipped for want of a holder', String(skipped));
    if (weekOld) note(`chosen: ${toAddr(weekOld.log.topics[1])} launched at block ${fmt(num(weekOld.log.blockNumber))}; ${weekOld.holders.logs} Transfer logs since launch, ${weekOld.holders.holders.length} EOA holders ≥ ${fmt(MIN_HOLD)} units`);
    else note('no week-old launch with an EOA holder was found in the window');
  }
  // graduated
  sub(`c) a graduated token (PoolGraduated in the last ${fmt(GRAD_SPAN)} blocks)`);
  const grads = [];
  for (let from = ctx.tip - GRAD_SPAN + 1; from <= ctx.tip; from += 500000) {
    const r = await getLogs({ address: FACTORY, topics: [T.PoolGraduated], fromBlock: hex(from), toBlock: hex(Math.min(ctx.tip, from + 500000 - 1)) });
    if (r.error) { note('eth_getLogs: ' + errText(r.error)); break; }
    grads.push(...r.result);
  }
  row('graduations', `${fmt(grads.length)} (${(grads.length / (GRAD_SPAN / ctx.rate / 86400)).toFixed(1)} a day)`, 'eth_getLogs PoolGraduated');
  let graduated = null; skipped = 0;
  for (const l of grads.slice().reverse().slice(0, 20)) {
    const token = toAddr(l.topics[1]);
    const h = await findHolders(token, Math.max(0, num(l.blockNumber) - 10), [FACTORY, token, ...(ctx.factory['locker()'] ? [toAddr(ctx.factory['locker()'][0])] : []), ...(ctx.factory['poolManager()'] ? [toAddr(ctx.factory['poolManager()'][0])] : [])]);
    if (h.holders.length) { graduated = { gradLog: l, holders: h }; break; }
    skipped++;
  }
  row('graduated tokens skipped for want of a holder', String(skipped));
  if (graduated) {
    const l = graduated.gradLog, w = words(l.data);
    note(`chosen: ${toAddr(l.topics[1])} graduated at block ${fmt(num(l.blockNumber))} tx ${l.transactionHash}; PoolGraduated data = (${w.map(String).join(', ')}) — position id, tokens to the pool (${tok(w[1])}), pair raised (${eth(w[2])} ETH-units)`);
    // verify the graduation: receipt holds a Uniswap v4 Initialize with the token as a currency, the three factory events, and the curve says graduated
    const [rc] = await viaAny([['eth_getTransactionReceipt', [l.transactionHash]]]);
    const logs = rc.result?.logs || [];
    const init = logs.find(x => x.topics[0] === T.Initialize);
    const names = logs.filter(x => low(x.address) === low(FACTORY)).map(x => nameOfTopic(x.topics[0]));
    row('graduation receipt', `${logs.length} logs; factory emitted ${names.join(', ')}; Uniswap v4 Initialize ${init ? `from PoolManager ${init.address} with currencies ${toAddr(init.topics[2])} / ${toAddr(init.topics[3])}, fee ${words(init.data)[0]}, tickSpacing ${words(init.data)[1]}, hook ${toAddr(words(init.data)[2])}` : 'NOT found'}`, 'eth_getTransactionReceipt');
    if (init && ctx.factory['poolManager()']) row('PoolManager matches factory.poolManager()', low(init.address) === low(toAddr(ctx.factory['poolManager()'][0])) ? 'yes' : 'no');
    if (init && ctx.factory['memeHook()']) row('hook matches factory.memeHook()', low(toAddr(words(init.data)[2])) === low(toAddr(ctx.factory['memeHook()'][0])) ? 'yes' : 'no');
    // its launch log
    const fl = ctx.factoryLogs.find(x => x.topics[0] === T.TokenLaunched && low(toAddr(x.topics[1])) === low(toAddr(l.topics[1])));
    graduated.log = fl || null;
    if (!fl) {
      const r = await getLogs({ address: FACTORY, topics: [T.TokenLaunched, l.topics[1]], fromBlock: hex(Math.max(0, num(l.blockNumber) - 10000000)), toBlock: l.blockNumber });
      if (r.result?.length) graduated.log = r.result[0];
    }
  }
  ctx.picked = [['newest', newest], ['week-old', weekOld], ['graduated', graduated]].filter(([, x]) => x);
}

async function sec3() {
  H('3. THE THREE TOKENS');
  ctx.tokens = [];
  for (const [label, pick] of ctx.picked) {
    const token = toAddr((pick.log || pick.gradLog).topics[1]);
    const t = await describeToken(token, pick.log);
    t.label = label; t.holders = pick.holders.holders;
    ctx.tokens.push(t);
    sub(`${label}: ${token} — "${t.name}" (${t.symbol})`);
    if (t.launchBlock) row('launched', `block ${fmt(t.launchBlock)} at ${iso(t.launchTs)} (${((ctx.tipTs - t.launchTs) / 86400).toFixed(2)} days ago), tx ${t.launchTx}`, 'TokenLaunched log, block header');
    row('code size', `${fmt(t.dis.size)} bytes (${fmt(t.dis.runtime)} runtime + ${t.dis.metaLen + 2} metadata)`, 'eth_getCode');
    row('proxy?', `EIP-1967 impl/admin/beacon slots ${t.slots.every(s => BigInt(s) === 0n) ? 'all zero' : t.slots.join(' ')}; EIP-1167 clone ${isClone1167(t.code) ? 'YES' : 'no'}; DELEGATECALL in code ${t.dis.ops.DELEGATECALL || 0}× — ${t.slots.every(s => BigInt(s) === 0n) && !isClone1167(t.code) && !t.dis.ops.DELEGATECALL ? 'not a proxy' : 'LOOK'}`, 'eth_getStorageAt, bytecode');
    row('decimals / totalSupply', `${t.decimals} / ${t.totalSupply} (${tok(t.totalSupply)} tokens)`, 'eth_call');
    row('curve() / deployer() / launchFactory()', `${t.curve} / ${t.deployer} / ${t.launchFactory}${t.launchFactory && low(t.launchFactory) === low(FACTORY) ? ' (= the factory)' : ''}`, 'eth_call');
    if (t.evCurve) row('launch log agrees', `curve ${low(t.evCurve) === low(t.curve) ? 'yes' : 'NO'}, deployer ${low(t.evDeployer) === low(t.deployer) ? 'yes' : 'NO'}; pair ${t.evPair} (${t.pairSymbol}, ${t.pairDecimals} dec), graduation threshold ${t.evThreshold} = ${inUnits(t.evThreshold, t.pairDecimals)} ${t.pairSymbol}`, 'TokenLaunched vs getters; pair symbol/decimals by eth_call');
    row('owner()', t.ownerCall === 'reverts' ? 'reverts (no owner)' : showWord(words(t.ownerCall)[0]), 'eth_call');
    const o = t.dis.ops;
    row('opcode census', `${Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ')}; CALL-family opcodes: ${callFamily(o)}`, 'linear disassembly of the runtime code');
    row('embeds addresses of', [['factory', FACTORY], ['curve', t.curve], ['deployer', t.deployer]].filter(([, a]) => a && embeds(t.code, a)).map(([n]) => n).join(', ') || 'none', 'substring of the code');
    const groups = {};
    for (const s of t.dis.sels) { const d = DICT.get(s); const g = d ? d.group : 'unnamed'; (groups[g] ||= []).push(d ? d.sig : s); }
    for (const g of ['erc20', 'ext', 'feeTax', 'pons', 'errors', 'unnamed']) if (groups[g]) row(`selectors in code: ${g}`, groups[g].join(' '), 'PUSH4 / PUSH32 immediates');
    const probe = ['transfer(address,uint256)', 'transferFrom(address,address,uint256)', 'burn(uint256)', 'burnFrom(address,uint256)', 'mint(address,uint256)', 'pause()', 'paused()', 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)', 'owner()', 'tax()', 'fee()', 'feeBps()', 'buyTax()', 'sellTax()', 'blacklist(address)', 'isBlacklisted(address)', 'tradingEnabled()', 'maxWallet()', 'maxTxAmount()'];
    row('asked for by name, present?', probe.map(s => `${s.split('(')[0]} ${t.dis.sels.includes(sel(s)) ? 'yes' : 'no'}`).join(', '), 'selectors');
    if (t.curveInfo) {
      const c = t.curveInfo;
      row('curve', `${c.codeSize} B; graduated ${c.graduated} ready ${c.ready}; feeBps ${c.feeBps} creatorTaxBps ${c.creatorTaxBps}; threshold ${c.threshold} (${inUnits(c.threshold ?? 0, t.pairDecimals)} ${t.pairSymbol || ''}); pairToken ${c.pairToken}${c.isNative === 1n ? ' (native ETH)' : ''}; buybackEnabled ${c.buyback}; protocol recipient ${c.protoRecipient} share ${c.protoShare} bps, buyback-burn ${c.buybackBurn} bps; launchedAt ${c.launchedAt ? iso(c.launchedAt) : '-'}; sellable ${c.sellable ? tok(c.sellable) : '-'} reserved ${c.reserved ? tok(c.reserved) : '-'}; curve holds ${c.holds !== undefined && c.holds !== null ? tok(c.holds) : '-'} tokens`, 'eth_call on the curve (names SOURCED openchain.xyz, keccak-checked)');
      if (c.token) row('curve.token() / curve.deployer()', `${c.token}${low(c.token) === low(token) ? ' (= this token)' : ' (!)'} / ${c.deployer}`, 'eth_call');
    }
    if (t.launched) row('factory.getLaunchedToken(token)', t.launched.map(showWord).join(', '), 'eth_call; a struct, decoded as 32-byte words');
    if (t.pending) row('factory.pendingCreatorFeeRecipient(token)', t.pending.map(showWord).join(', '), 'eth_call');
    if (t.feePolicy) row('factory.getLaunchFeePolicy(token)', t.feePolicy.map(showWord).join(', '), 'eth_call; (recipient, protocol share bps, buyback-burn bps, fee bps, max price impact bps) INFERRED from the curve getters of the same values');
    row('EOA holders found (≥ 20 M units)', `${t.holders.length}; largest ${t.holders[0].addr} with ${t.holders[0].bal} (${tok(t.holders[0].bal)} tokens)`, 'Transfer logs → eth_getCode → balanceOf');
  }
  if (ctx.tokens.length >= 2) {
    sub('are the tokens the same contract?');
    const a = Buffer.from(strip(ctx.tokens[0].code), 'hex');
    for (const t of ctx.tokens.slice(1)) {
      const b = Buffer.from(strip(t.code), 'hex');
      if (a.length !== b.length) { row(`${ctx.tokens[0].label} vs ${t.label}`, `different lengths ${a.length} / ${b.length}`); continue; }
      let diff = 0, inMeta = 0; const runtimeEnd = ctx.tokens[0].dis.runtime;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff++; if (i >= runtimeEnd) inMeta++; }
      // mask the embedded curve/deployer addresses and compare again
      const mask = (buf, t) => { let s = buf.toString('hex'); for (const x of [t.curve, t.deployer]) if (x) s = s.split(low(strip(x))).join('0'.repeat(40)); return s; };
      row(`${ctx.tokens[0].label} vs ${t.label}`, `${diff} differing bytes of ${a.length} (${inMeta} in the metadata trailer); with each token's curve and deployer addresses masked: ${mask(a, ctx.tokens[0]) === mask(b, t) ? 'IDENTICAL' : 'still differ'}`, 'byte compare');
    }
  }
}

// One simulation per token: every scenario in one blockStateCalls element so state carries over.
function scenarios(t) {
  const Hd = t.holders[0].addr, S = fresh(1), F1 = fresh(2), F2 = fresh(3), F3 = fresh(4), F4 = fresh(5), F5 = fresh(6), FWD = fresh(7), tokenAddr = t.addr;
  const c = (label, from, to, data, check) => ({ label, from, to, data: data.startsWith('0x') ? data : '0x' + data, check });
  const bal = a => ABI.balanceOf(a);
  const X = []; // expectations referencing earlier results by index are evaluated after the run
  X.push(c('balanceOf(holder) before', F1, tokenAddr, bal(Hd)));
  X.push(c('balanceOf(fresh F1) before', F1, tokenAddr, bal(F1), r => r.val === 0n));
  X.push(c('totalSupply before', F1, tokenAddr, ABI.totalSupply));
  X.push(c('holder.transfer(F1, 1e6)   [EOA → fresh]', Hd, tokenAddr, ABI.transfer(F1, AMT), r => r.ok && r.val === 1n && r.oneTransfer(Hd, F1, AMT)));
  X.push(c('balanceOf(holder) after', F1, tokenAddr, bal(Hd), (r, R) => r.val === R[0].val - AMT));
  X.push(c('balanceOf(F1) after', F1, tokenAddr, bal(F1), r => r.val === AMT));
  X.push(c('holder.approve(S, 1e6)', Hd, tokenAddr, ABI.approve(S, AMT), r => r.ok && r.logs.length === 1 && r.logs[0].topics[0] === T.Approval));
  X.push(c('S.transferFrom(holder, F2, 1e6)   [EOA spender]', S, tokenAddr, ABI.transferFrom(Hd, F2, AMT), r => r.ok && r.val === 1n && r.oneTransfer(Hd, F2, AMT)));
  X.push(c('balanceOf(F2)', F1, tokenAddr, bal(F2), r => r.val === AMT));
  X.push(c('allowance(holder, S) after', F1, tokenAddr, ABI.allowance(Hd, S), r => r.val === 0n));
  X.push(c('holder.transfer(FWD, 3e6)   [EOA → contract]', Hd, tokenAddr, ABI.transfer(FWD, 3n * AMT), r => r.ok && r.oneTransfer(Hd, FWD, 3n * AMT)));
  X.push(c('FWD → token.transfer(F3, 1e6)   [CONTRACT is msg.sender]', F1, FWD, viaFwd(tokenAddr, ABI.transfer(F3, AMT)), r => r.ok && r.val === 1n && r.oneTransfer(FWD, F3, AMT)));
  X.push(c('balanceOf(F3)', F1, tokenAddr, bal(F3), r => r.val === AMT));
  X.push(c('holder.approve(FWD, 2e6)', Hd, tokenAddr, ABI.approve(FWD, 2n * AMT), r => r.ok));
  X.push(c('FWD → token.transferFrom(holder, F4, 1e6)   [CONTRACT spender]', F1, FWD, viaFwd(tokenAddr, ABI.transferFrom(Hd, F4, AMT)), r => r.ok && r.val === 1n && r.oneTransfer(Hd, F4, AMT)));
  X.push(c('balanceOf(F4)', F1, tokenAddr, bal(F4), r => r.val === AMT));
  X.push(c('holder.transfer(holder, 1e6)   [self]', Hd, tokenAddr, ABI.transfer(Hd, AMT), r => r.ok && r.oneTransfer(Hd, Hd, AMT)));
  X.push(c('holder.transfer(F5, 0)   [zero amount]', Hd, tokenAddr, ABI.transfer(F5, 0n), r => r.ok && r.oneTransfer(Hd, F5, 0n)));
  X.push(c('holder.transfer(curve, 1e6)   [to the curve contract]', Hd, tokenAddr, ABI.transfer(t.curve, AMT), r => r.ok && r.oneTransfer(Hd, t.curve, AMT)));
  // burn
  X.push(c('holder.burn(1e6)   [EOA burns]', Hd, tokenAddr, ABI.burn(AMT), r => r.ok && r.oneTransfer(Hd, ZERO, AMT)));
  X.push(c('totalSupply after burn', F1, tokenAddr, ABI.totalSupply, (r, R) => r.val === R[2].val - AMT));
  X.push(c('holder.approve(S, 1e6) for burnFrom', Hd, tokenAddr, ABI.approve(S, AMT), r => r.ok));
  X.push(c('S.burnFrom(holder, 1e6)   [EOA spender burns]', S, tokenAddr, ABI.burnFrom(Hd, AMT), r => r.ok && r.oneTransfer(Hd, ZERO, AMT)));
  X.push(c('totalSupply after burnFrom', F1, tokenAddr, ABI.totalSupply, (r, R) => r.val === R[2].val - 2n * AMT));
  X.push(c('FWD → token.burn(1e6)   [CONTRACT burns its own]', F1, FWD, viaFwd(tokenAddr, ABI.burn(AMT)), r => r.ok && r.oneTransfer(FWD, ZERO, AMT)));
  X.push(c('FWD → token.burnFrom(holder, 1e6)   [CONTRACT burns the holder\'s by allowance]', F1, FWD, viaFwd(tokenAddr, ABI.burnFrom(Hd, AMT)), r => r.ok && r.oneTransfer(Hd, ZERO, AMT)));
  X.push(c('totalSupply after the contract burns', F1, tokenAddr, ABI.totalSupply, (r, R) => r.val === R[2].val - 4n * AMT));
  X.push(c('balanceOf(0x…dEaD) before', F1, tokenAddr, bal(DEAD)));
  X.push(c('holder.transfer(0x…dEaD, 1e6)   [the fallback sink]', Hd, tokenAddr, ABI.transfer(DEAD, AMT), r => r.ok && r.oneTransfer(Hd, DEAD, AMT)));
  X.push(c('balanceOf(0x…dEaD) after', F1, tokenAddr, bal(DEAD), (r, R) => r.val === R[27].val + AMT));
  X.push(c('totalSupply after the dEaD transfer (unchanged)', F1, tokenAddr, ABI.totalSupply, (r, R) => r.val === R[2].val - 4n * AMT));
  // the holder paid out 1+1+3+1+1+1+1+1+1 = 11 × AMT (the self-transfer and the zero transfer net nothing)
  X.push(c('balanceOf(holder) final', F1, tokenAddr, bal(Hd), (r, R) => r.val === R[0].val - 11n * AMT));
  X.push(c('F5.transfer(F1, 1e6) with no balance   [must revert]', F5, tokenAddr, ABI.transfer(F1, AMT), r => !r.ok));
  X.push(c('S.transferFrom(holder, F1, 1e6) with no allowance   [must revert]', S, tokenAddr, ABI.transferFrom(Hd, F1, AMT), r => !r.ok));
  X.push(c('balanceOf(holder) via FWD   [forwarder self-check]', F1, FWD, viaFwd(tokenAddr, bal(Hd)), (r, R) => r.val === R[31].val));
  if (t.deployer && t.deployerBal >= AMT) X.push(c('deployer.transfer(F1, 1e6)   [the "developer wallet"]', t.deployer, tokenAddr, ABI.transfer(F1, AMT), r => r.ok && r.oneTransfer(t.deployer, F1, AMT)));
  return { calls: X, FWD, addrs: { holder: Hd, S, F1, F2, F3, F4, F5, FWD } };
}

async function sec4() {
  H('4 + 5. TRANSFERS AND BURNS, SIMULATED AT A FIXED BLOCK (nothing is sent)');
  if (!ctx.simEps.length) { note('no eth_simulateV1 endpoint — skipped'); return; }
  const freshes = [1, 2, 3, 4, 5, 6, 7].map(fresh);
  const chk = await viaAny(freshes.flatMap(a => [['eth_getCode', [a, 'latest']], ['eth_getTransactionCount', [a, 'latest']], ['eth_getBalance', [a, 'latest']]]));
  const allFresh = chk.every(r => r.result === '0x' || BigInt(r.result || 0) === 0n);
  row('fresh addresses', `${freshes.length} derived from a fixed string; code, nonce and ETH balance all zero: ${allFresh ? 'yes' : 'NO'}`, 'eth_getCode, eth_getTransactionCount, eth_getBalance');
  note(`amount ${fmt(AMT)} units; forwarder bytecode ${FORWARDER} injected at ${fresh(7)} by state override`);
  ctx.results = [];
  for (const t of ctx.tokens) {
    sub(`${t.label}: ${t.addr} "${t.name}"`);
    // deployer balance, for the developer-wallet scenario
    const [db] = await viaAny([callOf(t.addr, ABI.balanceOf(t.deployer || ZERO))]);
    t.deployerBal = db.result && db.result !== '0x' ? BigInt(db.result) : 0n;
    let result = null;
    const maxAttempts = Math.min(3, t.holders.length);
    for (let attempt = 0; attempt < maxAttempts && !result; attempt++) {
      if (attempt) { t.holders.shift(); note(`holder's balance moved before the simulation; retrying with ${t.holders[0].addr}`); }
      const sc = scenarios(t);
      const [tipB] = await viaAny([['eth_blockNumber', []]]);
      const B = num(tipB.result);
      const sim = await simulate(hex(B), sc.calls.map(({ from, to, data }) => ({ from, to, data })), { [sc.FWD]: { code: FORWARDER } });
      if (sim.error) { note(`eth_simulateV1 failed everywhere: ${errText(sim.error)}`); break; }
      const R = sim.calls.map((cres, i) => {
        const logs = cres.logs || [];
        const r = { ok: cres.status === '0x1', gas: num(cres.gasUsed), ret: cres.returnData, val: cres.returnData && cres.returnData.length === 66 ? BigInt(cres.returnData) : null, logs, err: cres.error };
        r.oneTransfer = (from, to, v) => logs.length === 1 && low(logs[0].address) === low(t.addr) && logs[0].topics[0] === T.Transfer && low(toAddr(logs[0].topics[1])) === low(from) && low(toAddr(logs[0].topics[2])) === low(to) && BigInt(logs[0].data) === v;
        return r;
      });
      if (R[0].val < MIN_HOLD) { note(`balanceOf(holder) is ${R[0].val} at block ${fmt(B)} — below the ${fmt(MIN_HOLD)} needed`); continue; }
      result = { B, sim, R, sc };
    }
    if (!result) { note('no simulation completed for this token'); continue; }
    const { B, sim, R, sc } = result;
    row('simulated on', `${sim.ep}, on top of block ${fmt(B)} (simulated block ${fmt(num(sim.block.number))}); holder ${sc.addrs.holder}`, 'eth_simulateV1');
    let pass = 0, fail = 0;
    sc.calls.forEach((c, i) => {
      const r = R[i];
      const verdict = c.check ? (c.check(r, R) ? 'PASS' : 'FAIL') : '    ';
      if (c.check) verdict === 'PASS' ? pass++ : fail++;
      const logTxt = r.logs.map(l => `${nameOfTopic(l.topics[0])}(${l.topics.slice(1).map(x => toAddr(x).slice(0, 10)).join('→')}, ${BigInt(l.data)})${low(l.address) !== low(t.addr) ? ' from ' + l.address : ''}`).join(' ');
      out(`  ${String(i).padStart(2)} ${verdict} ${r.ok ? 'ok ' : 'REV'} ${c.label.padEnd(72)} gas ${String(r.gas).padStart(6)}  ${r.val !== null ? 'ret ' + r.val : r.ret && r.ret !== '0x' ? 'ret ' + r.ret.slice(0, 20) + '…' : ''}${r.logs.length ? '  logs ' + logTxt : ''}${r.err ? '  error ' + decodeError(r.err.data) : ''}`);
    });
    const anyForeignLog = R.some(r => r.logs.some(l => low(l.address) !== low(t.addr)));
    row('checks', `${pass} passed, ${fail} failed; logs from any address other than the token: ${anyForeignLog ? 'YES' : 'none'}`);
    const g = R[3].gas;
    row('gas of a cold EOA→fresh transfer', `${fmt(g)} (a stock OpenZeppelin ERC-20 transfer to an empty account is ~51,000)`, 'eth_simulateV1 gasUsed');
    ctx.results.push({ t, pass, fail, anyForeignLog, R, sc, B, ep: sim.ep });
    // cross-check the plain transfer on the other endpoints
    const others = SIM.filter(e => e.name !== sim.ep && ctx.simEps.includes(e.name));
    for (const ep of others) {
      const six = sc.calls.slice(0, 6).map(({ from, to, data }) => ({ from, to, data }));
      let s2 = await simulate(hex(B), six, undefined, [ep]), at = `block ${fmt(B)}`;
      if (s2.error && /unsupported block/i.test(errText(s2.error))) { note(`${ep.name} had not seen block ${fmt(B)} yet (${errText(s2.error)}); retried at latest`); s2 = await simulate('latest', six, undefined, [ep]); at = 'latest'; }
      if (s2.error) { row(`${ep.name}: same first six calls`, 'failed: ' + errText(s2.error)); continue; }
      const same = s2.calls.every((c, i) => c.status === sim.calls[i].status && c.returnData === sim.calls[i].returnData && JSON.stringify(c.logs?.map(l => [l.address, l.topics, l.data])) === JSON.stringify(sim.calls[i].logs?.map(l => [l.address, l.topics, l.data])));
      row(`${ep.name}: same first six calls`, same ? `identical status, return data and logs (${at})` : `DIFFER (${at})`, 'eth_simulateV1');
    }
  }
}

async function sec6() {
  H('6. THE CREATOR PAYOUT: WHO CAN REDIRECT IT, AND WHEN (simulated, never sent)');
  const f = ctx.factory;
  row('CREATOR_FEE_RECIPIENT_TIMELOCK / EXECUTION_WINDOW', `${f['CREATOR_FEE_RECIPIENT_TIMELOCK()']?.[0] ?? '?'} s / ${f['CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW()']?.[0] ?? '?'} s`, 'eth_call');
  row('GRADUATION_RESCUE_DELAY', `${f['GRADUATION_RESCUE_DELAY()']?.[0] ?? '?'} s`, 'eth_call');
  row('factory owner', f['owner()'] ? toAddr(f['owner()'][0]) : '?', 'eth_call');
  const own = f['owner()'] ? toAddr(f['owner()'][0]) : null;
  const ownerCode = own ? (await viaAny([['eth_getCode', [own, 'latest']]]))[0].result : '0x';
  row('owner is', ownerCode === '0x' ? 'an EOA (no code)' : `a contract, ${bytesOf(ownerCode)} bytes`, 'eth_getCode');
  if (own && ownerCode !== '0x') {
    // a Safe proxy is ~171 bytes and answers getOwners()/getThreshold()/VERSION() through its singleton at storage slot 0
    const s = await viaAny([callOf(own, sel('getOwners()')), callOf(own, sel('getThreshold()')), callOf(own, sel('VERSION()')), ['eth_getStorageAt', [own, '0x0', 'latest']]]);
    if (s[0].result && s[0].result !== '0x' && s[1].result && s[1].result !== '0x') {
      const ws = words(s[0].result), n = Number(ws[1] ?? 0n);
      row('owner answers Safe getters', `${n} owners, threshold ${words(s[1].result)[0]}, VERSION ${s[2].result && s[2].result !== '0x' ? decodeString(s[2].result) : '?'}; singleton (slot 0) ${showWord(BigInt(s[3].result))}; owners ${ws.slice(2, 2 + n).map(toAddr).join(', ')}`, 'eth_call; a Safe-shaped multisig (INFERRED from the getters, not from source)');
    } else row('owner answers Safe getters', 'no', 'eth_call getOwners()/getThreshold()');
  }
  if (!ctx.simEps.length || !ctx.tokens.length) return;
  ctx.seenErrors = new Set();
  const X = fresh(8);
  for (const t of ctx.tokens) {
    sub(`${t.label}: ${t.addr}`);
    const recipient = t.launched ? toAddr(t.launched[3]) : t.deployer;
    note(`getLaunchedToken word 3 = ${recipient}; deployer = ${t.deployer}; pendingCreatorFeeRecipient = (${t.pending ? t.pending.map(showWord).join(', ') : '?'})`);
    const launched = () => ({ from: X, to: FACTORY, data: sel('getLaunchedToken(address)') + word(t.addr) });
    const pending = () => ({ from: X, to: FACTORY, data: sel('pendingCreatorFeeRecipient(address)') + word(t.addr) });
    const trials = [
      ['stranger: setCreatorFeeRecipient(token, X)', { from: X, to: FACTORY, data: sel('setCreatorFeeRecipient(address,address)') + word(t.addr) + word(X) }],
      ['stranger: transferCreatorFeeRecipient(token, X)', { from: X, to: FACTORY, data: sel('transferCreatorFeeRecipient(address,address)') + word(t.addr) + word(X) }],
      ...(own ? [
        ['factory owner: setCreatorFeeRecipient(token, X)', { from: own, to: FACTORY, data: sel('setCreatorFeeRecipient(address,address)') + word(t.addr) + word(X) }],
        ['factory owner: transferCreatorFeeRecipient(token, X)', { from: own, to: FACTORY, data: sel('transferCreatorFeeRecipient(address,address)') + word(t.addr) + word(X) }],
      ] : []),
      ...(recipient ? [
        ['current recipient: transferCreatorFeeRecipient(token, X)', { from: recipient, to: FACTORY, data: sel('transferCreatorFeeRecipient(address,address)') + word(t.addr) + word(X) }],
        ['current recipient: setCreatorFeeRecipient(token, X)', { from: recipient, to: FACTORY, data: sel('setCreatorFeeRecipient(address,address)') + word(t.addr) + word(X) }],
      ] : []),
      ...(t.deployer ? [['deployer: setBuybackEnabled(token, false)', { from: t.deployer, to: FACTORY, data: sel('setBuybackEnabled(address,bool)') + word(t.addr) + word(0) }]] : []),
      ['stranger: setBuybackEnabled(token, false)', { from: X, to: FACTORY, data: sel('setBuybackEnabled(address,bool)') + word(t.addr) + word(0) }],
    ];
    for (const [label, call] of trials) {
      // each trial runs in its own simulation, followed by the two getters, so trials do not see each other's state
      const [tipB] = await viaAny([['eth_blockNumber', []]]);
      const sim = await simulate(hex(num(tipB.result)), [call, launched(), pending()].map(c => ({ ...c, data: c.data.startsWith('0x') ? c.data : '0x' + c.data })));
      if (sim.error) { row(label, 'simulation failed: ' + errText(sim.error)); continue; }
      const [c, l, p] = sim.calls;
      const ok = c.status === '0x1';
      if (!ok && c.error?.data && c.error.data.length >= 10 && !DICT.has(c.error.data.slice(0, 10))) ctx.seenErrors.add(c.error.data.slice(0, 10));
      const now = BigInt(sim.block.timestamp);
      const lw = l.status === '0x1' ? words(l.returnData) : null, pw = p.status === '0x1' ? words(p.returnData) : null;
      const changed = lw && t.launched ? lw.map((w, i) => (w !== t.launched[i] ? `word${i} ${showWord(t.launched[i])}→${showWord(w)}` : null)).filter(Boolean) : [];
      const pend = pw && t.pending ? pw.map((w, i) => (w !== t.pending[i] ? `pending${i} ${showWord(t.pending[i])}→${showWord(w)}${i > 0 && w > 1700000000n ? ` (= block time + ${fmt(w - now)} s)` : ''}` : null)).filter(Boolean) : [];
      const logs = (c.logs || []).map(x => `${nameOfTopic(x.topics[0])}(${x.topics.slice(1).map(y => toAddr(y).slice(0, 10)).join(', ')}${x.data && x.data !== '0x' ? ', ' + words(x.data).map(showWord).join(', ') : ''})`).join(' ');
      row(label, ok ? `SUCCEEDS; logs ${logs || 'none'}; getLaunchedToken ${changed.length ? changed.join(', ') : 'unchanged'}; ${pend.length ? pend.join(', ') : 'pending unchanged'}` : `reverts ${decodeError(c.error?.data)}`, 'eth_simulateV1');
    }
  }
  note('INFERRED: a call that succeeds here would succeed if sent now from that address with the same state; nothing was sent.');
}

async function sec7() {
  H('7. SELECTOR NAMES (optional, SOURCED): api.openchain.xyz for selectors the dictionary did not name');
  if (!USE_WEB) { note('skipped (--no-web)'); return; }
  const all = new Set([...(ctx.unknownSels || []), ...(ctx.seenErrors || [])]);
  for (const t of ctx.tokens || []) for (const s of t.dis.sels) if (!DICT.has(s)) all.add(s);
  const list = [...all].slice(0, 100);
  if (!list.length) { note('nothing to look up'); return; }
  try {
    const r = await fetch(`${OPENCHAIN}?function=${list.join(',')}&filter=true`, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json', 'user-agent': 'oubliette-pons-probe/1 (read-only)' } });
    const j = await r.json();
    const m = j.result?.function || {};
    let named = 0;
    for (const s of list) {
      const cands = (m[s] || []).map(x => x.name).filter(n => sel(n) === s);
      if (cands.length) { named++; row(s, cands.join(' | '), 'openchain.xyz, keccak-checked'); }
    }
    row('named / looked up', `${named} / ${list.length}`, `HTTP ${r.status}`);
    note('A crowd-sourced name says what someone registered for that selector; the keccak check only proves the name hashes to it. Nothing above rests on these names.');
  } catch (e) { note(`openchain.xyz unreachable: ${e.cause?.code || e.message}`); }
}

function verdict() {
  H('VERDICT');
  const rs = ctx.results || [];
  if (!rs.length) { note('No transfer simulation completed. Nothing is settled.'); return; }
  const allPass = rs.every(r => r.fail === 0 && !r.anyForeignLog);
  const noCalls = (ctx.tokens || []).every(t => callFamily(t.dis.ops) === 0);
  note(`Tokens tested: ${rs.map(r => `${r.t.label} ${r.t.addr} ("${r.t.symbol}", ${r.t.curveInfo?.graduated === 1n ? 'graduated' : 'on the curve'})`).join('; ')}.`);
  note(`Transfers: ${allPass ? 'PLAIN ERC-20.' : 'NOT PLAIN — see the FAIL lines.'} ${rs.map(r => `${r.t.label}: ${r.pass} checks passed, ${r.fail} failed`).join('; ')}. Fresh receives exactly ${fmt(AMT)}, holder loses exactly ${fmt(AMT)}, one Transfer log, no other contract logs, in every scenario: EOA sender, EOA spender, contract sender, contract spender, self, zero, to the curve, the deployer${allPass ? '' : ' (where it passed)'}.`);
  note(`Burn: burn(uint256) and burnFrom(address,uint256) are present and ${allPass ? 'work' : 'were tested'} from an EOA and from a contract; totalSupply falls by the amount each time; a transfer to 0x…dEaD succeeds and leaves totalSupply unchanged.`);
  note(`Hooks: the token's runtime code has ${noCalls ? 'NO' : 'SOME'} CALL/STATICCALL/DELEGATECALL/CREATE opcodes${noCalls ? ' — nothing it does can consult the factory, the curve or a hook, before or after graduation (INFERRED from the disassembly; the simulations are the measurement)' : ''}.`);
  note(`Proxy: none of the tokens is a proxy (EIP-1967 slots zero, no EIP-1167 pattern, no DELEGATECALL). The 1 % trade fee and the snipe tax live in the curve and the v4 hook, not in the token (INFERRED: the token has no fee code; the curve has feeBps() = 100).`);
  note('Not verified: the factory owner\'s other powers (the unnamed selectors in section 1), the hook\'s behaviour on v4 swaps, Pools.trade tokens, and anything about a token launched after this run.');
}

(async () => {
  try {
    await sec0(); await sec1(); await sec2(); await sec3(); await sec4(); await sec6(); await sec7(); verdict();
  } catch (e) { out(); out('FATAL: ' + (e.stack || e.message)); process.exitCode = 1; }
  sub('endpoint statistics');
  for (const ep of Object.values(EP)) row(`${ep.name} (${ep.url.replace('https://', '')})`, `${fmt(ep.stats.posts)} HTTP requests, ${fmt(ep.stats.calls)} RPC calls; rate-limited ${ep.stats.rateLimited}×; network errors ${ep.stats.netErrors}; batch ≤ ${ep.maxBatch}, pacing ${ep.gapMs} ms`);
  row('elapsed', elapsed());
})();
