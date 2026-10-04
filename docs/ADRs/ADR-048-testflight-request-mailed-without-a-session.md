# ADR-048: The TestFlight request is mailed by the hub, without a session

**Status:** Accepted (2026-10-04, Matthias Buchhorn)
**Date:** 2026-10-03
**Relates to:** [ADR-036](ADR-036-operator-secrets-in-key-vault.md), [ADR-018](ADR-018-24x7-workaround-b.md)
**Supersedes:** the list of anonymous routes in [ADR-044](ADR-044-every-api-route-needs-a-session.md), by adding one route to it

## Context

#462 put a form on the start page to ask for the Klarbefund TestFlight preview.
It wrote the request into the visitor's own mail app through a `mailto:` link,
so it needed no mail server and worked in the GitHub Pages build. Matthias
asked for it to send in the background instead: a visitor fills it in, presses
send, and is done.

Two things stood in the way. Nothing in the stack sent mail. And the people
asking have no account on the hub, while ADR-044 says every API route needs a
session and that a new anonymous route needs a superseding ADR.

Four ways to deliver were weighed with Matthias: Azure Communication Services
Email, SMTP through his own mailbox, a hosted form service, or storing the
request for an admin page. He chose Azure Communication Services.

## Decision

`POST /api/testflight-request` answers without a session and mails the request
through Azure Communication Services Email. It joins the table in ADR-044:

| Route                     | Why it stays open                                                     |
| ------------------------- | --------------------------------------------------------------------- |
| `/api/testflight-request` | the start page's TestFlight form, sent by visitors without an account |

What keeps an open route that sends mail from becoming a relay:

- The recipient comes from the deployment (`TESTFLIGHT_REQUEST_TO`), never the
  request. The visitor fills three bounded fields: a name (100 characters, one
  line), an Apple ID (a valid address, 254) and a note (1000). The Apple ID is
  set as reply-to, so Matthias can answer the visitor directly.
- A hidden honeypot field. A request that fills it gets a 202 and sends nothing.
- A limit in memory per replica: three requests per client address and twenty
  in all per hour, then 429.

The resources live in `rg-mvhd-dev` (`scripts/azure/15-communication-email.sh`):
an Email Communication Service `mvhd-email` with an Azure-managed domain, and a
Communication Service `mvhd-acs` linked to it, both storing data in Europe. The
connection string is held once in Key Vault as `acs-email-connection-string`
and reaches `mvhd-ui` as a `keyvaultref` (ADR-036). The UI signs the REST call
itself (`ui/src/lib/acs-email.ts`), so it carries no SDK for one request.

The form keeps `mailto:` for the static GitHub Pages build, which has no API,
and offers the filled-in draft when the hub answers anything but 202 or 429.

## Consequences

- The start page sends the request in the background; the visitor never leaves
  the page or opens a mail app.
- The sender is `DoNotReply@<guid>.azurecomm.net`. An Azure-managed domain has
  low sending limits and mail from it can land in spam. A custom sender domain
  (for example `mabu.red`) needs DNS records and is the next step if that
  happens.
- The rate limit is per replica and lost on restart. That is enough for a form
  on a demo; a shared quota would need a store.
- `every-route-needs-a-session.test.ts` lists the route as anonymous, and
  `bruno/MVHDv2/00 Public/07` asserts a 400 for an invalid request without a
  session. It never sends a real mail.
- `Microsoft.Communication` had to be registered on the subscription. Unlike
  the two providers in ADR-018, the project owner role could register it.

## Alternatives considered

- **SMTP through Matthias's mailbox (nodemailer).** Rejected: his mailbox
  password would sit in the deployment, and the provider may throttle or block
  a server sending through it.
- **A hosted form service.** Rejected: names and Apple IDs would pass through
  a third party as a GDPR processor.
- **Store the request, no mail.** Rejected: someone has to remember to look.
- **Keep `mailto:`.** Rejected: the request was to send it in the background.
