// The browser client: a renderer with a keyboard, as SPEC §3.4 wants it. It draws the state the
// simulation hands it from the art bank's sprites, feeds it the player's input, records the log,
// and can play any saved log back and say whether this browser agrees with the hash.
import { createRun, step, settle, stateHash, freshKit, IDLE, type RunState, type Input, type RunConfig, type RunResult, type Event, type Delver } from "./sim.ts";
import { Recorder, type InputLog } from "./log.ts";
import { Squad, PROFILE } from "./bots.ts";
import { Rng, seedFrom, hashInts } from "./rng.ts";
import * as C from "./content.ts";
import { ONE, TILE } from "./fixed.ts";
import { MW, MH, T_FLOOR, T_WALL, T_DOOR, tileAt, inBossRoom, tileCentre, type World } from "./world.ts";

declare const OUB_ART: any;
const A = OUB_ART;
const PAL: Record<string, string> = A.palette;
const $ = (id: string): HTMLElement => document.getElementById(id)!;
const RM = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const NAMES = ["Vell", "Odric", "Tamsin", "Hesper", "Corwin", "Ilse", "Marrow", "Tobin", "Wenna", "Aldous", "Brisca", "Dunstan", "Elowen", "Fenwick", "Gisla", "Hamund", "Idony", "Jory", "Keturah"];
const ROMAN = ["", "I", "II", "III"];
const SKILL_NOTES = ["dash through bolts", "heal all nearby", "a heavy strike"];

/* ---------- sprites from the bank ---------- */
type Cv = HTMLCanvasElement;
interface Bundle { c: Cv; f: Cv; w: Cv; wf: Cv }
function cv(w: number, h: number): Cv { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function flipH(c: Cv): Cv { const o = cv(c.width, c.height), g = o.getContext("2d")!; g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return o; }
function whiten(c: Cv): Cv { const o = cv(c.width, c.height), g = o.getContext("2d")!; g.drawImage(c, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); return o; }
function bundle(c: Cv): Bundle { const w = whiten(c); return { c, f: flipH(c), w, wf: flipH(w) }; }
function look(id: string, label: string | null, frame = 0): Cv {
  const d = A.sprites[id]; const ls = A.looks(d); const l = label ? ls.find((x: any) => x.label === label) ?? ls[0] : ls[0];
  return A.draw(d, l.map, frame);
}
const S: any = {}, TILES: any = {};
function buildSprites(): void {
  const dl = A.sprites.lamplighter, looks = A.looks(dl);
  S.delver = looks.map((l: any) => [bundle(A.draw(dl, l.map, 0)), bundle(A.draw(dl, l.map, 1))]);
  S.forgotten = bundle(look("forgotten", null)); S.shade = bundle(look("shade", null)); S.gaoler = bundle(look("gaoler", null)); S.turnkey = bundle(look("turnkey", null));
  S.torch = [0, 1, 2].map((f) => look("torch", null, f));
  S.bag = [null, look("bag", null), look("bag", "Tier II"), look("bag", "Tier III")];
  S.grave = look("grave", null); S.bone = look("bone", null); S.skull = look("skull", null); S.flask = look("draught", null);
  S.b = { bolt: look("bolt", null), bolt2: look("bolt", "Bolt II"), ally: look("bolt", "Other delvers"), bolt_heavy: look("bolt_heavy", null), bone: look("orb", null), purple: look("orb", "Shade shot"), red: look("orb", "Blood shot"), orange: look("orb", "Ember shot"), big: look("orb_heavy", null) };
  S.bcol = { bolt: "#5fd1b5", bolt2: "#5fd1b5", ally: "#2f8f83", bolt_heavy: "#5fd1b5", bone: "#d9cfb4", purple: "#a678e0", red: "#c22a3a", orange: "#e8822e", big: "#e8822e" };
  S.icon = {};
  for (const id in C.ITEMS) { const it = C.ITEMS[id]; const ls = A.looks(A.sprites[it.sprite]); S.icon[id] = A.draw(A.sprites[it.sprite], (ls[it.look] ?? ls[0]).map, 0); }
  const th = A.themes.gaol, r = A.mulberry(77);
  TILES.floor = [A.tile.floor(th, r, 0), A.tile.floor(th, r, 0), A.tile.floor(th, r, 0), A.tile.floor(th, r, 1), A.tile.floor(th, r, 2)];
  TILES.face = [A.tile.face(th, r), A.tile.face(th, r)]; TILES.top = A.tile.top(th, r);
}

/* ---------- the map, drawn once per dungeon ---------- */
let mapCv: Cv, torches: { x: number; y: number; ph: number }[] = [];
function prerender(w: World): void {
  const rng = A.mulberry(w.seed);
  mapCv = cv(MW * 16, MH * 16); const g = mapCv.getContext("2d")!; g.fillStyle = PAL.k; g.fillRect(0, 0, mapCv.width, mapCv.height); torches = [];
  const at = (x: number, y: number): number => tileAt(w, x, y);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), px = x * 16, py = y * 16;
    if (t === T_FLOOR || t === T_DOOR) {
      const fv = rng(); g.drawImage(TILES.floor[fv < .86 ? (fv * 30 | 0) % 3 : fv < .93 ? 3 : 4], px, py);
      if (at(x, y - 1) === T_WALL) { g.fillStyle = "rgba(8,6,14,.45)"; g.fillRect(px, py, 16, 3); g.fillStyle = "rgba(8,6,14,.25)"; g.fillRect(px, py + 3, 16, 2); }
    } else if (t === T_WALL) {
      if (at(x, y + 1) === T_FLOOR || at(x, y + 1) === T_DOOR) {
        g.drawImage(TILES.face[(x + y) & 1], px, py);
        if ((x * 7 + y * 13) % 5 === 0) torches.push({ x: px + 8, y: py + 8, ph: (x * 31 + y * 17) % 64 });
      } else {
        g.drawImage(TILES.top, px, py); g.fillStyle = PAL["3"];
        if (at(x, y - 1) === T_FLOOR) g.fillRect(px, py, 16, 2);
        if (at(x - 1, y) === T_FLOOR) g.fillRect(px, py, 2, 16);
        if (at(x + 1, y) === T_FLOOR) g.fillRect(px + 14, py, 2, 16);
      }
    }
  }
  const br = w.rooms[5], bcx = (br.x + br.w / 2) * 16, bcy = (br.y + br.h / 2) * 16;
  for (let a = 0; a < 6.2832; a += .004) for (const rr of [[104, 72], [97, 66]]) {
    const X = Math.round(bcx + Math.cos(a) * rr[0]), Y = Math.round(bcy + Math.sin(a) * rr[1]);
    if (at(X >> 4, Y >> 4) === T_FLOOR) { g.fillStyle = PAL.d; g.fillRect(X, Y, 1, 1); }
  }
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.2832, X = Math.round(bcx + Math.cos(a) * 100.5), Y = Math.round(bcy + Math.sin(a) * 69); if (at(X >> 4, Y >> 4) === T_FLOOR) { g.fillStyle = PAL.t; g.fillRect(X - 1, Y, 3, 1); g.fillRect(X, Y - 1, 1, 3); } }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (at(x, y) !== T_FLOOR) continue; const px = x * 16, py = y * 16, q = rng();
    if (q < .03) g.drawImage(S.bone, px + 3 + (rng() * 4 | 0), py + 5 + (rng() * 5 | 0));
    else if (q < .042) g.drawImage(S.skull, px + 4, py + 5);
    else if (q < .065) { g.fillStyle = "#120f1a"; g.fillRect(px + 3, py + 6, 9, 4); g.fillRect(px + 5, py + 5, 6, 6); g.fillStyle = PAL["4"]; g.fillRect(px + 6, py + 6, 2, 1); }
    else if (q < .085 && x > w.rooms[2].x) { g.fillStyle = "#3a1220"; for (let i = 0; i < 7; i++) g.fillRect(px + 4 + (rng() * 8 | 0), py + 4 + (rng() * 8 | 0), 1 + (rng() * 2 | 0), 1); }
  }
}

/* ---------- session state ---------- */
type Mode = "hall" | "live" | "replay";
let mode: Mode = "hall";
let run: RunState | null = null, squad: Squad | null = null, rec: Recorder | null = null, result: RunResult | null = null;
let replayLog: InputLog | null = null, replayFi = 0, replayCi = 0, replayCur: Input[] = [], replayBad: number | null = null;
let pool: C.Item[] = [], vault: C.Item[] = [], wager: (C.Item | null)[] = [], skillSel: C.SkillId = 0, partySize = 4, runNo = 0, hash = "";
const kitRng = new Rng(0x0b11e77e);
let followId = 0, fast = false, autopilot = false;
const canvas = $("game") as HTMLCanvasElement, ctx = canvas.getContext("2d")!, stage = $("stage");
const buf = cv(320, 200), bx = buf.getContext("2d")!, dk = cv(320, 200), dctx = dk.getContext("2d")!;
let zoom = 2;
const keys: Record<string, boolean> = {};
const mouse = { bx: 0, by: 0, seen: false }; let mouseDown = false, autoFire = false, skillHit = false, hudDirty = true;
const fx = { shake: 0, flash: 0, parts: [] as any[], texts: [] as any[], mend: null as any, log: [] as string[], cam: { x: 0, y: 0 }, camx: 0, camy: 0 };

function log(s: string): void { fx.log.unshift(s); if (fx.log.length > 6) fx.log.pop(); hudDirty = true; }
function puff(x: number, y: number, n: number, cols: string[], spd = 1, life = 24): void {
  if (RM) n = Math.min(n, 4);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.2832, v = (.2 + Math.random()) * spd; fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - .2, life: life + Math.random() * 14, col: cols[(Math.random() * cols.length) | 0], s: Math.random() < .3 ? 2 : 1 }); }
}
function addText(x: number, y: number, s: string, col: string, life = 40): void { fx.texts.push({ x, y, s, col, life }); }
const P = (u: number): number => u / ONE;
function me(): Delver | null { return run ? run.delvers[0] : null; }

/* ---------- a run ---------- */
function mintFresh(): void { wager = freshKit(skillSel, kitRng); }
function bestWager(): void {
  if (!wager[4] || C.ITEMS[wager[4].id].skill !== skillSel) wager[4] = { id: C.SKILL_ITEM[skillSel], dur: 90 };
  for (let slot = 0; slot < 4; slot++) {
    let best = wager[slot], bi = -1;
    vault.forEach((it, i) => { const d = C.ITEMS[it.id]; if (d.slot !== slot) return; if (!best || d.tier > C.ITEMS[best.id].tier || (d.tier === C.ITEMS[best.id].tier && it.dur > best.dur)) { best = it; bi = i; } });
    if (bi >= 0) { const prev = wager[slot]; wager[slot] = vault.splice(bi, 1)[0]; if (prev) vault.push(prev); }
  }
}
function startRun(): void {
  runNo++;
  bestWager();
  const delvers = [{ name: "You", wager: wager.map((it) => (it ? { ...it } : null)) }];
  for (let i = 1; i < partySize; i++) delvers.push({ name: NAMES[(i - 1) % NAMES.length], wager: freshKit(((i + 2) % 3) as C.SkillId, kitRng) });
  const cfg: RunConfig = { seed: seedFrom(hashInts(0x10ad, runNo, partySize)), delvers, door: "sealed", packScale: partySize >= 20 ? 300 : partySize >= 8 ? 200 : 100 };
  run = createRun(cfg);
  squad = new Squad(cfg, cfg.delvers.map((_, i) => (i === 0 ? null : { ...PROFILE, skill: [90, 35, 60, 75, 45][i % 5] })), hashInts(0xb075, runNo));
  rec = new Recorder(cfg);
  result = null; fast = false; followId = 0; mode = "live"; autopilot = false;
  prerender(run.world);
  fx.cam.x = P(run.delvers[0].x); fx.cam.y = P(run.delvers[0].y); fx.parts = []; fx.texts = []; fx.log = []; fx.mend = null;
  log(`${partySize} delvers enter. Seed ${run.cfg.seed.dungeon.toString(16).toUpperCase().padStart(8, "0")}.`);
  log(`${wager[4] ? C.ITEMS[wager[4].id].name : "No skill"}: ${C.SKILL_NAMES[skillSel]} is locked in.`);
  $("hall").hidden = true; $("overlay").hidden = true; $("verdict").textContent = "";
  hudDirty = true; canvas.focus();
}
function startReplay(logIn: InputLog): void {
  replayLog = logIn; run = createRun(logIn.cfg); squad = null; rec = null; result = null;
  replayFi = 0; replayCi = 0; replayBad = null; replayCur = logIn.cfg.delvers.map(() => ({ ...IDLE })); fast = false; followId = 0; mode = "replay";
  prerender(run.world);
  fx.cam.x = P(run.delvers[0].x); fx.cam.y = P(run.delvers[0].y); fx.parts = []; fx.texts = []; fx.log = []; fx.mend = null;
  log(`Replaying ${logIn.frames.length} input frames to tick ${logIn.end?.tick ?? "?"}.`);
  $("hall").hidden = true; $("overlay").hidden = true; $("verdict").textContent = "replaying…"; $("verdict").className = "";
  hudDirty = true; canvas.focus();
}
function playerInput(): Input {
  const d = me();
  if (!d || !run) return IDLE;
  const mx = ((keys.d || keys.arrowright) ? 1 : 0) - ((keys.a || keys.arrowleft) ? 1 : 0), my = ((keys.s || keys.arrowdown) ? 1 : 0) - ((keys.w || keys.arrowup) ? 1 : 0);
  const i: Input = { mx: mx as -1 | 0 | 1, my: my as -1 | 0 | 1, aim: mouse.seen, ax: Math.round((mouse.bx + fx.camx) * ONE), ay: Math.round((mouse.by + fx.camy) * ONE), fire: mouseDown || autoFire, skill: skillHit, recall: !!keys.r, ready: !!keys.e };
  skillHit = false;
  return i;
}
function tick(): void {
  if (!run || run.phase !== "play") return;
  let inputs: readonly (Input | undefined)[];
  if (mode === "live") {
    inputs = rec!.record(run.tick + 1, squad!.inputs(run, autopilot ? IDLE : playerInput()));
    step(run, inputs); rec!.after(run);
  } else {
    const t = run.tick + 1, L = replayLog!;
    while (replayFi < L.frames.length && L.frames[replayFi].t === t) { const f = L.frames[replayFi++]; replayCur[f.d] = { ...f.i }; }
    step(run, replayCur);
    if (replayCi < L.checkpoints.length && L.checkpoints[replayCi].t === run.tick) { if (replayBad === null && stateHash(run) !== L.checkpoints[replayCi].h) replayBad = run.tick; replayCi++; }
    if (L.end && run.tick >= L.end.tick && run.phase === "play") run.phase = "ended";
  }
  for (const e of run.events) onEvent(e);
  const m = me();
  if (m && m.status !== "in" && !fast) { fast = true; const o = run.delvers.find((d) => d.status === "in"); followId = o ? o.id : 0; log("You are out. The run plays on at speed; the settlement comes at the end."); }
  if (run.phase === "ended") finish();
}
function onEvent(e: Event): void {
  const r = run!, nameOf = (id: number): string => r.delvers[id].name, isMe = (id: number): boolean => id === 0;
  switch (e.k) {
    case "hit": addText(P(e.x) - 6, P(e.y) - 22, "-" + Math.round(e.dmg / 10), PAL.e, 34); if (isMe(e.who)) fx.shake = Math.max(fx.shake, 3); break;
    case "hurt": if (e.owner === 0) addText(P(e.x) - 4 + (e.boss ? Math.random() * 16 - 8 : 0), P(e.y) - (e.boss ? 34 : 22), String(Math.round(e.dmg / 10)), PAL.B, 26); break;
    case "die": puff(P(e.x), P(e.y) - 6, 26, [PAL.o, PAL.y, PAL.r, PAL["5"]], 1.4, 34); fx.shake = Math.max(fx.shake, 6); addText(P(e.x), P(e.y) - 30, nameOf(e.who) + " forgotten", PAL.e, 120);
      log(`${nameOf(e.who)} is forgotten. ${e.burned} burned, ${e.pooled} to the pool.`); break;
    case "kill": puff(P(e.x), P(e.y) - 6, 14, e.kind === "shade" ? [PAL.P, PAL.p, "#fff"] : e.kind === "gaoler" ? [PAL.R, PAL.m, PAL.i] : [PAL.b, PAL.n, PAL.B]); break;
    case "gone": puff(P(e.x), P(e.y), 2, [S.bcol[e.kind] ?? "#fff"], .5, 8); break;
    case "wake": fx.shake = 5; addText(P(r.boss.x), P(r.boss.y) - 44, "The Turnkey wakes", PAL.o, 110); log(`The Turnkey wakes for ${e.n}. No recall now: break him or be forgotten.`); break;
    case "phase": fx.shake = 6; addText(P(e.x), P(e.y) - 44, e.phase === 2 ? "He rattles his keys" : "The last lock", PAL.o, 110); break;
    case "bossdead": fx.shake = 12; fx.flash = 14; puff(P(e.x), P(e.y) - 10, 90, [PAL.G, PAL.g, PAL.y, PAL.o, "#fff"], 2.6, 50); addText(P(e.x), P(e.y) - 40, "The Turnkey breaks open", PAL.G, 150); log("The Turnkey breaks open."); break;
    case "portal": log("The seal opens. Stand on it to extract."); break;
    case "mend": fx.mend = { x: P(e.x), y: P(e.y), t: r.tick }; addText(P(e.x) - 6, P(e.y) - 22, "+35", PAL.H, 40); if (isMe(e.who)) log(`You mend ${e.n} delver${e.n === 1 ? "" : "s"}.`); break;
    case "dash": puff(P(e.x), P(e.y) - 5, 8, [PAL.T, "#fff"], .8, 14); break;
    case "sunder": fx.shake = Math.max(fx.shake, 2); puff(P(e.x), P(e.y) - 5, 10, [PAL.T, "#fff"], 1.2, 14); break;
    case "recallbroken": if (isMe(e.who)) { const m = me()!; addText(P(m.x), P(m.y) - 32, "Recall broken", PAL.e, 50); } break;
    case "recalled": log(`${nameOf(e.who)} recalls${e.left ? `, leaving ${e.left} behind` : ""}.`); break;
    case "sealedout": log(`${nameOf(e.who)} is shut out by the door and recalled.`); break;
    case "extract": log(`${nameOf(e.who)} extracts with ${e.carried} piece${e.carried === 1 ? "" : "s"}.`); puff(P(r.boss.hx), P(r.boss.hy) - 6, 20, [PAL.T, "#fff"], 1.6, 30); break;
    case "pickup": if (isMe(e.who)) addText(P(e.x), P(e.y) - 22, e.item ? "+" + C.ITEMS[e.item.id].name : "+40", e.item ? (C.ITEMS[e.item.id].tier === 3 ? PAL.T : C.ITEMS[e.item.id].tier === 2 ? PAL.o : PAL.b) : PAL.H, 80); hudDirty = true; break;
    case "full": if (isMe(e.who)) addText(P(e.x), P(e.y) - 22, "Pack full", PAL["6"], 50); break;
    case "door": log(e.phase === "counting" ? "The door counts down: ten seconds, or everyone ready." : e.phase === "open" ? "The door opens. Three seconds." : "The door seals."); hudDirty = true; break;
    case "halt": log(`Ten minutes. The run halts where it stands; ${e.n} leave with their wager and nothing else.`); break;
    case "spawn": puff(P(e.x), P(e.y) - 6, 10, [PAL.P, PAL.p]); break;
  }
}
function finish(): void {
  if (!run) return;
  hash = stateHash(run);
  if (mode === "replay") {
    const L = replayLog!, ok = replayBad === null && (!L.end || L.end.hash === hash);
    const v = $("verdict"); v.textContent = ok ? `MATCH: tick ${run.tick}, hash ${hash}` : `DIVERGED at tick ${replayBad ?? run.tick}: this browser got ${hash}, the log says ${L.end?.hash}`; v.className = ok ? "" : "bad";
    showOverlay("out", ok ? "Replay matches" : "Replay diverged", ok ? "This browser ran the log to the same hash." : "This browser does not agree with the browser that recorded the log.", [], `${L.frames.length} frames, ${L.checkpoints.length} checkpoints.`, "Back to the hall", () => { mode = "hall"; $("overlay").hidden = true; $("hall").hidden = false; });
    return;
  }
  result = settle(run, { poolIn: pool, settleBlock: hashInts(0xb10c, runNo), fresh: { mode: "table" } });
  pool = result.poolOut;
  const r = result.delvers[0], m = me()!;
  const rows: [Cv, string, string, string][] = [];
  for (const w of r.wager) rows.push([S.icon[w.item.id], C.ITEMS[w.item.id].name, w.fate === "burn" ? "Burned" : w.fate === "pool" ? "To the pool" : `-${C.WEAR_PER_RUN} wear`, w.fate === "wear" ? "wear" : w.fate]);
  for (const it of r.vaulted) rows.push([S.icon[it.id], C.ITEMS[it.id].name, "Vaulted", "keep"]);
  for (const it of r.awarded) rows.push([S.icon[it.id], C.ITEMS[it.id].name, "Won", "won"]);
  let title: string, sub: string, note: string, btn: string, cls: string;
  if (r.status === "dead") {
    title = "Forgotten"; sub = "What you died wearing is no longer yours."; cls = "dead";
    const b = r.wager.filter((w) => w.fate === "burn").length, p = r.wager.length - b;
    note = `${b} burned for good, ${p} returned to the pool for whoever finishes a later run. ${m.carried.length ? "What you carried stays where it fell. " : ""}The run ended ${run.reason}: ${result.deaths} dead, ${result.extracts} extracted.`;
    btn = "Mint a fresh set and delve again";
  } else if (r.status === "extracted") {
    title = "Extracted"; sub = "You walked out. Everything you carried is yours."; cls = "out";
    note = r.qualified ? `Above the bar with ${Math.round(r.contribution / 10)} contribution: ${r.awarded.length} of ${result.prizes} prizes rolled your way, weighted by the ${r.wagered} token you wagered.` : `Under the bar (${Math.round(result.bar / 10)} needed, you had ${Math.round(r.contribution / 10)}): no share of the ${result.prizes} prizes.`;
    btn = "Wager the best and delve again";
  } else if (r.status === "halted") {
    title = "Halted"; sub = "Ten minutes, and the run stopped where it stood."; cls = "out"; note = "You leave with your wager, worn, and nothing you carried."; btn = "Delve again";
  } else {
    title = m.sealedOut ? "Shut out" : "Recalled"; sub = m.sealedOut ? "The door sealed with you outside." : "You got out alive. What you carried stays in the dark."; cls = "out";
    note = "Only the seal lets you walk out with loot. Recall saves what you wagered and nothing else."; btn = "Delve again with the same wager";
  }
  showOverlay(cls, title, sub, rows, note, btn, () => {
    wager = r.status === "dead" ? [] : r.wager.map((w) => ({ ...w.item }));
    for (const it of r.vaulted) vault.push({ ...it });
    for (const it of r.awarded) vault.push({ ...it });
    if (r.status === "dead") mintFresh();
    mode = "hall"; $("overlay").hidden = true; showHall();
  });
  $("verdict").textContent = `run ended at tick ${run.tick}, hash ${hash}`;
  hudDirty = true;
}
function iconEl(src: Cv, scale: number): Cv { const c = cv(src.width, src.height); c.getContext("2d")!.drawImage(src, 0, 0); c.className = "px"; c.style.width = src.width * scale + "px"; c.style.height = src.height * scale + "px"; return c; }
function el(tag: string, cls?: string, txt?: string): HTMLElement { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
function fateRow(icon: Cv, name: string, stampText: string, cls: string): HTMLElement {
  const li = el("li"); const st = el("span", "stamp " + cls, stampText); li.append(iconEl(icon, 2), el("span", "", name), st); return li;
}
function showOverlay(cls: string, title: string, sub: string, rows: [Cv, string, string, string][], note: string, btn: string, onClick: () => void): void {
  const ov = $("overlay"); ov.className = "overlay " + cls; $("ovTitle").textContent = title; $("ovSub").textContent = sub;
  const ul = $("ovList"); ul.textContent = ""; for (const r of rows) ul.append(fateRow(r[0], r[1], r[2], r[3]));
  $("ovNote").textContent = note; const b = $("ovBtn") as HTMLButtonElement; b.textContent = btn; b.onclick = onClick; ov.hidden = false;
}
function showHall(): void {
  const sk = $("skills"); sk.textContent = "";
  C.SKILL_NAMES.forEach((k, i) => { const b = el("button", i === skillSel ? "on" : "") as HTMLButtonElement; b.type = "button"; b.append(el("b", "", `${i + 1} ${k}`), document.createTextNode(SKILL_NOTES[i])); b.onclick = () => { skillSel = i as C.SkillId; showHall(); }; sk.append(b); });
  const pt = $("party"); pt.textContent = "";
  for (const n of [4, 8, 20]) { const b = el("button", n === partySize ? "on" : "", `${n}`) as HTMLButtonElement; b.type = "button"; b.onclick = () => { partySize = n; showHall(); }; pt.append(b); }
  bestWager();
  const ul = $("hallWager"); ul.textContent = "";
  wager.forEach((it, i) => { if (it) ul.append(fateRow(S.icon[it.id], C.ITEMS[it.id].name, `${C.SLOT_NAMES[i]} · ${it.dur}%`, "wear")); });
  $("hallPool").textContent = `${pool.length} relic${pool.length === 1 ? "" : "s"} of the dead in the pool · ${vault.length} in the vault`;
  $("hall").hidden = false;
}

/* ---------- render ---------- */
function circ(g: CanvasRenderingContext2D, x: number, y: number, r: number): void { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
function ell(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, col: string): void { g.fillStyle = col; ry = Math.round(ry); for (let j = -ry; j <= ry; j++) { const w = Math.round(rx * Math.sqrt(1 - (j * j) / ((ry + .5) * (ry + .5)))); g.fillRect(x - w, y + j, w * 2 + 1, 1); } }
function shadow(g: CanvasRenderingContext2D, x: number, y: number, w: number): void { g.fillStyle = "rgba(5,4,10,.45)"; g.fillRect(x - w, y, w * 2, 2); g.fillRect(x - w + 1, y - 1, w * 2 - 2, 4); }
function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, f: number, col: string): void { g.fillStyle = PAL.k; g.fillRect(x - 1, y - 1, w + 2, 3); g.fillStyle = PAL["3"]; g.fillRect(x, y, w, 1); g.fillStyle = col; g.fillRect(x, y, Math.max(0, Math.round(w * f)), 1); }
const FONT: Record<string, string> = { A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010", K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010", U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010", Z: "111001010100111", "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110", "4": "101101111001001", "5": "111100110001110", "6": "011100111101111", "7": "111001010010010", "8": "111101010101111", "9": "111101111001110", "-": "000000111000000", "+": "000010111010000", ".": "000000000000010", ":": "000010000010000", " ": "000000000000000", "'": "010010000000000", ",": "000000000010100", "/": "001001010100100", "%": "101001010100101" };
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, col: string, sc = 1): void {
  s = String(s).toUpperCase(); x = Math.round(x); y = Math.round(y); g.fillStyle = col;
  for (let i = 0; i < s.length; i++) { const bits = FONT[s[i]] ?? FONT["."]; for (let k = 0; k < 15; k++) if (bits[k] === "1") g.fillRect(x + i * 4 * sc + (k % 3) * sc, y + ((k / 3) | 0) * sc, sc, sc); }
}
function textW(s: string, sc = 1): number { return (String(s).length * 4 - 1) * sc; }
function textC(g: CanvasRenderingContext2D, s: string, cx: number, y: number, col: string, sc = 1): void { text(g, s, cx - textW(s, sc) / 2, y, col, sc); }

function render(): void {
  const g = bx, vw = buf.width, vh = buf.height;
  g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.fillStyle = PAL.k; g.fillRect(0, 0, vw, vh);
  if (!run) { ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, vw * zoom, vh * zoom); return; }
  const r = run, t = r.tick, mine = me()!;
  const follow = r.delvers[followId] && r.delvers[followId].status === "in" ? r.delvers[followId] : (r.delvers.find((d) => d.status === "in") ?? mine);
  fx.cam.x += (P(follow.x) - fx.cam.x) * .14; fx.cam.y += (P(follow.y) - 4 - fx.cam.y) * .14;
  let sx = 0, sy = 0; if (fx.shake > .3 && !RM) { sx = (Math.random() - .5) * fx.shake; sy = (Math.random() - .5) * fx.shake; }
  const camx = Math.round(fx.cam.x - vw / 2 + sx), camy = Math.round(fx.cam.y - vh / 2 + sy);
  fx.camx = Math.round(fx.cam.x - vw / 2); fx.camy = Math.round(fx.cam.y - vh / 2);
  g.drawImage(mapCv, -camx, -camy);
  const lights: any[] = [], fl = RM ? 0 : 1;
  for (const T of torches) { const x = T.x - camx, y = T.y - camy; if (x < -90 || y < -90 || x > vw + 90 || y > vh + 90) continue; g.drawImage(S.torch[((t + T.ph) >> 3) % 3], x - 3, y - 6); lights.push([x, y, 64 + fl * (Math.sin((t + T.ph * 7) * .21) * 2.5 + (((t + T.ph) >> 2) % 2) * 2), "#e8822e", 1]); }
  // the door and its plate
  const shut = r.door.phase === "shut" || r.door.phase === "counting" || r.door.phase === "sealed";
  for (const [tx, ty] of r.world.door.cells) {
    const x = tx * 16 - camx, y = ty * 16 - camy;
    if (shut) { g.fillStyle = PAL.k; g.fillRect(x + 1, y + 1, 14, 14); g.fillStyle = r.door.phase === "sealed" ? PAL.R : PAL.i; for (let i = 0; i < 4; i++) g.fillRect(x + 2 + i * 4, y + 1, 1, 14); g.fillRect(x + 1, y + 1, 14, 1); g.fillRect(x + 1, y + 7, 14, 1); g.fillRect(x + 1, y + 14, 14, 1); }
    else { g.fillStyle = "rgba(95,209,181,.25)"; g.fillRect(x + 2, y + 2, 12, 12); }
  }
  if (r.door.phase === "shut" || r.door.phase === "counting") {
    const [plx, ply] = tileCentre(r.world.door.plate[0], r.world.door.plate[1]); const x = P(plx) - camx, y = P(ply) - camy, pu = RM ? .5 : .5 + .5 * Math.sin(t * .09);
    for (let i = 0; i < 24; i++) { const a = i * .2618 + t * .01; g.fillStyle = i % 2 ? PAL.T : PAL.t; g.fillRect(Math.round(x + Math.cos(a) * (22 + pu * 2)), Math.round(y + Math.sin(a) * (13 + pu)), 1, 1); }
    lights.push([x, y, 40, "#5fd1b5", 1]);
  }
  const dl: [number, number, any][] = [];
  for (const d of r.delvers) if (d.status === "dead") dl.push([P(d.y), 0, d]);
  for (const b of r.bags) dl.push([P(b.y), 1, b]);
  for (const e of r.enemies) dl.push([P(e.y), 2, e]);
  if (!r.boss.dead) dl.push([P(r.boss.y), 3, r.boss]);
  for (const d of r.delvers) if (d.status === "in") dl.push([P(d.y), 4, d]);
  if (r.portal) dl.push([P(r.boss.hy) - 8, 5, { x: r.boss.hx, y: r.boss.hy }]);
  dl.sort((a, b) => a[0] - b[0]);
  for (const d of dl) {
    const o = d[2], x = Math.round(P(o.x)) - camx, y = Math.round(P(o.y)) - camy;
    if (x < -40 || y < -40 || x > vw + 40 || y > vh + 40) continue;
    if (d[1] === 0) g.drawImage(S.grave, x - 5, y - 9);
    else if (d[1] === 1) {
      const bob = o.t < 24 ? -Math.abs(Math.sin(o.t * .26)) * 5 : 0; shadow(g, x, y + 2, 4);
      if (!o.item) g.drawImage(S.flask, x - 6, y - 9 + bob);
      else { const tier = C.ITEMS[o.item.id].tier, near = mine.status === "in" && o.t >= 24 && (P(o.x) - P(mine.x)) ** 2 + (P(o.y) - P(mine.y)) ** 2 < 2304;
        if (near) g.drawImage(S.icon[o.item.id], x - 6, y - 10); else g.drawImage(S.bag[tier], x - 5, y - 8 + bob);
        if (tier === 3) lights.push([x, y - 3, 20, "#f2cf5e", 1]); else if (tier === 2) lights.push([x, y - 3, 12, "#a678e0", 0]); }
    } else if (d[1] === 2) {
      const sp = S[o.kind], left = o.face < 0, bob = o.kind === "shade" ? Math.round(Math.sin((t + o.ph) * .12) * 2) - 3 : (o.awake && ((t + o.ph) >> 4) & 1 ? -1 : 0);
      shadow(g, x, y + 3, o.kind === "gaoler" ? 6 : 4); g.drawImage(o.flash > 0 ? (left ? sp.wf : sp.w) : (left ? sp.f : sp.c), x - 8, y - 12 + bob);
      if (o.kind === "shade") lights.push([x, y - 8, 26, "#a678e0", 1]);
    } else if (d[1] === 3) {
      const sp = S.turnkey, bob = o.awake ? Math.round(Math.sin(t * .08) * 1.5) : 0;
      g.fillStyle = "rgba(5,4,10,.5)"; g.fillRect(x - 13, y + 4, 26, 4); g.fillRect(x - 11, y + 3, 22, 6);
      g.drawImage(o.flash > 0 ? sp.w : sp.c, x - 16, y - 24 + bob); lights.push([x, y - 13 + bob, o.awake ? 46 : 20, "#e8822e", 1]);
    } else if (d[1] === 4) {
      const isP = o === mine, fr = S.delver[o.id % 4][o.moving ? ((t >> 3) & 1) : 0], left = o.face < 0;
      shadow(g, x, y + 3, 5); g.drawImage(o.flash > 0 || o.dash > 0 ? (left ? fr.wf : fr.w) : (left ? fr.f : fr.c), x - (left ? 9 : 7), y - 12);
      lights.push([x + (left ? -6 : 7), y - 3, (isP ? o.light : 58) + fl * Math.sin((t + o.id * 40) * .17) * 2, "#f7c04a", 1]);
    } else {
      const pu = RM ? .5 : .5 + .5 * Math.sin(t * .09);
      ell(g, x, y, 16, 9, PAL.d); ell(g, x, y, 12, 7, PAL.t); ell(g, x, y, 7 + pu * 2, 4 + pu, PAL.T); ell(g, x, y, 3 + pu, 2, "#fff");
      for (let i = 0; i < 40; i++) { const a = t * .05 + i * .63, rr = 5 + (i % 9) * 1.7; g.fillStyle = i % 3 === 0 ? "#fff" : i % 3 === 1 ? PAL.T : PAL.t; g.fillRect(Math.round(x + Math.cos(a) * rr * 1.2), Math.round(y + Math.sin(a) * rr * .68), 1, 1); }
      lights.push([x, y - 2, 80 + pu * 6, "#5fd1b5", 1, 2.6]);
    }
  }
  for (const b of r.bullets) {
    const x = Math.round(P(b.x)) - camx, y = Math.round(P(b.y)) - camy; if (x < -8 || y < -8 || x > vw + 8 || y > vh + 8) continue;
    const key = b.kind === "bolt" ? (b.owner === 0 ? (mine.dmg > 80 ? "bolt2" : "bolt") : "ally") : b.kind;
    const s = S.b[key]; g.drawImage(s, x - (s.width >> 1), y - (s.height >> 1)); lights.push([x, y, P(b.r) * 4 + 3, S.bcol[key], 0]);
  }
  if (fx.mend && t - fx.mend.t < 26) { const q = (t - fx.mend.t) / 26, rr = 10 + q * 54, mx = Math.round(fx.mend.x) - camx, my = Math.round(fx.mend.y) - camy; g.fillStyle = q < .5 ? "#fff" : PAL.H; for (let i = 0; i < 48; i++) { const a = i * .1309; g.fillRect(Math.round(mx + Math.cos(a) * rr), Math.round(my + Math.sin(a) * rr * .6), 1, 1); } lights.push([mx, my, rr, "#5fd1b5", 1, 1.6]); }
  for (const p of fx.parts) { g.fillStyle = p.col; g.fillRect(Math.round(p.x) - camx, Math.round(p.y) - camy, p.s, p.s); }
  g.globalCompositeOperation = "lighter";
  for (const L of lights) { if (!L[4]) continue; const m = L[5] || 1; g.fillStyle = L[3]; g.globalAlpha = .032 * m; circ(g, L[0], L[1], L[2] * .75); g.globalAlpha = .028 * m; circ(g, L[0], L[1], L[2] * .4); }
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  const d2 = dctx; d2.globalCompositeOperation = "source-over"; d2.clearRect(0, 0, vw, vh); d2.fillStyle = mine.status === "dead" ? "rgba(22,4,10,.9)" : "rgba(6,4,12,.88)"; d2.fillRect(0, 0, vw, vh);
  d2.globalCompositeOperation = "destination-out";
  for (const L of lights) { if (L[4]) { d2.fillStyle = "rgba(0,0,0,.3)"; circ(d2, L[0], L[1], L[2]); d2.fillStyle = "rgba(0,0,0,.45)"; circ(d2, L[0], L[1], L[2] * .72); d2.fillStyle = "rgba(0,0,0,.7)"; circ(d2, L[0], L[1], L[2] * .44); } else { d2.fillStyle = "rgba(0,0,0,.55)"; circ(d2, L[0], L[1], L[2]); } }
  g.drawImage(dk, 0, 0);
  for (const e of r.enemies) { if (e.hp >= e.maxhp) continue; const x = Math.round(P(e.x)) - camx, y = Math.round(P(e.y)) - camy; bar(g, x - 6, y - 17, 12, e.hp / e.maxhp, PAL.e); }
  for (const a of r.delvers) { if (a.status !== "in" || a === mine) continue; const x = Math.round(P(a.x)) - camx, y = Math.round(P(a.y)) - camy; textC(g, a.name, x, y - 21, PAL["6"]); if (a.hp < a.maxhp - 10) bar(g, x - 6, y - 14, 12, a.hp / a.maxhp, PAL.H); }
  if (mine.status === "in" && mine.hp < mine.maxhp - 10) { const x = Math.round(P(mine.x)) - camx, y = Math.round(P(mine.y)) - camy; bar(g, x - 7, y + 7, 14, mine.hp / mine.maxhp, mine.hp < mine.maxhp * .3 ? PAL.e : PAL.H); }
  for (const d of r.delvers) if (d.status === "dead") { const x = Math.round(P(d.x)) - camx, y = Math.round(P(d.y)) - camy; textC(g, d.name, x, y - 17, PAL["5"]); }
  for (const d of r.delvers) if (d.status === "in" && d.recall > 0) { const x = Math.round(P(d.x)) - camx, y = Math.round(P(d.y)) - camy, f = d.recall / C.RECALL.ticks; textC(g, "Recalling", x, y - 32, PAL.T); bar(g, x - 10, y - 25, 20, f, PAL.T); }
  for (const d of r.delvers) if (d.status === "in" && d.ready) { const x = Math.round(P(d.x)) - camx, y = Math.round(P(d.y)) - camy; textC(g, "Ready", x, y - 28, PAL.T); }
  if (r.door.phase === "counting") textC(g, `Door in ${Math.ceil(r.door.timer / 60)}`, vw / 2, 6, PAL.T);
  if (r.door.phase === "open") textC(g, `Door open ${Math.ceil(r.door.timer / 60)}`, vw / 2, 6, PAL.G);
  if (r.portal && mine.status === "in") textC(g, "Extract", Math.round(P(r.boss.hx)) - camx, Math.round(P(r.boss.hy)) - camy - 40, PAL.T);
  for (const tx of fx.texts) { g.globalAlpha = Math.min(1, tx.life / 12); const s = String(tx.s); text(g, s, Math.round(tx.x) - camx - (s.length > 4 ? textW(s) / 2 : 0), Math.round(tx.y) - camy, tx.col); }
  g.globalAlpha = 1;
  const B = r.boss;
  if (B.awake && !B.dead) { const w = Math.min(170, vw - 40), x = (vw - w) >> 1; textC(g, "The Turnkey", vw / 2, 14, PAL.b); g.fillStyle = PAL.k; g.fillRect(x - 2, 22, w + 4, 7); g.fillStyle = PAL["4"]; g.fillRect(x - 1, 23, w + 2, 5); g.fillStyle = PAL["1"]; g.fillRect(x, 24, w, 3); g.fillStyle = PAL.e; g.fillRect(x, 24, Math.round(w * B.hp / B.maxhp), 3); g.fillStyle = PAL.R; g.fillRect(x, 26, Math.round(w * B.hp / B.maxhp), 1); g.fillStyle = PAL.k; g.fillRect(x + Math.round(w / 3), 24, 1, 3); g.fillRect(x + Math.round(w * 2 / 3), 24, 1, 3); }
  if (mine.status === "in" && !mine.locked && r.door.phase === "shut" && inPlate(mine)) textC(g, "Hold E to ready the door", vw / 2, vh - 14, PAL.T);
  if (fast) text(g, mode === "replay" ? "Replay x10" : "Out. Watching x10", 4, vh - 9, PAL["6"]);
  else if (autopilot) text(g, "Autopilot: a bot has your seat. P to take it back", 4, vh - 9, PAL["6"]);
  if (autoFire && mode === "live") text(g, "Auto-fire", 4, vh - 18, PAL["6"]);
  if (mine.status === "in" && mine.hp < mine.maxhp * .3) { g.fillStyle = "rgba(194,42,58," + (.1 + .07 * Math.sin(t * .2)) + ")"; g.fillRect(0, 0, vw, 3); g.fillRect(0, vh - 3, vw, 3); g.fillRect(0, 0, 3, vh); g.fillRect(vw - 3, 0, 3, vh); }
  if (fx.flash > 0 && !RM) { g.fillStyle = "rgba(255,241,168," + (fx.flash / 20) + ")"; g.fillRect(0, 0, vw, vh); }
  ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, vw * zoom, vh * zoom);
}
function inPlate(d: Delver): boolean { const [plx, ply] = tileCentre(run!.world.door.plate[0], run!.world.door.plate[1]); const rr = 40 * ONE; return (d.x - plx) ** 2 + (d.y - ply) ** 2 <= rr * rr; }

/* ---------- the wager slip ---------- */
function rebuildHud(): void {
  const r = run, m = me();
  const wl = $("wagerList"); wl.textContent = "";
  const w = m ? m.wager : wager;
  w.forEach((it, i) => {
    if (i > 4) return;
    const li = el("li", it ? "t" + C.ITEMS[it.id].tier : "empty"), ic = el("div", "ico"), body = el("div");
    if (it) { const d = C.ITEMS[it.id]; ic.append(iconEl(S.icon[it.id], 3)); body.append(el("span", "nm", d.name), el("span", "meta", (d.skill !== undefined ? "Skill · " + C.SKILL_NAMES[d.skill] : C.SLOT_NAMES[i] + " · tier " + ROMAN[d.tier]) + " · " + it.dur + "% sound")); const dur = el("i", "dur"), f = el("i"); f.style.width = it.dur + "%"; dur.append(f); body.append(dur); }
    else body.append(el("span", "nm", "Nothing wagered"), el("span", "meta", C.SLOT_NAMES[i]));
    li.append(ic, body); wl.append(li);
  });
  $("skillNote").textContent = m && m.skill >= 0 ? `${C.SKILL_NAMES[m.skill as C.SkillId]}: ${SKILL_NOTES[m.skill]}. Locked in for this delve.` : "One skill per delve, chosen in the hall.";
  const rb = $("recallBtn"), shut = !!(m && (m.locked || m.status !== "in")); rb.textContent = m && m.locked ? "No recall: the door is sealed" : "Hold R to recall"; rb.classList.toggle("shut", shut);
  const bag = $("bag"); bag.textContent = "";
  for (let i = 0; i < 8; i++) { const c = el("div"); const it = m?.carried[i]; if (it) { c.append(iconEl(S.icon[it.id], 2)); c.title = C.ITEMS[it.id].name; } bag.append(c); }
  const lg = $("log"); lg.textContent = ""; for (const s of fx.log) lg.append(el("li", "", s));
  $("poolNum").textContent = `${pool.length} relic${pool.length === 1 ? "" : "s"} of the dead`;
  const pt = $("partyList"); pt.textContent = "";
  let alive = 0;
  if (r) for (const a of r.delvers) {
    const li = el("li"), nm = el("span", a.status === "dead" ? "gone" : a.status !== "in" ? "out" : "", a.name);
    if (a.status === "in") { alive++; const mt = el("div", "meter"), f = el("i"); f.style.width = Math.max(0, a.hp / a.maxhp * 100) + "%"; (a as any)._bar = f; mt.append(f); li.append(nm, mt); }
    else li.append(nm, el("span", a.status === "dead" ? "gone" : "out", a.status === "dead" ? "forgotten" : a.sealedOut ? "shut out" : a.status));
    pt.append(li);
  }
  $("partyNum").textContent = r ? `${alive} of ${r.delvers.length}` : `${partySize} in the shard`;
  hudDirty = false;
}
function tickHud(): void {
  if (hudDirty) rebuildHud();
  const m = me(); if (!m || !run) return;
  $("hpFill").style.width = Math.max(0, m.hp / m.maxhp * 100) + "%"; $("hpNum").textContent = Math.max(0, Math.ceil(m.hp / 10)) + " / " + (m.maxhp / 10);
  for (const a of run.delvers) if (a.status === "in" && (a as any)._bar) (a as any)._bar.style.width = Math.max(0, a.hp / a.maxhp * 100) + "%";
  const cdMax = m.skill === 0 ? C.SKILL.slip.cd : m.skill === 1 ? C.SKILL.mend.cd : C.SKILL.sunder.cd;
  $("skillFill").style.width = (m.scd > 0 ? (1 - m.scd / cdMax) * 100 : 100) + "%"; $("skillNum").textContent = m.scd > 0 ? (m.scd / 60).toFixed(1) + " s" : "Space";
  $("recallBtn").classList.toggle("on", m.recall > 0);
  if (run.tick % 60 === 0 || run.phase === "ended") hash = stateHash(run);
  $("rec").textContent = `seed ${run.cfg.seed.dungeon.toString(16).toUpperCase().padStart(8, "0")} · tick ${run.tick.toLocaleString("en-US")} · 60 Hz · ${mode === "replay" ? "replay" : "live"} · hash ${hash}`;
}

/* ---------- input, sizing, loop ---------- */
function started(): void { $("hint").classList.add("off"); }
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase(), ae = document.activeElement;
  if ((ae === canvas && k.indexOf("arrow") === 0) || (k === " " && (ae === canvas || ae === document.body || !ae))) e.preventDefault();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  keys[k] = true;
  if (!e.repeat) {
    if (k === "f") autoFire = !autoFire; else if (k === " ") skillHit = true;
    else if (k === "p" && mode === "live" && squad) { autopilot = !autopilot; squad.human(0, !autopilot); log(autopilot ? "A bot takes your seat; your inputs are its inputs now." : "You take your seat back."); }
    else if (mode === "hall" && (k === "1" || k === "2" || k === "3")) { skillSel = (+k - 1) as C.SkillId; showHall(); }
  }
  started();
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; mouseDown = false; });
function setMouse(e: PointerEvent): void { const r = canvas.getBoundingClientRect(); mouse.bx = (e.clientX - r.left) / r.width * buf.width; mouse.by = (e.clientY - r.top) / r.height * buf.height; mouse.seen = true; }
canvas.addEventListener("pointerdown", (e) => { started(); mouseDown = true; setMouse(e); try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } });
canvas.addEventListener("pointermove", setMouse);
canvas.addEventListener("pointerup", () => { mouseDown = false; }); canvas.addEventListener("pointercancel", () => { mouseDown = false; });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
const recallBtn = $("recallBtn");
recallBtn.addEventListener("pointerdown", (e) => { keys.r = true; started(); try { recallBtn.setPointerCapture(e.pointerId); } catch (_) { /* nothing */ } });
for (const n of ["pointerup", "pointercancel", "lostpointercapture"]) recallBtn.addEventListener(n, () => { keys.r = false; });
$("delveBtn").addEventListener("click", () => startRun());
$("saveBtn").addEventListener("click", () => {
  if (!rec || !run) { $("verdict").textContent = "Nothing recorded yet: play a run first."; return; }
  if (run.phase !== "ended") { $("verdict").textContent = "The run is not over; its log is saved when it ends."; return; }
  const blob = new Blob([JSON.stringify(rec.log)], { type: "application/json" }), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `oubliette-run-${run.cfg.seed.dungeon.toString(16)}-${run.tick}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
($("loadFile") as HTMLInputElement).addEventListener("change", (e) => {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  f.text().then((txt) => { try { const L = JSON.parse(txt) as InputLog; if (L.v !== 1 || !L.cfg || !L.frames) throw new Error("not a log"); startReplay(L); } catch (err) { $("verdict").textContent = "Could not read that file as a replay: " + (err as Error).message; $("verdict").className = "bad"; } });
});
function resize(): void {
  const r = stage.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
  const W = Math.max(2, Math.round(stage.clientWidth * dpr)), H = Math.max(2, Math.round(stage.clientHeight * dpr));
  if (!r.width) return; canvas.width = W; canvas.height = H; zoom = Math.max(1, Math.floor(W / 330));
  buf.width = Math.ceil(W / zoom); buf.height = Math.ceil(H / zoom); dk.width = buf.width; dk.height = buf.height;
}
let last = 0, acc = 0, hudAt = -1;
function frame(now: number): void {
  requestAnimationFrame(frame);
  if (!last) last = now; acc += Math.min(100, now - last); last = now;
  if (run && run.phase === "play" && mode !== "hall") {
    let n = 0; const per = fast ? 10 : 1;
    while (acc >= 16.667 && n < 5) { for (let k = 0; k < per && run.phase === "play"; k++) tick(); acc -= 16.667; n++; }
    if (n === 5) acc = 0;
  } else acc = 0;
  if (run) { for (let i = fx.parts.length - 1; i >= 0; i--) { const p = fx.parts[i]; p.x += p.vx; p.y += p.vy; p.vx *= .95; p.vy *= .95; if (--p.life <= 0) fx.parts.splice(i, 1); } for (let i = fx.texts.length - 1; i >= 0; i--) { const tx = fx.texts[i]; tx.y -= .32; if (--tx.life <= 0) fx.texts.splice(i, 1); } if (fx.shake > 0) fx.shake *= .88; if (fx.flash > 0) fx.flash--; }
  render();
  if (hudDirty || !run || run.tick - hudAt >= 6) { hudAt = run ? run.tick : 0; tickHud(); }
}
function start(): void {
  buildSprites(); mintFresh(); showHall(); rebuildHud(); resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener("resize", resize);
  (window as any).__loop = {
    get run() { return run; }, get result() { return result; }, get mode() { return mode; }, hash: () => (run ? stateHash(run) : ""),
    start: (n?: number) => { if (n) partySize = n; startRun(); }, step: (k: number) => { for (let i = 0; i < k; i++) tick(); }, log: () => rec?.log ?? null,
    replay: (L: InputLog) => startReplay(L), fast: (on: boolean) => { fast = on; },
    autopilot: (on: boolean) => { if (mode === "live" && squad) { autopilot = on; squad.human(0, !on); } },
    // no hook writes the state: a teleport or a heal here would be a cheat the replay cannot reproduce
  };
  requestAnimationFrame(frame);
}
start();
