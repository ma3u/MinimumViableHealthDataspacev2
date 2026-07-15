---
type: datamodel
title: DSP contract chain (L1)
description: The dataspace-protocol trust chain from offer to auditable transfer.
resource: .claude/rules/api-conventions.md (DSP contract chain)
tags: [dsp, odrl, L1, audit]
timestamp: 2026-07-15T00:00:00Z
---

```
(:Participant)-[:OFFERS]->(:DataProduct)-[:GOVERNED_BY]->(:OdrlPolicy)
(:DataProduct)-[:SUBJECT_TO]->(:HDABApproval)
(:Contract {contractId, status, signedAt})-[:COVERS]->(:DataProduct)
(:TransferEvent {transferId, timestamp, senderDid, receiverDid})-[:UNDER]->(:Contract)
```

`TransferEvent` and `QueryAuditEvent` are append-only (compliance-layer skill).
Participant DIDs use `did:web` (5 fictional orgs — see the DID table in
`.claude/rules/api-conventions.md`). Directory fields:
[participant-directory](participant-directory.md).
