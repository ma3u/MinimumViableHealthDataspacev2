# ADR-028 — Patient QR login via the EUDI Wallet (OpenID4VP)

**Status:** Accepted · **Date:** 2026-06-04 · **Relates to:** #22, #72 (EUDI hackathon)

## Context

The EUDI Wallet Hackathon needs a patient-facing demo where a citizen logs in by
scanning a QR code with their EU Digital Identity Wallet (OpenID4VP cross-device),
in addition to the existing Keycloak password login. We hold a registered Relying
Party in the German EUDI Ecosystem Sandbox (`sandbox.eudi-wallet.org`, RP id
`13e7eccf-…`, access certs `B76AED0084C6DAC1` / `01AB8F311D62E159`). The UI is
deployed on **Azure Container Apps** (`rg-mvhd-dev`, app `mvhd-ui`, `ehds.mabu.red`).

## Decision

1. **Flow.** `/auth/signin` gains a "Sign in with EUDI Wallet (QR)" button →
   `/auth/eudi-qr`. A server route `POST /api/auth/eudi/start` initialises an
   OpenID4VP presentation at the verifier (DCQL for PID `eu.europa.ec.eudi.pid.1`),
   returns an opaque `sid` + a QR (the `openid4vp://?client_id=…&request_uri=…`
   deep link). The page polls `GET /api/auth/eudi/status?sid=…`; on completion a
   NextAuth **Credentials provider `eudi-wallet`** mints a real `PATIENT` session.
2. **Verifier engine = the hosted EU reference verifier** (`verifier.eudiw.dev`),
   fully **env-configurable** (`EUDI_VERIFIER_BASE_URL`, `_SCHEME`, `_PROFILE`,
   `EUDI_PID_DOCTYPE`, `EUDI_REQUEST_URI_METHOD`). Contract pinned against the
   `eudi-srv-web-verifier-endpoint-23220-4-kt` README.
3. **Server-side trust only.** Cryptographic verification of the `vp_token` is
   delegated to the verifier backend; the routes consume its validated result. The
   browser only ever holds the opaque `sid`; PID claims never reach the client.
4. **Identity mapping.** Every verified wallet maps to a fixed synthetic patient
   (`patient1`); the verified holder name (when disclosed) is the display name. The
   identity is cosmetic — a real PID will not match the synthetic Synthea cohort.
5. **Static export.** The button and `/auth/eudi-qr` are gated on
   `NEXT_PUBLIC_STATIC_EXPORT`; on GitHub Pages they degrade gracefully (the
   demo-persona path remains). No mock fixture fakes a successful auth.
6. **Deploy.** Verifier env vars added to `scripts/azure/05-cfm-ui.sh` (fresh
   create) and `.github/workflows/deploy-azure.yml` (live re-assert on each deploy).

## German sandbox tension (explicit)

The chosen path (German sandbox RP + public `verifier.eudiw.dev`) is partially in
tension: `verifier.eudiw.dev` signs requests with **its own** X.509 (`x509_san_dns`),
so the EU **reference wallet** will complete the flow, but the **German sandbox
wallet** will only trust a request signed with our RP **access certificate**. The
sandbox publishes no hosted verifier API / trust anchors. To honour the German path
later we must either **self-host** the reference verifier configured with the access
certificate, or register a trusted `client_id` in the sandbox RP — both need the
access-cert private key (held only by the RP owner) and SPRIND specifics. Kept as a
config switch; not a code change.

## To enable the German sandbox wallet (needed from the RP owner)

Confirmed by recon — the SPRIND wallet validates the RP against its WRPAC trust list
and rejects any request not signed by our access cert, so the public verifier cannot
serve it. To switch the German path on:

1. The RP **access certificate as a PKCS#12 `.p12`** (private key + full chain) for
   RP `13e7eccf-…` (serial `B76AED0084C6DAC1` and/or `01AB8F311D62E159`), exported
   from the login-gated portal, plus its export password.
2. The **leaf cert SAN dNSName** — it dictates the self-hosted verifier's public
   hostname (`x509_san_dns` requires the `response_uri` FQDN to equal the `client_id`
   host).
3. The assigned **`client_id` / `client_id_scheme`** (`x509_san_dns` vs `x509_hash`).
4. The **`response_uri`** registered/registerable for the RP (must point at the
   verifier's `/wallet/direct_post`).
5. Then **self-host** the reference verifier on ACA (`mvhd-eudi-verifier`, internal),
   load the `.p12` as a JKS, and set `EUDI_VERIFIER_BASE_URL` to it — no app code
   change. Pre-flight: confirm the SPRIND wallet trusts a sandbox RP-Access-CA cert
   in cross-device mode and which `client_id_scheme` it enforces.

## Consequences / risks

- In-memory `sid` store is fine for the single ACA replica (min=max=1) but drops
  in-flight logins on a revision rollover — durable store is the production path.
- `NEXTAUTH_SECRET` is still the placeholder `mvhd-azure-secret-change-me`; rotate to
  an ACA secret before relying on Credentials sessions beyond the demo.
- Wire-format enums (`request_uri_method`, scheme, `response_mode`) may need tuning
  against a live wallet scan — hence they are env-configurable, not hard-coded.

## Alternatives rejected

- **Self-hosted verifier now** — user chose the public verifier; kept as a switch.
- **Real Neo4j PID lookup** — a real wallet's PID won't match synthetic patients →
  would lock the holder out.
- **Demo-only session** — diverges from the app's NextAuth/role model.
