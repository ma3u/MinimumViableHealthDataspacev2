#!/usr/bin/env bash
# Deprecated shim. This script was renamed to run-ehds-identity-checks.sh on
# 2026-09-26, because its old name claimed to be a Technology Compatibility
# Kit and it is not one: it drives administrative APIs with curl and never
# acts as a DCP protocol peer. See #338 and discussion #110.
#
# The shim exists so a compliance-runner image built before the rename keeps
# working. Remove it once the Eclipse DCP TCK lands (Phase 1 of #338).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "NOTE: run-dcp-tests.sh is now run-ehds-identity-checks.sh" >&2
exec "$here/run-ehds-identity-checks.sh" "$@"
