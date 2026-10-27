# ADR-064: The hub meets Simpl-Open as a connector outside its agent, over DSP and DCP, with the Governance Authority as a trusted issuer

**Status:** Accepted (2026-10-27)
**Date:** 2026-10-27
**Supersedes:** [ADR-013](ADR-013-simpl-open-alignment.md)
**Relates to:** [ADR-007](ADR-007-did-web-dsp-negotiation.md), [ADR-020](ADR-020-cross-participant-dataset-discovery.md), [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md), [ADR-063](ADR-063-healthdcat-ap-release-8-and-its-namespace.md)
**Discussion:** [#701](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/701)
**Analysis:** [Simpl-Open and the EHDS: gap analysis](../simpl-ehds-gap-analysis.md)

## Context

ADR-013 (April 2026) declared the hub aligned with "5 of 7 SIMPL
requirements": DSP, DCP, `did:web`, DCAT-AP federation and ODRL. Checked
against Simpl's own sources in October 2026, three of those five are not
Simpl requirements, and the remaining two are shared ground rather than
alignment:

| ADR-013 said                       | What Simpl's sources say                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSP 2025-1 is a Simpl requirement  | The Simpl connector is Eclipse EDC and implements the three parts of the Dataspace Protocol; the version is not published, and the upgrade of its EDC is "being analysed" ([Q&A](https://simpl-programme.ec.europa.eu/landing-page/from-vision-to-practice-qa)).                                                     |
| Simpl uses DCP for trust           | Inside the Simpl-Open agent, connectors identify each other with x509 certificates issued by the Governance Authority, over mTLS, and need no DCP. DCP through an IdentityHub is the path for EDC connectors outside the agent ([Simpl-Open Q&A](https://simpl-programme.ec.europa.eu/landing-page/simpl-open-qa)).  |
| Simpl recommends `did:web`         | Not found. DIDs and credentials for organisations arrive with SSI Tier 2 in the Innsbruck release ([roadmap](https://simpl-programme.ec.europa.eu/development/development-status/simpl-open-roadmap-items-q4)).                                                                                                      |
| DCAT-AP federation                 | Today's catalogue is the XFSC federated catalogue; DCAT-AP is Innsbruck's target model. Health metadata is not named.                                                                                                                                                                                                |
| ODRL policies                      | The [architecture specification](https://ssg-website-ad5a79.pages.code.europa.eu/resources/architecture) names no policy language. Policies are enforced on the provider's connector, mainly access policies; contracts are bilateral ([Q&A](https://simpl-programme.ec.europa.eu/landing-page/code-and-impact-qa)). |
| Gaps: Gaia-X labels, certification | No Simpl connector certification process was found.                                                                                                                                                                                                                                                                  |

Three things changed around the decision:

- **Simpl moved.** Gdynia 4.0 shipped in July 2026, Hamburg 4.1 and Innsbruck
  5.0 are targeted for October and Q4 2026. The EHDS secondary-use data space
  is a Simpl-Live data space, and proposed requirements for DOME Marketplace
  integration and monetisation were previewed on 28 October 2026.
- **The EHDS is adopted** with its first implementing acts. Dataset
  descriptions must follow HealthDCAT-AP from 2029 (2026/2098), and the
  cross-border infrastructure, HealthData@EU, connects national contact
  points over dispatchers and eDelivery, not over DSP (TEHDAS2 D7.3).
- **The hub carries EHDS rules a generic middleware does not:** the Art. 71
  opt-out at person level (ADR-062), data permits that bind an access body,
  holders and a user (Art. 68), regulated fees with category reductions
  (Art. 62), and a permit gate in front of the SPEs (Art. 73).

## Decision

1. **The hub meets Simpl-Open as an EDC connector outside the Simpl-Open
   agent.** It speaks DSP 2025-1 for catalogue, negotiation and transfer, and
   DCP v1.0 for credentials, as it does today. It does not run a Simpl-Open
   agent and does not take part in the x509 and mTLS trust inside one.
2. **A Simpl data space's Governance Authority becomes a trusted issuer** in
   the hub's IdentityHub for the credentials it issues to participants of
   that data space. The hub's own IssuerService keeps issuing the hub's
   credentials. Trust between the two is configuration, not a new component.
3. **EHDS rules stay in the hub.** Permits, the opt-out filter, fees and the
   SPE gate are the health extension; they are not delegated to Simpl's
   policy decision point, contracts or monetisation model. Where Simpl's
   proposed requirements could carry them (BP02E fees, BP14 billing, a
   provider-side person filter), the hub comments on the requirement rather
   than adapting to it.
4. **The catalogue stays HealthDCAT-AP** (ADR-063). The hub offers it as a
   profile of the DCAT-AP model Simpl adopts in Innsbruck and maps it onto
   Simpl's resource descriptions then; it does not publish XFSC
   self-descriptions before that.
5. **"Aligned" needs two proofs:** a published Simpl source for the
   capability and a check in the hub that exercises it. No percentage of
   requirements met. The comparison lives in the gap analysis and is
   rechecked at each Simpl release.
6. **The decision is proven by a spike** when Hamburg 4.1 code is public: run
   the DSP technology compatibility kit against a Simpl connector, and
   complete a negotiation with a credential the Governance Authority issued.

## Consequences

### Positive

- What the repository says about Simpl matches Simpl's sources, and the
  README no longer claims a share of requirements met.
- No new runtime: the path uses the connector, IdentityHub and DSP checks
  the hub already runs in `compliance.yml`.
- The EHDS rules keep one implementation, tested where they are enforced,
  whatever Simpl adopts.

### Negative

- Interoperability is a claim until the spike runs. If Simpl's outside-agent
  DCP path does not work in practice, the hub needs an adapter.
- Outside the agent there is no Governance Authority-ensured mTLS and no
  attribute-based access control ([Simpl-Open Q&A](https://simpl-programme.ec.europa.eu/landing-page/simpl-open-qa));
  the hub relies on DCP presentations alone for those participants.
- A health data space that adopts Simpl wholesale would run the EHDS rules
  somewhere else; the hub then shows the rules rather than hosting them.
- Neither side has a credential for a person acting for an organisation
  (DOME's LEAR credential, the European Business Wallet); applying for a
  permit needs one.

## Alternatives considered

- **Run a Simpl-Open agent beside or instead of the EDC virtual runtime.**
  It would replace the DCP identity layer with x509 inside the agent and
  bring no health semantics. Reconsider if an access body the hub serves
  mandates Simpl.
- **Keep ADR-013's alignment claims.** The sources do not support them.
- **Wait for SSI Tier 2 in Innsbruck before deciding.** The outside-agent
  DCP path exists today, and the decision is cheap to revisit when Tier 2
  ships.
