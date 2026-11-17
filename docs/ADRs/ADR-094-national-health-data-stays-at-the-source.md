# ADR-094: National health data stays at the source; the hub takes descriptions, aggregates and counts

Date: 2026-11-15

**Status:** Proposed
**Relates to:** [ADR-037](ADR-037-secure-processing-environment-confidential-computing.md), [ADR-052](ADR-052-confidential-spe-on-azure-revisited.md), [ADR-083](ADR-083-what-the-hub-takes-over-from-tehdas2.md)
**Tracks:** [#1123](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1123)

## Context

A research institute is a likely partner for the hub, and the question it brings
is whether, together, we can load data from the German national health
databases into the graph. Two sources matter.

- **The national research data centre** for statutory health insurance data
  and, planned from October 2026, ePA data from patients who have not objected
  (Forschungsdatenzentrum Gesundheit). It has accepted applications since
  October 2025. Approved researchers receive no dataset: they analyse the data
  in its secure processing environment, and only results its staff have checked
  for re-identification leave it
  ([BMG, questions and answers](https://www.bundesgesundheitsministerium.de/themen/gesundheitswesen/forschungsdatenzentrum-fdz-gesundheit-fragen-und-antworten),
  [BMG, opening](https://www.bundesgesundheitsministerium.de/presse/pressemitteilungen/forschungsdatenzentrum-gesundheit-eroeffnet)).
- **The university hospitals of the Medical Informatics Initiative**, applied
  for through one portal (Forschungsdatenportal für Gesundheit). Their data is
  FHIR, which is what our FHIR layer reads. Feasibility queries answer with
  counts in real time; a data use needs an ethics vote from the applicant and
  a decision by each site's Use and Access Committee, under standard contracts,
  and the sites keep control of their data
  ([MII, central application](https://www.medizininformatik-initiative.de/en/central-application-health-data-use-research-projects)).
  Whether row-level pseudonymised data may leave a site is for that committee
  and contract; we have not confirmed the current terms.

The EHDS has the same shape: secondary use under a data permit
([Art. 68](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_68)) happens
in a secure processing environment
([Art. 73](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_73)), and a
health data request
([Art. 69](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_69)) answers
with anonymised statistics. Chapter IV applies in full from 26 March 2029
([dates](../ehds-article-numbering.md)). A 2026 statement on the German draft
research data law notes that the national secure processing environment follows
the EHDS concept
([TMF and DHM](https://www.tmf-ev.de/sites/default/files/2026-02/stellungnahme-dhm-und-tmf-referentenentwurf-forschungsdatengesetz-2026.pdf)).

The hub is none of these. ehds.mabu.red is a public demonstrator with published
demo passwords; its secure processing environment carries simulated
attestation (ADR-037, ADR-052: no attestation report reaches a container in
West Europe). Its data is synthetic and its organisations fictional, by policy
([code-style.md](../../.claude/rules/code-style.md)). A partner changes who may
apply for the data. It does not change where the data may go.

## Decision

1. **No row-level real health data in the hub.** Not from the national research
   data centre, not from a university hospital, not from a partner, and not
   pseudonymised. This holds for every deployment we run: the live hub, the
   compose stack and the GitHub Pages build.
2. **What the hub may hold from a national source:**
   1. _Dataset descriptions_ as HealthDCAT-AP
      ([Art. 77](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_77)),
      with access "secure processing environment only". The default build
      carries fictional analogues published by MedReg DE; the real descriptions
      only behind a demo build flag, as `NEXT_PUBLIC_DEMO_TK` does for live
      interoperability demos.
   2. _Published aggregate results_: anonymised, released by the source for
      publication, each with its source URL, licence, release date and the
      source's small-count rule.
   3. _Feasibility counts_ from a federated query: a count only, suppressed
      below the source's threshold, never the rows behind it.
3. **Real data work runs at the source, operated by the partner.** The pilot is
   our pipeline (Neo4j, the FHIR loader, the FHIR to OMOP mapping) as a bundle
   the partner runs inside the secure environment it is admitted to, under its
   own permit, ethics vote and contract. Results leave through the source's
   own review. We ship the bundle and its runbook; we never operate it and
   never see the data.
4. **Synthetic data may be calibrated on published aggregates.** Synthea
   parameters may follow published German distributions; the patients it
   produces stay synthetic and are marked as such.
5. **The demo tells this story with its own personas.** PharmaCo Research AG
   (DATA_USER) applies to MedReg DE (HDAB_AUTHORITY), the permit names the
   secure processing environment, and only aggregate results come back. The
   real bodies appear in the demo only behind the flag of decision 2.1.

## Consequences

- A partner conversation starts from what we can offer at once: the pipeline as
  a bundle, the dataspace contract flow, and catalog entries. No conversation
  starts with a data transfer to us.
- The pipeline must run without the dataspace control plane and offline, since
  a secure processing environment rarely reaches the internet. That is new work
  (#1123).
- The hub gains a node type for a published aggregate and a count-only
  feasibility answer; `neo4j/init-schema.cypher` and the mock fixtures change
  with them.
- We depend on what the sources publish. A figure that is not released for
  publication stays out, however useful.
- No real data on our side means no GDPR controller or processor role for us in
  the pilot, and nothing to secure beyond what the hub already holds.

## Alternatives considered

- **Load pseudonymised partner data into the hub.** Rejected: the hub is a
  public demo with published passwords and simulated attestation; pseudonymised
  data is personal data under the GDPR.
- **Host a secure processing environment for the partner on Azure.** Rejected
  for now: ADR-052 found no per-container attestation in our region, and an
  environment the source has not admitted would not receive the data anyway.
- **Wait for the EHDS in 2029.** Rejected: the German infrastructure already
  works this way, so a pilot can start under national law and carry over.
- **Name the real bodies in the default build.** Rejected: the demo stays
  fictional; real names belong behind a flag.
