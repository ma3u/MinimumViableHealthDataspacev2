# Tests for resource-local.rego (scripts/test-trustee-policies.sh). The
# compose overlay accepts the sample attester, and only an affirming token.
package policy_test

import rego.v1

import data.policy

sample_token(status) := {"submods": {"cpu0": {
	"ear.status": status,
	"ear.veraison.annotated-evidence": {"sample": {"svn": "1", "launch_digest": "abcde"}},
}}}

releases(token, path) if {
	policy.allow with input as token
		with data.plugin as "resource"
		with data["resource-path"] as path
}

test_an_affirming_sample_token_gets_the_key if {
	releases(sample_token("affirming"), ["default", "spe-2", "extract-key"])
}

test_a_warning_token_gets_nothing if {
	not releases(sample_token("warning"), ["default", "spe-2", "extract-key"])
}

test_another_resource_gets_nothing if {
	not releases(sample_token("affirming"), ["default", "spe-2", "other"])
	not releases(sample_token("affirming"), ["default", "x", "extract-key"])
}

test_no_submodule_gets_nothing if {
	not releases({"submods": {}}, ["default", "spe-2", "extract-key"])
}
