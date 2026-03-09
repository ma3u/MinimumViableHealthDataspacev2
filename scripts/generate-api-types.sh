#!/usr/bin/env bash
# =============================================================================
# Generate TypeScript types from JAD OpenAPI specifications
# =============================================================================
# Generates type-safe API clients for all EDC-V and CFM OpenAPI specs.
#
# Usage:
#   cd ui && npm run generate:api
#
# Prerequisites:
#   npm install -D openapi-typescript
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENAPI_DIR="$PROJECT_DIR/jad/openapi"
OUTPUT_DIR="$PROJECT_DIR/ui/src/lib/edc"

echo "🔧 Generating TypeScript types from JAD OpenAPI specs..."

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Generate types for each API spec
SPECS=(
  "management-api:management"
  "identity-api:identity"
  "issuer-admin-api:issuer"
  "tenant-manager:tenant"
  "provision-manager:provision"
)

for spec_pair in "${SPECS[@]}"; do
  IFS=':' read -r spec_file output_name <<< "$spec_pair"
  echo "  → ${spec_file}.yaml → ${output_name}.d.ts"
  npx openapi-typescript "$OPENAPI_DIR/${spec_file}.yaml" \
    --output "$OUTPUT_DIR/${output_name}.d.ts" \
    --immutable
done

echo "✅ TypeScript types generated in ui/src/lib/edc/"
echo "   Files:"
ls -1 "$OUTPUT_DIR"/*.d.ts 2>/dev/null | while read -r f; do
  echo "     $(basename "$f")"
done
