# ADR-101: The SPE gives zero-trust, permit-scoped access to data in place, not a copy per permit

Date: 2026-11-26

**Status:** Proposed (2026-11-26). Once accepted, it supersedes decision 3 of [ADR-068](ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md) ("a workspace per permit") in part: a workspace is per data holder, and the permit becomes a policy, a key and a log scope inside it.
**Relates to:** [ADR-037](ADR-037-secure-processing-environment-confidential-computing.md), [ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md), [ADR-069](ADR-069-two-spe-workspaces-as-aci-confidential-containers.md), [ADR-072](ADR-072-spe-workspaces-start-on-demand.md), [ADR-094](ADR-094-national-health-data-stays-at-the-source.md), [ADR-100](ADR-100-the-proxy-coordinates-a-federation-of-attested-workspaces.md)
**Tracks:** [#1225](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1225) (feedback on the draft act), [#716](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/716), [#833](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/833)

## Context

The Commission's draft implementing act on secure processing environments
(Ares(2026)10903532, under Art. 73(5) of Regulation (EU) 2025/327) builds the
SPE as a copy pipeline per data permit:

- an "instance" is "created and configured for a specific data permit"
  (Art. 2(4), 3(1)), with its own staging environment (recital 5, Art. 4(1));
- the access body checks, prepares and pseudonymises the data, and uploads it
  to the instance itself (Art. 4(2), (3));
- every instance gets a data-science and a collaboration suite (Art. 6);
- every instance is deleted, verifiably, within six months of the permit's end
  (Art. 8);
- every observable user activity goes to a write-once log (Art. 16).

Only disaster recovery is proportionate (Art. 11(7)), and no cost estimate is
published. TEHDAS2 D7.4 (24 February 2026), written by the access bodies that
will buy SPEs, calls building them "an expensive and time-consuming effort"
(Annex 7, p. 97) and activity logging a "significant cost issue" (p. 100).

Each copy is another place where the data is in plaintext, another backup and
another deletion to prove. A permit that runs five years, or a data holder
with fifty permits, multiplies all of it. The draft also leaves identity at
strong authentication of persons (Art. 10(4)): organisations, workloads and
federation members have no identity rules, and the permit is not
machine-readable.

The hub already works differently in two places. Each data holder has one
workspace ([ADR-069](ADR-069-two-spe-workspaces-as-aci-confidential-containers.md)), not one per permit, and the key is released only to an
attested workload ([ADR-068](ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md) decisions 1 and 2). National data stays at its
source ([ADR-094](ADR-094-national-health-data-stays-at-the-source.md)). Analytics platforms give governed access to data in place,
through views and policies on open table formats, instead of copying it per
project. Confidential computing protects the data while it is processed.

## Decision

1. **Zero trust** ([NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final)). Nothing is trusted because of where it
   runs or who operates it. Every request to a workspace is authenticated and
   authorised on its own, against the permit, on three identities:

   - the person, through the hub's identity provider or an EUDI Wallet;
   - the organisation, through a DCP credential ([ADR-100](ADR-100-the-proxy-coordinates-a-federation-of-attested-workspaces.md) decision 3);
   - the workload, through its hardware attestation.

   Continuous verification is how the hub meets Art. 5(2). Nothing holds
   standing access.

2. **One attested workspace per data holder; a permit is a policy, not a
   copy.** The permit's machine-readable ODRL policy becomes a governed view
   inside the holder's workspace. The view defines:

   - the cohort (rows);
   - the variables (columns);
   - the purpose;
   - aggregates only, or record level where the permit allows it;
   - the k threshold;
   - the Art. 71 opt-out filter ([ADR-062](ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md)).

   The view is enforced inside the attested workspace at query time. Permits
   stay logically separate (Art. 5(3), 13(1)), and no permit gets its own copy
   of the data.

3. **Per-permit cryptographic scope.** Trustee releases a key per permit,
   bound to the workspace's policy hash and to the permit id. Anything a
   permit produces inside the workspace is encrypted under that key. When the
   permit expires or is revoked, access stops and the key is destroyed, which
   makes the permit's artefacts unreadable (Art. 8). The holder's data stays.

4. **An interactive workspace only where the permit asks for one** (Art. 6).
   It is an ephemeral, attested container that reads the permit's governed
   view, not a copy of the data, and it ends with the session.

5. **The clear points come first, in this order:**

   1. per-permit keys, with revocation and key destruction at the permit's
      end ([#833](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/833));
   2. the permit's ODRL enforced as a governed view in the workspace;
   3. small counts masked inside the workspace ([ADR-100](ADR-100-the-proxy-coordinates-a-federation-of-attested-workspaces.md) step 4);
   4. organisation and workload identities ([ADR-100](ADR-100-the-proxy-coordinates-a-federation-of-attested-workspaces.md) step 3, DCP);
   5. EUDI Wallet sign-in bound to SPE access;
   6. a write-once store for the security-relevant logs.

6. **Say where this departs from the draft.** The draft's instance per permit
   and its staging and upload by the access body are not built. Our reading
   is that a permit's governed view, its key and its log scope inside an
   attested workspace are the "isolated processing environment ... configured
   for a specific data permit" of Art. 2(4). /compliance/spe-act and the
   feedback ([#1225](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1225)) say so. If the adopted act keeps a copy per permit,
   this ADR is reviewed.

## Consequences

- One workspace per holder serves all of that holder's permits. Cost scales
  with the number of holders, not with permits times their duration, and
  there is one plaintext place to protect and one deletion to prove per
  holder.
- Revoking a permit is a key and policy operation that takes effect on the
  next request. No instance has to be torn down.
- The governed view becomes security-critical code inside the trusted
  computing base. It changes the policy hash ([ADR-073](ADR-073-the-spe-tcb-is-a-minimum-not-a-list.md)), and it needs
  tests per ODRL constraint.
- Two permits in one workspace share a TEE. Separation between them is
  logical (views, keys, logs), not hardware. An access body that requires
  hardware separation per permit can still start a second workspace for that
  permit; this ADR makes that the exception, not the rule.
- The hub departs from the draft's wording on Art. 2(4), 3 and 4 until the
  adopted text is known.

## Alternatives considered

- **A copy per permit, as drafted.** Rejected because cost, plaintext copies
  and deletion proofs all grow with every permit, and none of it adds
  protection that attestation and per-permit keys do not already give.
- **A central data lake at the access body.** Rejected because it
  centralises every holder's data with one operator, against
  [ADR-094](ADR-094-national-health-data-stays-at-the-source.md) and the data space model.
- **Federated queries only, no record-level access ever.** Rejected because
  Art. 68 permits allow pseudonymised record-level processing. The governed
  view covers that case without a copy.
