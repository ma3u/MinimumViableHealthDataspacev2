---
title: "CFM 0.0.7 spike (#973, ADR-085 step 1): onboarding through CFM works, with a proxy and two activities of our own; dispose does not"
status: current
owner: ma3u
updated: 2026-11-09
issue: https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/973
---

[ADR-085](../../ADRs/ADR-085-cfm-stays-as-eclipse-cfm-releases.md) step 1, in
three rounds on 2026-11-09:

1. **Keycloak alone** cannot serve the agents' token exchange (below, "Round
   1"). Matthias chose ADR-085 step 2, a proxy.
2. **With the proxy** every token exchange succeeds and CFM provisions the
   IdentityHub half of a participant; our control plane refuses the EDC-V
   agent's config (below, "Round 2"). Matthias chose an activity of our own.
3. **With two activities of our own** in place of the EDC-V and IdentityHub
   agents, a participant registered at `/onboarding` is provisioned through
   CFM end to end: all six steps complete, siglet included, and the new
   participant fetches AlphaKlinik Berlin's catalogue over DSP. Dispose still
   fails, on the upstream `participantContextId` bug alone (below, "Round 3").

## Round 3, two activities of our own

### What is ours, why, and when it can go

[`services/cfm-connector-agent`](../../../services/cfm-connector-agent/) is a
small Go module on eclipse-cfm v0.0.7's own agent runtime and control-plane
client. One image, two containers (`MVHD_AGENT` picks the activity):

| Activity                                    | In place of                     | Why                                                                                                                                                                                                                                                                                                                                                                                                       | It can go when                                                                                          |
| ------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `mvhd-connector-activity` (`activity.go`)   | eclipse-cfm's EDC-V agent       | Its config has no STS entries and a per-participant Vault partition ([`controlplane.go` L52-L66](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/agent/common/controlplane/controlplane.go#L52-L66)); our control plane answers `400 'edc.iam.sts.oauth.client.id' is required`. Ours writes the context, the STS entries `provision.ts` writes, the DSP profile and the registration's details.           | Our control plane takes CFM's model (STS signing in a Vault partition), or CFM writes STS entries again |
| `mvhd-identityhub-activity` (`identity.go`) | eclipse-cfm's IdentityHub agent | It creates the participant with `provisionStsAccount: false` and a Vault partition ([`identityhub.go` L208-L255](https://github.com/eclipse-cfm/cfm/blob/v0.0.7/agent/common/identityhub/identityhub.go#L208-L255)); IdentityHub then makes no STS client, and DSP fails at "Failed to fetch client secret from the vault with alias: `<ctx>-sts-client-secret`". Ours creates it as `provision.ts` does. | The same: it belongs with the connector activity                                                        |

Ordering an activity _before_ the EDC-V agent, as first proposed, cannot
work: that agent creates the context and accepts only a `200`, so a context
created first fails it, and its config would still point the control plane
at a Vault partition our launchers do not use. Replacing it in the
orchestration is the smallest change that works.

The four upstream agents stay: jwtlet (behind the proxy), registration,
onboarding and siglet.

### Onboarding through `/onboarding`

The page posts to `/api/participants`; with `CFM_TENANT_URL` set the route
calls [`cfm-provision.ts`](../../../ui/src/lib/edc/cfm-provision.ts) instead of
`provision.ts`: a tenant, a participant profile (with the data plane mapping
siglet's agent needs and the registration's details), a wait until every
agent is active or one failed, then the context by its DID. Unset, nothing
changes. Measured on a dev server against the OrbStack stack, signed in with
a forged `edcadmin` session (Keycloak redirects only to the stack's own UI
ports):

| Step                                         | Result                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/onboarding` "Register Participant"         | "Registration Submitted"; the participant is listed with its name and role                           |
| jwtlet, connector (ours), IdentityHub (ours) | complete: context with STS config and profile, IdentityHub participant with an STS client            |
| registration, onboarding                     | complete: issuer holder, MembershipCredential `ISSUED`                                               |
| siglet                                       | complete: transfer type mapping and data plane registered                                            |
| DSP catalogue request to AlphaKlinik Berlin  | `200`, 2 datasets                                                                                    |
| Dispose through the Tenant Manager           | **fails**: all five agents, ours included, get no `participantContextId`; the profile stays in error |

The hub itself has no route that removes a participant (`provision.ts` only
undoes a failed registration), so there is no hub path to hand dispose to
yet. The test participants were removed by hand (below).

### Suites, and the cleanup

On the stack rebuilt from `main` at `e1492052` (#1009's verification), with
the three CFM test participants present, then after removing them:

| Suite                                              | With the CFM participants | After the cleanup | Floor  |
| -------------------------------------------------- | ------------------------- | ----------------- | ------ |
| Identity (`scripts/run-ehds-identity-checks.sh`)   | 31 / 0 / 0                | (not rerun)       | 31/0/0 |
| Dataspace (`scripts/run-ehds-dataspace-checks.sh`) | 28 / 0 / 5                | 32 / 0 / 1        | 32/0/1 |
| Health domain (`scripts/run-ehds-tests.sh`)        | 27 / 0 / 3                | (not rerun)       | 27/0/3 |

The four extra skips were the test data, not CFM: the dataspace suite finds
its consumer by the slug `pharmaco`, and took the test participant
`pharmaco-research-ag-cfm-check-…`, which has no negotiations. A test
participant must not carry a seeded participant's slug in its name.

Cleanup: the three contexts, IdentityHub participants (which took their keys
and STS secrets from Vault), siglet mappings and issuer holders (three rows
in `issuerservice_v1`, keyed by DID, which the API cannot delete); then the
`cfm7-*` containers, volumes and image, `cfm_v007`, the `cfm-agents` client
and its twelve scopes. Nothing of the spike is left on the stack.

### What is left

- **Dispose.** Needs eclipse-cfm to carry `participantContextId` into the
  dispose orchestration, and the hub a removal path of its own until then.
  Not reported upstream: an outward message needs Matthias's go.
- **ADR-085 step 3.** The `/onboarding` switch exists (`CFM_TENANT_URL`); the
  participant list, Bruno requests and the docs do not follow it yet.
- **Azure (step 4).** The agent image would need building and pushing to ACR,
  and CFM's NATS streams need their own answer to a NATS restart (they live
  on `mvhd-nats`'s container storage and come back only when the managers
  start; `docs/gotchas.md` 2026-11-09, PR #1028).

## Round 2, the proxy: what CFM 0.0.7 does on our stack (superseded by round 3)

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

### What Matthias decided after round 2: option 2, an activity of our own

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

## What Matthias decided after round 1: option 1, the proxy

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

Round 3, on the compose stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.jad.yml --profile cfm up -d --build
./scripts/seed-cfm.sh
./scripts/check-cfm-onboarding.sh   # deploy, DSP catalogue, then dispose (fails upstream)
```

For `/onboarding`, run the UI with `CFM_TENANT_URL=http://localhost:18181/api`
and `CFM_CLIENT_SECRET=cfm-agents-local-dev`. `go test ./...` in
`services/cfm-connector-agent` and
`npx vitest run __tests__/unit/lib/edc-cfm-provision.test.ts` in `ui` cover
the code without a stack.

Round 1, Keycloak alone:

```bash
DOCKER_CONTEXT=desktop-linux scripts/check-cfm-token-exchange.sh
```

It starts its own Keycloak on port 18080 (`KC_PORT` to change it), removes it
on exit, and exits 1 while Keycloak refuses the agents' request as sent. It
does not touch the compose stack.
