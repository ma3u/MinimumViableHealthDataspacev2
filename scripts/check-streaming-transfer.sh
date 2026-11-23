#!/usr/bin/env bash
set -euo pipefail
# ---------------------------------------------------------------------------
# A long-term ECG streamed over Kafka into an SPE workspace (ADR-095)
# ---------------------------------------------------------------------------
# End to end on the compose stack, through a real DSP negotiation:
#
#   1. PharmaCo Research AG reads AlphaKlinik Berlin's catalogue and negotiates
#      the synthetic Holter recording (ecg-holter-hour: one hour, two leads,
#      250 Hz, one FHIR Observation per 30 s);
#   2. it asks for a Kafka-PUSH transfer: the provider's data plane writes the
#      recording to a topic the consumer named, window by window, and the
#      consumer's data plane reads it into the inbox of SPE-1;
#   3. the same recording again as Kafka-PULL: the provider offers the topic;
#   4. read-back at the neo4j-proxy for each: the transfer is COMPLETED, the
#      inbox holds every Observation and the Patient, and its SHA-256 is set.
#
# Needs the stack seeded (jad/seed-all.sh), the push data plane
# (scripts/seed-dataplane.sh) and the broker:
#   docker compose -f docker-compose.yml -f docker-compose.jad.yml --profile streaming up -d kafka
#
#   ASSET=ecg-holter-stream ./scripts/check-streaming-transfer.sh   # the 24 hours: 2,881 records, about 124 MB
#   PROFILES="Kafka-PUSH" ./scripts/check-streaming-transfer.sh
#
# Exit 0 when every transfer passed, 1 when one failed, 3 when the stack
# cannot run it (the reason is printed).
# ---------------------------------------------------------------------------
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
MGMT="${EDC_MANAGEMENT_URL:-http://localhost:11003/api/mgmt}/${EDC_MGMT_API_VERSION:-v5}"
DSP_INTERNAL_URL="${DSP_INTERNAL_URL:-http://controlplane:8082/api/dsp}"
DSP_PROTOCOL="${DSP_PROTOCOL:-http-dsp-profile-2025-1}"
SPE_PROXY_URL="${SPE_PROXY_URL:-http://localhost:9090}"
KAFKA_CONTAINER="${KAFKA_CONTAINER:-health-dataspace-kafka}"
ASSET="${ASSET:-ecg-holter-hour}"
PROFILES="${PROFILES:-Kafka-PUSH Kafka-PULL}"
SPE_ID="${SPE_ID:-SPE-1}"
# one hour is 120 strips and the Patient; a day takes longer than a minute
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-600}"
EDC_CTX="https://w3id.org/edc/connector/management/v2"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
ok() { echo -e "  ${GREEN}ok${NC}    $*"; }
bad() { echo -e "  ${RED}FAIL${NC}  $*"; FAILED=$((FAILED + 1)); }
cannot() {
  echo -e "${YELLOW}cannot run${NC}: $*" >&2
  exit 3
}
FAILED=0

[ "$(docker inspect -f '{{.State.Health.Status}}' "$KAFKA_CONTAINER" 2>/dev/null || true)" = "healthy" ] ||
  cannot "${KAFKA_CONTAINER} is not healthy; start the profile 'streaming'"

# A token lives five minutes and a day of ECG takes longer, so every call
# gets a token no older than a minute.
TOKEN=""
TOKEN_AT=0
token() {
  if [ -z "$TOKEN" ] || [ $(($(date +%s) - TOKEN_AT)) -gt 60 ]; then
    TOKEN="$(curl -sS --max-time 20 -X POST "${KEYCLOAK_URL}/realms/edcv/protocol/openid-connect/token" \
      -d "grant_type=client_credentials&client_id=provisioner&client_secret=provisioner-secret" | jq -r '.access_token // empty')"
    TOKEN_AT=$(date +%s)
  fi
}
token
[ -n "$TOKEN" ] || cannot "no provisioner token from ${KEYCLOAK_URL}"
api() {
  local method="$1" path="$2" body="${3:-}"
  token
  if [ -n "$body" ]; then
    curl -sS --max-time 60 -X "$method" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "$body" "${MGMT}${path}"
  else
    curl -sS --max-time 60 -X "$method" -H "Authorization: Bearer ${TOKEN}" "${MGMT}${path}"
  fi
}

contexts="$(api GET /participants)"
CONSUMER="$(jq -r '.[] | select(.identity // "" | test("pharmaco$")) | ."@id"' <<<"$contexts")"
PROVIDER="$(jq -r '.[] | select(.identity // "" | test("alpha-klinik$")) | ."@id"' <<<"$contexts")"
PROVIDER_DID="$(jq -r '.[] | select(.identity // "" | test("alpha-klinik$")) | .identity' <<<"$contexts")"
[ -n "$CONSUMER" ] && [ -n "$PROVIDER" ] || cannot "the control plane lists no pharmaco or no alpha-klinik context"
PROVIDER_DSP="${DSP_INTERNAL_URL}/${PROVIDER}/${DSP_PROTOCOL}"

echo "Streaming ${ASSET} from AlphaKlinik Berlin to PharmaCo Research AG, into ${SPE_ID}"

# --- 1. the offer, and an agreement for it ------------------------------------
catalog="$(api POST "/participants/${CONSUMER}/catalog/request" "$(jq -nc --arg a "$PROVIDER_DSP" --arg id "$PROVIDER_DID" --arg p "$DSP_PROTOCOL" --arg c "$EDC_CTX" \
  '{"@context":[$c],"@type":"CatalogRequest",counterPartyAddress:$a,counterPartyId:$id,protocol:$p}')")"
offer="$(printf '%s' "$catalog" | python3 -I -c '
import json, sys
asset, assigner = sys.argv[1], sys.argv[2]
catalog = json.load(sys.stdin)
def many(v):
    return v if isinstance(v, list) else [] if v is None else [v]
for dataset in many(catalog.get("dataset") or catalog.get("dcat:dataset")):
    if dataset.get("@id") != asset:
        continue
    for policy in many(dataset.get("hasPolicy") or dataset.get("odrl:hasPolicy")):
        # the offer goes back whole: the provider builds the agreement from it
        offer = {k: v for k, v in policy.items() if k != "@context" and v != []}
        offer.setdefault("permission", [{"action": "use"}])
        offer.update({"@context": "http://www.w3.org/ns/odrl.jsonld", "@type": "Offer",
                      "assigner": assigner, "target": asset})
        print(json.dumps(offer))
        sys.exit(0)
' "$ASSET" "$PROVIDER_DID" 2>/dev/null || true)"
[ -n "$offer" ] || cannot "AlphaKlinik's catalogue offers no ${ASSET}; run jad/seed-data-assets.sh"

negotiation="$(api POST "/participants/${CONSUMER}/contractnegotiations" "$(jq -nc --arg a "$PROVIDER_DSP" --arg p "$DSP_PROTOCOL" --arg c "$EDC_CTX" --argjson policy "$offer" \
  '{"@context":[$c],"@type":"ContractRequest",counterPartyAddress:$a,protocol:$p,policy:$policy}')" | jq -r '."@id" // empty')"
[ -n "$negotiation" ] || cannot "the negotiation for ${ASSET} did not start"
agreement=""
for _ in $(seq 1 30); do
  state="$(api GET "/participants/${CONSUMER}/contractnegotiations/${negotiation}")"
  case "$(jq -r '.state // empty' <<<"$state")" in
    FINALIZED)
      agreement="$(jq -r '.contractAgreementId // empty' <<<"$state")"
      break
      ;;
    TERMINATED) break ;;
  esac
  sleep 2
done
if [ -z "$agreement" ]; then
  bad "the negotiation for ${ASSET} ended $(jq -r '.state // "in no state"' <<<"$state"): $(jq -r '.errorDetail // ""' <<<"$state" | head -c 200)"
  exit 1
fi
ok "negotiated ${ASSET}: agreement ${agreement:0:8}"

# --- 2 to 4. one transfer per profile --------------------------------------------
for profile in $PROFILES; do
  started_at=$(date +%s)
  transfer="$(api POST "/participants/${CONSUMER}/transferprocesses" "$(jq -nc --arg a "$PROVIDER_DSP" --arg p "$DSP_PROTOCOL" --arg c "$EDC_CTX" \
    --arg ag "$agreement" --arg asset "$ASSET" --arg profile "$profile" --arg spe "$SPE_ID" \
    '{"@context":[$c],"@type":"TransferRequest",counterPartyAddress:$a,protocol:$p,contractId:$ag,assetId:$asset,
      transferType:$profile,dataplaneMetadata:{"@type":"DataplaneMetadata",properties:{speId:$spe}}}')" | jq -r '."@id" // empty')"
  if [ -z "$transfer" ]; then
    bad "${profile}: the control plane did not take the transfer"
    continue
  fi
  state=""
  detail=""
  while [ $(($(date +%s) - started_at)) -lt "$TIMEOUT_SECONDS" ]; do
    answer="$(api GET "/participants/${CONSUMER}/transferprocesses/${transfer}")"
    state="$(jq -r '.state // empty' <<<"$answer")"
    case "$state" in COMPLETED | TERMINATED) break ;; esac
    sleep 3
  done
  took=$(($(date +%s) - started_at))
  if [ "$state" != "COMPLETED" ]; then
    detail="$(jq -r '.errorDetail // "no error detail"' <<<"$answer" | head -c 240)"
    bad "${profile}: the transfer is ${state:-in no state} after ${took} s: ${detail}"
    continue
  fi
  inbox="$(curl -sS --max-time 20 "${SPE_PROXY_URL}/spe/${SPE_ID}/inbox/${transfer}")"
  records="$(jq -r 'if .state == "completed" then (.records // 0) else 0 end' <<<"$inbox")"
  sha="$(jq -r '.sha256 // empty' <<<"$inbox")"
  scope="$(jq -r '.attestation.scope // empty' <<<"$inbox")"
  # every strip of the recording, and the Patient with the first window
  expected="$(curl -sS --max-time 20 "${SPE_PROXY_URL}/fhir/ecg-holter?seconds=30$([ "$ASSET" = "ecg-holter-hour" ] && echo '&durationSeconds=3600')" | jq -r '.total + 1')"
  if [ "$records" = "$expected" ] && [ "${#sha}" -eq 64 ] && [ -n "$scope" ]; then
    ok "${profile}: COMPLETED in ${took} s; ${SPE_ID} holds ${records} records (${expected} expected), attestation '${scope}', sha256 ${sha:0:12}"
  else
    bad "${profile}: COMPLETED, but ${SPE_ID}'s inbox shows ${records} of ${expected} records ($(head -c 160 <<<"$inbox"))"
  fi
done

echo
if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}${FAILED} failed${NC}"
  exit 1
fi
echo -e "${GREEN}streaming transfers passed${NC}"
