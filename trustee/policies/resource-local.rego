# KBS resource policy, compose overlay (M1, "Simulated attestation")
#
# Releases an SPE's extract key, default/spe-<n>/extract-key, only when the
# attestation token is affirming, that is when the evidence met the
# attestation policy and its reference values in RVPS (Trustee's default
# `default_cpu` policy). Locally the evidence comes from the sample attester:
# accepted here, and only here (resource-azure.rego refuses it), and the
# workspace records the result as simulated.
#
# A refusal to try: change a sample reference value, e.g.
#   kbs-client config set-sample-reference-value launch_digest not-the-digest
# The token turns from affirming to warning and this policy refuses the key.
package policy

import rego.v1

default allow := false

spe_extract_key if {
	data.plugin == "resource"
	count(data["resource-path"]) == 3
	data["resource-path"][0] == "default"
	regex.match(`^spe-[0-9]+$`, data["resource-path"][1])
	data["resource-path"][2] == "extract-key"
}

affirming if {
	count(input.submods) > 0
	not any_not_affirming
}

any_not_affirming if {
	some _, submod in input.submods
	submod["ear.status"] != "affirming"
}

allow if {
	spe_extract_key
	affirming
}
