# Tests for attestation-ear-cpu.rego (scripts/test-trustee-policies.sh runs
# them with `opa test`, beside query_reference_value_stub.rego, which stands
# in for Trustee's RVPS extension). The input is shaped as Trustee v0.22.0
# hands SEV-SNP claims to the policy (transform_claims in
# attestation-service/src/ear_token/broker.rs): the report's claims under
# `snp`. The numbers are the two TCBs the ACI groups landed on (#833).
package policy_test

import rego.v1

import data.policy

measurement := "aa11"

# What the SPE-1 group reported (bootloader 10, microcode 84, snp 23, tee 0).
snp_claims := {
	"measurement": measurement,
	"reported_tcb_bootloader": 10,
	"reported_tcb_microcode": 84,
	"reported_tcb_snp": 23,
	"reported_tcb_tee": 0,
	"platform_smt_enabled": true,
	"platform_tsme_enabled": false,
	"policy_abi_major": 0,
	"policy_abi_minor": 31,
	"policy_single_socket": false,
	"policy_smt_allowed": true,
	"policy_debug_allowed": false,
	"policy_migrate_ma": false,
}

configuration_values := {
	"snp_smt_enabled": true,
	"snp_tsme_enabled": false,
	"snp_guest_abi_major": 0,
	"snp_guest_abi_minor": 31,
	"snp_single_socket": false,
	"snp_smt_allowed": true,
}

minimums := {
	"snp_bootloader_min": 10,
	"snp_microcode_min": 84,
	"snp_snp_svn_min": 23,
	"snp_tee_svn_min": 0,
}

# The pinned lists of #801/#805: one entry per host seen so far.
lists := {
	"snp_bootloader": [10, 12],
	"snp_microcode": [84, 88],
	"snp_snp_svn": [23, 28],
	"snp_tee_svn": [0],
}

with_minimums := object.union_n([
	{"snp_launch_measurement": [measurement]},
	configuration_values,
	minimums,
])

with_lists := object.union_n([
	{"snp_launch_measurement": [measurement]},
	configuration_values,
	lists,
])

claims_for(snp, rv) := c if {
	c := policy.trust_claims with input as {"snp": snp}
		with data.reference_values as rv
}

hardware_for(snp, rv) := claims_for(snp, rv).hardware

# ── minimums ────────────────────────────────────────────────────────────────

test_a_tcb_at_the_minimum_is_recognised_hardware if {
	hardware_for(snp_claims, with_minimums) == 2
}

test_a_tcb_above_the_minimum_is_recognised_hardware if {
	# The SPE-2 host (12, 88, 28) and a firmware update past both.
	hardware_for(object.union(snp_claims, {
		"reported_tcb_bootloader": 12,
		"reported_tcb_microcode": 88,
		"reported_tcb_snp": 28,
	}), with_minimums) == 2
	hardware_for(object.union(snp_claims, {
		"reported_tcb_bootloader": 14,
		"reported_tcb_microcode": 95,
		"reported_tcb_snp": 31,
		"reported_tcb_tee": 2,
	}), with_minimums) == 2
}

test_each_component_below_its_minimum_is_refused if {
	every component, value in {
		"reported_tcb_bootloader": 9,
		"reported_tcb_microcode": 83,
		"reported_tcb_snp": 22,
	} {
		hardware_for(object.union(snp_claims, {component: value}), with_minimums) == 97
	}
}

test_a_tee_svn_below_a_raised_minimum_is_refused if {
	hardware_for(snp_claims, object.union(with_minimums, {"snp_tee_svn_min": 1})) == 97
}

test_a_minimum_wins_over_a_list_that_lacks_the_value if {
	# The list alone would refuse 14; the minimum accepts it.
	rv := object.union(with_lists, {"snp_bootloader_min": 10})
	hardware_for(object.union(snp_claims, {"reported_tcb_bootloader": 14}), rv) == 2
}

test_a_reported_value_that_is_not_a_number_is_refused if {
	hardware_for(object.union(snp_claims, {"reported_tcb_microcode": "99"}), with_minimums) == 97
}

test_a_minimum_that_is_not_a_number_falls_back_to_the_list if {
	# A string minimum is no minimum: the list decides, here it lacks 14.
	rv := object.union(with_lists, {"snp_bootloader_min": "10"})
	hardware_for(object.union(snp_claims, {"reported_tcb_bootloader": 14}), rv) == 97
	hardware_for(snp_claims, rv) == 2
}

test_a_string_minimum_without_a_list_is_refused if {
	rv := object.union(with_minimums, {"snp_bootloader_min": "10"})
	hardware_for(snp_claims, rv) == 97
}

# ── no minimum: the upstream list ───────────────────────────────────────────

test_without_minimums_a_listed_tcb_is_recognised_hardware if {
	hardware_for(snp_claims, with_lists) == 2
	hardware_for(object.union(snp_claims, {
		"reported_tcb_bootloader": 12,
		"reported_tcb_microcode": 88,
		"reported_tcb_snp": 28,
	}), with_lists) == 2
}

test_without_minimums_an_unlisted_tcb_is_refused_even_when_higher if {
	hardware_for(object.union(snp_claims, {"reported_tcb_snp": 30}), with_lists) == 97
}

test_minimums_and_lists_mix_per_component if {
	# A minimum for the bootloader only; the other three stay lists.
	rv := object.union(with_lists, {"snp_bootloader_min": 10})
	hardware_for(object.union(snp_claims, {"reported_tcb_bootloader": 15}), rv) == 2
	hardware_for(object.union(snp_claims, {
		"reported_tcb_bootloader": 15,
		"reported_tcb_microcode": 90,
	}), rv) == 97
}

test_neither_minimum_nor_list_is_refused if {
	hardware_for(snp_claims, object.union(configuration_values, {"snp_launch_measurement": [measurement]})) == 97
}

# ── the rest stays exact ────────────────────────────────────────────────────

test_the_full_report_is_affirming_in_every_claim if {
	c := claims_for(snp_claims, with_minimums)
	c.executables == 3
	c.hardware == 2
	c.configuration == 2
}

test_another_launch_measurement_is_not_recognised if {
	c := claims_for(object.union(snp_claims, {"measurement": "bb22"}), with_minimums)
	c.executables == 33
	c.hardware == 2
}

test_no_pinned_launch_measurement_is_not_recognised if {
	rv := object.remove(with_minimums, ["snp_launch_measurement"])
	claims_for(snp_claims, rv).executables == 33
}

test_debug_allowed_is_an_unknown_configuration if {
	c := claims_for(object.union(snp_claims, {"policy_debug_allowed": true}), with_minimums)
	c.configuration == 36
}

test_migration_agent_allowed_is_an_unknown_configuration if {
	c := claims_for(object.union(snp_claims, {"policy_migrate_ma": true}), with_minimums)
	c.configuration == 36
}

test_another_abi_is_not_the_approved_configuration if {
	# Exact configuration values still decide between 2 and 3.
	c := claims_for(object.union(snp_claims, {"policy_abi_minor": 30}), with_minimums)
	c.configuration == 3
}

test_the_sample_attester_is_unchanged if {
	c := policy.trust_claims with input as {"sample": {
		"svn": "1",
		"launch_digest": "abcde",
		"debug": false,
		"platform_version": {"major": 1, "minor": 4},
	}}
		with data.reference_values as {
			"launch_digest": ["abcde"],
			"svn": ["1"],
			"major_version": 1,
			"minimum_minor_version": 4,
		}
	c.executables == 3
	c.hardware == 2
	c.configuration == 2
}
