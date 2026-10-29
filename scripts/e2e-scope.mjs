#!/usr/bin/env node
/**
 * Maps the files a branch changes onto the Playwright specs that cover them, so
 * the E2E lane can run as a pre-push gate without paying for the whole suite.
 *
 * Fill SCOPE for your project: each row is a RegExp over a changed path and the
 * specs to run when it matches. GLOBAL paths run everything. A changed spec
 * always runs itself. Changed set = commits since the merge-base with --base
 * (default origin/main) plus working-tree and untracked files.
 *
 *   node scripts/e2e-scope.mjs              # print the in-scope spec paths
 *   node scripts/e2e-scope.mjs --run        # run them (exit 2 when nothing is in scope)
 *   node scripts/e2e-scope.mjs --all --run  # ignore scoping, run the full lane
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const BASE = opt('--base', 'origin/main')

/** Paths whose change means "run everything". */
const GLOBAL = [
  /^app\/layout\.tsx$/,
  /^app\/providers/,
  /^middleware\.ts$/,
  /^env\.ts$/,
  /^package\.json$/,
  /^playwright\.config/,
]
/** { test: RegExp over a changed path, specs: [...] }. One row per surface. */
const SCOPE = [
  // { test: /^(app|components|lib)\/settings\//, specs: ['tests/e2e/settings.spec.ts'] },
]
const ALL_SPECS = ['tests/e2e']
const SPEC_RE = /^tests\/e2e\/.*\.spec\.ts$/

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
let mergeBase
try {
  mergeBase = git('merge-base', BASE, 'HEAD')
} catch {
  mergeBase = git('rev-parse', 'HEAD')
}
const changed = new Set(
  [
    ...git('diff', '--name-only', '--diff-filter=ACMR', mergeBase).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ].filter(Boolean),
)

const specs = new Set()
let runAll = flag('--all')
for (const f of changed) {
  if (GLOBAL.some((re) => re.test(f))) runAll = true
  if (SPEC_RE.test(f)) specs.add(f)
  for (const rule of SCOPE) if (rule.test.test(f)) rule.specs.forEach((s) => specs.add(s))
}
const targets = runAll ? ALL_SPECS : [...specs].filter((s) => existsSync(s))

if (!flag('--run')) {
  console.log(targets.join('\n'))
  process.exit(0)
}
if (targets.length === 0) {
  console.log('e2e: SKIPPED — no spec in scope for the changed files')
  process.exit(2)
}
const r = spawnSync('pnpm', ['exec', 'playwright', 'test', ...targets], { stdio: 'inherit' })
process.exit(r.status ?? 1)
