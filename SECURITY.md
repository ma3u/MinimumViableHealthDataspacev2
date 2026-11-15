# Security policy

This repository holds the EHDS Integration Hub, a reference implementation of the
[European Health Data Space](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng), and
Klarbefund, its iPhone app. It is a demo and research project with one maintainer,
not a certified product. Reports are welcome and are handled as described here.

## Reporting a vulnerability

Report it privately through GitHub:
**[Security → Report a vulnerability](https://github.com/ma3u/MinimumViableHealthDataspacev2/security/advisories/new)**.
Please do not open a public issue, pull request or discussion for it.

Include what you can of:

- the component (see [Scope](#scope)) and the commit, release or TestFlight build;
- the steps to reproduce it, or a proof of concept;
- the impact you see, and whether you saw or kept any data that is not yours.

English or German, as you prefer.

## What happens next

| Step                                | Within                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Acknowledgement                     | 5 working days                                                                                 |
| Assessment and severity             | 10 working days, rated with [CVSS 4.0](https://www.first.org/cvss/v4-0/specification-document) |
| Fix or mitigation, critical or high | 30 days                                                                                        |
| Fix, medium or low                  | the next release                                                                               |
| Public advisory                     | after the fix, at most 90 days after the report, at a date agreed with you                     |

The fix lands on `main` through a pull request and reaches the live demo with its next
deployment. The advisory is published under this repository's
[Security Advisories](https://github.com/ma3u/MinimumViableHealthDataspacev2/security/advisories),
with a CVE requested through GitHub where one applies, and credits you unless you prefer
otherwise. If a deadline slips, you hear why and by when.

## Supported versions

| Version                                                                           | Supported                                |
| --------------------------------------------------------------------------------- | ---------------------------------------- |
| `main`, and the live demo at [ehds.mabu.red](https://ehds.mabu.red) built from it | ✅                                       |
| Releases (`v*` tags)                                                              | fixed in the next release, no back-ports |
| Klarbefund for iPhone, the newest TestFlight build                                | ✅                                       |
| Older Klarbefund builds                                                           | ❌                                       |

## Scope

In scope:

- the hub: [`ui/`](ui/), [`services/`](services/), [`neo4j/`](neo4j/), [`jad/`](jad/),
  [`k8s/`](k8s/), the Dockerfiles and compose files, and the workflows in
  [`.github/workflows/`](.github/workflows/);
- the live demo at `ehds.mabu.red` and its sign-in at `auth.ehds.mabu.red`;
- Klarbefund for iPhone, [`clients/ios/`](clients/ios/).

Not in scope, or to report elsewhere:

- Klarbefund for Mac, its MCP server and the local health graph: they live in
  [ma3u/relate-hackathon-team](https://github.com/ma3u/relate-hackathon-team), with
  their own [security policy](https://github.com/ma3u/relate-hackathon-team/blob/main/SECURITY.md)
  and [reporting form](https://github.com/ma3u/relate-hackathon-team/security/advisories/new);

- flaws in the building blocks themselves (Eclipse Dataspace Components, Keycloak,
  Neo4j, HashiCorp Vault, Next.js and the other dependencies), unless this project
  configures or uses them insecurely;
- Apple's platforms, and the model providers behind Klarbefund's optional cloud
  explanations;
- the findings already reviewed and accepted in the
  [security test report](docs/security/security-test-report-2026-10-15.md#findings):
  F3, the published development key of the local compose stack, and F4, a public
  search key the guideline register publishes itself;
- the off-hours page: the live demo is stopped in the evenings, at weekends and on
  Berlin public holidays, and answers 503 then by design.

## Testing rules

- **Use your own accounts.** The demo's research data is synthetic
  ([Synthea](https://github.com/synthetichealth/synthea)), but a Klarbefund sandbox
  record holds what its owner sent from their own phone, which can be real health data.
  Do not open, change or download a record that is not yours. If you reach one by
  accident, stop, keep nothing, and say so in your report.
- **No denial of service.** No load or volume tests against `ehds.mabu.red`; the load
  tests in [`load-tests/`](load-tests/) are for your own stack. Keep automated scans at
  a modest rate.
- **No social engineering, phishing or physical attacks**, and none against other users
  or the hosting provider.

Research in good faith that follows these rules is welcome: the maintainer will not take
legal action against it.

## How the project checks its own security

Self-tested, with tools anyone can run on this repository; not an independent
penetration test and not a certification.

- Threat models (STRIDE): the hub, [`docs/security/threat-model.md`](docs/security/threat-model.md);
  Klarbefund, [`docs/security/threat-model-klarbefund.md`](docs/security/threat-model-klarbefund.md).
- The security test of 2026-10-15, its findings and their fixes:
  [`docs/security/security-test-report-2026-10-15.md`](docs/security/security-test-report-2026-10-15.md).
- A gap analysis against BSI C5:2020:
  [`docs/security/bsi-c5-gap-analysis.md`](docs/security/bsi-c5-gap-analysis.md).
- What an operator would have to add:
  [`docs/security/operational-guideline.md`](docs/security/operational-guideline.md).
- In CI: CodeQL for TypeScript and Swift ([`codeql.yml`](.github/workflows/codeql.yml),
  [`codeql-swift.yml`](.github/workflows/codeql-swift.yml)), SBOM and CVE scans of the
  sources and images ([`security-scan.yml`](.github/workflows/security-scan.yml)),
  gitleaks in pre-commit, the PR Gate and the nightly run, and an npm audit gate; the
  bills of materials are in [`docs/sbom/`](docs/sbom/).

The same reports, to read in the browser:
[ehds.mabu.red/docs/security](https://ehds.mabu.red/docs/security), and, when the live
demo is off, its static copy at
[ma3u.github.io/MinimumViableHealthDataspacev2/docs/security](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/security).
