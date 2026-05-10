# ADR-025: Keycloak Custom Domain (`auth.ehds.mabu.red`)

**Status:** Accepted
**Date:** 2026-05-10
**Relates to:** [ADR-012](ADR-012-azure-container-apps.md), [ADR-014](ADR-014-weekly-demo-reset.md)
**Tracking:** Issue [#28](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/28) (closed)

## Context

Until 2026-05-10 the OIDC sign-in flow on `https://ehds.mabu.red/auth/signin` redirected the browser to the long ACA-internal Keycloak hostname:

```
https://mvhd-keycloak.happysand-37f82e30.westeurope.azurecontainerapps.io/realms/edcv/protocol/openid-connect/auth?...
```

Mechanically correct OIDC, but a poor trust signal during regulator-facing demos. A regulator looking at the URL bar sees an unfamiliar `azurecontainerapps.io` host and questions whether they're still on the right system. The sign-in handshake briefly leaving the application domain is unavoidable in OIDC, but it can stay within the same DNS family.

## Decision

Bind the custom subdomain `auth.ehds.mabu.red` to the `mvhd-keycloak` Azure Container Apps app and reconfigure the OIDC chain so every browser-visible URL during sign-in stays within `*.ehds.mabu.red`.

The OIDC dance now reads:

```
ehds.mabu.red/auth/signin
  → auth.ehds.mabu.red/realms/edcv/protocol/openid-connect/auth?...
  → ehds.mabu.red/api/auth/callback/keycloak
```

`KEYCLOAK_INTERNAL_URL` stays on the ACA-internal FQDN (`mvhd-keycloak.internal.<env>.azurecontainerapps.io`) for the server-to-server token exchange path: from inside the UI container, `localhost` resolves to the container itself, and the public `auth.ehds.mabu.red` would route the traffic back out through the ingress unnecessarily. This split is consistent with CLAUDE.md gotcha #5.

## Implementation

The full sequence is automated in `.github/workflows/keycloak-custom-domain.yml`. Two modes:

- `dns_check_only` resolves the ACA env's `customDomainVerificationId`, prints the two DNS records the maintainer must add at iwantmyname.com (the registrar / DNS provider for `mabu.red`), and probes live DNS to confirm both match.
- `cutover` is gated behind a hard DNS-readiness check, then runs `az containerapp hostname add/bind --validation-method CNAME` (managed cert, ~5–8 min), updates Keycloak env (`KC_HOSTNAME`, `KC_PROXY_HEADERS=xforwarded`, `KC_HOSTNAME_STRICT_BACKCHANNEL=false`), merges `https://auth.ehds.mabu.red` into the `health-dataspace-ui` realm client's `webOrigins` via the Admin API, updates UI env vars (`KEYCLOAK_PUBLIC_URL`, `KEYCLOAK_ISSUER`, `NEXT_PUBLIC_KEYCLOAK_URL`), and verifies `https://auth.ehds.mabu.red/realms/edcv/.well-known/openid-configuration` returns 200.

The deploy scripts under `scripts/azure/` honour a new `KEYCLOAK_PUBLIC_HOSTNAME` env var (default: ACA FQDN; set to `auth.ehds.mabu.red` for production redeploys). Fresh deploys without the override still produce a working stack on the ACA FQDN; the custom-domain bind is then applied via the cutover workflow.

A Playwright regression test (`ui/__tests__/e2e/17-role-navigation-e2e.spec.ts → "sign-in flow stays within *.ehds.mabu.red domain (issue #28)"`) hooks `page.framenavigated()` during a real Keycloak login round-trip and asserts every host is in the `ehds.mabu.red` eTLD+1 family. It additionally asserts the `auth.*` subdomain WAS in the chain so the test fails closed if a future shortcut bypasses the IdP entirely.

## Consequences

### Positive

- **Demo trust**. During regulator and ministry sessions, the browser URL bar consistently shows `*.ehds.mabu.red` throughout the sign-in flow.
- **Documented decision trail**. The Phase 2 workflow is reusable for any future custom-domain work; the ADR records the exact `az containerapp` calls and env-var names.
- **Reversible**. The cutover steps are individually reversible without a clean rebuild.
- **Regression-protected**. The new Playwright test fails on any future change that re-introduces the long ACA-FQDN.

### Trade-offs

- **One-time silent sign-out** at the moment of cutover when `KEYCLOAK_ISSUER` flipped — anyone with an in-flight session got logged out. One-time event.
- **Two DNS records to maintain at iwantmyname.com**: a TXT (Azure verification) and a CNAME. The TXT is tied to the ACA env's `customDomainVerificationId`; if the env is rebuilt, the TXT must be refreshed.
- **Managed cert renewal** is automatic but ACA owns the cert lifecycle. Cert revocation requires an operator step.

### Rollback

If the custom domain needs to be retired:

```bash
# 1. Revert UI env vars to the ACA FQDN
az containerapp update -n mvhd-ui -g rg-mvhd-dev --set-env-vars \
    "KEYCLOAK_PUBLIC_URL=https://mvhd-keycloak.happysand-37f82e30.westeurope.azurecontainerapps.io/realms/edcv" \
    "KEYCLOAK_ISSUER=https://mvhd-keycloak.happysand-37f82e30.westeurope.azurecontainerapps.io/realms/edcv" \
    "NEXT_PUBLIC_KEYCLOAK_URL=https://mvhd-keycloak.happysand-37f82e30.westeurope.azurecontainerapps.io"

# 2. Revert Keycloak env vars
az containerapp update -n mvhd-keycloak -g rg-mvhd-dev --remove-env-vars \
    KC_HOSTNAME KC_HOSTNAME_STRICT_BACKCHANNEL KC_PROXY_HEADERS

# 3. Remove the custom domain binding from Keycloak
az containerapp hostname remove -n mvhd-keycloak -g rg-mvhd-dev \
    --hostname auth.ehds.mabu.red

# 4. Delete the DNS records at iwantmyname.com
#    https://iwantmyname.com/dashboard/domains/mabu.red/dns
#    Delete: TXT asuid.auth.ehds, CNAME auth.ehds
```

After step 1 every signed-in user is logged out one final time when the issuer claim no longer matches.

## References

- Issue [#28](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/28) — sign-in stays on `*.ehds.mabu.red`
- `.github/workflows/keycloak-custom-domain.yml` — Phase 2 cutover automation
- `ui/__tests__/e2e/17-role-navigation-e2e.spec.ts` — regression test
- ADR-012 — original ACA topology
- ADR-014 — weekly demo reset (the realm-import fix that surfaced this work)
