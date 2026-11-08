#!/usr/bin/env bash
set -euo pipefail
# ---------------------------------------------------------------------------
# Which Playwright specs a change can break.
#
# Usage: scripts/select-e2e-specs.sh <base-ref> [<head-ref>]
#
# Prints one line to stdout:
#   none                 nothing a spec exercises changed
#   all                  shared code changed (lib, components, messages,
#                        middleware, config, the E2E helpers, the
#                        neo4j-proxy or the seed graph): every spec
#   <spec> <spec> ...    paths relative to ui/, the specs that changed and
#                        the specs that visit a route whose page or API
#                        changed
#
# A route is the first segment under ui/src/app: a change in
# ui/src/app/negotiate/** selects every spec that mentions "/negotiate",
# one in ui/src/app/api/catalog/** every spec that mentions "/api/catalog".
# Anything it cannot map to a route selects all, so the selection can be
# too wide but never too narrow. Runs on macOS's bash 3.2 as well.
# ---------------------------------------------------------------------------

base="${1:?usage: select-e2e-specs.sh <base-ref> [<head-ref>]}"
head="${2:-HEAD}"
cd "$(git rev-parse --show-toplevel)"

picked=""
all=false

pick_mentioning() {
  local found
  found="$(grep -rlF --include='*.spec.ts' -- "\"$1" ui/__tests__/e2e || true)"
  picked="$picked"$'\n'"$found"
}

while IFS= read -r f; do
  case "$f" in
    "") ;;
    ui/__tests__/e2e/*.spec.ts)
      if [ -f "$f" ]; then picked="$picked"$'\n'"$f"; fi
      ;;
    ui/__tests__/e2e/*)
      all=true # a helper, the reporter or a fixture every spec may use
      ;;
    ui/src/app/api/*/*)
      seg="${f#ui/src/app/api/}"
      pick_mentioning "/api/${seg%%/*}"
      ;;
    ui/src/app/*/*)
      seg="${f#ui/src/app/}"
      pick_mentioning "/${seg%%/*}"
      ;;
    ui/src/* | ui/public/* | ui/package.json | ui/package-lock.json | \
      ui/next.config.js | ui/playwright.config.ts | ui/tailwind.config.* | \
      ui/tsconfig*.json | services/neo4j-proxy/src/* | \
      services/neo4j-proxy/package*.json | neo4j/*.cypher | neo4j/seed.sh)
      all=true
      ;;
    *) ;; # unit tests, docs and scripts under ui/ reach no page
  esac
done < <(git diff --name-only "$base"..."$head" -- ui/ services/neo4j-proxy/ neo4j/)

specs="$(printf '%s\n' "$picked" | sed -n 's#^ui/##p' | sort -u | tr '\n' ' ')"
specs="${specs% }"

if $all; then
  echo all
elif [ -z "$specs" ]; then
  echo none
else
  echo "$specs"
fi
