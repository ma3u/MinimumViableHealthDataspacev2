#!/bin/bash
# Pulls a diagnostics archive from a paired iPhone running a Debug build, over
# USB, without the share sheet.
#
# The store on the phone is sealed under a key that never leaves it, and a
# file under complete protection cannot even be opened by the paired Mac's
# file service (measured: EPERM), so a container download is useless. Instead
# the app is launched with `-MBExportDiagnostics`, builds the archive itself,
# leaves it in its temporary directory under the default protection class, and
# this script fetches it and unzips it OUTSIDE the repository. Debug builds
# only: the argument is compiled out of a release.
#
#   Scripts/pull-diagnostics.sh [output directory]   default ~/Downloads
#   DEVICE=<name or udid>                              default: the first paired device
#
# Then: swift run ScanReplay <the unzipped folder>
set -euo pipefail

cd "$(dirname "$0")/.."
BUNDLE=red.mabu.meinbefund
OUT="${1:-$HOME/Downloads}"
case "$(cd "$OUT" && pwd)" in
  *"/clients/ios"*) echo "refusing: a diagnostics export is health data and never lives in the repository" >&2; exit 2 ;;
esac

DEVICE="${DEVICE:-}"
if [ -z "$DEVICE" ]; then
  json="$(mktemp)"
  xcrun devicectl list devices --json-output "$json" >/dev/null 2>&1
  DEVICE="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); r=[x for x in d["result"]["devices"] if "paired" in x.get("connectionProperties",{}).get("pairingState","")]; print((r or d["result"]["devices"])[0]["identifier"])' "$json")"
  rm -f "$json"
fi
[ -n "$DEVICE" ] || { echo "no paired device; set DEVICE" >&2; exit 1; }

stamp="$(date +%Y-%m-%d-%H%M)"
zip="$OUT/klarbefund-diagnostics-$stamp.zip"
echo "==> Asking the app on $DEVICE to build its diagnostics archive"
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing "$BUNDLE" -- -MBExportDiagnostics >/dev/null

echo "==> Waiting for the archive"
for _ in $(seq 1 45); do
  sleep 2
  if xcrun devicectl device copy from --device "$DEVICE" --domain-type appDataContainer \
       --domain-identifier "$BUNDLE" --source tmp/pull-diagnostics.zip --destination "$zip" >/dev/null 2>&1; then
    break
  fi
done
[ -s "$zip" ] || { echo "the archive did not appear. Is the phone unlocked, and is this a Debug build?" >&2; exit 1; }

folder="${zip%.zip}"
rm -rf "$folder"
mkdir -p "$folder"
unzip -q "$zip" -d "$folder"
# The zip carries one top-level folder; flatten it so the path is predictable.
inner="$(find "$folder" -mindepth 1 -maxdepth 1 -type d | head -1)"
if [ -n "$inner" ] && [ "$(find "$folder" -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 ]; then
  mv "$inner"/* "$folder"/ && rmdir "$inner"
fi
rm -f "$zip"
echo "==> $folder"
find "$folder" -type f | sed 's|^|    |'
echo "==> Relaunching the app normally, which deletes the archive on the phone"
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing "$BUNDLE" >/dev/null
echo
echo "Replay: swift run ScanReplay \"$folder\""
