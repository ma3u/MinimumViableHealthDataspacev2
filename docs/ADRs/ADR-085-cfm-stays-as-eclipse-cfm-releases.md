# ADR-085: CFM stays, as eclipse-cfm's releases, behind a token exchange the hub provides

Date: 2026-11-09

**Status:** Accepted (2026-11-09, Matthias Buchhorn)
**Supersedes:** [ADR-078](ADR-078-edc-1-on-container-apps-without-cfm.md) decision 2 (CFM leaves the 1.0 stack), once decision 3 below is met
**Relates to:** [ADR-012](ADR-012-azure-container-apps.md), [ADR-053](ADR-053-everything-stops-off-hours.md), [ADR-055](ADR-055-azure-runs-the-compose-jad-build.md), [ADR-076](ADR-076-edc-1-runtimes-are-built-here.md)
**Tracks:** [#973](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/973), [#927](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/927)

## Context

ADR-078 took CFM out of the EDC 1.0 stack on 2026-11-05 for two measured
reasons: the 2026-03 CFM agents (Metaform/cfm-fulcrum) set `holderPid` on a
credential request, which IdentityHub 1.0.0-RC5 refuses, and the new CFM
authenticates its agents through jwtlet, which needs Kubernetes. Since then
eclipse-cfm released three versions, and the first reason is gone.

**The `holderPid` blocker is fixed upstream, for the version we run.**
[v0.0.5](https://github.com/eclipse-cfm/cfm/releases/tag/v0.0.5) (2026-10-22)
contains [eclipse-cfm/cfm#190](https://github.com/eclipse-cfm/cfm/pull/190):
the onboarding agent no longer sends `holderPid` and reads the one IdentityHub
assigns from the `Location` header. Its description names the same error
ADR-078 measured and says it "breaks participant onboarding with EDC
1.0.0-RC5". [v0.0.4](https://github.com/eclipse-cfm/cfm/releases/tag/v0.0.4)
had already moved the agents to the stable APIs (IdentityHub `v1`, control
plane `v5`, [#182](https://github.com/eclipse-cfm/cfm/pull/182)), so the
`cfm-cp-shim` path rewrite is not needed.
[v0.0.7](https://github.com/eclipse-cfm/cfm/releases/tag/v0.0.7) (2026-11-06)
is a hardening release: NATS authentication, bounded retries, orchestrations
that resume after a failed start, durable JetStream consumers, admin scopes
and tenant ownership on both manager APIs, and token caching
([#217](https://github.com/eclipse-cfm/cfm/pull/217)). All ten images are
published at `ghcr.io/eclipse-cfm/cfm/<name>:0.0.7`.

**Upstream positions CFM as the provisioning layer for EDC 1.0.** The
[JAD README](https://github.com/eclipse-dataspace-hub/jad/blob/38284906523920d65d1b0d35b51f3a67fb72c287/README.md#components)
lists CFM among the components "such a dataspace requires, at a minimum". The
[core-platform-distribution chart](https://github.com/eclipse-cfm/core-platform-distribution/blob/v0.0.39/Chart.yaml)
(v0.0.39, 2026-11-06) deploys the EDC components, siglet, jwtlet and the CFM
managers and agents together, the agents at `0.0.5`
([values.yaml](https://github.com/eclipse-cfm/core-platform-distribution/blob/v0.0.39/values.yaml)),
and JAD pins that chart ([`38284906`](https://github.com/eclipse-dataspace-hub/jad/commit/38284906)).
The CFM planning board closed the final release of the Onboarding API on
2026-11-09 ([planning#78](https://github.com/eclipse-cfm/planning/issues/78))
and lists "Adopt EDC-V and CFM implementations" as the product release
([planning#80](https://github.com/eclipse-cfm/planning/issues/80)).

**CFM's model is not tied to Kubernetes; its token exchange is.** The
[architecture](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/docs/developer/architecture/system.architecture.md)
says a cell "could be a Kubernetes cluster or some other infrastructure". The
manager APIs validate OAuth2 tokens of any OIDC issuer
([decision record](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/docs/developer/decision_records/2026-06-01-mandatory-authn_authz/README.md)),
so Keycloak can issue them. The agents are different: they obtain every EDC
API token by RFC 8693 exchange of a subject token read from a file
([`tokenprovider.go`](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/common/tokenexchange/tokenprovider.go#L109-L128)),
v0.0.7 removed the only other provider, and
[jwtlet](https://github.com/eclipse-cfm/jwtlet#readme) validates that subject
token against a Kubernetes API server and TokenReview. The exchange URL is
configuration (`tokenexchange.url`), and the provider re-reads the file on
every call because it expects rotation.

**What the hub's own provisioning does not do.**
[`ui/src/lib/edc/provision.ts`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/416b75c2/ui/src/lib/edc/provision.ts#L15-L17)
still lacks the participant's signing-key mapping in siglet (#881 finding 23),
which CFM's siglet agent does. It has no dispose that revokes credentials
(v0.0.5, [#183](https://github.com/eclipse-cfm/cfm/pull/183)), no retry, and
no resume after a crash halfway. CFM's participant profile is per DID and per
dataspace profile
([architecture](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/docs/developer/architecture/system.architecture.md#the-participant-profile)),
which is what #934's second data space needs.

**Cost.** The seven CFM apps that run on Azure today (tenant manager,
provision manager, four agents, the shim) are 0.25 vCPU and 0.5 GiB each
([`constants.tsx` L107-L116](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/416b75c2/ui/src/app/admin/components/_components/constants.tsx#L107-L116)).
At the rates in
[`azure-pricing.ts` L24-L25](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/416b75c2/ui/src/lib/azure-pricing.ts#L24-L25)
and office hours (ADR-053, about 282 hours a month) that is about €8 per
container and €57 a month for the seven. A v0.0.7 layout has eight or nine
containers (two managers, six agents, possibly the token exchange of decision
2): about €65 to €73 a month, against €0 without CFM. ADR-053's whole
environment was €741 a month.

## Decision

1. **CFM stays the provisioning layer, on eclipse-cfm's releases.** We run
   the published `ghcr.io/eclipse-cfm/cfm/*` images at a release tag, pinned
   by digest, today `0.0.7`, against our own EDC 1.0 launchers (ADR-078
   decision 3 unchanged). The 2026-03 build from Metaform/cfm-fulcrum, its
   Keycloak agent and `cfm-cp-shim` are retired as #927 planned: ADR-078's
   measurement of them stands.
2. **The token exchange is bridged, not replaced.** On Compose and Container
   Apps there is no Kubernetes API server for jwtlet. We take the smallest of
   these that works, measured in this order:

   1. Keycloak 26.8's standard token exchange as `tokenexchange.url`, with a
      sidecar that writes a client-credentials token of a `cfm-agents`
      client to the shared file and renews it (on Container Apps an
      `EmptyDir` volume shared by the agent containers); the orchestration
      definition without the jwtlet activity, if no later activity needs its
      output.
   2. If 1 fails: a small token exchange of ours that serves the two jwtlet
      APIs the agents call (`POST /token` and the mapping API) and answers
      with a Keycloak token the EDC 1.0 runtimes already trust, as the hub's
      own service token is
      ([`client.ts` L82-L118](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/416b75c2/ui/src/lib/edc/client.ts#L82-L118)).
   3. If neither passes the suites, this ADR is rejected and ADR-078
      decision 2 stays.

   The agents then hold a dataspace-wide token instead of jwtlet's
   participant-scoped one. That is weaker isolation, accepted for a demo of
   fictional organisations and stated on the architecture page. ADR-078
   decision 6 (Eclipse JAD on KinD, then AKS) is how jwtlet would run
   unmodified.

3. **One provisioning path at a time, switched on evidence.** The hub's own
   provisioning stays the default until CFM, locally, onboards and disposes a
   participant through `/onboarding` and the identity, dataspace and health
   domain suites stay at their 1.0 floors. Then the onboarding page and the
   participant list call the Tenant Manager, and `provision.ts` is removed
   once Azure passes the same checks on CFM.
4. **Azure follows the local result.** New apps `mvhd-cfm-tmanager`,
   `mvhd-cfm-pmanager` and `mvhd-cfm-agents` (one app, one container per
   agent, as core-platform-distribution runs them in one deployment), plus
   the token exchange if decision 2.2 applies. They use the Flexible Server
   (ADR-041) and the existing NATS with an account of their own, and stop
   off hours (ADR-053).
5. **We follow releases, not `main`.** CFM is at 0.0.x and changes between
   releases. `.github/upstream.json` already watches `eclipse-cfm/cfm`
   (`known: v0.0.7`); each new tag is taken locally, through the suites,
   then to Azure, and `known` moves with it.

## Consequences

- #973 is answered with option B, extended to Azure, instead of A.
- #927 still deletes the seven 2026-03 apps and the two 0.18 data planes,
  and its steps 4 and 7 still remove the 2026-03 code. Three things change:
  the `cfm` database and its line in `13-postgres-flexible-server.sh` stay
  (emptied, not dropped), the Tenant Manager facade in `lib/edc/client.ts`
  stays (v0.0.7 still serves `/api/v1alpha1`), and the CFM layer of
  `/admin/components` and `/topology` comes back with the new app names in
  decision 4.
- About €65 to €73 a month on office hours for the CFM apps, about €8 to
  €16 more than the seven apps today, and €65 to €73 more than ADR-078.
- Compensation, retries, resume, credential revocation on dispose and the
  siglet key mapping come from upstream instead of `provision.ts`.
- We depend on a pre-1.0 project. Upstream tests v0.0.7 against platform
  images built from `1.0.0-SNAPSHOT`
  ([platform-images `v0.0.1-rc.9`](https://github.com/eclipse-cfm/platform-images/blob/v0.0.1-rc.9/gradle/libs.versions.toml#L2));
  we run 1.0.0-RC5, and EDC released
  [1.0.0-RC6](https://github.com/eclipse-edc/Connector/releases/tag/v1.0.0-RC6)
  on 2026-11-09.
- The token exchange bridge is ours to keep in step with jwtlet's contract.

## Order

1. Local spike on a branch: a compose profile `cfm` with the 0.0.7 images,
   NATS user, Postgres database and decision 2.1. Measure an onboarding and
   a dispose, then the three suites. Trigger: this ADR accepted.
2. If 2.1 fails, the same with 2.2.
3. Switch the onboarding page and the participant list to the Tenant
   Manager behind a setting, Bruno requests and mocks with it. Trigger: step
   1 or 2 green.
4. Azure: the apps of decision 4, then the compliance job (`target=azure`)
   and Demo Smoke at their floors. Trigger: step 3 merged, `az login`, and
   Matthias's go per app.
5. Remove `provision.ts` and make CFM the only path. Trigger: step 4 green.

## Alternatives considered

- **Drop CFM everywhere (ADR-078 decision 2, #973 option A).** One path,
  no cost, already green. It leaves the siglet key mapping and the
  compensation to us, and diverges from the provisioning layer upstream
  ships with EDC 1.0.
- **CFM locally only (#973 option B as written).** Keeps a path Azure does
  not test.
- **Kubernetes now, jwtlet unmodified.** ADR-078 decision 6; it changes the
  platform, local development and the service tokens at once.
- **Patch the CFM agents to use client credentials.** A fork of a project
  that releases weekly.
