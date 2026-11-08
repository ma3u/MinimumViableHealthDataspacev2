# ADR-080: A bonus programme receives a yes or no, never the data

Date: 2026-11-08

**Status:** Accepted (2026-11-09)
**Relates to:** [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md), [ADR-064](ADR-064-simpl-open-through-the-outside-agent-dcp-path.md), [ADR-065](ADR-065-the-eudi-wallet-sign-in-identifies-the-person.md), [ADR-077](ADR-077-a-minimal-set-of-standard-data-sharing-policies.md)
**Tracks:** [#934](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/934), step 1

## Context

#934 proves the hub's Simpl interoperability on one use case that crosses two
data spaces: AlphaKasse DE, a fictional health insurer in an "insurance and
wellbeing" data space built on Simpl-Open, rewards a member for an active
year. Maria opts in; her fitness tracker's activity reaches her record under
her Data Act Art. 5 right, the check-up comes from her own EHR (EHDS Art. 3);
the hub works out whether she met the year's goal and AlphaKasse pays the
bonus.

An insurer and health data meet exactly where the EHDS draws one of its hard
lines. Art. 54(b) forbids secondary use to exclude people from an insurance
contract or to change their contributions or premiums, and the hub already
carries that prohibition as `ehds:insuranceDecision`
(`ui/src/lib/standard-policies.ts`, ADR-077). The same data would also let an
insurer profile a person (Data Act Art. 6(2)(b), GDPR Art. 22). Two things
are therefore open before any of #934's later steps is built:

- **Which channel this is.** Secondary use under a data permit, or sharing the
  person directs about herself.
- **What may leave the record.** Raw activity, a score, or less.

The hub has two records that sound close and are not this one: the Art. 71
opt-out (ADR-062), which governs secondary use, and study consent
(`PatientConsent`), which is GDPR consent to one research programme.

## Decision

1. **The bonus is primary, person-directed sharing.** The person starts it and
   can stop it. It never runs under a data permit, and an access body is not
   involved in the payout. AlphaKasse's legal basis for what it receives is
   the person's explicit consent to that programme (GDPR Art. 9(2)(a)).
   The EHDS article it rests on: "primary use" includes "relevant social,
   administrative or reimbursement services" ([Art. 2(2)(d)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#002.002)),
   and a person may ask a healthcare provider to transmit part of their data
   "to a clearly identified recipient in the social security or reimbursement
   services sector", one way only ([Art. 7(3)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#007.003)). That covers a
   statutory health insurer's bonus, which is how AlphaKasse DE is modelled.
   It does not cover a private insurer or any other recipient outside that
   sector; there, only the GDPR consent applies, and the use case needs its
   own review before it is built. The wallet path (decision 4) is the
   person's own sharing of a copy she holds ([Art. 3(2)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#003.002)), under
   the same consent.
2. **One yes or no leaves the record, per programme and year.** What AlphaKasse
   receives is the programme, the year and "goal met: yes" or "no", tied to
   the member reference it already holds. Steps, heart rate, Observation
   values, diagnoses, Encounter details and dates finer than the year never
   leave the hub (GDPR Art. 5(1)(c)).
3. **The hub computes; AlphaKasse does not.** The rule is published with the
   programme's catalogue entry and versioned, so the person and the insurer
   read the same rule. The hub evaluates it inside the person's record, and the
   person sees the result before anything is sent.
4. **The person carries the answer, or the hub sends it on her instruction.**
   The preferred path is an achievement attestation (SD-JWT VC) in her EUDI
   Wallet, disclosing the year and "goal met" only, which she presents to
   AlphaKasse (after #708). The second path sends the same yes or no over a DSP
   agreement with AlphaKasse's connector.
5. **The agreement forbids every other use.** The bonus agreement's policy
   permits use for the bonus payout only, prohibits `ehds:insuranceDecision`,
   `ehds:profile`, `ehds:advertise` and `ehds:detrimentalDecision`, and carries
   a duty to delete after the payout (#934, step 5). A bonus only rewards: a
   "no" changes nothing in the member's contract, and nothing beyond the agreed
   payout is decided on the answer (GDPR Art. 22).
6. **Programme consent is its own record.** Joining, seeing and withdrawing are
   per person and per programme. Withdrawal ends transfers at once. It is
   separate from the Art. 71 opt-out, which does not stop sharing the person
   directs herself, and from study consent; joining a bonus programme never
   enrols anyone in research.
7. **Evaluating the programme is secondary use and needs a permit.** If
   AlphaKasse wants to know whether the programme works, it applies to the
   access body (MedReg DE). That permit carries the Art. 54 prohibitions, drops
   opted-out persons and releases only anonymous results from an SPE (#934,
   step 9). Nothing from the evaluation reaches one member's contract.
8. **The demo stays fictional.** AlphaKasse DE is not a real insurer. Before a
   real insurer runs this, national bonus rules apply to it (in Germany
   § 65a SGB V), the design needs a legal review, and the operator has to
   assess whether doing this for many persons makes it a data intermediation
   service (Data Governance Act, Chapter III).

## Consequences

### Positive

- The use case crosses the insurance line without crossing Art. 54: the only
  data an insurer could misuse for a premium never reaches it.
- The checks are concrete and can fail: no Observation value in anything
  AlphaKasse receives; a transfer after withdrawal refused with 403; a request
  for the purpose "premium setting" refused (#934, steps 4 to 6).
- The pattern carries over to any person-directed yes or no (a vaccination
  status for an employer, a fitness-to-drive check) without new channels.

### Negative

- The hub runs the computation, so it has to publish, version and test each
  programme's rule; an insurer cannot change it unilaterally.
- A member cannot prove more than the rule computes. Disputes ("I walked more
  than that") need the person's own access to her record, not the insurer's.
- The wallet path waits for #708's next steps; until then only the DSP path
  can be shown end to end.
- Programme consent is a third consent-like record next to the opt-out and
  study consent, and the portal must keep the three apart in words a person
  understands.

## Alternatives considered

- **Send the tracker data to AlphaKasse and let it compute.** Fails data
  minimisation and hands an insurer exactly what Art. 54(b) and the Data
  Act's profiling ban are about.
- **Run the bonus as secondary use under a permit.** A permit serves research,
  statistics and policy, not a payout to one person, and Art. 54(b) forbids
  the insurance use outright.
- **Compute in an SPE on pseudonymised data for AlphaKasse.** The insurer would
  still learn a per-person health result it can link back to a member.
- **Treat "not opted out" as consent.** The opt-out governs secondary use
  (ADR-062); reading its absence as consent to an insurer would reverse the
  person's choice.
