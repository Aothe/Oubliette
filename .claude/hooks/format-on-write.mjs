#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook — formats the file just written by Edit/Write
 * with Prettier so the working tree is always format-clean at write time.
 *
 * Reads the hook payload from stdin ({ tool_input: { file_path } }), formats
 * only files inside the project with a Prettier-supported extension, honours
 * .prettierignore via Prettier itself, and never blocks the tool call (always
 * exits 0). Registered in .claude/settings.json.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.yml',
  '.yaml',
  '.md',
])

let file
try {
  file = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.file_path
} catch {
  /* no payload — nothing to format */
}

if (typeof file === 'string' && EXT.has(extname(file))) {
  const root = process.cwd()
  const abs = resolve(root, file)
  const prettier = join(root, 'node_modules', '.bin', 'prettier')
  if (abs.startsWith(root) && existsSync(abs) && existsSync(prettier)) {
    try {
      execFileSync(prettier, ['--write', '--ignore-unknown', '--log-level', 'warn', abs], {
        stdio: 'ignore',
        timeout: 20_000,
      })
    } catch {
      /* formatting is best-effort here; lint-staged is the hard gate */
    }
  }
}
process.exit(0)
