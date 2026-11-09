---
title: "CFM 0.0.7 spike (#973, ADR-085 step 1): Keycloak cannot serve the agents' token exchange"
status: current
owner: ma3u
updated: 2026-11-09
issue: https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/973
---

[ADR-085](../../ADRs/ADR-085-cfm-stays-as-eclipse-cfm-releases.md) step 1 starts
with its riskiest assumption, decision 2.1: Keycloak's token exchange in place
of jwtlet. It does not hold, so the spike stopped there, before the `cfm`
compose profile, the onboarding and the suites. Step 2 (a token exchange of
our own) waits for Matthias's decision.

## Result, 2026-11-09

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
