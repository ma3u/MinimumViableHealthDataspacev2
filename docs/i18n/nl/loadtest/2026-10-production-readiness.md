---
source: docs/loadtest/2026-10-production-readiness.md
sourceHash: e4bba5749b0d00cb2da2c23f840ccb992cfd0ea64f64a7dce4327cbf887315ab
language: nl
summary: "De Well-Architected- en Cloud Adoption-beoordeling per 16 oktober 2026: wat per pijler aanwezig is, met het bewijs, wat open is, de scores en wat er tussen de demonstrator en een beheerbaar platform staat."
---

# Beoordeling van de productiegereedheid, oktober 2026

Het [Well-Architected Framework (WAF)](https://learn.microsoft.com/en-us/azure/well-architected/pillars) en het [Cloud Adoption Framework (CAF)](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/),
toegepast op de EHDS Integration Hub zoals die op 2026-10-16 op Azure Container
Apps draait. Elke pijler vermeldt wat er is, met het bewijs, en wat nog
openstaat. De scores zijn het eigen oordeel van het project op een
tienpuntsschaal; niets hiervan is een onafhankelijke audit. Het WAF heeft vijf pijlers; duurzaamheid hoort daar niet bij, maar is
de afzonderlijke [duurzaamheidsrichtlijn](https://learn.microsoft.com/en-us/azure/well-architected/sustainability/) van Microsoft voor workloads, hier ernaast beoordeeld.

| Pijler                                                                                                               | Score    | In één regel                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WAF: [Operationele uitmuntendheid](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/) | 7/10     | Uitrol bij elke merge, tracing en gestructureerde logs, zestien runbooks; geen alertregels, geen piketdienst                                                                                        |
| WAF: [Beveiliging](https://learn.microsoft.com/en-us/azure/well-architected/security/)                               | 8/10     | Door het project getest, negen van de tien bevindingen gesloten; geen onafhankelijke test                                                                                                           |
| WAF: [Betrouwbaarheid](https://learn.microsoft.com/en-us/azure/well-architected/reliability/)                        | 6/10     | 400 gebruikers zonder mislukt verzoek, overal healthchecks, beheerde Postgres met herstel; Neo4j één node, geen back-up                                                                             |
| WAF: [Prestatie-efficiëntie](https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/)       | 7/10     | Gedimensioneerd op basis van metingen, 50 gebruikers binnen elke SLO; 200 gebruikers nog niet                                                                                                       |
| WAF: [Kostenoptimalisatie](https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/)              | 7/10     | Alles stopt buiten kantoortijden, kosten per 1.000 verzoeken gemeten; geen kostentoerekening per tenant                                                                                             |
| Duurzaamheid (aparte richtlijn, geen WAF-pijler)                                                                     | 6/10     | De stack draait een derde van de week; geen CO2-bewuste keuze                                                                                                                                       |
| CAF: [Strategie en plan](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/strategy/)                 | 8/10     | De EHDS-rollen, de BSI-normen en zestig beslissingen ([ADR-001](../ADRs/ADR-001-postgresql-neo4j-split.md) tot [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)) vastgelegd; geen SLA |
| CAF: [Besturen en beheren](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/govern/)                 | 6/10     | Bewaarbeleid, audittrail, incidenttermijnen; geen SOC, geen benoemd incidentteam                                                                                                                    |
| **Totaal**                                                                                                           | **7/10** | **Een gemeten demonstrator. Geen exploiteerbaar platform voor echte gegevens; het gat staat aan het eind opgesomd.**                                                                                |

Het beoordeelde platform: de hub en zijn connectoren op [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/overview) in
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

## WAF-pijler 1: Operationele uitmuntendheid, 7/10

Aanwezig:

- Een merge naar main rolt uit naar Azure ([`deploy-azure.yml`](../../.github/workflows/deploy-azure.yml)); de uitrol wacht
  zolang een belastingtest loopt en pint bij elke run de adressen van de
  connectoren vast. De PR-gate en de workflows voor tests, beveiliging
  en [CodeQL](https://docs.github.com/en/code-security/codeql-cli) draaien bij elk pull request, de compliancesuites na wijzigingen aan main; [`demo-smoke.yml`](../../.github/workflows/demo-smoke.yml) draait
  [Bruno](https://www.usebruno.com/), [Playwright](https://playwright.dev/) en [ZAP](https://www.zaproxy.org/) tegen de live hub.
- [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-collector-releases/releases/tag/v0.161.0)-collector, [Prometheus](https://prometheus.io/docs/introduction/overview/), [Loki](https://grafana.com/docs/loki/latest/), [Tempo](https://grafana.com/docs/tempo/latest/) en [Grafana](https://grafana.com/docs/grafana/latest/)
  ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md));
  de proxy wordt getraceerd ([`src/tracing.ts`](../../services/neo4j-proxy/src/tracing.ts)) en logt gestructureerde JSON met
  de aanroeper en de run op elke regel ([`pino`](https://getpino.io/)); elk auditrecord draagt zijn
  run. Logs 30 dagen in Azure Monitor.
- Vault behoudt zijn status over herstarts heen, lokaal in een bestand en op
  Azure in een database op de Flexible Server met een unseal-sidecar ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)).
- Zestien runbooks onder [`docs/knowledge/runbooks/`](../knowledge/runbooks/): uitrol, seeding, realmdrift,
  herstel van Postgres, buiten kantoortijden, belasting- en stresstest, de
  auditketen, de Klarbefund-verbinding.
- Elk image heeft een [`HEALTHCHECK`](https://docs.docker.com/reference/dockerfile/#healthcheck); de crawlers stellen `/metrics` beschikbaar
  en worden daarop gecontroleerd; de seedfasen zijn hervatbaar.
- De documentatie wordt vanuit de repository gepubliceerd en in pre-commit
  gecontroleerd, zodat de docs niet van de bestanden kunnen afwijken.

Open:

- Geen alertregels. Het belastingdashboard, de auditketen en de burst credits
  van Postgres worden door een persoon gelezen; niemand wordt opgeroepen.
- Geen piketmodel en geen benoemde operator; de operationele richtlijn
  beschrijft de rollen, het project kan ze niet invullen.
- Geen feature flags buiten de demoschakelaars.

## WAF-pijler 2: Beveiliging, 8/10

Aanwezig:

- Het [beveiligingstestrapport van 2026-10-15](../security/security-test-report-2026-10-15.md):
  CodeQL, [Semgrep](https://github.com/semgrep/semgrep/releases/tag/v1.176.0), [grype](https://github.com/anchore/grype/releases/tag/v0.118.0), npm audit, [trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0), [gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), [hadolint](https://github.com/hadolint/hadolint), [shellcheck](https://www.shellcheck.net/),
  de posture-tests van de app en 46 anonieme black-boxcontroles van de live
  hub. Tien bevindingen; negen gesloten, één beoordeeld en geaccepteerd (de
  gepubliceerde ontwikkelsleutel van de lokale compose-stack; Azure haalt zijn
  sleutels uit Vault).
- Het [dreigingsmodel van de hub](../security/threat-model.md) en
  [dat van de app](../security/threat-model-klarbefund.md), waarbij elke
  mitigatie de code of test noemt die haar aantoont; één [CycloneDX](https://cyclonedx.org/)-stuklijst per
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

- Geen onafhankelijke penetratietest van de hub en geen [TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2)-test van de
  app; de laatste sectie van het rapport zegt wat elk zou toevoegen.
- Geen mTLS tussen apps en geen private endpoints; de richtlijn vraagt om beide
  vóór echte gegevens.
- Neo4j heeft één databasegebruiker; de toegang wordt in de hub en de proxy
  geregeld.
- Rotatie van geheimen is beschreven, niet ingepland.
- De operatoraccounts en `edcadmin` staan pas op gegenereerde wachtwoorden in
  Key Vault zodra [`scripts/azure/secure-accounts.sh`](../../scripts/azure/secure-accounts.sh) tegen de live realm is
  uitgevoerd.

## WAF-pijler 3: Betrouwbaarheid, 6/10

Aanwezig:

- De stressrun van 2026-10-06 bereikte 400 gebruikers met 0 mislukte verzoeken
  op 81.518, bij 63,6 verzoeken per seconde; niets is herstart. Bij 50
  gebruikers houdt elke SLO stand.
- Elk image heeft een healthcheck en de [probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes) van Container Apps zijn daarvan
  afgeleid; de proxy rondt lopende verzoeken af bij `SIGTERM`; elke uitgaande
  aanroep heeft een timeout; `/api/tasks` antwoordt vanuit zijn opslag als de
  connector faalt, en zegt dat.
- PostgreSQL op de Flexible Server bewaart zeven dagen [point-in-time](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-backup-restore) restore; de
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
  grootte van de UI ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)) wordt toegepast door `scripts/azure/size-ui.sh`
  en is nog niet gemeten.
- De pagina's van de connectoren deden in de runs tot nu toe geen echt werk (de
  UI riep de management-API op het verkeerde adres aan, inmiddels vastgepind);
  de volgende `load`-run is de eerste met contracten en overdrachten onder
  belasting.
- Geen chaos engineering; de stressruns komen er het dichtst bij.

## WAF-pijler 4: Prestatie-efficiëntie, 7/10

Aanwezig:

- Gemeten, niet geraden: het plafond verschoof binnen één dag runs van het
  geheugen van Neo4j naar de CPU van de UI, en elke grootte is op basis van de
  meting gekozen ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md) voor Neo4j, [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md) voor de UI, met de
  [schaalbaarheid per component](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md#scalability-per-component)).
- Bij 50 gebruikers: API-p95 155 ms, pagina's 43 ms, NLQ 217 ms, 21,5 verzoeken
  per seconde. `/api/graph` binnen de SLO na de begrenzing en de vergroting.
- Neo4j op 2 vCPU en 4 GiB, heap 1,5 GiB, page cache 1 GiB; indexen voor elk
  FHIR-querypad in [`neo4j/init-schema.cypher`](../../neo4j/init-schema.cypher) (meer dan 70, drie
  vectorindexen).
- De batchschrijver van de auditketen vangt de schrijfbelasting op; geaudite
  query's zijn geen plafond (434 ms p95 bij ongeveer 16 per seconde).
- Next.js comprimeert zijn antwoorden; de statische demo wordt door GitHub
  Pages geserveerd.

Open:

- Geen responscache voor de catalogus of het overzicht; geen compressie in de
  proxy.
- 200 gebruikers binnen de SLO's is het doel van de volgende `stress`-run, na
  `size-ui.sh`; de p95 per fase komt in de tabel van [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md).
- Geen CDN vóór de live hub.

## WAF-pijler 5: Kostenoptimalisatie, 7/10

Aanwezig:

- Alles stopt om 18:13 UTC en start om 05:17 UTC op werkdagen, aangestuurd door
  Azure als managed identity; ongeveer 65 kantooruren per week. De beslissing
  volgde op een maand waarin € 741 werd gefactureerd tegenover een raming van
  € 426 voor een stack die de klok rond draait ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)).
- Schaalregels van Container Apps: de UI op een HTTP-concurrencyregel van 15,
  één tot zes replica's; alles naar nul buiten kantoortijden.
- De kosten van een verzoek zijn bekend: tegen catalogusprijs factureren de apps
  die een verzoek bedienen ongeveer $ 0,60 per uur, ongeveer **$ 0,01 per 1.000
  verzoeken bij 50 gebruikers** ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md), uit `20261006-2115-load-aca`); een
  stressrun van 20 minuten met zes UI-replica's kost ongeveer $ 0,22 extra.
- Kostenbewaking houdt het totaal in de gaten ([`cost-guards.yml`](../../.github/workflows/cost-guards.yml)).

Open:

- Eén resourcegroep, één rekening: geen kostentoerekening per tenant of per rol.
- De kosten per 1.000 verzoeken uit [Cost Management](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/overview-cost-management) over een `soak`-venster
  moeten nog worden bepaald.

## Duurzaamheid, 6/10 (aparte richtlijn, geen WAF-pijler)

Beoordeeld volgens de [richtlijn van Microsoft voor duurzame workloads](https://learn.microsoft.com/en-us/azure/well-architected/sustainability/),
die naast de vijf WAF-pijlers staat en er niet toe behoort.

Aanwezig:

- De stack draait een derde van de week ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md), [ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)).
- Het gebruik van middelen is zichtbaar: de containerrij van het
  belastingdashboard, Cost Management.
- Het ene verspillende verzoek, de onbegrensde graafweergave, is verdwenen.

Open:

- West Europe, geen CO2-signaal in het schema of in de regiokeuze.

## CAF

**Strategie en plan, 8/10.** De regelgevende motivatie is per artikel
vastgelegd (Verordening (EU) [2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng) in haar vastgestelde nummering); de
[operationele richtlijn](../security/operational-guideline.md) noemt welke
EHDS-rol welk onderdeel exploiteert en wat [BSI C5](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CloudComputing/ComplianceControlsCatalogue/2020/C5_2020.pdf?__blob=publicationFile&v=5), [IT-Grundschutz](https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/IT-Grundschutz-Kompendium/it-grundschutz-kompendium_node.html), [TR-02102](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TG02102/BSI-TR-02102-1.pdf?__blob=publicationFile&v=15) en
TR-03161 van elk vragen; zestig [ADR's](../ADRs/), [ADR-001](../ADRs/ADR-001-postgresql-neo4j-split.md) tot [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md), legden op 2026-10-16 de beslissingen vast; de
planningsindex volgt het werk. Open: een formele SLA voor deelnemers, die de
richtlijn in het dienstverleningscontract van de operator onderbrengt.

**Gereed, 7/10.** Azure vanaf een merge; de lokale stack met één
compose-commando; de seedfasen hervatbaar; één Dockerfile per onderdeel met zijn
stuklijst. Open: de eigen omgeving van de operator, die nog niet bestaat.

**Toepassen, 7/10.** De eigen [DSP 2025-1](https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/)-, [DCP](https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/)- en EHDS-controles van de hub ([`run-ehds-dataspace-checks.sh`](../../scripts/run-ehds-dataspace-checks.sh), [`run-ehds-identity-checks.sh`](../../scripts/run-ehds-identity-checks.sh), [`run-ehds-tests.sh`](../../scripts/run-ehds-tests.sh))
draaien na wijzigingen aan main, sinds [ADR-074](../ADRs/ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md) één keer per nacht; het zijn niet de
TCK's van Eclipse, [DSP TCK](https://github.com/eclipse-dataspacetck/dsp-tck) en [DCP TCK](https://github.com/eclipse-dataspacetck/dcp-tck), die geen van beide al zijn gedraaid; de Bruno-collectie toetst elke route per persona
([ADR-031](../ADRs/ADR-031-checks-must-assert.md), [ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md));
op 2026-10-15 telde het [beveiligingstestrapport](../security/security-test-report-2026-10-15.md) 2.488 UI-unittests en 419 Swift-tests. Open: chaos
engineering, en een generale repetitie van de migratie van Neo4j 5 naar 2025
([ADR-030](../ADRs/ADR-030-neo4j-2025-lts-migration.md)).

**Besturen en beheren, 6/10.** Het bewaarbeleid en de manipulatiebestendige
audittrail bestaan ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)); de incidenttermijnen van de AVG en NIS2 en wie
elk ervan draagt, staan in de richtlijn ([sectie 7](../security/operational-guideline.md#7-incidents-clocks-and-who-notifies-whom)); de EHDS-rollen hebben hun
checklist voor de livegang ([sectie 10](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)). Open: een SLA en het dashboard ervan,
een incidentresponsplan met een benoemd team, wijzigingsbeheer dat verder gaat
dan pull requests, kostentoerekening per tenant, een onafhankelijke test.

## Wat er tussen de demonstrator en een exploiteerbaar platform staat

Het gat zit niet meer in de code; het zit in de exploitatie, en de
[checklist van de richtlijn](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)
somt het per EHDS-rol op. De punten die het project zelf nog kan doen:

| #   | Punt                                                                                                                                                    | Pijler                                 | Gevolgd in                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `stress` na `size-ui.sh`, daarna `spike`, `soak` en `signin`; de p95 per fase in [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)         | Prestatie-efficiëntie, betrouwbaarheid | [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571)                                                                                                   |
| 2   | Alertregels op het belastingdashboard en de auditketen, en wie wordt opgeroepen                                                                         | Operationele uitmuntendheid            | open                                                                                                                                                                        |
| 3   | Een back-up van Neo4j, of Neo4j Enterprise of een beheerde graafdatabase, vóór niet-synthetische gegevens                                               | Betrouwbaarheid                        | [richtlijn, sectie 2](../security/operational-guideline.md#2-hosting-architecture-from-the-demo-to-an-operable-platform)                                                    |
| 4   | Compressie en een korte cache op de antwoorden van de catalogus en het overzicht                                                                        | Prestatie-efficiëntie                  | open                                                                                                                                                                        |
| 5   | Rotatie van geheimen volgens schema: de Keycloak-clients, de accountdienst, het catalogustoken                                                          | Beveiliging                            | [richtlijn, sectie 2](../security/operational-guideline.md#2-hosting-architecture-from-the-demo-to-an-operable-platform)                                                    |
| 6   | Een onafhankelijke penetratietest van de hub en een TR-03161-test van de app                                                                            | Beveiliging                            | [#655](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/655)                                                                                                   |
| 7   | Operatoraccounts en `edcadmin` op gegenereerde wachtwoorden in Key Vault ([`scripts/azure/secure-accounts.sh`](../../scripts/azure/secure-accounts.sh)) | Beveiliging                            | [#671](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/671) voegde het script toe; het uitvoeren tegen de live realm staat nog open                             |
| 8   | Een SLA met haar dashboard, en het incidentresponsplan met een benoemd team                                                                             | Besturen en beheren                    | richtlijn, secties [7](../security/operational-guideline.md#7-incidents-clocks-and-who-notifies-whom) en [8](../security/operational-guideline.md#8-operating-the-platform) |
