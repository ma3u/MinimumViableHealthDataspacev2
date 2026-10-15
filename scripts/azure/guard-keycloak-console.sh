#!/bin/bash
# Keeps the Keycloak admin console off the internet (security test report
# 2026-10-15, finding F10) while the admin REST API under /admin/realms/,
# which the hub's app-account creation and the provisioning scripts use with
# a bearer token, stays reachable.
#
# Container Apps ingress has no path rules and Keycloak's hostname-admin
# option does not block the console on the public hostname (its own docs
# say to do it at the reverse proxy), so a Caddy sidecar sits in front of
# Keycloak inside the same app: the ingress targets Caddy on 8081, Caddy
# answers 403 for the console paths and proxies everything else to
# Keycloak on 8080 over localhost, keeping the X-Forwarded-* headers the
# ingress sets (trusted_proxies), so Keycloak keeps building https URLs.
#
#   scripts/azure/guard-keycloak-console.sh            # apply (Keycloak restarts)
#   scripts/azure/guard-keycloak-console.sh --check    # only test the public hostname
#   scripts/azure/guard-keycloak-console.sh --rollback <backup.json>
#
# The previous app definition is written to ~/.mvhd/keycloak-rollback/ first.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RG="${RESOURCE_GROUP:-rg-mvhd-dev}"
APP="${KEYCLOAK_APP:-mvhd-keycloak}"
HOST="${KEYCLOAK_PUBLIC_HOSTNAME:-auth.ehds.mabu.red}"
CADDY_IMAGE="${CADDY_IMAGE:-docker.io/library/caddy:2.9.1}"
GUARD_PORT=8081

check() {
  local rc=0 code
  code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "https://${HOST}/realms/edcv/.well-known/openid-configuration")
  [ "$code" = 200 ] && echo "ok    discovery 200" || { echo "FAIL  discovery $code"; rc=1; }
  for p in /admin /admin/ /admin/master/console/ /admin/edcv/console/; do
    code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "https://${HOST}${p}")
    [ "$code" = 403 ] && echo "ok    $p 403" || { echo "FAIL  $p $code (wanted 403)"; rc=1; }
  done
  code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "https://${HOST}/admin/realms/edcv")
  [ "$code" = 401 ] && echo "ok    admin REST without a token 401 (reachable, protected)" || { echo "FAIL  admin REST $code (wanted 401)"; rc=1; }
  code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -X POST -d 'grant_type=client_credentials' "https://${HOST}/realms/edcv/protocol/openid-connect/token")
  [[ "$code" =~ ^40[01]$ ]] && echo "ok    token endpoint answers ($code)" || { echo "FAIL  token endpoint $code"; rc=1; }
  return $rc
}

if [ "${1:-}" = "--check" ]; then check; exit $?; fi

if [ "${1:-}" = "--rollback" ]; then
  [ -f "${2:-}" ] || { echo "usage: $0 --rollback <backup.json>" >&2; exit 2; }
  python3 - "$APP" "$RG" "$2" <<'PY'
import json, subprocess, sys, tempfile, os
app, rg, path = sys.argv[1:4]
doc = json.load(open(path))
for k in ("latestRevisionName", "latestReadyRevisionName", "latestRevisionFqdn",
          "outboundIpAddresses", "eventStreamEndpoint", "runningStatus", "provisioningState"):
    doc["properties"].pop(k, None)
doc["properties"]["configuration"].pop("secrets", None)
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump(doc, f)
subprocess.check_call(["az", "containerapp", "update", "-n", app, "-g", rg, "--yaml", f.name, "-o", "none"])
os.unlink(f.name)
print("rolled back to", path)
PY
  exit 0
fi

CADDYFILE=$(cat <<CADDY
{
	admin off
	auto_https off
}
:${GUARD_PORT} {
	@console path /admin /admin/ /admin/*/console /admin/*/console/*
	respond @console 403
	reverse_proxy 127.0.0.1:8080 {
		trusted_proxies private_ranges
	}
}
CADDY
)

BACKUP_DIR="${HOME}/.mvhd/keycloak-rollback"
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"

echo "Storing the Caddyfile as the app secret 'caddyfile'"
az containerapp secret set -n "$APP" -g "$RG" --secrets "caddyfile=$CADDYFILE" -o none

echo "Adding the console-guard sidecar and pointing the ingress at it (Keycloak restarts)"
python3 - "$APP" "$RG" "$CADDY_IMAGE" "$GUARD_PORT" "$BACKUP_DIR" <<'PY'
import json, os, subprocess, sys, tempfile, time
app, rg, image, port, backup_dir = sys.argv[1:6]
port = int(port)
doc = json.loads(subprocess.check_output(["az", "containerapp", "show", "-n", app, "-g", rg, "-o", "json"]))
backup = os.path.join(backup_dir, time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + ".json")
with open(os.open(backup, os.O_WRONLY | os.O_CREAT, 0o600), "w") as f:
    json.dump(doc, f)
tpl = doc["properties"]["template"]
tpl["volumes"] = [v for v in (tpl.get("volumes") or []) if v.get("name") != "caddy-config"]
tpl["volumes"].append({"name": "caddy-config", "storageType": "Secret",
                       "secrets": [{"secretRef": "caddyfile", "path": "Caddyfile"}]})
tpl["containers"] = [c for c in tpl["containers"] if c.get("name") != "console-guard"]
tpl["containers"].append({
    "name": "console-guard",
    "image": image,
    "command": ["caddy"],
    "args": ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"],
    "resources": {"cpu": 0.25, "memory": "0.5Gi"},
    "volumeMounts": [{"volumeName": "caddy-config", "mountPath": "/etc/caddy"}],
})
doc["properties"]["configuration"]["ingress"]["targetPort"] = port
doc["properties"]["configuration"].pop("secrets", None)
for k in ("latestRevisionName", "latestReadyRevisionName", "latestRevisionFqdn",
          "outboundIpAddresses", "eventStreamEndpoint", "runningStatus", "provisioningState"):
    doc["properties"].pop(k, None)
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump(doc, f)
subprocess.check_call(["az", "containerapp", "update", "-n", app, "-g", rg, "--yaml", f.name, "-o", "none"])
os.unlink(f.name)
print(f"previous definition: {backup}")
PY

status=$(az containerapp show -n "$APP" -g "$RG" --query properties.runningStatus -o tsv)
if [ "$status" != "Running" ]; then
  echo "$APP is $status: the new revision takes effect at the next start; run '$0 --check' then"
  exit 0
fi
echo "Waiting for Keycloak behind the guard"
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "https://${HOST}/realms/edcv/.well-known/openid-configuration")" = 200 ] && break
  sleep 10
done
"${SCRIPT_DIR}/retire-stale-revisions.sh" --when-healthy "$APP" || echo "warning: a stale $APP revision is still active" >&2
check
