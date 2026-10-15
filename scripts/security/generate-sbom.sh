#!/bin/bash
# Software bills of materials for every deployable part of the repository,
# in CycloneDX JSON, written to docs/sbom/ so they are reviewed with the code
# that changes them (BSI TR-03161 O.TrdP, BSI C5 DEV-05).
#
#   scripts/security/generate-sbom.sh            # write them
#   scripts/security/generate-sbom.sh --check    # fail if a committed one is stale
#
# Needs syft (brew install syft). The npm projects are read from their
# lockfiles, so no node_modules is required. The iPhone app has no third-party
# package at all; its bill lists the Apple frameworks it links, derived from
# the import statements by generate-ios-sbom.py, so that claim is checkable
# without reading the build files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/docs/sbom"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

command -v syft >/dev/null || { echo "syft not found: brew install syft" >&2; exit 2; }
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# name:path, one per deployable
PARTS=(
  "ui:ui"
  "neo4j-proxy:services/neo4j-proxy"
  "epa-ingest:services/epa-ingest"
  "claude-federation:services/claude-federation"
)

stale=0
emit() {
  local name="$1" file="$2"
  # syft stamps a serial number and a timestamp; strip both so the file only
  # changes when the components do.
  python3 - "$file" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d.pop("serialNumber", None)
d.get("metadata", {}).pop("timestamp", None)
d["components"] = sorted(d.get("components", []), key=lambda c: (c.get("name", ""), c.get("version", "")))
json.dump(d, open(p, "w"), indent=2, sort_keys=True)
open(p, "a").write("\n")
PY
  if [ "$CHECK" = 1 ]; then
    if ! cmp -s "$file" "$OUT/$name.cdx.json"; then
      echo "stale: docs/sbom/$name.cdx.json (run scripts/security/generate-sbom.sh)" >&2
      stale=1
    fi
  else
    cp "$file" "$OUT/$name.cdx.json"
  fi
  local n
  n=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1])).get('components',[])))" "$file")
  printf '%-18s %4s components\n' "$name" "$n"
}

for part in "${PARTS[@]}"; do
  name="${part%%:*}"; path="${part#*:}"
  [ -d "$ROOT/$path" ] || continue
  syft "dir:$ROOT/$path" -o "cyclonedx-json=$TMP/$name.cdx.json" -q
  emit "$name" "$TMP/$name.cdx.json"
done

python3 "$ROOT/scripts/security/generate-ios-sbom.py" "$ROOT/clients/ios" > "$TMP/klarbefund-ios.cdx.json"
emit "klarbefund-ios" "$TMP/klarbefund-ios.cdx.json"

[ "$stale" = 0 ] || exit 1
