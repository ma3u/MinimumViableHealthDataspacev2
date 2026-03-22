#!/usr/bin/env bash
# Auto-generate .env.local from .env.example if it doesn't exist.
# Called by npm postinstall — no manual step required.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UI_DIR="$(dirname "$SCRIPT_DIR")"
ENV_LOCAL="$UI_DIR/.env.local"
ENV_EXAMPLE="$UI_DIR/.env.example"

# Skip in CI — CI sets its own env vars
if [[ "${CI:-}" == "true" ]]; then
  exit 0
fi

# Skip if .env.local already exists
if [[ -f "$ENV_LOCAL" ]]; then
  exit 0
fi

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "⚠  .env.example not found — skipping .env.local generation"
  exit 0
fi

# Generate a random 32-char secret for NextAuth
if command -v openssl &>/dev/null; then
  SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
else
  SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)
fi

# Copy template and replace the placeholder secret
sed "s|<generate-a-random-32-char-secret>|${SECRET}|g" "$ENV_EXAMPLE" > "$ENV_LOCAL"

echo "✓ Created ui/.env.local from .env.example (NEXTAUTH_SECRET auto-generated)"
