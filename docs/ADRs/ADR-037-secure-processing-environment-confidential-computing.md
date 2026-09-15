# ADR-037: A secure processing environment built on confidential computing, not on trust in the operator

**Status:** Proposed
**Date:** 2026-09-14
**Relates to:** [ADR-012](ADR-012-azure-container-apps.md), [ADR-022](ADR-022-edc-connector-cost-vs-function.md)
**Tracks:** [#27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27)

## Context

EHDS Art. 73 requires that secondary use of health data happens inside a secure
processing environment: the researcher gets results out, never the row-level
data, and the environment is auditable by the access body that authorised it.

The demonstrator already models this. `neo4j/init-schema.cypher` declares
`SPESession` with the comment "TEE-attested Secure Processing Environment
sessions", the Trust Center seeds two sessions with `attestation` and
`approvedCodeHash` fields, and the graph shows them.

Nothing stands behind any of it. The digests are invented, the environment is
an ordinary container like every other container in the deployment, and the
word "TEE-attested" is a label rather than a claim anyone could check. One of
the two seeded digests was not even valid hexadecimal: it ran `g` through `z`
for 64 characters, which is a thing a regulator's engineer notices in the
thirty seconds after you tell them the environment is attested.

That gap matters more than the usual demo shortcut, because the question an
access body actually asks about an SPE is precisely the one a label cannot
answer: **what stops the operator of the environment from reading the data?**

### What the German ePA already does about this

gematik's answer for the ePA is the _Vertrauenswürdige Ausführungsumgebung_
(VAU): the operator of the infrastructure and the backend must demonstrably
have no access to health data. Demonstrably, not contractually.

That requirement is met in production today with confidential computing. The
ePA runs sensitive components inside hardware-isolated environments on Intel
confidential computing CPUs, using software from
[Edgeless Systems](https://www.edgeless.systems/) together with IBM. The
overall solution is approved by gematik and serves up to 50 million insured
people across AOK, Barmer and Techniker Krankenkasse.

So the pattern this project needs for Art. 73 is not hypothetical, and it is
not a research prototype. It is deployed national infrastructure in the same
member state, answering the same question one regulation over.

### Why this is worth doing here rather than describing

A demonstrator that models an SPE as "a container we promise not to look in"
teaches the wrong thing to the people whose job is to authorise these
environments. The interesting part of an SPE is not that computation happens
somewhere else; it is that the party running it is outside the trust boundary
and can prove it.

## Decision

Model the secure processing environment on **confidential containers with
remote attestation**, and target
[Contrast](https://www.edgeless.systems/products/contrast) from Edgeless
Systems as the concrete implementation.

Contrast runs unmodified Kubernetes pods inside confidential micro-VMs, built
on the open-source Kata Containers project, on AMD SEV-SNP or Intel TDX. Its
architecture maps onto the EHDS roles almost one to one:

| Contrast concept                                                                                                         | EHDS role it serves                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Manifest: a JSON file listing cryptographic hashes of every approved workload                                            | The data permit, expressed in a form a machine can enforce. The HDAB approves _this_ analysis code, not "an analysis". |
| Policy hash in `HOSTDATA` (SEV-SNP) or `MRCONFIGID` (TDX), placed there by the hypervisor and checked by the guest agent | Evidence that the pod that ran is the pod that was approved, rooted in the CPU rather than in the operator's word      |
| Coordinator: an attestation service that itself runs in a confidential container and holds the manifest                  | The thing an access body attests against, once, instead of auditing every workload                                     |
| Workload certificates issued only to pods whose policy is in the manifest                                                | Unapproved code cannot join the deployment or reach the data                                                           |
| `contrast verify` against the Coordinator's remote attestation statement                                                 | The audit step, runnable by the HDAB itself, from outside, without asking the operator for anything                    |

The last row is the one that changes the conversation. Today an access body
audits an SPE by reading the operator's documentation. With an attestation
statement it verifies a hardware-rooted measurement of what actually ran, and
the operator is not in the trust path.

### What changes in this repository

**Phase 1, the honest model (this ADR).** Stop claiming more than is true and
make the shape right, so the later phases are a substitution rather than a
redesign.

- `SPESession` carries the fields a real attestation produces: `teeType`,
  `manifestHash`, `policyHash`, `coordinatorEndpoint`, `attestedAt`,
  `verifiedBy`, alongside the existing `approvedCodeHash`.
- Every digest in the seed is a real SHA-256 of a named, reproducible input,
  so nobody has to wonder whether it means anything, and no digest can be
  invalid hex again.
- The UI states plainly which of these are simulated. A demonstrator that
  labels its own simulation is more credible than one that does not, and
  markedly more credible than one caught doing it.

**Phase 2, verification against a real Coordinator.** Run Contrast on a
Kubernetes cluster with SEV-SNP or TDX nodes, deploy the analysis workload into
it, and have the HDAB persona's "verify environment" action call the real
attestation path rather than read a stored string. The graph then records the
manifest that was verified and when.

**Phase 3, the permit becomes the manifest.** The HDAB approving a data permit
produces the manifest entry for the approved analysis code. Approval and
enforcement stop being two systems that agree by convention.

### What this does not decide

Contrast is licensed under the Business Source License: non-production use is
permitted, production needs a commercial licence from Edgeless Systems. Phase 1
needs no licence. Phase 2 does, or a conversation, and that is a commercial
decision rather than an architectural one. The architecture here is confidential
containers with remote attestation, and it would survive substituting another
implementation of the same pattern; Contrast is named because it is the one
already carrying German health data at national scale, which is worth a great
deal when the audience is a health ministry.

Nothing about this changes the participants in the demonstrator, who stay
fictional as `.claude/rules/code-style.md` requires. Edgeless Systems appears
here as the vendor of a technology being evaluated, not as a participant in the
synthetic dataspace, and it should not appear in seed data.

## Consequences

**Good.** The SPE stops being the least convincing part of the walkthrough and
becomes the most. "The operator cannot read it, and here is the measurement you
can check yourself" is a better answer than anything the current model supports.
It connects the demonstrator to infrastructure the German audience already
trusts. And it gives the permit step a purpose beyond bookkeeping, because a
manifest is a permit that enforces itself.

**Costs.** Confidential nodes cost more than ordinary ones and are not
available in every region or on Azure Container Apps, which is where this
project runs today (ADR-012). Phase 2 therefore needs a Kubernetes cluster
alongside the current deployment, not a change to it. Attestation also adds a
real failure mode: a verification that fails must block the run, and a
demonstrator that swallows that failure to keep the demo moving would be worse
than having no attestation at all.

**Risk.** Phase 1 improves honesty without proving anything. The danger is
stopping there and letting richer-looking fields read as a stronger claim than
before. The UI labelling is not decoration; it is what keeps Phase 1 from being
a more sophisticated version of the problem it fixes.

## References

- [Edgeless Systems](https://www.edgeless.systems/), and their account of the
  [ePA deployment](https://www.edgeless.systems/de/resource-library/epa)
- [Contrast documentation](https://docs.edgeless.systems/contrast), including
  [policies](https://docs.edgeless.systems/contrast/components/policies) and
  the [security overview](https://docs.edgeless.systems/contrast/1.8/basics/security-benefits)
- [Attestation in Contrast](https://docs.edgeless.systems/contrast/1.5/architecture/attestation)
- [gematik, ePA für alle](https://www.gematik.de/anwendungen/epa-fuer-alle)
- EHDS Art. 73 (secure processing environment) and Art. 67 to 69 (applications,
  permits, requests), in the numbering of the adopted Regulation. This ADR was
  written against the 2022 proposal numbering; see
  [`../ehds-article-numbering.md`](../ehds-article-numbering.md)
- [`../spe-contrast-migration.md`](../spe-contrast-migration.md), how phase 2 is
  actually carried out
- `neo4j/init-schema.cypher`, `neo4j/seed-trust-center.cypher`
