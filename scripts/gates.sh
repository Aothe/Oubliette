#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Pre-push gates — one command, every check a branch must pass before push.
#
#   pnpm gates                     # all gates for this branch vs origin/main
#   GATES_BASE=origin/main pnpm gates
#   GATES_SKIP_BUILD=1 GATES_SKIP_E2E=1 pnpm gates
#
# Changed set = committed changes since the merge-base with $GATES_BASE, plus
# working-tree and untracked files. Gates (blocking unless noted):
#   format   Prettier --check on changed files            (mirrors format-gate.yml)
#   lint     ESLint on changed files                       ADVISORY — CI does not gate lint yet
#   types    tsc --noEmit, errors filtered to changed files
#   unit     full Vitest suite                             (mirrors tests.yml, ~30s)
#   extra    scripts/gates.extra.sh — project-specific checks, when the file exists
#   build    pnpm build         — only when route handlers / layouts / env / config changed;
#            runs in a clean copy of what git would push (tracked + untracked-not-ignored
#            files, .env* copied, node_modules hard-linked) so locally ignored or excluded
#            paths can neither break nor mask it
#   e2e      scoped Playwright  — only when the local dev stack is up (else SKIPPED)
#
# Exit 1 if any blocking gate failed; prints a summary table either way.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

BASE_REF="${GATES_BASE:-origin/main}"
SKIP_BUILD="${GATES_SKIP_BUILD:-0}"
SKIP_E2E="${GATES_SKIP_E2E:-0}"

mb=$(git merge-base "$BASE_REF" HEAD 2>/dev/null || git rev-parse HEAD)
mapfile -t CHANGED < <({ git diff --name-only --diff-filter=ACMR "$mb"; git ls-files --others --exclude-standard; } | sort -u)
# keep only files that still exist
EXISTING=()
for f in "${CHANGED[@]}"; do [ -f "$f" ] && EXISTING+=("$f"); done
CHANGED=("${EXISTING[@]}")

FMT=(); LINT=(); TS=()
for f in "${CHANGED[@]}"; do
  case "$f" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.yml|*.yaml|*.md) FMT+=("$f") ;;
  esac
  case "$f" in *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) LINT+=("$f") ;; esac
  case "$f" in *.ts|*.tsx) TS+=("$f") ;; esac
done

ROWS=(); FAIL=0
row() { ROWS+=("$(printf '%-8s %-9s %s' "$1" "$2" "$3")"); }
hdr() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

echo "gates: ${#CHANGED[@]} changed file(s) vs $BASE_REF (merge-base ${mb:0:7})"

# format ─────────────────────────────────────────────────────────────────────
hdr "format (prettier --check, changed files)"
if [ ${#FMT[@]} -eq 0 ]; then row format SKIPPED "no formattable files"
elif pnpm exec prettier --check --ignore-unknown "${FMT[@]}"; then row format PASS "${#FMT[@]} file(s)"
else row format FAIL "run: pnpm exec prettier --write <files>"; FAIL=1; fi

# lint (advisory) ────────────────────────────────────────────────────────────
hdr "lint (eslint, changed files — advisory)"
if [ ${#LINT[@]} -eq 0 ]; then row lint SKIPPED "no lintable files"
elif pnpm exec eslint --no-error-on-unmatched-pattern "${LINT[@]}"; then row lint PASS "${#LINT[@]} file(s)"
else row lint WARN "errors above — fix any introduced by this branch"; fi

# types ──────────────────────────────────────────────────────────────────────
hdr "types (tsc --noEmit, filtered to changed files)"
if [ ${#TS[@]} -eq 0 ]; then row types SKIPPED "no ts files"
else
  tsout=$(pnpm exec tsc --noEmit --pretty false 2>&1 || true)
  # Anchor each changed path at the start of the tsc line (`path(line,col): …`).
  # A plain substring match would attribute errors from any file whose path
  # merely ENDS with a changed path (git-excluded copies under the planning root).
  hits=$(printf '%s\n' "$tsout" \
    | grep -E -f <(printf '%s\n' "${TS[@]}" | sed 's#[][\.*^$+?(){}|]#\\&#g; s#^#^#; s#$#[(]#') || true)
  if [ -z "$hits" ]; then row types PASS "no errors in changed files"
  else printf '%s\n' "$hits"; row types FAIL "$(printf '%s\n' "$hits" | wc -l) error line(s) in changed files"; FAIL=1; fi
fi

# unit ───────────────────────────────────────────────────────────────────────
hdr "unit (vitest, full suite)"
if pnpm vitest run --reporter=dot; then row unit PASS "full suite"
else row unit FAIL "see failures above"; FAIL=1; fi

# extra ──────────────────────────────────────────────────────────────────────
# Project-specific gates live in scripts/gates.extra.sh (optional): it gets the
# changed files as arguments and exits non-zero to block the push.
if [ -f scripts/gates.extra.sh ]; then
  hdr "extra (scripts/gates.extra.sh)"
  if bash scripts/gates.extra.sh "${CHANGED[@]}"; then row extra PASS "project gates"; else row extra FAIL "project gates"; FAIL=1; fi
else row extra SKIPPED "no scripts/gates.extra.sh"; fi

# Build in a sibling directory holding only what git would push, so the result
# matches CI and a deploy: locally ignored/excluded files (scratch code, planning
# notes, stray .ts) are absent, .env* files are copied in because the build
# validates env at boot, and node_modules is hard-linked (same filesystem) since
# Turbopack refuses a node_modules symlink that points outside the project.
build_clean_copy() {
  local root dir rc
  root=$(pwd); dir="$(dirname "$root")/.$(basename "$root").gates-build"
  rm -rf "$dir"; mkdir -p "$dir" || return 1
  git ls-files -z --cached --others --exclude-standard \
    | tar --null -T - --ignore-failed-read -cf - 2>/dev/null | tar -C "$dir" -xf - || { rm -rf "$dir"; return 1; }
  cp -al node_modules "$dir/node_modules" || { rm -rf "$dir"; return 1; }
  local f; for f in .env .env.local .env.production .env.production.local; do [ -f "$f" ] && cp "$f" "$dir/"; done
  (cd "$dir" && pnpm build); rc=$?
  rm -rf "$dir"
  return $rc
}

# build ──────────────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = "1" ]; then row build SKIPPED "GATES_SKIP_BUILD=1"
elif printf '%s\n' "${CHANGED[@]}" | grep -qE '^(app/.*/(route|layout)\.tsx?$|env\.ts$|next\.config\.|middleware\.ts$|instrumentation\.ts$|package\.json$)'; then
  hdr "build (pnpm build in a clean copy — route/layout/env/config changed)"
  if build_clean_copy; then row build PASS "next build (clean copy)"; else row build FAIL "next build (clean copy)"; FAIL=1; fi
else row build SKIPPED "no route/layout/env/config change"; fi

# e2e ────────────────────────────────────────────────────────────────────────
if [ "$SKIP_E2E" = "1" ]; then row e2e SKIPPED "GATES_SKIP_E2E=1"
else
  hdr "e2e (playwright, scoped to changed surfaces)"
  bash scripts/e2e-local.sh --scoped --base "$BASE_REF"; rc=$?
  case $rc in
    0) row e2e PASS "scoped specs" ;;
    2) row e2e SKIPPED "dev stack down or no spec in scope" ;;
    *) row e2e FAIL "see failures above"; FAIL=1 ;;
  esac
fi

# summary ────────────────────────────────────────────────────────────────────
printf '\n\033[1m%-8s %-9s %s\033[0m\n' GATE RESULT DETAIL
printf '%s\n' "${ROWS[@]}"
if [ $FAIL -ne 0 ]; then echo; echo "gates: FAILED — do not push"; exit 1; fi
echo; echo "gates: all blocking gates passed"
