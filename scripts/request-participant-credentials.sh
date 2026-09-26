#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Obtain credentials for the participants over DCP, not by planting them. #345
# ---------------------------------------------------------------------------
# VC-3.2 and VC-3.3 ask whether a participant holds an EHDS-relevant
# credential. jad/issue-ehds-credentials.sh is explicit that the IssuerService
# does not issue on admin command: a credential arrives when the holder's
# IdentityHub sends a CredentialRequestMessage and the issuer answers over the
# Credential Issuance Protocol. So this asks each IdentityHub participant to
# request one, then waits for it to land.
#
# That makes it the first place in this repository where CI exercises DCP as a
# protocol between two services rather than reading an admin API. Even the
# local stack's credentials were planted at onboarding: they carry
# holderPid: null and issuerPid: null, which a protocol-issued one does not.
#
# Preconditions, each checked by its own seed: participant contexts on the
# control plane (05-cp-participants.sh), the same participants in IdentityHub
# (seed-identityhub-participants.sh), registered as holders on the issuer
# (seed-issuer-holders.sh), and a MembershipCredential definition on the
# issuer (jad/seed-issuer-defs.sh). Every DID involved must resolve from
# inside the network, which is why the DIDs are did:web:identityhub%3A7083:*.
# ---------------------------------------------------------------------------
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IDENTITY_API="${EDC_IDENTITY_URL:-http://localhost:11005/api/identity}"
MGMT_API="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}"
MGMT_V_CANDIDATES="${EDC_MGMT_API_VERSION_CANDIDATES:-v5beta v5alpha v4alpha v3}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-edcv}"
CLIENT_ID="${EDC_CLIENT_ID:-admin}"
CLIENT_SECRET="${EDC_CLIENT_SECRET:-edc-v-admin-secret}"
ISSUER_DID="${ISSUER_DID:-did:web:issuerservice%3A10016:issuer}"
CREDENTIAL_TYPE="${CREDENTIAL_TYPE:-MembershipCredential}"
CREDENTIAL_FORMAT="${CREDENTIAL_FORMAT:-VC1_0_JWT}"
# The issuer resolves a request by credential DEFINITION id, not by type. CI
# run 36259831503 answered every request with 400 "A Credential definition ID
# 'null' does not exist" because this script sent {type, format} only; the
# vendored identity-api.yaml lists CredentialDescriptor.id as optional and the
# issuer treats it as required. Resolved from the issuer by type, with a
# fallback for when the admin API is not reachable from here.
ISSUER_API="${EDC_ISSUER_URL:-http://localhost:10013/api/admin}"
ISSUER_CTX="${ISSUER_CTX:-issuer}"
CREDENTIAL_DEFINITION_ID="${CREDENTIAL_DEFINITION_ID:-}"
WAIT_SECONDS="${WAIT_SECONDS:-90}"
# Restrict to some slugs, space separated, e.g. ONLY="irs" for a local smoke test.
ONLY="${ONLY:-}"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
log() { echo -e "${CYAN}[vc-request]${NC} $*"; }

TOKEN=$(curl -sS --max-time 20 -X POST \
  "${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}" \
  2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || true)
[ -n "$TOKEN" ] || { echo -e "${RED}ERROR${NC}: no Keycloak token from ${KEYCLOAK_URL}/realms/${REALM}." >&2; exit 1; }

if [ -z "$CREDENTIAL_DEFINITION_ID" ]; then
  CREDENTIAL_DEFINITION_ID=$(curl -sS --max-time 20 -X POST -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" -d '{}' \
    "${ISSUER_API}/v1alpha/participants/${ISSUER_CTX}/credentialdefinitions/query" 2>/dev/null \
    | python3 -c "import json,sys
t=sys.argv[1]
try: rows=json.load(sys.stdin)
except Exception: rows=[]
ids=[r.get('id') for r in rows if isinstance(r,dict) and r.get('credentialType')==t and r.get('id')]
print(ids[0] if ids else '')" "$CREDENTIAL_TYPE" 2>/dev/null || true)
fi
if [ -z "$CREDENTIAL_DEFINITION_ID" ]; then
  echo -e "${RED}ERROR${NC}: the issuer has no credential definition of type ${CREDENTIAL_TYPE}; run jad/seed-issuer-defs.sh first." >&2
  exit 1
fi
log "requesting ${CREDENTIAL_TYPE} as definition '${CREDENTIAL_DEFINITION_ID}' from ${ISSUER_DID}"

PAIRS=""
for v in $MGMT_V_CANDIDATES; do
  cp_body=$(curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" "${MGMT_API}/${v}/participants" 2>/dev/null) || continue
  PAIRS=$(printf '%s' "$cp_body" | python3 "${SCRIPT_DIR}/lib/cp-participant-pairs.py" 2>/dev/null) || PAIRS=""
  [ -n "$PAIRS" ] && break
done
[ -n "$PAIRS" ] || { echo -e "${RED}ERROR${NC}: the control plane lists no participants." >&2; exit 1; }

# Count credentials of the wanted type for one participant. The first version
# required holderPid on the credential resource; IdentityHub keeps that on the
# request record, not the credential, so it would never have counted anything.
# Success is therefore "one more of this type than before the request".
issued_count() {
  curl -sS --max-time 20 -H "Authorization: Bearer ${TOKEN}" \
    "${IDENTITY_API}/v1alpha/participants/$1/credentials" 2>/dev/null \
    | python3 -c "import json,sys
t=sys.argv[1]
try: rows=json.load(sys.stdin)
except Exception: print(0); sys.exit(0)
n=0
for r in rows if isinstance(rows,list) else []:
    types=(r.get('verifiableCredential') or {}).get('credential',{}).get('type') or []
    if isinstance(types,str): types=[types]
    if t in types: n+=1
print(n)" "$CREDENTIAL_TYPE" 2>/dev/null || echo 0
}

started=$(date +%s)
requested=0; already=0; failed=0
declare -a WATCH_CTX=() WATCH_DID=() WATCH_BEFORE=() WATCH_HPID=()

while read -r ctx did; do
  [ -n "$ctx" ] && [ -n "$did" ] || continue
  slug="${did##*:}"
  if [ -n "$ONLY" ]; then
    case " $ONLY " in *" $slug "*) ;; *) continue ;; esac
  fi
  before=$(issued_count "$ctx")
  body=$(python3 -c 'import json,sys; print(json.dumps({"issuerDid": sys.argv[1], "credentials": [{"id": sys.argv[4], "type": sys.argv[2], "format": sys.argv[3]}]}))' "$ISSUER_DID" "$CREDENTIAL_TYPE" "$CREDENTIAL_FORMAT" "$CREDENTIAL_DEFINITION_ID")
  tmp=$(mktemp); hdr=$(mktemp)
  status=$(curl -sS --max-time 30 -o "$tmp" -D "$hdr" -w '%{http_code}' \
    -X POST "${IDENTITY_API}/v1alpha/participants/${ctx}/credentials/request" \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null) || status="000"
  detail=$(head -c 300 "$tmp" 2>/dev/null || true)
  # The holderPid is the request's id on the hub side. It may come back as a
  # bare string, as JSON, or only in a Location header.
  hpid=$(printf '%s' "$detail" | python3 -c "import json,sys
raw=sys.stdin.read().strip()
try:
    v=json.loads(raw); print(v if isinstance(v,str) else (v.get('holderPid') or v.get('id') or ''))
except Exception: print(raw.strip('\"'))" 2>/dev/null || true)
  [ -n "$hpid" ] || hpid=$(grep -i '^location:' "$hdr" 2>/dev/null | sed -E 's|.*/||' | tr -d '\r\n' || true)
  rm -f "$tmp" "$hdr"
  case "$status" in
    2??) echo -e "  ${GREEN}>${NC} ${slug}: request accepted${hpid:+, holderPid ${hpid}}"; requested=$((requested + 1)) ;;
    409) echo -e "  ${YELLOW}=${NC} ${slug}: a request already exists"; already=$((already + 1)) ;;
    *)   echo -e "  ${RED}x${NC} ${slug}: HTTP ${status} ${detail}"; failed=$((failed + 1)); continue ;;
  esac
  WATCH_CTX+=("$ctx"); WATCH_DID+=("$did"); WATCH_BEFORE+=("$before"); WATCH_HPID+=("${hpid:-}")
done <<EOF
$PAIRS
EOF
log "requested ${requested}, already requested ${already}, failed ${failed}"

# The request is asynchronous: the issuer processes it and delivers the
# credential to the holder's IdentityHub. Wait for it to land rather than
# trusting the 201 (ADR-031, and #325's lesson).
if [ "${#WATCH_CTX[@]}" -gt 0 ]; then
  log "waiting up to ${WAIT_SECONDS}s for ${CREDENTIAL_TYPE} to arrive via DCP"
  deadline=$(( $(date +%s) + WAIT_SECONDS ))
  pending=1
  declare -a ERRORED=()
  while [ "$pending" -gt 0 ] && [ "$(date +%s)" -lt "$deadline" ]; do
    pending=0
    for i in "${!WATCH_CTX[@]}"; do
      [ -n "${ERRORED[$i]:-}" ] && continue
      now=$(issued_count "${WATCH_CTX[$i]}")
      if [ "$now" -gt "${WATCH_BEFORE[$i]}" ]; then continue; fi
      # Ask the hub how the request is going; an ERROR is final and diagnosable.
      if [ -n "${WATCH_HPID[$i]}" ]; then
        st=$(curl -sS --max-time 15 -H "Authorization: Bearer ${TOKEN}" \
          "${IDENTITY_API}/v1alpha/participants/${WATCH_CTX[$i]}/credentials/request/${WATCH_HPID[$i]}" 2>/dev/null \
          | python3 -c "import json,sys
try: r=json.load(sys.stdin); print((r.get('status') or '')+'|'+(r.get('errorDetail') or ''))
except Exception: print('|')" 2>/dev/null || echo '|')
        case "${st%%|*}" in
          # An empty errorDetail must still register as an error: the first CI
          # run hit exactly that, and an empty string read as "not errored", so
          # the wait ended after one pass and the reason never reached the log.
          ERROR) ERRORED[$i]="${st#*|}"; [ -n "${ERRORED[$i]}" ] || ERRORED[$i]="(hub reports ERROR with no errorDetail)"; continue ;;
        esac
      fi
      pending=$((pending + 1))
    done
    [ "$pending" -gt 0 ] && sleep 5
  done
fi

elapsed=$(( $(date +%s) - started ))
missing=0
for i in "${!WATCH_CTX[@]}"; do
  now=$(issued_count "${WATCH_CTX[$i]}")
  slug="${WATCH_DID[$i]##*:}"
  if [ -n "${ERRORED[$i]:-}" ]; then
    echo -e "  ${RED}✗${NC} ${slug}: the hub gave up on the request: ${ERRORED[$i]}"
    missing=$((missing + 1))
  elif [ "$now" -gt "${WATCH_BEFORE[$i]}" ]; then
    echo -e "  ${GREEN}✓${NC} ${slug}: ${CREDENTIAL_TYPE} arrived over DCP (${WATCH_BEFORE[$i]} -> ${now})"
  else
    echo -e "  ${RED}✗${NC} ${slug}: no new ${CREDENTIAL_TYPE} after ${elapsed}s (still ${now})"
    missing=$((missing + 1))
  fi
done

# When it did not work, put the evidence where a CI log can be read: the
# hub's own request record, and the hub's log lines about the request. The
# first CI run printed five failures and not one reason.
if [ "$missing" -gt 0 ]; then
  for i in "${!WATCH_CTX[@]}"; do
    [ -n "${WATCH_HPID[$i]}" ] || continue
    echo "  -- request record ${WATCH_DID[$i]##*:} / ${WATCH_HPID[$i]}:"
    curl -sS --max-time 15 -H "Authorization: Bearer ${TOKEN}" \
      "${IDENTITY_API}/v1alpha/participants/${WATCH_CTX[$i]}/credentials/request/${WATCH_HPID[$i]}" 2>/dev/null \
      | head -c 600 | sed 's/^/     /'; echo
  done
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${IDENTITYHUB_CONTAINER:-health-dataspace-identityhub}"; then
    echo "  -- ${IDENTITYHUB_CONTAINER:-health-dataspace-identityhub} log, credential request lines, last 5 min:"
    docker logs --since 5m "${IDENTITYHUB_CONTAINER:-health-dataspace-identityhub}" 2>&1 \
      | grep -v otel.javaagent | grep -iE 'HolderCredentialRequest|CredentialRequest|issuer|ERROR|WARN' \
      | grep -v CredentialWatchdog | tail -15 | sed 's/^/     /'
  fi
  # The other half of the conversation: if the hub did send, the issuer's
  # view is authoritative. Its issuance-process records carry the state and
  # errorDetail; its log shows the first failure, which the retry backoff
  # lines then bury (CI run 36260584125 showed five "retry #6" lines and not
  # one reason).
  if [ -n "${ISSUER_API:-}" ]; then
    echo "  -- issuer issuance processes (state, errorDetail), newest first:"
    curl -sS --max-time 20 -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d '{}' \
      "${ISSUER_API}/v1alpha/participants/${ISSUER_CTX}/issuanceprocesses/query" 2>/dev/null \
      | python3 -c "import json,sys
try: rows=json.load(sys.stdin)
except Exception: rows=[]
rows=[r for r in rows if isinstance(r,dict)]
rows.sort(key=lambda r: r.get('timestamp') or 0, reverse=True)
for r in rows[:6]:
    print('     ', r.get('state'), (r.get('holderId') or '')[-24:], 'pid', (r.get('holderPid') or '')[:8], '|', (r.get('errorDetail') or '(no errorDetail)')[:200])" 2>/dev/null || echo "     (issuer admin API not reachable)"
  fi
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${ISSUER_CONTAINER:-health-dataspace-issuerservice}"; then
    echo "  -- ${ISSUER_CONTAINER:-health-dataspace-issuerservice} log, issuance lines, last 5 min:"
    docker logs --since 5m "${ISSUER_CONTAINER:-health-dataspace-issuerservice}" 2>&1 \
      | grep -v otel.javaagent | grep -vE 'retry #|will not be attempted' \
      | grep -iE 'CredentialRequest|IssuanceProcess|attestation|deliver|holder|did:web|ERROR|WARN|SEVERE|Exception' \
      | tail -20 | sed 's/^/     /'
  fi
fi

if [ "$failed" -gt 0 ] || [ "$missing" -gt 0 ]; then
  echo -e "${RED}FAIL${NC}: ${failed} request(s) rejected, ${missing} credential(s) never arrived." >&2
  exit 1
fi
echo -e "${GREEN}OK${NC}: every requested participant holds a DCP-issued ${CREDENTIAL_TYPE}"
