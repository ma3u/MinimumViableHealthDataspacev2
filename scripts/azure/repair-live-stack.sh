#!/usr/bin/env bash
# =============================================================================
# Repair the live stack after Postgres has lost every database.
# =============================================================================
# Written for the 2026-09-30 incident (docs/gotchas.md): `mvhd-postgres` had the
# `pg-data` AzureFile volume declared and `volumeMounts: null`, so PGDATA was
# ordinary container-local storage. ACA recreated the replica on its own at
# 03:59:55Z, `initdb` ran, and the `keycloak` and `cfm` databases were gone.
# Every token grant and every browser sign-in returned 500 for an hour and a
# half while discovery kept answering 200 from the Infinispan cache.
#
# Phase 1 was believed to be the fix. It was not, and it is now withdrawn: see
# ADR-041 and the banner on phase_1 below. Phases 2 to 6 are the recovery, and
# they are what to run whenever this database is lost.
#
#   ./scripts/azure/repair-live-stack.sh check  # read-only, safe any time
#   ./scripts/azure/repair-live-stack.sh 1      # WITHDRAWN, refuses and explains
#   ./scripts/azure/repair-live-stack.sh 2      # recreate the 6 other databases
#   ./scripts/azure/repair-live-stack.sh 3      # restart Keycloak (Liquibase)
#   ./scripts/azure/repair-live-stack.sh 4      # re-import the edcv realm
#   ./scripts/azure/repair-live-stack.sh 5      # Vault bootstrap + provisioner role
#   ./scripts/azure/repair-live-stack.sh 6      # CFM agents to min=1 (#318)
#
# Run them in order and read the output. Each phase verifies itself and exits
# non-zero rather than continuing on a bad state.
#
# This recovery does not make Postgres durable, because on ACA it cannot be.
# It puts the stack back. ADR-041 is the decision that stops it recurring.
#
# Needs: az (logged in), gh (phase 2), docker + PyYAML (phase 5).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

KC_PUBLIC_URL="${KEYCLOAK_PUBLIC_URL:-https://auth.ehds.mabu.red}"
CFM_APPS=(mvhd-cfm-cp-shim mvhd-cfm-kcagent mvhd-cfm-edcvagent
          mvhd-cfm-regagent mvhd-cfm-obagent)

say()  { echo "[$(date -u +%H:%M:%S)] $*"; }
die()  { echo "FAIL: $*" >&2; exit 1; }

# An expired az token used to surface as a Python traceback out of the middle of
# the check phase, because `containerapp show` printed the AADSTS70043 text to
# stderr and an empty document to stdout. The token lifetime here is four hours
# (conditional access), which is shorter than an incident, so this will happen
# again. Say it in one line instead.
require_az() {
  # `az account show` is NOT the probe: it reads the cached profile and returns
  # 0 with a dead token. Measured 2026-09-30 18:00Z against an expired session:
  #   az account show             -> rc 0
  #   az account get-access-token -> rc 1, AADSTS70043
  # get-access-token actually attempts the refresh, so it is the one that knows.
  az account get-access-token -o none >/dev/null 2>&1 || die "$(cat <<'MSG'
the Azure CLI is not logged in, or its token has expired.
Conditional access caps it at 4 hours, so a session that worked this morning
will not work this evening. Re-authenticate and re-run:

  az login --tenant 8b87af7d-8647-4dc7-8df4-5f69a2011bb5
MSG
)"
}

# ── check ───────────────────────────────────────────────────────────────────
phase_check() {
  say "Keycloak"
  "${SCRIPT_DIR}/check-keycloak-health.sh" "$KC_PUBLIC_URL" edcv || true

  echo ""
  say "Postgres volume and replica age"
  az containerapp show --name "$PG_APP" --resource-group "$RG" -o json |
    python3 -c "
import json, sys
t = json.load(sys.stdin)['properties']['template']
print('  volumes:', json.dumps(t.get('volumes')))
for c in t['containers']:
    print('  mounts: ', json.dumps(c.get('volumeMounts')))
"
  az containerapp replica list --name "$PG_APP" --resource-group "$RG" \
    --query "[].{created:properties.createdTime,state:properties.runningState}" \
    -o table || true
  echo "  (a replica created minutes ago means initdb re-ran and the cluster is empty)"
  echo "  (mounts should be null: Postgres crash-loops on an SMB mount, ADR-041)"
  # Single revision mode keeps the previous replica serving when a new revision
  # never goes healthy, so the site can look fine while the active revision is
  # Failed. Print both or that reads as success.
  az containerapp revision list --name "$PG_APP" --resource-group "$RG" \
    --query "[].{rev:name,health:properties.healthState,state:properties.runningState,traffic:properties.trafficWeight}" \
    -o table || true

  echo ""
  say "CFM agents"
  local app
  for app in "${CFM_APPS[@]}"; do
    printf "  %-22s min=%s  " "$app" \
      "$(az containerapp show --name "$app" --resource-group "$RG" \
           --query 'properties.template.scale.minReplicas' -o tsv 2>/dev/null)"
    az containerapp revision list --name "$app" --resource-group "$RG" \
      --query "[?properties.active].{r:properties.replicas,h:properties.healthState,s:properties.runningState}" \
      -o tsv 2>/dev/null | tr '\t' ' '
  done
}

# ── 1: withdrawn (ADR-041) ──────────────────────────────────────────────────
# This phase used to mount `pg-data` on mvhd-postgres, on the theory that the
# 2026-09-30 wipe was caused by the mount being missing. That theory was wrong.
#
# Run on the live app 2026-10-02, the mount did not make Postgres durable, it
# made it crash-loop:
#
#   chmod: changing permissions of '/var/lib/postgresql/data/pgdata': Operation not permitted
#   initdb: error: could not change permissions of directory ".../pgdata": Operation not permitted
#
# `initdb` chmods PGDATA unconditionally; SMB cannot. The replica went
# NotRunning and the revision Failed. ACA was in Single revision mode, so the
# previous replica kept serving and the site stayed up by luck, not design.
#
# It is kept as a loud refusal rather than deleted, because the printed runbook
# and the commit history both still say "run phase 1" and a silently missing
# phase would read as a no-op.
phase_1() {
  cat >&2 <<'MSG'
Phase 1 is withdrawn. Do not mount pg-data.

Postgres cannot initdb on an SMB Azure Files share: initdb chmods PGDATA and
SMB returns EPERM, so the mount crash-loops the database instead of persisting
it. No mountOptions fixes it, and NFS needs a Premium FileStorage account plus
a VNet-injected ACA environment, neither of which this estate has.

Durability comes from Azure Database for PostgreSQL Flexible Server.
  decision: docs/ADRs/ADR-041-managed-postgres-on-azure-containerised-locally.md
  evidence: docs/gotchas.md (2026-10-02)

Until that cutover lands, mvhd-postgres is ephemeral by design and a replica
restart empties it. Recover with phases 2 to 6; phase 4 brings the realm back.
MSG
  exit 1
}

# ── 2: the six non-keycloak databases ───────────────────────────────────────
phase_2() {
  say "Phase 2: recreate controlplane, dataplane, dataplane_omop, identityhub,"
  say "         issuerservice and cfm"
  # Not 06-post-deploy.sh: its creates go through `az containerapp exec`, which
  # needs a TTY and dies headless. cfm-seed.yml runs a one-shot ACA job instead,
  # and also reseeds the cell and dataspace profile that /onboarding reads.
  gh workflow run cfm-seed.yml -f keep_apps_warm=true
  say "started. Watch it with:"
  say "  gh run watch \$(gh run list --workflow=cfm-seed.yml --limit 1 --json databaseId -q '.[0].databaseId')"
}

# ── 3: Keycloak schema ──────────────────────────────────────────────────────
phase_3() {
  say "Phase 3: restart ${KEYCLOAK_APP} so Liquibase rebuilds its schema"
  # Keycloak runs its migrations at startup only. On 2026-09-30 its replica had
  # been up since 2026-09-14, so it never re-ran them against the empty cluster
  # and simply kept 500ing on every session write.
  local rev
  rev=$(az containerapp show --name "$KEYCLOAK_APP" --resource-group "$RG" \
    --query "properties.latestRevisionName" -o tsv)
  say "restarting ${rev}"
  az containerapp revision restart --name "$KEYCLOAK_APP" --resource-group "$RG" \
    --revision "$rev" -o none
  say "waiting 120s for the migrations"
  sleep 120
  "${SCRIPT_DIR}/check-keycloak-health.sh" "$KC_PUBLIC_URL" master ||
    say "master not healthy yet: give it another minute, then re-run 'check'"
}

# ── 4: the edcv realm ───────────────────────────────────────────────────────
phase_4() {
  say "Phase 4: re-import the edcv realm"
  KEYCLOAK_PUBLIC_URL="$KC_PUBLIC_URL" "${SCRIPT_DIR}/restore-keycloak-realm.sh"
}

# ── 5: Vault bootstrap, including the provisioner JWT role ──────────────────
phase_5() {
  say "Phase 5: rebuild the Vault bootstrap image and run it"
  # The bootstrap script is the one in 06-post-deploy.sh and is extracted from
  # it rather than copied, so the provisioner JWT role has a single definition.
  # Boundaries are found by marker, not by line number, so the extraction fails
  # loudly if that file is restructured.
  local src start end dir tag img
  src="${SCRIPT_DIR}/06-post-deploy.sh"
  # -F: the marker contains ${...} and <<, and the `grep` on a dev machine may
  # be ugrep, which does not match this pattern unquoted. Fixed-string is right
  # for a literal marker anyway.
  start=$(grep -nF 'cat > "${VAULT_DIR}/bootstrap.sh" <<VAULTSCRIPT' "$src" | cut -d: -f1 | head -1)
  end=$(grep -nF 'DOCKERFILE' "$src" | grep -E ':DOCKERFILE$' | cut -d: -f1 | tail -1)
  [ -n "$start" ] && [ -n "$end" ] && [ "$end" -gt "$start" ] ||
    die "could not find the bootstrap heredocs in 06-post-deploy.sh (start='${start}' end='${end}')"

  eval "$(get_aca_fqdns)"

  # The fragment expands this into the provisioner role at build time (#455).
  KC_ISSUER=$(keycloak_issuer)
  [ -n "$KC_ISSUER" ] || die "Keycloak's edcv discovery did not answer; cannot bind the provisioner role"
  say "Keycloak issuer: ${KC_ISSUER}"

  dir=$(mktemp -d)
  VAULT_DIR="$dir"
  export VAULT_DIR
  sed -n "${start},${end}p" "$src" > "${dir}/_fragment.sh"
  # shellcheck source=/dev/null
  source "${dir}/_fragment.sh"
  rm -f "${dir}/_fragment.sh"
  grep -qF 'auth/jwt/role/provisioner' "${dir}/bootstrap.sh" ||
    die "the extracted bootstrap.sh has no provisioner role; check 06-post-deploy.sh"
  grep -qF "\"bound_issuer\\\":\\\"${KC_ISSUER}\\\"" "${dir}/bootstrap.sh" ||
    die "the provisioner role in bootstrap.sh is not bound to ${KC_ISSUER}"
  say "extracted bootstrap.sh, provisioner role bound to ${KC_ISSUER}"

  # buildx pushes with the local docker credentials. An Entra login needs only
  # AcrPush; the admin password this used to read needs listCredentials, which
  # an operator with AcrPush does not have, and nothing here used it.
  az acr login --name "$ACR_NAME" >/dev/null

  tag="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  img="${ACR_LOGIN_SERVER}/mvhd-vault-bootstrap:${tag}"
  docker buildx build --platform linux/amd64 \
    -t "$img" -t "${ACR_LOGIN_SERVER}/mvhd-vault-bootstrap:latest" --push "$dir"
  rm -rf "$dir"

  # ACA will not re-pull :latest (CLAUDE.md gotcha 6), so point the job at the
  # immutable tag or it keeps running whatever it first resolved.
  say "pointing ${VAULT_BOOTSTRAP_JOB} at ${tag}"
  az containerapp job update --name "$VAULT_BOOTSTRAP_JOB" --resource-group "$RG" \
    --image "$img" -o none
  az containerapp job start --name "$VAULT_BOOTSTRAP_JOB" --resource-group "$RG" -o none
  say "started. Check it with:"
  say "  az containerapp job execution list --name ${VAULT_BOOTSTRAP_JOB} --resource-group ${RG} -o table"
}

# ── 6: the CFM agents ───────────────────────────────────────────────────────
phase_6() {
  say "Phase 6: CFM agents to min=1, restart the two that authenticate to Vault"
  # min=1 is not a preference: the four agents are NATS consumers with no HTTP
  # ingress, so no request exists that could scale them up from zero, and a
  # participant onboarded while they are at zero keeps all three activities
  # pending for ever. That is #318.
  local app rev
  for app in "${CFM_APPS[@]}"; do
    say "  ${app} -> 1/1"
    az containerapp update --name "$app" --resource-group "$RG" \
      --min-replicas 1 --max-replicas 1 -o none
  done
  for app in mvhd-cfm-kcagent mvhd-cfm-edcvagent; do
    rev=$(az containerapp show --name "$app" --resource-group "$RG" \
      --query "properties.latestRevisionName" -o tsv)
    say "  restarting ${app} (${rev})"
    az containerapp revision restart --name "$app" --resource-group "$RG" \
      --revision "$rev" -o none
  done
  say "waiting 60s"
  sleep 60
  for app in mvhd-cfm-kcagent mvhd-cfm-edcvagent; do
    echo "--- ${app} ---"
    az containerapp logs show --name "$app" --resource-group "$RG" --tail 15 2>/dev/null | tail -8
  done
  say "An app being Running is not an agent consuming. Onboard a participant and"
  say "read its three activities before calling #318 done."
}

case "${1:-}" in
  check) require_az; phase_check ;;
  1) require_az; phase_1 ;;
  2) require_az; phase_2 ;;
  3) require_az; phase_3 ;;
  4) require_az; phase_4 ;;
  5) require_az; phase_5 ;;
  6) require_az; phase_6 ;;
  *) sed -n '15,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
