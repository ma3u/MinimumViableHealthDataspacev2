# Moving the secure processing environment to Contrast

**Status:** implementation plan for phase 2 of
[ADR-037](ADRs/ADR-037-secure-processing-environment-confidential-computing.md).
**Tracks:** [#27](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/27)
**Article numbers:** as adopted. The secure processing environment is
**Art. 73** of Regulation (EU) 2025/327, not Art. 50, which was its number in the
2022 proposal. See [`ehds-article-numbering.md`](ehds-article-numbering.md).

## Where this stands today

Phase 1 shipped. `SPESession` in `neo4j/seed-trust-center.cypher` carries the
fields a real attestation produces (`teeType`, `policyHash`,
`coordinatorEndpoint`, `attestedAt`, `verifiedBy`, alongside
`approvedCodeHash`), every digest is a real SHA-256 of a named input, and
`simulated: true` is a field the UI renders as "Simulated attestation" in
`ui/src/app/api/graph/node/route.ts` rather than a footnote nobody reads.

Nothing is attested. The environment is an ordinary container. Phase 2 is the
work of making the word true, and this document is how.

## The blocker, stated first

Contrast does not run on Azure Container Apps, and the demonstrator is on Azure
Container Apps (ADR-012).

Contrast installs a Kubernetes `RuntimeClass` named `contrast-cc` plus a
DaemonSet that prepares each worker node, and it then runs each pod as its own
confidential micro-VM through Kata Containers. Container Apps exposes neither a
node pool nor a runtime class. There is no configuration of ACA that gets there.

So phase 2 is not a deployment change, it is a second runtime. Two ways to get
one:

| Option                                           | What it costs                                                                                                                                     | Verdict                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **AKS with a Confidential Containers node pool** | A node pool in the same subscription, on AMD SEV-SNP confidential VM sizes (DCa/ECa v5 family), Azure Linux, `--workload-runtime KataCcIsolation` | **Start here.** It is a node pool, not a data centre. |
| Bare metal K3s, SEV-SNP or TDX                   | BIOS work, AMD firmware in `/lib/firmware/amd`, kernel 6.11 or newer, a block storage provider, and TCB values filled in by hand                  | Only if sovereignty rules out the cloud.              |

AKS also matters for a second reason: on bare metal, `contrast generate` cannot
fill in the minimum TCB values (`MinimumTCB` on SEV-SNP, `MinimumTeeTcbSvn` and
`MrSeam` on TDX) because they vary by CPU model, and you end up reading them out
of error messages. On AKS they are filled in for you.

## What moves, and what stays

Only the workload that touches row-level personal data under a permit. Today
that is the analysis workload behind `/analytics` and `/query`.

| Component                          | Where it goes | Why                                                                                |
| ---------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| The analysis workload              | Contrast      | It is the only thing whose operator needs to be outside the trust boundary         |
| Neo4j, UI, Keycloak, EDC, Vault    | Stays on ACA  | Putting a UI in a confidential VM buys nothing and costs a node                    |
| The data path into the environment | Contrast      | The holder uploads into the environment; the user never gets the rows (Art. 73(2)) |

There is a hard sizing reason not to move everything: each pod becomes one CVM,
and the VM's memory is the sum of the containers' memory **limits** plus a fixed
`RuntimeClass` overhead. A Neo4j in a CVM is an expensive way to gain nothing.

## The migration, step by step

Version numbers below are placeholders. Check the current release first;
Contrast was at 1.24 when this was written.

**0. A CoCo-enabled cluster.** An AKS cluster with a node pool created with
`--workload-runtime KataCcIsolation`, the Azure Linux `os-sku`, and a
confidential VM size.

**1. Install the runtime.** Once per runtime version, shared by every Contrast
deployment on the cluster:

```bash
kubectl apply -f https://github.com/edgelesssys/contrast/releases/download/vX.Y.Z/runtime-aks-clh-snp.yml
```

**2. Fetch the Coordinator.** A single-replica Deployment plus a LoadBalancer
Service:

```bash
curl -fLO https://github.com/edgelesssys/contrast/releases/download/vX.Y.Z/coordinator.yml \
  --output-dir deployment
```

**3. Prepare the workload manifests.** Three changes, all of them on the SPE
workload only:

- `runtimeClassName: contrast-cc` in the pod spec.
- An explicit `resources.limits.memory` on **every** container, because that sum
  plus the runtime overhead is the size of the VM. Init containers are not
  counted, so an init container that needs a lot of memory has to be accounted
  for on another container's limit.
- Images pinned by digest, not by tag. The policy is derived from the image, so
  a moving tag means a manifest that stops matching.

**4. Generate the policies and the manifest.**

```bash
contrast generate --reference-values aks-clh-snp resources/
```

This injects the Contrast Initializer into every workload with the
`contrast-cc` runtime class, adds the service mesh where configured, derives an
execution policy per workload and writes it as an annotation, and produces
`manifest.json` with the reference values. It also writes, into the working
directory, three files that are now operational secrets:

| File                          | What it is for                                       | If you lose it                                          |
| ----------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `seedshare-owner.pem`         | Recovering the Coordinator after a restart           | Every new workload blocks, permanently                  |
| `workload-owner.pem`          | Updating the manifest after the first `contrast set` | You cannot approve new analysis code without a redeploy |
| `rules.rego`, `settings.json` | The basis of the runtime policies                    | Regenerable                                             |

The first two belong in Key Vault on day one, under ADR-036, not in somebody's
working directory.

**5. Apply.** The workloads start and then block, deliberately, until a manifest
is set:

```bash
kubectl apply -f resources/
```

**6. Set the manifest.** This is the operator's act:

```bash
coordinator=$(kubectl get svc coordinator -o=jsonpath='{.status.loadBalancer.ingress[0].ip}')
contrast set -c "${coordinator}:1313" resources/
```

The CLI attests the Coordinator against the manifest's reference values. Only
then does the Coordinator begin issuing workload certificates, the Initializer
fetches one, and the workload actually starts.

**7. Verify. This is the access body's act, and the whole point.**

```bash
contrast verify -c "${coordinator}:1313"
```

The CLI attests the Coordinator using the reference values in the manifest it
was given, then writes `verify/mesh-ca.pem`, the history of manifests, and the
policies referenced by the active manifest. **It fails if the manifest active at
the Coordinator is not the one being verified.** An HDAB can run this from its
own laptop, against an environment somebody else operates, and needs nothing
from that operator to do it.

That is the sentence worth rehearsing before a regulator: today they audit an
SPE by reading the operator's documentation, and after this they verify a
hardware-rooted measurement of what actually ran.

**8. Plan for recovery.** If the Coordinator pod restarts it loses the key
material it held in memory and enters recovery mode. Workloads stay in
initialisation until someone with the seed share owner key runs:

```bash
contrast recover -c "${coordinator}:1313"
```

This is an operational duty with a person attached to it, not a footnote. It is
exactly the kind of thing the support model in
[`ehds-operating-company.md`](ehds-operating-company.md) has to own, and a good
argument for why an operating company is a role rather than a server.

### Two things that will waste an afternoon

- `kubectl port-forward` does not work against a Contrast pod. It uses a CRI
  method the Kata shim does not implement. Use the LoadBalancer, or a small
  `socat` relay pod onto port 1313.
- GPU passthrough works on SEV-SNP only, not TDX. If an analysis workload needs
  a GPU, that decides the platform.

## What changes in this repository

| Change                                                                                                                                        | Where                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `teeType`, `policyHash`, `coordinatorEndpoint`, `attestedAt`, `verifiedBy` stop being seeded and start being written by the verification step | `neo4j/seed-trust-center.cypher`, and whatever writes `SPESession` |
| Add `manifestHash`, which ADR-037 specified and phase 1 did not ship                                                                          | `neo4j/init-schema.cypher`                                         |
| The HDAB persona's "verify environment" action calls the Coordinator instead of reading a stored string                                       | the Trust Center surface                                           |
| `simulated: true` is removed only where the value became real, and stays everywhere else                                                      | the seed, and `ui/src/app/api/graph/node/route.ts`                 |
| A journey test that **fails** when the active manifest does not match, because ADR-031 requires a check to assert                             | `ui/__tests__/e2e/journeys/`                                       |

The shape of `SPESession` was chosen in phase 1 precisely so this is a
substitution rather than a redesign. Nothing above changes the graph model.

## Phase 3: the permit becomes the manifest

Once the Coordinator is real, approving a data permit can emit the manifest
entry for the approved analysis image digest, and `contrast set` becomes the act
of enforcement rather than a separate operational step that happens to agree
with the approval.

That is the claim worth making to an access body, because it collapses two
systems that today agree only by convention. It needs phase 2 first, and it
should not be described as available before it is.

## Cost, licence, and the honest caveats

- **Licence.** Contrast is under the Business Source License: non-production use
  is permitted, production needs a commercial licence from Edgeless Systems.
  A demonstrator shown to a ministry sits close enough to that line to be worth
  a written answer before the demo rather than after it.
- **It does not scale to zero.** ADR-023 and ADR-027 put the current stack on an
  off-hours scaledown. A confidential node pool is a node that is either running
  or being provisioned, so phase 2 has a monthly number attached to it in a way
  phase 1 did not.
- **It is a second runtime to operate.** ACA and AKS, two deployment paths, two
  sets of failure modes. Worth it when there is a reason to attest something;
  not worth it for a slide.
- **Do not claim it before it is true.** Phase 1 exists so the claim is not made.
  The line that works is: this is the model, the same pattern already carries
  German health data at national scale, and here is the plan for wiring it up.

## Sources

- Contrast documentation, Edgeless Systems: <https://docs.edgeless.systems/contrast>
  (workload deployment, bare-metal preparation, secrets and recovery)
- Contrast product page: <https://www.edgeless.systems/products/contrast>
- Confidential Containers on AKS:
  <https://learn.microsoft.com/en-us/azure/aks/deploy-confidential-containers-default-policy>
- Confidential VM node pools on AKS with AMD SEV-SNP:
  <https://learn.microsoft.com/en-us/azure/confidential-computing/confidential-node-pool-aks>
- Regulation (EU) 2025/327, Art. 73: <http://data.europa.eu/eli/reg/2025/327/oj>
- [ADR-037](ADRs/ADR-037-secure-processing-environment-confidential-computing.md),
  which decides the pattern and explains why it is named after gematik's VAU
  requirement for the ePA.
