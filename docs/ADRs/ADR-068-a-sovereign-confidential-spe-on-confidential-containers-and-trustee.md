# ADR-068: A sovereign confidential SPE: Confidential Containers and a Trustee the access body runs, Neo4j loaded per permit

**Status:** Accepted (2026-10-30)
**Date:** 2026-10-30
**Supersedes:** [ADR-052](ADR-052-confidential-spe-on-azure-revisited.md) in full. This ADR carries over what still holds from it (the regulation, Azure Container Apps, Contrast, the triggers) and replaces what no longer does (AKS `KataCcIsolation` with Azure Attestation).
**Keeps:** the pattern of [ADR-037](ADR-037-secure-processing-environment-confidential-computing.md): confidential containers with remote attestation.
**Relates to:** [ADR-012](ADR-012-azure-container-apps.md), [ADR-045](ADR-045-observability-and-regulatory-audit-trail.md), [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md)
**Tracks:** [#716](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/716), [#27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27), [#481](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/481)

## Context

ADR-037 (September 2026) decided that the secure processing environment (SPE)
of Art. 73 runs in confidential containers with remote attestation, and named
Contrast. Phase 1, the honest model labelled "Simulated attestation", shipped.
ADR-052 (4 October 2026) moved phase 2a to AKS confidential containers with
Azure Attestation and deferred it. Neither has been built.

### What the regulation asks

- Regulation (EU) 2025/327, **Art. 73(1)**: access bodies provide data only
  through a secure processing environment, with "(b) minimisation of the risk
  of the unauthorised reading, copying, modification or removal ... through
  state-of-the-art technical and organisational measures", unique identities
  and confidential access modes (d) and identifiable logs kept at least one
  year (e). **Art. 73(2)**: holders upload into the environment; users take
  out only non-personal data. **Art. 73(5)**: the Commission lays down the
  technical requirements in implementing acts by **26 March 2027**.
- The TEHDAS2 SPE specification for access bodies (D7.4, February 2026,
  [Zenodo](https://zenodo.org/records/20266473)) prescribes no technology.
- The German ePA meets the national bar, an operator that demonstrably cannot
  read health data (gematik's VAU), with confidential computing in production
  (ADR-037).

Confidential computing is not mandated. It is how "state of the art" in
Art. 73(1)(b) is met where the question is the operator, and the hub already
shows the fields.

### What the maintainer asks for (2026-10-30)

1. **Sovereign:** nobody outside the access body in the trust path that a
   regulator has to take on trust; in particular, the service that checks the
   evidence and releases keys is not a hyperscaler service.
2. **Open source:** OSI licences only; BSL does not count.
3. **Cloud native:** Kubernetes, a `RuntimeClass`, CNCF projects.
4. **Real hardware in a Kubernetes cluster:** AMD SEV-SNP or Intel TDX.
5. **Works with Neo4j**, the SPE's data plane: two SPEs locally (`neo4j`,
   `neo4j-spe2`), a second one on Azure to follow; k = 5 on every answer
   since #772.
6. **Testable on a MacBook Pro and on Azure**, or simulated where it cannot
   be real; later also on **STACKIT** and **Codesphere**.

### The landscape, checked 2026-10-30

**Azure.**

- **AKS confidential containers are ending.** Microsoft announced on
  24 October 2025 that the preview is "slated to sunset in March 2026" and
  that AKS removes the `kata-cc-isolation` runtime class from node pools
  ([AKS #3781](https://github.com/Azure/AKS/issues/3781)). It runs on Azure
  Linux 2.0 only, whose node images are removed on **31 October 2026**, after
  which node pools cannot scale
  ([deploy guide](https://learn.microsoft.com/en-us/azure/aks/deploy-confidential-containers-default-policy),
  [AKS #4988](https://github.com/Azure/AKS/issues/4988)). No successor on
  Azure Linux 3 is announced. Its key release also needed Azure Attestation
  and Key Vault, which fails requirement 1. ADR-052's phase 2a cannot be
  built.
- Microsoft's named alternatives: **ACI confidential containers** (GA,
  SEV-SNP per container group, execution policy from the `confcom` CLI),
  **AKS confidential VM node pools**, ARO confidential containers (preview),
  SGX nodes, and **running the upstream CoCo stack yourself on AKS**.
- **AKS confidential VM node pools** are GA, SEV-SNP only (no TDX on AKS),
  Azure Linux 3 and Ubuntu, and cannot be combined with Pod Sandboxing or
  CoCo ([AKS CVM](https://learn.microsoft.com/en-us/azure/aks/use-cvm)).
- **AKS Pod Sandboxing** (Kata, `kata-vm-isolation`) is not confidential: no
  memory encryption, no attestation
  ([concepts](https://learn.microsoft.com/en-us/azure/aks/concepts-pod-sandboxing)).
- **Azure Container Apps** offers a DC-series confidential workload profile
  at VM level, no attestation report for the app, UAE North only (ADR-052,
  [ACA #819](https://github.com/microsoft/azure-container-apps/issues/819));
  no EU region since.
- **Microsoft Ignite 2026**, 17 to 20 November in San Francisco: no session or
  announcement on a successor for AKS confidential containers found. To be
  re-checked after the event.
- **Azure evidence without Azure Attestation is possible.** Trustee's
  verifier has `az-snp-vtpm-verifier` and `az-tdx-vtpm-verifier`
  ([Cargo.toml](https://github.com/confidential-containers/trustee/blob/main/deps/verifier/Cargo.toml)),
  and Microsoft documents checking the raw SEV-SNP report from the vTPM
  against AMD's chain
  ([vTPM guide](https://learn.microsoft.com/en-us/azure/confidential-computing/how-to-leverage-virtual-tpms-in-azure-confidential-vms)).
  Microsoft's paravisor stays in the measured launch.
- Prices, Linux pay as you go, West Europe
  ([Retail Prices API](https://prices.azure.com/api/retail/prices)):
  `Standard_DC2as_v5` $0.104 an hour, `Standard_DC4as_v5` $0.208.

**Open source.**

- **CNCF Confidential Containers (CoCo)** is incubating since July 2026
  ([CNCF](https://www.cncf.io/blog/2026/07/22/confidential-containers-becomes-a-cncf-incubating-project/));
  v0.23.0 (24 September 2026) ships Kata 4.2.0 and Trustee v0.22.0, tested on
  SEV-SNP, TDX and IBM Secure Execution
  ([release](https://github.com/confidential-containers/confidential-containers/blob/main/releases/v0.23.0.md)).
  Apache-2.0.
- **Peer pods** (cloud-api-adaptor, one confidential VM per pod) are upstream,
  but their Azure end-to-end tests have been off since May 2026
  ([PR #3072](https://github.com/confidential-containers/cloud-api-adaptor/pull/3072)).
- **Contrast** 1.26.0 is BSL with no additional use grant, bare-metal SEV-SNP
  and TDX ([releases](https://github.com/edgelesssys/contrast/releases));
  production use needs Edgeless's licence. Constellation was archived on
  22 January 2026.

**Sovereign European providers.**

- **STACKIT**: Confidential Server is AMD SEV-ES, not SEV-SNP, with the vTPM
  in STACKIT's hypervisor; its Confidential Kubernetes is built on the
  archived Constellation, with no announced successor
  ([product](https://stackit.com/en/products/confidential/stackit-confidential-kubernetes),
  [Constellation cloud table](https://docs.edgeless.systems/constellation/2.22/overview/clouds)).
  STACKIT Kubernetes Engine has no confidential node pools. Real SEV-SNP or
  TDX evidence is not available there today.
- **Codesphere** is a PaaS over Kubernetes, SaaS or on premises; it advertises
  confidential Kubernetes and VMs without naming a TEE
  ([product](https://codesphere.com/products/confidential-airgapped)). Since
  June 2026 it cooperates with STACKIT (STACKIT the infrastructure, Codesphere
  the runtime), and with enclaive it won the GovTech Deutschland award for a
  central runtime aimed at administrative and health applications
  ([Schwarz Digits](https://schwarz-digits.de/en/presse/archive/2026/sovereign-stack-in-the-public-sector-stackit-and-codesphere-set-a-new-platform-standard)).
  Its interface is a `ci.yml` landscape, not Kubernetes manifests or a
  `RuntimeClass`.
- IONOS offers SEV-SNP confidential VMs in Frankfurt
  ([docs](https://docs.ionos.com/cloud/compute-services/compute-engine/confidential-computing-vm.md));
  OpenStack Nova 2026.2 adds SEV-SNP and TDX instances, which OpenStack-based
  clouds can adopt ([release notes](https://docs.openstack.org/releasenotes/nova/2026.2.html)).
  AWS's European Sovereign Cloud has no SEV-SNP.

**Neo4j inside CoCo.** The container file system of a CoCo pod lives in
encrypted guest memory. Released: confidential `emptyDir` (LUKS2 with
integrity, key in guest memory, gone with the pod, no replay protection),
sealed secrets, and fetching a resource from Trustee after attestation
([protected storage](https://confidentialcontainers.org/docs/features/protected-storage/)).
Not released: a persistent volume whose key Trustee releases. No published
report runs Neo4j or another JVM database in CoCo. Confidential VMs cost about
7 % on SEV-SNP and 4 % on TDX, more for I/O-heavy databases
([TUM, SIGMETRICS 2025](https://dse.in.tum.de/wp-content/uploads/2025/06/CVM-Explained-SIGMETRICS-2025-slide.pdf)).
Neo4j Community is GPLv3 with no encryption at rest of its own.

**A MacBook.** Apple silicon has no SEV-SNP or TDX. CoCo without a TEE
(`coco-dev`) exists on arm64 only as `kata-qemu-coco-dev-runtime-rs` and needs
`/dev/kvm`, which on a Mac means nested virtualization: Lima or Colima with
`vz` on M3 or later and macOS 15 or later. OrbStack exposes no `/dev/kvm`
(checked on the maintainer's M5). Trustee runs in Docker Compose with arm64
images and accepts the sample attester when its policy allows it
([KBS quickstart](https://github.com/confidential-containers/trustee/blob/main/kbs/quickstart.md)).

## Options

|                                    | What                                                                           | Sovereign                      | Open source   | Per-workload evidence | Neo4j                                        | Azure                              | Mac       |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ | ------------- | --------------------- | -------------------------------------------- | ---------------------------------- | --------- |
| **A. CoCo + Trustee (chosen)**     | Kata micro-VM per pod, guest attestation agent, Trustee run by the access body | Yes; CPU vendor's root remains | Apache-2.0    | Yes                   | Per permit (decision 3)                      | Node level now, per workload later | Simulated |
| B. AKS `KataCcIsolation` (ADR-052) | Preview                                                                        | No                             | Partly        | Yes                   | Yes                                          | **Ending**                         | No        |
| C. AKS CVM node pool alone         | Node is a SEV-SNP VM                                                           | With Trustee, partly           | n/a           | No                    | Unchanged                                    | GA                                 | No        |
| D. ACI confidential containers     | SEV-SNP per container group, `confcom` policy                                  | With Trustee, to verify        | Tooling yes   | Yes                   | Per permit fits; no persistent volume needed | GA                                 | No        |
| E. Contrast                        | Manifest and coordinator over Kata                                             | Yes                            | **No** (BSL)  | Yes                   | Yes                                          | Bare metal                         | No        |
| F. ACA DC profile                  | VM-level workload profile                                                      | No                             | n/a           | No                    | Unchanged                                    | UAE North only                     | No        |
| G. STACKIT Confidential K8s        | Constellation on SEV-ES                                                        | Yes                            | BSL, archived | No SNP evidence       | Yes                                          | n/a                                | No        |
| H. SGX, enclaive, Fortanix         | Enclaves, proprietary runtimes                                                 | Mixed                          | Mostly no     | Enclave               | Poor fit for a JVM heap                      | Older sizes                        | No        |

## Decision

1. **The SPE is built on CNCF Confidential Containers, and the access body
   runs the Trustee.** Kata Containers with the CoCo guest components on
   SEV-SNP or TDX; Trustee (KBS, Attestation Service, RVPS) operated by the
   access-body persona, not by the hub operator and not by a cloud provider.
   Azure Attestation and Key Vault are not in the key path.

2. **The permit is the policy, and the policy hash opens the data.** At
   approval the hub records on the data permit the SHA-256 of the workload's
   execution policy (the Kata agent policy from `genpolicy`, or the ACI
   `confcom` policy). The access body loads it into Trustee's reference values
   and binds the permit's dataset key to it. Only a workload whose evidence
   carries that hash, on genuine hardware, gets the key; a failed attestation
   means no key and no data. Each release goes on the audit chain (ADR-045).

3. **Neo4j in the SPE is a workspace per permit, not a long-lived store.** The
   holder's extract for a permit (Art. 73(2)) is stored outside as an encrypted
   dump. An init step attests, fetches the key from Trustee, decrypts and loads
   the dump into a Neo4j Community whose store lives in guest memory or a
   confidential `emptyDir`; the workspace opens with the permit and is
   destroyed with it (#716). This avoids the persistent volume CoCo cannot
   protect yet, and the rollback attack with it. Sizing: heap plus page cache
   plus about 2 GiB for the micro-VM, all in `limits`. The Art. 71 opt-out
   filter (ADR-062) and k = 5 run inside, as today.

4. **On Azure, after AKS confidential containers.**

   - **Now (A1, node level):** an AKS cluster beside ACA with one confidential
     VM node pool (`Standard_DC4as_v5`, Azure Linux 3, West Europe, about
     $0.21 an hour, stopped off hours per ADR-053). The SPE pod's init step
     sends the node's vTPM and SEV-SNP evidence to the access body's Trustee
     (`az-snp-vtpm-verifier`). This proves encrypted memory on genuine AMD
     hardware with a measured boot, not which container ran.
   - **Next (A2, per workload), two candidates, decided by a spike:**
     ACI confidential containers, GA and supported by Microsoft, whose raw
     SEV-SNP report carries the policy hash, verified by Trustee instead of
     Azure Attestation (to be proven); or upstream CoCo peer pods on AKS, once
     their Azure tests run again. The per-permit workspace of decision 3 is
     what makes ACI usable for Neo4j: it needs no persistent volume.
   - **ACA** stays the home of everything that does not touch row-level data
     (ADR-012), including both SPEs' query proxy. A DC profile becomes an
     option for the VM-level case the day it reaches an EU region.

5. **One design, labelled for what each place proves.**

   | Where                                 | Hardware       | What is real                                                                                                                                                 | Label                             |
   | ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
   | **Mac, everyday (M1)**                | none           | Trustee in Compose, the permit hash in its policy, key release, the encrypted extract, Neo4j loading it, the audit record; evidence from the sample attester | "Simulated attestation"           |
   | **Mac, runtime check (M2, optional)** | none           | M1 plus a Kata micro-VM and its agent policy, in a Lima VM with nested virtualization, `kata-qemu-coco-dev-runtime-rs` on arm64                              | "Simulated attestation"           |
   | **Azure A1**                          | SEV-SNP        | Decision 4, node level                                                                                                                                       | "Attested: SEV-SNP node"          |
   | **Azure A2, EU bare metal**           | SEV-SNP or TDX | Per-workload policy checked by hardware                                                                                                                      | "Attested: confidential workload" |

   CI and the static demo use M1. `SPESession.simulated` becomes false only for
   an A1 or A2 session; `teeType` and a new `attestationScope` (`node` or
   `workload`) say which.

6. **STACKIT and Codesphere are targets, not yet platforms.** Both SPEs and
   the hub can run there as ordinary containers today, labelled "Simulated
   attestation". A confidential SPE on STACKIT needs SEV-SNP or TDX evidence,
   which its SEV-ES servers do not give; on Codesphere it needs to know which
   TEE and which evidence its confidential runtime exposes, and whether a
   self-run Trustee can verify it. Both questions go to the providers before
   any work. The design does not change: Trustee verifies whatever genuine
   evidence a platform gives.

7. **Sovereignty is stated, not implied.** On Azure the residual trust is AMD's
   root of trust and Microsoft's paravisor; the UI and docs say so. Full
   sovereignty is A2 on bare metal at an EU provider. Candidates to confirm:
   IONOS, OVHcloud bare metal (SEV-SNP unconfirmed), STACKIT and Open Telekom
   Cloud once they offer SEV-SNP or TDX.

8. **Timing.** M1 now: it costs nothing and makes the flow testable in CI. A1
   when one of ADR-052's triggers fires: an access-body demonstration (#27), a
   partner conversation reaching data governance, or the Art. 73(5)
   implementing act (due 26 March 2027). The A2 spike after A1. Re-check the
   Azure options after Ignite (20 November 2026).

## Consequences

- Every component in the trust path is Apache-2.0 (CoCo, Kata, Trustee) or
  GPLv3 (Neo4j Community). No vendor licence; no Azure-only service holds the
  keys.
- The access body verifies an SPE from outside with its own Trustee, the role
  ADR-037 gave `contrast verify`, without the BSL.
- The SPE's Neo4j becomes ephemeral per permit: a load per workspace, to be
  measured on SPE-2's extract. Nothing row-level outlives the permit, which is
  Art. 73.
- A1 is weaker than A2 and is labelled so; `attestationScope` exists to keep
  "attested node" from reading as "attested workload".
- New moving parts: a Trustee for the access body (Compose locally, a small
  deployment on Azure), an encrypted-extract format and a key per permit, and
  for A1 an AKS cluster beside ACA, one node, about $150 a month around the
  clock and far less with ADR-053's schedule.
- Risks: CoCo moves fast and its arm64 non-TEE runtime has thin CI (M2 may
  break; M1 does not depend on Kata). Database I/O in a confidential VM is
  slower; measure before quoting numbers. TDX is not available on AKS. The ACI
  path depends on Trustee verifying ACI's raw report, unproven until the
  spike.
- ADR-052's phase 2b (Contrast or enclaive manifest) is not pursued unless the
  per-permit policy hash proves insufficient; a licence answer comes first.
- `docs/spe-contrast-migration.md` stays as the record of the Contrast path;
  the plan for this ADR replaces it when M1 starts.

## Not decided here

- The encrypted-extract format (a Neo4j dump with age or AES-GCM, or an OMOP
  export loaded by the existing seed) and how the holder uploads it.
- Which EU provider hosts A2.
- Whether the access body's Trustee runs in the hub's Azure subscription for
  the demo. For the claim to hold it must be operated as if by MedReg DE,
  under identities separate from the hub's.

## References

- Regulation (EU) 2025/327, Art. 73; TEHDAS2 D7.4; #481 (the ADR-052
  investigation, prices and sources)
- [Confidential Containers](https://confidentialcontainers.org/),
  [Trustee](https://github.com/confidential-containers/trustee),
  [Kata Containers](https://github.com/kata-containers/kata-containers),
  [cloud-api-adaptor](https://github.com/confidential-containers/cloud-api-adaptor)
- [AKS confidential containers](https://learn.microsoft.com/en-us/azure/aks/confidential-containers-overview),
  [AKS confidential VM node pools](https://learn.microsoft.com/en-us/azure/aks/use-cvm),
  [ACI confidential containers](https://learn.microsoft.com/en-us/azure/container-instances/container-instances-confidential-overview),
  [ACA confidential compute](https://learn.microsoft.com/en-us/azure/container-apps/confidential-compute)
- [Contrast](https://github.com/edgelesssys/contrast),
  [Constellation](https://github.com/edgelesssys/constellation)
- [STACKIT Confidential Kubernetes](https://stackit.com/en/products/confidential/stackit-confidential-kubernetes),
  [Codesphere](https://docs.codesphere.com/getting-started),
  [IONOS confidential VMs](https://docs.ionos.com/cloud/compute-services/compute-engine/confidential-computing-vm.md)
- [Lima nested virtualization](https://github.com/lima-vm/lima/blob/master/templates/default.yaml),
  [CoCo without a TEE](https://github.com/confidential-containers/confidentialcontainers.org/blob/main/content/en/docs/getting-started/prerequisites/hardware/nontee.md)
