# ADR-050: The Klarbefund beta is joined by a public TestFlight link

**Status:** Proposed
**Date:** 2026-10-03
**Supersedes:** [ADR-048](ADR-048-testflight-request-mailed-without-a-session.md)
**Relates to:** [ADR-044](ADR-044-every-api-route-needs-a-session.md), #186

## Context

ADR-048 put a form on the start page: a visitor sent their name and Apple ID,
the hub mailed it to the maintainer through Azure Communication Services, and
the maintainer added each tester to the internal TestFlight group by hand.
That needed an anonymous route that sends mail, with a honeypot and rate
limits to keep it from becoming a relay, an Azure resource, and a person in
the loop for every tester. The static GitHub Pages build could only offer a
`mailto:` draft.

On 2026-10-03 Klarbefund got an external TestFlight group, "EHDS beta", with
a public link (limit 200, iPhone with iOS 26 or later), and build 1.0 (2) was
submitted for Beta App Review.

## Decision

The start page links to the public group:
`https://testflight.apple.com/join/ssADSXX6`. A button for a phone, a QR code
for a computer, the same on the hub and on GitHub Pages. The QR code is a
committed SVG, generated once and checked to decode to the link.

Removed with it: `POST /api/testflight-request`, `ui/src/lib/acs-email.ts`,
the form, their tests, the request in the API collection and the operation in
the OpenAPI spec. The table of anonymous routes in ADR-044 is back to the
sign-in flows and the health probe.

## Consequences

- No route on the hub sends mail. The Azure Communication Services resources
  from `scripts/azure/15-communication-email.sh` and the three `mvhd-ui`
  settings (`ACS_EMAIL_CONNECTION_STRING`, `ACS_EMAIL_SENDER`,
  `TESTFLIGHT_REQUEST_TO`) are now unused. They cost nothing while idle and
  are left in place until someone removes them deliberately.
- Apple admits testers, up to the limit, without the maintainer. Removing a
  tester or closing the link happens in App Store Connect.
- The link admits testers only after Beta App Review has approved a build.
  This change merges after that approval, so the page never shows a link that
  does not work.
- Every later build is added to the same group, so the link and the QR code
  never change. A new version's first build goes through Beta App Review
  again.
