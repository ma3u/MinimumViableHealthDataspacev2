#!/usr/bin/env bash
# Answers one question: does the demo graph carry user-created data?
#
# mvhd-neo4j has TCP ingress with targetPort and exposedPort 7687 and no
# additionalPortMappings, so there is no HTTP endpoint to POST a transactional
# query to, and the ingress is internal, so a GitHub runner has no route to it
# on any port either. reset-demo.yml used to POST to
# https://<fqdn>:7474/db/neo4j/tx/commit and read the answer back as "clean"
# every single time: the exit status of `curl ... | jq ...` is jq's, jq exits 0
# on empty stdin, so the `|| echo "-1"` fallback never fired and the empty
# string fell through every branch into the else (issue #304). The query has to
# run inside the environment.
#
# It runs as a one-shot ACA job on the mvhd-neo4j-seed image, which already
# carries cypher-shell and already reaches Neo4j over Bolt by short app name.
# Not `az containerapp exec`: that needs a TTY and dies headless in CI, which
# 06-post-deploy.sh documents.
#
# ── Why the query throws instead of returning a number ──────────────────────
#
# The verdict has to travel in the job's exit code. Log ingestion lags by a
# minute or more, and a check that waits on logs is a check that times out and
# guesses, which is the failure this issue is about.
#
# `az containerapp job create --args` cannot express `bash -c <script>`: --args
# is argparse nargs='+', it refuses any value starting with a dash, and the
# call dies with "unrecognized arguments: -c". So the container runs
# cypher-shell directly, with one positional argument and no flags, taking its
# connection from NEO4J_ADDRESS / NEO4J_USERNAME / NEO4J_PASSWORD.
#
# That leaves the count with no way out except the query's own success. So the
# query throws when the graph is dirty, via apoc.util.validate. Then:
#
#   query returns          exit 0        Succeeded   clean
#   apoc.util.validate     exit non-0    Failed      dirty, count in the message
#   cannot reach Neo4j     exit non-0    Failed      unknown, treated as dirty
#   APOC missing           exit non-0    Failed      unknown, treated as dirty
#
# Every unclear case lands on "dirty", which is fail-closed: the same bias the
# original code intended and never achieved. APOC is present on mvhd-neo4j
# (NEO4J_PLUGINS=["apoc","apoc-extended","graph-data-science"]); if it were
# ever removed, this reports dirty rather than clean, which is the safe way to
# be wrong.
#
# This script's own exit codes:
#
#   0  clean
#   1  dirty, or the answer could not be established
#
# It prints `dirty_count=` and `reason=` on stdout for a caller to parse. The
# job's logs are read afterwards, best effort and never load-bearing, only to
# turn "not clean" into a number for the summary.
#
#   ./scripts/azure/neo4j-dirty-check.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=env.sh
source ./env.sh

JOB="mvhd-neo4j-dirty-check"
IMAGE="${ACR_LOGIN_SERVER}/mvhd-neo4j-seed:latest"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300}"

# dirty_count is the number when it is known and `unknown` when it is not.
# Callers branch on the exit code, never on the number.
verdict() {
  local code="$1" count="$2" reason="$3"
  echo "dirty_count=${count}"
  echo "reason=${reason}"
  exit "${code}"
}

# The predicate the HTTP version carried, with one correction: `exists(prop)`
# was removed in Neo4j 5 and is spelled `IS NULL` / `IS NOT NULL` now, so the
# old query would have errored had it ever reached a server.
CYPHER="MATCH (n) WHERE n.source = 'local-registry' OR (n:OdrlPolicy AND n.createdAt IS NOT NULL AND n.isSeed IS NULL) WITH count(n) AS dirty CALL apoc.util.validate(dirty > 0, 'dirty_count=%d', [dirty]) RETURN dirty AS dirty_count"

ENV_VARS=(
  "NEO4J_ADDRESS=bolt://${NEO4J_APP}:7687"
  "NEO4J_USERNAME=${NEO4J_USER}"
  "NEO4J_PASSWORD=${NEO4J_PASSWORD}"
)

if az containerapp job show --name "$JOB" --resource-group "$RG" -o none 2>/dev/null; then
  # Updated every run, so the query in this file is the query that runs and
  # not whatever the job happened to be created with months ago.
  az containerapp job update \
    --name "$JOB" --resource-group "$RG" \
    --image "$IMAGE" \
    --command "/usr/local/bin/cypher-shell" --args "$CYPHER" \
    --set-env-vars "${ENV_VARS[@]}" \
    -o none
else
  ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
  # --replica-retry-limit 0 is not optional: `job create` rejects the call
  # without it (#205, PR #305). A retry would be wrong here in any case,
  # because a non-zero exit is the answer, not something to try again.
  az containerapp job create \
    --name "$JOB" --resource-group "$RG" --environment "$ACA_ENV" \
    --image "$IMAGE" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --cpu 0.25 --memory 0.5Gi \
    --trigger-type Manual --replica-timeout 300 --replica-retry-limit 0 \
    --command "/usr/local/bin/cypher-shell" --args "$CYPHER" \
    --env-vars "${ENV_VARS[@]}" \
    -o none
fi

EXECUTION=$(az containerapp job start --name "$JOB" --resource-group "$RG" \
  --query name -o tsv 2>/dev/null || echo "")
if [ -z "$EXECUTION" ]; then
  verdict 1 unknown "Could not start ${JOB}, so the graph was not inspected"
fi
echo "execution=${EXECUTION}" >&2

STATUS=""
DEADLINE=$((SECONDS + TIMEOUT_SECONDS))
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  STATUS=$(az containerapp job execution show --name "$JOB" --resource-group "$RG" \
    --job-execution-name "$EXECUTION" --query "properties.status" -o tsv 2>/dev/null || echo "")
  case "$STATUS" in
    Succeeded | Failed) break ;;
  esac
  sleep 5
done

if [ "$STATUS" = "Succeeded" ]; then
  verdict 0 0 "Graph is clean, no user-created nodes"
fi

if [ "$STATUS" != "Failed" ]; then
  verdict 1 unknown "${JOB} did not finish within ${TIMEOUT_SECONDS}s (last status: ${STATUS:-none}), assuming dirty"
fi

# Failed means either "found nodes" or "could not ask", and only the logs tell
# them apart. Nothing below changes the verdict, which the exit code already
# fixed; this only fills in the number.
COUNT=""
LOGS=$(az containerapp job logs show --name "$JOB" --resource-group "$RG" \
  --container "$JOB" --execution "$EXECUTION" --tail 100 --format text 2>/dev/null || echo "")
if [ -n "$LOGS" ]; then
  COUNT=$(printf '%s' "$LOGS" | sed -n 's/.*dirty_count=\([0-9][0-9]*\).*/\1/p' | head -1)
fi

if [ -n "$COUNT" ]; then
  verdict 1 "$COUNT" "Found ${COUNT} user-created nodes in Neo4j"
fi
verdict 1 unknown "${JOB} failed and the count could not be read back, so Neo4j was either unreachable or the query errored. Assuming dirty."
