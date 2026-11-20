#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# Phase 22: mvhd-matchbox, the FHIR validator behind the proxy's $validate (ADR-097)
# =============================================================================
#   22-matchbox.sh                 create or update mvhd-matchbox, then point
#                                  mvhd-neo4j-proxy at it (idempotent)
#   22-matchbox.sh --unwire-proxy  take MATCHBOX_URL off the proxy again:
#                                  $validate answers 503, the app stays
#   22-matchbox.sh --check         report, change nothing
#
# Decided in ADR-097 (discussion #1169, #1174, #1173):
#   - Matchbox v4.1.21 with the IG packages baked into the image
#     (services/matchbox): a start fetches nothing from packages.fhir.org;
#   - internal ingress only. The proxy reaches it as
#     http://mvhd-matchbox/matchboxv3/fhir; nothing outside the environment does;
#   - 2 vCPU and 4 GiB, one replica: Matchbox holds about 2.7 GB once an
#     engine is built, and the Consumption profile pairs 4 GiB with 2 vCPU;
#   - stopped off hours with everything else (ADR-053): offhours.sh starts it
#     before the proxy and stops it after.
#
# The image is mvhd-matchbox:<tree>, <tree> the git tree hash of
# services/matchbox at HEAD, so it changes exactly when the Dockerfile, the
# bake script or the generated application.yaml change. deploy-azure.yml
# builds and pushes it on the merge that changes it, and moves an existing app
# to it; this script only uses an image that is already in the registry.
#
# Needs: the registry credentials (the CI identity; the maintainer's Container
# Apps Contributor cannot read them), so run it through the workflow
# matchbox.yml. Never prints a secret.
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=scripts/azure/env.sh
source "$SCRIPT_DIR/env.sh"

MODE="${1:-apply}"
APP="$MATCHBOX_APP"
TAG="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD:services/matchbox)"
IMAGE="${ACR_LOGIN_SERVER}/mvhd-matchbox:${TAG}"
# The proxy's address for it: the short app name, HTTP, port 80 to 8080.
URL="http://${APP}/matchboxv3/fhir"

app_exists() { az containerapp show --name "$APP" --resource-group "$RG" --query name -o tsv >/dev/null 2>&1; }
proxy_url() {
  az containerapp show --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --query "properties.template.containers[0].env[?name=='MATCHBOX_URL'].value | [0]" -o tsv 2>/dev/null || true
}
image_in_acr() {
  az acr repository show-tags --name "$ACR_NAME" --repository mvhd-matchbox -o tsv 2>/dev/null | grep -qx "$TAG"
}

report() {
  echo "  image    ${IMAGE} $(image_in_acr && echo 'in ACR' || echo 'NOT in ACR')"
  if app_exists; then
    az containerapp show --name "$APP" --resource-group "$RG" --query "{image:properties.template.containers[0].image, \
      running:properties.runningStatus, revision:properties.latestRevisionName, \
      external:properties.configuration.ingress.external, cpu:properties.template.containers[0].resources.cpu, \
      memory:properties.template.containers[0].resources.memory}" -o json
  else
    echo "  MISSING  app ${APP}"
  fi
  echo "  proxy    MATCHBOX_URL=$(proxy_url)"
}

wire_proxy() {
  log "Pointing ${NEO4J_PROXY_APP} at ${URL}"
  # --set-env-vars merges, so the proxy's other settings stay.
  az containerapp update --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
    --set-env-vars "MATCHBOX_URL=${URL}" -o none
  "${SCRIPT_DIR}/retire-stale-revisions.sh" --when-healthy "$NEO4J_PROXY_APP" ||
    warn "a stale ${NEO4J_PROXY_APP} revision is still active"
  ok "${NEO4J_PROXY_APP}: \$validate goes to ${APP}"
}

case "$MODE" in
  --check) report; exit 0 ;;
  --unwire-proxy)
    az containerapp update --name "$NEO4J_PROXY_APP" --resource-group "$RG" \
      --remove-env-vars MATCHBOX_URL -o none
    ok "${NEO4J_PROXY_APP}: no MATCHBOX_URL, \$validate answers 503"
    exit 0 ;;
  apply) ;;
  *) sed -n '3,10p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac

# ── 1. The image ────────────────────────────────────────────────────────────
if ! image_in_acr; then
  err "${IMAGE} is not in ${ACR_NAME}. deploy-azure.yml builds it on the merge that changes"
  err "services/matchbox; or build it once with the workflow's own command:"
  err "  docker buildx build --platform linux/amd64 -t ${IMAGE} --push services/matchbox"
  exit 1
fi
ok "${IMAGE} in ACR"

# ── 2. The app ──────────────────────────────────────────────────────────────
ENV_ID="$(az containerapp env show --name "$ACA_ENV" --resource-group "$RG" --query id -o tsv)"
ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"
SPEC="$(mktemp)"
trap 'rm -f "$SPEC"' EXIT
chmod 600 "$SPEC"
# Probes on Spring's actuator. The startup probe gives the first start up to
# 30 + 10 x 30 s; with the packages baked in it is up in about a minute.
# allowInsecure: internal ingress only, and the proxy POSTs over plain HTTP
# inside the environment; a redirect to HTTPS would turn that POST into a GET.
cat >"$SPEC" <<YAML
location: ${LOCATION}
tags: {project: mvhd, adr: ADR-097}
properties:
  environmentId: ${ENV_ID}
  configuration:
    activeRevisionsMode: Single
    ingress:
      external: false
      targetPort: 8080
      transport: http
      allowInsecure: true
    registries:
      - server: ${ACR_LOGIN_SERVER}
        username: ${ACR_NAME}
        passwordSecretRef: acr-password
    secrets:
      - name: acr-password
        value: ${ACR_PASSWORD}
  template:
    scale: {minReplicas: 1, maxReplicas: 1}
    containers:
      - name: matchbox
        image: ${IMAGE}
        resources: {cpu: ${MATCHBOX_CPU}, memory: ${MATCHBOX_MEMORY}}
        probes:
          - type: Startup
            httpGet: {path: /matchboxv3/actuator/health, port: 8080}
            initialDelaySeconds: 30
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 10
          - type: Readiness
            httpGet: {path: /matchboxv3/actuator/health/readiness, port: 8080}
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 3
          - type: Liveness
            httpGet: {path: /matchboxv3/actuator/health/liveness, port: 8080}
            periodSeconds: 60
            timeoutSeconds: 10
            failureThreshold: 3
YAML
unset ACR_PASSWORD

if app_exists; then
  log "updating ${APP}"
  az containerapp update --name "$APP" --resource-group "$RG" --yaml "$SPEC" -o none
else
  log "creating ${APP}"
  az containerapp create --name "$APP" --resource-group "$RG" --yaml "$SPEC" -o none
fi
ok "${APP} applied: ${MATCHBOX_CPU} vCPU, ${MATCHBOX_MEMORY}, internal"

# ── 3. Healthy before the proxy is pointed at it ────────────────────────────
for _ in $(seq 1 40); do
  health="$(az containerapp revision list --name "$APP" --resource-group "$RG" \
    --query "[?properties.active] | [0].properties.healthState" -o tsv 2>/dev/null || true)"
  [ "$health" = Healthy ] && break
  sleep 15
done
if [ "${health:-}" != Healthy ]; then
  err "${APP} is '${health:-unknown}' after 10 minutes; the proxy is left as it was"
  report
  exit 1
fi
ok "${APP} Healthy"

# ── 4. The proxy ────────────────────────────────────────────────────────────
if [ "$(proxy_url)" = "$URL" ]; then
  ok "${NEO4J_PROXY_APP} already points at ${URL}"
else
  wire_proxy
fi
report
