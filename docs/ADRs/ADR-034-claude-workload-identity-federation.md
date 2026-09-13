# ADR-034: Reach the Claude API through workload identity federation, from a backend, never from the phone

**Status:** Proposed
**Date:** 2026-09-13
**Relates to:** [ADR-033](ADR-033-lab-report-extraction-pipeline.md), [ADR-029](ADR-029-dependency-version-pinning.md)
**Tracks:** [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)

## Context

MeinBefund should be able to ask a question about the values on a scanned lab
report. Issue #186 §4.3 already set the boundary: on-device inference by
default, and a cloud provider only by an explicit per-call act with the provider
named at the moment of use.

The proposal was to connect the app to a Claude Max subscription using the
Console's Workload Identity Federation. Reading the
[WIF documentation](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation)
against that intent surfaces two mismatches that change the design.

### WIF grants API access to an organization, not Max

A federation rule binds an external identity to a **service account**
(`svac_...`) inside an Anthropic **organization**, and the exchange mints a
short-lived `sk-ant-oat01-...` token carrying an OAuth scope, `workspace:developer`
by default, which the documentation describes as the same access as a workspace
API key. Usage is attributed to that workspace and billed as API usage.

Claude Max is a consumer subscription to the Claude apps. It is not an API
organization and has no service accounts. So "connect the app to my Max plan"
and "federate a workload to the Claude API" are two different things, and only
the second exists as a mechanism. Choosing it means paying for tokens through
the Console, separately from Max.

### A phone cannot be the workload

WIF is only as strong as the identity provider signing the JWT, and whatever
holds that JWT can mint the organization token. An iPhone app is a public
client: it cannot keep a secret, its binary can be read, its keychain is
reachable on a jailbroken device, and its traffic can be intercepted by whoever
owns the phone.

Registering an issuer whose tokens a phone can obtain would put organization-wide
API access one extraction away, and unlike a leaked API key it would be issued
continuously and be harder to notice. Against an API key embedded in an app,
which is already a known-bad pattern, this would be worse rather than better.

### Sending lab values anywhere is a data protection decision

Lab values are special category data under GDPR Art. 9. ADR-033 already rejected
SaaS extraction vendors on data protection grounds, and #187 moved the Azure
OpenAI deployment off `GlobalStandard` specifically so cloud inference had a
defensible residency story. `api.anthropic.com` is a transfer out of the EU.

## Decision

**Federate from a backend, and keep the phone a public client that holds no
Anthropic credential of any kind.**

```
iPhone (public client, no secrets)
   │  user signs in, OIDC + PKCE; posts only the values the user selected
   ▼
services/claude-federation  on Azure Container Apps
   │  verifies the user's id token
   │  gets an Entra managed identity JWT from IMDS, fresh each time
   │  POST /v1/oauth/token  (RFC 7523 jwt-bearer)  →  sk-ant-oat01-…
   │  POST /v1/messages
   ▼
Claude
```

Four consequences of that shape, each chosen rather than inherited:

1. **Azure managed identity is the IdP.** The stack already runs on Container
   Apps (`rg-mvhd-dev`), which injects `IDENTITY_ENDPOINT` and
   `IDENTITY_HEADER`, so the workload proves who it is with nothing stored. No
   `sk-ant-...` key exists in this repository, in the image, or in anyone's
   environment. Registering a public Keycloak purely to be an issuer was
   rejected: it adds an internet-exposed attack surface to gain nothing Entra
   does not already provide.

2. **Identity tokens are requested with `bypass_cache=true`.** Anthropic treats
   a JWT carrying `jti` as single use and rejects a repeat as `jti_reused`. IMDS
   caches tokens by default, so a cached token would work for exactly one
   exchange and fail every refresh afterwards, surfacing hours later as an
   outage rather than immediately as a misconfiguration.

3. **Consent and minimisation are enforced server-side.** The request must name
   `anthropic` as the provider for that call, carry at most 40 values, and
   contain no field that identifies a person. A check that lives only in the app
   is a check an attacker skips: the phone shows the consent screen, the service
   decides whether the call happens.

4. **The intended purpose travels with every request.** Qualification as a
   medical device turns almost entirely on the stated intended purpose
   (MDCG 2019-11), and because these values come from in-vitro samples it is
   IVDR rather than MDR Rule 11 that would apply. The system prompt forbids
   diagnosis, risk scoring, prognosis and treatment advice, and binds the model
   to the reference range the issuing lab printed, per ADR-033 rule 1. Stating
   it in a design document nobody transmits would not be stating it.

## Consequences

### Positive

- No Anthropic API key exists anywhere in the system, and the minted token
  expires in minutes rather than never.
- The blast radius of a stolen phone is one user's id token, which mints
  nothing on its own and is revocable at the IdP.
- Usage is attributable: every call acts as one named service account.
- The consent boundary is mechanical rather than a matter of UI discipline.

### Trade-offs

- **A backend now exists.** Before this the app was wholly self-contained. That
  is the price of not putting a credential on the phone, and it is the right
  price, but it is a real operational cost: a service to deploy, monitor and
  keep patched.
- **Tokens are billed to the Console organization, not covered by Max.**
- **Values leave the EU** when the user chooses cloud analysis. On-device
  remains the default and the only zero-transfer option. A DPA with Anthropic
  and a record of processing are prerequisites before anyone but the author uses
  this.
- **Federation is only as strong as Entra.** Conditional access and audit
  logging on the managed identity are part of this control, not optional extras.

### Rejected alternatives

- **Register an issuer the phone can obtain tokens from** (Sign in with Apple as
  the WIF issuer, rule matched on `sub`). Technically possible and tempting,
  since Apple is a real OIDC issuer and the audience is the bundle id. Rejected
  because the minted token is organization-scoped: a per-user match limits who
  can trigger it, not what it can do once triggered.
- **Ship an API key in the app.** The pattern WIF exists to replace.
- **Route through the existing Azure OpenAI deployment only.** Still the right
  default for extraction (ADR-033), and it stays. This adds a second provider
  the user can name explicitly; it does not replace the first.

## References

- [Workload Identity Federation](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation)
- [WIF is generally available](https://claude.com/blog/workload-identity-federation)
- [RFC 7523](https://www.rfc-editor.org/rfc/rfc7523) jwt-bearer grant
- [MDCG 2019-11](https://health.ec.europa.eu/system/files/2020-09/md_mdcg_2019_11_guidance_en_0.pdf)
- Issue [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186) §4.3, §5
