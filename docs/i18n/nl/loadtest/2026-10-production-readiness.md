---
source: docs/loadtest/2026-10-production-readiness.md
sourceHash: 4927266d5659782d41e2b19dcb537020f6b7d2b195229b9b5c4576bd7992496b
language: nl
summary: "De Well-Architected- en Cloud Adoption-beoordeling per 16 oktober 2026: wat per pijler aanwezig is, met het bewijs, wat open is, de scores en wat er tussen de demonstrator en een beheerbaar platform staat."
---

# Beoordeling van de productiegereedheid, oktober 2026

Het Well-Architected Framework (WAF) en het Cloud Adoption Framework (CAF),
toegepast op de EHDS Integration Hub zoals die op 2026-10-16 op Azure Container
Apps draait. Elke pijler vermeldt wat er is, met het bewijs, en wat nog
openstaat. De scores zijn het eigen oordeel van het project op een
tienpuntsschaal; niets hiervan is een onafhankelijke audit.

| Pijler                      | Score    | In één regel                                                                                                            |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| WAF: Operational Excellence | 7/10     | Uitrol bij elke merge, tracing en gestructureerde logs, zestien runbooks; geen alertregels, geen piketdienst            |
| WAF: Security               | 8/10     | Door het project getest, negen van de tien bevindingen gesloten; geen onafhankelijke test                               |
| WAF: Reliability            | 6/10     | 400 gebruikers zonder mislukt verzoek, overal healthchecks, beheerde Postgres met herstel; Neo4j één node, geen back-up |
| WAF: Performance Efficiency | 7/10     | Gedimensioneerd op basis van metingen, 50 gebruikers binnen elke SLO; 200 gebruikers nog niet                           |
| WAF: Cost Optimization      | 7/10     | Alles stopt buiten kantoortijden, kosten per 1.000 verzoeken gemeten; geen kostentoerekening per tenant                 |
| WAF: Sustainability         | 6/10     | De stack draait een derde van de week; geen CO2-bewuste keuze                                                           |
| CAF: Strategy & Plan        | 8/10     | De EHDS-rollen, de BSI-normen en eenenzestig beslissingen vastgelegd; geen SLA                                          |
| CAF: Govern & Manage        | 6/10     | Bewaarbeleid, audittrail, incidenttermijnen; geen SOC, geen benoemd incidentteam                                        |
| **Totaal**                  | **7/10** | **Een gemeten demonstrator. Geen exploiteerbaar platform voor echte gegevens; het gat staat aan het eind opgesomd.**    |

Het beoordeelde platform: de hub en zijn connectoren op Azure Container Apps in
`rg-mvhd-dev`, West Europe, 21 apps en 9 jobs. PostgreSQL op een Flexible
Server ([ADR-041](../ADRs/ADR-041-managed-postgres-on-azure-containerised-locally.md)),
Neo4j Community op 2 vCPU en 4 GiB ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md)),
de UI op hele cores met tot zes replica's ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)),
Vault met zijn status op de Flexible Server ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)),
gestopt buiten kantoortijden ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md),
[ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)). De
belastingcijfers zijn de runs in [de index van de resultaten](README.md); de
stand van de beveiliging is het [beveiligingstestrapport van 2026-10-15](../security/security-test-report-2026-10-15.md);
hoe het platform echt bedoeld is te worden geëxploiteerd, staat in de
[operationele richtlijn](../security/operational-guideline.md).

## WAF-pijler 1: Operational Excellence, 7/10

Aanwezig:

- Een merge naar main rolt uit naar Azure (`deploy-azure.yml`); de uitrol wacht
  zolang een belastingtest loopt en pint bij elke run de adressen van de
  connectoren vast. De PR-gate en de workflows voor tests, beveiliging,
  compliance en CodeQL draaien bij elk pull request; `demo-smoke.yml` draait
  Bruno, Playwright en ZAP tegen de live hub.
- OpenTelemetry-collector, Prometheus, Loki, Tempo en Grafana
  ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md));
  de proxy wordt getraceerd (`src/tracing.ts`) en logt gestructureerde JSON met
  de aanroeper en de run op elke regel (`pino`); elk auditrecord draagt zijn
  run. Logs 30 dagen in Azure Monitor.
- Vault behoudt zijn status over herstarts heen, lokaal in een bestand en op
  Azure in een database op de Flexible Server met een unseal-sidecar (ADR-046).
- Zestien runbooks onder `docs/knowledge/runbooks/`: uitrol, seeding, realmdrift,
  herstel van Postgres, buiten kantoortijden, belasting- en stresstest, de
  auditketen, de Klarbefund-verbinding.
- Elk image heeft een `HEALTHCHECK`; de crawlers stellen `/metrics` beschikbaar
  en worden daarop gecontroleerd; de seedfasen zijn hervatbaar.
- De documentatie wordt vanuit de repository gepubliceerd en in pre-commit
  gecontroleerd, zodat de docs niet van de bestanden kunnen afwijken.

Open:

- Geen alertregels. Het belastingdashboard, de auditketen en de burst credits
  van Postgres worden door een persoon gelezen; niemand wordt opgeroepen.
- Geen piketmodel en geen benoemde operator; de operationele richtlijn
  beschrijft de rollen, het project kan ze niet invullen.
- Geen feature flags buiten de demoschakelaars.

## WAF-pijler 2: Security, 8/10

Aanwezig:

- Het [beveiligingstestrapport van 2026-10-15](../security/security-test-report-2026-10-15.md):
  CodeQL, Semgrep, grype, npm audit, trivy, gitleaks, hadolint, shellcheck,
  de posture-tests van de app en 46 anonieme black-boxcontroles van de live
  hub. Tien bevindingen; negen gesloten, één beoordeeld en geaccepteerd (de
  gepubliceerde ontwikkelsleutel van de lokale compose-stack; Azure haalt zijn
  sleutels uit Vault).
- Het [dreigingsmodel van de hub](../security/threat-model.md) en
  [dat van de app](../security/threat-model-klarbefund.md), waarbij elke
  mitigatie de code of test noemt die haar aantoont; één CycloneDX-stuklijst per
  uitrolbaar onderdeel ([SBOM](../sbom/README.md)), gecontroleerd tegen de
  lockfiles.
- Elke API-route vereist een sessie ([ADR-044](../ADRs/ADR-044-every-api-route-needs-a-session.md));
  wie de identiteit van een patiënt ziet, wordt bepaald door de rol, nooit door
  een queryparameter; de UI leest de graaf rechtstreeks en de proxy bedient de
  data planes ([ADR-043](../ADRs/ADR-043-graph-access-direct-or-through-the-proxy.md)).
- Rate limits in de proxy, per gebruiker en per deelnemer, gemeten onder
  belasting; k-anonimiteit met een minimale cohortgrootte van vijf in de
  configuratie van de proxy.
- Operatorgeheimen zijn Key Vault-referenties ([ADR-036](../ADRs/ADR-036-operator-secrets-in-key-vault.md));
  het live `NEXTAUTH_SECRET` is geroteerd; de sleutels van de deelnemers staan
  in Vault.
- Keycloak: aanmeldgebeurtenissen zeven dagen bewaard, de scope van de
  UI-client beperkt tot de zeven EHDS-rollen, de beheerconsole niet op het
  internet, elke geprivilegieerde rol achter de consoleguard. De app vergrendelt
  met Face ID of de toegangscode
  ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)).
- Alleen de hub en Keycloak hebben publieke ingress; al het andere is intern in
  de omgeving.
- Het [beleid voor het bewaren van auditgegevens](../audit-retention-policy.md):
  tien jaar voor records van toegang, overdracht, contracten en vergunningen,
  twee jaar voor aanmeldingen en edge-logs, toegepast door
  `/api/admin/audit/retention`, dat de enige kopie niet kan vernietigen.

Open:

- Geen onafhankelijke penetratietest van de hub en geen TR-03161-test van de
  app; de laatste sectie van het rapport zegt wat elk zou toevoegen.
- Geen mTLS tussen apps en geen private endpoints; de richtlijn vraagt om beide
  vóór echte gegevens.
- Neo4j heeft één databasegebruiker; de toegang wordt in de hub en de proxy
  geregeld.
- Rotatie van geheimen is beschreven, niet ingepland.
- De operatoraccounts en `edcadmin` staan pas op gegenereerde wachtwoorden in
  Key Vault zodra `scripts/azure/secure-accounts.sh` tegen de live realm is
  uitgevoerd.

## WAF-pijler 3: Reliability, 6/10

Aanwezig:

- De stressrun van 2026-10-06 bereikte 400 gebruikers met 0 mislukte verzoeken
  op 81.518, bij 63,6 verzoeken per seconde; niets is herstart. Bij 50
  gebruikers houdt elke SLO stand.
- Elk image heeft een healthcheck en de probes van Container Apps zijn daarvan
  afgeleid; de proxy rondt lopende verzoeken af bij `SIGTERM`; elke uitgaande
  aanroep heeft een timeout; `/api/tasks` antwoordt vanuit zijn opslag als de
  connector faalt, en zegt dat.
- PostgreSQL op de Flexible Server bewaart zeven dagen point-in-time restore; de
  realm, de contracten en de takenopslag staan daar. De status van Vault ook.
- De graafweergaven zijn begrensd tot de nieuwste 30 toegangsgebeurtenissen,
  waarmee het enige verzoek is verdwenen dat de UI kon platleggen.
- Een uitrol kan niet midden in een belastingrun terechtkomen.

Open:

- Neo4j is één Community-node op Azure Files zonder back-up. De gegevens zijn
  vandaag opnieuw seedbare synthetische gegevens; vóór echte gegevens vraagt de
  richtlijn om Neo4j Enterprise of een beheerde graafdatabase met elk kwartaal
  geteste back-ups.
- Geen circuit breaker; een trage connector wordt alleen door timeouts begrensd.
- Vanaf 200 gebruikers breken de latentie-SLO's op de CPU van de UI. De nieuwe
  grootte van de UI (ADR-061) wordt toegepast door `scripts/azure/size-ui.sh`
  en is nog niet gemeten.
- De pagina's van de connectoren deden in de runs tot nu toe geen echt werk (de
  UI riep de management-API op het verkeerde adres aan, inmiddels vastgepind);
  de volgende `load`-run is de eerste met contracten en overdrachten onder
  belasting.
- Geen chaos engineering; de stressruns komen er het dichtst bij.

## WAF-pijler 4: Performance Efficiency, 7/10

Aanwezig:

- Gemeten, niet geraden: het plafond verschoof binnen één dag runs van het
  geheugen van Neo4j naar de CPU van de UI, en elke grootte is op basis van de
  meting gekozen (ADR-056 voor Neo4j, ADR-061 voor de UI, met de
  [schaalbaarheid per component](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md#scalability-per-component)).
- Bij 50 gebruikers: API-p95 155 ms, pagina's 43 ms, NLQ 217 ms, 21,5 verzoeken
  per seconde. `/api/graph` binnen de SLO na de begrenzing en de vergroting.
- Neo4j op 2 vCPU en 4 GiB, heap 1,5 GiB, page cache 1 GiB; indexen voor elk
  FHIR-querypad in `neo4j/init-schema.cypher` (meer dan 70, drie
  vectorindexen).
- De batchschrijver van de auditketen vangt de schrijfbelasting op; geaudite
  query's zijn geen plafond (434 ms p95 bij ongeveer 16 per seconde).
- Next.js comprimeert zijn antwoorden; de statische demo wordt door GitHub
  Pages geserveerd.

Open:

- Geen responscache voor de catalogus of het overzicht; geen compressie in de
  proxy.
- 200 gebruikers binnen de SLO's is het doel van de volgende `stress`-run, na
  `size-ui.sh`; de p95 per fase komt in de tabel van ADR-061.
- Geen CDN vóór de live hub.

## WAF-pijler 5: Cost Optimization, 7/10

Aanwezig:

- Alles stopt om 18:13 UTC en start om 05:17 UTC op werkdagen, aangestuurd door
  Azure als managed identity; ongeveer 65 kantooruren per week. De beslissing
  volgde op een maand waarin € 741 werd gefactureerd tegenover een raming van
  € 426 voor een stack die de klok rond draait (ADR-053).
- Schaalregels van Container Apps: de UI op een HTTP-concurrencyregel van 15,
  één tot zes replica's; alles naar nul buiten kantoortijden.
- De kosten van een verzoek zijn bekend: tegen catalogusprijs factureren de apps
  die een verzoek bedienen ongeveer $ 0,60 per uur, ongeveer **$ 0,01 per 1.000
  verzoeken bij 50 gebruikers** (ADR-061, uit `20261006-2115-load-aca`); een
  stressrun van 20 minuten met zes UI-replica's kost ongeveer $ 0,22 extra.
- Kostenbewaking houdt het totaal in de gaten (`cost-guards.yml`).

Open:

- Eén resourcegroep, één rekening: geen kostentoerekening per tenant of per rol.
- De kosten per 1.000 verzoeken uit Cost Management over een `soak`-venster
  moeten nog worden bepaald.

## WAF-pijler 6: Sustainability, 6/10

Aanwezig:

- De stack draait een derde van de week (ADR-053, ADR-058).
- Het gebruik van middelen is zichtbaar: de containerrij van het
  belastingdashboard, Cost Management.
- Het ene verspillende verzoek, de onbegrensde graafweergave, is verdwenen.

Open:

- West Europe, geen CO2-signaal in het schema of in de regiokeuze.

## CAF

**Strategy and plan, 8/10.** De regelgevende motivatie is per artikel
vastgelegd (Verordening (EU) 2025/327 in haar vastgestelde nummering); de
[operationele richtlijn](../security/operational-guideline.md) noemt welke
EHDS-rol welk onderdeel exploiteert en wat BSI C5, IT-Grundschutz, TR-02102 en
TR-03161 van elk vragen; eenenzestig ADR's leggen de beslissingen vast; de
planningsindex volgt het werk. Open: een formele SLA voor deelnemers, die de
richtlijn in het dienstverleningscontract van de operator onderbrengt.

**Ready, 7/10.** Azure vanaf een merge; de lokale stack met één
compose-commando; de seedfasen hervatbaar; één Dockerfile per onderdeel met zijn
stuklijst. Open: de eigen omgeving van de operator, die nog niet bestaat.

**Adopt, 7/10.** De DSP 2025-1-TCK, DCP- en EHDS-compliancesuites bij elk pull
request; de Bruno-collectie toetst elke route per persona
([ADR-031](../ADRs/ADR-031-checks-must-assert.md), [ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md));
2.317 UI-unittests, 1.145 Playwright-journeys, 279 Swift-tests. Open: chaos
engineering, en een generale repetitie van de migratie van Neo4j 5 naar 2025
([ADR-030](../ADRs/ADR-030-neo4j-2025-lts-migration.md)).

**Govern and manage, 6/10.** Het bewaarbeleid en de manipulatiebestendige
audittrail bestaan (ADR-045); de incidenttermijnen van de AVG en NIS2 en wie
elk ervan draagt, staan in de richtlijn (sectie 7); de EHDS-rollen hebben hun
checklist voor de livegang (sectie 10). Open: een SLA en het dashboard ervan,
een incidentresponsplan met een benoemd team, wijzigingsbeheer dat verder gaat
dan pull requests, kostentoerekening per tenant, een onafhankelijke test.

## Wat er tussen de demonstrator en een exploiteerbaar platform staat

Het gat zit niet meer in de code; het zit in de exploitatie, en de
[checklist van de richtlijn](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)
somt het per EHDS-rol op. De punten die het project zelf nog kan doen:

| #   | Punt                                                                                                          | Pijler                   | Gevolgd in                |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------- |
| 1   | `stress` na `size-ui.sh`, daarna `spike`, `soak` en `signin`; de p95 per fase in ADR-061                      | Performance, Reliability | #571                      |
| 2   | Alertregels op het belastingdashboard en de auditketen, en wie wordt opgeroepen                               | Operational Excellence   | open                      |
| 3   | Een back-up van Neo4j, of Neo4j Enterprise of een beheerde graafdatabase, vóór niet-synthetische gegevens     | Reliability              | richtlijn, sectie 2       |
| 4   | Compressie en een korte cache op de antwoorden van de catalogus en het overzicht                              | Performance              | open                      |
| 5   | Rotatie van geheimen volgens schema: de Keycloak-clients, de accountdienst, het catalogustoken                | Security                 | richtlijn, sectie 2       |
| 6   | Een onafhankelijke penetratietest van de hub en een TR-03161-test van de app                                  | Security                 | #655                      |
| 7   | Operatoraccounts en `edcadmin` op gegenereerde wachtwoorden in Key Vault (`scripts/azure/secure-accounts.sh`) | Security                 | #671                      |
| 8   | Een SLA met haar dashboard, en het incidentresponsplan met een benoemd team                                   | Govern and manage        | richtlijn, secties 7 en 8 |
