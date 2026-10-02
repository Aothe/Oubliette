#!/usr/bin/env node
/*
 * gas.mjs — A MEASURING STICK, NOT THE PRODUCT. NOTHING SHOULD BE BUILT ON IT.
 *
 * What would each on-chain Oubliette action cost on RH Chain (Robinhood Chain, id 4663, Arbitrum Orbit)?
 *
 *   npm ci && node gas.mjs            prints the tables, writes out/gas.txt and out/gas.json  (~2 min)
 *   node gas.mjs --quick              skips the 30-day history sample
 *   node gas.mjs --offline            local EVM only: no validation, fallback prices — and it says so
 *
 * How it measures
 *   1. Compiles Measure.sol with solc-js (optimizer on, 200 runs, evmVersion "cancun").
 *   2. Runs every action as ONE fresh signed transaction in a local EVM (@ethereumjs/vm) against state that
 *      earlier transactions really wrote: 21,000 intrinsic, calldata gas, cold account and slot access,
 *      zero-to-nonzero writes, refunds — the L2 execution gas a receipt would show.
 *      Rules: Cancun. RH Chain runs ArbOS 61, which has the Cancun opcodes and gas schedule; the one
 *      Prague rule that would change these numbers, the EIP-7623 calldata floor, is checked live and absent.
 *   3. Replays every action on the LIVE chain, read-only: eth_simulateV1 with a state override that injects
 *      the same bytecode at the same addresses and the same pre-state for every slot the action touches.
 *      No deploy, no key, no transaction. Its gasUsed is exact, so the local/live gap is a number, not a guess.
 *   4. ArbSys (0x64) does not exist locally. A stand-in precompile is mounted there and charged the gas the
 *      real one costs, measured live first (ArbProbe). The loot roll is replayed with a real L2 block hash.
 *   5. L1 data: an Arbitrum receipt also charges for posting the transaction to Ethereum. That charge is
 *      16 x (brotli-1 size of the signed transaction) x (L1 unit price) wei — checked here against real
 *      receipts — and the unit price is sampled hourly over the last week because it is zero most of the
 *      time and spikes. NodeInterface (0xC8) gasEstimateL1Component / gasEstimateComponents are quoted too.
 *      eth_estimateGas (same override) gives the gas LIMIT a wallet would set, for a handful of actions.
 *
 * Chain access is read-only (eth_call, eth_simulateV1, eth_estimateGas, eth_get*, eth_feeHistory).
 * The private keys below are derived from a public string, exist only to sign local transactions and
 * vouchers inside this process, and must never be funded.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { createVM, runTx } from '@ethereumjs/vm';
import { EVMError } from '@ethereumjs/evm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { createFeeMarket1559Tx } from '@ethereumjs/tx';
import { createBlock } from '@ethereumjs/block';
import { Account, createAddressFromString, createAddressFromPrivateKey, hexToBytes, bytesToHex } from '@ethereumjs/util';
import {
  encodeFunctionData, decodeFunctionResult, encodeAbiParameters, encodePacked, decodeErrorResult,
  keccak256, parseAbi, toHex, numberToHex, parseSignature, serializeTransaction, maxUint256,
} from 'viem';
import { privateKeyToAccount, sign } from 'viem/accounts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OFFLINE = process.argv.includes('--offline');
const QUICK = process.argv.includes('--quick');

// ───────────────────────────── assumptions (every one is printed) ─────────────────────────────

const CHAIN_ID = 4663;
const ENDPOINTS = [
  { name: 'official', url: 'https://rpc.mainnet.chain.robinhood.com', gap: 300, maxBatch: 10, archive: false },
  { name: 'publicnode', url: 'https://robinhood-rpc.publicnode.com', gap: 300, maxBatch: 10, archive: false },
  { name: 'drpc', url: 'https://robinhood.drpc.org', gap: 260, maxBatch: 3, archive: true }, // the only one that serves old state
];
const ETH_USD_FALLBACK = 2682;          // CoinGecko, 2026-10-02 — used only if the API cannot be reached
const GAS_PRICE_FALLBACK = 33_607_488n; // wei, eth_gasPrice 2026-10-02 — used only with --offline
const ARBSYS_COST_FALLBACK = { number: 803n, hash: 806n }; // gas inside the precompile, measured 2026-10-02
const TX_GAS_LIMIT = 32_000_000n;       // ArbGasInfo.getMaxTxGasLimit on 4663 (re-read live below)
const SEQUENCER_MAX_TX_BYTES = 95_000;  // Nitro's default sequencer max-tx-data-size; RH Chain's own setting is not public

const RUN = { players: 20, kit: 4, dead: 2, poolBits: [0b0011, 0b0001] };          // 3 pooled, 5 burned
const SHARD = { players: 85, kit: 4, dead: 9, poolBits: [0b0011, 0b0001, 0b0001] }; // 12 pooled, 24 burned
const DELVER_DAY = { runs: 3, equips: 1, unequips: 1, repairs: 0.3, mints: 0.1, exchange: 0.5 };
// what "one exchange action" is, by intent: 45 % place an offer, 45 % fill one, 10 % cancel one
const EXCHANGE_MIX = { place: 0.45, fill: 0.45, cancel: 0.10 };
const INPUT_LOG = { players: 20, tickHz: 60, seconds: 180, seed: 20261002 };

// ───────────────────────────── small helpers ─────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad32 = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const ZERO32 = pad32(0);
const lines = [];
const say = (s = '') => { lines.push(s); console.log(s); };
const fmtInt = (n) => (n === null || n === undefined ? 'n/a' : Math.round(Number(n)).toLocaleString('en-US'));
function fmtUsd(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  if (v === 0) return '$0';
  if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 1) return '$' + v.toFixed(2);
  return '$' + Number(v.toPrecision(3)).toString();
}
function table(head, body, align) {
  const w = head.map((h, i) => Math.max(h.length, ...body.map((r) => String(r[i]).length)));
  const fmt = (r) => r.map((c, i) => (align[i] === 'l' ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join('  ').trimEnd();
  say(fmt(head));
  say(w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of body) say(fmt(r));
}
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] : null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const brotli = (bytes, quality) => new Uint8Array(zlib.brotliCompressSync(bytes, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality } }));

// ───────────────────────────── JSON-RPC: paced, rotated, backed off ─────────────────────────────

let useCurl = false;
const rpcStats = { calls: 0, retries: 0, byEndpoint: {} };

function curl(args, body) {
  return new Promise((resolve, reject) => {
    const child = execFile('curl', ['-s', '-m', '40', ...args], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    if (body !== undefined) child.stdin.end(body);
  });
}
async function httpPost(url, body) {
  if (!useCurl) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(40_000) });
      return await res.text();
    } catch (e) {
      if (e.name === 'TimeoutError') throw e;
      useCurl = true; // some sandboxes fail the proxy handshake from Node; curl works there
    }
  }
  return curl(['-X', 'POST', '-H', 'content-type: application/json', '--data-binary', '@-', url], body);
}
async function httpGetJson(url) {
  try {
    return await (await fetch(url, { signal: AbortSignal.timeout(20_000) })).json();
  } catch {
    return JSON.parse(await curl([url]));
  }
}
class RpcError extends Error {
  constructor(error) { super(error?.message || 'rpc error'); this.rpc = error; }
}
const isThrottle = (e) => e && (e.code === 429 || e.code === -32005 || /too many|rate limit|exceeded|timeout|temporarily/i.test(e.message || ''));
const rotate = { any: 0, archive: 0 };

/** One JSON-RPC batch (array of [method, params]) to one endpoint; returns an array of {result}|{error}. */
async function postBatch(ep, calls) {
  const wait = ep.nextFree ? ep.nextFree - Date.now() : 0;
  ep.nextFree = Math.max(Date.now(), ep.nextFree || 0) + ep.gap;
  if (wait > 0) await sleep(wait);
  const payload = calls.map(([method, params], id) => ({ jsonrpc: '2.0', id, method, params }));
  const text = await httpPost(ep.url, JSON.stringify(payload.length === 1 ? payload[0] : payload));
  rpcStats.calls += calls.length;
  rpcStats.byEndpoint[ep.name] = (rpcStats.byEndpoint[ep.name] || 0) + calls.length;
  let json;
  try { json = JSON.parse(text); } catch { throw new RpcError({ code: 429, message: 'not JSON: ' + text.slice(0, 80) }); }
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length !== calls.length) throw new RpcError(arr[0]?.error || { code: 429, message: 'short batch' });
  return arr.sort((a, b) => a.id - b.id);
}
/** A batch with rotation and backoff. Throttling is retried elsewhere; execution errors go back to the caller. */
async function rpcBatch(calls, { archive = false, tries = 7 } = {}) {
  const eps = ENDPOINTS.filter((e) => (!archive || e.archive) && calls.length <= e.maxBatch);
  if (!eps.length) throw new Error('no endpoint accepts a batch of ' + calls.length);
  let last;
  for (let attempt = 0; attempt < tries; attempt++) {
    const ep = eps[(rotate[archive ? 'archive' : 'any']++) % eps.length];
    try {
      const out = await postBatch(ep, calls);
      const throttled = out.find((o) => o.error && isThrottle(o.error));
      if (!throttled) return out;
      last = new RpcError(throttled.error);
    } catch (e) { last = e; }
    rpcStats.retries++;
    ep.nextFree = Date.now() + Math.min(8000, 700 * 2 ** attempt);
  }
  throw last;
}
async function rpc(method, params, opts) {
  const [out] = await rpcBatch([[method, params]], opts);
  if (out.error) throw new RpcError(out.error);
  return out.result;
}

const ARBSYS = '0x0000000000000000000000000000000000000064';
const ARBOWNERPUBLIC = '0x000000000000000000000000000000000000006b';
const ARBGASINFO = '0x000000000000000000000000000000000000006c';
const NODE_INTERFACE = '0x00000000000000000000000000000000000000C8';
const HISTORY_2935 = '0x0000F90827F1C53a10cb7A02335B175320002935';
const sysAbi = parseAbi([
  'function arbOSVersion() view returns (uint256)',
  'function arbBlockHash(uint256) view returns (bytes32)',
  'function getBrotliCompressionLevel() view returns (uint64)',
  'function getMinimumGasPrice() view returns (uint256)',
  'function getL1BaseFeeEstimate() view returns (uint256)',
  'function getGasAccountingParams() view returns (uint256,uint256,uint256)',
  'function getMaxTxGasLimit() view returns (uint256)',
  'function getMaxBlockGasLimit() view returns (uint64)',
  'function getGasPricingConstraints() view returns (uint64[3][])',
  'function gasEstimateComponents(address to, bool contractCreation, bytes data) payable returns (uint64 gasEstimate, uint64 gasEstimateForL1, uint256 baseFee, uint256 l1BaseFeeEstimate)',
  'function gasEstimateL1Component(address to, bool contractCreation, bytes data) payable returns (uint64 gasEstimateForL1, uint256 baseFee, uint256 l1BaseFeeEstimate)',
]);
const sysCall = (to, functionName, args = [], extra = {}) => ['eth_call', [{ to, data: encodeFunctionData({ abi: sysAbi, functionName, args }), ...extra.tx }, extra.block || 'latest']];
const sysDecode = (functionName, data) => decodeFunctionResult({ abi: sysAbi, functionName, data });
const l1PriceAt = (block) => sysCall(ARBGASINFO, 'getL1BaseFeeEstimate', [], { block });

// ───────────────────────────── compile ─────────────────────────────

function compile() {
  const source = fs.readFileSync(path.join(HERE, 'Measure.sol'), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'Measure.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'storageLayout'] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join('\n'));
  return { contracts: out.contracts['Measure.sol'], sourceLines: source.split('\n').length - 1 };
}

// ───────────────────────────── the local chain ─────────────────────────────

const common = createCustomCommon({ chainId: CHAIN_ID }, Mainnet, { hardfork: Hardfork.Cancun });
// the stand-in for ArbSys: same address, same two calls, charged what the real one costs
const arb = { number: 5_000_000n, hashes: new Map(), cost: { number: 0n, hash: 0n } };
const SEL_NUMBER = '0xa3b1b31d'; // arbBlockNumber()
const SEL_HASH = '0x2b407a82';   // arbBlockHash(uint256)
function arbSysStandIn({ data, gasLimit }) {
  const sel = bytesToHex(data.subarray(0, 4));
  const fail = () => ({ executionGasUsed: gasLimit, returnValue: new Uint8Array(0), exceptionError: new EVMError(EVMError.errorMessages.REVERT) });
  if (sel === SEL_NUMBER) {
    if (gasLimit < arb.cost.number) return fail();
    return { executionGasUsed: arb.cost.number, returnValue: hexToBytes(pad32(arb.number)) };
  }
  if (sel === SEL_HASH) {
    const n = BigInt(bytesToHex(data.subarray(4, 36)));
    if (n >= arb.number || n + 256n < arb.number || gasLimit < arb.cost.hash) return fail(); // the real one reverts outside 256 blocks
    const h = arb.hashes.get(n) || keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], ['stand-in L2 block hash', n]));
    return { executionGasUsed: arb.cost.hash, returnValue: hexToBytes(h) };
  }
  return fail();
}
const vm = await createVM({ common, evmOpts: { customPrecompiles: [{ address: createAddressFromString(ARBSYS), function: arbSysStandIn }] } });

const accounts = new Map();
function acct(label) {
  if (accounts.has(label)) return accounts.get(label);
  const pkHex = keccak256(toHex('oubliette measuring stick / local only / never fund / ' + label));
  const pk = hexToBytes(pkHex);
  const address = createAddressFromPrivateKey(pk);
  const a = { label, pk, pkHex, address, addr: address.toString(), nonce: 0n, items: [] };
  accounts.set(label, a);
  return a;
}

const shadow = new Map();  // `${address}:${slot}` -> 32-byte hex: every slot any transaction has touched
const codeOf = new Map();  // address -> runtime bytecode
let blockNo = 100n;
let clock = 1_700_000_000n; // local time; far enough behind the live chain that every delay has elapsed there
let txCount = 0;
let gasPrice = GAS_PRICE_FALLBACK;

const txFields = (from, to, data, value) => ({ chainId: BigInt(CHAIN_ID), nonce: from.nonce, to: to ? createAddressFromString(to) : undefined, data: hexToBytes(data), value, maxPriorityFeePerGas: 0n });

/** One signed transaction, one block. Returns gas as a receipt would show it, and the pre-state it read. */
async function send(from, to, data, { value = 0n, advance = 1n } = {}) {
  blockNo += 1n; clock += advance; arb.number += 10n; txCount++;
  const block = createBlock({ header: { number: blockNo, timestamp: clock, baseFeePerGas: 7n, gasLimit: 1n << 50n } }, { common });
  const fields = txFields(from, to, data, value);
  const tx = createFeeMarket1559Tx({ ...fields, gasLimit: TX_GAS_LIMIT, maxFeePerGas: 7n }, { common }).sign(from.pk);
  const r = await runTx(vm, { tx, block, skipBlockGasLimitValidation: true, reportAccessList: true });
  from.nonce += 1n;
  const err = r.execResult.exceptionError;
  if (err) {
    let reason = err.error || String(err);
    try { reason += ': ' + decodeErrorResult({ abi: parseAbi(['error Error(string)']), data: bytesToHex(r.execResult.returnValue) }).args[0]; } catch { /* no reason string */ }
    throw new Error(`local transaction reverted (${reason})`);
  }
  // the pre-state of every slot this transaction touched, then bring the shadow up to date
  const touched = {};
  let slots = 0;
  for (const { address, storageKeys } of r.accessList) {
    const a = address.toLowerCase();
    touched[a] = {};
    for (const key of storageKeys) {
      const k = `${a}:${key}`;
      const before = shadow.get(k) || ZERO32;
      if (before !== ZERO32) touched[a][key] = before;
      const after = await vm.stateManager.getStorage(createAddressFromString(a), hexToBytes(key));
      shadow.set(k, pad32(after.length ? bytesToHex(after) : 0));
      slots++;
    }
  }
  const gas = Number(r.totalGasSpent);
  // the bytes a wallet would actually broadcast: the same call with a realistic fee cap and gas limit
  const wire = () => createFeeMarket1559Tx({ ...fields, gasLimit: BigInt(Math.ceil(gas * 1.25)), maxFeePerGas: 2n * gasPrice }, { common }).sign(from.pk).serialize();
  return { gas, refund: Number(r.gasRefund), touched, slots, logs: r.execResult.logs || [], created: r.createdAddress?.toString(), wire };
}

async function deploy(from, artifact, name, types = [], args = []) {
  const ctor = types.length ? encodeAbiParameters(types.map((type) => ({ type })), args).slice(2) : '';
  const r = await send(from, null, '0x' + artifact.evm.bytecode.object + ctor);
  const addr = r.created.toLowerCase();
  const code = bytesToHex(await vm.stateManager.getCode(createAddressFromString(addr)));
  codeOf.set(addr, code);
  const slotOf = Object.fromEntries((artifact.storageLayout?.storage || []).map((s) => [s.label, BigInt(s.slot)]));
  return { name, abi: artifact.abi, addr, slotOf, deployGas: r.gas, codeBytes: (code.length - 2) / 2 };
}
const callData = (c, functionName, args = []) => encodeFunctionData({ abi: c.abi, functionName, args });
const call = (from, c, functionName, args = [], opts) => send(from, c.addr, callData(c, functionName, args), opts);
async function view(c, functionName, args = []) {
  const r = await vm.evm.runCall({ to: createAddressFromString(c.addr), data: hexToBytes(callData(c, functionName, args)), gasLimit: 10_000_000n, isStatic: true });
  if (r.execResult.exceptionError) throw new Error(`view ${functionName} reverted`);
  return decodeFunctionResult({ abi: c.abi, functionName, data: bytesToHex(r.execResult.returnValue) });
}

// ───────────────────────────── measuring, and replaying on the live chain ─────────────────────────────

const rows = [];
const live = { on: !OFFLINE, facts: {}, failures: [] };

function overridesFor(row) {
  const ov = { [row.from]: { balance: numberToHex(10n ** 24n) } };
  for (const a of new Set([row.to, ...Object.keys(row.touched)])) {
    if (!codeOf.has(a)) continue; // an EOA or a precompile
    ov[a] = { code: codeOf.get(a), state: { ...(row.touched[a] || {}) } };
  }
  return ov;
}
const txObject = (row) => ({ from: row.from, to: row.to, data: row.data, ...(row.value ? { value: numberToHex(row.value) } : {}) });
const niCall = (fn, row, block) => sysCall(NODE_INTERFACE, fn, [row.to, false, row.data], { tx: { from: row.from, ...(row.value ? { value: numberToHex(row.value) } : {}) }, block });

async function replayLive(row, { patch, estimate } = {}) {
  if (!live.on) return;
  try {
    const ov = overridesFor(row);
    if (patch) patch(ov);
    const sim = await rpc('eth_simulateV1', [{ blockStateCalls: [{ stateOverrides: ov, calls: [txObject(row)] }], validation: false }, 'latest']);
    const c = sim[0].calls[0];
    row.live = { gas: Number(BigInt(c.gasUsed)), ok: c.status === '0x1', error: c.error?.message };
    if (!row.live.ok) live.failures.push(`${row.id}: live replay reverted (${row.live.error})`);
    const [a, b] = await rpcBatch([niCall('gasEstimateL1Component', row), niCall('gasEstimateComponents', row)]);
    if (!a.error) { const d = sysDecode('gasEstimateL1Component', a.result); row.l1Quote = { gas: Number(d[0]), baseFee: d[1].toString(), l1PricePerUnit: d[2].toString() }; }
    if (!b.error) row.l1QuotePadded = Number(sysDecode('gasEstimateComponents', b.result)[1]); // its total cannot see our override; only the L1 part is used
    if (estimate) row.estimate = Number(BigInt(await rpc('eth_estimateGas', [txObject(row), 'latest', ov])));
  } catch (e) {
    live.failures.push(`${row.id}: ${e.message}`);
  }
}

/** Measure one action: one local transaction, then the same call replayed on the live chain. */
async function measure(id, label, from, c, functionName, args, opts = {}) {
  const data = callData(c, functionName, args);
  const r = await send(from, c.addr, data, opts);
  const bytes = hexToBytes(data);
  const zero = bytes.reduce((n, b) => n + (b === 0 ? 1 : 0), 0);
  const wire = r.wire();
  const row = {
    id, label, fn: `${c.name}.${functionName}`, from: from.addr, to: c.addr, data, value: opts.value || 0n,
    gas: r.gas, refund: r.refund, calldataBytes: bytes.length, calldataGas: 4 * zero + 16 * (bytes.length - zero),
    txBytes: wire.length, l1Bytes: brotli(wire, 1).length, // L1 data units = 16 x l1Bytes
    slotsTouched: r.slots, logs: r.logs.length, touched: r.touched, note: opts.note || '',
  };
  rows.push(row);
  await replayLive(row, opts);
  return Object.assign(r, { row });
}

// ───────────────────────────── live prelude: what chain is this, and what does gas cost ─────────────────────────────

async function chainFacts() {
  const f = live.facts;
  const base = await rpcBatch([['eth_chainId', []], ['eth_blockNumber', []], ['eth_gasPrice', []], ['web3_clientVersion', []], ['eth_maxPriorityFeePerGas', []]]);
  f.chainId = Number(BigInt(base[0].result));
  if (f.chainId !== CHAIN_ID) throw new Error(`RPC answers for chain ${f.chainId}, expected ${CHAIN_ID}`);
  f.head = Number(BigInt(base[1].result));
  f.gasPrice = BigInt(base[2].result);
  f.client = base[3].result;
  f.priorityFee = BigInt(base[4].result || '0x0').toString();
  const sys = await rpcBatch([
    sysCall(ARBSYS, 'arbOSVersion'), sysCall(ARBGASINFO, 'getMinimumGasPrice'), l1PriceAt('latest'), sysCall(ARBGASINFO, 'getGasAccountingParams'),
    sysCall(ARBGASINFO, 'getMaxTxGasLimit'), sysCall(ARBGASINFO, 'getMaxBlockGasLimit'), sysCall(ARBGASINFO, 'getGasPricingConstraints'),
    sysCall(ARBOWNERPUBLIC, 'getBrotliCompressionLevel'),
  ]);
  f.arbOS = Number(sysDecode('arbOSVersion', sys[0].result)) - 55; // ArbSys reports 55 + the ArbOS version
  f.minGasPrice = sysDecode('getMinimumGasPrice', sys[1].result).toString();
  f.l1PricePerUnit = sysDecode('getL1BaseFeeEstimate', sys[2].result).toString();
  const acc = sysDecode('getGasAccountingParams', sys[3].result);
  f.speedLimitPerSecond = acc[0].toString();
  f.maxTxGas = sys[4].error ? acc[2].toString() : sysDecode('getMaxTxGasLimit', sys[4].result).toString();
  f.maxBlockGas = sys[5].error ? acc[1].toString() : sysDecode('getMaxBlockGasLimit', sys[5].result).toString();
  f.pricingConstraints = sys[6].error ? null : sysDecode('getGasPricingConstraints', sys[6].result).map((c) => ({ targetGasPerSecond: Number(c[0]), windowSeconds: Number(c[1]), backlog: c[2].toString() }));
  f.brotliLevel = sys[7].error ? null : Number(sysDecode('getBrotliCompressionLevel', sys[7].result));
  const blk = await rpc('eth_getBlockByNumber', [numberToHex(f.head), false]);
  f.headTime = Number(BigInt(blk.timestamp));
  f.baseFee = BigInt(blk.baseFeePerGas).toString();

  // the EIP-7623 calldata floor (Prague) would make 1,000 non-zero bytes cost 21,000 + 40,000; without it, + 16,000
  const sim = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: [{ from: acct('floor probe').addr, to: acct('floor sink').addr, data: '0x' + 'ff'.repeat(1000) }] }], validation: false }, 'latest']);
  f.gasFor1000NonZeroBytes = Number(BigInt(sim[0].calls[0].gasUsed));
  f.calldataFloor = f.gasFor1000NonZeroBytes >= 61_000;

  // block hashes on chain: ArbSys (256 blocks) and the EIP-2935 history contract, each against the RPC's own hash
  const head = Number(BigInt(await rpc('eth_blockNumber', [])));
  const near = head - 40, far = head - 100_000;
  const hist = (n) => ['eth_call', [{ to: HISTORY_2935, data: pad32(n) }, 'latest']];
  const edge = await rpcBatch([hist(head - 393_000), hist(head - 393_400)]); // the window is 393,168 blocks if it is Arbitrum's stock setting
  const h = await rpcBatch([['eth_getBlockByNumber', [numberToHex(near), false]], sysCall(ARBSYS, 'arbBlockHash', [BigInt(near)]), hist(near)]);
  const g = await rpcBatch([['eth_getBlockByNumber', [numberToHex(far), false]], hist(far), sysCall(ARBSYS, 'arbBlockHash', [BigInt(far)])]);
  f.blockHashCheck = {
    block: near, arbSysMatches: h[1].result === h[0].result?.hash, history2935Matches: h[2].result === h[0].result?.hash,
    farBlock: far, history2935MatchesFar: g[1].result === g[0].result?.hash, arbSysServesFar: !g[2].error,
    historyServes393000Back: !edge[0].error, historyServes393400Back: !edge[1].error,
  };
  // how busy is the chain right now: gas used by 20 consecutive blocks
  const recent = [];
  for (const start of [head - 30, head - 20]) {
    const blocks = await rpcBatch(Array.from({ length: 10 }, (_, i) => ['eth_getBlockByNumber', [numberToHex(start + i), false]]));
    for (const b of blocks) if (b.result) recent.push(Number(BigInt(b.result.gasUsed)));
  }
  f.recentGasPerBlock = recent.length ? Math.round(mean(recent)) : null;
}

async function ethUsd() {
  try {
    const j = await httpGetJson('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    if (j?.ethereum?.usd > 0) return { usd: j.ethereum.usd, source: 'CoinGecko simple price API, at run time' };
  } catch { /* fall through */ }
  return { usd: ETH_USD_FALLBACK, source: 'FALLBACK constant 2,682 (CoinGecko unreachable)' };
}

/** Base fee (eth_feeHistory) and L1 unit price sampled back through time. Needs an archive endpoint. */
async function sampleHistory() {
  const f = live.facts;
  const out = { points: [], failed: 0, recent: null };
  try {
    const fh = await rpc('eth_feeHistory', ['0x400', 'latest', []]);
    const fees = fh.baseFeePerGas.map((x) => Number(BigInt(x))).sort((a, b) => a - b);
    out.recent = { blocks: fees.length, p50: quantile(fees, 0.5), p95: quantile(fees, 0.95), max: fees.at(-1) };
  } catch (e) { live.failures.push('feeHistory (recent): ' + e.message); }
  let rate;
  try {
    const back = 6_000_000;
    const anchor = await rpc('eth_getBlockByNumber', [numberToHex(f.head - back), false], { archive: true });
    rate = back / (f.headTime - Number(BigInt(anchor.timestamp))); // blocks per second over about a week
  } catch (e) { live.failures.push('history anchor: ' + e.message); return out; }
  out.blocksPerSecond = rate;
  const hours = [];
  for (let h = 0; h < 7 * 24; h += 1) hours.push(h);
  if (!QUICK) for (let h = 7 * 24; h <= 30 * 24; h += 12) hours.push(h);
  for (const h of hours) {
    // one batch per sample hour: 16 blocks of base fee, and the L1 unit price on the hour and on the half hour
    const tag = numberToHex(f.head - Math.round(h * 3600 * rate));
    const tagHalf = numberToHex(f.head - Math.round((h + 0.5) * 3600 * rate));
    try {
      const [fh, l1a, l1b] = await rpcBatch([['eth_feeHistory', ['0x10', tag, []]], l1PriceAt(tag), l1PriceAt(tagHalf)], { archive: true, tries: 4 });
      if (fh.error) { out.failed++; continue; }
      out.points.push({
        hoursBack: h, block: Number(BigInt(tag)), blockHalf: Number(BigInt(tagHalf)),
        baseFees: fh.result.baseFeePerGas.slice(0, -1).map((x) => Number(BigInt(x))),
        l1: [l1a.error ? null : Number(BigInt(l1a.result)), l1b.error ? null : Number(BigInt(l1b.result))],
      });
    } catch { out.failed++; }
  }
  const stats = (pts) => {
    if (!pts.length) return null;
    const fees = pts.flatMap((p) => p.baseFees).sort((a, b) => a - b);
    const l1 = pts.flatMap((p) => p.l1).filter((x) => x !== null).sort((a, b) => a - b);
    const worst = pts.flatMap((p) => [[p.l1[0], p.block], [p.l1[1], p.blockHalf]]).filter((x) => x[0]).sort((a, b) => b[0] - a[0])[0];
    return {
      hours: pts.length, hoursBack: [pts[0].hoursBack, pts.at(-1).hoursBack + 0.5], oldestBlock: pts.at(-1).blockHalf, baseFeeSamples: fees.length,
      baseFeeMin: fees[0], baseFeeMean: Math.round(mean(fees)), baseFeeP50: quantile(fees, 0.5), baseFeeP95: quantile(fees, 0.95), baseFeeMax: fees.at(-1),
      l1Samples: l1.length, l1NonZero: l1.filter((x) => x > 0).length, l1Mean: Math.round(mean(l1) ?? 0), l1P50: quantile(l1, 0.5), l1P95: quantile(l1, 0.95), l1Max: l1.at(-1) ?? 0,
      l1WorstBlock: worst ? worst[1] : null,
    };
  };
  out.d7 = stats(out.points.filter((p) => p.hoursBack < 7 * 24));
  out.d30 = QUICK ? null : stats(out.points);
  if (out.d7) {
    try {
      const [a, b] = await rpcBatch([['eth_getBlockByNumber', [numberToHex(out.d7.oldestBlock), false]], ['eth_getBlockByNumber', [numberToHex(out.d7.l1WorstBlock || out.d7.oldestBlock), false]]], { archive: true });
      out.d7.from = new Date(Number(BigInt(a.result.timestamp)) * 1000).toISOString();
      out.d7.l1WorstTime = out.d7.l1WorstBlock ? new Date(Number(BigInt(b.result.timestamp)) * 1000).toISOString() : null;
    } catch { /* cosmetic */ }
  }
  return out;
}

/** Does the L1 formula reproduce what real transactions were charged? Receipts from the dearest sampled block. */
async function receiptsCheck(startBlock, want = 8) {
  const out = { block: startBlock, checked: 0, exact: 0, quoteOverReceipt: [], samples: [] };
  const rawOf = (tx) => {
    const sig = { r: tx.r, s: tx.s };
    if (tx.type === '0x2') return serializeTransaction({ type: 'eip1559', chainId: CHAIN_ID, nonce: Number(BigInt(tx.nonce)), maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas), maxFeePerGas: BigInt(tx.maxFeePerGas), gas: BigInt(tx.gas), to: tx.to, value: BigInt(tx.value), data: tx.input, accessList: tx.accessList || [] }, { ...sig, yParity: Number(BigInt(tx.yParity ?? tx.v)) });
    return serializeTransaction({ type: 'legacy', chainId: CHAIN_ID, nonce: Number(BigInt(tx.nonce)), gasPrice: BigInt(tx.gasPrice), gas: BigInt(tx.gas), to: tx.to, value: BigInt(tx.value), data: tx.input }, { ...sig, v: BigInt(tx.v) });
  };
  for (let b = startBlock; b < startBlock + 40 && out.checked < want; b++) {
    const [blk, pNow, pPrev] = await rpcBatch([['eth_getBlockByNumber', [numberToHex(b), true]], l1PriceAt(numberToHex(b)), l1PriceAt(numberToHex(b - 1))], { archive: true, tries: 4 });
    if (!blk.result || pNow.error) continue;
    const prices = [pNow, pPrev].filter((x) => !x.error).map((x) => BigInt(x.result));
    const baseFee = BigInt(blk.result.baseFeePerGas);
    for (const tx of blk.result.transactions) {
      if (out.checked >= want) break;
      if (!['0x0', '0x2'].includes(tx.type) || !tx.to) continue;
      const [rc, quote] = await rpcBatch([['eth_getTransactionReceipt', [tx.hash]], sysCall(NODE_INTERFACE, 'gasEstimateL1Component', [tx.to, false, tx.input], { tx: { from: tx.from, value: tx.value }, block: numberToHex(b) })], { archive: true, tries: 4 });
      if (!rc.result?.gasUsedForL1) continue;
      const raw = hexToBytes(rawOf(tx));
      const size = brotli(raw, 1).length;
      const charged = BigInt(rc.result.gasUsedForL1);
      const exact = charged > 0n && prices.some((p) => 16n * BigInt(size) * p / baseFee === charged);
      const quoted = quote.error ? null : Number(sysDecode('gasEstimateL1Component', quote.result)[0]);
      out.checked++; if (exact) out.exact++;
      if (quoted && charged > 0n) out.quoteOverReceipt.push(quoted / Number(charged));
      out.samples.push({ block: b, hash: tx.hash, rawBytes: raw.length, brotli1Bytes: size, gasUsed: Number(BigInt(rc.result.gasUsed)), gasUsedForL1: Number(charged), formula: prices.map((p) => (16n * BigInt(size) * p / baseFee).toString()), nodeInterfaceQuote: quoted, exact });
    }
  }
  return out;
}

// ───────────────────────────── D1: how big is an input log ─────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/*
 * The input a deterministic server needs from one player on one tick, two bytes:
 *   byte A = move (low nibble: 0 still, 1-8 the eight directions) | buttons (bit 4 fire, 5 skill, 6 recall, 7 use)
 *   byte B = aim, 256 steps round the circle
 * The synthetic player (an ASSUMPTION, not a measurement of people): changes direction 3 times a second,
 * toggles fire every 2.5 s, presses the skill every 8 s and a consumable every 45 s, and nudges the aim on
 * 25 % of ticks (+-1..3 steps) with a jump to a new target every 2 s.
 */
const INPUT_MODEL = { moveHz: 3, fireToggleHz: 0.4, skillEverySec: 8, useEverySec: 45, aimNudgeProb: 0.25, aimJumpHz: 0.5, shotEveryTicks: 12 };
function synthInputs({ players, tickHz, seconds, seed }) {
  const ticks = tickHz * seconds;
  const raw = new Uint8Array(players * ticks * 2); // tick-major, two bytes per player
  for (let p = 0; p < players; p++) {
    const rnd = mulberry32(seed + p * 7919);
    let move = 1 + Math.floor(rnd() * 8), fire = 1, aim = Math.floor(rnd() * 256);
    for (let t = 0; t < ticks; t++) {
      if (rnd() < INPUT_MODEL.moveHz / tickHz) move = Math.floor(rnd() * 9);
      if (rnd() < INPUT_MODEL.fireToggleHz / tickHz) fire ^= 1;
      const skill = rnd() < 1 / (INPUT_MODEL.skillEverySec * tickHz) ? 1 : 0;
      const use = rnd() < 1 / (INPUT_MODEL.useEverySec * tickHz) ? 1 : 0;
      if (rnd() < INPUT_MODEL.aimNudgeProb) aim = (aim + (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 3)) + 256) & 255;
      if (rnd() < INPUT_MODEL.aimJumpHz / tickHz) aim = Math.floor(rnd() * 256);
      const i = (t * players + p) * 2;
      raw[i] = move | (fire << 4) | (skill << 5) | (use << 7);
      raw[i + 1] = aim;
    }
  }
  return { raw, ticks };
}
/*
 * The compact encoding: one stream per player, one record per CHANGE.
 *   header byte = which bytes follow (bit 7: A, bit 6: B) | ticks since this player's last record (0-62; 63 = a
 *   LEB128 varint of the remainder follows), then byte A and / or byte B.
 * aimOnShots = true is the tighter rule a bullet-hell can use: the simulation reads the aim only on the tick
 * a shot leaves (every 12th tick while fire is held), so only those aims are logged.
 */
function encodeInputs({ raw, ticks }, players, tickHz, aimOnShots) {
  const out = [1, players, tickHz, 0, ticks & 255, (ticks >> 8) & 255, (ticks >> 16) & 255, 0]; // 8-byte header
  let records = 0;
  for (let p = 0; p < players; p++) {
    let lastA = -1, lastB = -1, lastTick = 0;
    for (let t = 0; t < ticks; t++) {
      const i = (t * players + p) * 2;
      const a = raw[i], b = raw[i + 1];
      const aimRead = !aimOnShots || (((a >> 4) & 1) === 1 && t % INPUT_MODEL.shotEveryTicks === 0);
      const hasA = a !== lastA, hasB = aimRead && b !== lastB;
      if (!hasA && !hasB) continue;
      let delta = t - lastTick;
      const flags = (hasA ? 0x80 : 0) | (hasB ? 0x40 : 0);
      if (delta < 63) out.push(flags | delta);
      else {
        out.push(flags | 63);
        delta -= 63;
        do { out.push((delta & 0x7f) | (delta > 0x7f ? 0x80 : 0)); delta >>>= 7; } while (delta > 0);
      }
      if (hasA) { out.push(a); lastA = a; }
      if (hasB) { out.push(b); lastB = b; }
      lastTick = t; records++;
    }
  }
  return { bytes: Uint8Array.from(out), records };
}
/** What it costs to post `bytes` as plain calldata, split into transactions the sequencer would accept. */
function postingCost(bytes, from, to) {
  const chunk = SEQUENCER_MAX_TX_BYTES - 1000; // leave room for the envelope
  let gas = 0, l1Bytes = 0, txs = 0;
  for (let o = 0; o < Math.max(1, bytes.length); o += chunk, txs++) {
    const part = bytes.subarray(o, o + chunk);
    const zero = part.reduce((n, b) => n + (b === 0 ? 1 : 0), 0);
    const g = 21_000 + 4 * zero + 16 * (part.length - zero);
    gas += g;
    const wire = createFeeMarket1559Tx({ chainId: BigInt(CHAIN_ID), nonce: 7n, to: createAddressFromString(to), data: part, value: 0n, maxPriorityFeePerGas: 0n, gasLimit: BigInt(Math.ceil(g * 1.25)), maxFeePerGas: 2n * gasPrice }, { common }).sign(from.pk).serialize();
    l1Bytes += brotli(wire, 1).length;
  }
  return { bytes: bytes.length, txs, gas, l1Bytes };
}

// ───────────────────────────── Merkle tree for lazy wear (sorted pairs, odd node promoted) ─────────────────────────────

const hashPair = (a, b) => keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], BigInt(a) < BigInt(b) ? [a, b] : [b, a]));
function merkle(leaves) {
  const levels = [leaves];
  while (levels.at(-1).length > 1) {
    const prev = levels.at(-1), next = [];
    for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
    levels.push(next);
  }
  return levels;
}
function merkleProof(levels, index) {
  const proof = [];
  for (let l = 0; l < levels.length - 1; l++, index >>= 1) if ((index ^ 1) < levels[l].length) proof.push(levels[l][index ^ 1]);
  return proof;
}

// ═════════════════════════════ main ═════════════════════════════

const started = Date.now();
say('Oubliette — gas measuring stick (a measuring stick, not the contracts; nothing should be built on it)');
say(`run at ${new Date().toISOString()} · node ${process.version} · solc ${solc.version()} · @ethereumjs/vm 10.1.3 · rules: Cancun, chain id ${CHAIN_ID}`);
say();

const { contracts: art, sourceLines } = compile();

let eth = { usd: ETH_USD_FALLBACK, source: 'fallback constant (offline)' };
let historyPromise = Promise.resolve(null);
if (live.on) {
  try {
    await chainFacts();
    gasPrice = live.facts.gasPrice;
    eth = await ethUsd();
    historyPromise = sampleHistory().catch((e) => { live.failures.push('history: ' + e.message); return null; });
  } catch (e) {
    say(`!! live chain unreachable (${e.message}) — continuing offline with fallback prices`);
    live.on = false;
  }
}

// ── actors ──
const bank = acct('bank / deployer');
const server = acct('server');
const newbie = acct('newbie');
const seller = acct('merchant: seller');
const buyer = acct('merchant: buyer');
const quaffer = acct('consumable user');
const group = (name, n) => Array.from({ length: n }, (_, i) => acct(`${name} #${i}`));
const G1 = group('run A', RUN.players), G2 = group('run B', RUN.players);
const G3 = group('shard C', SHARD.players), G4 = group('shard D', SHARD.players);
for (const a of accounts.values()) await vm.stateManager.putAccount(a.address, new Account(0n, 10n ** 24n));

// ── ArbSys: measure the real precompile, then charge the stand-in the same ──
const probe = await deploy(bank, art.ArbProbe, 'ArbProbe');
const calib = { source: 'fallback constants measured 2026-10-02', ...ARBSYS_COST_FALLBACK };
{
  const n0 = await call(bank, probe, 'readNumber');   // the stand-in charges 0 here
  const h0 = await call(bank, probe, 'readHash', [5n]);
  if (live.on) {
    try {
      const simProbe = async (fn, args) => {
        const sim = await rpc('eth_simulateV1', [{ blockStateCalls: [{ stateOverrides: { [probe.addr]: { code: codeOf.get(probe.addr), state: {} } }, calls: [{ from: bank.addr, to: probe.addr, data: callData(probe, fn, args) }] }], validation: false }, 'latest']);
        if (sim[0].calls[0].status !== '0x1') throw new Error(`${fn} reverted live`);
        return Number(BigInt(sim[0].calls[0].gasUsed));
      };
      const liveNumber = await simProbe('readNumber', []);
      const liveHash = await simProbe('readHash', [5n]);
      const liveHistory = await simProbe('readHistory', [5n]);
      const liveHistoryFar = await simProbe('readHistory', [100_000n]);
      calib.number = BigInt(liveNumber - n0.gas);
      calib.hash = BigInt(liveHash - h0.gas) - calib.number;
      Object.assign(calib, { source: 'measured live in this run', liveNumber, liveHash, liveHistory, liveHistoryFar, localNumberAtZeroCost: n0.gas, localHashAtZeroCost: h0.gas });
    } catch (e) { live.failures.push('ArbSys calibration: ' + e.message); }
  }
  arb.cost = { number: calib.number, hash: calib.hash };
}

// ── deploy ──
const token = await deploy(bank, art.Token, 'Token', ['uint256'], [10n ** 27n]);
const gear = await deploy(bank, art.Gear, 'Gear', ['address', 'address'], [token.addr, server.addr]);
const items = await deploy(bank, art.Items, 'Items', ['address'], [token.addr]);
const exA = await deploy(bank, art.ExchangeA, 'ExchangeA', ['address', 'address'], [token.addr, gear.addr]);
const exB = await deploy(bank, art.ExchangeB, 'ExchangeB', ['address', 'address'], [token.addr, gear.addr]);
const deployed = [token, gear, items, exA, exB];

const T1_ETH = 5n * 10n ** 14n;
const EXPIRY = 4_000_000_000n;
const TOKENS = (n) => BigInt(n) * 10n ** 18n;
const giveTokens = (to, n = 10_000) => call(bank, token, 'transfer', [to.addr, TOKENS(n)]);
const mintedId = (r) => BigInt(bytesToHex(r.logs.at(-1)[1][3])); // the id is the last topic of gear's Transfer event
async function mintItem(who, kind) {
  who.items.push(mintedId(await call(who, gear, 'mint', [1, kind], { value: T1_ETH })));
}
/** A delver ready to enter: tokens, an approval, a kit of four, equipped. */
async function kitUp(who, equip = true) {
  await giveTokens(who);
  await call(who, token, 'approve', [gear.addr, maxUint256]);
  for (let k = 0; k < RUN.kit; k++) await mintItem(who, k);
  if (equip) await call(who, gear, 'equip', [who.items.slice(0, RUN.kit)]);
}
const sigParts = (sig) => [Number(sig.v ?? 27n + BigInt(sig.yParity)), sig.r, sig.s];
async function voucher(who, ids, durs) {
  const digest = keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'uint256' }],
    [keccak256(toHex('Unequip(uint256 chain,address gear,address wallet,bytes32 ids,uint256 durs,uint256 expiry)')), BigInt(CHAIN_ID), gear.addr, who.addr,
      keccak256(encodePacked(['uint256[]'], [ids])), durs, EXPIRY]));
  return [ids, durs, EXPIRY, ...sigParts(await sign({ hash: digest, privateKey: server.pkHex }))];
}

// ── the two 20-player groups and the two 85-player shards: every delver kitted and equipped by real transactions ──
for (const [gi, g] of [G1, G2, G3, G4].entries()) {
  for (const [i, who] of g.entries()) {
    const measured = gi === 0 && i === 5;
    await kitUp(who, !measured);
    if (measured) await measure('P2b', 'equip a kit of 4', who, gear, 'equip', [who.items.slice(0, 4)], { estimate: true });
  }
}

// ── P0 / P1 / P2: a new wallet arrives in a game that is already running ──
await giveTokens(newbie);
await measure('P0a', 'approve the token for one spender (once per wallet per contract)', newbie, token, 'approve', [gear.addr, maxUint256]);
newbie.items.push(mintedId(await measure('P1a', 'mint(tier 1) — the wallet\'s first item', newbie, gear, 'mint', [1, 0], { value: T1_ETH, estimate: true })));
newbie.items.push(mintedId(await measure('P1b', 'mint(tier 1) — a later item', newbie, gear, 'mint', [1, 1], { value: T1_ETH })));
await measure('P2a', 'equip 1 item', newbie, gear, 'equip', [[newbie.items[0]]]);

// ── runs ──
const kitWord = (ids, wear) => ids.reduce((w, id, j) => w | ((id | ((wear ? wear(id) : 0n) << 48n)) << BigInt(64 * j)), 0n);
const wearOf = (id) => 1n + (id * 7n) % 5n;
const runMetaKey = (runId) => keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [BigInt(runId), gear.slotOf.runMeta]));
function plan(runId, players, shape, lazy) {
  const dead = players.slice(0, shape.dead), alive = players.slice(shape.dead);
  const bits = dead.map((_, i) => shape.poolBits[i % shape.poolBits.length]);
  const pooled = dead.flatMap((d, i) => d.items.slice(0, 4).filter((_, j) => (bits[i] >> j) & 1));
  const survivors = alive.map((s, i) => BigInt(s.addr) | (BigInt(1 + (i * 37) % 97) << 160n)); // wallet | contribution weight
  const leaves = alive.flatMap((s) => s.items.slice(0, 4).map((id) => ({
    id, durAfter: 100n - wearOf(id),
    leaf: keccak256(encodeAbiParameters([{ type: 'uint32' }, { type: 'uint256' }, { type: 'uint16' }], [runId, id, Number(100n - wearOf(id))])),
  })));
  const levels = lazy ? merkle(leaves.map((l) => l.leaf)) : null;
  const p = {
    runId, dead, alive, pooled, leaves, levels, roster: players.map((x) => x.addr),
    commit: keccak256(toHex(`commit ${runId}`)), logHash: keccak256(toHex(`input log ${runId}`)),
    wearRoot: lazy ? levels.at(-1)[0] : ZERO32, survivorsHash: keccak256(encodePacked(['uint256[]'], [survivors])),
  };
  p.settleArgs = [runId, p.logHash, p.wearRoot,
    dead.map((d, i) => BigInt(d.addr) | (BigInt(bits[i]) << 160n)), dead.map((d) => kitWord(d.items.slice(0, 4))),
    survivors, lazy ? [] : alive.map((s) => kitWord(s.items.slice(0, 4), wearOf))];
  p.rollArgs = [runId, p.logHash, p.wearRoot, survivors, pooled];
  return p;
}
/** The roll, seeded with a REAL L2 block hash so that the local run and the live replay draw the same winners. */
async function measureRoll(id, label, p, opts = {}) {
  const meta = BigInt(shadow.get(`${gear.addr}:${runMetaKey(p.runId)}`));
  const localRollBlock = (meta >> 64n) & ((1n << 64n) - 1n);
  let patch, note = 'seed: stand-in hash (offline)';
  if (live.on) {
    try {
      const n = Number(BigInt(await rpc('eth_blockNumber', []))) - 30;
      const blk = await rpc('eth_getBlockByNumber', [numberToHex(n), false]);
      arb.hashes.set(localRollBlock, blk.hash);
      note = `seed: hash of live L2 block ${n}`;
      patch = (ov) => { // the replay must ask ArbSys for a block the live chain still serves
        const st = ov[gear.addr].state, key = runMetaKey(p.runId);
        st[key] = pad32((BigInt(st[key]) & ~(((1n << 64n) - 1n) << 64n)) | (BigInt(n) << 64n));
      };
    } catch (e) { live.failures.push(`${id}: could not fetch a live block hash (${e.message})`); }
  }
  const r = await measure(id, label, server, gear, 'rollLoot', p.rollArgs, { patch, note, ...opts });
  for (const itemId of p.pooled) { // every pooled item must now sit, free, in a survivor's vault
    const owner = (await view(gear, 'ownerOf', [itemId])).toLowerCase();
    const winner = p.alive.find((s) => s.addr === owner);
    if (!winner) throw new Error('the roll paid a non-survivor');
    winner.items.push(itemId);
  }
  return r;
}

// Run 1 — group A: roster marked in storage (first time), eager durability
const run1 = plan(1, G1, RUN, false);
await measure('S1L0', 'openRun, roster of 20 marked in storage — wallets never listed before', server, gear, 'openRunListed', [1, run1.commit, run1.roster]);
await measure('S2e', 'settleRun, 20 players: 2 dead (3 items pooled, 5 burned), EAGER wear on 72 items', server, gear, 'settleRun', run1.settleArgs, { estimate: true });
await measureRoll('S3', 'rollLoot: arbBlockHash, 3 pooled items among 18 survivors', run1, { estimate: true });

// P3 — leaving the wager, three ways
await measure('P3a1', 'unequip 1 item — server voucher (ecrecover), immediate', newbie, gear, 'unequip', await voucher(newbie, [newbie.items[0]], 0n));
await measure('P3a4', 'unequip a kit of 4 — server voucher (ecrecover), immediate', G1[5], gear, 'unequip', await voucher(G1[5], G1[5].items.slice(0, 4), 0n), { estimate: true });
{
  const who = G1[6], ids = who.items.slice(0, 4);
  await measure('P3b1-0', 'request unequip, kit of 4 — the wallet\'s first ever request', who, gear, 'requestUnequip', [ids]);
  await measure('P3b2', 'finalise unequip, kit of 4 — after the delay', who, gear, 'finaliseUnequip', [ids], { advance: 601n });
  await call(who, gear, 'equip', [ids]);
  await measure('P3b1', 'request unequip, kit of 4 — any later request', who, gear, 'requestUnequip', [ids]);
  await call(who, gear, 'finaliseUnequip', [ids], { advance: 601n });
}
await measure('P3c', 'unequip a kit of 4 — no voucher: the chain checks the roster (design L only)', G1[7], gear, 'unequipListed', [G1[7].items.slice(0, 4)]);
await measure('P4', 'repair(id): burn the token, restore durability', G1[5], gear, 'repair', [G1[5].items[0]]);

// S1 — the other ways to open
await measure('S1L', 'openRun, roster of 20 marked in storage — wallets listed before', server, gear, 'openRunListed', [3, keccak256(toHex('commit 3')), run1.roster]);
await measure('S1E', 'openRun, roster of 20 in calldata and an event, not in storage', server, gear, 'openRunLogged', [4, keccak256(toHex('commit 4')), run1.roster]);

// Run 2 — group B: only a commitment at open, lazy durability
const run2 = plan(2, G2, RUN, true);
await measure('S1H', 'openRun, commitment only — the roster hash is folded into it', server, gear, 'openRun', [2, run2.commit], { estimate: true });
await measure('S2z', 'settleRun, 20 players: 2 dead (3 pooled, 5 burned), LAZY wear — one root, no survivor item touched', server, gear, 'settleRun', run2.settleArgs);
await measureRoll('S3z', 'rollLoot after a lazy settle (the same code path as S3; other winners)', run2);
{
  const who = run2.alive[3], ids = who.items.slice(0, 4);
  const durs = ids.reduce((w, id, j) => w | ((100n - wearOf(id)) << BigInt(16 * j)), 0n);
  await measure('P3a4z', 'unequip a kit of 4 — the voucher also carries the 4 durabilities (lazy wear arrives here)', who, gear, 'unequip', await voucher(who, ids, durs));
  const leaf = run2.leaves[0];
  await measure('Z1', 'syncWear: one item, Merkle proof against the run\'s wear root (72 leaves)', run2.alive[0], gear, 'syncWear',
    [leaf.id, 2, Number(leaf.durAfter), run2.logHash, run2.survivorsHash, merkleProof(run2.levels, 0)]);
}

// Run 5 — shard C (85): commitment only, eager.  Run 6 — shard D (85): roster in storage, lazy.
const run5 = plan(5, G3, SHARD, false);
await call(server, gear, 'openRun', [5, run5.commit]);
await measure('S4e', 'settleRun, 85 players: 9 dead (12 pooled, 24 burned), EAGER wear on 304 items', server, gear, 'settleRun', run5.settleArgs, { estimate: true });
await measureRoll('S3-85', 'rollLoot: 12 pooled items among 76 survivors', run5);
const run6 = plan(6, G4, SHARD, true);
await measure('S1L0-85', 'openRun, roster of 85 marked in storage — wallets never listed before', server, gear, 'openRunListed', [6, run6.commit, run6.roster]);
await measure('S4z', 'settleRun, 85 players: 9 dead (12 pooled, 24 burned), LAZY wear', server, gear, 'settleRun', run6.settleArgs);
await measureRoll('S3z-85', 'rollLoot after a lazy settle, 12 among 76 (other winners)', run6);
{
  const leaf = run6.leaves[0];
  await measure('Z2', 'syncWear: one item, Merkle proof against the run\'s wear root (304 leaves)', run6.alive[0], gear, 'syncWear',
    [leaf.id, 6, Number(leaf.durAfter), run6.logHash, run6.survivorsHash, merkleProof(run6.levels, 0)]);
}

// ── P5: consumables ──
await giveTokens(quaffer);
await call(quaffer, token, 'approve', [items.addr, maxUint256]);
await measure('P5a', 'consumable: mint 1 unit — the wallet\'s first of that kind', quaffer, items, 'mint', [1n, 1n]);
await measure('P5b', 'consumable: mint 1 unit — it already holds some', quaffer, items, 'mint', [1n, 1n]);
await measure('P5c', 'consumable: use (burn) 1 unit — some left', quaffer, items, 'use', [1n, 1n]);
await measure('P5d', 'consumable: use (burn) 1 unit — the last one', quaffer, items, 'use', [1n, 1n]);

// ── P6: exchange design A, the book on chain. Both merchants hold token and gear; the exchange already holds both. ──
for (const who of [seller, buyer]) { await kitUp(who, false); for (let k = 0; k < 6; k++) await mintItem(who, k % 4); }
await call(buyer, token, 'approve', [exA.addr, maxUint256]);
await call(seller, token, 'approve', [exA.addr, maxUint256]);
await measure('P0b', 'setApprovalForAll: let one exchange move the wallet\'s gear (once per wallet per exchange)', seller, gear, 'setApprovalForAll', [exA.addr, true]);
await call(buyer, gear, 'setApprovalForAll', [exA.addr, true]);
const PRICE = TOKENS(250), PRICE_GWEI = 250n * 10n ** 9n;
await call(seller, exA, 'placeSell', [seller.items[9], PRICE]);  // standing offers, so that the exchange's own
await call(buyer, exA, 'placeBuy', [3, 1, 50, PRICE_GWEI]);      // balances are never zero in what follows
await measure('P6a', 'A: place a sell offer — the item goes into escrow', seller, exA, 'placeSell', [seller.items[0], PRICE], { estimate: true });
await measure('P6b', 'A: place a buy offer (kind, tier, min durability) — the token goes into escrow', buyer, exA, 'placeBuy', [1, 1, 50, PRICE_GWEI]);
await measure('P6c', 'A: fill a sell offer — item to buyer, token to seller, 5 % burned', buyer, exA, 'fillSell', [seller.items[0], PRICE], { estimate: true });
await measure('P6d', 'A: fill a buy offer — item to buyer, escrowed token to seller, 5 % burned', seller, exA, 'fillBuy', [2n, seller.items[1]]);
await call(seller, exA, 'placeSell', [seller.items[2], PRICE]);
await measure('P6e', 'A: cancel a sell offer — the item comes back', seller, exA, 'cancelSell', [seller.items[2]]);
await call(buyer, exA, 'placeBuy', [2, 1, 50, PRICE_GWEI]);
await measure('P6f', 'A: cancel a buy offer — the token comes back', buyer, exA, 'cancelBuy', [3n]);

// ── P7: exchange design B, signed orders ──
for (const who of [seller, buyer]) {
  await call(who, gear, 'setApprovalForAll', [exB.addr, true]);
  await call(who, token, 'approve', [exB.addr, maxUint256]);
}
const orderTypes = { Order: [{ name: 'maker', type: 'address' }, { name: 'sell', type: 'bool' }, { name: 'item', type: 'uint256' }, { name: 'price', type: 'uint256' }, { name: 'expiry', type: 'uint256' }, { name: 'nonce', type: 'uint256' }] };
async function signedOrder(maker, sell, item, nonce) {
  const o = { maker: maker.addr, sell, item, price: PRICE, expiry: EXPIRY, nonce };
  const sig = await privateKeyToAccount(maker.pkHex).signTypedData({
    domain: { name: 'Oubliette measuring stick', version: '0', chainId: CHAIN_ID, verifyingContract: exB.addr }, types: orderTypes, primaryType: 'Order', message: o,
  });
  return [o, ...sigParts(parseSignature(sig))];
}
await measure('P7a', 'B: fill a signed sell order — the maker\'s first order in a 256-nonce word', buyer, exB, 'fill', [...await signedOrder(seller, true, seller.items[3], 0n), seller.items[3]]);
await measure('P7b', 'B: fill a signed sell order — any later order in that word', buyer, exB, 'fill', [...await signedOrder(seller, true, seller.items[4], 1n), seller.items[4]], { estimate: true });
await call(buyer, exB, 'cancel', [0n]); // puts the buyer's nonce word in use
await measure('P7c', 'B: fill a signed buy order (kind, tier, min durability) — a later order in the word', seller, exB, 'fill', [...await signedOrder(buyer, false, 1n | (1n << 8n) | (50n << 16n), 1n), seller.items[5]]);
await measure('P7d', 'B: cancel a signed order on chain — first nonce in a fresh word', seller, exB, 'cancel', [256n]);
await measure('P7e', 'B: cancel a signed order on chain — a later nonce in that word', seller, exB, 'cancel', [257n]);

// ── D1: the input log ──
const d1 = (() => {
  const synth = synthInputs(INPUT_LOG);
  const all = encodeInputs(synth, INPUT_LOG.players, INPUT_LOG.tickHz, false);
  const shots = encodeInputs(synth, INPUT_LOG.players, INPUT_LOG.tickHz, true);
  const sink = acct('log sink').addr;
  const v = (label, bytes, records) => ({ label, records, ...postingCost(bytes, server, sink), payload: bytes });
  return {
    ticks: synth.ticks, playerTicks: synth.ticks * INPUT_LOG.players, sink,
    variants: {
      raw: v('raw: 2 bytes per player per tick', synth.raw),
      rawBrotli: v('raw, then brotli-11', brotli(synth.raw, 11)),
      delta: v('change records (every aim change)', all.bytes, all.records),
      deltaBrotli: v('change records, then brotli-11', brotli(all.bytes, 11)),
      shots: v('change records, aim logged on shot ticks only', shots.bytes, shots.records),
      shotsBrotli: v('the same, then brotli-11', brotli(shots.bytes, 11)),
    },
  };
})();
if (live.on) {
  // two real payloads replayed live as plain data transactions to an address with no code
  for (const key of ['shotsBrotli', 'deltaBrotli']) {
    const v = d1.variants[key];
    if (v.txs !== 1) continue;
    const data = bytesToHex(v.payload);
    try {
      const sim = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: [{ from: server.addr, to: d1.sink, data }] }], validation: false }, 'latest']);
      v.live = { gas: Number(BigInt(sim[0].calls[0].gasUsed)) };
    } catch (e) { live.failures.push(`D1 ${key}: ${e.message}`); }
  }
}

// ── history; receipts at the dearest sampled block; NodeInterface's quote there for a few actions ──
const history = await historyPromise;
let receipts = null;
const QUOTED = ['P1b', 'P2b', 'P7b', 'S2e', 'S3', 'S4e'];
if (live.on && history?.d7?.l1WorstBlock) {
  const tag = numberToHex(history.d7.l1WorstBlock);
  try { receipts = await receiptsCheck(history.d7.l1WorstBlock); } catch (e) { live.failures.push('receipts check: ' + e.message); }
  for (const row of rows.filter((r) => QUOTED.includes(r.id))) {
    try {
      const [o] = await rpcBatch([niCall('gasEstimateL1Component', row, tag)], { archive: true, tries: 3 });
      if (!o.error) { const d = sysDecode('gasEstimateL1Component', o.result); row.l1QuoteWorst = { gas: Number(d[0]), baseFee: Number(d[1]), l1PricePerUnit: Number(d[2]) }; }
    } catch { /* the archive endpoint gave up: the line is left out */ }
  }
}

// ═════════════════════════════ report ═════════════════════════════

const R = Object.fromEntries(rows.map((r) => [r.id, r]));
const h7 = history?.d7 || null;
// price sets: wei per L2 gas, wei per L1 data unit (a signed transaction is 16 units per brotli-1 byte)
const now = { base: Number(gasPrice), l1: live.on ? Number(live.facts.l1PricePerUnit) : 0 };
const l1Typical = h7 ? h7.l1Mean : now.l1;
const PRICES = {
  now, week: h7 ? { base: h7.baseFeeMean, l1: h7.l1Mean } : null, p95: h7 ? { base: h7.baseFeeP95, l1: h7.l1P95 } : null,
  x10: { base: now.base * 10, l1: l1Typical }, x100: { base: now.base * 100, l1: l1Typical },
};
const vec = (row, k = 1) => ({ gas: row.gas * k, l1Bytes: row.l1Bytes * k });
const add = (...vs) => vs.reduce((a, v) => ({ gas: a.gas + v.gas, l1Bytes: a.l1Bytes + v.l1Bytes }), { gas: 0, l1Bytes: 0 });
const scaleVec = (v, k) => ({ gas: v.gas * k, l1Bytes: v.l1Bytes * k });
const usd = (v, p) => (p ? (v.gas * p.base + 16 * v.l1Bytes * p.l1) / 1e18 * eth.usd : null);
const money = (v) => ['now', 'week', 'p95', 'x10', 'x100'].map((k) => fmtUsd(usd(v, PRICES[k])));
const MONEY_HEAD = ['USD now', 'USD 7d mean', 'USD p95', 'USD x10', 'USD x100'];

say('CHAIN (live, read-only)' + (live.on ? '' : ' — OFFLINE: nothing below was checked against the chain'));
if (live.on) {
  const f = live.facts, b = f.blockHashCheck;
  say(`  chain id ${f.chainId} · ${f.client} · ArbOS ${f.arbOS} · L2 height ${fmtInt(f.head)} at ${new Date(f.headTime * 1000).toISOString()}`);
  say(`  eth_gasPrice ${fmtInt(f.gasPrice)} wei (${Number(f.gasPrice) / 1e9} gwei) · base fee ${fmtInt(f.baseFee)} · minimum ${fmtInt(f.minGasPrice)} · priority fee ${f.priorityFee}`);
  say(`  L1 data: ${fmtInt(f.l1PricePerUnit)} wei per unit now (ArbGasInfo.getL1BaseFeeEstimate) · brotli level ${f.brotliLevel}`);
  say(`  limits: ${fmtInt(f.maxTxGas)} gas per transaction · ${fmtInt(f.maxBlockGas)} per block · speed limit ${fmtInt(f.speedLimitPerSecond)} gas/s` +
    (f.pricingConstraints ? ' · pricing targets ' + f.pricingConstraints.map((c) => `${fmtInt(c.targetGasPerSecond)} gas/s over ${fmtInt(c.windowSeconds)} s`).join(', ') : ''));
  if (f.recentGasPerBlock && history?.blocksPerSecond) say(`  load now: ${fmtInt(f.recentGasPerBlock)} gas per block over 20 blocks x ${history.blocksPerSecond.toFixed(2)} blocks/s = ${fmtInt(f.recentGasPerBlock * history.blocksPerSecond)} gas/s`);
  say(`  calldata: 1,000 non-zero bytes to an empty address cost ${fmtInt(f.gasFor1000NonZeroBytes)} gas -> EIP-7623 floor ${f.calldataFloor ? 'PRESENT (Cancun rules would under-count)' : 'absent (21,000 + 16,000): Cancun rules match'}`);
  say(`  block hashes: ArbSys.arbBlockHash(${b.block}) ${b.arbSysMatches ? '==' : '!='} the RPC's hash; EIP-2935 history contract ${b.history2935Matches ? '==' : '!='} the RPC's hash.`);
  say(`    100,000 blocks back: history ${b.history2935MatchesFar ? '== the RPC\'s hash' : 'no match'}, ArbSys ${b.arbSysServesFar ? 'serves it' : 'reverts'}. History serves 393,000 back: ${b.historyServes393000Back ? 'yes' : 'no'}; 393,400 back: ${b.historyServes393400Back ? 'yes' : 'no'}.`);
}
say(`  ETH/USD ${eth.usd} — ${eth.source}`);
if (h7) {
  say(`  7 days back (${h7.hours} hourly samples${h7.from ? ', from ' + h7.from : ''}; ${history.blocksPerSecond.toFixed(2)} blocks/s; archive endpoint):`);
  say(`    base fee, ${fmtInt(h7.baseFeeSamples)} blocks via eth_feeHistory: min ${fmtInt(h7.baseFeeMin)} · mean ${fmtInt(h7.baseFeeMean)} · p50 ${fmtInt(h7.baseFeeP50)} · p95 ${fmtInt(h7.baseFeeP95)} · max ${fmtInt(h7.baseFeeMax)} wei`);
  say(`    L1 unit price, ${h7.l1Samples} samples: zero in ${h7.l1Samples - h7.l1NonZero}, non-zero in ${h7.l1NonZero} · mean ${fmtInt(h7.l1Mean)} · p50 ${fmtInt(h7.l1P50)} · p95 ${fmtInt(h7.l1P95)} · max ${fmtInt(h7.l1Max)} wei` + (h7.l1WorstBlock ? ` (block ${h7.l1WorstBlock}${h7.l1WorstTime ? ', ' + h7.l1WorstTime : ''})` : ''));
  if (history.d30) say(`  30 days back (${history.d30.hours} samples): base fee mean ${fmtInt(history.d30.baseFeeMean)} · p95 ${fmtInt(history.d30.baseFeeP95)} · max ${fmtInt(history.d30.baseFeeMax)}; L1 unit price mean ${fmtInt(history.d30.l1Mean)} · p95 ${fmtInt(history.d30.l1P95)} · max ${fmtInt(history.d30.l1Max)} wei`);
  if (history.recent) say(`  last ${history.recent.blocks} blocks: base fee p50 ${fmtInt(history.recent.p50)} · p95 ${fmtInt(history.recent.p95)} · max ${fmtInt(history.recent.max)} wei`);
  if (history.failed) say(`  (${history.failed} sample hours failed and are missing)`);
} else if (live.on) say('  !! no archive endpoint answered: the 7-day columns are empty and x10 / x100 carry the L1 price of this moment');
say(`  ArbSys inside the precompile: arbBlockNumber ${calib.number} gas, arbBlockHash ${calib.hash} gas — ${calib.source}`);
if (calib.liveHistory) say(`    a whole transaction that stores one block hash: via ArbSys ${fmtInt(calib.liveHash)} gas; via the EIP-2935 history contract ${fmtInt(calib.liveHistory)} (5 back), ${fmtInt(calib.liveHistoryFar)} (100,000 back)`);
say();

say('PRICE BASIS');
say('  wei = L2 gas x base fee  +  16 x (brotli-1 bytes of the signed transaction) x L1 unit price.      USD = wei x ETH/USD / 1e18.');
if (receipts) say(`  The L1 term reproduces ${receipts.exact} of ${receipts.checked} real receipts (gasUsedForL1) to the unit, block ${receipts.block}+` + (receipts.quoteOverReceipt.length ? `; NodeInterface quotes ${Math.min(...receipts.quoteOverReceipt).toFixed(2)}x-${Math.max(...receipts.quoteOverReceipt).toFixed(2)}x what those receipts paid (it pads).` : '.'));
say(`  now      base fee ${fmtInt(PRICES.now.base)} (eth_gasPrice) · L1 unit ${fmtInt(PRICES.now.l1)} wei`);
if (h7) {
  say(`  7d mean  base fee ${fmtInt(PRICES.week.base)} · L1 unit ${fmtInt(PRICES.week.l1)} wei`);
  say(`  p95      base fee ${fmtInt(PRICES.p95.base)} · L1 unit ${fmtInt(PRICES.p95.l1)} wei (each its own 95th percentile of the 7-day sample)`);
}
say(`  x10, x100   base fee = now x 10, x 100 · L1 unit ${fmtInt(l1Typical)} wei (${h7 ? 'the 7-day mean' : 'now'})`);
say();

say('ACTIONS — one fresh transaction each. L2 gas is execution gas as a receipt shows it, after refunds. L1 B = brotli-1 bytes.');
const order = ['P0a', 'P0b', 'P1a', 'P1b', 'P2a', 'P2b', 'P3a1', 'P3a4', 'P3a4z', 'P3b1-0', 'P3b1', 'P3b2', 'P3c', 'P4', 'P5a', 'P5b', 'P5c', 'P5d',
  'P6a', 'P6b', 'P6c', 'P6d', 'P6e', 'P6f', 'P7a', 'P7b', 'P7c', 'P7d', 'P7e',
  'S1H', 'S1E', 'S1L0', 'S1L', 'S1L0-85', 'S2e', 'S2z', 'S3', 'S3z', 'S4e', 'S4z', 'S3-85', 'S3z-85', 'Z1', 'Z2'];
table(['id', 'action', 'L2 gas', 'live', 'gap', 'L1 B', ...MONEY_HEAD],
  order.filter((id) => R[id]).map((id) => {
    const r = R[id];
    return [id, r.label, fmtInt(r.gas), r.live ? fmtInt(r.live.gas) : 'n/a', r.live ? (r.live.ok ? String(r.live.gas - r.gas) : 'REVERT') : '', fmtInt(r.l1Bytes), ...money(vec(r))];
  }),
  ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']);
say();

// ── local against live ──
const replayed = rows.filter((r) => r.live);
const gaps = replayed.filter((r) => !r.live.ok || r.live.gas !== r.gas);
say('LOCAL AGAINST LIVE');
if (!live.on) say('  not run (offline).');
else {
  say(`  ${replayed.length} of ${rows.length} actions replayed on chain ${CHAIN_ID} (eth_simulateV1 + state override); ${replayed.length - gaps.length} match the local EVM to the gas unit.`);
  for (const r of gaps) say(`  GAP ${r.id}: local ${fmtInt(r.gas)}, live ${r.live.ok ? fmtInt(r.live.gas) : 'reverted — ' + r.live.error} (${r.live.ok ? r.live.gas - r.gas : 'n/a'})`);
  if (calib.liveNumber) {
    say(`  The one gap there would have been: ArbSys. A local stand-in that charged nothing would under-count by ${calib.number} gas per arbBlockNumber`);
    say(`  and ${calib.hash} per arbBlockHash (live ${fmtInt(calib.liveNumber)} / ${fmtInt(calib.liveHash)} against local ${fmtInt(calib.localNumberAtZeroCost)} / ${fmtInt(calib.localHashAtZeroCost)} at zero cost) — one call in each of S1, S2, S4 and S3.`);
    say('  The stand-in is charged those amounts, and each roll is seeded with a real L2 block hash, so the replays above are like for like.');
  }
  const est = rows.filter((r) => r.estimate);
  if (est.length) {
    say('  eth_estimateGas, same override — the gas LIMIT a wallet would set. It must cover the refund before it is given back, and it is found by bisection:');
    for (const r of est) say(`    ${r.id.padEnd(5)} used ${fmtInt(r.gas).padStart(9)} · used + refund ${fmtInt(r.gas + r.refund).padStart(9)} · estimate ${fmtInt(r.estimate).padStart(9)} (+${((r.estimate / r.gas - 1) * 100).toFixed(1)} %) · NodeInterface L1 part now ${r.l1Quote ? r.l1Quote.gas : 'n/a'} / padded ${r.l1QuotePadded ?? 'n/a'}`);
  }
  const quoted = rows.filter((r) => r.l1QuoteWorst);
  if (quoted.length) {
    const w = quoted[0].l1QuoteWorst;
    say(`  L1 at the dearest sampled moment of the week (block ${h7.l1WorstBlock}: L1 unit ${fmtInt(w.l1PricePerUnit)} wei, base fee ${fmtInt(w.baseFee)}), in gas-equivalents:`);
    for (const r of quoted) {
      const formula = Math.floor(16 * r.l1Bytes * r.l1QuoteWorst.l1PricePerUnit / r.l1QuoteWorst.baseFee);
      say(`    ${r.id.padEnd(5)} L2 ${fmtInt(r.gas).padStart(9)} + L1 ${fmtInt(formula).padStart(7)} by the formula (+${(formula / r.gas * 100).toFixed(0)} %) · NodeInterface quote ${fmtInt(r.l1QuoteWorst.gas)}`);
    }
  }
  for (const f of live.failures) say(`  !! ${f}`);
}
say();

// ── design comparisons ──
const pct = (a, b) => ((a / b - 1) * 100).toFixed(1) + ' %';
const avg = (...ids) => scaleVec(add(...ids.map((id) => vec(R[id]))), 1 / ids.length);
say('DESIGN COMPARISONS (L2 gas)');
const tradeA = { sell: R.P6a.gas + R.P6c.gas, buy: R.P6b.gas + R.P6d.gas };
say(`  exchange, one completed trade (maker + taker):  A sell-side ${fmtInt(R.P6a.gas)} + ${fmtInt(R.P6c.gas)} = ${fmtInt(tradeA.sell)} · A buy-side ${fmtInt(R.P6b.gas)} + ${fmtInt(R.P6d.gas)} = ${fmtInt(tradeA.buy)}`);
say(`      B sell order 0 + ${fmtInt(R.P7b.gas)} (${pct(R.P7b.gas, tradeA.sell)}) · B buy order 0 + ${fmtInt(R.P7c.gas)} (${pct(R.P7c.gas, tradeA.buy)}); a maker's first order in a nonce word +${fmtInt(R.P7a.gas - R.P7b.gas)}`);
say(`      an offer placed and then cancelled:  A ${fmtInt(R.P6a.gas + R.P6e.gas)} (sell) / ${fmtInt(R.P6b.gas + R.P6f.gas)} (buy) · B ${fmtInt(R.P7e.gas)} on chain, or 0 if the book is trusted to drop it`);
const perItem20 = (R.S2e.gas - R.S2z.gas) / 72, perItem85 = (R.S4e.gas - R.S4z.gas) / 304;
say(`  durability at settle, 20 players:  eager ${fmtInt(R.S2e.gas)} · lazy ${fmtInt(R.S2z.gas)} · saved ${fmtInt(R.S2e.gas - R.S2z.gas)} = ${fmtInt(perItem20)} per surviving item`);
say(`      85 players:  eager ${fmtInt(R.S4e.gas)} · lazy ${fmtInt(R.S4z.gas)} · saved ${fmtInt(R.S4e.gas - R.S4z.gas)} = ${fmtInt(perItem85)} per surviving item`);
say(`      the later touch, inside the unequip voucher: +${fmtInt(R.P3a4z.gas - R.P3a4.gas)} gas for a kit of 4 (${fmtInt(R.P3a4z.gas)} against ${fmtInt(R.P3a4.gas)}), paid by the player, once per unequip`);
say(`      the later touch, as its own transaction with a Merkle proof: ${fmtInt(R.Z1.gas)} per item (72 leaves) / ${fmtInt(R.Z2.gas)} (304 leaves) — ${(R.Z1.gas / perItem20).toFixed(1)}x the ${fmtInt(perItem20)} it saved`);
say(`  roster at open, 20 players:  commitment only ${fmtInt(R.S1H.gas)} · calldata + event ${fmtInt(R.S1E.gas)} (+${fmtInt(R.S1E.gas - R.S1H.gas)}) · storage, wallets seen before ${fmtInt(R.S1L.gas)} (+${fmtInt(R.S1L.gas - R.S1H.gas)}) · storage, new wallets ${fmtInt(R.S1L0.gas)} (+${fmtInt(R.S1L0.gas - R.S1H.gas)})`);
say(`      85 new wallets in storage: ${fmtInt(R['S1L0-85'].gas)}.  What the listing buys a player: unequip for ${fmtInt(R.P3c.gas)} (chain-checked) against ${fmtInt(R.P3a4.gas)} (voucher) or ${fmtInt(R.P3b1.gas)} + ${fmtInt(R.P3b2.gas)} = ${fmtInt(R.P3b1.gas + R.P3b2.gas)} (request + finalise)`);
const perPlayer = (R.S4e.gas - R.S2e.gas) / (SHARD.players - RUN.players);
const fixedPart = R.S2e.gas - perPlayer * RUN.players;
const maxTx = Number(live.on ? live.facts.maxTxGas : TX_GAS_LIMIT);
const biggest = Math.max(R.S4e.gas, R['S1L0-85'].gas);
say(`  limits at 85:  the dearest transaction is ${fmtInt(biggest)} gas = ${(biggest / maxTx * 100).toFixed(1)} % of the ${fmtInt(maxTx)} per-transaction limit (the per-block limit is the same number);`);
say(`      its calldata is ${fmtInt(R.S4e.calldataBytes)} bytes against a ${fmtInt(SEQUENCER_MAX_TX_BYTES)}-byte sequencer limit. Eager settle grows ${fmtInt(perPlayer)} gas per player`);
say(`      (a line through the 20- and 85-player points), so one transaction would hold about ${fmtInt(Math.floor((maxTx - fixedPart) / perPlayer))} players.`);
say();

// ── scenarios ──
const D = DELVER_DAY;
const aAction = add(scaleVec(avg('P6a', 'P6b'), EXCHANGE_MIX.place), scaleVec(avg('P6c', 'P6d'), EXCHANGE_MIX.fill), scaleVec(avg('P6e', 'P6f'), EXCHANGE_MIX.cancel));
const bAction = add(scaleVec(avg('P7b', 'P7c'), EXCHANGE_MIX.fill), scaleVec(vec(R.P7e), EXCHANGE_MIX.cancel)); // placing is a signature: no gas
const delver = (unequip, exchange) => add(vec(R.P2b, D.equips), scaleVec(unequip, D.unequips), vec(R.P4, D.repairs), vec(R.P1b, D.mints), scaleVec(exchange, D.exchange));
const playerDay = {
  'voucher unequip, exchange B': delver(vec(R.P3a4), bAction),
  'voucher unequip, exchange A': delver(vec(R.P3a4), aAction),
  'request + finalise unequip, exchange A': delver(add(vec(R.P3b1), vec(R.P3b2)), aAction),
};
const serverRun = {
  'commitment only + lazy wear': add(vec(R.S1H), vec(R.S2z), vec(R.S3z)),
  'commitment only + eager wear': add(vec(R.S1H), vec(R.S2e), vec(R.S3)),
  'roster in storage + eager wear': add(vec(R.S1L), vec(R.S2e), vec(R.S3)),
};
const serverShard = {
  'commitment only + lazy wear': add(vec(R.S1H), vec(R.S4z), vec(R['S3z-85'])),
  'commitment only + eager wear': add(vec(R.S1H), vec(R.S4e), vec(R['S3-85'])),
};
const cols = ['', 'L2 gas', 'L1 B', ...MONEY_HEAD];
const al = ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r'];
const line = (k, v) => [k, fmtInt(v.gas), fmtInt(v.l1Bytes), ...money(v)];

say('SCENARIOS');
say(`  assumptions: a delver-day = ${D.runs} runs, ${D.equips} equip (P2b) + ${D.unequips} unequip of a kit of 4, ${D.repairs} repairs (P4), ${D.mints} mints (P1b), ${D.exchange} exchange actions.`);
say(`  one exchange action = ${EXCHANGE_MIX.place * 100} % place, ${EXCHANGE_MIX.fill * 100} % fill, ${EXCHANGE_MIX.cancel * 100} % cancel, sell side and buy side equally:`);
say(`    A = ${EXCHANGE_MIX.place} x (${fmtInt(R.P6a.gas)} + ${fmtInt(R.P6b.gas)})/2 + ${EXCHANGE_MIX.fill} x (${fmtInt(R.P6c.gas)} + ${fmtInt(R.P6d.gas)})/2 + ${EXCHANGE_MIX.cancel} x (${fmtInt(R.P6e.gas)} + ${fmtInt(R.P6f.gas)})/2 = ${fmtInt(aAction.gas)} gas`);
say(`    B = ${EXCHANGE_MIX.place} x 0 + ${EXCHANGE_MIX.fill} x (${fmtInt(R.P7b.gas)} + ${fmtInt(R.P7c.gas)})/2 + ${EXCHANGE_MIX.cancel} x ${fmtInt(R.P7e.gas)} = ${fmtInt(bAction.gas)} gas`);
say(`  the player signs nothing per run. A run has ${RUN.players} players, so a delver-day takes ${D.runs}/${RUN.players} = ${D.runs / RUN.players} of a run from the operator.`);
say('  not in a day: the one-time approvals (P0a, P0b) and deployment.');
say();
say('(a) one delver-day — what the PLAYER signs and pays');
table(cols, Object.entries(playerDay).map(([k, v]) => line(k, v)), al);
say();
say('(b) one 20-player run — what the OPERATOR pays (open + settle + roll)');
table(cols, Object.entries(serverRun).map(([k, v]) => line(k, v)), al);
say('    and one 85-player shard run:');
table(cols, Object.entries(serverShard).map(([k, v]) => line(k, v)), al);
say();
const perDelver = (v) => scaleVec(v, D.runs / RUN.players);
for (const [tag, n] of [['(c)', 1000], ['(d)', 50_000]]) {
  const runs = n * D.runs / RUN.players, shardRuns = n * D.runs / SHARD.players;
  say(`${tag} one day at ${fmtInt(n)} daily delvers = ${fmtInt(n * D.runs)} delver-runs = ${fmtInt(runs)} runs of 20 (or ${shardRuns.toFixed(1)} of 85)`);
  table(cols, [
    ...Object.entries(playerDay).map(([k, v]) => line(`players: ${k}`, scaleVec(v, n))),
    ...Object.entries(serverRun).map(([k, v]) => line(`operator, runs of 20: ${k}`, scaleVec(v, runs))),
    ...Object.entries(serverShard).map(([k, v]) => line(`operator, runs of 85: ${k}`, scaleVec(v, shardRuns))),
  ], al);
  const lo = scaleVec(add(playerDay['voucher unequip, exchange B'], perDelver(serverRun['commitment only + lazy wear'])), n);
  const hi = scaleVec(add(playerDay['request + finalise unequip, exchange A'], perDelver(serverRun['roster in storage + eager wear'])), n);
  say(`    the whole game, cheapest to dearest design: ${fmtInt(lo.gas)} .. ${fmtInt(hi.gas)} gas a day = ${fmtInt(lo.gas / 86400)} .. ${fmtInt(hi.gas / 86400)} gas/s` +
    (live.on && live.facts.pricingConstraints ? ` against a long-window pricing target of ${fmtInt(live.facts.pricingConstraints.at(-1).targetGasPerSecond)} gas/s` : ''));
  say();
}

// ── D1 ──
say('D1 — THE INPUT LOG');
say(`  ${INPUT_LOG.players} players x ${INPUT_LOG.tickHz} ticks/s x ${INPUT_LOG.seconds} s = ${fmtInt(d1.playerTicks)} player-ticks, 2 bytes each (move + buttons, aim). Synthetic players, seed ${INPUT_LOG.seed}:`);
say(`  ${JSON.stringify(INPUT_MODEL)}`);
say(`  posted as plain calldata (21,000 + 4 per zero byte + 16 per non-zero byte), ${fmtInt(SEQUENCER_MAX_TX_BYTES - 1000)} bytes to a transaction:`);
table(['encoding', 'bytes', 'records', 'txs', 'L2 gas', 'L1 B', ...MONEY_HEAD],
  Object.values(d1.variants).map((v) => [v.label, fmtInt(v.bytes), v.records ? fmtInt(v.records) : '', v.txs, fmtInt(v.gas), fmtInt(v.l1Bytes), ...money(v)]),
  ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']);
const hashOnly = { gas: 512, l1Bytes: 32 };
say(`  the 32-byte hash instead: 32 x 16 = 512 gas of calldata inside settleRun, already counted in S2 / S4: ${money(hashOnly).join(' / ')}. No extra storage — it is hashed into the run's one result word.`);
for (const [k, v] of Object.entries(d1.variants)) if (v.live) say(`  live check (${k} as one data transaction): ${fmtInt(v.live.gas)} gas on chain against ${fmtInt(v.gas)} computed`);
const logDay = (n) => scaleVec(d1.variants.deltaBrotli, n * D.runs / RUN.players);
say(`  posting every run's log (change records + brotli) for a day: 1,000 delvers ${money(logDay(1000)).join(' / ')};  50,000 delvers ${money(logDay(50_000)).join(' / ')}`);
say();

say('ONE-OFF: DEPLOYMENT (operator; L2 gas only)');
table(['contract', 'runtime bytes', 'gas', 'USD now', 'USD x100'], [...deployed, probe].map((c) => [c.name, fmtInt(c.codeBytes), fmtInt(c.deployGas), fmtUsd(usd({ gas: c.deployGas, l1Bytes: 0 }, PRICES.now)), fmtUsd(usd({ gas: c.deployGas, l1Bytes: 0 }, PRICES.x100))]), ['l', 'r', 'r', 'r', 'r']);
say();
say(`${txCount} local transactions · ${rpcStats.calls} RPC calls (${Object.entries(rpcStats.byEndpoint).map(([k, v]) => `${k} ${v}`).join(', ')}; ${rpcStats.retries} retries) · ${((Date.now() - started) / 1000).toFixed(0)} s · Measure.sol ${sourceLines} lines`);

// ── files ──
fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'out', 'gas.txt'), lines.join('\n') + '\n');
const usdAll = (v) => Object.fromEntries(['now', 'week', 'p95', 'x10', 'x100'].map((k) => [k, usd(v, PRICES[k])]));
const withUsd = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { ...v, usd: usdAll(v) }]));
const json = {
  warning: 'A measuring stick, not the contracts. Nothing should be built on it.',
  runAt: new Date().toISOString(),
  toolchain: { node: process.version, solc: solc.version(), evm: '@ethereumjs/vm 10.1.3', rules: 'cancun', optimizer: { enabled: true, runs: 200 } },
  live: { on: live.on, facts: live.facts, failures: live.failures, rpc: rpcStats },
  price: { ethUsd: eth.usd, ethUsdSource: eth.source, formula: 'wei = L2 gas x base + 16 x l1Bytes x l1', sets: PRICES },
  history: history ? { blocksPerSecond: history.blocksPerSecond, recent: history.recent, d7: history.d7, d30: history.d30, failed: history.failed, points: history.points.map((p) => ({ hoursBack: p.hoursBack, block: p.block, baseFee: p.baseFees[0], l1PricePerUnit: p.l1 })) } : null,
  receiptsCheck: receipts,
  arbSys: calib,
  assumptions: { RUN, SHARD, DELVER_DAY, EXCHANGE_MIX, INPUT_LOG, INPUT_MODEL, TX_GAS_LIMIT, SEQUENCER_MAX_TX_BYTES },
  actions: rows.map(({ touched, data, ...r }) => ({ ...r, usd: usdAll(vec(r)) })),
  scenarios: { exchangeAction: withUsd({ A: aAction, B: bAction }), playerDay: withUsd(playerDay), serverRun: withUsd(serverRun), serverShard: withUsd(serverShard) },
  inputLog: { ticks: d1.ticks, playerTicks: d1.playerTicks, variants: Object.fromEntries(Object.entries(d1.variants).map(([k, { payload, ...v }]) => [k, { ...v, usd: usdAll(v) }])) },
  deployment: [...deployed, probe].map((c) => ({ name: c.name, runtimeBytes: c.codeBytes, gas: c.deployGas })),
};
fs.writeFileSync(path.join(HERE, 'out', 'gas.json'), JSON.stringify(json, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n');
console.log(`\nwrote ${path.join(HERE, 'out', 'gas.txt')} and ${path.join(HERE, 'out', 'gas.json')}`);
