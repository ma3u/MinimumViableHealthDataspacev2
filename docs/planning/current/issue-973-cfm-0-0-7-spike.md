---
title: "CFM 0.0.7 spike (#973, ADR-085 step 1): the proxy works, the control plane does not take CFM's participant config"
status: current
owner: ma3u
updated: 2026-11-09
issue: https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/973
---

[ADR-085](../../ADRs/ADR-085-cfm-stays-as-eclipse-cfm-releases.md) step 1, in
two rounds on 2026-11-09:

1. **Keycloak alone** cannot serve the agents' token exchange (below, "Round
   1"). Matthias chose ADR-085 step 2, a proxy.
2. **With the proxy** (below, "Round 2") every token exchange succeeds, and
   CFM provisions the IdentityHub half of a participant on our stack: DID
   document, issuer holder, MembershipCredential. It stops at the control
   plane: CFM 0.0.7 no longer provisions STS credentials and writes a
   participant config our control plane refuses. Dispose fails as well.
   The spike stopped there; how to go on is Matthias's decision.

## Round 2, the proxy: what CFM 0.0.7 does on our stack

### What was built

- [`jad/cfm/token-exchange.mjs`](../../../jad/cfm/token-exchange.mjs): the
  proxy. It exists **only because of
  [`tokenprovider.go` L123](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/common/tokenexchange/tokenprovider.go#L123)**,
  the fixed `subject_token_type` `jwt` Keycloak refuses, and can go once
  eclipse-cfm makes the type configurable (the clean long-term fix; not asked
  upstream). It rewrites that one parameter, adds the `cfm-agents` client's
  credentials as HTTP Basic (the agents send none), and passes the rest of
  the form and Keycloak's answer through unchanged. Two more things the agents
  need from a jwtlet: the subject token file, which it writes and renews, and
  jwtlet's mapping API, which it accepts without storing anything (a Keycloak
  token is not scoped per participant, so there is nothing to map; the jwtlet
  agent's step needs the 2xx).
- The compose profile `cfm` in `docker-compose.jad.yml`: the 0.0.7 Tenant
  Manager, Provision Manager and six agents, pinned by digest, configured in
  `jad/cfm/*.dotenv` after core-platform-distribution v0.0.39, with their own
  NATS (token auth) and database `cfm_v007`.
- [`scripts/seed-cfm.sh`](../../../scripts/seed-cfm.sh): the database, the
  `cfm-agents` client and the scopes CFM asks for, upstream's activity and
  orchestration definitions, a cell and an EHDS dataspace profile with our
  issuer's MembershipCredential.
- [`scripts/check-cfm-onboarding.sh`](../../../scripts/check-cfm-onboarding.sh):
  onboards one participant through the Tenant Manager, checks the control
  plane, IdentityHub, DID document, issuer holder and credential, disposes it
  and checks that it is gone.

Run beside the running OrbStack stack (`--no-deps`, own container names, own
NATS and database); nothing of the stack was restarted or reconfigured.
Onboarding went through the Tenant Manager's API, not the `/onboarding` page:
pointing the page at CFM is ADR-085 step 3.

### Results

| Part                                                    | Result                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Token exchange through the proxy                        | Works: 12 of 12 exchanges `200`, every scope the agents ask for                                                                     |
| Tenant Manager and Provision Manager with Keycloak auth | Work: definitions, cell, dataspace profile, tenant, participant profile                                                             |
| jwtlet agent (mapping no-op, derives the context id)    | Works                                                                                                                               |
| IdentityHub agent                                       | Works: participant, keys, DID document with CredentialService, DSP and DataService endpoints                                        |
| Registration agent (issuer holder)                      | Works (round 2; in round 1 the IssuerService timed out reading Keycloak's JWKS once)                                                |
| Onboarding agent (MembershipCredential over DCP)        | Works: the credential is issued and stored in the IdentityHub                                                                       |
| EDC-V agent (control plane context and config)          | **Fails**: `400 'edc.iam.sts.oauth.client.id' is required`                                                                          |
| Siglet agent                                            | Not reached: it depends on the EDC-V agent                                                                                          |
| Dispose                                                 | **Fails**: the registration and onboarding agents get no `participantContextId`; the orchestration stays open and the profile stays |
| Compensation after the failed deploy                    | **Fails**: the EDC-V agent's rollback calls our control plane's `204` on delete an error                                            |

With an orchestration that leaves out the two control-plane steps, a deploy
is `active` in 15 seconds.

### Why the control plane refuses

Since v0.0.3, CFM no longer provisions STS credentials
([eclipse-cfm/cfm#148](https://github.com/eclipse-cfm/cfm/pull/148): "We
switched to sts signing service with token exchange and vault"). Its
participant config is the two ids and a per-participant Vault partition the
control plane reaches by jwtlet token exchange
([`controlplane.go` L52-L66](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/agent/common/controlplane/controlplane.go#L52-L66)).
Our launchers' control plane signs through the IdentityHub's STS with a
client id and a secret alias per participant, as
[`provision.ts`](../../../ui/src/lib/edc/provision.ts) sets them, and requires
`edc.iam.sts.oauth.client.id`. This is not a token problem: the token was
accepted, the config was refused.

### Three upstream behaviours found on the way

Not reported upstream (an outward message needs Matthias's go):

- Dispose does not carry `participantContextId` to the registration and
  onboarding agents, which require it; the dispose orchestration then blocks
  deleting its definition ("has ongoing orchestrations").
- The EDC-V agent's rollback accepts only `200` from a context delete;
  EDC 1.0 answers `204`
  ([`controlplane.go` L127-L150](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/agent/common/controlplane/controlplane.go#L127-L150)).
- The registration agent keys the issuer holder by its DID. A DID with `%3A`
  in it makes the holder undeletable through our IssuerService's API (`400`,
  the ambiguous path encoding `provision.ts` already works around).

### Suites after the spike

Run on the same stack after both rounds and the cleanup, 2026-11-09 17:52 to
17:54, all at the 1.0 floors measured locally the same day (#927):

| Suite                                              | Passed / failed / skipped | Floor  |
| -------------------------------------------------- | ------------------------- | ------ |
| Identity (`scripts/run-ehds-identity-checks.sh`)   | 31 / 0 / 0                | 31/0/0 |
| Dataspace (`scripts/run-ehds-dataspace-checks.sh`) | 32 / 0 / 1                | 32/0/1 |
| Health domain (`scripts/run-ehds-tests.sh`)        | 27 / 0 / 3                | 27/0/3 |

They show the spike left the stack as it was; they say nothing about CFM,
which provisioned no participant they use.

### Cleanup

Both test participants were removed: their IdentityHub participants through
the API, round 2's issuer holder in `issuerservice_v1` (one row,
`cfm-check-31827f`, the API cannot delete it). Then the
`cfm7-*` containers and volumes, the `cfm_v007` database, the `cfm-agents`
client and the twelve client scopes `seed-cfm.sh` had added were removed, so
the stack is as it was. `--profile cfm up -d` and `seed-cfm.sh` recreate them.

### What Matthias decides

1. **Make our control plane take CFM's config:** the upstream model, STS
   signing in a per-participant Vault partition reached by token exchange. A
   change to the launchers and to Vault (JWT auth trusting the proxy's
   tokens), locally and on Azure, and the partition would be guarded by a
   dataspace-wide token. The largest option, and the one that converges with
   upstream.
2. **A CFM activity of our own** that writes the STS entries and the
   IdentityHub STS secret, ordered before the EDC-V agent. CFM is built for
   extra agents (orchestration definitions are data), but it is Go code we
   own, and dispose still needs upstream's fix.
3. **ADR-078 decision 2 stays:** the hub provisions participants itself,
   which passes the suites today. ADR-085 decision 2.3 foresaw this.

Whichever it is, the three upstream behaviours above are worth reporting,
with his go.

## Round 1: Keycloak alone, 2026-11-09

Keycloak 26.8.2 (the compose stack's image), the `edcv` realm plus a
`cfm-agents` client with standard token exchange enabled. The request was
replayed twice: through eclipse-cfm v0.0.7's own `tokenexchange` package,
and with [`scripts/check-cfm-token-exchange.sh`](../../../scripts/check-cfm-token-exchange.sh),
which anyone can run again.

| Request                                                                  | Keycloak answers                                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| As the agents send it, no client credentials                             | `401 invalid_client`                                                             |
| As sent, client credentials as HTTP Basic (from `user:pass@` in the URL) | `400 invalid_request`: "Parameter 'subject_token' supports access tokens only"   |
| The same on the deprecated exchange (`--features=token-exchange:v1`)     | `400 invalid_request`: "Invalid token type, must be access token"                |
| As sent, but `subject_token_type` set to `...:token-type:access_token`   | `200`: a token with `role: admin` and the API scopes our runtimes already accept |

The one refusal that cannot be configured away is the token type. The agents
send `subject_token_type=urn:ietf:params:oauth:token-type:jwt`, fixed in code
([`tokenprovider.go` L123](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/common/tokenexchange/tokenprovider.go#L123)).
RFC 8693 allows it ([section 3](https://datatracker.ietf.org/doc/html/rfc8693#section-3));
Keycloak accepts only `access_token` for a token it issued itself.

Everything else in the request would work:

- **Client authentication.** The agents send none, but Go's HTTP client sends
  HTTP Basic when the URL carries user info, so `tokenexchange.url` can be
  `http://cfm-agents:<secret>@keycloak:8080/realms/edcv/protocol/openid-connect`
  (the agent appends `/token`, [L129](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/common/tokenexchange/tokenprovider.go#L129)).
  The secret then sits in the agent's configuration.
- **`resource`** (the participant context) is ignored by Keycloak. The token is
  dataspace-wide, as ADR-085 decision 2 expected.
- **`scope`.** Keycloak returns the client's default scopes, not the one asked
  for. `identity-api:credentials:read` and `identity-api:credentials:write`
  ([identityhub.go L37-L38](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/agent/common/identityhub/identityhub.go#L37-L38))
  and the siglet scopes are not in our realm yet and would be added.
- **`audience`** has to name the requesting client (`cfm-agents`); another
  client's id is refused ("Requested audience not available").

Not measured, because the exchange fails first: whether the control plane,
IdentityHub and IssuerService accept the exchanged token, whose `aud` is
`cfm-agents`, and whether the CFM
managers, NATS and the orchestration run against our stack.

## What Matthias decides

Each of these unblocks step 1; none is started.

1. **ADR-085 step 2, a token exchange of ours.** A small service with jwtlet's
   `POST /token` and mapping API, answering with a Keycloak client-credentials
   token. It can be as thin as a proxy that rewrites the one parameter to
   `access_token` and forwards to Keycloak. Ours to keep in step with jwtlet.
2. **An upstream change in eclipse-cfm:** make `subject_token_type`
   configurable, defaulting to `jwt`. One constant today, and it would let any
   RFC 8693 server that is not jwtlet serve the agents. Asking upstream is an
   outward message, so it needs Matthias's go; it does not help before a
   release that contains it.
3. **ADR-078 decision 2 stays** (ADR-085 decision 2.3), if neither is wanted.

Options 1 and 2 can go together: the proxy now, dropped once a release
carries the setting.

## Reproduce

```bash
DOCKER_CONTEXT=desktop-linux scripts/check-cfm-token-exchange.sh
```

It starts its own Keycloak on port 18080 (`KC_PORT` to change it), removes it
on exit, and exits 1 while Keycloak refuses the agents' request as sent. It
does not touch the compose stack.
