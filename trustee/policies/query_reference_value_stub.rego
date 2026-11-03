# Test-only stand-in for Trustee's `query_reference_value` extension, so that
# `opa test` can evaluate attestation-ear-cpu.rego (scripts/
# test-trustee-policies.sh copies it beside the policy). Never set in Trustee:
# there the attestation service registers the real one, which asks RVPS and
# answers null for an id it does not hold (Trustee v0.22.0,
# attestation-service/src/ear_token/broker.rs). The tests bind the store
# with `with data.reference_values as {...}`.
package policy

import rego.v1

query_reference_value(id) := object.get(data.reference_values, id, null)
