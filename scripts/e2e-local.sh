#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Authenticated Playwright lane against the LOCAL dev stack, credentials sourced
# from the gitignored `local-dev-login.md` so it is one command:
#
#   pnpm test:e2e:local                 # full lane
#   pnpm test:e2e:scoped                # only specs covering this branch's changes
#   E2E_ACCOUNT=internal pnpm test:e2e:local   # second (internal-team) credential pair
#   pnpm test:e2e:local tests/e2e/foo.spec.ts -g "Run now"   # extra args pass through
#
# Exit codes: 0 pass · 1 failures · 2 SKIPPED (dev stack down, no credentials,
# or nothing in scope) — `scripts/gates.sh` treats 2 as a skip, not a failure.
#
# Preconditions: `pnpm dev` on $E2E_BASE_URL (default :3000)
# and the auth backend on $E2E_API_URL (default :3001). Explicit E2E_USER /
# E2E_PASS in the environment win over the login file.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"
API_URL="${E2E_API_URL:-http://localhost:3001}"
LOGIN_FILE="${E2E_LOGIN_FILE:-local-dev-login.md}"
ACCOUNT="${E2E_ACCOUNT:-customer}" # customer | internal

MODE=all; PASS_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --scoped) MODE=scoped; shift ;;
    --base) PASS_ARGS+=("--base" "$2"); shift 2 ;;
    *) PASS_ARGS+=("$1"); shift ;;
  esac
done

probe() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2>/dev/null || true; } # prints 000 on connection failure
app=$(probe "$BASE_URL/"); app=${app:-000}
api=$(probe "$API_URL/"); api=${api:-000}
if [ "$app" = "000" ] || [ "$api" = "000" ]; then
  echo "e2e: SKIPPED — dev stack not reachable (app=$app on $BASE_URL, auth=$api on $API_URL). Start 'pnpm dev' and the auth backend."
  exit 2
fi

if [ -z "${E2E_USER:-}" ] || [ -z "${E2E_PASS:-}" ]; then
  if [ ! -f "$LOGIN_FILE" ]; then
    echo "e2e: SKIPPED — no E2E_USER/E2E_PASS in the environment and $LOGIN_FILE is missing"
    exit 2
  fi
  idx=1; [ "$ACCOUNT" = "internal" ] && idx=2
  pick() { # $1 = field label, $2 = nth occurrence — value after the first colon, trimmed
    awk -v label="$1" -v n="$2" 'BEGIN{IGNORECASE=1} tolower($0) ~ "^"label":" {c++; if (c==n) {s=$0; sub(/^[^:]*:[ \t]*/,"",s); sub(/[ \t\r]+$/,"",s); print s; exit}}' "$LOGIN_FILE"
  }
  E2E_USER=$(pick username "$idx"); E2E_PASS=$(pick password "$idx")
  export E2E_USER E2E_PASS
fi
if [ -z "${E2E_USER:-}" ] || [ -z "${E2E_PASS:-}" ]; then
  echo "e2e: SKIPPED — could not read credential pair #$idx ($ACCOUNT) from $LOGIN_FILE"
  exit 2
fi
export E2E_BASE_URL="$BASE_URL" E2E_API_URL="$API_URL"

if [ "$MODE" = "scoped" ]; then
  exec node scripts/e2e-scope.mjs --run "${PASS_ARGS[@]}"
else
  exec pnpm exec playwright test "${PASS_ARGS[@]}"
fi
