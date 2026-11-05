# ADR-077: A minimal set of standard data-sharing policies

Date: 2026-11-05

**Status:** Proposed (2026-11-05)
**Relates to:** [ADR-068](ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md), [ADR-073](ADR-073-the-spe-tcb-is-a-minimum-not-a-list.md)
**Tracks:** [#876](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/876)

## Context

Since #879 a data user negotiates real offers on the live hub, and the
negotiate page shows the terms they agree to. The terms are almost empty:
every seeded offer is `open-fhir-access-policy` or `membership-access-policy`,
a bare `use` with no purpose, no permit, no period and no prohibition. The
hub's own check (`ui/src/lib/odrl-validate.ts`, the one `/admin/policies`
uses) finds six EHDS gaps in it.

`/admin/policies` has six templates, one per Art. 53(1) purpose plus Art. 7.
They cover purpose and some duties. They do not cover the region data may be
processed in, the processing environment, the operator's security
certification, the Art. 54 decisions, the AI Act, or the Data Act.

Matthias asked for standard policies according to the EHDS, the Data Act, the
DGA and the GDPR, covering compute in Europe, a confidential SPE, ISO/IEC 27001
and the EU AI Act, and for the minimal set.

## What each instrument requires of a data-sharing offer

Only what a policy between a data holder and a data user can carry. Duties
of the access body itself (Art. 57 to 59) or of the operator are not here.

| Instrument                  | Requirement                                                                                                           | Clause                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| EHDS Art. 53(1)             | only the listed purposes                                                                                              | `purpose isAnyOf` the six of Art. 53(1)                                                                  |
| EHDS Art. 54                | no decisions to a person's detriment, no insurance or credit decisions, no advertising, no harmful products           | prohibitions `detrimentalDecision`, `insuranceDecision`, `advertise`                                     |
| EHDS Art. 61(3)             | no re-identification                                                                                                  | prohibition `reIdentify`                                                                                 |
| EHDS Art. 61(4)             | publish results within 18 months, cite the source                                                                     | duties `publishResults`, `attribute`                                                                     |
| EHDS Art. 61(5)             | report significant findings and incidents                                                                             | duty `reportIncident`                                                                                    |
| EHDS Art. 66                | data minimised, pseudonymised where not anonymised                                                                    | duties `minimizeData`, `pseudonymize`                                                                    |
| EHDS Art. 68                | a data permit, for a limited period                                                                                   | constraints `dataPermit`, `inForceDate`                                                                  |
| EHDS Art. 69                | a data request is answered with anonymised statistics                                                                 | `hdabApproval`, duties `anonymize` (k at least 10), `aggregateOnly`                                      |
| EHDS Art. 73                | processing only in a secure processing environment, only anonymised results leave it                                  | constraint `processingEnvironment`, duty `secureProcessingEnvironment`, prohibition `extract`            |
| GDPR Art. 5(1)(b), (c), (e) | purpose limitation, minimisation, storage limitation                                                                  | purpose, `minimizeData`, `delete` at the end                                                             |
| GDPR Art. 6, 9(2)           | a legal basis for health data                                                                                         | constraint `legalBasis`                                                                                  |
| GDPR Art. 30, 32            | records and security of processing                                                                                    | duty `maintainAuditTrail`, constraint `certification`                                                    |
| GDPR Art. 44                | no transfer to a third country without Chapter V safeguards                                                           | constraint `spatial isPartOf EU/EEA`, prohibition `transferOutsideEU`                                    |
| DGA Art. 5(3), (5), (10)    | for protected public-sector data: an SPE or anonymisation, no re-identification, conditions on third-country transfer | the same clauses as EHDS Art. 73, 61(3) and GDPR Art. 44                                                 |
| DGA Art. 31, DA Art. 32     | safeguards against third-country governmental access to non-personal data                                             | `spatial`, `transferOutsideEU`                                                                           |
| DA Art. 5, 6(1)             | device data shared at the user's request, used only for what the user agreed, deleted when no longer needed           | `purpose`, `legalBasis` consent, `delete`                                                                |
| DA Art. 6(2)(b), (d), (e)   | no profiling unless needed, no sharing with a gatekeeper, no competing product                                        | prohibitions `profile`, `shareWithGatekeeper`, `developCompetingProduct`                                 |
| AI Act Art. 5               | no prohibited AI practice                                                                                             | prohibition `prohibitedAiPractice`                                                                       |
| AI Act Art. 10, 11          | data governance of training data: origin, examination for bias, documentation                                         | duty `documentTrainingData`                                                                              |
| ISO/IEC 27001               | not law; the security management standard behind EHDS Art. 73(1), GDPR Art. 32 and NIS2 Art. 21                       | constraint `certification isAllOf ISO/IEC 27001`                                                         |
| Confidential compute        | how the hub meets Art. 73 (ADR-068): the environment proves itself by remote attestation                              | constraint `processingEnvironment eq confidential SPE with remote attestation`, duty `attestEnvironment` |

## Decision

**Four policies, one per way health data leaves a holder**, built from the
clauses above (`ui/src/lib/standard-policies.ts`, `jad/policies/*.json`):

| Policy                         | When                                                                                                                     | Regulations                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `mvhd-ehds-permit-spe`         | record-level data, pseudonymised, under a data permit, in a confidential SPE in the EU, operator ISO/IEC 27001 certified | EHDS, GDPR, DGA, ISO/IEC 27001         |
| `mvhd-ehds-anonymised-request` | anonymised, aggregated answers to a health data request (Art. 69)                                                        | EHDS, GDPR                             |
| `mvhd-ehds-ai-training`        | the permit policy plus the AI Act's prohibited practices, data governance and no extraction of training data             | EHDS, GDPR, DGA, AI Act, ISO/IEC 27001 |
| `mvhd-da-device-data`          | data a connected device generates, shared with a recipient the user chose                                                | Data Act, GDPR                         |

Why this is the minimal set:

- **GDPR, DGA, compute in Europe, the confidential SPE and ISO/IEC 27001 are
  clauses, not policies.** They apply to every flow that lets personal data be
  processed, so each is a condition inside the policies above. A separate
  "GDPR policy" or "Europe policy" would have to be combined with every other
  one, and a contract carries one policy.
- **The EHDS is lex specialis to the DGA** for health data held by public
  bodies, so DGA Chapter II needs no policy of its own; its conditions are a
  subset of the permit policy's.
- **Primary use** (Chapter II, the patient's care) keeps the existing Art. 7
  template; it is not offered between data holder and data user.
- **Data altruism** (DGA Chapter IV) is out: no recognised data altruism
  organisation takes part in the dataspace.
- Every policy passes the hub's own check with no warning
  (`ui/__tests__/unit/lib/standard-policies.test.ts`); the Data Act policy is
  recognised as outside EHDS secondary use, like primary use.

Seeding: AlphaKlinik's FHIR offers and Limburg Medical Centre's FHIR offers
carry `mvhd-ehds-permit-spe`; its OMOP cohort statistics carry
`mvhd-ehds-anonymised-request`. Who may see an offer (the access policy) stays
as it was. The seed now updates an existing policy or contract definition
instead of skipping it, so a re-seed brings the change to a running connector.

Negotiation: the hub sends the offer's policy back whole
(`ui/src/app/api/negotiations/route.ts`); a request that repeats only `use`
would not match an offer with constraints.

## What is enforced, and by what

The connector evaluates a constraint only when a policy function is bound to
its left operand; it binds none of these, so it filters them out and the
negotiation succeeds. They bind the parties as terms of the contract. What
enforces them:

| Clause                                                                              | Enforced by                                                                                                                        |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| data permit and its validity                                                        | the permit gate on every transfer (`ui/src/lib/permit-gate.ts`, Art. 68); the purpose is the permit's, assessed by the access body |
| pseudonymised for the data user                                                     | the transfer data route (`ui/src/lib/transfer-data.ts`, #475)                                                                      |
| confidential SPE, attestation, EU region                                            | the SPE (ADR-068, ADR-069, ADR-073), when the data is processed there                                                              |
| audit trail                                                                         | the DSP audit callbacks (ADR-045)                                                                                                  |
| no re-identification, Art. 54, AI Act, Data Act prohibitions, publication, deletion | contract and supervision (EHDS Art. 63, 64); not technical                                                                         |
| ISO/IEC 27001                                                                       | the operator's certificate; a DCP credential for it is not issued yet                                                              |

## Consequences

- The negotiate page shows real terms, and the checker reports nothing open
  for them.
- **Known conflict, to resolve before the seed is applied on Azure:** the
  permit policy forbids `extract` (only anonymised results leave the SPE),
  while the transfer page's **Open** and **Download** show the pseudonymised
  data in the browser. For an agreement under that policy the page has to
  send the data user to the SPE workspace instead.
- The constraint values are text for people (`EU/EEA`, `issued by a health
data access body for this dataset`), not machine-checkable references. Binding
  functions for `dataPermit`, `spatial` and `certification` in the connector
  would let it refuse a request itself; that is a later decision.
- Applying the seed on Azure is a separate, approved step
  (`edc-seed-data-assets.yml`, `mode=apply`).
