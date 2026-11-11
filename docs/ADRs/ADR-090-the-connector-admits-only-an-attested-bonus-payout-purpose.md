# ADR-090: The connector admits only an attested bonus payout purpose

Date: 2026-11-11

**Status:** Proposed
**Relates to:** [ADR-080](ADR-080-a-bonus-programme-receives-a-yes-or-no-never-the-data.md) (decision 5), [ADR-077](ADR-077-a-minimal-set-of-standard-data-sharing-policies.md), [ADR-064](ADR-064-simpl-open-through-the-outside-agent-dcp-path.md), [ADR-087](ADR-087-the-hub-evaluates-a-bonus-year-once-it-has-ended.md)
**Tracks:** [#934](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/934), step 5

## Context

ADR-080 decided that the bonus agreement permits use for the payout only and
forbids `ehds:insuranceDecision`, `ehds:profile`, `ehds:advertise` and
`ehds:detrimentalDecision`, with a duty to delete after the payout. #934 step 5
asks for that as a standard policy, "enforced at the hub's connector, as Simpl
enforces at the provider", with a check that can fail: a request for the
purpose "premium setting" is refused.

The hub's connector enforced no EHDS term. ADR-077 recorded that EDC filters
out a constraint it has no function for, and since EDC 1.0 the control plane
declares the vocabulary to a scope nothing evaluates
(`EhdsPolicyVocabularyExtension`), so validation accepts the standard policies
and every negotiation skips them. A policy that said "bonus payout only" would
have been agreed by an insurer whose purpose was anything at all.

A purpose stated in the contract request proves nothing: the consumer writes
it. The hub already defines a `DataProcessingPurposeCredential`
(`jad/seed-issuer-defs.sh`) and configures a DCP scope for it, unused.

## Decision

1. **One enforced term, `ehds:attestedPurpose`, for the bonus programme
   policy only.** The control plane binds it to the negotiation and transfer
   scopes with a function that admits the consumer only when a
   `DataProcessingPurposeCredential` it presented attests one of the purposes
   the constraint names (`eq` or `isAnyOf`), and refuses otherwise
   (`EhdsAttestedPurposeExtension`, `AttestedPurposeFunction`). Every other
   EHDS term stays declared only, so no existing offer changes; PharmaCo's
   negotiations under the four ADR-077 policies are untouched.
2. **The consumer presents the credential because the policy names the
   term.** A scope extractor maps `ehds:attestedPurpose` to the purpose
   credential's DCP scope on the consumer's contract and transfer requests
   only (`AttestedPurposeScopeExtractor`). EDC's configured scopes match a
   left operand by a string prefix, which an expanded IRI never starts with.
   The provider's own messages carry the same policy and a provider holds no
   purpose credential; asking it for one failed the agreement message with
   401 on the first compose run.
3. **The policy is `mvhd-bonus-programme`**, the fifth standard policy
   (`ui/src/lib/standard-policies.ts`, `jad/policies/mvhd-bonus-programme.json`):
   purpose "EHDS Art. 7(3), primary use the person directs" (read by the
   hub's checker, which therefore applies no secondary-use rule),
   `ehds:attestedPurpose eq "bonus-payout"` (decided by the connector), legal
   basis GDPR Art. 9(2)(a); duty `delete` with the event "after the bonus
   payout"; the four prohibitions of ADR-080, decision 5. `odrl:event` joins
   the declared vocabulary for the duty.
4. **The insurer's own Governance Authority attests its purpose.** The
   insurance and wellbeing authority (#934 step 2) issues AlphaKasse DE a
   `DataProcessingPurposeCredential` with purpose `bonus-payout`, from a
   `purpose` attestation configured per definition
   (`DemoAttestationsExtension`), and the hub trusts that authority for this
   type as well as membership (`ui/src/content/trusted-issuers.json`). The
   authority vouches for what its member does; the hub decides which purpose
   its offer admits. A "premium-setting" credential from the same authority is
   refused by the policy, not by trust.
5. **The offer, for the check.** AlphaKlinik offers `bonus-programme-answer`
   under the policy (`scripts/seed-second-data-space.sh`, step 7). Delivering
   the yes or no through it is step 8; until then its address is the proxy's
   health probe.

Checks (`scripts/run-ehds-identity-checks.sh`, Category 7), passed on compose
on 2026-11-11:

| Check       | Consumer and purpose             | Result                                                                                                                                     |
| ----------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PURPOSE-7.1 | AlphaKasse, `bonus-payout`       | FINALIZED                                                                                                                                  |
| PURPOSE-7.2 | PharmaCo, no purpose credential  | TERMINATED, 401: the presentation for the purpose scope fails before any policy runs                                                       |
| PURPOSE-7.3 | AlphaKasse, `premium-setting`    | TERMINATED, 400 "Policy in scope contract.negotiation not fulfilled: Constraint 'https://w3id.org/ehds/attestedPurpose' EQ 'bonus-payout'" |
| PURPOSE-7.4 | AlphaKasse, `bonus-payout` again | FINALIZED                                                                                                                                  |

## Consequences

### Positive

- The first EHDS term the hub's connector decides rather than records: an
  insurer whose authority attests another purpose cannot reach the agreement,
  whatever its request says.
- The purpose comes from a third party the hub trusts, over DCP, the same
  path Simpl's Governance Authority uses for membership (ADR-064), so a Simpl
  connector that presents the credential would be admitted the same way
  (not yet shown: step 7).
- The pattern carries over: binding `ehds:purpose` of the ADR-077 policies to
  the same function is a configuration of this one, when the access bodies
  issue purpose credentials.

### Negative

- A consumer without any purpose credential is refused at DCP with 401, not
  by the policy with 400: correct, but the reason is not in the answer, and
  EDC 1.0 does not log it (#881).
- A consumer holding several purpose credentials is admitted when one of them
  matches. The policy checks what an authority vouches for, not what the
  consumer intends this time.
- The demo attestation issues any purpose its definition is configured with,
  to any registered holder, as the demo membership does. A real authority
  attests from a register.
- Simpl's own connector (step 7) has to present the credential for the term;
  until then only the compose stand-in is shown.
- Not on Azure: the wellbeing authority and AlphaKasse run on compose and in
  CI only (`trusted-issuers.json`, environments). In CI the DSP path does not
  work yet, so Category 7 skips there with the reason, as 6.3 to 6.9 do.

## Alternatives considered

- **Bind `ehds:purpose` for every policy.** Stronger, but PharmaCo's live
  negotiations would need purpose credentials the access body does not issue
  yet, and could break on Azure.
- **Check the purpose in the hub's Next.js transfer route.** Not the
  connector, which is what step 5 asks for, and an insurer negotiating
  directly with the connector would pass.
- **Trust the purpose the consumer writes in its request.** Self-declared;
  "premium setting" would be refused only from an honest insurer.
- **Have the hub's own issuer attest AlphaKasse's purpose.** Mixes the two
  data spaces: AlphaKasse holds nothing from the hub's issuer (TRUST-6.6), and
  the hub would vouch for an insurer it does not register.
