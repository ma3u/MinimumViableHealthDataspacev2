# Federation agreement of the MVHD secure processing environments

**Version:** 1.0, 2026-11-26
**Decided in:** [ADR-100](../ADRs/ADR-100-the-proxy-coordinates-a-federation-of-attested-workspaces.md), decision 6 ([#1236](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1236))
**Register of members:** [`ui/public/federation/members.jsonld`](../../ui/public/federation/members.jsonld), generated from [`ui/src/lib/federation-members.ts`](../../ui/src/lib/federation-members.ts)

This is a demonstration document between fictional organisations, written
for the draft implementing act on secure processing environments under
Art. 73(5) of Regulation (EU) 2025/327 (Ares(2026)10903532, Chapter IV,
applies from 26 March 2029). It shows what a federation's agreement has to
cover (Art. 20). A real federation needs its own agreement, signed by its
real parties.

Each clause says whether it is **in force** in the demo today, or **agreed**
and in force from a later step of ADR-100. The steps are listed in the
ADR's "Order of the work".

## 1. Parties and roles

| Party                  | Role                                                   | Identifier                              |
| ---------------------- | ------------------------------------------------------ | --------------------------------------- |
| Health MVD Operator    | Coordinating operator (Art. 19(2), Art. 20(1)(a))      | `https://ehds.mabu.red/agents/operator` |
| AlphaKlinik Berlin     | Member: health data holder whose data SPE-1 holds      | `did:web:alpha-klinik.de:participant`   |
| Limburg Medical Centre | Member: health data holder whose data SPE-2 holds      | `did:web:lmc.nl:clinic`                 |
| MedReg DE              | Health data access body; admits and excludes instances | `did:web:medreg.de:hdab`                |

Today one operator runs both instances on behalf of their health data
holders ([ADR-069](../ADRs/ADR-069-two-spe-workspaces-as-aci-confidential-containers.md)).
A second operator, for example one running an instance for Institut de
Recherche Santé, joins by clause 3 without changing clauses 4 to 8 for the
existing members.

## 2. Duties of the coordinating operator

The coordinating operator runs the federated routes of the query proxy
(`/federated/query`, `/federated/stats`, `/nlq` with `federated: true`). It:

1. dispatches a query only to admitted members of the register (in force);
2. dispatches only aggregate queries, and refuses a list of records about
   persons before any member is asked
   ([federation.md](../architecture/federation.md#privacy-rules-on-the-federated-query-path), rule 3; in force);
3. combines the masked answers with `combineCounts`, so that no total gives
   a suppressed count back (in force);
4. records every federated query on the audit chain before the answer goes
   out, and answers nothing if it cannot
   ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md); in force);
5. gives every federated query one `federationQueryId` and passes it to
   every member it asks (ADR-100 decision 4; in force);
6. stops dispatching to a member that fails attestation, is suspended or
   has reported an incident, and tells the access body and the other
   members (clause 6; in force by a change of the register, automatic from
   step 3);
7. never signs a user in at a member: user management for the federation
   (Art. 18(2)(c)) is the coordinator's Keycloak. It passes the permit id
   and the pseudonymous id of the named person to the member (agreed, from
   step 4).

## 3. Admission

An instance is admitted when all four hold, and the access body records its
decision in the register:

1. it is listed in the register as a `dcat:DataService` with its operator,
   its dataset and its endpoint (in force);
2. it has attested with the label "Attested: confidential workload"
   ([ADR-068](../ADRs/ADR-068-a-sovereign-confidential-spe-on-confidential-containers-and-trustee.md)
   decision 5), and its key is released only to that attested workload (in
   force for the extract key; for the TLS key, agreed from step 3);
3. it holds a server certificate issued by the federation CA of the access
   body; for a second operator, the operator holds a
   `FederationMembershipCredential` from the access body (agreed, from
   step 3);
4. its operator has accepted this agreement, recorded as the
   `agreementVersion` of its register entry (in force).

## 4. Technical rules

| Rule                                                                                                  | State                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Aggregates only: no list of records about persons leaves a member                                     | In force (coordinator refuses before dispatch)                                                       |
| Every count below k is masked, with k at least 5 and never below the member's own minimum             | In force at the coordinator, per member, before combining; inside each member from step 4            |
| One `federationQueryId` per query, on the coordinator's record and on each member's                   | In force on the coordinator and in the transaction metadata; on each member's `SpeEvent` from step 4 |
| Traffic between coordinator and member is encrypted and both sides are authenticated                  | Encrypted and the member authenticated today; mutual TLS from step 3                                 |
| The Art. 71 opt-outs are applied in each member                                                       | In force ([ADR-062](../ADRs/ADR-062-the-art-71-opt-out-is-a-record-and-a-label.md))                  |
| Logs of access and activity are kept until one year after the permit ends, between one and five years | In force ([audit-retention-policy.md](../audit-retention-policy.md), draft act Art. 16(4))           |

Federated learning (Art. 19) is not offered under this version.

## 5. Suspension and exclusion

The access body suspends a member, by setting its status to `suspended` in
the register, when:

- its attestation fails or its policy hash no longer matches the permit;
- it breaks a rule of clause 4;
- it does not report an incident by clause 6.

A suspended member receives no query. The access body lifts a suspension
when the cause is removed, or excludes the member (status `excluded`) when
it is not. From step 3, exclusion also revokes the member's certificate, so
it can no longer complete a handshake.

## 6. Incidents

A member that detects a security incident or a breach of clause 4 tells the
coordinator within 24 hours. The coordinator stops dispatching to it at once
and tells the access body and the other members. The access body decides on
suspension by clause 5. The audit chain's records of the affected queries,
found by their `federationQueryId`, are kept until the access body closes
the incident.

## 7. Change

A change to this agreement is a new version in this repository, decided by
the access body with the coordinator. Members accept it by the new
`agreementVersion` in their register entry; a member that does not accept
it within 30 days is suspended. The version history is the file's git
history.

## 8. Exit

A member leaves by telling the access body and the coordinator. The access
body sets its status to `excluded`; the member deletes the data it holds
under any permit, as the draft act's Art. 8 requires of an instance whose
permit ends (agreed; the demo does not yet verify a deletion,
[#833](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/833)),
and the coordinator keeps its audit records for the period of clause 4.
