#!/usr/bin/env bash
set -euo pipefail
# =============================================================================
# `opa test` for Trustee's resource policies (ADR-068, ADR-069, #774)
# =============================================================================
#   scripts/test-trustee-policies.sh
#
# Each policy is `package policy`, so each is tested on its own: the policy
# (the Azure template copied as .rego, its permit_policy_hash still empty;
# the tests bind hashes with `with`) and its *_test.rego, in a scratch
# directory. Uses a local `opa` when there is one, else the pinned image.
# Exits non-zero when a test fails or none ran.
# =============================================================================
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POLICIES="${ROOT}/trustee/policies"
OPA_IMAGE="openpolicyagent/opa:1.10.1@sha256:4715d0574ca2f8c5ecd65b4e5b0833a53aea0f79c31e52a93972b104bbd614fd"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

opa_test() {  # opa_test <dir>
  if command -v opa >/dev/null 2>&1; then
    opa test -v "$1"
  else
    docker run --rm -v "$1:/p:ro" "$OPA_IMAGE" test -v /p
  fi
}

run() {  # run <name> <policy file> <test file>
  local dir="${WORK}/$1" out
  mkdir -p "$dir"
  cp "$2" "${dir}/policy.rego"
  cp "$3" "${dir}/policy_test.rego"
  out="$(opa_test "$dir")" || { echo "$out"; echo "FAIL: $1"; exit 1; }
  echo "$out"
  grep -q "^PASS: [1-9]" <<<"$out" || { echo "FAIL: $1 ran no test"; exit 1; }
}

run azure "${POLICIES}/resource-azure.rego.tmpl" "${POLICIES}/resource_azure_test.rego"
run local "${POLICIES}/resource-local.rego" "${POLICIES}/resource_local_test.rego"
echo "Trustee resource policies: all tests pass"
