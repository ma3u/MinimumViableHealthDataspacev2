# ADR-091: The insurer collects the yes or no, under a reference the hub issues

Date: 2026-11-11

**Status:** Proposed
**Relates to:** [ADR-080](ADR-080-a-bonus-programme-receives-a-yes-or-no-never-the-data.md) (decisions 2, 4 and 6), [ADR-087](ADR-087-the-hub-evaluates-a-bonus-year-once-it-has-ended.md), [ADR-090](ADR-090-the-connector-admits-only-an-attested-bonus-payout-purpose.md), [ADR-064](ADR-064-simpl-open-through-the-outside-agent-dcp-path.md) (decision 6)
**Tracks:** [#934](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/934), step 8 (the hub's half)

## Context

Since step 6 a member can have the hub work out a bonus year and record the
answer: a `ProgrammeTransfer` with the program, the year and goal met
(ADR-087). Since step 5 the insurer reaches the bonus agreement only with an
attested bonus payout purpose (ADR-090). Nothing connected the two: the offer
`bonus-programme-answer` pointed at the proxy's health probe, and the member
was told the answer goes out "once the hub's delivery is connected".

ADR-080 decided what may leave (decision 2: the program, the year and goal
met, "tied to the member reference it already holds") and that the second
path sends it over a DSP agreement (decision 4). It left three things open:

- **Where the answer is served.** EDC 1.0 ships no data plane. siglet issues
  the token for a pull and the neo4j-proxy serves the dataset the token names
  ([`dataspace-token.ts`](../../services/neo4j-proxy/src/dataspace-token.ts), #881).
- **Which insurer gets which answers.** The policy admits any consumer whose
  authority attests the bonus payout. A second insurer with the same purpose
  must not read the first one's members.
- **What ties an answer to a member.** The hub knows a record; the insurer
  knows a member. The hub holds no insurance number, and AlphaKasse's member
  area does not exist in the demo.

Step 8 as written in #934 needs Simpl's own connector, which has no DCP yet
([`SimplIdentityService.java` L39-83](https://code.europa.eu/simpl/simpl-open/development/gaia-x-edc/simpl-edc/-/blob/v1.0.26/src/main/java/eu/europa/ec/simpl/iam/service/SimplIdentityService.java#L39-83)).
The hub's half does not: the compose stand-in for AlphaKasse negotiates and
pulls as a Simpl connector with DCP would.

## Decision

1. **The insurer collects; the hub does not push.** The answer is the data of
   the offer `bonus-programme-answer`. AlphaKasse starts an `HttpData-PULL`
   transfer under its bonus agreement and reads it at the proxy's
   `/dataspace/data` with siglet's token, as every other dataset on EDC 1.0.
   The dataset's route is `GET /programmes/answers`
   ([`routes/programmes.ts`](../../services/neo4j-proxy/src/routes/programmes.ts)).
2. **The route answers a pull only.** It reads the consumer from what the
   verified token grants, never from a header, and refuses any call that did
   not come through `/dataspace/data` with a token for this asset (403).
3. **Four fields per answer, nothing else.** `programme`, `year`, `goalMet`
   and `memberReference`. The query reads `ProgrammeTransfer` and
   `ProgrammeConsent` and no property of a `Patient`. One answer per consent
   and year: the latest the member sent.
4. **Only under an open consent.** A withdrawal takes the member's answers out
   of what the insurer can collect, at once and for transfers already started
   (ADR-080, decision 6; GDPR Art. 7(3)). What the insurer collected before
   stays with it under the agreement's duty to delete after the payout.
5. **Only to the program's publisher.** The consumer receives the answers of
   the programs it published. The token's consumer DID has to be the
   publisher's DID. The demo keeps two DID forms for one organisation
   (`.claude/rules/api-conventions.md`, DID Conventions): the catalogue names
   `did:web:alphakasse.de:insurer`, the connector is
   `did:web:<IdentityHub>:alphakasse`. The connector form is matched by its
   slug only when the hub's own IdentityHub hosts it, as it hosts the
   provider's; a DID from any other host has to equal the publisher's.
6. **The reference is the hub's, one per consent.** The answer is tied to a
   reference derived from the consent id (SHA-256, twelve characters of
   Crockford base32, `K9XZ-Z669-AZTN`). The member reads it on
   `/patient/programmes` and gives it to the insurer. The hub sends no name
   and no insurance number and stores neither. A new join after a withdrawal
   has a new reference. The portal and the proxy each compute it; both run
   the same vectors
   ([`member-reference-vectors.json`](../../services/neo4j-proxy/__tests__/fixtures/member-reference-vectors.json)).
7. **The hub records the collection.** The first pull that hands an answer
   over sets the transfer's `status` to `delivered`, with `deliveredAt` and
   `deliveredTo` (the consumer's DID), and writes the access to the audit
   trail (`TransferEvent`, Art. 73 logs). The member's page says when the
   insurer collected.
8. **The purpose is checked again at each transfer.** `ehds:attestedPurpose`
   is bound to the transfer scope too (ADR-090, decision 1): under an existing
   agreement, a consumer whose credential no longer attests the bonus payout
   starts no transfer.
9. **AlphaKasse needs a data plane.** A consumer context without one ends its
   own transfer "No dataplane found". `scripts/seed-second-data-space.sh`
   registers it (step 8), as `jad/seed-contract-negotiation.sh` does for the
   participants CFM creates.

Checks (`scripts/run-ehds-identity-checks.sh`, Category 8), passed on compose
on 2026-11-11. The two members are throwaway records the category writes and
removes (`source: 'identity-checks'`):

| Check       | What it does                                                    | Result                                                          |
| ----------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| DELIVER-8.1 | AlphaKasse agrees, starts a transfer, pulls                     | 200, both members' answers for 2025, one yes and one no         |
| DELIVER-8.2 | Reads the body's shape                                          | `programme`, `year`, `goalMet`, `memberReference` only; no ids  |
| DELIVER-8.3 | Reads the transfer in the graph                                 | `delivered`, to AlphaKasse's DID, with the date                 |
| DELIVER-8.4 | The second member withdraws; the same transfer pulls again      | The first member's answer only                                  |
| DELIVER-8.5 | A direct call naming AlphaKasse; a pull with a made-up token    | 403; 401                                                        |
| DELIVER-8.6 | AlphaKasse's credential attests `premium-setting`; new transfer | TERMINATED, 409 "agreement not found or not valid" from the hub |

## Consequences

### Positive

- The use case runs end to end on compose: join, result, send, collect,
  withdraw, with the insurer admitted by its own authority.
- What ADR-080 promises can fail a check: a fifth field in the answer, a
  withdrawn member in it, or a direct read each turn a check red.
- The hub learns nothing new about the member, and the insurer learns nothing
  it could link without the member handing over the reference.
- The pattern is the one every dataset uses on EDC 1.0, so a Simpl connector
  with DCP collects the same way (not yet shown: step 7).

### Negative

- The member has one more thing to do: give the reference to the insurer. An
  answer whose reference the insurer never received is of no use to it.
- Anyone who gives the insurer a reference claims that answer. The hub cannot
  tell whether the member passed on their own. A real insurer needs its own
  check, for instance the reference entered in its signed-in member area.
- A token issued before a withdrawal or a change of purpose stays valid until
  it expires (one hour). The withdrawal still applies, because the route reads
  consents on every pull; the purpose is checked at the next transfer.
- The slug rule in decision 5 exists only because the demo keeps two DID
  forms. A deployment whose catalogue names the connector's DID never uses it.
- The reference is computed in two places. The shared vectors keep them
  equal; a third reader has to run them too.
- Klarbefund does not show the reference yet, so a member who joined in the
  app reads it in the portal.
- Not on Azure: AlphaKasse and its authority run on compose and in CI only.
  The route deploys with the proxy and answers 403 to everything there. In CI
  the DSP path does not work yet, so Category 8 skips with the reason, as
  Category 7 does.

## Alternatives considered

- **The insurer issues the reference.** Its member area starts the join with
  an enrolment reference it already holds, which is what ADR-080's wording
  describes. It needs the insurer's member area, which the demo does not have.
  The answer's field is the same, so this can replace the hub's reference
  later without changing what the insurer reads.
- **The member types their insurance number when joining.** One more
  identifier of the person in the hub, and a typing error sends an answer to
  another member's account.
- **The hub pushes to the insurer's API.** A second channel beside the
  dataspace agreement, outside the policy the connector enforces, and the
  insurer would have to publish an endpoint the hub trusts.
- **Store the reference on the consent.** Needs a migration for consents that
  exist, and gains nothing while the hub issues it.
- **Use the consent id as the reference.** An internal id would leave the hub,
  and it is long to read out.
- **A read-only route that records nothing.** The member could not see that
  the insurer collected, and the transfer would stay "ready" for good.
