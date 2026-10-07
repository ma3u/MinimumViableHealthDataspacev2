#!/usr/bin/env bash
# =============================================================================
# The five demo participants on Azure, re-seeded with DIDs that resolve (#574)
# =============================================================================
# Runs INSIDE the ACA environment, as the job edc-reseed-identity-layer.yml
# creates. Azure's five demo participants were seeded twice, inconsistently:
# the IdentityHub with the graph-layer DIDs (did:web:alpha-klinik.de:..., the
# #345 mix-up, by the old 05-edc-seed.sh) and one shared fake key, the control
# plane with compose's host (did:web:identityhub%3A7083:...). Neither resolves
# on Azure, so no credential can be issued to them.
#
# This runs the sequence compose and CI run (scripts/seed-identity-layer.sh),
# with Azure's addresses and DID host mvhd-identityhub%3A7083:
#
#   MODE=plan   list the five on the control plane and in IdentityHub, and
#               what would be replaced; change nothing
#   MODE=apply  1. delete each context whose DID is not the target, in
#                  IdentityHub and on the control plane
#               2. control-plane contexts       scripts/azure/05-cp-participants.sh
#               3. IdentityHub records          scripts/seed-identityhub-participants.sh
#               4. the control plane's copy of each STS secret
#                                               scripts/repair-cp-sts-secrets.sh
#               5. holders on the IssuerService scripts/seed-issuer-holders.sh
#               6. a MembershipCredential each  scripts/request-participant-credentials.sh
#
# The issuer's own identity and definitions are not touched: Azure has them
# from issuer-identity-job.sh (#572). Run the tenant cleanup
# (cfm-remove-tenants.yml) first: step 3 mirrors every control-plane context,
# so a failed tenant still there would get an IdentityHub record again.
#
# Environment (from the job definition): MODE, CP, IH, ISSUER, KC, DID_HOST,
# CREDENTIALS_BASE, PROTOCOL_BASE, VAULT_ADDR; secrets ADMIN_SECRET,
# PROVISIONER_SECRET, VAULT_TOKEN. The scripts arrive as SCRIPTS_TGZ_B64.
# =============================================================================
set -uo pipefail
MODE="${MODE:-plan}"
SLUGS=(alpha-klinik pharmaco medreg lmc irs)
MGMT_V="${EDC_MGMT_API_VERSION:-v5beta}"

log()  { printf '[reseed] %s\n' "$*"; }
fail() { printf '[reseed] FAIL %s\n' "$*"; exit 1; }

token() {  # token <client_id> <secret>
  curl -sS --max-time 20 -X POST "${KC}/realms/edcv/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=client_credentials" --data-urlencode "client_id=$1" \
    --data-urlencode "client_secret=$2" | jq -r '.access_token // empty'
}

ADMIN_TOKEN=$(token admin "$ADMIN_SECRET")
[ -n "$ADMIN_TOKEN" ] || fail "no token for the admin client from ${KC}"
log "admin token: ok"
# The control plane's participant API wants the provisioner role; the admin
# token's DELETE there is refused with 403 (cfm-remove-tenants, 2026-10-07).
PROV_TOKEN=$(token provisioner "$PROVISIONER_SECRET")
[ -n "$PROV_TOKEN" ] || fail "no token for the provisioner client"

target_did() { printf 'did:web:%s:%s' "$DID_HOST" "$1"; }

# Rows "<store> <id> <did> <slug>" for every context whose DID names one of
# the five slugs, from the control plane and from IdentityHub.
inventory() {
  local cp ih
  cp=$(curl -sS --max-time 30 -H "Authorization: Bearer ${ADMIN_TOKEN}" "${CP}/${MGMT_V}/participants")
  ih=$(curl -sS --max-time 30 -H "Authorization: Bearer ${ADMIN_TOKEN}" "${IH}/v1alpha/participants")
  CP_JSON="$cp" IH_JSON="$ih" SLUG_LIST="${SLUGS[*]}" python3 - <<'PY'
import json, os
slugs = os.environ["SLUG_LIST"].split()
# The graph-layer DIDs the old 05-edc-seed.sh gave IdentityHub (#345).
GRAPH = {"did:web:alpha-klinik.de:participant": "alpha-klinik",
         "did:web:pharmaco.de:research": "pharmaco",
         "did:web:medreg.de:hdab": "medreg",
         "did:web:lmc.nl:clinic": "lmc",
         "did:web:irs.fr:hdab": "irs"}
def slug_of(did):
    if did in GRAPH: return GRAPH[did]
    last = did.rsplit(":", 1)[-1]
    return last if did.startswith("did:web:") and last in slugs else None
def rows(name, raw, idk, didk):
    try: data = json.loads(raw)
    except Exception: print(f"#unreadable {name}"); return
    for p in data if isinstance(data, list) else []:
        did = p.get(didk) or p.get("did") or p.get("identity") or ""
        pid = p.get(idk) or p.get("participantContextId") or p.get("@id") or ""
        s = slug_of(did)
        if s and pid: print(f"{name} {pid} {did} {s}")
rows("cp", os.environ["CP_JSON"], "@id", "identity")
rows("ih", os.environ["IH_JSON"], "participantContextId", "did")
PY
}

INV=$(inventory)
log "the five today:"
printf '%s\n' "$INV" | while read -r store id did slug; do
  [ -n "$store" ] || continue
  want=$(target_did "$slug")
  mark="keep"; [ "$did" = "$want" ] || mark="REPLACE"
  printf '  %-3s %-34s %-48s %s\n' "$store" "$id" "$did" "$mark"
done
for s in "${SLUGS[@]}"; do
  printf '%s\n' "$INV" | grep -q " ${s}$" || log "  ${s}: in neither store"
done

if [ "$MODE" != apply ]; then log "MODE=${MODE}: nothing changed"; exit 0; fi

# ── 1. Delete what carries the wrong DID ────────────────────────────────────
deleted=0
while read -r store id did slug; do
  [ -n "$store" ] || continue
  [ "$did" = "$(target_did "$slug")" ] && continue
  case "$store" in
    ih) url="${IH}/v1alpha/participants/${id}" ;;
    cp) url="${CP}/${MGMT_V}/participants/${id}" ;;
    *) continue ;;
  esac
  bearer="$ADMIN_TOKEN"; [ "$store" = cp ] && bearer="$PROV_TOKEN"
  code=$(curl -sS --max-time 30 -o /tmp/del.out -w '%{http_code}' -X DELETE \
    -H "Authorization: Bearer ${bearer}" "$url")
  case "$code" in
    2??|404) log "  deleted ${store} ${id} (${did}) HTTP ${code}"; deleted=$((deleted + 1)) ;;
    *) log "  could not delete ${store} ${id}: HTTP ${code} $(head -c 200 /tmp/del.out)"; exit 1 ;;
  esac
done <<EOF
$INV
EOF
log "deleted ${deleted} context(s) with a DID that does not resolve"

# ── 2 to 6. The compose sequence, with Azure's addresses ────────────────────
[ -n "${SCRIPTS_TGZ_B64:-}" ] || fail "no scripts (SCRIPTS_TGZ_B64 is empty)"
mkdir -p /tmp/repo && printf '%s' "$SCRIPTS_TGZ_B64" | base64 -d | tar -xz -C /tmp/repo || fail "could not unpack the scripts"
cd /tmp/repo || exit 1
[ -f scripts/azure/05-cp-participants.sh ] || fail "the script bundle is incomplete"
export KEYCLOAK_URL="$KC" EDC_MANAGEMENT_URL="$CP" EDC_IDENTITY_URL="$IH" EDC_ISSUER_URL="$ISSUER"
export EDC_MGMT_API_VERSION="$MGMT_V" DID_HOST CREDENTIALS_BASE PROTOCOL_BASE
export EDC_CLIENT_ID=admin EDC_CLIENT_SECRET="$ADMIN_SECRET" PROBE_DID_DOCS=0
export VAULT_ADDR VAULT_TOKEN
# The issuer as mvhd-env resolves it. request-participant-credentials.sh
# defaults to compose's did:web:issuerservice%3A10016:issuer, which IdentityHub
# cannot resolve here (UnknownHostException), so every request went to ERROR
# (2026-10-07). 05-cfm-seed.sh and migrate-edc-to-v018.sh use this one.
export ISSUER_DID="${ISSUER_DID:-did:web:mvhd-issuerservice%3A10016:issuer}"

log "2/6 control-plane contexts"
CP="$CP" TOKEN="$PROV_TOKEN" MGMT_V_CANDIDATES="$MGMT_V" bash scripts/azure/05-cp-participants.sh || fail "step 2"

log "3/6 IdentityHub records"
bash scripts/seed-identityhub-participants.sh || fail "step 3"

log "4/6 the control plane's copy of each STS client secret"
bash scripts/repair-cp-sts-secrets.sh || fail "step 4"

log "5/6 holders on the IssuerService"
bash scripts/seed-issuer-holders.sh || fail "step 5"

log "6/6 a MembershipCredential for each"
bash scripts/request-participant-credentials.sh || fail "step 6: the stores are consistent, but no credential was issued"

log "the five now:"
inventory | while read -r store id did slug; do
  [ -n "$store" ] && printf '  %-3s %-34s %s\n' "$store" "$id" "$did"
done
log "OK: the five demo participants carry ${DID_HOST} DIDs and hold a credential"
