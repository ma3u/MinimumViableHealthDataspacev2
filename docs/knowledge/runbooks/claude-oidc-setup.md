---
title: "Setting up OIDC for MeinBefund and the Claude API"
status: current
owner: ma3u
updated: 2026-09-13
adr: ../../ADRs/ADR-034-claude-workload-identity-federation.md
---

# Setting up OIDC on both sides

There are **two separate OIDC relationships** here. They share a protocol and
nothing else: different issuers, different tokens, different purposes. Treating
them as one is the mistake that makes this confusing, so they are kept apart
throughout.

```
       ── OIDC #1: who is the user? ──────┐   ┌── OIDC #2: which workload? ──
                                          │   │
  iPhone ──────id_token──────▶ claude-federation ──Entra JWT──▶ Claude API
  (public client, PKCE)        (Container App)                 (token exchange)
            ▲                         │                              │
            │                         └── verifies #1 ───────────────┘
      your IdP                                      mints sk-ant-oat01-…
   (Keycloak, Apple, Auth0 …)
```

|                     | OIDC #1                               | OIDC #2                              |
| ------------------- | ------------------------------------- | ------------------------------------ |
| Question it answers | Which person is this?                 | Which workload is this?              |
| Issuer              | An IdP you choose                     | Azure Entra, fixed                   |
| Client              | The iOS app, public, no secret        | The Container App's managed identity |
| Configured in       | The IdP, and the app's build settings | The Claude Console                   |
| Produces            | An `id_token` sent to the backend     | A JWT exchanged for `sk-ant-oat01-…` |

Neither side knows the other exists. Anthropic never sees your users; your IdP
never sees Anthropic.

---

## Side 1: the app and your identity provider

### What the app needs

Three build settings. They are empty by default, and when either the issuer or
the backend URL is empty the app does not show the "Claude fragen" button at
all, because an action that cannot work should not look available.

| Build setting             | Example                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `MB_OIDC_ISSUER`          | `https://auth.example.com/realms/edcv`                          |
| `MB_OIDC_CLIENT_ID`       | `meinbefund-ios`                                                |
| `MB_OIDC_REDIRECT_SCHEME` | `meinbefund`                                                    |
| `MB_FEDERATION_BASE_URL`  | `https://mvhd-claude-federation.<region>.azurecontainerapps.io` |

```bash
xcodebuild -project MeinBefund.xcodeproj -scheme MeinBefund \
  MB_OIDC_ISSUER="https://auth.example.com/realms/edcv" \
  MB_OIDC_CLIENT_ID="meinbefund-ios" \
  MB_OIDC_REDIRECT_SCHEME="meinbefund" \
  MB_FEDERATION_BASE_URL="https://<your-app>.azurecontainerapps.io" \
  build
```

### What the client registration must say

Register a **public** client at your IdP with these exact properties:

- **Client type: public.** No client secret. The app cannot keep one: its binary
  can be read and its traffic belongs to whoever holds the phone. This is not a
  limitation to work around, it is the reason PKCE exists.
- **PKCE required, method S256.** With a public client this is the only thing
  making an intercepted authorization code useless. If the IdP lets you mark
  PKCE as required rather than optional, do it: optional means an attacker can
  simply not use it.
- **Redirect URI: `<MB_OIDC_REDIRECT_SCHEME>://oidc-callback`**, so with the
  example above, `meinbefund://oidc-callback`. Register it exactly; most IdPs
  match this string literally.
- **Scope `openid`.** The app asks for nothing else. It needs to know that you
  are you, not who you are, and the backend deliberately reads only `sub`.
- **Grant type: authorization code.** Not implicit, not hybrid.

### Deployed, 2026-09-13

```
issuer     https://auth.ehds.mabu.red/realms/edcv
client     meinbefund-ios   (public, PKCE S256, standard flow only)
redirect   meinbefund://oidc-callback
backend    https://mvhd-claude-federation.happysand-37f82e30.westeurope.azurecontainerapps.io
```

Provisioned by `scripts/azure/12-meinbefund-identity.sh`. Verified end to end: a
real token from this realm passes signature, issuer, audience and subject
allowlist and reaches the federation step.

**Take the issuer from the discovery document, never from the URL you fetched
it at.** Keycloak stamps `iss` from `KC_HOSTNAME`, which here is the ADR-025
custom domain, while the Container App also answers on its own
`*.azurecontainerapps.io` FQDN. Both serve the same realm; only one string
appears in tokens. Using the other produced `unexpected "iss" claim value`.

### Keycloak, concretely

The repo already runs a Keycloak realm (`edcv`). To use it the realm must be
reachable from the phone over public HTTPS, which the local Docker one is not.

```
Clients → Create client
  Client ID:              meinbefund-ios
  Client authentication:  Off          ← this is what makes it public
  Standard flow:          On
  Direct access grants:   Off
  Valid redirect URIs:    meinbefund://oidc-callback
  Web origins:            (leave empty)

Advanced → Proof Key for Code Exchange Code Challenge Method: S256
```

Then `MB_OIDC_ISSUER` is `https://<host>/realms/edcv`, and
`USER_OIDC_ISSUER` on the backend is the same string.

### The backend side of #1

| Variable                     | Meaning                                |
| ---------------------------- | -------------------------------------- |
| `USER_OIDC_ISSUER`           | Same issuer string as `MB_OIDC_ISSUER` |
| `USER_OIDC_AUDIENCE`         | Same value as `MB_OIDC_CLIENT_ID`      |
| `USER_OIDC_ALLOWED_SUBJECTS` | Comma-separated `sub` values           |

The service resolves the JWKS by OIDC discovery, so any standards-compliant
provider works with no per-provider configuration.

> **Set `USER_OIDC_ALLOWED_SUBJECTS`.** Left empty, any user your IdP will
> authenticate can call the endpoint, and every call is billed to your Anthropic
> organization. For a personal deployment this is one value: your own `sub`.
> Read it from a token after your first sign-in, or from the IdP's user list.

---

## Side 2: the workload and the Claude Console

This side has no user in it. The Container App proves it is itself.

### Order matters

Registering an issuer needs the **exact `iss` string** from a real token, and
Azure emits two forms that differ only in shape:

```
https://sts.windows.net/<tenant>/            ← v1, what IMDS returns
https://login.microsoftonline.com/<tenant>/v2.0
```

Picking the wrong one fails signature verification with no hint which was
expected. So the token comes first and the Console second:

```bash
./scripts/azure/11-claude-federation.sh provision   # identity + Container App
./scripts/azure/11-claude-federation.sh claims      # prints the exact iss/aud
# ... configure the Console with those values ...
./scripts/azure/11-claude-federation.sh configure   # apply the rule ids
```

### Deployed values, 2026-09-13

The Container App is live and reports its own claims while federation is
unconfigured:

```
GET https://mvhd-claude-federation.happysand-37f82e30.westeurope.azurecontainerapps.io/setup/claims

  issuerUrl      https://sts.windows.net/8b87af7d-8647-4dc7-8df4-5f69a2011bb5/
  matchAudience  api://1566f14a-86a1-40d2-bab9-1b29dfd574b5
  jwksSource     discovery
```

The issuer is the **v1** form. That was checked rather than assumed, which is
the entire reason this step exists.

Managed identity `id-mvhd-claude-federation`:

| Claim         | Value                                  |
| ------------- | -------------------------------------- |
| `appid`       | `4aacf375-fe9a-477a-b7c4-d9cbe7c66fe3` |
| `sub` / `oid` | `48fbc66e-3096-4ee6-a52d-8464eb2f3919` |

`/setup/claims` returns 404 once a federation rule is applied, so it closes
behind itself rather than publishing a tenant id forever.

### In the Console

**Settings → Workload identity → Connect workload**, then **Custom OIDC** (or
the Microsoft Entra ID tile).

| Field                  | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| Issuer URL             | exactly what `claims` printed                                |
| JWKS source            | `discovery`                                                  |
| Match audience         | `api://meinbefund-claude`, what `claims` printed             |
| Match subject / claims | the managed identity's object id, or `appid` = its client id |
| Service account        | create one, for example `meinbefund-federation`              |
| Scope                  | `workspace:developer`                                        |
| Token lifetime         | 600 seconds is plenty                                        |

> **Match on more than the issuer.** A rule matching only `iss` accepts _any_
> workload in your Entra tenant, which is every VM, function and app you run.
> The audience narrows it to things that asked for this App ID URI; the subject
> or `appid` narrows it to this one identity. Set both.

The wizard then watches for a successful exchange for 15 minutes. Running
`configure` inside that window completes the test.

### What the wizard gives back

| Variable                       | Shape                                           |
| ------------------------------ | ----------------------------------------------- |
| `ANTHROPIC_FEDERATION_RULE_ID` | `fdrl_…`                                        |
| `ANTHROPIC_ORGANIZATION_ID`    | a UUID                                          |
| `ANTHROPIC_SERVICE_ACCOUNT_ID` | `svac_…`                                        |
| `ANTHROPIC_WORKSPACE_ID`       | `wrkspc_…`, only when the rule spans workspaces |

```bash
export ANTHROPIC_FEDERATION_RULE_ID=fdrl_...
export ANTHROPIC_ORGANIZATION_ID=...
export ANTHROPIC_SERVICE_ACCOUNT_ID=svac_...
./scripts/azure/11-claude-federation.sh configure
```

`configure` refuses to finish if `ANTHROPIC_API_KEY` is set on the app: it sits
above federation in the SDK's credential precedence, so a leftover key silently
shadows the entire mechanism and everything appears to work while using the key.

---

## Verifying

```bash
curl -s https://<your-app>.azurecontainerapps.io/health
# {"status":"ok","credentialCached":true}
```

`credentialCached: true` means a token exchange has succeeded at least once.
Then sign in on the phone, pick a value, and send.

## When it fails

| Symptom                                          | Cause                                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| App shows no "Claude fragen" button              | `MB_OIDC_ISSUER` or `MB_FEDERATION_BASE_URL` empty at build time                                                      |
| Browser opens, then "Anmeldung abgebrochen"      | Redirect URI not registered exactly as `<scheme>://oidc-callback`                                                     |
| `401 id token rejected`                          | `USER_OIDC_AUDIENCE` is not the client id, or the issuer string differs by a trailing slash                           |
| `401 subject is not permitted`                   | Your `sub` is not in `USER_OIDC_ALLOWED_SUBJECTS`. Working as intended                                                |
| `503 federation unavailable`                     | Rule does not match. The Console's **Authentication events** tab names the failing claim                              |
| `jti_reused` in authentication events            | A cached identity token was re-presented. The script requests with `bypass_cache=true`; check nothing else is caching |
| Everything works but no federation events appear | `ANTHROPIC_API_KEY` is set somewhere and is winning                                                                   |

## What this does not set up

Sending values to Anthropic is a transfer of special category data out of the
EU. A DPA and a record of processing are prerequisites before anyone but the
author uses this, and on-device inference remains the default and the only
zero-transfer option (ADR-034).
