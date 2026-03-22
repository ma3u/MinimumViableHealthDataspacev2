#!/bin/bash
# =============================================================================
# provision-keycloak-sso.sh — Phase 2c: Keycloak SSO provisioning
# =============================================================================
# Adds the health-dataspace-ui client, SSO roles, and demo users to the
# existing 'edcv' realm via Keycloak Admin REST API.
# Idempotent: safe to run multiple times.
# =============================================================================
set -euo pipefail

KC_HOST="${KC_HOST:-http://localhost:8080}"
REALM="edcv"

echo "=== Phase 2c: Keycloak SSO Provisioning ==="
echo "Keycloak: $KC_HOST  Realm: $REALM"

# --- Get admin token ---
echo ""
echo "1) Getting admin token..."
KC_TOKEN=$(curl -sf -X POST "$KC_HOST/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&username=admin&password=admin&client_id=admin-cli" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

if [ -z "$KC_TOKEN" ]; then
  echo "  ✗ Failed to get admin token"; exit 1
fi
echo "  ✓ Got admin token"

AUTH="Authorization: Bearer $KC_TOKEN"
CT="Content-Type: application/json"

# --- Add realm roles ---
echo ""
echo "2) Adding SSO realm roles..."
for ROLE_NAME in EDC_ADMIN EDC_USER_PARTICIPANT HDAB_AUTHORITY; do
  case "$ROLE_NAME" in
    EDC_ADMIN) DESC="Dataspace operator – full admin access to all portals and EDC management APIs" ;;
    EDC_USER_PARTICIPANT) DESC="Clinic / CRO / Pharma participant – can browse catalog, negotiate contracts, transfer data" ;;
    HDAB_AUTHORITY) DESC="Health Data Access Body regulator – access to compliance dashboards and audit logs" ;;
  esac

  HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" -X POST "$KC_HOST/admin/realms/$REALM/roles" \
    -H "$AUTH" -H "$CT" \
    -d "{\"name\":\"$ROLE_NAME\",\"description\":\"$DESC\"}")

  if [ "$HTTP_CODE" = "201" ]; then
    echo "  ✓ Created role: $ROLE_NAME"
  elif [ "$HTTP_CODE" = "409" ]; then
    echo "  · Role already exists: $ROLE_NAME"
  else
    echo "  ✗ Failed to create role $ROLE_NAME (HTTP $HTTP_CODE)"
  fi
done

# --- Create health-dataspace-ui client ---
echo ""
echo "3) Creating health-dataspace-ui client (PKCE + confidential)..."

CLIENT_PAYLOAD='{
  "clientId": "health-dataspace-ui",
  "name": "Health Dataspace UI",
  "description": "Next.js UI client with PKCE authorization code flow for browser-based SSO",
  "enabled": true,
  "protocol": "openid-connect",
  "publicClient": false,
  "serviceAccountsEnabled": false,
  "secret": "health-dataspace-ui-secret",
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": false,
  "fullScopeAllowed": true,
  "redirectUris": [
    "http://localhost:3000/api/auth/callback/keycloak",
    "http://localhost:3000/*",
    "http://localhost:3003/api/auth/callback/keycloak",
    "http://localhost:3003/*"
  ],
  "webOrigins": [
    "http://localhost:3000",
    "http://localhost:3003",
    "+"
  ],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "http://localhost:3000/*##http://localhost:3003/*"
  },
  "defaultClientScopes": ["openid", "profile", "email"],
  "protocolMappers": [
    {
      "name": "realm-roles",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-realm-role-mapper",
      "consentRequired": false,
      "config": {
        "claim.name": "realm_access.roles",
        "multivalued": "true",
        "jsonType.label": "String",
        "access.token.claim": "true",
        "id.token.claim": "true",
        "userinfo.token.claim": "true"
      }
    }
  ]
}'

HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" -X POST "$KC_HOST/admin/realms/$REALM/clients" \
  -H "$AUTH" -H "$CT" -d "$CLIENT_PAYLOAD")

if [ "$HTTP_CODE" = "201" ]; then
  echo "  ✓ Created client: health-dataspace-ui"
elif [ "$HTTP_CODE" = "409" ]; then
  echo "  · Client already exists: health-dataspace-ui"
else
  echo "  ✗ Failed to create client (HTTP $HTTP_CODE)"
fi

# --- Create demo users ---
echo ""
echo "4) Creating demo users..."

create_user() {
  local USERNAME="$1" EMAIL="$2" FIRST="$3" LAST="$4" PASSWORD="$5" ROLE="$6"

  USER_PAYLOAD="{
    \"username\": \"$USERNAME\",
    \"enabled\": true,
    \"email\": \"$EMAIL\",
    \"firstName\": \"$FIRST\",
    \"lastName\": \"$LAST\",
    \"credentials\": [{\"type\": \"password\", \"value\": \"$PASSWORD\", \"temporary\": false}]
  }"

  HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" -X POST "$KC_HOST/admin/realms/$REALM/users" \
    -H "$AUTH" -H "$CT" -d "$USER_PAYLOAD")

  if [ "$HTTP_CODE" = "201" ]; then
    echo "  ✓ Created user: $USERNAME"
  elif [ "$HTTP_CODE" = "409" ]; then
    echo "  · User already exists: $USERNAME"
  else
    echo "  ✗ Failed to create user $USERNAME (HTTP $HTTP_CODE)"
    return
  fi

  # Assign role
  USER_ID=$(curl -sf "$KC_HOST/admin/realms/$REALM/users?username=$USERNAME&exact=true" \
    -H "$AUTH" | python3 -c "import sys,json; users=json.load(sys.stdin); print(users[0]['id'] if users else '')")

  if [ -z "$USER_ID" ]; then
    echo "  ✗ Could not find user ID for $USERNAME"
    return
  fi

  ROLE_ID=$(curl -sf "$KC_HOST/admin/realms/$REALM/roles/$ROLE" \
    -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

  if [ -z "$ROLE_ID" ]; then
    echo "  ✗ Could not find role ID for $ROLE"
    return
  fi

  HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" -X POST \
    "$KC_HOST/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
    -H "$AUTH" -H "$CT" \
    -d "[{\"id\":\"$ROLE_ID\",\"name\":\"$ROLE\"}]")

  if [ "$HTTP_CODE" = "204" ]; then
    echo "  ✓ Assigned role $ROLE to $USERNAME"
  else
    echo "  ✗ Failed to assign role $ROLE to $USERNAME (HTTP $HTTP_CODE)"
  fi
}

create_user "edcadmin"   "admin@health-dataspace.local"     "EDC"    "Admin"     "admin"     "EDC_ADMIN"
create_user "clinicuser" "clinic@health-dataspace.local"    "Clinic" "User"      "clinic"    "EDC_USER_PARTICIPANT"
create_user "regulator"  "regulator@health-dataspace.local" "HDAB"   "Authority" "regulator" "HDAB_AUTHORITY"

# --- Summary ---
echo ""
echo "=== Provisioning complete ==="
echo ""
echo "Demo accounts (password = username):"
echo "  edcadmin   / admin     → EDC_ADMIN"
echo "  clinicuser / clinic    → EDC_USER_PARTICIPANT"
echo "  regulator  / regulator → HDAB_AUTHORITY"
echo ""
echo "Keycloak Admin:  $KC_HOST/admin/master/console/"
echo "OIDC Discovery:  $KC_HOST/realms/$REALM/.well-known/openid-configuration"
