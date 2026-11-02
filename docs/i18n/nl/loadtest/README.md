---
source: docs/loadtest/README.md
sourceHash: 9b7e7f5dd475758fc226e0d982b2c501af4ad553de56333c6de01c2760ad9ecf
language: nl
---

# Belasting-, stress- en piektests: resultaten en dashboards

Wat de live hub op https://ehds.mabu.red onder belasting doet, gemeten met de
k6-suite in [`load-tests/`](../../load-tests/) en vastgelegd in de Grafana van
het platform. Deze pagina is de index: elke run, wat hij heeft opgeleverd, wat
er daardoor is veranderd, en de runs die nog moeten worden uitgevoerd. De
gedetailleerde verslagen zijn gelinkt, en elke live run heeft zijn
dashboardlink.

De dashboards vereisen een aanmelding op <https://grafana.ehds.mabu.red> en
tonen alleen gegevens zolang de stack draait (hij stopt buiten kantoortijden,
ADR-053). Elke link opent het dashboard **Belasting- en stresstest** op de
`testid` en het tijdsbereik van de run; de ruwe k6-samenvattingen staan op de
laptop die ze heeft uitgevoerd (`load-tests/results/<testid>*`) en in de issues.

| Scenario    | Wat het doet                                                  | Laatste live run  | Resultaat                                                                                 |
| ----------- | ------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `smoke`     | 1 gebruiker, 30 s, elk endpoint één keer                      | 2026-10-05        | geslaagd                                                                                  |
| `load`      | 50 gebruikers, 15 min, de personamix                          | 2026-10-06, 21:15 | **haalt elke SLO**: p95 155 ms API, 43 ms pagina's, 217 ms NLQ, 0 mislukt                 |
| `audited`   | 1 tot 20 parallelle NLQ-query's via de auditketen             | 2026-10-05        | geslaagd na #534 en #536 (rate limit per gebruiker)                                       |
| `contracts` | tot 10 gebruikers die via de EDC onderhandelen en overdragen  | 2026-10-06, 13:52 | geslaagd: 578 verzoeken, 0 mislukt, p95 287 ms                                            |
| `stress`    | 50, 100, 200, 400 gebruikers, afbreken bij mislukte verzoeken | 2026-10-06, 21:40 | **400 gebruikers, 0 mislukt**; de latentie-SLO's breken vanaf 200 gebruikers, plafond: UI |
| `spike`     | een plotselinge sprong naar veel gebruikers en terug          | nog niet          | volgende, na `size-ui.sh` (ADR-061)                                                       |
| `soak`      | een constante belasting gedurende twee uur                    | nog niet          | na `spike`; meet de burst credits van Postgres                                            |
| `signin`    | 5 tot 50 aanmeldingen per minuut tegen Keycloak               | nog niet live     | compose: 12 van 127 aanmeldingen boven 3 s                                                |
| `proxy`     | de proxy alleen, 5 tot 25 gebruikers                          | nog niet live     | vereist een job binnen de omgeving; compose geslaagd                                      |

## De live runs, nieuwste eerst

### 2026-10-06 's avonds: belasting en stress na de fixes van de dag

Stack: Neo4j op 2 vCPU en 4 GiB (ADR-056), de graafweergaven begrensd tot de
nieuwste 30 toegangsgebeurtenissen (#580), de retry-lus van de onboardingagent
gerepareerd (#581), de takenopslag op de Flexible Server (#589).

| Run                                                                                                                                                                       | Gebruikers          | Verzoeken       | Mislukt    | p95 alles / API / pagina's / NLQ  | Oordeel                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------- | ---------- | --------------------------------- | ---------------------------------------------------------------------- |
| [`20261006-2115-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-2115-load-aca&from=1791321300000&to=1791322320000)     | 50 gedurende 15 min | 19.509 (21,5/s) | **0,00 %** | 146 ms / 155 ms / 43 ms / 217 ms  | elke SLO gehaald, checks 99,97 %                                       |
| [`20261006-2140-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-2140-stress-aca&from=1791322800000&to=1791324300000) | 50 tot 400, 20 min  | 81.518 (63,6/s) | **0,00 %** | 3,35 s / 3,53 s / 3,23 s / 4,93 s | latentie-SLO's overschreden vanaf 200 gebruikers; elk antwoord correct |

Het plafond was de UI: drie replica's van een halve core op 99 % CPU vanaf de
fase met 400 gebruikers, Neo4j op 0,82 van zijn 2 cores en 2,66 GB van 4 GiB, de
proxy op 0,06 cores. De fouten in de logs waren de UI die de EDC-management-API
op het verkeerde adres aanriep (ongeveer 8.900 regels met 404 in de stressrun),
wat #648 bij elke uitrol vastpint; de EDC-pagina's deden in deze runs geen echt
werk, dus de volgende `load` daarna verschuift de cijfers.

Wat er daardoor is veranderd: [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md),
een hele core per UI-replica, tot zes replica's met een HTTP-concurrencyregel
van 15, toegepast door `scripts/azure/size-ui.sh`; een uitrol wacht nu zolang
een run loopt (`LOAD_TEST_RUNNING`), omdat een merge op 2026-10-06 de UI en de
proxy midden in een run opnieuw uitrolde.

### 2026-10-06 's middags: de eerste stressrun tot 400 gebruikers

| Run                                                                                                                                                                       | Gebruikers          | Verzoeken     | Mislukt            | p95 API / pagina's / NLQ       | Oordeel                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------- | ------------------ | ------------------------------ | ---------------------------------------------------------------------------------- |
| [`20261006-1728-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1728-stress-aca&from=1791307740000&to=1791309060000) | 50 tot 400          | 84.624 (66/s) | **0,00 %**         | 3,19 s / 2,8 s / 4,35 s        | alle fasen bereikt; Neo4j is na ADR-056 niet herstart                              |
| [`20261006-1455-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1455-load-aca&from=1791298500000&to=1791299520000)     | 50 gedurende 15 min | 10.000+       | 0,03 %             | pagina's en API onder de SLO's | met #580 en #579 uitgerold; beide auditketens intact na de run                     |
| [`20261006-1152-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1152-load-aca&from=1791287580000&to=1791288600000)     | 50 gedurende 15 min |               | 0                  | 151 ms totaal                  | met #576; liep naast de retry-lus van de onboardingagent (#577)                    |
| [`20261006-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-stress-aca&from=1791274440000&to=1791275580000)           | 50 tot 400          |               | 2,1 % aan het eind | `/api/graph` 64 s aan het eind | afgebroken bij ongeveer 300 gebruikers: Neo4j wegens geheugen beëindigd (exit 137) |
| [`20261006-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-load-aca&from=1791273300000&to=1791274320000)               | 50 gedurende 15 min |               | 0                  |                                | de ochtendbaseline binnen de omgeving                                              |

De stressrun van de ochtend vond het plafond van Neo4j in het geheugen; de run
van de middag, na `size-neo4j.sh` (2 vCPU, 4 GiB, heap 1,5 GiB, page cache
1 GiB), bereikte 400 gebruikers zonder mislukt verzoek en verplaatste het
plafond naar de UI. Een belastingrun daartussen (`20261006-1359-load-aca`)
faalde op latentie omdat de onboardingagent op de achtergrond een vastgelopen
credentialverzoek dertig keer per seconde opnieuw probeerde (#577); de fix
(#581) ging live vóór de runs van de avond.

### 2026-10-05: de baseline

De eerste runs tegen de live hub, vanaf een laptop in Berlijn, met de kant van
het platform uit Azure Monitor: [de Azure-baseline](2026-10-baseline.md).
50 gebruikers gedurende 15 minuten slaagden zonder mislukt verzoek, maar met een
API-p95 van 1,8 s, met `/api/graph` op 10 s; de geaudite query's liepen tegen
de rate limit van de proxy aan (83,6 % 429 vóór #534, 23,2 % daarna). Neo4j op
97 % van zijn 2 GiB was het eerste plafond. Dezelfde suite tegen
[de compose-stack](2026-10-05-local.md) op een laptop, ter vergelijking: load
haalt elke SLO bij 50 gebruikers, stress breekt tussen 100 en 200 gebruikers op
de CPU van de UI.

![Dashboard Belasting- en stresstest, 50 gebruikers tegen ehds.mabu.red op 2026-10-05](img/2026-10-05-load-azure.png)

## Waar het platform staat

De [beoordeling van de productiegereedheid van oktober 2026](2026-10-production-readiness.md)
leest deze runs samen met het beveiligingswerk en de ADR's tegen het
Well-Architected Framework en het Cloud Adoption Framework, pijler voor pijler:
wat er is, wat openstaat, en wat er tussen de demonstrator en een exploiteerbaar
platform staat.

## Wat het dashboard toont

Het dashboard **Belasting- en stresstest** (`observability/grafana/dashboards-azure/load-stress-test.json`)
heeft drie rijen, elk gefilterd op de `testid` van de run:

- **Load (k6): what the test is doing**: virtuele gebruikers, verzoeken per
  seconde, mislukte verzoeken, p95 per groep (pagina's, API, NLQ), de traagste
  endpoints.
- **Server side: the proxy**: verzoeken en p95 per route, weigeringen door de
  rate limit, de records van de auditketen per transactie, de logregels van deze
  run.
- **Containers**: CPU en geheugen van de UI, de proxy, Neo4j, Keycloak en de
  connectoren, replica's, en de burst credits van de Flexible Server.

Het dashboard **EDC-contracten en -overdrachten** (`mvhd-edc-dsp`) volgt de
onderhandelingen en overdrachten die een `contracts`-run via de connectoren
uitvoert. Hoe u een resultaat leest, hypothese voor hypothese, staat in het
[runbook](../knowledge/runbooks/load-and-stress-test.md).

## De runs die nog moeten gebeuren

1. `stress` na `scripts/azure/size-ui.sh` (ADR-061): waar de API-SLO van 1 s
   met replica's op hele cores het eerst breekt; de p95 per fase komt in de
   tabel van de ADR.
2. `spike`, daarna `soak` gedurende twee uur: de burst credits van Postgres
   (hypothese 4 van het runbook) en de kosten per 1.000 verzoeken uit Cost
   Management over het soakvenster.
3. `signin` live: of de aanmelding een singleton is (hypothese 6).
4. `load` nog een keer met de EDC-pagina's die echt werk doen (#648 pint het
   adres van de connector bij elke uitrol vast).

Elk binnen kantoortijden, aangekondigd, één tegelijk; een uitrol wacht zolang
een run loopt. De procedure is het [runbook](../knowledge/runbooks/load-and-stress-test.md);
de openstaande punten worden gevolgd in [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571).

## Reproduceren

```bash
scripts/azure/run-load-test.sh load            # inside Azure, as a Container Apps job
ABORT_ON=failures scripts/azure/run-load-test.sh stress
load-tests/run.sh load azure                   # from a laptop, metrics to a local Grafana
```

De sessies worden voor tien gebruikers per persona vervalst en als geheim aan de
job meegegeven; niets echts meldt zich aan. De suite, de scenario's en de
drempels zijn gedocumenteerd in [`load-tests/README.md`](../../load-tests/README.md).
