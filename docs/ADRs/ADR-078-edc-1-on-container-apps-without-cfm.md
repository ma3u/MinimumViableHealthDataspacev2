# ADR-078: EDC 1.0 stays on Container Apps, and the hub provisions participants without CFM

**Status:** Proposed (2026-11-05)
**Date:** 2026-11-05
**Supersedes:** [ADR-076](ADR-076-edc-1-runtimes-are-built-here.md), once accepted
**Relates to:** [ADR-012](ADR-012-azure-container-apps.md), [ADR-055](ADR-055-azure-runs-the-compose-jad-build.md), [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-077](ADR-077-a-minimal-set-of-standard-data-sharing-policies.md)
**Tracks:** [Issue #881](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/881)

## Context

ADR-076 decided to build the EDC 1.0 runtimes in this repository and to take
CFM from eclipse-cfm's release images. Two of its premises turned out wrong,
and moving CFM showed what eclipse-cfm now expects.

**JAD moved; it did not stall.** [eclipse-dataspace-hub/jad](https://github.com/eclipse-dataspace-hub/jad)
exists since 2026-05-19, runs EDC `1.0.0-SNAPSHOT` and was pushed on
2026-10-30. Only the old `metaform/jad` stopped in May. ADR-076 looked only
there.

**Upstream 1.0 images exist, built for Kubernetes.** eclipse-cfm publishes
`ghcr.io/eclipse-cfm/platform-images/{controlplane,identityhub,issuerservice}`
(`0.0.1-rc.9`, built 2026-10-26 from EDC `1.0.0-SNAPSHOT`), siglet and its
agents. The [core-platform-distribution](https://github.com/eclipse-cfm/core-platform-distribution)
Helm chart (0.0.37) deploys them together; Eclipse JAD installs it on KinD.

**The new CFM needs that Kubernetes.** Every agent authenticates by token
exchange at **jwtlet**, presenting its pod's projected ServiceAccount token
(`tokenexchange.tokenFilePath: /var/run/secrets/jwtlet/token`). jwtlet is also
the OAuth issuer the control plane, IdentityHub and IssuerService trust, in
place of Keycloak. The Keycloak agent is gone; IdentityHub, siglet, jwtlet and
certo agents are new. Adopting the new CFM is adopting that security model.

**Keeping today's CFM does not work either.** Measured on the local 1.0 stack
on 2026-11-05: the 2026-03 agents call the IdentityHub's and IssuerService's
`v1alpha` APIs, which 1.0 answers with 404. With a shim forwarding those to
`v1`, the agents created the IdentityHub participant and the issuer holder,
and then the IdentityHub refused the credential request: "Property 'holderPid'
must not be set, it is assigned by IdentityHub". The old agent sets that id
and polls by it, so no path rewrite can bridge it; only a patched fork of the
2026-03 CFM could.

**Participants can be provisioned on 1.0 without CFM, measured.** From empty
databases, the repository's seeds create the participant context, the
IdentityHub participant (DID, key under a fresh alias), the context config and
DSP profile link, the issuer holder and the DCP MembershipCredential, and the
three compliance suites then match 0.18 (identity 27/0/0, dataspace 32/0/1,
health domain 27/0/3), as does the hub's live DSP flow (#881).

**Cost does not decide it.** Azure billed €741 a month on Container Apps
(ADR-053; 21 apps, 9.5 vCPU, 19 GiB, office hours). A node pool of the same
size (3 × D4s_v5, West Europe, €0.2065 an hour each) is about €150 a month on
office hours and €450 around the clock, before the control plane tier, load
balancer and disks. The difference is the work: every `scripts/azure` phase,
the deploy workflows, secrets by Key Vault reference, the off-hours schedule
(ADR-058), local development on KinD instead of Compose, and jwtlet in place
of Keycloak for service tokens.

## Decision

1. **The 1.0 cutover keeps the platform:** Container Apps on Azure, Compose
   locally (ADR-012, ADR-055 unchanged).
2. **CFM leaves the 1.0 stack.** The hub provisions a participant itself, on
   the server, with the sequence the seeds run on 1.0: control plane context,
   IdentityHub participant, context config and DSP profile, issuer holder,
   MembershipCredential over DCP; on failure it removes what it created, in
   reverse order. The onboarding page calls that instead of CFM's tenant
   manager, and the participant list comes from the control plane's contexts.
   The Azure apps tenant manager, provision manager, the four agents and the
   shim are retired after the cutover.
3. **The runtimes stay our own launchers** (ADR-076 decisions 1, 4, 5, 6),
   now for a corrected reason: they are proven on 1.0, carry our two
   extensions, and are built from released artifacts, where the platform
   images are built from snapshots. They are revisited when eclipse-cfm
   publishes images built from a released 1.0.
4. **The two launcher extensions are accepted:** `DemoAttestationsExtension`
   (membership attested for every registered holder, a demo shortcut as it was
   in JAD) and `EhdsPolicyVocabularyExtension` (the EHDS terms declared for
   validation, not enforced, as on 0.18; enforcement is #881 finding 21).
5. **The data plane is siglet**, the transfer endpoint the neo4j-proxy's
   `/dataspace/data` (replacing ADR-076 decision 2, the Java data plane).
6. **Kubernetes is its own decision.** A local spike of Eclipse JAD on KinD
   with our extensions and the EHDS seeds, then an ADR on AKS. It is not a
   precondition for the cutover.

## Consequences

- The cutover is unblocked without changing the platform, and without
  depending on a pre-1.0 CFM whose agents assume Kubernetes.
- We diverge from upstream's SaaS architecture: no multi-tenant CFM, no
  jwtlet. Decision 6 is how we find out what converging would cost.
- The provisioning code becomes ours. It is small and already proven as
  seeds; it needs a route, tests, and the compensation CFM gave for free.
- Seven hub API routes call CFM today (`/api/participants` and its children,
  `/api/admin/tenants`, the two component routes). They move to the control
  plane and the new provisioning, or show that CFM is gone.
- Six Azure apps fewer after the cutover.
- The tenant model (tenants, participant profiles, VPAs) leaves the hub. A
  participant is its control plane context.

## Alternatives considered

- **Shim the 2026-03 CFM agents to 1.0.** Fails on `holderPid`, measured; a
  path rewrite cannot carry it.
- **Fork the 2026-03 CFM and patch it.** We would own an unmaintained Go
  codebase to keep a feature the seeds already cover.
- **Kubernetes now (core-platform-distribution on AKS).** Upstream's path,
  and decision 6 keeps it open, but it changes the platform, local
  development and the service-token model at once, for a cutover that does
  not need it.
- **eclipse-cfm's platform images in place of our launchers.** Built from
  snapshots, without our two extensions; deferred to decision 3's revisit.
