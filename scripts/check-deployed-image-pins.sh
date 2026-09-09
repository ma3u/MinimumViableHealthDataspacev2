#!/usr/bin/env bash
# Fail if any deployed Container App is running a floating `:latest` image.
#
# Why this exists: every check that LOOKED like a pinning check read the
# repository, not the cluster. docker-compose*.yml and scripts/azure/env.sh were
# correctly pinned by issue #97 Phase A, so ADR-029 conformance appeared
# satisfied while 8 of 15 ACA apps ran `:latest` frozen on a 2026-04-14 digest
# (issue #116). Nothing compared the declared version to the running one.
#
# ACA caches `:latest` and will not re-pull on restart (CLAUDE.md gotcha #6), so
# a `:latest` deployment is pinned to an unknown digest with no rollback target
# and no audit trail — the worst of both worlds.
#
# Usage:
#   ./scripts/check-deployed-image-pins.sh                 # fail on any :latest
#   ./scripts/check-deployed-image-pins.sh --list          # report only, exit 0
#
# Requires: az, logged in with read access to the resource group.
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-mvhd-dev}"
LIST_ONLY=0
[[ "${1:-}" == "--list" ]] && LIST_ONLY=1

command -v az >/dev/null 2>&1 || {
  echo "ERROR: az CLI not found" >&2
  exit 1
}

echo "Checking deployed image pins in ${RESOURCE_GROUP}"
echo ""

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

az containerapp list -g "$RESOURCE_GROUP" \
  --query "[].{app:name,image:properties.template.containers[0].image}" \
  -o tsv >"$TMP"

[[ -s "$TMP" ]] || {
  echo "ERROR: no container apps returned for ${RESOURCE_GROUP}" >&2
  exit 1
}

floating=0
total=0
while IFS=$'\t' read -r app image; do
  [[ -n "$app" ]] || continue
  total=$((total + 1))
  tag="${image##*:}"
  if [[ "$image" == *:latest ]]; then
    printf '  FLOATING  %-24s %s\n' "$app" "${image##*/}"
    floating=$((floating + 1))
  else
    printf '  pinned    %-24s %s\n' "$app" "${image##*/}"
  fi
  : "$tag"
done <"$TMP"

echo ""
echo "${total} apps, ${floating} on :latest"

if [[ "$floating" -gt 0 && "$LIST_ONLY" -eq 0 ]]; then
  cat >&2 <<'MSG'

ERROR: at least one app is deployed on a floating :latest tag.

  ACA will not re-pull :latest on restart, so these are frozen on whatever
  digest was current when the revision was created — with no way to say which
  build is running, and nothing to roll back to.

  To pin an app to the image it is ALREADY running (no content change):

    d=$(az acr repository show-manifests -n acrmvhdehds --repository <repo> \
         --detail -o json | jq -r '.[] | select(.tags[]? == "latest") | .digest')
    az acr import -n acrmvhdehds --source "acrmvhdehds.azurecr.io/<repo>@${d}" \
      --image "<repo>:<version>" --force
    az containerapp update -n <app> -g rg-mvhd-dev \
      --image "acrmvhdehds.azurecr.io/<repo>:<version>"

  Then set the matching *_VERSION variable in scripts/azure/env.sh so a future
  deploy does not silently revert it.
MSG
  exit 1
fi
