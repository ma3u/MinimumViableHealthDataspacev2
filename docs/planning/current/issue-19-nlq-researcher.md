---
title: NLQ researcher improvements — pharmacovigilance scenario (issue #19)
status: current
owner: ma3u
updated: 2026-07-15
---

Canonical test: "Is tendon rupture frequently observed in patients treated
with ciprofloxacin diagnosed with UTI?" — cohort Cypher joining L3×L4 via L5,
SNOMED/ICD columns, formatted scores, interpretation paragraph, DQ badge.
Partially landed (commit `4d15af1`: graph-layer breadcrumb, cohort DQ,
CODED_BY backfill; proxy eval test `issue-19-pharmacovigilance.eval.test.ts`).
Open remainder: the unchecked acceptance boxes in issue #19 (drug-glossary
recognition breadth, result-table role separation, score legend).

Sources: issue #19 body, `services/neo4j-proxy/__tests__/`, stakeholder
feedback memory (Roman Haack, DrFalkPharma).
