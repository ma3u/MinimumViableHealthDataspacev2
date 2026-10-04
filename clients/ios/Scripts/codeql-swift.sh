#!/usr/bin/env bash
# CodeQL for the Swift code, on this Mac, before it reaches a pull request.
#
# CodeQL cannot read Swift from source alone: it watches a real build. On
# GitHub that costs a macOS runner and about 17 minutes, so .github/workflows/
# codeql-swift.yml runs only when clients/ios changes (and weekly). This runs
# the same suite with the same build here, so a finding shows up before the
# push rather than after it.
#
# The build is the app scheme from project.yml, which compiles Sources/
# MeinBefund and Sources/Shared; the developer tools in the Swift package do
# not ship and are left out, as in the workflow. The old
# default setup only ever built the package: the 30 files of the app itself
# were never analysed.
#
#   Scripts/codeql-swift.sh            # build, analyse, print the findings
#   KEEP_DB=1 Scripts/codeql-swift.sh  # keep the database for codeql query run
#
# Needs: brew install --cask codeql; brew install xcodegen; Xcode.
# Exit 1 on any finding not listed in Scripts/codeql-accepted.txt, so it can
# gate a push.
set -euo pipefail

cd "$(dirname "$0")/.."

command -v codeql >/dev/null || { echo "codeql not found: brew install --cask codeql"; exit 2; }
command -v xcodegen >/dev/null || { echo "xcodegen not found: brew install xcodegen"; exit 2; }

work="$(mktemp -d "${TMPDIR:-/tmp}/codeql-swift.XXXXXX")"
db="$work/db"
sarif="${SARIF_OUT:-$work/swift.sarif}"
if [ "${KEEP_DB:-}" != "1" ]; then
  trap 'rm -rf "$work"' EXIT
fi

xcodegen generate >/dev/null

# The same build as the workflow: simulator SDK, no signing (CodeQL needs the
# compiler invocations, not a runnable app), a private DerivedData so a stale
# local build cannot hide a file from the extractor. It goes in a script file
# because `codeql database create --command` splits on spaces and ignores
# shell quoting, which broke 'generic/platform=iOS Simulator' in two.
cat >"$work/build.sh" <<BUILD
#!/usr/bin/env bash
set -euo pipefail
xcodebuild -project MeinBefund.xcodeproj -scheme MeinBefund \\
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \\
  -derivedDataPath "$work/dd" CODE_SIGNING_ALLOWED=NO clean build -quiet
BUILD
chmod +x "$work/build.sh"

echo "codeql-swift: building under CodeQL (several minutes)"
codeql database create "$db" --language=swift --source-root . --overwrite \
  --command "$work/build.sh" >"$work/create.log" 2>&1 || {
  tail -40 "$work/create.log"
  echo "codeql-swift: the build failed, see above"
  exit 2
}

echo "codeql-swift: analysing"
codeql database analyze "$db" codeql/swift-queries:codeql-suites/swift-code-scanning.qls \
  --download --format=sarif-latest --output="$sarif" --threads=0 >"$work/analyze.log" 2>&1 || {
  tail -40 "$work/analyze.log"
  echo "codeql-swift: the analysis failed, see above"
  exit 2
}

# What the extractor saw, so a build that silently skipped the app shows up.
app_files="$(unzip -l "$db/src.zip" | grep -c '/Sources/MeinBefund/.*[.]swift$' || true)"
shared_files="$(unzip -l "$db/src.zip" | grep -c '/Sources/Shared/.*[.]swift$' || true)"
echo "codeql-swift: analysed $app_files app and $shared_files Shared Swift files"
[ "$app_files" -gt 0 ] || { echo "codeql-swift: no app file was extracted"; exit 2; }

# A finding listed in codeql-accepted.txt (rule, file and the reason) is
# printed but does not fail the run; anything else does.
status=0
python3 - "$sarif" "Scripts/codeql-accepted.txt" <<'EOF' || status=$?
import json, sys
run = json.load(open(sys.argv[1]))["runs"][0]
accepted = set()
for line in open(sys.argv[2]):
    line = line.split("#", 1)[0].split()
    if len(line) == 2:
        accepted.add(tuple(line))
new = 0
results = run.get("results", [])
print(f"codeql-swift: {len(results)} finding(s)")
for r in results:
    loc = r["locations"][0]["physicalLocation"]
    uri = loc["artifactLocation"]["uri"]
    known = (r["ruleId"], uri) in accepted
    new += not known
    print(f"  {'accepted' if known else r.get('level', 'warning'):8} {r['ruleId']:40} "
          f"{uri}:{loc.get('region', {}).get('startLine', '?')}")
    print(f"           {r['message']['text'][:160]}")
print(f"codeql-swift: {new} new, {len(results) - new} accepted in Scripts/codeql-accepted.txt")
sys.exit(1 if new else 0)
EOF
[ "${KEEP_DB:-}" = "1" ] && echo "codeql-swift: database kept at $db, SARIF at $sarif"
exit "$status"
