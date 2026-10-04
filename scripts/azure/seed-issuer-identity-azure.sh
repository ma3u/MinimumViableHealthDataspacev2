#!/usr/bin/env bash
# =============================================================================
# Give the 0.18 IssuerService on Azure its identity (ADR-055, #503)
# =============================================================================
#   seed-issuer-identity-azure.sh seed     key, context, activation, definitions
#   seed-issuer-identity-azure.sh verify   restart the issuer, then check that
#                                          its DID document resolves with a key
#
# Run after migrate-edc-to-v018.sh has moved mvhd-issuerservice. The work is
# scripts/azure/issuer-identity-job.sh, which runs inside the environment as
# the one-shot job mvhd-issuer-identity: the issuer's identity and DID ports
# are internal, and so are Vault and the database's firewall rule.
#
# Secrets (Vault token, the provisioner and issuer client secrets, the
# database password) are read here, never printed, and handed to the job as
# job secrets. The issuer client secret comes from Keycloak's admin API, so
# whatever the realm holds is what the issuer uses.
#
# Needs: az (logged in) with the PIM role that covers Container Apps jobs
# (rol-ssg-prd-project_owner; Container Apps Contributor has no jobs action),
# Key Vault Secrets User on the vault, python3 with PyYAML.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${SCRIPT_DIR}/env.sh"
eval "$(get_aca_fqdns)"

MODE="${1:-}"
case "$MODE" in seed|verify) ;; *) sed -n '2,8p' "$0"; exit 2 ;; esac
JOB="mvhd-issuer-identity"
KC_URL="https://${KEYCLOAK_PUBLIC_HOSTNAME_OVERRIDE:-auth.ehds.mabu.red}"
COMPOSE_X="I8dt08pwP4nQPv4MacRU5u5KsroVa3ESkWmyQEDn36A"

# ── Secrets, never printed ──────────────────────────────────────────────────
KC_ADMIN_PW=$(kc_admin_password)
[ -n "$KC_ADMIN_PW" ] || { err "no Keycloak admin password"; exit 1; }
ADMIN_TOKEN=$(curl -sS -m 30 -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  --data-urlencode grant_type=password --data-urlencode client_id=admin-cli \
  --data-urlencode "username=${KC_ADMIN_USER}" --data-urlencode "password=${KC_ADMIN_PW}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))")
[ -n "$ADMIN_TOKEN" ] || { err "no Keycloak admin token from ${KC_URL}"; exit 1; }
client_secret() {
  local uuid
  uuid=$(curl -sS -m 30 -H "Authorization: Bearer $ADMIN_TOKEN" \
    "${KC_URL}/admin/realms/edcv/clients?clientId=$1" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
  [ -n "$uuid" ] || { err "the '$1' client does not exist in realm edcv"; return 1; }
  curl -sS -m 30 -H "Authorization: Bearer $ADMIN_TOKEN" \
    "${KC_URL}/admin/realms/edcv/clients/${uuid}/client-secret" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('value',''))"
}
PROV_SECRET=$(client_secret provisioner)
ISSUER_SECRET=$(client_secret issuer)
PG_PW=$(pg_admin_password)
for v in PROV_SECRET ISSUER_SECRET PG_PW; do
  [ -n "${!v}" ] || { err "could not read ${v}"; exit 1; }
done
log "read the provisioner (${#PROV_SECRET}), issuer (${#ISSUER_SECRET}) and database (${#PG_PW}) secrets"

# ── The activation SQL, with Azure's DID and the key's x left to the job ────
SQL_B64=$(sed -e "s/issuerservice%3A10016/${ISSUER_APP}%3A10016/g" \
              -e "s#http://issuerservice:10012#http://${ISSUER_APP}:10012#g" \
              -e "s/${COMPOSE_X}/__X__/g" \
              "${REPO_DIR}/jad/seed-issuer-identity.sql" | base64 | tr -d '\n')

# ── verify: the issuer loads its identity at start ──────────────────────────
if [ "$MODE" = verify ]; then
  rev=$(az containerapp show -n "$ISSUER_APP" -g "$RG" --query properties.latestRevisionName -o tsv)
  log "restarting ${rev} so it loads the identity"
  az containerapp revision restart -n "$ISSUER_APP" -g "$RG" --revision "$rev" -o none
  for _ in $(seq 1 40); do
    state=$(az containerapp revision show -n "$ISSUER_APP" -g "$RG" --revision "$rev" \
      --query properties.healthState -o tsv 2>/dev/null || echo "")
    [ "$state" = Healthy ] && break
    sleep 15
  done
  [ "$state" = Healthy ] || { err "${rev} is '${state}' after the restart"; exit 1; }
  ok "${rev} Healthy"
fi

# ── The job definition, secrets in a 0600 file removed on exit ──────────────
umask 077
yaml=$(mktemp)
trap 'rm -f "$yaml"' EXIT
ENV_ID=$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query id -o tsv)
LOCATION=$(az containerapp env show -n "$ACA_ENV" -g "$RG" --query location -o tsv)
VAULT_TOKEN="$VAULT_ROOT_TOKEN" PROV_SECRET="$PROV_SECRET" ISSUER_SECRET="$ISSUER_SECRET" PG_PW="$PG_PW" \
python3 - "$yaml" "${SCRIPT_DIR}/issuer-identity-job.sh" <<PY
import os, sys, yaml
out, script = sys.argv[1], open(sys.argv[2]).read()
env = {
  "MODE": "${MODE}", "ISSUER_HOST": "${ISSUER_APP}", "VAULT_URL": "${VAULT_URL}",
  "KC_URL": "${KC_URL}", "PG_HOST": "${PG_HOST}", "PG_USER": "${PG_ADMIN}",
  "PG_DB": "issuerservice_v018", "SQL_B64": "${SQL_B64}",
}
secrets = {"vault-token": "VAULT_TOKEN", "provisioner-secret": "PROVISIONER_SECRET",
           "issuer-secret": "ISSUER_SECRET", "pg-password": "PG_PASSWORD"}
values = {"vault-token": os.environ["VAULT_TOKEN"], "provisioner-secret": os.environ["PROV_SECRET"],
          "issuer-secret": os.environ["ISSUER_SECRET"], "pg-password": os.environ["PG_PW"]}
doc = {
  "location": "${LOCATION}",
  "properties": {
    "environmentId": "${ENV_ID}",
    "configuration": {
      "triggerType": "Manual", "replicaTimeout": 600, "replicaRetryLimit": 0,
      "manualTriggerConfig": {"parallelism": 1, "replicaCompletionCount": 1},
      "secrets": [{"name": k, "value": v} for k, v in values.items()],
    },
    "template": {"containers": [{
      "name": "issuer-identity", "image": "docker.io/library/alpine:3.19",
      "command": ["/bin/sh", "-c"], "args": [script],
      "resources": {"cpu": 0.25, "memory": "0.5Gi"},
      "env": [{"name": k, "value": v} for k, v in env.items()]
             + [{"name": n, "secretRef": s} for s, n in secrets.items()],
    }]},
  },
}
yaml.safe_dump(doc, open(out, "w"), sort_keys=False)
PY

if az containerapp job show -n "$JOB" -g "$RG" -o none 2>/dev/null; then
  az containerapp job update -n "$JOB" -g "$RG" --yaml "$yaml" -o none
else
  az containerapp job create -n "$JOB" -g "$RG" --yaml "$yaml" -o none
fi
rm -f "$yaml"

exec_name=$(az containerapp job start -n "$JOB" -g "$RG" --query name -o tsv)
log "started ${JOB} execution ${exec_name} (${MODE})"
for _ in $(seq 1 30); do
  status=$(az containerapp job execution show -n "$JOB" -g "$RG" --job-execution-name "$exec_name" \
    --query properties.status -o tsv 2>/dev/null || echo "")
  [ "$status" = Running ] && break
  sleep 5
done
# The job sleeps 60 s after its work, so the log is still there to read.
timeout 600 az containerapp job logs show -n "$JOB" -g "$RG" --execution "$exec_name" \
  --container issuer-identity --follow --format text 2>/dev/null || true
for _ in $(seq 1 40); do
  status=$(az containerapp job execution show -n "$JOB" -g "$RG" --job-execution-name "$exec_name" \
    --query properties.status -o tsv 2>/dev/null || echo "")
  case "$status" in Succeeded|Failed|Stopped) break ;; esac
  sleep 10
done
# The execution status is the verdict, not this script's run (a wrapper goes
# green either way).
[ "$status" = Succeeded ] || { err "${JOB} ${exec_name}: ${status:-unknown}"; exit 1; }
ok "${JOB} ${exec_name}: Succeeded (${MODE})"
