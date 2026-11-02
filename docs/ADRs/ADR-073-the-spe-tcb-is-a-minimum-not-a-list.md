# ADR-073: The SPE workspaces' SEV-SNP TCB is checked against a minimum, not a list

Date: 2026-11-02

**Status:** Proposed
**Relates to:** [ADR-068](ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md), [ADR-069](ADR-069-two-spe-workspaces-as-aci-confidential-containers.md) (amended here, not edited), [ADR-072](ADR-072-spe-workspaces-start-on-demand.md)
**Tracks:** [#833](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/833), [#774](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/774)

## Status

Proposed. Amends decision 3 of
[ADR-069](ADR-069-two-spe-workspaces-as-aci-confidential-containers.md)
(reference values taken from the first attestation) for the four TCB
components only, and replaces the "TCB values are lists" practice of #801 and
#805. Built on branch `feat/tcb-min`; not applied on Azure yet.

## Context

Trustee v0.22.0 judges SEV-SNP evidence with its built-in attestation policy
`default_cpu`
([`ear_default_policy_cpu.rego`](https://github.com/confidential-containers/trustee/blob/v0.22.0/attestation-service/src/ear_token/ear_default_policy_cpu.rego)).
Its `hardware` claim compares each reported TCB component with a reference
value by `in`, so each value is "one of" a list:

```rego
input.snp.reported_tcb_bootloader in query_reference_value("snp_bootloader")
```

The two ACI groups landed on hosts with different firmware: bootloader 10 and
12, microcode 84 and 88, snp 23 and 28, tee 0. Both values are pinned as lists
(#801, #805). A group that lands on a host with another TCB is refused
(`ear.status contraindicated`) until someone adds its numbers. That host is
most likely a newer one: AMD's TCB versions are security version numbers, and
an AMD or Azure firmware update raises them. So the list refuses exactly the
hosts that are better patched, and with on-demand starts (ADR-072) the refusal
lands on a researcher's query, not on an operator.

AMD's own model is a floor: a higher SVN is newer firmware, and older firmware
is retired by raising the minimum a verifier accepts. Contrast does the same
with `MinimumTCB` for SEV-SNP
([`docs/spe-contrast-migration.md`](../spe-contrast-migration.md)). The
report's signature already proves that the numbers are the ones the firmware
reported; what the policy decides is how old a firmware it still trusts.

## Decision

1. **The access body sets its own attestation policy,**
   [`trustee/policies/attestation-ear-cpu.rego`](../../trustee/policies/attestation-ear-cpu.rego):
   Trustee v0.22.0's `default_cpu` copied as it is, with one rule changed.
   Every other check (the sample, TDX, Azure vTPM, TPM and Secure Execution
   sections, the configuration claim, the extensions) stays upstream's.
2. **Each SNP TCB component passes at or above its minimum.** When RVPS holds
   `snp_bootloader_min`, `snp_microcode_min`, `snp_snp_svn_min` or
   `snp_tee_svn_min` (the list's id plus `_min`, one integer), the component
   passes when the reported value is a number at or above it:

   ```rego
   snp_tcb_ok(reported, min_id, _) if {
   	minimum := query_reference_value(min_id)
   	is_number(minimum)
   	is_number(reported)
   	reported >= minimum
   }
   snp_tcb_ok(reported, min_id, list_id) if {
   	not is_number(query_reference_value(min_id))
   	reported in query_reference_value(list_id)
   }
   ```

   Without a minimum the component falls back to upstream's list, so the lists
   pinned today keep working until the minimums are set, and a component can
   stay a list. Trustee's `query_reference_value` answers null for an id RVPS
   does not hold, and in Rego a number compares as greater than null, so the
   `is_number` guard is what keeps a missing minimum from accepting
   everything.

3. **The launch measurement and the configuration stay exact.**
   `snp_launch_measurement` is still a pinned list checked against Microsoft's
   endorsement (ADR-069 decision 3); debug and migration agent are still
   refused; ABI, SMT, TSME and single-socket still compare equal.
4. **It replaces `default_cpu` by id.** Trustee evaluates the policy
   `<id>_<tee class>` for the id the KBS asks for, `default`, so the
   replacement is set as `default_cpu` (kbs-client
   `config set-attestation-policy --type rego --id default_cpu`, the id
   kbs-client uses when none is given). On start Trustee writes its built-in
   `default_cpu` only when its store has none (`overwrite: false`), so the
   replacement survives a restart in the `attestation_service_policy`
   namespace on `trustee-data`. The token still names policy `default`.
5. **Where it is set.** `spe-loader trustee-configure`, given
   `--attestation-policy <file>`, checks every input first (a `_min` must be
   one non-negative integer; a string would not be a number to the policy and
   would fall back to the list without a word), then sets the resource policy, the attestation
   policy and the reference values. Phase 21 `--trustee` sets it on every run;
   `--check` reports which `default_cpu` Trustee holds (the committed file,
   another version, or the built-in default). The compose overlay sets it too,
   so the local stack evaluates the same file with Trustee's own engine.
6. **The minimums start at the lower of the hosts seen:** bootloader 10,
   microcode 84, snp 23, tee 0
   ([`reference-values-aci.example.json`](../../trustee/reference-values-aci.example.json)).
   They are raised, never lowered, when AMD revokes older firmware (an AMD
   security bulletin) or when every host the groups land on is newer. Raising
   one is a reference value change, not a policy change.

## Consequences

- A group that lands on a host with newer firmware is accepted without anyone
  touching Trustee; on-demand starts (ADR-072) no longer depend on which host
  ACI picks, as long as the host is at least as new as the floor.
- A host with older firmware than the floor is refused, as before. So is a
  downgrade: the floor never moves down by itself.
- The access body now maintains a policy file of its own. On a Trustee
  upgrade the file is compared with the new release's `default_cpu` and
  carried forward; until then the file names the version it was copied from
  (v0.22.0). Tests: `trustee/policies/attestation_ear_cpu_test.rego`, 19 cases
  with `opa test` (`scripts/test-trustee-policies.sh`, in CI); the file was
  also evaluated with regorus 0.11.0, the engine Trustee v0.22.0 uses, with
  the same answers.
- The four TCB components compare independently, as AMD's TCB version does.
  A host that is newer in three components and older in one is refused.
- The ACI groups do not show on the page that a minimum, not a pinned value,
  admitted them: `/admin/attestation` still shows the reported TCB. The user
  guide's sentence on the reported TCB ("accepts each version that was
  pinned") is out of date once this is applied, in all five languages.
- Upstream: Trustee's own TDX section suggests a minimum TCB date as the
  alternative to an exact status (commented out in v0.22.0). If Trustee's
  default policy adopts minimums for SNP, this file goes and the reference
  values stay.

## Alternatives considered

- **Keep the lists and add each new host's values.** What #801 did. Refuses
  the better-patched hosts first, and needs an operator at the moment a start
  fails, which on-demand starts make a researcher's problem.
- **Drop the TCB check.** The report's signature chains to AMD whatever the
  firmware, so a host with revoked firmware would be accepted. Refused.
- **A policy under another id.** The KBS v0.22.0 can map a selector in the
  attestation request's extra parameters to other policy ids
  (`policy_id_map`, `kbs/src/attestation/backend.rs`). That needs the
  attester to send the selector and a KBS configuration change, for nothing
  that replacing `default_cpu` does not already give: no other workload on
  this Trustee uses the default.
