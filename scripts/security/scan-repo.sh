#!/bin/bash
# The security scanners this repository can run on a laptop, in one go, with
# one summary: dependency vulnerabilities against the committed bills of
# materials (grype), filesystem vulnerabilities, secrets and misconfiguration
# (trivy), secrets in the tree and in recent history (gitleaks), the local
# Semgrep rules, Dockerfile lint (hadolint), shell lint (shellcheck) and
# npm audit over each lockfile. CI runs the same scanners in
# .github/workflows/security-scan.yml, codeql.yml, codeql-swift.yml and the
# PR Gate; this script is for producing the same numbers on demand, for
# instance for docs/security/security-test-report-*.md.
#
#   scripts/security/scan-repo.sh [out-dir]      # default: a temp dir, printed at the end
#
# Exit code 1 when a HIGH or CRITICAL vulnerability, a secret or a HIGH
# misconfiguration is found; 0 otherwise. Needs: syft, grype, trivy, gitleaks,
# semgrep, hadolint, shellcheck, npm (brew installs all but npm).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$(mktemp -d)}"
mkdir -p "$OUT"
cd "$ROOT"
fail=0

for tool in syft grype trivy gitleaks semgrep hadolint shellcheck npm python3; do
  command -v "$tool" >/dev/null || { echo "missing: $tool" >&2; exit 2; }
done

echo "== $(date -u +%FT%TZ) $(git rev-parse --short HEAD)"
echo "== tools: syft $(syft version 2>/dev/null | awk '/^Version/{print $2}'), grype $(grype version 2>/dev/null | awk '/^Version/{print $2}'), trivy $(trivy --version 2>/dev/null | awk 'NR==1{print $2}'), gitleaks $(gitleaks version 2>/dev/null), semgrep $(semgrep --version 2>/dev/null)"

echo "== bills of materials (docs/sbom, must be current)"
scripts/security/generate-sbom.sh --check || fail=1

echo "== grype: known vulnerabilities in the bills"
for bom in docs/sbom/*.cdx.json; do
  name="$(basename "$bom" .cdx.json)"
  grype "sbom:$bom" -o json -q > "$OUT/grype-$name.json" 2>/dev/null
  python3 - "$OUT/grype-$name.json" "$name" <<'PY' || fail=1
import json, sys, collections
d = json.load(open(sys.argv[1])); m = d.get("matches", [])
sev = collections.Counter(x["vulnerability"]["severity"] for x in m)
print(f"  {sys.argv[2]:18} {len(m):3} matches {dict(sev) if m else ''}")
for x in m:
    v = x["vulnerability"]; a = x["artifact"]
    if v["severity"] in ("High", "Critical"):
        print(f"    {v['severity']} {v['id']} {a['name']} {a['version']} fix: {(v.get('fix') or {}).get('versions')}")
sys.exit(1 if any(x["vulnerability"]["severity"] in ("High", "Critical") for x in m) else 0)
PY
done

echo "== trivy: filesystem vulnerabilities, secrets, misconfiguration"
trivy fs --scanners vuln,secret,misconfig --format json --output "$OUT/trivy-fs.json" \
  --skip-dirs node_modules --skip-dirs .build --skip-dirs vendor --skip-dirs scratchpad -q . 2>/dev/null
python3 - "$OUT/trivy-fs.json" <<'PY' || fail=1
import json, sys, collections
d = json.load(open(sys.argv[1])); res = d.get("Results", [])
v = collections.Counter(); s = 0; mc = collections.Counter(); bad = False
for r in res:
    for x in r.get("Vulnerabilities") or []:
        v[x["Severity"]] += 1
        if x["Severity"] in ("HIGH", "CRITICAL"):
            bad = True; print(f"    {x['Severity']} {x['VulnerabilityID']} {r['Target']} {x['PkgName']} {x['InstalledVersion']} fix: {x.get('FixedVersion')}")
    for x in r.get("Secrets") or []:
        s += 1; bad = True; print(f"    SECRET {r['Target']} {x['RuleID']}")
    for x in r.get("Misconfigurations") or []:
        mc[x["Severity"]] += 1
        if x["Severity"] in ("HIGH", "CRITICAL"):
            bad = True; print(f"    {x['Severity']} {x['ID']} {r['Target']} {x['Title']}")
print(f"  vulnerabilities {dict(v)}, secrets {s}, misconfigurations {dict(mc)}")
sys.exit(1 if bad else 0)
PY

echo "== gitleaks: working tree, then the last 200 commits"
gitleaks detect --source . --no-git --report-format json --report-path "$OUT/gitleaks-tree.json" --exit-code 1 >/dev/null 2>&1
rc=$?; [ "$rc" = 0 ] && echo "  tree: no leaks" || { echo "  tree: leaks found, see $OUT/gitleaks-tree.json"; fail=1; }
gitleaks detect --source . --log-opts='-n 200' --report-format json --report-path "$OUT/gitleaks-history.json" --exit-code 1 >/dev/null 2>&1
rc=$?; [ "$rc" = 0 ] && echo "  history: no leaks" || { echo "  history: leaks found, see $OUT/gitleaks-history.json"; fail=1; }

echo "== semgrep: the repository's own rules (.semgrep/)"
semgrep scan --config .semgrep --metrics=off --json -o "$OUT/semgrep.json" --quiet ui/src services clients/ios/Sources >/dev/null 2>&1 || true
python3 - "$OUT/semgrep.json" <<'PY' || fail=1
import json, sys
r = json.load(open(sys.argv[1])).get("results", [])
print(f"  findings: {len(r)}")
for x in r[:20]: print(f"    {x['check_id']} {x['path']}:{x['start']['line']}")
sys.exit(1 if r else 0)
PY

echo "== hadolint: every Dockerfile"
find . -name 'Dockerfile*' -not -path '*/node_modules/*' -not -path './vendor/*' -not -path './scratchpad/*' -print0 \
  | xargs -0 hadolint -f json 2>/dev/null > "$OUT/hadolint.json" || true
python3 - "$OUT/hadolint.json" <<'PY' || fail=1
import json, sys, collections
raw = open(sys.argv[1]).read().strip()
d = json.loads(raw) if raw else []
c = collections.Counter(x["level"] for x in d)
print(f"  findings: {len(d)} {dict(c)}")
bad = [x for x in d if x["level"] in ("error", "warning")]
for x in bad:
    print(f"    {x['level']} {x['code']} {x['file']}:{x['line']} {x['message'][:70]}")
sys.exit(1 if bad else 0)
PY

echo "== shellcheck: scripts/ and clients/ios/Scripts at error severity"
if find scripts clients/ios/Scripts -name '*.sh' -print0 | xargs -0 shellcheck -S error; then echo "  errors: 0"; else echo "  errors found"; fail=1; fi

echo "== npm audit: production dependencies, HIGH and above (the pre-push rule)"
for d in ui services/neo4j-proxy services/epa-ingest services/claude-federation; do
  [ -f "$d/package-lock.json" ] || continue
  printf '  %-30s ' "$d"
  (cd "$d" && npm audit --omit=dev --json 2>/dev/null | python3 -c 'import json,sys; m=json.load(sys.stdin).get("metadata",{}).get("vulnerabilities",{}); print({k:m.get(k,0) for k in ("critical","high","moderate","low")})')
done

echo "== reports in $OUT"
exit "$fail"
