#!/usr/bin/env bash
# run-api-tests.sh: run the Bruno API collection (bruno/MVHDv2) against one
# environment, with a forged NextAuth session per persona, and write a result
# file the compliance baseline can read. #348
#
# Usage:
#   scripts/run-api-tests.sh                      # Local (compose stack on :3003)
#   scripts/run-api-tests.sh Static-mock          # the GitHub Pages fixtures (folder 13)
#   scripts/run-api-tests.sh Azure-Dev            # needs NEXTAUTH_SECRET of the deployment
#   scripts/run-api-tests.sh Local "07 Journey - Data permit"   # one folder (or file) only
#
# Environment:
#   NEXTAUTH_SECRET     secret that signs the session cookies. Required for
#                       Azure-Dev. For Local it is read from the UI container
#                       (BRUNO_UI_CONTAINER, default health-dataspace-ui) when unset.
#                       Never printed.
#   BRUNO_REPORT_DIR    where reports go (default test-results/bruno)
#   BRUNO_EUDI=1        include "12 EUDI wallet" (needs docker-compose.eudi.yml)
#   BRUNO_BIN           bru binary (default: npx --yes @usebruno/cli)
#
# Exit status is bru's: non-zero when any request fails an assertion or a test.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COLLECTION="$ROOT/bruno/MVHDv2"
ENV_NAME="${1:-Local}"
shift || true
REPORT_DIR="${BRUNO_REPORT_DIR:-$ROOT/test-results/bruno}"
BRUNO_BIN="${BRUNO_BIN:-npx --yes @usebruno/cli}"
UI_CONTAINER="${BRUNO_UI_CONTAINER:-health-dataspace-ui}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$REPORT_DIR"

case "$ENV_NAME" in
  Local) COOKIE_NAME=next-auth.session-token ;;
  Azure-Dev) COOKIE_NAME=__Secure-next-auth.session-token ;;
  Static-mock) COOKIE_NAME=next-auth.session-token ;;
  *) echo "unknown environment '$ENV_NAME' (Local | Static-mock | Azure-Dev)" >&2; exit 2 ;;
esac

ENV_VARS=()
if [ "$ENV_NAME" != "Static-mock" ]; then
  if [ -z "${NEXTAUTH_SECRET:-}" ]; then
    if [ "$ENV_NAME" = "Local" ] && command -v docker >/dev/null 2>&1; then
      NEXTAUTH_SECRET="$(docker exec "$UI_CONTAINER" printenv NEXTAUTH_SECRET 2>/dev/null || true)"
    fi
  fi
  if [ -z "${NEXTAUTH_SECRET:-}" ]; then
    echo "NEXTAUTH_SECRET is not set and could not be read from container '$UI_CONTAINER'." >&2
    echo "The collection cannot authenticate; every gated request would answer 401." >&2
    exit 2
  fi
  export NEXTAUTH_SECRET
  # one forged session per persona; the values go straight into bru's env vars
  forge() { (cd "$ROOT/ui" && COOKIE_NAME="$COOKIE_NAME" node scripts/forge-bruno-session.mjs "$1" | awk -F= '/^COOKIE_VALUE=/{print substr($0, 14)}'); }
  for pair in "sessionToken:edcadmin" "sessionTokenRegulator:regulator" "sessionTokenResearcher:researcher" "sessionTokenPatient:patient1" "sessionTokenClinic:clinicuser"; do
    var="${pair%%:*}"; persona="${pair##*:}"
    value="$(forge "$persona")"
    if [ -z "$value" ]; then echo "forging a session for '$persona' produced nothing (is ui/node_modules installed?)" >&2; exit 2; fi
    ENV_VARS+=(--env-var "$var=$value")
  done
  echo "[bruno] forged 5 persona sessions for $ENV_NAME (cookie $COOKIE_NAME, 8h)"
fi

# what to run
PATHS=()
if [ "$#" -gt 0 ]; then
  for p in "$@"; do PATHS+=("$p"); done
elif [ "$ENV_NAME" = "Static-mock" ]; then
  # The GitHub Pages export serves no /api/ route: it renames ui/src/app/api/
  # before the build and publishes fixtures under /mock/. Folder 13 is the one
  # that asks for those, and static-mock.txt lists it.
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    PATHS+=("$line")
  done < "$COLLECTION/static-mock.txt"
else
  for d in "$COLLECTION"/[0-9][0-9]\ */; do
    name="$(basename "$d")"
    case "$name" in
      "12 EUDI wallet"*) [ "${BRUNO_EUDI:-0}" = "1" ] || continue ;;
      # The EDC services and the Neo4j proxy are internal on Azure: unreachable
      # from outside the container environment, so they run on Local and in CI.
      "10 Connecting partner"*|"11 Platform"*) [ "$ENV_NAME" = "Local" ] || continue ;;
      # Folder 13 asks GitHub Pages for its fixtures; it has nothing to say to
      # a running stack, so only the Static-mock branch above selects it.
      "13 Static export"*) continue ;;
    esac
    PATHS+=("$name")
  done
fi
echo "[bruno] environment $ENV_NAME, ${#PATHS[@]} path(s)"

JSON_REPORT="$REPORT_DIR/bruno-raw-$ENV_NAME-$STAMP.json"
HTML_REPORT="$REPORT_DIR/bruno-$ENV_NAME-$STAMP.html"
JUNIT_REPORT="$REPORT_DIR/bruno-$ENV_NAME-$STAMP.xml"
set +e
(
  # ${arr[@]+"${arr[@]}"}: an empty array is an unbound variable under `set -u`
  # on bash 3.2, which is what macOS ships. Static-mock passes no --env-var.
  cd "$COLLECTION" && $BRUNO_BIN run "${PATHS[@]}" -r --env "$ENV_NAME" \
    ${ENV_VARS[@]+"${ENV_VARS[@]}"} \
    --reporter-json "$JSON_REPORT" --reporter-html "$HTML_REPORT" \
    --reporter-junit "$JUNIT_REPORT"
)
BRU_EXIT=$?
set -e

# Summarise into the shape scripts/check-compliance-baseline.py reads:
# {"summary": {"passed", "failed", "skipped"}}. A request is skipped when its
# only tests are named "SKIPPED: ..." (the collection's loud-skip convention).
python3 - "$JSON_REPORT" "$REPORT_DIR/bruno-api-$ENV_NAME-$STAMP.json" "$ENV_NAME" <<'PY'
import json, sys, datetime
raw, out, env = sys.argv[1:4]
try:
    data = json.load(open(raw))
except Exception as exc:
    print(f"[bruno] no JSON report to summarise ({exc})"); sys.exit(0)
passed = failed = skipped = 0
rows = []
for it in data:
    for r in it.get("results", []):
        name = r.get("test", {}).get("filename") or r.get("request", {}).get("url", "?")
        asserts = r.get("assertionResults", []) or []
        tests = r.get("testResults", []) or []
        status = (r.get("response") or {}).get("status")
        errs = [a for a in asserts if a.get("status") != "pass"] + [t for t in tests if t.get("status") != "pass"]
        if r.get("error"):
            errs.append({"error": str(r["error"])[:200]})
        if errs:
            failed += 1; verdict = "failed"
        elif tests and all((t.get("description") or "").startswith("SKIPPED") for t in tests) and not asserts:
            skipped += 1; verdict = "skipped"
        else:
            passed += 1; verdict = "passed"
        rows.append({"request": name, "status": status, "verdict": verdict,
                     "errors": [ (e.get("error") or e.get("lhsExpr","") + " " + e.get("rhsExpr","")) for e in errs ][:3]})
summary = {"passed": passed, "failed": failed, "skipped": skipped, "total": passed + failed + skipped}
json.dump({"suite": "bruno-api", "environment": env, "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
           "summary": summary, "requests": rows}, open(out, "w"), indent=2)
print(f"[bruno] {env}: {passed} passed, {failed} failed, {skipped} skipped / {summary['total']} requests")
for row in rows:
    if row["verdict"] == "failed":
        print(f"   FAIL [{row['status']}] {row['request']}")
        for e in row["errors"]: print(f"        {e}")
print(f"[bruno] report: {out}")
PY
exit "$BRU_EXIT"
