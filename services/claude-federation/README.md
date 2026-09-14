# claude-federation

Lets MeinBefund ask Claude about selected lab values without any component of
this system holding an Anthropic API key.

See [ADR-034](../../docs/ADRs/ADR-034-claude-workload-identity-federation.md)
for why this service exists at all, and why the phone is deliberately not the
thing that federates.

## Two things worth knowing before setting this up

**Workload Identity Federation is not Claude Max.** It mints a short-lived
token acting as a service account in an Anthropic **organization**, and the
usage is billed as API usage through the Console. A Max subscription is a
separate consumer product with no service accounts. Setting this up means
paying for tokens, separately from Max.

**The phone never federates.** Whatever holds the identity JWT can mint an
organization-scoped token. An iPhone app is a public client and cannot keep a
secret, so this backend is the only workload with an identity. The app
authenticates the user; it holds no Anthropic credential.

## Setup

1. **Give the Container App a managed identity** and register an App ID URI in
   Entra to use as the audience, for example `api://meinbefund-claude`.

2. **Read the exact issuer and audience off a real token:**

   ```bash
   ANTHROPIC_WIF_AUDIENCE=api://meinbefund-claude npm run diagnose
   ```

   This prints the `iss` to register. Azure has two forms that differ only in
   shape, and the wrong one fails signature verification with no useful error.

3. **Console → Settings → Workload identity → Connect workload.** Register the
   issuer, and match on the audience **plus** a subject or claim. A rule
   matching only the issuer would accept any workload in the tenant.

4. **Set the environment** the wizard hands back:

   | Variable                       | Example                                           |
   | ------------------------------ | ------------------------------------------------- |
   | `ANTHROPIC_FEDERATION_RULE_ID` | `fdrl_...`                                        |
   | `ANTHROPIC_ORGANIZATION_ID`    | org UUID                                          |
   | `ANTHROPIC_SERVICE_ACCOUNT_ID` | `svac_...`                                        |
   | `ANTHROPIC_WORKSPACE_ID`       | `wrkspc_...`, only when the rule spans workspaces |
   | `ANTHROPIC_WIF_AUDIENCE`       | `api://meinbefund-claude`                         |
   | `USER_OIDC_ISSUER`             | `https://appleid.apple.com`                       |
   | `USER_OIDC_AUDIENCE`           | `red.mabu.meinbefund`                             |
   | `USER_OIDC_ALLOWED_SUBJECTS`   | your Apple `sub`, for a personal deployment       |

   Leave `ANTHROPIC_API_KEY` **unset**. It sits above federation in the SDK's
   credential precedence and a leftover key silently shadows the whole
   mechanism.

5. **Set `USER_OIDC_ALLOWED_SUBJECTS`.** Without it any valid Apple ID can bill
   your organization.

## What the service will not do

Enforced in `analyse.ts`, and covered by tests:

- **No consent, no call.** The request must name `anthropic` as the provider for
  that call. A blanket setting elsewhere cannot satisfy it.
- **At most 40 values per request.** Without a cap, "ask about this panel" is
  one loop away from "sync my record to a US API".
- **Nothing that identifies a person.** A name, birth date, insurance number or
  email in the payload is refused. The local store holds none of these, so their
  presence means a request was hand-built.
- **No values in logs.** The count and the LOINC codes are logged; the numbers
  never are.

The system prompt forbids diagnosis, risk scoring, prognosis and treatment
advice, and binds the model to the reference range the issuing lab printed. That
is the IVDR line from issue #186 §5, and it is stated in every request rather
than in a document nobody transmits.

## What this is not

Not a route for bulk export, not a replacement for the on-device model, which
stays the default, and not a claim that sending values to a US API is free of
consequence. It is a transfer of special category data, and a DPA and a record
of processing are prerequisites before anyone but the author uses it.
