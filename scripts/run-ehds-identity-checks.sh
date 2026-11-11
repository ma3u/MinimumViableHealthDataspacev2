#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# DCP v1.0 domain checks — Health Dataspace v2
# ---------------------------------------------------------------------------
# NOT a conformance suite. This is 16 of our own checks driving the IdentityHub
# Identity API and the IssuerService admin API with curl; it never acts as a
# DCP protocol peer, and no part of it comes from
# https://github.com/eclipse-dataspacetck/dcp-tck. Real conformance needs
# eclipsedataspacetck/dcp-tck-runtime; see discussion #110.
#
# Covers, against those admin APIs:
#   - DID:web Document Resolution
#   - Self-Issued Identity Token validation
#   - Credential Presentation exchange
#   - Credential Issuance protocol
#
# Usage:
#   ./scripts/run-ehds-identity-checks.sh
#   REPORT_DIR=./reports ./scripts/run-ehds-identity-checks.sh
#
# Prerequisites:
#   - Docker Compose JAD stack running
#   - curl, jq, openssl installed
# ---------------------------------------------------------------------------
set -euo pipefail

# EDC Management API version segment — v5beta since the EDC 0.18 JAD
# launchers (issue #97 Phase B); override for older stacks.
MGMT_V="${EDC_MGMT_API_VERSION:-v5}"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
IDENTITY_API="${EDC_IDENTITY_URL:-http://localhost:11005/api/identity}"
ISSUER_API="${EDC_ISSUER_URL:-http://localhost:10013/api/admin}"
MGMT_API="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
# The IdentityHub database the trust checks read: identityhub_v1 on EDC 1.0 (#881).
IH_DB="${IH_DB:-identityhub_v1}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
CLIENT_ID="${EDC_CLIENT_ID:-admin}"
CLIENT_SECRET="${EDC_CLIENT_SECRET:-edc-v-admin-secret}"
REPORT_DIR="${REPORT_DIR:-test-results/dcp}"

# Participant slugs (resolved to UUID context IDs at runtime)
PARTICIPANT_SLUGS=("alpha-klinik" "pharmaco" "medreg")
PARTICIPANT_CTXS=()  # populated by discover_participants()

# The participant-list fetch and its diagnosis are shared with the other two
# compliance suites: all three used to die on the same silent `curl -sf`
# (issue #307).
# shellcheck source=scripts/lib/edc-mgmt-api.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/edc-mgmt-api.sh"

# Counters
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0
rate=""

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/dcp-compliance-$(date +%Y%m%dT%H%M%S).json"
TEST_RESULTS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[DCP]${NC} $*"; }
pass() { echo -e "  ${GREEN}✓${NC} $*"; PASSED=$((PASSED + 1)); TOTAL=$((TOTAL + 1)); }
fail() { echo -e "  ${RED}✗${NC} $*"; FAILED=$((FAILED + 1)); TOTAL=$((TOTAL + 1)); }
# A skip is a third outcome, not a pass (ADR-031). It used to increment TOTAL
# as well, so every skip raised the reported pass rate: a suite that could
# reach nothing at all scored 100%. TOTAL now counts only checks that reached
# a verdict, and skips are reported alongside it.
skip() { echo -e "  ${YELLOW}⊘${NC} $*"; SKIPPED=$((SKIPPED + 1)); }

record_result() {
  local test_id="$1" category="$2" status="$3" detail="${4:-}"
  TEST_RESULTS+=("{\"id\":\"$test_id\",\"category\":\"$category\",\"status\":\"$status\",\"detail\":\"$detail\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}")
}

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
get_token() {
  local token_url
  if curl -sf "${KEYCLOAK_URL}/realms/${REALM}" >/dev/null 2>&1; then
    token_url="${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token"
  else
    token_url="http://localhost:8080/realms/${REALM}/protocol/openid-connect/token"
  fi
  local resp
  resp=$(curl -sf -X POST "$token_url" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" 2>/dev/null) || { echo ""; return 1; }
  echo "$resp" | jq -r '.access_token // empty'
}

TOKEN=""
auth_header() {
  if [ -z "$TOKEN" ]; then TOKEN=$(get_token) || true; fi
  if [ -n "$TOKEN" ]; then echo "Authorization: Bearer $TOKEN"; else echo "X-No-Auth: true"; fi
}

# Every one of these returns the body and lets the caller decide. An EDC
# error envelope is a body, so `[ -n "$resp" ]` used to accept it as a pass —
# the same defect found in the DSP suite (#180). edc_reject_errors, from
# scripts/lib/edc-mgmt-api.sh, turns one into a non-zero return so the
# caller's `|| resp=""` fails the assertion instead.
identity_get() {
  local b; b=$(curl -sf -H "$(auth_header)" -H "Content-Type: application/json" "${IDENTITY_API}$1" 2>/dev/null) || return 1
  edc_reject_errors "$b" "GET identity $1"
}
identity_post() {
  local b; b=$(curl -sf -X POST -H "$(auth_header)" -H "Content-Type: application/json" -d "$2" "${IDENTITY_API}$1" 2>/dev/null) || return 1
  edc_reject_errors "$b" "POST identity $1"
}
issuer_get() {
  local b; b=$(curl -s --max-time 10 -H "$(auth_header)" -H "Content-Type: application/json" "${ISSUER_API}$1" 2>/dev/null) || return 1
  edc_reject_errors "$b" "GET issuer $1"
}
issuer_post() {
  local b; b=$(curl -s --max-time 10 -X POST -H "$(auth_header)" -H "Content-Type: application/json" -d "$2" "${ISSUER_API}$1" 2>/dev/null) || return 1
  edc_reject_errors "$b" "POST issuer $1"
}
mgmt_post() {
  local b; b=$(curl -sf -X POST -H "$(auth_header)" -H "Content-Type: application/json" -d "$2" "${MGMT_API}$1" 2>/dev/null) || return 1
  edc_reject_errors "$b" "POST mgmt $1"
}


# ---------------------------------------------------------------------------
# Dynamic participant context discovery
# ---------------------------------------------------------------------------
discover_participants() {
  log "Discovering participant context UUIDs..."
  local participants_json
  mgmt_fetch_participants || exit 1
  participants_json="$MGMT_PARTICIPANTS_JSON"

  for slug in "${PARTICIPANT_SLUGS[@]}"; do
    local uuid
    uuid=$(echo "$participants_json" | jq -r --arg s "$slug" \
      '[.[] | select(.identity // "" | contains($s))] | .[0]["@id"] // empty')
    if [ -n "$uuid" ]; then
      PARTICIPANT_CTXS+=("$uuid")
      log "  ${slug} -> ${uuid}"
    else
      log "  WARNING: No context found for ${slug}"
      PARTICIPANT_CTXS+=("")
    fi
  done

  PROVIDER_CTX="${PARTICIPANT_CTXS[0]:-}"   # alpha-klinik
  CONSUMER_CTX="${PARTICIPANT_CTXS[1]:-}"   # pharmaco
  OPERATOR_CTX="${PARTICIPANT_CTXS[2]:-}"   # medreg

  if [ -z "$PROVIDER_CTX" ] || [ -z "$CONSUMER_CTX" ] || [ -z "$OPERATOR_CTX" ]; then
    log "ERROR: Missing required participant contexts."
    log "  PROVIDER  (alpha-klinik): ${PROVIDER_CTX:-NOT FOUND}"
    log "  CONSUMER  (pharmaco):     ${CONSUMER_CTX:-NOT FOUND}"
    log "  OPERATOR  (medreg):       ${OPERATOR_CTX:-NOT FOUND}"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Category 1: DID Resolution Tests (DCP §3)
# ---------------------------------------------------------------------------
run_did_tests() {
  log "Category 1: DID Resolution Tests (DCP §3)"

  # 1.1 — Participant list includes DIDs
  for i in "${!PARTICIPANT_SLUGS[@]}"; do
    local slug="${PARTICIPANT_SLUGS[$i]}"
    local ctx="${PARTICIPANT_CTXS[$i]}"
    local test_id="DID-1.1-${slug}"
    local resp
    resp=$(mgmt_post "/${MGMT_V}/participants/${ctx}/did" \
      '{"@context":["https://w3id.org/edc/connector/management/v2"]}') || resp=""

    # Try participant query instead if direct DID endpoint doesn't exist
    if [ -z "$resp" ]; then
      resp=$(identity_get "/v1/participants/${ctx}/keypairs") || resp=""
    fi

    # Responding is not the property under test. DCP 3 requires a resolvable
    # did:web for the participant, so assert that and nothing weaker.
    local did=""
    if [ -n "$resp" ]; then
      did=$(printf '%s' "$resp" | jq -r 'if type=="array" then (.[0].did // .[0].participantDid // empty) else (.did // .participantDid // empty) end' 2>/dev/null) || did=""
    fi
    if [ -z "$did" ]; then
      local part_resp
      part_resp=$(identity_get "/v1/participants") || part_resp=""
      if [ -n "$part_resp" ]; then
        did=$(printf '%s' "$part_resp" | jq -r --arg c "$ctx" \
          '[.[] | select((.participantContextId // .participantId // .["@id"]) == $c)] | .[0].did // empty' 2>/dev/null) || did=""
      fi
    fi

    if [ -z "$resp" ]; then
      skip "$test_id: IdentityHub not reachable for ${slug}"
      record_result "$test_id" "did" "skipped" "identity api unreachable"
    elif [[ "$did" == did:web:* ]]; then
      pass "$test_id: ${slug} resolves to ${did}"
      record_result "$test_id" "did" "passed" "$did"
    elif [ -n "$did" ]; then
      fail "$test_id: ${slug} has DID '${did}', which is not a did:web"
      record_result "$test_id" "did" "failed" "non-did:web: $did"
    else
      fail "$test_id: IdentityHub answered for ${slug} but exposes no DID"
      record_result "$test_id" "did" "failed" "no did field"
    fi
  done

  # 1.2 — IdentityHub participant query returns all 4 contexts
  local test_id="DID-1.2"
  local resp
  resp=$(identity_get "/v1/participants") || resp=""

  if [ -n "$resp" ] && echo "$resp" | jq -e 'type == "array"' >/dev/null 2>&1; then
    local count
    count=$(echo "$resp" | jq 'length')
    if [ "$count" -ge 4 ]; then
      pass "$test_id: IdentityHub has ${count} participants (≥4 expected)"
      record_result "$test_id" "did" "passed" "${count} participants"
    else
      skip "$test_id: IdentityHub has ${count} participants (expected ≥4)"
      record_result "$test_id" "did" "skipped" "${count} participants"
    fi
  elif [ -n "$resp" ]; then
    pass "$test_id: IdentityHub participants endpoint responded"
    record_result "$test_id" "did" "passed"
  else
    fail "$test_id: IdentityHub participants not accessible"
    record_result "$test_id" "did" "failed"
  fi

  # 1.3 — Each participant has a DID document with did:web scheme
  local test_id="DID-1.3"
  if [ -n "$resp" ]; then
    local dids
    dids=$(echo "$resp" | jq -r '.[].did // empty' 2>/dev/null) || dids=""

    if [ -n "$dids" ]; then
      local did_web_count=0
      while IFS= read -r did; do
        if [[ "$did" == did:web:* ]]; then
          did_web_count=$((did_web_count + 1))
        fi
      done <<< "$dids"

      if [ "$did_web_count" -ge 4 ]; then
        pass "$test_id: ${did_web_count} participants use did:web scheme"
        record_result "$test_id" "did" "passed" "${did_web_count} did:web"
      elif [ "$did_web_count" -gt 0 ]; then
        pass "$test_id: ${did_web_count} participants use did:web scheme"
        record_result "$test_id" "did" "passed" "${did_web_count} did:web"
      else
        fail "$test_id: No participants use did:web scheme"
        record_result "$test_id" "did" "failed"
      fi
    else
      skip "$test_id: No DID fields found in participant records"
      record_result "$test_id" "did" "skipped"
    fi
  else
    skip "$test_id: Cannot check DID schemes (no participant data)"
    record_result "$test_id" "did" "skipped"
  fi
}

# ---------------------------------------------------------------------------
# Category 2: Key Pair Management Tests (DCP §4)
# ---------------------------------------------------------------------------
run_keypair_tests() {
  log "Category 2: Key Pair Management Tests (DCP §4)"

  # 2.1 — List key pairs for each participant
  for i in "${!PARTICIPANT_SLUGS[@]}"; do
    local slug="${PARTICIPANT_SLUGS[$i]}"
    local ctx="${PARTICIPANT_CTXS[$i]}"
    local test_id="KEY-2.1-${slug}"
    local resp
    resp=$(identity_get "/v1/participants/${ctx}/keypairs") || resp=""

    if [ -n "$resp" ] && echo "$resp" | jq -e 'type == "array"' >/dev/null 2>&1; then
      local count
      count=$(echo "$resp" | jq 'length')
      pass "$test_id: ${count} key pairs for ${slug}"
      record_result "$test_id" "keypair" "passed" "${count} keypairs"
    elif [ -n "$resp" ]; then
      pass "$test_id: KeyPair endpoint responded for ${slug}"
      record_result "$test_id" "keypair" "passed"
    else
      fail "$test_id: KeyPair query failed for ${slug}"
      record_result "$test_id" "keypair" "failed"
    fi
  done

  # 2.2 — Key pair state is ACTIVATED
  local test_id="KEY-2.2"
  local resp
  resp=$(identity_get "/v1/participants/${PROVIDER_CTX}/keypairs") || resp=""

  # IdentityHub serialises KeyPairState as its ordinal, not its name:
  # 100 CREATED, 200 ACTIVATED, 300 ROTATED, 400 REVOKED. Comparing against
  # the string "ACTIVATED" never matches, which is why this check used to
  # fall through to a skip on a perfectly healthy stack. Accept both, because
  # the wire format has changed before.
  local activated='[.[] | select(.state == 200 or .state == "ACTIVATED")]'
  if [ -n "$resp" ] && echo "$resp" | jq -e "${activated} | length > 0" >/dev/null 2>&1; then
    local active_count
    active_count=$(echo "$resp" | jq "${activated} | length")
    pass "$test_id: ${active_count} ACTIVATED key pairs (provider: alpha-klinik)"
    record_result "$test_id" "keypair" "passed" "${active_count} active"
  elif [ -n "$resp" ] && echo "$resp" | jq -e 'length > 0' >/dev/null 2>&1; then
    # Key pairs that exist but are not ACTIVATED cannot sign anything. That is
    # a failure of the property, not a reason to skip it.
    local states
    states=$(echo "$resp" | jq -r '[.[].state | tostring] | unique | join(", ")')
    fail "$test_id: key pairs exist but none is ACTIVATED (states: ${states})"
    record_result "$test_id" "keypair" "failed" "states: ${states}"
  elif [ -n "$resp" ]; then
    fail "$test_id: provider has no key pairs, so it cannot sign a presentation"
    record_result "$test_id" "keypair" "failed" "no key pairs"
  else
    skip "$test_id: IdentityHub not reachable"
    record_result "$test_id" "keypair" "skipped" "identity api unreachable"
  fi

  # 2.3 — Key pairs use Ed25519 or EC algorithm
  local test_id="KEY-2.3"
  if [ -n "$resp" ] && echo "$resp" | jq -e 'length > 0' >/dev/null 2>&1; then
    # There is no `algorithm` field on a key pair. The record carries
    # `serializedPublicKey`, a JWK, and the algorithm lives in its `kty` and
    # `crv`. The previous version asked for a field that has never existed and
    # then passed itself on "algorithm field not exposed", which is how a
    # missing assertion disguises itself as a lenient one.
    local algo
    algo=$(echo "$resp" | jq -r '
      .[0].serializedPublicKey
      | (if type == "string" then (fromjson? // {}) else (. // {}) end)
      | (.crv // .kty // "unknown")' 2>/dev/null) || algo="unknown"

    case "$algo" in
      Ed25519 | Ed448 | OKP | EC | P-256 | P-384 | P-521 | secp256k1 | secp256r1 | secp384r1)
        pass "$test_id: Key algorithm: ${algo}"
        record_result "$test_id" "keypair" "passed" "algorithm: ${algo}"
        ;;
      unknown | null | "")
        fail "$test_id: serializedPublicKey carries no kty/crv, so the algorithm cannot be read"
        record_result "$test_id" "keypair" "failed" "algorithm unreadable"
        ;;
      *)
        fail "$test_id: key algorithm is '${algo}', expected Ed25519 or an EC curve"
        record_result "$test_id" "keypair" "failed" "algorithm: ${algo}"
        ;;
    esac
  else
    skip "$test_id: IdentityHub not reachable"
    record_result "$test_id" "keypair" "skipped" "identity api unreachable"
  fi
  # 2.4 — The key MATERIAL exists, not just the key record. #345
  #
  # KEY-2.2 reads keypair_resource in Postgres and reported ACTIVATED for two
  # days on a stack where Vault, then in-memory, had lost every private key on
  # a restart; nothing could sign, and this suite scored 21/0. IdentityHub
  # stores a participant's private key in Vault at
  #   participants/<ctx>/identityhub/<url-encoded privateKeyAlias>
  # next to <ctx>-sts-client-secret. This asks Vault whether that entry exists
  # (exit code only, never the value). Vault is reachable only through its
  # container, so where Docker or the container is absent this skips and says
  # so; it must not pass by default.
  local test_id="KEY-2.4"
  local vault_c="${VAULT_CONTAINER:-health-dataspace-vault}"
  if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$vault_c"; then
    skip "$test_id: Vault container ${vault_c} not reachable from here, key material not checked"
    record_result "$test_id" "keypair" "skipped" "vault container not reachable"
  elif [ -z "$resp" ] || ! echo "$resp" | jq -e 'length > 0' >/dev/null 2>&1; then
    skip "$test_id: no key pairs to check material for"
    record_result "$test_id" "keypair" "skipped" "no key pairs"
  else
    local alias enc missing=0 checked=0
    while IFS= read -r alias; do
      [ -n "$alias" ] || continue
      # EDC percent-encodes the alias once more for the vault path: ':' -> %3A,
      # an existing '%' -> %25, '#' -> %23, '@' -> %40 (observed:
      # did%3Aweb%3Aidentityhub%253A7083%3Almc%23key1, and on 1.0 the seeds'
      # ...%23key1%40<context id>, #881 finding 18).
      enc=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$alias")
      checked=$((checked + 1))
      # Where IdentityHub put it depends on the participant's Vault config:
      # CFM-created participants carry edc.vault.hashicorp.config with a
      # per-participant folder (participants/<ctx>/identityhub/...); one
      # created through the Identity API without it lands under the hub's
      # global vault, i.e. secret/<alias>. Either location is the property.
      local found=0 path
      for path in "participants/${PROVIDER_CTX}/identityhub/${enc}" "secret/${enc}"; do
        if docker exec -e VAULT_ADDR=http://127.0.0.1:8200 -e VAULT_TOKEN="${VAULT_TOKEN:-root}" "$vault_c" \
             vault kv get -field=content "$path" >/dev/null 2>&1; then found=1; break; fi
      done
      if [ "$found" -ne 1 ]; then
        echo "    no material in Vault for alias ${alias} (looked in participants/${PROVIDER_CTX}/identityhub/ and secret/)" >&2
        missing=$((missing + 1))
      fi
    done < <(echo "$resp" | jq -r '.[] | select(.state == 200 or .state == "ACTIVATED") | .privateKeyAlias // empty')
    if [ "$checked" -eq 0 ]; then
      fail "$test_id: provider has no ACTIVATED key pair whose alias could be checked"
      record_result "$test_id" "keypair" "failed" "no activated alias"
    elif [ "$missing" -gt 0 ]; then
      fail "$test_id: ${missing} of ${checked} activated key pair(s) have no private key material in Vault, the participant cannot sign"
      record_result "$test_id" "keypair" "failed" "${missing}/${checked} aliases without material"
    else
      pass "$test_id: private key material present in Vault for ${checked} activated key pair(s)"
      record_result "$test_id" "keypair" "passed" "${checked} aliases"
    fi
  fi
}
# ---------------------------------------------------------------------------
# Category 3: Verifiable Credential Tests (DCP §5)
# ---------------------------------------------------------------------------
run_credential_tests() {
  log "Category 3: Verifiable Credential Tests (DCP §5)"

  # 3.1 — List credentials for each participant
  for i in "${!PARTICIPANT_SLUGS[@]}"; do
    local slug="${PARTICIPANT_SLUGS[$i]}"
    local ctx="${PARTICIPANT_CTXS[$i]}"
    local test_id="VC-3.1-${slug}"
    local resp
    resp=$(identity_get "/v1/participants/${ctx}/credentials") || resp=""

    if [ -n "$resp" ] && echo "$resp" | jq -e 'type == "array"' >/dev/null 2>&1; then
      local count
      count=$(echo "$resp" | jq 'length')
      pass "$test_id: ${count} credentials for ${slug}"
      record_result "$test_id" "credential" "passed" "${count} VCs"
    elif [ -n "$resp" ]; then
      pass "$test_id: Credential endpoint responded for ${slug}"
      record_result "$test_id" "credential" "passed"
    else
      fail "$test_id: Credential query failed for ${slug}"
      record_result "$test_id" "credential" "failed"
    fi
  done

  # 3.2 — Credentials include EHDS-specific types
  local test_id="VC-3.2"
  local resp
  resp=$(identity_get "/v1/participants/${PROVIDER_CTX}/credentials") || resp=""

  if [ -n "$resp" ] && echo "$resp" | jq -e 'length > 0' >/dev/null 2>&1; then
    local types
    types=$(echo "$resp" | jq -r '[.[] | .verifiableCredential.credential.type // empty] | flatten | unique | join(", ")' 2>/dev/null) || types=""

    # This check exists to assert an EHDS-relevant credential type. Any other
    # type is a real answer and a real failure; no extractable type at all
    # means the assertion could not be made, which is also not a pass.
    if echo "$types" | grep -qi "EHDS\|Membership\|Participant"; then
      pass "$test_id: EHDS credential types found: ${types}"
      record_result "$test_id" "credential" "passed" "types: ${types}"
    elif [ -n "$types" ]; then
      fail "$test_id: no EHDS/Membership/Participant type among: ${types}"
      record_result "$test_id" "credential" "failed" "types: ${types}"
    else
      fail "$test_id: credentials present but no type could be extracted"
      record_result "$test_id" "credential" "failed" "no type field"
    fi
  elif [ -n "$resp" ]; then
    fail "$test_id: provider holds no credentials"
    record_result "$test_id" "credential" "failed" "empty credential list"
  else
    skip "$test_id: IdentityHub not reachable"
    record_result "$test_id" "credential" "skipped" "identity api unreachable"
  fi

  # 3.3 — Credential has valid issuance timestamp
  local test_id="VC-3.3"
  if [ -n "$resp" ] && echo "$resp" | jq -e '.[0].issuanceTimestamp // .[0].verifiableCredential.credential.issuanceDate' >/dev/null 2>&1; then
    pass "$test_id: Credential has issuance timestamp"
    record_result "$test_id" "credential" "passed"
  elif [ -n "$resp" ] && echo "$resp" | jq -e 'length > 0' >/dev/null 2>&1; then
    fail "$test_id: credentials present but none carries an issuance timestamp"
    record_result "$test_id" "credential" "failed" "no issuance timestamp"
  elif [ -n "$resp" ]; then
    fail "$test_id: provider holds no credentials"
    record_result "$test_id" "credential" "failed" "empty credential list"
  else
    skip "$test_id: IdentityHub not reachable"
    record_result "$test_id" "credential" "skipped" "identity api unreachable"
  fi
}

# ---------------------------------------------------------------------------
# Category 4: Issuer Service Tests (DCP §6)
# ---------------------------------------------------------------------------
run_issuer_tests() {
  log "Category 4: Issuer Service Tests (DCP §6)"

  # 4.1 — Issuer service health check
  local test_id="ISS-4.1"
  local http_code
  # Default API port 10010 is not exposed on ACA; probe via admin API under
  # DEMO_MODE=azure, otherwise docker-exec the internal port for local runs.
  if [ "${DEMO_MODE:-local}" = "azure" ]; then
    http_code="000"
  else
    http_code=$(docker exec health-dataspace-issuerservice \
      curl -s -o /dev/null -w "%{http_code}" \
      "http://localhost:10010/api/check/readiness" 2>/dev/null) || http_code="000"
  fi

  if [ "$http_code" = "200" ]; then
    pass "$test_id: IssuerService readiness check passed"
    record_result "$test_id" "issuer" "passed"
  else
    # Try admin API (port 10013 is exposed)
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
      "${ISSUER_API}/credentials" 2>/dev/null)
    if [ "$http_code" = "200" ] || [ "$http_code" = "401" ]; then
      pass "$test_id: IssuerService is running (HTTP ${http_code})"
      record_result "$test_id" "issuer" "passed"
    else
      fail "$test_id: IssuerService not reachable (HTTP ${http_code})"
      record_result "$test_id" "issuer" "failed" "HTTP ${http_code}"
    fi
  fi

  # 4.2 — Credential definitions exist
  local test_id="ISS-4.2"
  local resp
  # Issuer uses multi-tenant API: /v1/participants/{ctxId}/credentialdefinitions/query
  resp=$(issuer_post "/v1/participants/issuer/credentialdefinitions/query" \
    '{"@context":["https://w3id.org/edc/connector/management/v2"],"@type":"QuerySpec"}') || resp=""

  # ISS-4.2 check: response may be either an error object or a valid array
  if [ -n "$resp" ] && echo "$resp" | jq -e 'type == "array"' >/dev/null 2>&1; then
    local count
    count=$(echo "$resp" | jq 'length')
    pass "$test_id: ${count} credential definitions on IssuerService"
    record_result "$test_id" "issuer" "passed" "${count} definitions"
  elif [ -n "$resp" ]; then
    pass "$test_id: Credential definitions endpoint responded"
    record_result "$test_id" "issuer" "passed"
  else
    fail "$test_id: Credential definitions not accessible"
    record_result "$test_id" "issuer" "failed"
  fi

  # 4.3 — EHDS credential definitions include expected types
  local test_id="ISS-4.3"
  if [ -n "$resp" ] && echo "$resp" | jq -e 'length > 0' >/dev/null 2>&1; then
    local types
    types=$(echo "$resp" | jq -r '[.[].credentialType // .[]["@id"]] | unique | join(", ")' 2>/dev/null) || types=""

    if echo "$types" | grep -qi "EHDS\|Membership\|Participant"; then
      pass "$test_id: Credential types: ${types}"
      record_result "$test_id" "issuer" "passed" "types: ${types}"
    elif [ -n "$types" ]; then
      fail "$test_id: issuer defines no EHDS credential type, only: ${types}"
      record_result "$test_id" "issuer" "failed" "types: ${types}"
    else
      fail "$test_id: definitions present but no credential type could be read"
      record_result "$test_id" "issuer" "failed" "no type field"
    fi
  elif [ -n "$resp" ]; then
    fail "$test_id: issuer has no credential definitions"
    record_result "$test_id" "issuer" "failed" "empty definition list"
  else
    skip "$test_id: IssuerService not reachable"
    record_result "$test_id" "issuer" "skipped" "issuer api unreachable"
  fi

  # 4.4 — RETIRED 2026-09-26.
  #
  # This asserted that a credential definition carries an issuer DID. The
  # IssuerService credential-definition schema has no such field and never
  # has: the record holds additionalContext, attestations, createdAt,
  # credentialType, format, id, jsonSchema, jsonSchemaUrl, mappings,
  # participantContextId, rules and validity. The check therefore asked the
  # wrong resource, and the only reason it looked healthy for so long is that
  # every one of its branches was a pass.
  #
  # ADR-031: an assertion that turns out to be untestable is retired with the
  # reason rather than carried as a permanent pass. Coverage is not lost -
  # SCOPE-5.3 already asserts the trusted issuer configured on the control
  # plane is a did:web. Reinstate this against the IssuerService DID document
  # (web.http.did.port=10016) if that port is ever published; today it is
  # reachable only from inside the Docker network, so neither this suite on
  # the host nor the CI job could call it.
}

# ---------------------------------------------------------------------------
# Category 5: DCP Scope Configuration Tests
# ---------------------------------------------------------------------------
run_scope_tests() {
  log "Category 5: DCP Scope Configuration Tests"

  # These three read the control plane's container environment, so they can
  # only run where that container is visible. On Azure it never is, and they
  # used to skip silently and still count toward the total. Establish
  # reachability once, then assert properly or skip loudly with the reason.
  local cp_env=""
  local cp_reachable=0
  if command -v docker >/dev/null 2>&1 &&
    cp_env=$(docker inspect health-dataspace-controlplane 2>/dev/null | jq -r '.[0].Config.Env[]' 2>/dev/null) &&
    [ -n "$cp_env" ]; then
    cp_reachable=1
  fi

  # 5.1 — DCP scopes are configured on the control plane
  local test_id="SCOPE-5.1"
  local scopes=""
  if [ "$cp_reachable" -eq 1 ]; then
    scopes=$(printf '%s\n' "$cp_env" | grep '^edc\.iam\.dcp\.scopes' || true)
    if [ -n "$scopes" ]; then
      local scope_count
      scope_count=$(printf '%s\n' "$scopes" | wc -l | tr -d ' ')
      pass "$test_id: ${scope_count} DCP scopes configured on control plane"
      record_result "$test_id" "scope" "passed" "${scope_count} scopes"
    else
      fail "$test_id: control plane defines no edc.iam.dcp.scopes"
      record_result "$test_id" "scope" "failed" "no dcp scopes"
    fi
  else
    skip "$test_id: control plane container not inspectable (not a local stack)"
    record_result "$test_id" "scope" "skipped" "container not inspectable"
  fi

  # 5.2 — EHDS participant scope present
  local test_id="SCOPE-5.2"
  if [ "$cp_reachable" -ne 1 ]; then
    skip "$test_id: control plane container not inspectable (not a local stack)"
    record_result "$test_id" "scope" "skipped" "container not inspectable"
  elif printf '%s\n' "$scopes" | grep -qi "EHDSParticipant"; then
    pass "$test_id: EHDSParticipantCredential scope configured"
    record_result "$test_id" "scope" "passed"
  else
    fail "$test_id: EHDSParticipant scope missing from the configured scopes"
    record_result "$test_id" "scope" "failed" "scope absent"
  fi

  # 5.3 — Trusted issuer configured
  local test_id="SCOPE-5.3"
  if [ "$cp_reachable" -ne 1 ]; then
    skip "$test_id: control plane container not inspectable (not a local stack)"
    record_result "$test_id" "scope" "skipped" "container not inspectable"
  else
    local trusted_issuer
    trusted_issuer=$(printf '%s\n' "$cp_env" | grep -E '^edc\.iam\.trusted-?issuer' || true)
    if [ -n "$trusted_issuer" ]; then
      pass "$test_id: Trusted issuer configured: $(printf '%s\n' "$trusted_issuer" | head -1)"
      record_result "$test_id" "scope" "passed"
    else
      fail "$test_id: control plane defines no edc.iam.trustedissuer"
      record_result "$test_id" "scope" "failed" "no trusted issuer"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Category 6: Trusted issuers per credential type (#710, ADR-064)
# ---------------------------------------------------------------------------
# The control plane trusts each issuer for the credential types it may issue,
# and a fictional Simpl Governance Authority for MembershipCredential. These
# run only where the containers can be inspected (compose and CI); they need
# scripts/seed-simpl-ga.sh and scripts/seed-second-data-space.sh to have run. A credential whose type its issuer is
# not listed for fails the whole presentation, so the refusal shows as a DSP
# request answered 401, with the reason in the control plane's log.
TRUST_PROVIDER_SLUG="alpha-klinik"
TRUST_HOLDER_SLUG="irs"
TRUST_GA_DID="did:web:simpl-ga-issuer%3A10016:simpl-ga"
# #934 step 2: a second data space, whose authority admits AlphaKasse DE
# (scripts/seed-second-data-space.sh).
TRUST_WELLBEING_SLUG="alphakasse"
TRUST_WELLBEING_GA_DID="did:web:wellbeing-ga-issuer%3A10016:wellbeing-ga"
TRUST_ROGUE_DID="did:web:rogue-issuer%3A10016:rogue"

# The participant context id of a slug, from the control plane.
trust_ctx() {
  printf '%s' "$MGMT_PARTICIPANTS_JSON" | jq -r --arg s "$1" \
    '[.[] | select((.identity // "") | endswith(":" + $s))] | .[0]["@id"] // empty'
}

# A DSP catalogue request from the holder to the provider. Prints the HTTP
# status and the response's @type.
trust_catalog() {
  local consumer_ctx="$1" provider_ctx="$2" provider_did="$3" body tmp code
  body=$(printf '{"@context":["https://w3id.org/edc/connector/management/v2"],"@type":"CatalogRequest","counterPartyAddress":"%s/%s/%s","counterPartyId":"%s","protocol":"%s"}' \
    "${DSP_INTERNAL_URL:-http://controlplane:8082/api/dsp}" "$provider_ctx" "${DSP_PROTOCOL:-http-dsp-profile-2025-1}" "$provider_did" "${DSP_PROTOCOL:-http-dsp-profile-2025-1}")
  tmp=$(mktemp)
  code=$(curl -s --max-time 60 -o "$tmp" -w '%{http_code}' -X POST \
    -H "$(auth_header)" -H "Content-Type: application/json" -d "$body" \
    "${MGMT_API}/${MGMT_V}/participants/${consumer_ctx}/catalog/request" 2>/dev/null) || code="000"
  printf '%s %s' "$code" "$(jq -r 'if type=="object" then (."@type" // "none") else "error" end' "$tmp" 2>/dev/null || echo unreadable)"
  rm -f "$tmp"
}

# The issuers of the holder's ISSUED (500) MembershipCredentials, one per line.
trust_membership_issuers() {
  docker exec health-dataspace-postgres psql -U ih -d "$IH_DB" -At -c \
    "select issuer_id from credential_resource where participant_context_id='$1' and vc_state=500 and verifiable_credential::text like '%MembershipCredential%'" 2>/dev/null
}

run_trust_tests() {
  log "Category 6: Trusted issuers per credential type (#710, ADR-064)"
  local cp_env repo_dir test_id
  repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if ! cp_env=$(docker inspect health-dataspace-controlplane 2>/dev/null | jq -r '.[0].Config.Env[]' 2>/dev/null) || [ -z "$cp_env" ]; then
    for test_id in TRUST-6.1 TRUST-6.2 TRUST-6.3 TRUST-6.4 TRUST-6.5 TRUST-6.6 TRUST-6.7 TRUST-6.8 TRUST-6.9; do
      skip "$test_id: control plane container not inspectable (not a local stack)"
      record_result "$test_id" "trust" "skipped" "container not inspectable"
    done
    return
  fi

  # 6.1 — The trust list is ui/src/content/trusted-issuers.json, each issuer with its types
  test_id="TRUST-6.1"
  local diff
  diff=$(printf '%s\n' "$cp_env" | python3 -c '
import json, re, sys
want = {i["alias"]: i for i in json.load(open(sys.argv[1]))["issuers"] if "compose" in i["environments"]}
have = {}
for line in sys.stdin:
    m = re.match(r"edc\.iam\.trusted-?issuer\.([^.]+)\.(id|supportedtypes)=(.*)", line.strip())
    if m:
        have.setdefault(m.group(1), {})[m.group(2)] = m.group(3)
problems = []
for alias in sorted(set(want) | set(have)):
    w, h = want.get(alias), have.get(alias)
    if not w:
        problems.append(alias + ": trusted but not in trusted-issuers.json")
        continue
    if not h:
        problems.append(alias + ": in trusted-issuers.json, not trusted")
        continue
    if h.get("id") != w["did"]:
        problems.append(alias + ": id " + str(h.get("id")) + " != " + w["did"])
    types = json.loads(h["supportedtypes"]) if h.get("supportedtypes") else ["*"]
    if sorted(types) != sorted(w["types"]):
        problems.append(alias + ": types " + str(types) + " != " + str(w["types"]))
print("; ".join(problems))
' "${repo_dir}/ui/src/content/trusted-issuers.json" 2>&1)
  if [ -z "$diff" ]; then
    pass "$test_id: the control plane trusts exactly the issuers of ui/src/content/trusted-issuers.json, each for its listed types"
    record_result "$test_id" "trust" "passed"
  else
    fail "$test_id: trust list differs from ui/src/content/trusted-issuers.json: ${diff}"
    record_result "$test_id" "trust" "failed" "trust list differs"
  fi

  local provider_ctx provider_did holder_ctx
  provider_ctx=$(trust_ctx "$TRUST_PROVIDER_SLUG")
  provider_did="did:web:identityhub%3A7083:${TRUST_PROVIDER_SLUG}"
  holder_ctx=$(trust_ctx "$TRUST_HOLDER_SLUG")
  if [ -z "$provider_ctx" ] || [ -z "$holder_ctx" ]; then
    for test_id in TRUST-6.2 TRUST-6.3 TRUST-6.4 TRUST-6.5 TRUST-6.6 TRUST-6.7 TRUST-6.8 TRUST-6.9; do
      fail "$test_id: no participant context for ${TRUST_PROVIDER_SLUG} or ${TRUST_HOLDER_SLUG}"
      record_result "$test_id" "trust" "failed" "participant missing"
    done
    return
  fi

  # 6.2 — The holder's membership comes from the Governance Authority alone
  test_id="TRUST-6.2"
  local issuers
  issuers=$(trust_membership_issuers "$holder_ctx" | sort -u)
  if [ "$issuers" = "$TRUST_GA_DID" ]; then
    pass "$test_id: ${TRUST_HOLDER_SLUG} holds its MembershipCredential from ${TRUST_GA_DID} only"
    record_result "$test_id" "trust" "passed"
  else
    fail "$test_id: ${TRUST_HOLDER_SLUG}'s MembershipCredential issuers are [$(printf '%s' "$issuers" | tr '\n' ' ')], want ${TRUST_GA_DID} alone (run scripts/seed-simpl-ga.sh)"
    record_result "$test_id" "trust" "failed" "membership not from the authority alone"
  fi

  # Preflight: a member whose membership the hub issued must get the catalogue,
  # or a refusal below would say nothing about trust. In CI no participant has
  # a working DSP endpoint yet (dsp-tck floor, CAT-1.1), so there 6.3 to 6.5
  # skip with that reason instead of passing or failing on the wrong cause.
  local res control_ctx
  control_ctx=$(trust_ctx pharmaco)
  res=$(trust_catalog "${control_ctx:-none}" "$provider_ctx" "$provider_did")
  if [ "${res#* }" != "Catalog" ]; then
    for test_id in TRUST-6.3 TRUST-6.4 TRUST-6.5 TRUST-6.6 TRUST-6.7 TRUST-6.8 TRUST-6.9; do
      skip "$test_id: a member with the hub's own membership (pharmaco) is refused too (${res}): the DSP path does not work here, so trust cannot be told apart"
      record_result "$test_id" "trust" "skipped" "DSP path not working"
    done
    return
  fi

  # 6.3 — On that credential, a DSP request to a hub provider is accepted
  test_id="TRUST-6.3"
  local accepted_on_authority=0
  res=$(trust_catalog "$holder_ctx" "$provider_ctx" "$provider_did")
  if [ "${res#* }" = "Catalog" ]; then
    accepted_on_authority=1
    pass "$test_id: ${TRUST_HOLDER_SLUG} gets ${TRUST_PROVIDER_SLUG}'s catalogue on the Governance Authority's credential"
    record_result "$test_id" "trust" "passed"
  else
    fail "$test_id: catalogue request ${TRUST_HOLDER_SLUG} -> ${TRUST_PROVIDER_SLUG} answered ${res}"
    record_result "$test_id" "trust" "failed" "catalogue refused"
  fi

  # 6.4 and 6.5 — A MembershipCredential from an issuer on no list is refused,
  # and without it the holder is accepted again
  trust_rogue_round "$TRUST_HOLDER_SLUG" "$holder_ctx" TRUST-6.4 TRUST-6.5 "$accepted_on_authority"

  # 6.6 to 6.9 — A second data space (#934 step 2). Its Governance Authority
  # admits AlphaKasse DE, which holds no credential from the hub's issuer.
  local ak_ctx
  ak_ctx=$(trust_ctx "$TRUST_WELLBEING_SLUG")
  if [ -z "$ak_ctx" ]; then
    for test_id in TRUST-6.6 TRUST-6.7 TRUST-6.8 TRUST-6.9; do
      fail "$test_id: no participant context for ${TRUST_WELLBEING_SLUG} (run scripts/seed-second-data-space.sh)"
      record_result "$test_id" "trust" "failed" "second data space not seeded"
    done
    return
  fi

  test_id="TRUST-6.6"
  issuers=$(trust_membership_issuers "$ak_ctx" | sort -u)
  if [ "$issuers" = "$TRUST_WELLBEING_GA_DID" ]; then
    pass "$test_id: ${TRUST_WELLBEING_SLUG} holds its MembershipCredential from ${TRUST_WELLBEING_GA_DID} only"
    record_result "$test_id" "trust" "passed"
  else
    fail "$test_id: ${TRUST_WELLBEING_SLUG}'s MembershipCredential issuers are [$(printf '%s' "$issuers" | tr '\n' ' ')], want ${TRUST_WELLBEING_GA_DID} alone (run scripts/seed-second-data-space.sh)"
    record_result "$test_id" "trust" "failed" "membership not from the second authority alone"
  fi

  test_id="TRUST-6.7"
  local ak_accepted=0
  res=$(trust_catalog "$ak_ctx" "$provider_ctx" "$provider_did")
  if [ "${res#* }" = "Catalog" ]; then
    ak_accepted=1
    pass "$test_id: ${TRUST_WELLBEING_SLUG} is admitted: it gets ${TRUST_PROVIDER_SLUG}'s catalogue on the second authority's credential"
    record_result "$test_id" "trust" "passed"
  else
    fail "$test_id: catalogue request ${TRUST_WELLBEING_SLUG} -> ${TRUST_PROVIDER_SLUG} answered ${res} (does the control plane trust ${TRUST_WELLBEING_GA_DID}? TRUST-6.1)"
    record_result "$test_id" "trust" "failed" "second data space participant refused"
  fi

  trust_rogue_round "$TRUST_WELLBEING_SLUG" "$ak_ctx" TRUST-6.8 TRUST-6.9 "$ak_accepted"
}

# Has the rogue issuer (profile trust-check) issue the holder a
# MembershipCredential, checks that the provider then refuses the holder, and
# that it is accepted again once the credential is gone. A credential whose
# issuer is on no list fails the whole presentation. $1 holder slug, $2 its
# context, $3 and $4 the two test ids, $5 1 when the holder was accepted on its
# own credentials a moment ago.
trust_rogue_round() {
  local slug="$1" ctx="$2" refused_id="$3" after_id="$4" accepted_before="$5"
  local repo_dir provider_ctx provider_did since res cp_log cred rogue_ok=1
  repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  provider_ctx=$(trust_ctx "$TRUST_PROVIDER_SLUG")
  provider_did="did:web:identityhub%3A7083:${TRUST_PROVIDER_SLUG}"

  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  PROFILE=trust-check SERVICE=rogue-issuer CTX=rogue DB="${ROGUE_DB:-rogueissuer}" ADMIN_PORT=10033 \
    HOLDERS="did:web:identityhub%3A7083:${slug}" \
    "${repo_dir}/scripts/seed-test-issuer.sh" >/dev/null 2>&1 || rogue_ok=0
  if [ "$rogue_ok" -eq 1 ]; then
    ISSUER_DID="$TRUST_ROGUE_DID" EDC_ISSUER_URL=http://localhost:10033/api/admin ISSUER_CTX=rogue \
      ONLY="$slug" WAIT_SECONDS=60 \
      "${repo_dir}/scripts/request-participant-credentials.sh" >/dev/null 2>&1 || rogue_ok=0
  fi
  if [ "$rogue_ok" -ne 1 ]; then
    fail "$refused_id: could not have ${TRUST_ROGUE_DID} issue a MembershipCredential to ${slug}"
    record_result "$refused_id" "trust" "failed" "rogue issuer setup"
  else
    res=$(trust_catalog "$ctx" "$provider_ctx" "$provider_did")
    # Capture, then match: `docker logs | grep -q` fails under pipefail, as
    # grep closing the pipe on the first match gives docker logs a SIGPIPE.
    cp_log=$(docker logs --since "$since" health-dataspace-controlplane 2>&1 || true)
    if [ "${res#* }" != "Catalog" ] && [[ "$cp_log" == *"not supported for issuer '${TRUST_ROGUE_DID}'"* ]]; then
      pass "$refused_id: a MembershipCredential from ${TRUST_ROGUE_DID} gets ${slug} refused (answered ${res%% *}: issuer not trusted for the type)"
      record_result "$refused_id" "trust" "passed"
    elif [ "${res#* }" != "Catalog" ] && [ "$accepted_before" -eq 1 ]; then
      # EDC 1.0 refuses without logging the reason (#881). The same holder was
      # accepted a moment ago, and the rogue credential is the only change, so
      # the refusal is its; the next test checks that removing it restores access.
      pass "$refused_id: a MembershipCredential from ${TRUST_ROGUE_DID} gets ${slug} refused (answered ${res%% *}); it was accepted without it"
      record_result "$refused_id" "trust" "passed" "refused once the rogue credential was added; not named in the log"
    else
      fail "$refused_id: with a credential from ${TRUST_ROGUE_DID} the request for ${slug} answered ${res}, and the control plane did not name the issuer as untrusted"
      record_result "$refused_id" "trust" "failed" "untrusted issuer not refused"
    fi
  fi

  # Clean up whatever happened above: the holder's rogue credentials and the
  # rogue issuer itself.
  for cred in $(docker exec health-dataspace-postgres psql -U ih -d "$IH_DB" -At -c \
      "select id from credential_resource where participant_context_id='${ctx}' and issuer_id='${TRUST_ROGUE_DID}'" 2>/dev/null); do
    curl -s -o /dev/null --max-time 20 -X DELETE -H "$(auth_header)" \
      "${IDENTITY_API}/v1/participants/${ctx}/credentials/${cred}" 2>/dev/null || true
  done
  docker rm -f health-dataspace-rogue-issuer >/dev/null 2>&1 || true

  res=$(trust_catalog "$ctx" "$provider_ctx" "$provider_did")
  if [ "${res#* }" = "Catalog" ]; then
    pass "$after_id: after removing the untrusted credential, ${slug} is accepted again"
    record_result "$after_id" "trust" "passed"
  else
    fail "$after_id: after the clean-up the request for ${slug} still answered ${res}"
    record_result "$after_id" "trust" "failed" "not accepted after clean-up"
  fi
}

# ---------------------------------------------------------------------------
# Category 7: The bonus programme's purpose, decided by the connector (#934 step 5, ADR-090)
# ---------------------------------------------------------------------------
# AlphaKlinik offers bonus-programme-answer under mvhd-bonus-programme, whose
# ehds:attestedPurpose admits only a consumer whose DataProcessingPurposeCredential
# attests "bonus-payout". AlphaKasse DE holds that credential from the
# insurance and wellbeing authority (scripts/seed-second-data-space.sh). 7.3
# swaps it for one attesting "premium-setting" and puts it back afterwards.
# Like 6.3 to 6.9, these need a working DSP path and skip loudly without one.
PURPOSE_ASSET="bonus-programme-answer"
PURPOSE_GA_ADMIN="${PURPOSE_GA_ADMIN:-http://localhost:10053/api/admin}"

# Negotiates the bonus offer for a consumer context. Prints the final state,
# a space, and the reason the consumer recorded (empty when FINALIZED).
purpose_negotiate() {
  local consumer_ctx="$1" provider_ctx provider_did dsp catalog offer body id state="" detail="" i
  provider_ctx=$(trust_ctx "$TRUST_PROVIDER_SLUG")
  provider_did="did:web:identityhub%3A7083:${TRUST_PROVIDER_SLUG}"
  dsp="${DSP_INTERNAL_URL:-http://controlplane:8082/api/dsp}/${provider_ctx}/${DSP_PROTOCOL:-http-dsp-profile-2025-1}"
  catalog=$(curl -s --max-time 60 -X POST -H "$(auth_header)" -H "Content-Type: application/json" \
    -d "{\"@context\":[\"https://w3id.org/edc/connector/management/v2\"],\"@type\":\"CatalogRequest\",\"counterPartyAddress\":\"${dsp}\",\"counterPartyId\":\"${provider_did}\",\"protocol\":\"${DSP_PROTOCOL:-http-dsp-profile-2025-1}\"}" \
    "${MGMT_API}/${MGMT_V}/participants/${consumer_ctx}/catalog/request" 2>/dev/null) || catalog=""
  # The offer goes back whole, as jad/seed-contract-negotiation.sh sends it.
  offer=$(printf '%s' "$catalog" | python3 -c '
import json, sys
try: d = json.load(sys.stdin)
except Exception: sys.exit(0)
ds = d.get("dataset", []); ds = [ds] if isinstance(ds, dict) else ds
for x in ds:
    if x.get("@id") == sys.argv[2]:
        p = x.get("hasPolicy"); p = p[0] if isinstance(p, list) else p
        p = {k: v for k, v in p.items() if k != "@context" and v != []}
        p.update({"@context": "http://www.w3.org/ns/odrl.jsonld", "@type": "Offer", "assigner": sys.argv[1], "target": sys.argv[2]})
        print(json.dumps(p)); break
' "$provider_did" "$PURPOSE_ASSET" 2>/dev/null)
  if [ -z "$offer" ]; then
    printf 'NO-OFFER %s' "$TRUST_PROVIDER_SLUG's catalogue has no ${PURPOSE_ASSET} (run scripts/seed-second-data-space.sh)"
    return
  fi
  body="{\"@context\":[\"https://w3id.org/edc/connector/management/v2\"],\"@type\":\"ContractRequest\",\"counterPartyAddress\":\"${dsp}\",\"protocol\":\"${DSP_PROTOCOL:-http-dsp-profile-2025-1}\",\"policy\":${offer}}"
  id=$(curl -s --max-time 30 -X POST -H "$(auth_header)" -H "Content-Type: application/json" -d "$body" \
    "${MGMT_API}/${MGMT_V}/participants/${consumer_ctx}/contractnegotiations" 2>/dev/null | jq -r '."@id" // empty' 2>/dev/null)
  [ -n "$id" ] || { printf 'NOT-STARTED the contract request was not accepted'; return; }
  # For a caller that goes on to a transfer (Category 8): this runs in a
  # subshell, so the negotiation's id leaves through a file.
  if [ -n "${PURPOSE_NEGOTIATION_FILE:-}" ]; then printf '%s' "$id" > "$PURPOSE_NEGOTIATION_FILE"; fi
  for i in $(seq 1 30); do
    state=$(curl -s --max-time 15 -H "$(auth_header)" \
      "${MGMT_API}/${MGMT_V}/participants/${consumer_ctx}/contractnegotiations/${id}" 2>/dev/null | jq -r '.state // empty' 2>/dev/null)
    case "$state" in FINALIZED|TERMINATED) break ;; esac
    sleep 2
  done
  detail=$(curl -s --max-time 15 -H "$(auth_header)" \
    "${MGMT_API}/${MGMT_V}/participants/${consumer_ctx}/contractnegotiations/${id}" 2>/dev/null | jq -r '.errorDetail // empty' 2>/dev/null)
  printf '%s %s' "${state:-UNKNOWN}" "$detail"
}

# The ids of a holder's DataProcessingPurposeCredentials, with their purpose.
purpose_credentials() {
  curl -s --max-time 20 -H "$(auth_header)" "${IDENTITY_API}/v1/participants/$1/credentials" 2>/dev/null |
    jq -r '.[]? | select((.verifiableCredential.credential.type // []) | index("DataProcessingPurposeCredential"))
      | "\(.id) \([.verifiableCredential.credential.credentialSubject] | flatten | .[0].purpose // "?")"' 2>/dev/null
}

purpose_drop_all() {
  local cred
  for cred in $(purpose_credentials "$1" | awk '{print $1}'); do
    curl -s -o /dev/null --max-time 20 -X DELETE -H "$(auth_header)" \
      "${IDENTITY_API}/v1/participants/$1/credentials/${cred}" 2>/dev/null || true
  done
}

# Has the authority issue the holder a purpose credential from definition $2.
purpose_issue() {
  local repo_dir
  repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  ISSUER_DID="$TRUST_WELLBEING_GA_DID" EDC_ISSUER_URL="$PURPOSE_GA_ADMIN" ISSUER_CTX=wellbeing-ga ONLY="$1" WAIT_SECONDS=60 \
    CREDENTIAL_TYPE=DataProcessingPurposeCredential CREDENTIAL_DEFINITION_ID="$2" \
    "${repo_dir}/scripts/request-participant-credentials.sh" >/dev/null 2>&1
}

run_purpose_tests() {
  log "Category 7: The bonus programme's purpose, decided by the connector (#934 step 5, ADR-090)"
  local test_id ak_ctx control_ctx provider_ctx provider_did res held ga_post_ok=1
  if ! docker inspect health-dataspace-wellbeing-ga-issuer >/dev/null 2>&1; then
    for test_id in PURPOSE-7.1 PURPOSE-7.2 PURPOSE-7.3 PURPOSE-7.4; do
      skip "$test_id: no insurance and wellbeing authority on this stack (not a local stack, or scripts/seed-second-data-space.sh not run)"
      record_result "$test_id" "purpose" "skipped" "authority not running"
    done
    return
  fi
  ak_ctx=$(trust_ctx "$TRUST_WELLBEING_SLUG")
  control_ctx=$(trust_ctx pharmaco)
  provider_ctx=$(trust_ctx "$TRUST_PROVIDER_SLUG")
  provider_did="did:web:identityhub%3A7083:${TRUST_PROVIDER_SLUG}"
  res=$(trust_catalog "${control_ctx:-none}" "${provider_ctx:-none}" "$provider_did")
  if [ -z "$ak_ctx" ] || [ "${res#* }" != "Catalog" ]; then
    for test_id in PURPOSE-7.1 PURPOSE-7.2 PURPOSE-7.3 PURPOSE-7.4; do
      skip "$test_id: no ${TRUST_WELLBEING_SLUG} context, or the DSP path does not work here (pharmaco's catalogue answered ${res})"
      record_result "$test_id" "purpose" "skipped" "DSP path not working"
    done
    return
  fi

  # 7.1 — The bonus payout purpose is admitted
  test_id="PURPOSE-7.1"
  held=$(purpose_credentials "$ak_ctx" | awk '{print $2}' | sort -u | tr '\n' ' ')
  res=$(purpose_negotiate "$ak_ctx")
  if [ "${res%% *}" = "FINALIZED" ]; then
    pass "$test_id: ${TRUST_WELLBEING_SLUG}, whose purpose credential attests [${held% }], agrees to ${PURPOSE_ASSET} under mvhd-bonus-programme"
    record_result "$test_id" "purpose" "passed"
  else
    fail "$test_id: ${TRUST_WELLBEING_SLUG} (purposes [${held% }]) negotiating ${PURPOSE_ASSET} ended ${res}"
    record_result "$test_id" "purpose" "failed" "bonus payout refused"
  fi

  # 7.2 — A consumer with no purpose credential is refused
  test_id="PURPOSE-7.2"
  res=$(purpose_negotiate "$control_ctx")
  if [ "${res%% *}" = "TERMINATED" ]; then
    pass "$test_id: pharmaco, which holds no purpose credential, is refused (${res:11:110})"
    record_result "$test_id" "purpose" "passed"
  else
    fail "$test_id: pharmaco without a purpose credential ended ${res}"
    record_result "$test_id" "purpose" "failed" "no purpose admitted"
  fi

  # 7.3 — A purpose of premium setting is refused by ehds:attestedPurpose
  test_id="PURPOSE-7.3"
  purpose_drop_all "$ak_ctx"
  for body in \
    '{"attestationType":"purpose","id":"premium-setting-purpose-attestation","configuration":{"purpose":"premium-setting","legalBasis":"none"}}' \
    '{"attestations":["premium-setting-purpose-attestation"],"credentialType":"DataProcessingPurposeCredential","id":"premium-setting-purpose-credential-def","jsonSchema":"{}","jsonSchemaUrl":"https://w3id.org/ehds/schema/data-processing-purpose-credential.json","mappings":[{"input":"purpose","output":"credentialSubject.purpose","required":true},{"input":"legalBasis","output":"credentialSubject.legalBasis","required":true},{"input":"since","output":"credentialSubject.since","required":true}],"rules":[],"format":"VC1_0_JWT","validity":"604800"}'; do
    local what=attestations status
    case "$body" in *credentialType*) what=credentialdefinitions ;; esac
    status=$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' -X POST -H "$(auth_header)" -H "Content-Type: application/json" \
      -d "$body" "${PURPOSE_GA_ADMIN}/v1/participants/wellbeing-ga/${what}" 2>/dev/null) || status=000
    case "$status" in 2??|409) ;; *) ga_post_ok=0 ;; esac
  done
  if [ "$ga_post_ok" -ne 1 ] || ! purpose_issue "$TRUST_WELLBEING_SLUG" premium-setting-purpose-credential-def; then
    fail "$test_id: could not have the authority attest premium-setting to ${TRUST_WELLBEING_SLUG}"
    record_result "$test_id" "purpose" "failed" "premium setting credential setup"
  else
    held=$(purpose_credentials "$ak_ctx" | awk '{print $2}' | sort -u | tr '\n' ' ')
    res=$(purpose_negotiate "$ak_ctx")
    if [ "${res%% *}" = "TERMINATED" ] && [[ "$res" == *"attestedPurpose"* ]]; then
      pass "$test_id: with a purpose credential attesting [${held% }], ${TRUST_WELLBEING_SLUG} is refused by ehds:attestedPurpose (contract.negotiation not fulfilled)"
      record_result "$test_id" "purpose" "passed"
    else
      fail "$test_id: with purposes [${held% }] the negotiation ended ${res}; want TERMINATED naming ehds:attestedPurpose"
      record_result "$test_id" "purpose" "failed" "premium setting not refused by the policy"
    fi
  fi

  # 7.4 — With the bonus payout purpose back, the agreement is reached again
  test_id="PURPOSE-7.4"
  purpose_drop_all "$ak_ctx"
  if ! purpose_issue "$TRUST_WELLBEING_SLUG" bonus-payout-purpose-credential-def; then
    fail "$test_id: could not give ${TRUST_WELLBEING_SLUG} its bonus-payout purpose back (run scripts/seed-second-data-space.sh)"
    record_result "$test_id" "purpose" "failed" "bonus purpose not restored"
    return
  fi
  res=$(purpose_negotiate "$ak_ctx")
  if [ "${res%% *}" = "FINALIZED" ]; then
    pass "$test_id: with the bonus-payout purpose back, ${TRUST_WELLBEING_SLUG} agrees to ${PURPOSE_ASSET} again"
    record_result "$test_id" "purpose" "passed"
  else
    fail "$test_id: after restoring bonus-payout the negotiation ended ${res}"
    record_result "$test_id" "purpose" "failed" "not admitted after restore"
  fi
}

# ---------------------------------------------------------------------------
# Category 8: The bonus programme's answer, collected over the agreement
# (#934 step 8, ADR-091)
# ---------------------------------------------------------------------------
# AlphaKasse agrees to the offer, starts a pull transfer and reads it at the
# neo4j-proxy with siglet's token. What it receives is the programme, the
# year, goal met and the member's reference, for members with an open consent.
# The members here are two throwaway records this category writes into the
# graph and removes again (source 'identity-checks'); no real record is read
# into the checks or changed by them. Needs what Category 7 needs, the graph's
# HTTP port and siglet.
DELIVER_PROGRAMME="urn:mvhd:programme:alphakasse:identity-checks"
DELIVER_NEO4J_URL="${NEO4J_HTTP_URL:-http://localhost:7474}"
DELIVER_NEO4J_AUTH="${NEO4J_USER:-neo4j}:${NEO4J_PASSWORD:-healthdataspace}"
DELIVER_PROXY_URL="${NEO4J_PROXY_PUBLIC_URL:-http://localhost:9090}"
DELIVER_KEYS='["goalMet","memberReference","programme","year"]'

# Runs one Cypher statement with parameters. Prints the rows as JSON arrays;
# fails when the graph does not answer or reports an error.
deliver_cypher() {
  local body resp params="${2:-}"
  [ -n "$params" ] || params='{}'
  body=$(jq -nc --arg q "$1" --argjson p "$params" '{statements:[{statement:$q,parameters:$p}]}') || return 1
  resp=$(curl -s --max-time 20 -u "$DELIVER_NEO4J_AUTH" -H "Content-Type: application/json" \
    -d "$body" "${DELIVER_NEO4J_URL}/db/neo4j/tx/commit" 2>/dev/null) || return 1
  [ "$(printf '%s' "$resp" | jq -r '(.errors // [{}]) | length' 2>/dev/null)" = "0" ] || return 1
  printf '%s' "$resp" | jq -c '[.results[0].data[]?.row]'
}

deliver_fixture() {
  deliver_cypher 'MERGE (s:DataService {serviceId: $programme})
      ON CREATE SET s.source = "identity-checks"
    SET s:BonusProgramme, s.title = "Identity checks: a bonus programme",
        s.publisherDid = "did:web:alphakasse.de:insurer", s.publisherName = "AlphaKasse DE", s.ruleVersion = "2025.1"
    WITH s
    UNWIND [{c: "identity-checks-consent-1", t: "identity-checks-transfer-1", m: "identity-checks-member-1", g: true},
            {c: "identity-checks-consent-2", t: "identity-checks-transfer-2", m: "identity-checks-member-2", g: false}] AS x
    MERGE (c:ProgrammeConsent {consentId: x.c})
    SET c.programmeId = $programme, c.patientId = x.m, c.joinedAt = datetime(), c.withdrawnAt = null, c.source = "identity-checks"
    MERGE (t:ProgrammeTransfer {transferId: x.t})
    SET t.programmeId = $programme, t.patientId = x.m, t.year = 2025, t.goalMet = x.g, t.status = "evaluated",
        t.requestedAt = datetime(), t.source = "identity-checks"
    REMOVE t.deliveredAt, t.deliveredTo
    MERGE (t)-[:UNDER_CONSENT]->(c)
    RETURN count(*)' "{\"programme\":\"${DELIVER_PROGRAMME}\"}" >/dev/null
}

# Only what deliver_fixture wrote: every node carries source 'identity-checks'.
deliver_cleanup() {
  deliver_cypher 'MATCH (n) WHERE n.source = "identity-checks"
      AND (n:ProgrammeConsent OR n:ProgrammeTransfer OR n:BonusProgramme)
    DETACH DELETE n RETURN count(*)' >/dev/null || true
}

# Starts a pull transfer of the bonus offer under an agreement. Prints the
# transfer's id, its final state and the reason the consumer recorded.
deliver_transfer() {
  local consumer_ctx="$1" agreement="$2" provider_ctx dsp id state="" detail="" i
  provider_ctx=$(trust_ctx "$TRUST_PROVIDER_SLUG")
  dsp="${DSP_INTERNAL_URL:-http://controlplane:8082/api/dsp}/${provider_ctx}/${DSP_PROTOCOL:-http-dsp-profile-2025-1}"
  id=$(curl -s --max-time 30 -X POST -H "$(auth_header)" -H "Content-Type: application/json" \
    -d "{\"@context\":[\"https://w3id.org/edc/connector/management/v2\"],\"@type\":\"TransferRequest\",\"counterPartyAddress\":\"${dsp}\",\"protocol\":\"${DSP_PROTOCOL:-http-dsp-profile-2025-1}\",\"contractId\":\"${agreement}\",\"assetId\":\"${PURPOSE_ASSET}\",\"transferType\":\"HttpData-PULL\",\"callbackAddresses\":[],\"dataDestination\":{\"@type\":\"DataAddress\",\"type\":\"HttpProxy\"}}" \
    "${MGMT_API}/${MGMT_V}/participants/${consumer_ctx}/transferprocesses" 2>/dev/null | jq -r '."@id" // empty' 2>/dev/null)
  [ -n "$id" ] || { printf 'none NOT-STARTED the transfer request was not accepted'; return; }
  for i in $(seq 1 30); do
    state=$(curl -s --max-time 15 -H "$(auth_header)" \
      "${MGMT_API}/${MGMT_V}/participants/${consumer_ctx}/transferprocesses/${id}" 2>/dev/null | jq -r '.state // empty' 2>/dev/null)
    case "$state" in STARTED|TERMINATED) break ;; esac
    sleep 2
  done
  detail=$(curl -s --max-time 15 -H "$(auth_header)" \
    "${MGMT_API}/${MGMT_V}/participants/${consumer_ctx}/transferprocesses/${id}" 2>/dev/null | jq -r '.errorDetail // empty' 2>/dev/null)
  printf '%s %s %s' "$id" "${state:-UNKNOWN}" "$detail"
}

# The access token siglet holds for a consumer's transfer. siglet's token API
# answers inside the stack only, so it is asked from the proxy's container
# unless SIGLET_TOKEN_URL names an address this shell reaches.
deliver_token() {
  if [ -n "${SIGLET_TOKEN_URL:-}" ]; then
    curl -s --max-time 15 "${SIGLET_TOKEN_URL}/tokens/$1/$2" 2>/dev/null | jq -r '.token // empty' 2>/dev/null
  else
    docker exec health-dataspace-neo4j-proxy node -e \
      "fetch('http://siglet:8080/tokens/$1/$2').then(r=>r.json()).then(b=>console.log(b.token||'')).catch(()=>{})" 2>/dev/null
  fi
}

# One pull with a token: the HTTP status, a space, and the body.
deliver_pull() {
  local tmp code
  tmp=$(mktemp)
  code=$(curl -s --max-time 30 -o "$tmp" -w '%{http_code}' -H "Authorization: Bearer $1" \
    "${DELIVER_PROXY_URL}/dataspace/data" 2>/dev/null) || code="000"
  printf '%s %s' "$code" "$(cat "$tmp")"
  rm -f "$tmp"
}

run_delivery_tests() {
  log "Category 8: The bonus programme's answer, collected over the agreement (#934 step 8, ADR-091)"
  local test_id ak_ctx ak_did control_ctx provider_ctx provider_did res reason="" agreement="" neg_id tid state token body mine status
  local all="DELIVER-8.1 DELIVER-8.2 DELIVER-8.3 DELIVER-8.4 DELIVER-8.5 DELIVER-8.6"
  ak_ctx=$(trust_ctx "$TRUST_WELLBEING_SLUG")
  ak_did="did:web:identityhub%3A7083:${TRUST_WELLBEING_SLUG}"
  control_ctx=$(trust_ctx pharmaco)
  provider_ctx=$(trust_ctx "$TRUST_PROVIDER_SLUG")
  provider_did="did:web:identityhub%3A7083:${TRUST_PROVIDER_SLUG}"
  if ! docker inspect health-dataspace-wellbeing-ga-issuer >/dev/null 2>&1; then
    reason="no insurance and wellbeing authority on this stack (not a local stack, or scripts/seed-second-data-space.sh not run)"
  elif [ -z "$ak_ctx" ]; then
    reason="no ${TRUST_WELLBEING_SLUG} context (run scripts/seed-second-data-space.sh)"
  else
    res=$(trust_catalog "${control_ctx:-none}" "${provider_ctx:-none}" "$provider_did")
    if [ "${res#* }" != "Catalog" ]; then
      reason="the DSP path does not work here (pharmaco's catalogue answered ${res})"
    elif ! deliver_cypher 'RETURN 1' >/dev/null; then
      reason="the graph does not answer at ${DELIVER_NEO4J_URL}, so the two throwaway members cannot be written"
    elif [ -z "${SIGLET_TOKEN_URL:-}" ] && ! docker inspect health-dataspace-neo4j-proxy >/dev/null 2>&1; then
      reason="siglet's token API is not reachable: set SIGLET_TOKEN_URL, or run on the compose stack"
    fi
  fi
  if [ -n "$reason" ]; then
    for test_id in $all; do
      skip "$test_id: $reason"
      record_result "$test_id" "delivery" "skipped" "$reason"
    done
    return
  fi

  if ! deliver_fixture; then
    for test_id in $all; do
      fail "$test_id: the two throwaway members could not be written into the graph"
      record_result "$test_id" "delivery" "failed" "fixture"
    done
    return
  fi

  # 8.1: AlphaKasse agrees, starts a transfer and collects the answers
  test_id="DELIVER-8.1"
  PURPOSE_NEGOTIATION_FILE=$(mktemp)
  export PURPOSE_NEGOTIATION_FILE
  res=$(purpose_negotiate "$ak_ctx")
  neg_id=$(cat "$PURPOSE_NEGOTIATION_FILE" 2>/dev/null)
  rm -f "$PURPOSE_NEGOTIATION_FILE"
  unset PURPOSE_NEGOTIATION_FILE
  if [ "${res%% *}" = "FINALIZED" ] && [ -n "$neg_id" ]; then
    agreement=$(curl -s --max-time 15 -H "$(auth_header)" \
      "${MGMT_API}/${MGMT_V}/participants/${ak_ctx}/contractnegotiations/${neg_id}" 2>/dev/null | jq -r '.contractAgreementId // empty' 2>/dev/null)
  fi
  res=""; tid=""; state="NO-AGREEMENT"; token=""; body=""; status="000"; mine="[]"
  if [ -n "$agreement" ]; then
    res=$(deliver_transfer "$ak_ctx" "$agreement")
    tid="${res%% *}"; res="${res#* }"; state="${res%% *}"
    if [ "$state" = "STARTED" ]; then token=$(deliver_token "$ak_ctx" "$tid"); fi
  fi
  if [ -n "$token" ]; then
    res=$(deliver_pull "$token"); status="${res%% *}"; body="${res#* }"
    mine=$(printf '%s' "$body" | jq -c --arg p "$DELIVER_PROGRAMME" '[.answers[]? | select(.programme == $p)]' 2>/dev/null || echo "[]")
  fi
  if [ "$status" = "200" ] && [ "$(printf '%s' "$mine" | jq -c '[.[].goalMet] | sort')" = "[false,true]" ] \
    && [ "$(printf '%s' "$body" | jq -r '.recipient // empty')" = "$ak_did" ]; then
    pass "$test_id: ${TRUST_WELLBEING_SLUG} agrees to ${PURPOSE_ASSET}, its transfer starts, and the pull returns both members' answers for 2025 (one yes, one no)"
    record_result "$test_id" "delivery" "passed"
  else
    fail "$test_id: transfer ${state}, pull HTTP ${status}, answers for the check's programme: ${mine} (${res:0:160})"
    record_result "$test_id" "delivery" "failed" "answers not collected"
  fi

  # 8.2: Nothing but the yes or no leaves: four fields per answer, no id of
  # the record or the consent, and a reference in the agreed form
  test_id="DELIVER-8.2"
  if [ "$status" = "200" ] \
    && [ "$(printf '%s' "$body" | jq -c 'keys')" = '["answers","recipient"]' ] \
    && [ "$(printf '%s' "$body" | jq -c '[.answers[] | keys] | unique')" = "[${DELIVER_KEYS}]" ] \
    && [ "$(printf '%s' "$mine" | jq -r '[.[].memberReference | test("^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$")] | all')" = "true" ] \
    && ! printf '%s' "$body" | grep -q 'identity-checks-'; then
    pass "$test_id: each answer carries programme, year, goalMet and memberReference only; no record id, no consent id, no value behind the answer"
    record_result "$test_id" "delivery" "passed"
  else
    fail "$test_id: the pull's body is not the yes or no alone: $(printf '%s' "$body" | head -c 240)"
    record_result "$test_id" "delivery" "failed" "more than the yes or no"
  fi

  # 8.3: The hub records who collected an answer
  test_id="DELIVER-8.3"
  res=$(deliver_cypher 'MATCH (t:ProgrammeTransfer {transferId: "identity-checks-transfer-1"})
    RETURN t.status, t.deliveredTo, t.deliveredAt IS NOT NULL' || echo "[]")
  if [ "$res" = "[[\"delivered\",\"${ak_did}\",true]]" ]; then
    pass "$test_id: the transfer is recorded as delivered to ${ak_did}, with the date"
    record_result "$test_id" "delivery" "passed"
  else
    fail "$test_id: the collected transfer reads ${res}; want delivered, to ${ak_did}, with a date"
    record_result "$test_id" "delivery" "failed" "collection not recorded"
  fi

  # 8.4: After a withdrawal the member's answer is no longer handed over
  test_id="DELIVER-8.4"
  deliver_cypher 'MATCH (c:ProgrammeConsent {consentId: "identity-checks-consent-2"}) SET c.withdrawnAt = datetime() RETURN 1' >/dev/null || true
  status="000"; mine="[]"
  if [ -n "$token" ]; then
    res=$(deliver_pull "$token"); status="${res%% *}"
    mine=$(printf '%s' "${res#* }" | jq -c --arg p "$DELIVER_PROGRAMME" '[.answers[]? | select(.programme == $p) | .goalMet]' 2>/dev/null || echo "[]")
  fi
  if [ "$status" = "200" ] && [ "$mine" = "[true]" ]; then
    pass "$test_id: after the second member withdraws, the same transfer returns the first member's answer only"
    record_result "$test_id" "delivery" "passed"
  else
    fail "$test_id: after a withdrawal the pull answered HTTP ${status} with goalMet ${mine}; want the remaining member's [true]"
    record_result "$test_id" "delivery" "failed" "withdrawn member still delivered"
  fi

  # 8.5: The answers are not read without the agreement's transfer
  test_id="DELIVER-8.5"
  status=$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' -H "X-Participant: ${ak_did}" \
    "${DELIVER_PROXY_URL}/programmes/answers" 2>/dev/null) || status="000"
  res=$(curl -s -o /dev/null --max-time 15 -w '%{http_code}' -H "Authorization: Bearer not-a-token" \
    "${DELIVER_PROXY_URL}/dataspace/data" 2>/dev/null) || res="000"
  if [ "$status" = "403" ] && [ "$res" = "401" ]; then
    pass "$test_id: a direct call naming ${TRUST_WELLBEING_SLUG} is refused (403), and a pull without siglet's token is refused (401)"
    record_result "$test_id" "delivery" "passed"
  else
    fail "$test_id: a direct call answered ${status} (want 403) and a pull with a made-up token ${res} (want 401)"
    record_result "$test_id" "delivery" "failed" "answers readable without a transfer"
  fi

  # 8.6: The purpose is checked again when a transfer starts: under the same
  # agreement, a credential that now attests premium-setting starts none
  test_id="DELIVER-8.6"
  if [ -z "$agreement" ]; then
    fail "$test_id: no agreement to start a transfer under"
    record_result "$test_id" "delivery" "failed" "no agreement"
  else
    purpose_drop_all "$ak_ctx"
    if ! purpose_issue "$TRUST_WELLBEING_SLUG" premium-setting-purpose-credential-def; then
      fail "$test_id: could not have the authority attest premium-setting to ${TRUST_WELLBEING_SLUG}"
      record_result "$test_id" "delivery" "failed" "premium setting credential setup"
    else
      res=$(deliver_transfer "$ak_ctx" "$agreement")
      res="${res#* }"
      # EDC answers a transfer whose policy fails in the transfer scope with
      # 409 "agreement not found or not valid"; the agreement itself started a
      # transfer in 8.1, so what changed is the purpose.
      if [ "${res%% *}" = "TERMINATED" ] && [[ "$res" == *"agreement not found or not valid"* ]]; then
        pass "$test_id: with a purpose credential attesting premium-setting, a transfer under the agreement that served 8.1 is refused (409, agreement not valid for this consumer now)"
        record_result "$test_id" "delivery" "passed"
      else
        fail "$test_id: with premium-setting attested, a transfer under the existing agreement ended ${res:0:300}; want TERMINATED, agreement not valid"
        record_result "$test_id" "delivery" "failed" "transfer started on another purpose"
      fi
    fi
    purpose_drop_all "$ak_ctx"
    purpose_issue "$TRUST_WELLBEING_SLUG" bonus-payout-purpose-credential-def ||
      echo -e "  ${YELLOW}!${NC} ${TRUST_WELLBEING_SLUG}'s bonus-payout purpose was not restored: run scripts/seed-second-data-space.sh"
  fi

  deliver_cleanup
}

# ---------------------------------------------------------------------------
# Generate JSON report
# ---------------------------------------------------------------------------
write_report() {
  log "Writing report to ${REPORT_FILE}"
  {
    echo "{"
    echo "  \"suite\": \"DCP v1.0 Compliance\","
    echo "  \"version\": \"1.0.0\","
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"deployment\": \"health-dataspace-v2\","
    echo "  \"summary\": {"
    echo "    \"total\": ${TOTAL},"
    echo "    \"passed\": ${PASSED},"
    echo "    \"failed\": ${FAILED},"
    echo "    \"skipped\": ${SKIPPED},"
    echo "    \"passRate\": \"$(echo "scale=1; ${PASSED} * 100 / ${TOTAL}" | bc 2>/dev/null || echo "0")%\""
    echo "  },"
    echo "  \"tests\": ["
    local first=true
    for r in "${TEST_RESULTS[@]}"; do
      if [ "$first" = true ]; then first=false; else echo ","; fi
      echo -n "    $r"
    done
    echo ""
    echo "  ]"
    echo "}"
  } > "$REPORT_FILE"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  DCP v1.0 Compliance Tests — Health Dataspace"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  discover_participants
  echo ""

  run_did_tests
  echo ""
  run_keypair_tests
  echo ""
  run_credential_tests
  echo ""
  run_issuer_tests
  echo ""
  run_scope_tests
  echo ""
  run_trust_tests
  echo ""
  run_purpose_tests
  echo ""
  run_delivery_tests

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  # TOTAL counts checks that reached a verdict. Skips are reported next to it
  # rather than inside it, so the rate cannot be improved by skipping more.
  rate="n/a"
  if [ "$TOTAL" -gt 0 ]; then rate="$((100 * PASSED / TOTAL))%"; fi
  echo -e "  Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC} / ${TOTAL} verdicts (${rate}), ${YELLOW}${SKIPPED} skipped${NC}"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  write_report

  if [ "$FAILED" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
