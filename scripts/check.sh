#!/usr/bin/env bash
# The CI checks, run on your own machine so they use no GitHub Actions minutes.
#   PYTHON=/path/to/python scripts/check.sh           types, lint, unit tests
#   PYTHON=/path/to/python scripts/check.sh --docker  also builds the web image and checks what it serves
set -u
cd "$(dirname "$0")/.."
PYTHON="${PYTHON:-python}"
fail=0
step() {
  local name="$1"
  shift
  printf '%-16s' "$name"
  if out=$("$@" 2>&1); then
    echo pass
  else
    echo FAIL
    echo "$out" | tail -25
    return 1
  fi
}

(cd frontend && step types npx tsc --noEmit) || fail=1
(cd frontend && step lint npm run lint --silent) || fail=1
(cd frontend && step lease npm run test:lease --silent) || fail=1
(cd backend && step ruff "$PYTHON" -m ruff check .) || fail=1
(cd backend && MARKET=IN PYTHONPATH=. step "backend tests" "$PYTHON" -m pytest -q -p no:warnings) || fail=1

image_serves_landing() {
  docker build -t strataiq-web-check ./frontend || return 1
  docker rm -f strataiq-web-check >/dev/null 2>&1
  docker run -d --name strataiq-web-check -p 3987:3000 -e API_URL=http://127.0.0.1:9 strataiq-web-check || return 1
  local page="" i
  for i in $(seq 1 30); do
    page=$(curl -sf localhost:3987/) && break
    sleep 2
  done
  local css ok=1
  css=$(echo "$page" | grep -o '/_next/static/css/[^"]*' | head -1)
  echo "$page" | grep -q 'Know your numbers before you sign the lease.' && [ -n "$css" ] && curl -sf -o /dev/null "localhost:3987$css" && ok=0
  docker rm -f strataiq-web-check >/dev/null 2>&1
  return $ok
}
if [ "${1:-}" = "--docker" ]; then
  step "web image" image_serves_landing || fail=1
fi

[ "$fail" = 0 ] && echo "all passed" || { echo "something failed"; exit 1; }
