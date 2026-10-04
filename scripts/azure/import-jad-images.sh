#!/usr/bin/env bash
# =============================================================================
# Copy the JAD build that compose and CI run into ACR (ADR-055, #503).
# =============================================================================
#   scripts/azure/import-jad-images.sh [--dry-run]
#
# Pulls the four ghcr.io/metaform/jad images pinned in docker-compose.jad.yml
# for linux/amd64 and pushes them to ACR as jad-<name>:<first 12 of the commit>,
# the tag JAD_VERSION names in env.sh. Changes no running app: a Container App
# only moves when its revision names the new tag
# (docs/knowledge/runbooks/edc-v018-on-azure.md).
#
# Needs: docker, az (logged in), AcrPush on the registry.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

dry_run=""
[ "${1:-}" = "--dry-run" ] && dry_run=1

# The commit comes from compose, so the two cannot drift apart silently.
commit=$(grep -oE 'ghcr.io/metaform/jad/controlplane:[0-9a-f]{40}' "${REPO_DIR}/docker-compose.jad.yml" | head -1 | cut -d: -f2)
[ -n "$commit" ] || { err "no ghcr.io/metaform/jad/controlplane:<sha> in docker-compose.jad.yml"; exit 1; }
tag="${commit:0:12}"
[ "$tag" = "$JAD_VERSION" ] || {
  err "env.sh JAD_VERSION=${JAD_VERSION}, compose pins ${tag}. Set JAD_VERSION to the compose commit first."
  exit 1
}

[ -n "$dry_run" ] || az acr login --name "$ACR_NAME" >/dev/null
for name in controlplane dataplane identity-hub issuerservice; do
  src="ghcr.io/metaform/jad/${name}:${commit}"
  dst="${ACR_LOGIN_SERVER}/jad-${name}:${tag}"
  if [ -n "$dry_run" ]; then
    echo "  would copy ${src} -> ${dst}"
    continue
  fi
  docker pull -q --platform linux/amd64 "$src" >/dev/null
  docker tag "$src" "$dst"
  docker push -q "$dst" >/dev/null
  digest=$(docker inspect --format '{{index .RepoDigests 0}}' "$src" | cut -d@ -f2)
  ok "jad-${name}:${tag} (${digest:0:19}...)"
done

# Read back from the registry, not from the local cache (ADR-031).
if [ -z "$dry_run" ]; then
  for name in controlplane dataplane identity-hub issuerservice; do
    az acr repository show --name "$ACR_NAME" --image "jad-${name}:${tag}" --query name -o tsv >/dev/null ||
      { err "jad-${name}:${tag} is not in ${ACR_NAME}"; exit 1; }
  done
  ok "all four images readable in ${ACR_NAME} as :${tag}"
fi
