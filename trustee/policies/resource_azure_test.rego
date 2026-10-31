# Tests for resource-azure.rego.tmpl (scripts/test-trustee-policies.sh runs
# them with `opa test`). The input is shaped as Trustee v0.22.0's EAR token
# claims for SEV-SNP evidence: the report's claims under `snp`, HOST_DATA as
# `init_data` beside them.
package policy_test

import rego.v1

import data.policy

spe1_hash := "1111111111111111111111111111111111111111111111111111111111111111"

spe2_hash := "2222222222222222222222222222222222222222222222222222222222222222"

bound := {"spe-1": spe1_hash, "spe-2": spe2_hash}

key_path(n) := ["default", sprintf("spe-%d", [n]), "extract-key"]

snp_token(host_data, status, executables) := {"submods": {"cpu0": {
	"ear.status": status,
	"ear.trustworthiness-vector": {"executables": executables, "hardware": 2, "configuration": 2},
	"ear.veraison.annotated-evidence": {
		"init_data": host_data,
		"report_data": "00",
		"snp": {"measurement": "ab", "reported_tcb_snp": 8},
	},
}}}

releases(token, path) if {
	policy.allow with input as token
		with data.plugin as "resource"
		with data["resource-path"] as path
		with data.policy.permit_policy_hash as bound
}

test_the_permits_workload_gets_its_key if {
	releases(snp_token(spe1_hash, "affirming", 3), key_path(1))
}

test_host_data_in_upper_case_hex_is_the_same_hash if {
	releases(snp_token(upper(spe1_hash), "affirming", 3), key_path(1))
}

test_another_workload_gets_nothing if {
	not releases(snp_token(spe2_hash, "affirming", 3), key_path(1))
}

test_spe1_cannot_have_spe2s_key if {
	not releases(snp_token(spe1_hash, "affirming", 3), key_path(2))
}

test_sample_evidence_gets_nothing if {
	token := {"submods": {"cpu0": {
		"ear.status": "affirming",
		"ear.trustworthiness-vector": {"executables": 3},
		"ear.veraison.annotated-evidence": {"init_data": spe1_hash, "sample": {"svn": "1"}},
	}}}
	not releases(token, key_path(1))
}

test_sample_beside_snp_gets_nothing if {
	token := {"submods": {
		"cpu0": snp_token(spe1_hash, "affirming", 3).submods.cpu0,
		"cpu1": {
			"ear.status": "affirming",
			"ear.veraison.annotated-evidence": {"sample": {"svn": "1"}},
		},
	}}
	not releases(token, key_path(1))
}

test_a_warning_token_gets_nothing if {
	not releases(snp_token(spe1_hash, "warning", 3), key_path(1))
}

test_a_non_affirming_submodule_gets_nothing if {
	token := {"submods": {
		"cpu0": snp_token(spe1_hash, "affirming", 3).submods.cpu0,
		"gpu0": {"ear.status": "contraindicated", "ear.veraison.annotated-evidence": {}},
	}}
	not releases(token, key_path(1))
}

test_an_unpinned_measurement_gets_nothing if {
	# No snp_launch_measurement in RVPS: Trustee's default policy leaves
	# executables at 33 (and the token at warning; here affirming, to show
	# this rule stands on its own).
	not releases(snp_token(spe1_hash, "affirming", 33), key_path(1))
}

test_another_resource_gets_nothing if {
	not releases(snp_token(spe1_hash, "affirming", 3), ["default", "spe-1", "tls-key"])
	not releases(snp_token(spe1_hash, "affirming", 3), ["other", "spe-1", "extract-key"])
	not releases(snp_token(spe1_hash, "affirming", 3), ["default", "spe-1"])
}

test_an_unbound_spe_gets_nothing if {
	not releases(snp_token(spe1_hash, "affirming", 3), key_path(3))
}

test_nothing_is_released_before_the_permits_are_bound if {
	not policy.allow with input as snp_token(spe1_hash, "affirming", 3)
		with data.plugin as "resource"
		with data["resource-path"] as key_path(1)
}
