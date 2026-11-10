# ADR-088: CFM runs from our fork of eclipse-cfm until upstream takes the patches

Date: 2026-11-10

**Status:** Proposed
**Supersedes:** [ADR-085](ADR-085-cfm-stays-as-eclipse-cfm-releases.md) decision 1 in part (the images come from the fork, not eclipse-cfm's release images) and decision 2 (no token exchange of ours: the fork's patch a replaces it)
**Relates to:** [ADR-078](ADR-078-edc-1-on-container-apps-without-cfm.md), [ADR-076](ADR-076-edc-1-runtimes-are-built-here.md)
**Tracks:** [#973](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/973) and its sub-issues [#1043](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1043) to [#1047](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1047)

## Context

ADR-085 kept CFM on eclipse-cfm's release images, bridged where they do not
fit EDC 1.0 runtimes outside Kubernetes. Step 1 measured what did not fit
([spike note](../planning/current/issue-973-cfm-0-0-7-spike.md)). Bridging it
from outside took a token exchange proxy and two agents of our own (rounds 2
and 3), and dispose still failed. Matthias then decided: "Fix them in my own
fork", "But follow up the upstream for updates", and to wait for his Eclipse
Contributor Agreement before anything goes to eclipse-cfm.

The fork, [ma3u/cfm](https://github.com/ma3u/cfm), is eclipse-cfm/cfm
[v0.0.7](https://github.com/eclipse-cfm/cfm/releases/tag/v0.0.7) with five
patch branches. On the compose stack it onboards through `/onboarding`, serves
the DSP catalogue and disposes through the Tenant Manager, with no proxy and
no agent of our own, and the three suites stay at their 1.0 floors (round 4).

## Decision

1. **The `cfm` profile runs images built from the fork's integration tag**,
   `<base>-mvhd.<n>` (today `v0.0.7-mvhd.2`), as `mvhd/cfm-<name>:<version>`
   ([`scripts/build-cfm-fork-images.sh`](../../scripts/build-cfm-fork-images.sh)).
   The proxy and `services/cfm-connector-agent` are removed.

2. **The patches**, each a branch on the base tag with Go tests and its own
   issue:

   | Patch | Issue                                                                       | Fork branch                                                                                                 | What upstream does (v0.0.7)                                                                                                                                                                          | Drop when                                                          |
   | ----- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
   | a     | [#1043](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1043) | [`fix/token-exchange-without-jwtlet`](https://github.com/ma3u/cfm/tree/fix/token-exchange-without-jwtlet)   | fixed `subject_token_type` jwt, no client authentication, token file required ([`tokenprovider.go` L123](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/common/tokenexchange/tokenprovider.go#L123)) | the token type and client authentication are configurable upstream |
   | b, c  | [#1044](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1044) | [`fix/sts-in-identityhub`](https://github.com/ma3u/cfm/tree/fix/sts-in-identityhub)                         | no STS account, Vault partition, no `edc.iam.sts.oauth.*` ([`controlplane.go` L52-L66](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/agent/common/controlplane/controlplane.go#L52-L66))            | the agents can provision for IdentityHub's STS upstream            |
   | d     | [#1045](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1045) | [`fix/dispose-participant-context-id`](https://github.com/ma3u/cfm/tree/fix/dispose-participant-context-id) | dispose gets the deploy outputs only under `cfm.vpa.state` ([`service_participant.go` L274](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/tmanager/core/service_participant.go#L274))               | dispose carries `participantContextId` upstream                    |
   | e     | [#1046](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1046) | [`fix/edcv-delete-accepts-204`](https://github.com/ma3u/cfm/tree/fix/edcv-delete-accepts-204)               | only `200` on a context delete ([`controlplane.go` L145-L147](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/agent/common/controlplane/controlplane.go#L145-L147))                                   | `204` is accepted upstream                                         |
   | f     | [#1047](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1047) | [`fix/holder-id-for-did-with-port`](https://github.com/ma3u/cfm/tree/fix/holder-id-for-did-with-port)       | holder keyed by the DID ([`registration/activity/activity.go` L63](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/agent/orchestration/registration/activity/activity.go#L63))                        | holders are not keyed by the DID upstream                          |

   A patch is also dropped when our pull request for it is merged at
   eclipse-cfm.

3. **The fork follows upstream** by the routine of
   [runbook cfm-fork](../knowledge/runbooks/cfm-fork.md): the fork's `main` is
   upstream's and only fast-forwards (`gh repo sync`); on each eclipse-cfm
   release, a drop-check per patch, a rebase of the rest onto the release, a
   new tag `<release>-mvhd.1`, rebuilt images and the local check. The
   weekly upstream watch reads the fork from `.github/upstream.json`, reports
   whether its `main` is behind, and puts the routine into the release's
   issue.

4. **CI builds the fork.** A workflow builds the eight images from the
   integration tag and runs the fork's Go tests, on a change to the fork's
   pin and weekly, so a sync or a release that breaks a patch shows.

5. **Commits in the fork are Matthias's** (his private address, his ECA),
   with no assistant attribution, so each branch can go upstream unchanged.

6. **Upstream waits for the ECA.** No pull request or issue goes to
   eclipse-cfm until Matthias has his Eclipse Contributor Agreement; then the
   five branches are offered as they are, and the seventh behaviour found in
   round 4 (a disposed profile stays and blocks deleting its tenant) is
   reported. This is the open upstream step.

7. **When every patch is dropped**, the profile goes back to eclipse-cfm's
   release images pinned by digest (ADR-085 decision 1), the `fork` block
   leaves `.github/upstream.json`, and the fork is archived.

## Consequences

- No CFM code of ours outside the fork: the proxy and the two agents are gone,
  and every difference to upstream is a small, tested, documented branch.
- We maintain the patches across releases. eclipse-cfm released about weekly
  in autumn 2026; each release costs the routine above, more when a patch no
  longer applies.
- The hub depends on images it builds itself until upstream takes the
  patches. The images are local today; Azure (ADR-085 step 4) needs them in
  ACR, prepared but not deployed.
- The participant list, `/onboarding` and the participant removal route read
  and write the control plane's contexts, so they work the same with CFM and
  without it.

## Alternatives considered

- **Keep the proxy and our own agents (rounds 2 and 3).** Works for deploy,
  not for dispose, and keeps CFM code of ours outside any upstream path.
- **Wait for upstream.** Nothing in the v0.0.7 release notes addresses these
  points, and nothing can be proposed before the ECA.
- **Kubernetes and jwtlet (ADR-078 decision 6).** Removes patch a only; b to f
  are needed on Kubernetes too.
