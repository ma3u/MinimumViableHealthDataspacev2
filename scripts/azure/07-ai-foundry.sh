#!/usr/bin/env bash
# Phase 25c (Issue #13): Wire the existing Azure OpenAI account into the
# mvhd-neo4j-proxy ACA container app and deploy the embedding model that
# GraphRAG needs.
#
# Non-destructive — every step is idempotent:
#   - Chat models (gpt-5.1, gpt-5-mini) are NOT redeployed if already present.
#   - text-embedding-3-small is created only if missing.
#   - ACA secret + env vars are upsert-safe.
#
# EU data residency (ADR-033): deployments default to DataZoneStandard, which
# keeps inference inside the EU data zone. GlobalStandard — the previous default
# here — routes to global capacity and gives NO EU-only guarantee, which is the
# wrong posture for GDPR Art. 9 health data. Existing deployments are reported
# with their SKU and a Global* one is called out loudly; this script never
# silently recreates a deployment to change its SKU, because that drops capacity.
#
# Usage (locally, when your PIM role is fresh):
#   ./scripts/azure/07-ai-foundry.sh
# Or via GitHub Actions (recommended — stable CI SP):
#   gh workflow run graphrag-deploy.yml
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/env.sh"

# Existing account discovered by `az cognitiveservices account list`. Pinned
# here so the script is reproducible; override via env if you re-provision.
AOAI_ACCOUNT="${AOAI_ACCOUNT:-oai-mvhd-5f53b7}"
AOAI_API_VERSION="${AOAI_API_VERSION:-2024-10-21}"

# Models — chat + embeddings. Chat uses whatever deployment name already
# exists; we prefer gpt-5-mini (cheaper + faster) for rerank.
CHAT_DEPLOYMENT="${CHAT_DEPLOYMENT:-gpt-5-mini}"
EMBED_DEPLOYMENT="${EMBED_DEPLOYMENT:-text-embedding-3-small}"
EMBED_MODEL_NAME="${EMBED_MODEL_NAME:-text-embedding-3-small}"
EMBED_MODEL_VERSION="${EMBED_MODEL_VERSION:-1}"
EMBED_CAPACITY="${EMBED_CAPACITY:-10}"
# EU data zone by default. Override to "Standard" to pin to the single region
# instead, or to "GlobalStandard" only for synthetic data you do not mind
# leaving the EU.
EMBED_SKU="${EMBED_SKU:-DataZoneStandard}"
EMBED_SKU_FALLBACK="${EMBED_SKU_FALLBACK:-Standard}"

log "Phase 25c: Azure AI Foundry wiring for GraphRAG"

# ── 1. Verify account exists ─────────────────────────────────────────────────
if ! az cognitiveservices account show --name "$AOAI_ACCOUNT" --resource-group "$RG" -o none 2>/dev/null; then
  err "Azure OpenAI account '${AOAI_ACCOUNT}' not found in ${RG}. Create one first:"
  err "  az cognitiveservices account create --name ${AOAI_ACCOUNT} --resource-group ${RG} --location ${LOCATION} --kind OpenAI --sku S0 --yes"
  exit 1
fi
AOAI_ENDPOINT=$(az cognitiveservices account show --name "$AOAI_ACCOUNT" --resource-group "$RG" --query "properties.endpoint" -o tsv)
ok "Azure OpenAI account: ${AOAI_ACCOUNT}"

# ── 2. Ensure chat deployment exists (we don't create it — user deployed
#       gpt-5.1 / gpt-5-mini explicitly; we just verify) ──────────────────────
if ! az cognitiveservices account deployment show \
     --resource-group "$RG" --name "$AOAI_ACCOUNT" \
     --deployment-name "$CHAT_DEPLOYMENT" -o none 2>/dev/null; then
  err "Chat deployment '${CHAT_DEPLOYMENT}' missing on ${AOAI_ACCOUNT}."
  err "Available deployments:"
  az cognitiveservices account deployment list --resource-group "$RG" --name "$AOAI_ACCOUNT" --query "[].name" -o tsv
  exit 1
fi
ok "Chat deployment present: ${CHAT_DEPLOYMENT}"

# ── 2b. Residency audit — report the SKU of every deployment, flag Global* ────
# A deployment's SKU decides where inference actually runs. Reporting it here
# means a Global* deployment cannot sit unnoticed once real health data flows.
RESIDENCY_WARNINGS=0
while IFS=$'\t' read -r dep_name dep_sku; do
  [ -z "$dep_name" ] && continue
  case "$dep_sku" in
    Global*)
      err "  ${dep_name}: ${dep_sku} — no EU-only processing guarantee (see ADR-033)"
      RESIDENCY_WARNINGS=$((RESIDENCY_WARNINGS + 1))
      ;;
    *)
      ok "  ${dep_name}: ${dep_sku}"
      ;;
  esac
done < <(az cognitiveservices account deployment list \
  --resource-group "$RG" --name "$AOAI_ACCOUNT" \
  --query "[].[name, sku.name]" -o tsv 2>/dev/null)

if [ "$RESIDENCY_WARNINGS" -gt 0 ]; then
  err ""
  err "${RESIDENCY_WARNINGS} deployment(s) use a Global* SKU. Inference may run"
  err "outside the EU. That is acceptable for synthetic demo data and NOT"
  err "acceptable for GDPR Art. 9 health data (ADR-033)."
  err "Re-create them as DataZoneStandard (EU data zone) or Standard (this"
  err "region only) before routing real patient data through this account:"
  err "  az cognitiveservices account deployment delete -g ${RG} -n ${AOAI_ACCOUNT} --deployment-name <name>"
  err "  az cognitiveservices account deployment create  -g ${RG} -n ${AOAI_ACCOUNT} \\"
  err "    --deployment-name <name> --model-name <model> --model-version <ver> \\"
  err "    --model-format OpenAI --sku-name DataZoneStandard --sku-capacity <cap>"
  err ""
  if [ "${STRICT_RESIDENCY:-false}" = "true" ]; then
    err "STRICT_RESIDENCY=true — refusing to continue."
    exit 1
  fi
fi

# ── 3. Create embedding deployment if missing ────────────────────────────────
if az cognitiveservices account deployment show \
     --resource-group "$RG" --name "$AOAI_ACCOUNT" \
     --deployment-name "$EMBED_DEPLOYMENT" -o none 2>/dev/null; then
  ok "Embedding deployment already present: ${EMBED_DEPLOYMENT}"
else
  log "Creating embedding deployment ${EMBED_DEPLOYMENT} (${EMBED_MODEL_NAME} v${EMBED_MODEL_VERSION}, ${EMBED_SKU})..."
  if az cognitiveservices account deployment create \
      --resource-group "$RG" --name "$AOAI_ACCOUNT" \
      --deployment-name "$EMBED_DEPLOYMENT" \
      --model-name "$EMBED_MODEL_NAME" \
      --model-version "$EMBED_MODEL_VERSION" \
      --model-format OpenAI \
      --sku-name "$EMBED_SKU" --sku-capacity "$EMBED_CAPACITY" \
      -o none 2>/dev/null; then
    ok "Embedding deployment created: ${EMBED_DEPLOYMENT} (${EMBED_SKU})"
  else
    # Not every model is offered on every SKU in every region. Fall back to the
    # regional SKU, which still keeps inference in ${LOCATION} — never silently
    # to a Global one.
    log "${EMBED_SKU} unavailable for ${EMBED_MODEL_NAME} in ${LOCATION}; trying ${EMBED_SKU_FALLBACK}..."
    az cognitiveservices account deployment create \
      --resource-group "$RG" --name "$AOAI_ACCOUNT" \
      --deployment-name "$EMBED_DEPLOYMENT" \
      --model-name "$EMBED_MODEL_NAME" \
      --model-version "$EMBED_MODEL_VERSION" \
      --model-format OpenAI \
      --sku-name "$EMBED_SKU_FALLBACK" --sku-capacity "$EMBED_CAPACITY" \
      -o none
    ok "Embedding deployment created: ${EMBED_DEPLOYMENT} (${EMBED_SKU_FALLBACK}, region-pinned)"
  fi
fi

# ── 4. Fetch the account key (secret) ────────────────────────────────────────
AOAI_KEY=$(az cognitiveservices account keys list \
  --resource-group "$RG" --name "$AOAI_ACCOUNT" \
  --query "key1" -o tsv)
if [ -z "$AOAI_KEY" ] || [ "$AOAI_KEY" = "null" ]; then
  err "Could not read Azure OpenAI account key."
  exit 1
fi
ok "Fetched Azure OpenAI API key"

# ── 5. Upsert the ACA secret + env vars on mvhd-neo4j-proxy ──────────────────
CHAT_URL="${AOAI_ENDPOINT}openai/deployments/${CHAT_DEPLOYMENT}/chat/completions?api-version=${AOAI_API_VERSION}"
EMBED_URL="${AOAI_ENDPOINT}openai/deployments/${EMBED_DEPLOYMENT}/embeddings?api-version=${AOAI_API_VERSION}"

log "Setting secret aoai-key on ${NEO4J_PROXY_APP}..."
az containerapp secret set \
  --name "${NEO4J_PROXY_APP}" --resource-group "$RG" \
  --secrets "aoai-key=${AOAI_KEY}" -o none
ok "Secret aoai-key upserted"

log "Updating ${NEO4J_PROXY_APP} env vars..."
az containerapp update \
  --name "${NEO4J_PROXY_APP}" --resource-group "$RG" \
  --set-env-vars \
    "AZURE_OPENAI_API_KEY=secretref:aoai-key" \
    "AZURE_OPENAI_GPT4O_URL=${CHAT_URL}" \
    "AZURE_OPENAI_EMBEDDINGS_URL=${EMBED_URL}" \
  -o none
ok "${NEO4J_PROXY_APP} updated"

# ── 6. Verification hints ────────────────────────────────────────────────────
cat <<EOF

Verify:
  # Backend status (should show chat=azure-openai, embeddings=azure-openai)
  curl -s https://ehds.mabu.red/api/nlq/backend | jq .

  # Example GraphRAG query (needs GDS + FastRP seed to have run)
  curl -s https://ehds.mabu.red/api/nlq \\
    -H 'Content-Type: application/json' \\
    -d '{"question":"datasets about cardiovascular disease"}' | jq .method
EOF
