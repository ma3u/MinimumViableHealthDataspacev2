# ADR-069: Two SPE workspaces as ACI confidential containers

Date: 2026-10-31

**Status:** Proposed
**Relates to:** [ADR-068](ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md) (the design this places on Azure), [ADR-012](ADR-012-azure-container-apps.md), [ADR-045](ADR-045-observability-and-regulatory-audit-trail.md), [ADR-053](ADR-053-everything-stops-off-hours.md) (extended here, not edited), [ADR-056](ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md), [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md)
**Tracks:** [#774](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/774) (WP1, WP2), [#716](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/716)
**Replaces:** the unmerged draft of this ADR (2026-10-30), which ran SPE-2 as a plain Neo4j container app seeded from SPE-1

## Status

Proposed (2026-10-31). The policy exemption for AKS: requested, pending.

## Context

ADR-068 decided that the SPE runs on Confidential Containers with a Trustee
the access body operates, and that Neo4j in the SPE is a workspace loaded per
permit from an encrypted extract (decision 3). Decision 4 put row-level data
on confidential hardware on Azure: first an AKS confidential VM node pool
(A1, node-level evidence), then ACI confidential containers or peer pods
(A2, per-workload evidence). Locally (M1) the same flow runs with Trustee's
sample attester, labelled "Simulated attestation".

**AKS is not possible in this tenant.** The policy
`pol-ssg-prd-restriction_sku_kubernetes` (effect Deny, initiative
`ini-ssg-prd-cloud-inf_stg-restrictions`, assigned at a Sopra Steria
management group) allows AKS node sizes `standard_d{2,4,8,16,32}s_v5` and
`standard_d{2,4,8,16,32}ds_v5` only. `az aks create` with
`Standard_DC4as_v5` was refused with `RequestDisallowedByPolicy` on
2026-10-31; no cluster was created. The same initiative carries "Allowed
virtual machine size SKUs", so a plain confidential VM is likely blocked too.

**ACI confidential containers are allowed.** A probe on 2026-10-31
(westeurope, `sku: Confidential`, allow-all policy, deleted afterwards)
deployed without a policy refusal and found:

- the SEV-SNP guest device `/dev/sev-guest` (crw-rw-rw-, 10,125) in the
  container; no `/dev/sev`, no TPM;
- `UVM_SECURITY_CONTEXT_DIR=/security-context-<n>` with
  `host-amd-cert-base64` (8900 bytes, the VCEK, ASK and ARK chain from the
  host), `reference-info-base64` (14532 bytes, Microsoft's COSE endorsement
  of the utility VM), `security-policy-base64` (1028 bytes, the Rego
  ccePolicy whose SHA-256 is the report's HOST_DATA) and
  `transparent-reference-info-base64` (8292 bytes);
- guest kernel 6.1.10, CPU AMD EPYC 9V74 (Genoa);
- no egress problem pulling from `mcr.microsoft.com`.
  `Microsoft.ContainerInstance` is registered.

ACI's HOST_DATA is what ADR-068 decision 2 asks for: a hash of the workload's
execution policy, measured by the hardware. On ACI that is per-workload
evidence (A2) from day one, rather than A1 first.

Two further facts shape the network: the ACA environment has no VNet, and
`mvhd-neo4j-proxy` reaches the internet from 321 shared regional outbound IP
addresses (`properties.outboundIpAddresses`). ACI without a VNet offers no
source-range filter on a public IP.

**The exemption we ask for.** We ask the cloud platform team for a policy
exemption for `rg-mvhd-dev` allowing `standard_dc4as_v5` and
`standard_dc2as_v5` for AKS. Status: requested, pending. The reasoning: Art.
73(1)(b) of Regulation (EU) 2025/327 asks for state-of-the-art measures
against unauthorised reading of health data in a secure processing
environment; an AKS confidential VM node pool gives SEV-SNP evidence with
Kubernetes as the interface, about $0.21 an hour for one `Standard_DC4as_v5`,
stopped off hours (ADR-053). If granted, AKS with a CVM node pool (ADR-068
A1) becomes an option beside ACI, not a replacement. Nothing in this ADR
waits for it.

## Decision

1. **Both SPE workspaces are ACI confidential container groups**,
   `mvhd-spe-1` (AlphaKlinik Berlin) and `mvhd-spe-2` (Limburg Medical
   Centre), `sku: Confidential`, resource group `rg-mvhd-dev`, westeurope,
   from `scripts/azure/aci/spe-workspace.template.json`. Each group:

   - init container `spe-unlock` (`services/spe-loader`): attests to Trustee
     with `kbs-client` built with the `snp-attester` feature
     (`services/spe-loader/kbs-client.aci.Dockerfile`, Trustee v0.22.0), gets
     `default/spe-<n>/extract-key`, decrypts the extract baked into its image
     into the `emptyDir` `work`;
   - `neo4j` 5.26.28 Community, store in the `emptyDir` `neo4j-data`,
     1.5 vCPU, 4 GiB (heap 1.5 GiB, page cache 1 GiB, ADR-056's proportions),
     Bolt with TLS required, HTTP off;
   - sidecar `spe-ingest`: loads the decrypted extract, applies
     `neo4j/init-schema.cypher` and the SPE's HealthDCAT-AP registration,
     deletes the plaintext, records the attestation, stays up.
     A refusal starts Neo4j empty, so the refusal can be recorded and read.
     `runsOn` is "ACI confidential container group mvhd-spe-<n> (westeurope)",
     `teeType` "AMD SEV-SNP", `attestationScope` "workload", the label
     "Attested: confidential workload".

2. **The permit's policy hash is HOST_DATA, checked by hardware.**
   `21-aci-confidential-spe.sh --policy` runs `az confcom acipolicygen` on the
   template (images by digest, commands, environment, mounts; no secret
   values, which travel in the group's secret volume). The SHA-256 of the
   decoded ccePolicy is the permit's `policyHash`: recorded on the
   `HDABApproval` and written into Trustee's resource policy
   (`trustee/policies/resource-azure.rego.tmpl`). Trustee releases the key
   only to SEV-SNP evidence (its `snp` verifier, AMD's chain), with an
   affirming token, whose HOST_DATA equals that permit's hash. The loader
   takes the hash of record from the token's HOST_DATA and sets
   `policyCheckedByHardware: true` once the key came. It also checks HOST_DATA
   against `security-policy-base64` and records the digests of the three
   security-context files with the attestation. The VCEK is looked up in
   Trustee's offline store first, then at AMD's KDS (the host's chain can be
   copied into the store; not automated yet).

3. **Trustee runs on ACA as `mvhd-trustee`, operated as if by MedReg DE.**
   Its own identity `id-mvhd-trustee`, its own shares `trustee-keys` (admin
   key, token signing key, `kbs-config.toml`) and `trustee-data` (extract
   keys, policies, reference values), its own admin job
   `mvhd-trustee-admin`. The admin key is generated by Trustee's init
   container on first start and never leaves the share. Azure Attestation and
   Key Vault are not in the key path (ADR-068 decision 1). Honest limit: the
   shares are in the hub's storage account and subscription, so the
   subscription owner could read them; for the claim to hold, the access body
   runs Trustee in a subscription of its own. Reference values (UVM
   measurement, TCB) are pinned from the first attestation, which is refused
   until they are set, and checked against Microsoft's endorsement in
   `reference-info-base64` by the operator.

4. **Extracts are sealed where the hub graph is, and only ciphertext moves.**
   The admin job exports each SPE's half of the hub's synthetic patients
   (the split and exclusions of the former `seed-spe2.py`: no sandbox,
   app-created or app-connected record; labels travel, so the Art. 71
   `OptedOut` label of ADR-062 does), seals it with AES-256-GCM under a new
   32-byte key, puts the key into Trustee and writes the ciphertext to the
   share `spe-extracts`. `--extracts` bakes it into
   `mvhd-spe-loader-spe<n>` in `acrmvhdehds`, so the extract's digest is part
   of the policy hash too.

5. **The loader records, the proxy appends to the audit chain.** Neither ACI
   group can reach the hub's Neo4j: ACA exposes it as environment-internal TCP
   only, and opening it to the internet would expose the hub graph to reach
   an audit write. So each workspace keeps an `(:SpeAttestation {speId})`
   with the contract's fields and the `attestation` object, and one
   `(:SpeEvent)` per attestation, key release, refusal and load. The proxy,
   which reaches both, reads them through `GET /spe/status` (and every
   minute without a caller) and appends each to the chain `spe` once, the
   event id as dedupe key; `speId`, `permitId`, `policyHash`, `teeType`,
   `attestationScope`, `simulated` and `eventType` are node properties of
   the `(:AuditEvent)`. `spe.workspace_destroyed` is the proxy's own
   observation: a workspace that answers with a new load replaced the old one.

6. **Bolt with TLS on a public DNS name; TLS and the password are the gate.**
   `mvhd-spe-<n>-b53a0449.westeurope.azurecontainer.io:7687`. The server
   certificate is signed by a CA of our own (`scripts/azure/spe-tls.sh`, CA
   key in `~/.mvhd/spe-ca` on the maintainer's machine); the proxy trusts
   that CA and no other (`NEO4J_SPE_CA_CERT`). The Neo4j passwords are in the
   hub's Key Vault for the proxy's `keyvaultref`, and reach the group through
   its secret volume (`NEO4J_AUTH_PATH`). There is no source-range filter: ACI
   without a VNet has none, and the proxy's 321 shared outbound addresses
   would make one weak anyway.

7. **The proxy asks the workspaces only for the SPE questions.**
   `NEO4J_SPE1_URI` (new) and `NEO4J_SPE2_URI` point at the groups; the
   federated path and the `spe_access` template ask them, everything else
   stays on the hub graph. A configured workspace that does not answer is
   left out, never replaced by the hub, which holds both halves. k = 5 and
   the Art. 71 rewrite apply to every answer, as since #772. Unset, SPE-1 is
   the hub graph as before.

8. **Off hours (extends ADR-053).** The evening run stops both groups with
   `az container stop` first, then the apps, `mvhd-trustee` among them; the
   morning run starts `mvhd-trustee` first among the core apps, then both
   groups with `az container start`, while the proxy keeps retrying until
   they have loaded. A stopped group bills nothing; each start re-attests and
   reloads from the sealed extract, by design. `id-mvhd-offhours` gets
   Contributor on each group and nothing else (`18-offhours-jobs.sh`, run
   once more after `--workspaces`). Missing groups or Trustee are skipped.

9. **Locally (M1)** `docker-compose.trustee.yml` runs the same loader and
   Trustee with the sample attester: SPE-1 becomes a workspace of its own
   (`neo4j-spe1`) and `neo4j-spe2` is loaded by `spe-loader-spe2`, both
   stores in memory, labelled "Simulated attestation".

## Consequences

- Both SPEs give per-workload evidence on Azure: the label reads
  "Attested: confidential workload" and `policyCheckedByHardware` is true,
  which ADR-068 expected at A2 only. Residual trust, stated in the UI: AMD's
  root of trust and Microsoft's utility VM image, whose measurement only
  Microsoft endorses.
- Nothing row-level outlives a group (Art. 73): stops, restarts and new
  permits reload from the extract. Each start costs a load (measured locally:
  107 and 108 patients, 2702 and 2640 nodes, seconds).
- New parts to operate: Trustee and its admin job, two container groups,
  a CA, reference values to re-pin when Microsoft updates the UVM (a new
  measurement is refused until pinned, which fails safe).
- `scripts/azure/20-neo4j-spe2.sh`, `scripts/seed-spe2.py` and the ACA
  SPE-2 app of the draft are gone; their split logic lives in
  `services/spe-loader/src/hub.ts`.
- Not verified on Azure yet: CoCo's `snp-attester` checks
  `/sys/devices/platform/sev-guest` before it uses `/dev/sev-guest`; if ACI
  lacks the sysfs node, kbs-client falls back to the sample attester and every
  release is refused. Also unproven: init containers and secret volumes in a
  confidential group with a generated ccePolicy, `NEO4J_AUTH_PATH` under the
  policy, Trustee's LocalFs store on an SMB share, and `az containerapp job
start` argument overrides as `--policy` uses them.

## Alternatives considered

- **AKS with a confidential VM node pool (ADR-068 A1):** refused by the tenant
  policy; asked for as an exemption, an option beside ACI if granted.
- **SPE-2 as a plain Neo4j container app (the draft):** row-level data
  without a TEE, against ADR-068 decision 4.
- **Azure Attestation and Key Vault secure key release:** a hyperscaler
  service in the key path, against ADR-068 decision 1.
- **Peer pods on AKS:** needs AKS, and their Azure tests are off since May 2026.
- **The Bolt TLS key from Trustee instead of the secret volume:** a refused
  workspace could not start Neo4j, so the refusal could not be recorded or
  read.
