# ADR-068: A sovereign confidential SPE: Confidential Containers and a Trustee the access body runs, Neo4j loaded per permit

**Status:** Proposed
**Date:** 2026-10-30
**Supersedes:** decisions 1 and 4 of [ADR-052](ADR-052-confidential-spe-on-azure-revisited.md) (phase 2a on AKS `KataCcIsolation` with Azure Attestation; timing deferred). Its decisions 2 and 3 (Contrast only after a licence answer; everything else stays on Azure Container Apps) stand.
**Relates to:** [ADR-037](ADR-037-secure-processing-environment-confidential-computing.md), [ADR-045](ADR-045-observability-and-regulatory-audit-trail.md), [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md)
**Tracks:** [#716](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/716), [#27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27), [#481](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/481)

## Context

ADR-037 decided that the secure processing environment (SPE) of Art. 73 runs
in confidential containers with remote attestation. ADR-052 picked AKS
confidential containers (`KataCcIsolation`) for the first real attestation,
verified through Azure Attestation, and deferred the work.

The maintainer now asks for an SPE with these properties (2026-10-30):

1. **Sovereign:** no party outside the access body in the trust path that a
   regulator would have to trust on its word. In particular, the service that
   checks the evidence and releases keys is not a hyperscaler service.
2. **Open source:** OSI licences only. BSL does not count.
3. **Cloud native:** Kubernetes, a `RuntimeClass`, CNCF projects.
4. **Real hardware in a Kubernetes cluster:** AMD SEV-SNP or Intel TDX.
5. **Works with Neo4j:** the graph is the SPE's data plane (two SPEs today,
   `neo4j` and `neo4j-spe2`, k = 5 on every answer since #772).
6. **Testable on the maintainer's MacBook Pro and on Azure**, or simulated
   where it cannot be real.

### What changed since ADR-052 (checked 2026-10-30)

- **AKS confidential containers have run out of road.** `KataCcIsolation` is
  still a preview and runs on Azure Linux 2.0 only. AKS stopped updating Azure
  Linux 2.0 on 30 November 2025, and **from 31 October 2026 its node images
  are removed and node pools cannot scale**
  ([deploy guide](https://learn.microsoft.com/en-us/azure/aks/deploy-confidential-containers-default-policy),
  [overview](https://learn.microsoft.com/en-us/azure/aks/confidential-containers-overview)).
  Its key release also needs Azure Attestation and Key Vault, which fails
  property 1. ADR-052's phase 2a cannot be built.
- **CNCF Confidential Containers (CoCo) is incubating** since July 2026
  ([CNCF](https://www.cncf.io/blog/2026/07/22/confidential-containers-becomes-a-cncf-incubating-project/)).
  Release v0.23.0 (24 September 2026) ships Kata 4.2.0 and Trustee v0.22.0,
  tested on SEV-SNP, TDX and IBM Secure Execution
  ([release notes](https://github.com/confidential-containers/confidential-containers/blob/main/releases/v0.23.0.md)).
- **Trustee verifies Azure confidential VMs itself.** Its verifier has
  `az-snp-vtpm-verifier` and `az-tdx-vtpm-verifier` features
  ([Cargo.toml](https://github.com/confidential-containers/trustee/blob/main/deps/verifier/Cargo.toml)),
  and Microsoft documents that the raw SEV-SNP report from the vTPM can be
  checked against AMD's certificate chain without Azure Attestation
  ([vTPM guide](https://learn.microsoft.com/en-us/azure/confidential-computing/how-to-leverage-virtual-tpms-in-azure-confidential-vms)).
  Microsoft's paravisor stays in the measured launch; that is the residual
  trust on Azure.
- **AKS confidential VM node pools are GA**, SEV-SNP only (no TDX on AKS), and
  cannot be combined with confidential containers
  ([AKS CVM](https://learn.microsoft.com/en-us/azure/aks/use-cvm)).
- **Peer pods on Azure** (cloud-api-adaptor, one confidential VM per pod) are
  upstream, but their Azure end-to-end tests have been off since May 2026
  ([PR #3072](https://github.com/confidential-containers/cloud-api-adaptor/pull/3072)).
- **Contrast** is at 1.26.0, still BSL with no additional use grant, docs for
  bare metal ([releases](https://github.com/edgelesssys/contrast/releases)).
  Constellation stays archived.

### What CoCo does not give a database yet

The container file system of a CoCo pod lives in encrypted guest memory.
Released: confidential `emptyDir` (LUKS2 with integrity on a host block
device, key in guest memory, gone with the pod, **no replay protection**),
sealed secrets, and fetching a resource from Trustee after attestation
([protected storage](https://confidentialcontainers.org/docs/features/protected-storage/),
[get resource](https://confidentialcontainers.org/docs/features/get-resource/)).
Not released: a persistent volume whose key Trustee releases. Kata's block
handler only mounts with an ephemeral random key
([block_handler.rs](https://github.com/kata-containers/kata-containers/blob/main/src/agent/src/storage/block_handler.rs)).
A Neo4j that keeps its store across restarts inside CoCo is therefore
build-it-yourself today, and a hostile host can roll the volume back.

No published report runs Neo4j, or any JVM database, in CoCo. Measured
overhead of confidential VMs is about 7 % on SEV-SNP and 4 % on TDX, more for
I/O-heavy database work because of bounce buffers
([TUM, SIGMETRICS 2025](https://dse.in.tum.de/wp-content/uploads/2025/06/CVM-Explained-SIGMETRICS-2025-slide.pdf)).
Neo4j Community is GPLv3 and has no encryption at rest of its own
([licensing](https://neo4j.com/licensing/)).

### What a MacBook can and cannot do

Apple silicon has no SEV-SNP or TDX. The CoCo flow without a TEE
(`coco-dev`) exists on arm64 only as `kata-qemu-coco-dev-runtime-rs`, and it
needs `/dev/kvm`, which on a Mac means nested virtualization: Lima or Colima
with `vz` on M3 or later and macOS 15 or later
([Lima](https://github.com/lima-vm/lima/blob/master/templates/default.yaml),
[non-TEE prerequisites](https://github.com/confidential-containers/confidentialcontainers.org/blob/main/content/en/docs/getting-started/prerequisites/hardware/nontee.md)).
The maintainer's machine is an M5 on macOS 26, so Lima qualifies; OrbStack
exposes no `/dev/kvm` (checked). Trustee itself runs in Docker Compose with
arm64 images and accepts the sample attester when its policy allows it
([KBS quickstart](https://github.com/confidential-containers/trustee/blob/main/kbs/quickstart.md)).

## Options

|                                | What                                                                                                            | Sovereign                                                              | Open source  | Per-pod evidence                     | Neo4j                                                      | Azure today                                     | Mac                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------ | ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- | --------------------- |
| **A. CoCo + Trustee (chosen)** | Kata micro-VM per pod, guest attestation agent, Trustee (KBS, Attestation Service, RVPS) run by the access body | Yes: verifier and keys with the access body; CPU vendor's root remains | Apache-2.0   | Yes, image and agent policy measured | Yes, data loaded per permit (below)                        | Node-level now (A1), per pod via peer pods (A2) | Simulated, two depths |
| B. AKS `KataCcIsolation`       | ADR-052                                                                                                         | No: Azure Attestation and Key Vault                                    | Partly       | Yes                                  | Yes                                                        | **Ends 31 Oct 2026**                            | No                    |
| C. AKS CVM node pool alone     | Whole node is a SEV-SNP VM, Azure Attestation                                                                   | No                                                                     | n/a          | No, node only                        | Unchanged                                                  | GA                                              | No                    |
| D. Contrast                    | Manifest and coordinator over Kata                                                                              | Yes                                                                    | **No** (BSL) | Yes, per deployment                  | Yes                                                        | Bare metal docs                                 | No                    |
| E. ACA DC profile              | VM-level workload profile                                                                                       | No                                                                     | n/a          | No                                   | Unchanged                                                  | UAE North only                                  | No                    |
| F. SGX (Gramine and wrappers)  | Process enclave                                                                                                 | Partly                                                                 | Mixed        | Enclave                              | Poor: JVM heap versus enclave memory; SGX is being retired | Older sizes                                     | No                    |
| G. Enclaive                    | Commercial confidential K8s                                                                                     | Yes                                                                    | No           | Yes                                  | Catalogue                                                  | Yes                                             | No                    |

## Decision

1. **The SPE is built on CNCF Confidential Containers, and the access body
   runs the Trustee.** Kata Containers with the CoCo guest components on
   SEV-SNP or TDX; Trustee (KBS, Attestation Service, RVPS) operated by the
   HDAB persona's organisation, not by the hub operator and not by a cloud
   provider. All Apache-2.0. Azure Attestation and Key Vault are not in the
   key path. This keeps ADR-037's pattern and drops ADR-052's Azure-specific
   verifier.

2. **The permit is the policy, and the policy hash opens the data.** At
   approval the hub records the SHA-256 of the pod's Kata agent policy
   (`genpolicy`) on the data permit, as ADR-052 intended. The access body
   loads that hash into the Trustee's reference values (RVPS) and binds the
   permit's dataset key to it in the KBS resource policy. Only a pod whose
   evidence carries that policy, on genuine hardware, gets the key. A failed
   attestation means no key and no data, which is the fail-closed behaviour
   ADR-037 asks for. Each release is written to the audit chain (ADR-045).

3. **Neo4j in the SPE is a per-permit workspace, not a long-lived store.** The
   holder's extract for a permit (Art. 73(2): holders upload into the
   environment) is stored outside as an encrypted dump. An init container in
   the SPE pod attests, fetches the key from the Trustee through the
   Confidential Data Hub, decrypts and loads the dump into a Neo4j Community
   whose store lives in guest memory or a confidential `emptyDir`. The
   workspace opens with the permit and is destroyed with it (#716). This
   avoids the one thing CoCo cannot do yet, a persistent volume with an
   attested key, and the rollback attack that comes with it. Sizing: Neo4j
   heap plus page cache plus about 2 GiB for the micro-VM, all in `limits`.
   The Art. 71 opt-out filter (ADR-062) and k = 5 run inside, as today.

4. **One design, three depths, each labelled for what it proves.**

   | Where                                    | Hardware       | What is real                                                                                                                                                                                                                                                                                                                                                                                        | Label in the UI              |
   | ---------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
   | **Mac, everyday (M1)**                   | none           | Trustee in Compose, the permit hash in its policy, key release, the encrypted extract, Neo4j loading it, the audit record. Evidence from the sample attester                                                                                                                                                                                                                                        | "Simulated attestation"      |
   | **Mac, runtime check (M2, optional)**    | none           | M1 plus a Kata micro-VM and its agent policy, in a Lima VM with nested virtualization and `kata-qemu-coco-dev-runtime-rs` on arm64                                                                                                                                                                                                                                                                  | "Simulated attestation"      |
   | **Azure, node level (A1)**               | SEV-SNP        | An AKS node pool of confidential VMs in West Europe (`Standard_DC4as_v5`, about $0.21 an hour, stopped off hours per ADR-053). The SPE pod's init container sends the node's vTPM and SEV-SNP evidence to the access body's Trustee, which verifies it with `az-snp-vtpm-verifier`. Proves the memory is encrypted on genuine AMD hardware with a measured boot; does not prove which container ran | "Attested: SEV-SNP node"     |
   | **Azure or EU bare metal, per pod (A2)** | SEV-SNP or TDX | Full CoCo: the Kata agent policy measured per pod, so the permit's policy hash is checked by hardware. Via peer pods on AKS once their Azure tests run again, or on bare-metal SEV-SNP/TDX nodes at an EU provider                                                                                                                                                                                  | "Attested: confidential pod" |

   The CI and the static demo use M1. The live hub shows A1 for the one SPE
   that is attested and "Simulated attestation" everywhere else.
   `SPESession.simulated` becomes false only for an A1 or A2 session, and
   `teeType` and a new `attestationScope` (`node` or `pod`) say which.

5. **Sovereignty is stated, not implied.** On Azure the residual trust is
   AMD's root of trust and Microsoft's paravisor in the measured launch; the
   UI and docs say so. Full sovereignty is A2 on bare metal at an EU provider.
   Candidates to verify before choosing one: IONOS (SEV-SNP confidential VMs
   in Frankfurt), OVHcloud bare metal (SEV-SNP not confirmed), and
   OpenStack-based clouds such as STACKIT and Open Telekom Cloud once they
   adopt Nova 2026.2 with SEV-SNP and TDX instances. AWS's European Sovereign
   Cloud has no SEV-SNP.

6. **Timing: M1 now, A1 when an access-body demonstration is scheduled.** M1
   costs nothing and makes the flow testable in CI. A1 starts on ADR-052's
   triggers (#27 demo, partner data-governance talk, the Art. 73(5)
   implementing act due 26 March 2027). A2 starts when peer pods are tested
   on Azure again or a sovereign bare-metal host is chosen.

## Consequences

- Every component in the trust path is Apache-2.0 (CoCo, Kata, Trustee) or
  GPLv3 (Neo4j Community). No vendor licence, no Azure-only service.
- The access body can verify an SPE from outside with its own Trustee. That
  is the role ADR-037 gave Contrast's `contrast verify`, without the BSL.
- The SPE's Neo4j becomes ephemeral per permit. A researcher's session
  survives a pod restart only by reloading the extract; that matches Art. 73
  (nothing row-level stays) and costs a load time per workspace, to be
  measured on the 108-patient SPE-2 extract.
- A1 is weaker than A2 and is labelled so. The temptation is to let "attested"
  on A1 read as per-workload proof; the `attestationScope` field exists to
  stop that.
- New moving parts: a Trustee deployment for the access body (Compose locally,
  a small deployment on Azure), an encrypted-extract format and its key per
  permit, an AKS cluster beside ACA for A1. ACA stays the home of everything
  that does not touch row-level data.
- Risks: CoCo releases move fast and the arm64 non-TEE runtime has thin CI
  (M2 may break between releases; M1 does not depend on Kata). Confidential
  VM I/O overhead hits a database; measure before quoting numbers. TDX is not
  available on AKS, so A1 is SEV-SNP only.
- `docs/spe-contrast-migration.md` becomes history for the Contrast path; the
  plan for this ADR replaces it when M1 starts.

## Not decided here

- The encrypted-extract format (Neo4j dump encrypted with age or AES-GCM, or
  an OMOP export loaded by the existing seed) and how the holder uploads it.
- Which EU provider hosts A2, until one confirms SEV-SNP or TDX to customers
  and a Kubernetes path on it.
- Whether the access body's Trustee runs on the hub's Azure subscription for
  the demo. For the claim to hold, it should be operated as if by MedReg DE,
  separate from the hub's own identities.

## References

- Regulation (EU) 2025/327, Art. 73; the TEHDAS2 SPE specification (D7.4)
- [Confidential Containers](https://confidentialcontainers.org/),
  [Trustee](https://github.com/confidential-containers/trustee),
  [Kata Containers](https://github.com/kata-containers/kata-containers),
  [cloud-api-adaptor](https://github.com/confidential-containers/cloud-api-adaptor)
- [AKS confidential containers](https://learn.microsoft.com/en-us/azure/aks/confidential-containers-overview)
  and the [Azure Linux 2.0 retirement](https://github.com/Azure/AKS/issues/4988)
- [AKS confidential VM node pools](https://learn.microsoft.com/en-us/azure/aks/use-cvm),
  [DCasv5 sizes](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/dcasv5-series)
- [Contrast](https://github.com/edgelesssys/contrast),
  [IONOS confidential VMs](https://docs.ionos.com/cloud/compute-services/compute-engine/confidential-computing-vm.md),
  [OpenStack Nova 2026.2](https://docs.openstack.org/releasenotes/nova/2026.2.html)
- Prices: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices),
  Linux pay as you go, 2026-10-30
