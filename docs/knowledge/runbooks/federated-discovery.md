---
type: runbook
title: Federated discovery — operate and verify
description: Check the crawler→enricher pipeline and onboard a new participant end-to-end.
resource: docs/architecture/federation.md, docs/persona-journeys/data-user-federated-discovery.md
tags: [runbook, federation, issue-8]
timestamp: 2026-07-15T00:00:00Z
---

**Onboard a participant:** `/admin/participants` (EDC_ADMIN) → add DID + DSP
catalog URL → next crawler tick (≤5 min) publishes to NATS → enricher MERGEs
`:HealthDataset {source:'federated'}` → visible in `/data/discover` and NLQ.

**Verify pipeline health:**

1. Crawler job ran: `az containerapp job execution list -n mvhd-catalog-crawler -g rg-mvhd-dev` (write ops via CI — see [azure-deploy](azure-deploy.md) gotcha).
2. Enricher consuming: `az containerapp logs show -n mvhd-catalog-enricher -g rg-mvhd-dev --tail 50`.
3. Datasets landing: NLQ "find diabetes datasets across German hospitals"
   should return `source = "federated"` rows (Phase 26g exit criterion #2).
4. Suppression behaves: a sub-minK contributor must yield
   `aggregateSuppressed: true` on `/federated/query` (proxy test
   `federated-k-anonymity.test.ts` is the executable spec).
