#!/usr/bin/env node --experimental-strip-types
// The headless runner.
//   node --experimental-strip-types src/headless.ts bench [--runs N] [--scenario a,b] [--danger P] [--out dir]
//   node --experimental-strip-types src/headless.ts scan [--runs N] [--scenario shard20] [--dangers 100,200,...]
//   node --experimental-strip-types src/headless.ts play --scenario party4 --seed 3 --out run.json
//   node --experimental-strip-types src/headless.ts replay run.json
//   node --experimental-strip-types src/headless.ts fuzz [--runs N] [--ticks T]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS, runScenario, playRun, setDanger, type Summary } from "./bench.ts";
import { replay, type InputLog } from "./log.ts";
import { createRun, step, stateHash, type Input, type RunConfig } from "./sim.ts";
import { Rng, seedFrom, hashInts } from "./rng.ts";
import { MW, MH } from "./world.ts";
import { TILE } from "./fixed.ts";
import * as C from "./content.ts";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cmd = args[0] ?? "bench";
function opt(name: string, dflt: string): string { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt; }

function fmt(n: number | string, w: number): string { return String(n).padStart(w); }
if (args.includes("--danger")) setDanger(parseInt(opt("danger", "100"), 10));
function printSummary(rows: Summary[]): void {
  console.log("");
  console.log("scenario   runs  n danger  boss%  deaths/run  death%  recall/run  sealedout/run  extract%  halt%   ticks  destroyed%  destroyed/run  fresh(table)  fresh(b=½)  mends/run  replays  resume  ms/run");
  for (const r of rows) {
    console.log(
      r.scenario.padEnd(10) + fmt(r.runs, 5) + fmt(r.delvers, 3) + fmt(r.danger, 7) + fmt(r.bossKillPct, 7) + fmt(r.deathsPerRun, 12) + fmt(r.deathPctPerDelver, 8)
      + fmt(r.recallsPerRun, 12) + fmt(r.sealedOutPerRun, 15) + fmt(r.extractPct, 10) + fmt(r.haltPct, 7) + fmt(r.meanTicks, 8)
      + fmt(r.destroyedPctOfWagered, 12) + fmt(r.valueDestroyedPerRun, 15) + fmt(r.freshTablePerRun, 14) + fmt(r.freshBudgetPerRun, 12)
      + fmt(r.mendsPerRun, 11) + fmt(`${r.replaysOk}/${r.runs}`, 9) + fmt(r.resumeOk === null ? "-" : r.resumeOk ? "ok" : "FAIL", 8) + fmt(r.msPerRun, 8),
    );
  }
  for (const r of rows) if (r.meanTicks) console.log(`${r.scenario.padEnd(10)} ${Math.round((r.msPerRun * 1000) / r.meanTicks)} µs a tick in this Node, ${r.delvers} delvers`);
  console.log("");
  for (const r of rows) {
    const ks = Object.keys(r.deathsBySkill).sort((a, b) => +a - +b);
    console.log(`${r.scenario.padEnd(10)} deaths by skill: ${ks.length ? ks.map((k) => `${k}: ${r.deathsBySkill[k]}`).join("  ") : "none"}`);
    const ss = r.strippedShare;
    if (ss) console.log(`${"".padEnd(10)} skill-only wagers: ${ss.wagerPct}% of value wagered, ${ss.prizePct}% of prize value won, death rate ${ss.deathPct}% against ${ss.fullDeathPct}% for full kits`);
  }
}

if (cmd === "bench") {
  const runs = parseInt(opt("runs", "20"), 10);
  const names = opt("scenario", Object.keys(SCENARIOS).filter((k) => k !== "shard85").join(",")).split(",");
  const outDir = opt("out", join(here, "..", "out"));
  mkdirSync(outDir, { recursive: true });
  const rows: Summary[] = [];
  for (const name of names) {
    const sc = SCENARIOS[name];
    if (!sc) { console.error("unknown scenario", name, "— one of", Object.keys(SCENARIOS).join(", ")); process.exit(2); }
    process.stdout.write(`${name}: ${sc.title}\n`);
    const res = runScenario(sc, runs, (st) => {
      process.stdout.write(`  run ${fmt(st.run, 3)}  ${st.reason.padEnd(7)} ${fmt(st.ticks, 6)} ticks  deaths ${fmt(st.deaths, 2)}  recalls ${fmt(st.recalls, 2)}  extracts ${fmt(st.extracts, 2)}  destroyed ${fmt(st.valueDestroyed, 5)}  replay ${st.replayOk ? "ok" : "FAIL"}  ${st.simMs} ms\n`);
    });
    rows.push(res.summary);
    writeFileSync(join(outDir, `bench-${name}.json`), JSON.stringify({ summary: res.summary, runs: res.runs }, null, 1));
  }
  printSummary(rows);
  writeFileSync(join(outDir, "bench-summary.json"), JSON.stringify(rows, null, 1));
  const bad = rows.filter((r) => r.replaysOk !== r.runs || r.resumeOk === false);
  if (bad.length) { console.error("DETERMINISM FAILURE in", bad.map((r) => r.scenario).join(", ")); process.exit(1); }
} else if (cmd === "scan") {
  // Where does a bot shard land in the economy's band? One scenario across the danger dial.
  const runs = parseInt(opt("runs", "10"), 10);
  const sc = SCENARIOS[opt("scenario", "shard20")];
  const dangers = opt("dangers", "100,200,300,400,500,600").split(",").map((x) => parseInt(x, 10));
  const rows: Summary[] = [];
  for (const dg of dangers) { setDanger(dg); rows.push(runScenario({ ...sc, danger: dg }, runs).summary); }
  printSummary(rows);
  console.log("(the band the economy needs is 7–14 % of delver-runs ending in a death)");
} else if (cmd === "play") {
  const sc = SCENARIOS[opt("scenario", "party4")];
  const run = parseInt(opt("seed", "0"), 10);
  const r = playRun(sc, run, []);
  const out = opt("out", join(here, "..", "out", `run-${sc.name}-${run}.json`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(r.log));
  console.log(`${sc.name} seed ${run}: ${r.stats.reason} at tick ${r.stats.ticks}, deaths ${r.stats.deaths}, extracts ${r.stats.extracts}, hash ${r.log.end?.hash}, replay ${r.stats.replayOk ? "ok" : "FAIL"}; log ${out} (${r.log.frames.length} frames)`);
} else if (cmd === "replay") {
  const file = args[1];
  if (!file) { console.error("replay <log.json>"); process.exit(2); }
  const log = JSON.parse(readFileSync(file, "utf8")) as InputLog;
  const t0 = Date.now();
  const r = replay(log);
  console.log(`${file}: ${r.ticks} ticks in ${Date.now() - t0} ms, hash ${r.hash}, logged ${log.end?.hash ?? "(none)"}: ${r.ok ? "MATCH" : "DIVERGED at tick " + r.divergedAt}`);
  process.exit(r.ok ? 0 : 1);
} else if (cmd === "fuzz") {
  // Random configurations and random, sometimes malformed, inputs: the simulation must never
  // throw, never store a non-integer, and keep every delver on the map (red team D5).
  const runs = parseInt(opt("runs", "50"), 10), ticks = parseInt(opt("ticks", "3000"), 10);
  const rng = new Rng(parseInt(opt("seed", "7"), 10));
  let steps = 0, bad = 0;
  const garbage = [NaN, Infinity, -Infinity, 1e30, -1e30, 0.5, -0.5, 2 ** 53, null, undefined, "x"];
  for (let i = 0; i < runs; i++) {
    const n = 1 + rng.below(8);
    const delvers = [];
    for (let d = 0; d < n; d++) {
      const kit: (C.Item | null)[] = [null, null, null, null, null];
      for (let sl = 0; sl < 5; sl++) {
        if (rng.below(4) === 0) continue;
        const ids = sl === 4 ? ["slip1", "mend1", "sunder1"] : sl === 3 ? ["key3"] : C.BY_TIER[(1 + rng.below(3)) as C.Tier].filter((id) => C.ITEMS[id].slot === sl);
        kit[sl] = { id: ids[rng.below(ids.length)], dur: rng.below(101) };
      }
      delvers.push({ name: "F" + d, wager: kit });
    }
    const cfg: RunConfig = { seed: seedFrom(hashInts(0xf022, i)), delvers, door: rng.below(2) ? "sealed" : "open", packScale: 50 + rng.below(300), hardTicks: ticks };
    const s = createRun(cfg);
    try {
      for (let t = 0; t < ticks && s.phase === "play"; t++) {
        const inputs: Input[] = delvers.map(() => {
          const g = (): number => (rng.below(20) === 0 ? (garbage[rng.below(garbage.length)] as number) : rng.below(MW * TILE));
          return { mx: (rng.below(3) - 1) as -1 | 0 | 1, my: (rng.below(3) - 1) as -1 | 0 | 1, aim: rng.below(2) === 1, ax: g(), ay: g(), fire: rng.below(2) === 1, skill: rng.below(10) === 0, recall: rng.below(30) === 0, ready: rng.below(5) === 0 };
        });
        if (rng.below(50) === 0) inputs.length = rng.below(n + 1);
        step(s, inputs);
        steps++;
        if (t % 100 === 0) stateHash(s);
        for (const d of s.delvers) if (d.x < 0 || d.y < 0 || d.x >= MW * TILE || d.y >= MH * TILE) throw new Error(`delver ${d.id} off the map at ${d.x},${d.y}`);
      }
      stateHash(s);
    } catch (e) { bad++; console.error(`fuzz run ${i} failed:`, (e as Error).message); }
  }
  console.log(`fuzz: ${runs} runs, ${steps} ticks, ${bad} failures`);
  process.exit(bad ? 1 : 0);
} else {
  console.error("commands: bench, play, replay, fuzz");
  process.exit(2);
}
