#!/usr/bin/env bash
# =============================================================================
# Delete the EDC 0.18 and 2026-03 CFM images from ACR (#927 step 7)
# =============================================================================
#   retire-v018-images.sh plan     read only: each repository, its tags, who uses it
#   retire-v018-images.sh delete   delete the repositories no app or job uses
#
# The repositories, by exact name:
#   jad-controlplane jad-dataplane jad-identity-hub jad-issuerservice
#       EDC 0.18 (ADR-055), and the April build under :2026-04-14; EDC 1.0
#       runs mvhd-edc-* (ADR-076)
#   cfm-tmanager cfm-pmanager cfm-kcagent cfm-edcvagent cfm-regagent cfm-obagent
#       the 2026-03 CFM; ADR-088's fork images live under cfm/<name>, a
#       different repository, never touched here
#   nginx
#       the 2026-03 CFM's control plane shim (mvhd-cfm-cp-shim)
#
# It refuses to delete a repository that the template of any Container App or
# job in the resource group still names, and a run of `delete` deletes only
# when no repository in the list is in use. Deleting a repository deletes
# every tag and manifest in it and cannot be undone.
#
# Deleting needs more than the maintainer's Container Apps Contributor role,
# so .github/workflows/acr-retire-v018-images.yml runs this as the CI identity.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

MODE="${1:-plan}"
REPOS=(jad-controlplane jad-dataplane jad-identity-hub jad-issuerservice
       cfm-tmanager cfm-pmanager cfm-kcagent cfm-edcvagent cfm-regagent cfm-obagent
       nginx)

case "$MODE" in plan | delete) ;; *) sed -n '5,6p' "$0"; exit 64 ;; esac

have=$(az acr repository list --name "$ACR_NAME" -o tsv)
# Every image the apps and jobs name, containers and init containers.
images_of() {
  python3 -c '
import json, sys
for it in json.load(sys.stdin):
    t = it["properties"]["template"]
    for c in (t.get("containers") or []) + (t.get("initContainers") or []):
        if c.get("image"):
            print(c["image"])'
}
used=$(
  {
    az containerapp list --resource-group "$RG" -o json | images_of
    az containerapp job list --resource-group "$RG" -o json | images_of
  } | sort -u
)
echo "  ${ACR_NAME}: $(grep -c . <<<"$have") repositories; apps and jobs name $(grep -c . <<<"$used") images"

blocked=0
present=()
for repo in "${REPOS[@]}"; do
  if ! grep -qx "$repo" <<<"$have"; then
    echo "  gone     ${repo}"
    continue
  fi
  present+=("$repo")
  tags=$(az acr repository show-tags --name "$ACR_NAME" --repository "$repo" -o tsv | tr '\n' ' ')
  users=$(grep -E "^${ACR_LOGIN_SERVER}/${repo}(:|@)" <<<"$used" | tr '\n' ' ' || true)
  if [ -n "$users" ]; then
    echo "  IN USE   ${repo} (tags: ${tags% }) named by: ${users% }"
    blocked=1
  else
    echo "  present  ${repo} (tags: ${tags% }), no app or job names it"
  fi
done

if [ "$MODE" = plan ]; then
  if [ "${#present[@]}" -eq 0 ]; then
    ok "nothing to delete"
  elif [ "$blocked" -eq 0 ]; then
    ok "'$0 delete' would delete the ${#present[@]} repositories listed as present"
  else
    warn "a repository in the list is in use; delete refuses"
  fi
  exit 0
fi

[ "$blocked" -eq 0 ] || { err "not deleting: a repository in the list is in use"; exit 1; }
for repo in ${present[@]+"${present[@]}"}; do
  az acr repository delete --name "$ACR_NAME" --repository "$repo" --yes -o none
  ok "deleted ${repo}"
done
left=$(az acr repository list --name "$ACR_NAME" -o tsv)
for repo in "${REPOS[@]}"; do
  if grep -qx "$repo" <<<"$left"; then err "${repo} is still listed"; exit 1; fi
done
echo "Left in ${ACR_NAME}: $(grep -c . <<<"$left") repositories"
