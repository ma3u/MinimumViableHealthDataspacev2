---
source: docs/operations/dashboards.md
sourceHash: 39db3b7928f591277ed59e3c3ca266cb08249a1cebe8b4abc594966839e6f1b1
language: nl
---

# De dashboards

Drie Grafana-dashboards tonen wat de live hub doet: de contracten en
overdrachten die de connectoren onderhandelen, de regelgevende audittrail en de
integriteit ervan, en het platform onder een belastingtest. Ze draaien op de
eigen Grafana van de hub op <https://grafana.ehds.mabu.red>, onderdeel van de
observability-stack van
[ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)
(OpenTelemetry-collector, Prometheus, Loki, Tempo, Grafana, met Azure Monitor
en Log Analytics voor de containers en de logs van de connectoren).

| Dashboard                                                                                                                                                   | Id                | Beantwoordt                                                                        | Standaardbereik, verversing |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- | --------------------------- |
| [EDC-contracten en -overdrachten](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=now-90d&to=now&timezone=browser&refresh=1m) | `mvhd-edc-dsp`    | Wat hebben de connectoren onderhandeld en overgedragen, wat is geweigerd en waarom | 24 uur, 1 minuut            |
| [EHDS-audittrail](https://grafana.ehds.mabu.red/d/mvhd-ehds-audit/ehds-audit-trail?from=now-30d&to=now&timezone=browser&refresh=1m)                         | `mvhd-ehds-audit` | Is het bewijs intact, wat is vastgelegd, wat neemt een auditor over                | 24 uur, 1 minuut            |
| [Belasting- en stresstest](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test)                                                             | `mvhd-load-test`  | Wat doet k6, hoe snel antwoordt de hub, welke container raakt het eerst verzadigd  | 1 uur, 10 seconden          |

**Aanmelden.** Grafana vraagt om een eigen aanmelding. Het wachtwoord van het
operatoraccount is het Key Vault-geheim `grafana-admin-password` in
`kv-mvhd-b53a0449`; dat van het alleen-lezen-account van de auditor is
`keycloak-user-mvhd-auditor-password`. Niets op deze dashboards zijn gegevens
van een patiënt: de audittrail bewaart vragen en query's alleen als SHA-256, en
de belastingtests draaien tegen synthetische patiënten.

**Als er niets te zien is.** De stack stopt buiten kantoortijden
([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)), dus de panelen die
de proxy of de connectoren lezen zijn dan leeg; de panelen die Azure Monitor
lezen, behouden hun historie. Verruim het tijdsbereik voordat u concludeert dat
er niets is gebeurd; het paneel **Newest record** geeft aan wanneer het laatste
voorval plaatsvond.

**Waar ze vandaan komen.** De dashboards zijn JSON onder
[`observability/grafana/dashboards-azure/`](../../observability/grafana/dashboards-azure/)
(de Azure-varianten lezen Azure Monitor en Log Analytics) en
[`observability/grafana/dashboards/`](../../observability/grafana/dashboards/)
(de compose-stack leest Prometheus en Loki), gegenereerd door
`observability/grafana/build-dashboards.py` en geleverd met de
observability-app. Een wijziging aan een dashboard is een wijziging aan de
JSON ervan, beoordeeld zoals code.

## EDC-contracten en -overdrachten

![Het dashboard EDC-contracten en -overdrachten over 90 dagen: 2.791 onderhandelingen aangevraagd en 2.788 afgerond, 2.787 overdrachten aangevraagd, 2.785 gestart, 794 geweigerd wegens het ontbreken van een gegevensvergunning, één beëindigd; de onderhandelingsstatussen in de tijd met één piek op 6 oktober, de belastingtests](img/edc-contracts-transfers.jpg)

Elke DSP-contractonderhandeling en elke gegevensoverdracht, geteld uit de
`dsp`-hashketen van de audittrail: de hub schrijft een record wanneer hij de
connector iets vraagt (requested) of een overdracht weigert wegens het
ontbreken van een gegevensvergunning, en de callbacks van de connectoren
schrijven elke latere status (agreed, finalized, started, completed,
terminated). Het dashboard is de weergave voor de operator van dezelfde records
die de auditor op het dashboard van de audittrail leest.

| Rij                                          | Panelen                                                                                                | Hoe u het leest                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                                       | What this shows; **Newest record**                                                                     | Het nieuwste record in de keten, ongeacht het tijdsbereik. "9 days ago" met lege panelen betekent dat er sindsdien niets is onderhandeld: verruim het bereik.                                                                                             |
| Contract negotiations (DSP)                  | Requested, Agreed, Finalized, Terminated or failed; **Negotiation states** in de tijd                  | Requested en Finalized moeten over een rustige periode overeenkomen; een verschil is een onderhandeling die nooit van de connector is teruggekomen, wat de rij **Connector services** verklaart. "Agreed" is een tijdelijke status en staat normaal op 0. |
| Data transfers                               | Requested, Started, Completed, **Refused (no data permit)**, Terminated or failed; **Transfer states** | Refused is de poort die werkt: art. 61(1), geen toegang zonder vergunning (art. 68). De k6-contractjourney vraagt er bewust één keer op de vier zonder vergunning om, dus weigeringen dragen een tag _Load test run_ en worden verwacht (#571).           |
| Refused, terminated and failed, with reasons | Tabel **Not completed**                                                                                | Elk record dat geen succes is, met de reden van de connector, de partijen en de run waartoe het behoort.                                                                                                                                                  |
| Connector services (EDC)                     | Fouten per dienst, logregels per dienst, laatste connectorfouten (Log Analytics)                       | Regels met ERROR en SEVERE per connectordienst, zonder de eigen exportfouten van de OpenTelemetry-agent. Nul is het normale geval; de EDC-diensten loggen op INFO alleen bij het starten en bij problemen, dus een stil uur is een gezond uur.            |

De cijfers in de schermafbeelding zijn de belastingtests van 5 en 6 oktober
2026: ongeveer 2.800 onderhandelingen en overdrachten in een paar uur, elke
onderhandeling afgerond, en 794 overdrachten geweigerd omdat de journey zonder
vergunning vroeg. "Completed" blijft op 0 omdat de data planes van de demo
antwoorden met een gestarte overdracht en zonder completion-callback; de
aantallen overdrachten in de [resultaten van de belastingtests](../loadtest/README.md)
zijn de gestarte.

![De onderste rijen van het EDC-dashboard: de tabel Not completed met de geweigerde overdrachten van de stressrun, elk met reden en partijen; fouten en logregels per connectordienst over 90 dagen uit Log Analytics, met de piek van 15 september; de laatste connectorfouten](img/edc-contracts-transfers-connectors.jpg)

De onderste rijen in de schermafbeelding: elke geweigerde overdracht van de
stressrun met `did:web:pharmaco.de` als partij en de reden, en de foutregels
van de connectoren over 90 dagen, waarbij de enige piek de dag is waarop de
identiteitslaag opnieuw werd geseed.

## EHDS-audittrail

![Het dashboard EHDS-audittrail: beide ketens INTACT, 17.540 queryrecords en 11.946 contract- en overdrachtsrecords over 30 dagen, 0 mislukte auditschrijfacties, 0 geweigerde query's, 794 geweigerde overdrachten; daaronder de nieuwste records van de contract- en overdrachtsketen met hash, run, uitkomst, partijen, tijd en volgnummer](img/ehds-audit-trail.jpg)

De regelgevende audittrail van [ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md):
elke query in natuurlijke taal of gefedereerde query, elke contractonderhandeling
en elke overdracht is een FHIR R4-`AuditEvent`, met een hashketen verbonden aan
het voorgaande, en een verzoek waarvan het record niet kan worden geschreven,
wordt geweigerd. Het dashboard opent met de handleiding voor de auditor, die een
auditor zonder het project kan volgen:

![De auditorhandleiding bovenaan het dashboard: wat de verordening vraagt, daarna zeven stappen van het instellen van de auditperiode tot het noteren van de ketenkoppen, en de bekende beperking van een keten die leeft in de database die zij beschermt](img/ehds-audit-trail-guide.jpg)

| Rij                               | Panelen                                                                                                                                             | Hoe u het leest                                                                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auditor guide                     | De verordening (art. 61(1), 68, 73(1)(e), 9; AVG art. 5(2), 30) en zeven stappen                                                                    | De procedure van een audit, van de tijdkiezer tot het verslag. Volg haar in volgorde.                                                                                                                                                                                    |
| Integrity of the evidence         | **Query chain**, Query records, **Contract & transfer chain**, Contract & transfer records, Audit writes failed, Refused queries, Refused transfers | Beide ketens moeten **INTACT** tonen: de proxy herberekent bij elke verversing elke hash vanaf het eerste record. **BROKEN** betekent dat een record is gewijzigd, verwijderd of van volgorde veranderd: stop en escaleer. Audit writes failed moet 0 zijn of verklaard. |
| What was recorded                 | Contract- en overdrachtsrecords per soort; queryrecords per soort                                                                                   | Het volume in de tijd, per soort record; een belastingtest verschijnt als een piek met de tag van zijn run.                                                                                                                                                              |
| Records, newest first             | Contract- en overdrachtsrecords; queryrecords                                                                                                       | Eén rij per record: overeenkomst, asset en vergunning, demovlag, hash, belastingtestrun, uitkomst, partijen, reden, tijd, wie het heeft gemeld, volgnummer, wat. Vragen en Cypher verschijnen alleen als SHA-256.                                                        |
| For the audit report: chain heads | Query chain head; contract & transfer chain head                                                                                                    | Neem beide waarden, aantal records en hash, over in het auditverslag. Bij de volgende audit moet de keten nog steeds dezelfde kop hebben bij hetzelfde recordnummer; zo niet, dan zijn records achteraf herschreven.                                                     |

Twee dingen die een auditor moet weten, beide op het dashboard zelf: een record
gemarkeerd als **Demo** is demonstratieverkeer, geen echt gebruik; een record met
een **Load test run** is geschreven door een k6-run tegen de hub met synthetisch
verkeer en wordt apart geteld. En de bekende beperking (#418): de keten leeft in
Neo4j en bewijst volgorde en integriteit, maar iemand met schrijftoegang tot de
database zou haar vanaf een bepaald punt kunnen herbouwen; het vergelijken van
ketenkoppen tussen audits detecteert dat, en een ondertekende dagelijkse digest
met een write-once-kopie is wat het afsluit. De ruwe records zijn FHIR-`AuditEvent`s
op `/audit/chains/query/events` en `/audit/chains/dsp/events` op de proxy;
`scripts/verify-audit-chain.sh` herberekent de keten buiten Grafana.

## Belasting- en stresstest

![Het dashboard Belasting- en stresstest bij de stressrun van 6 oktober 2026: virtuele gebruikers die stijgen van 50 naar 400, tot 107 verzoeken per seconde, 0 % mislukte verzoeken, 0 met rate limit, de slechtste check op 84,9 %, 15.091 iteraties; de p95 per soort die vanaf de fase met 200 gebruikers stijgt tot 5,6 seconden voor NLQ, 5,1 seconden voor de API en 3,7 seconden voor pagina's](img/load-stress-test.jpg)

Waar u op let terwijl k6 tegen de hub draait (#519): de belasting die de test
aanbrengt, de responstijd die de client ziet per soort en per endpoint, de
eigen weergave van de proxy op dezelfde run, en welke container het eerst
verzadigd raakt. Het dashboard wordt gefilterd op de **Test run**-id van de run
(`testid`), zodat twee runs nooit door elkaar lopen; de links in de
[resultaten van de belastingtests](../loadtest/README.md) openen elke run op zijn
eigen id en tijdsbereik.

| Rij                                  | Panelen                                                                                                                                                                       | Hoe u het leest                                                                                                                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load (k6): what the test is doing    | Virtual users, requests / s, **Failed requests**, Rate limited (429), Checks passed (worst check), Iterations; gebruikers en verzoeken in de tijd; antwoorden per HTTP-status | Failed is het aandeel verzoeken met een status die de stap niet verwachtte; de SLO is onder 1 %. 429 is de rate limit, 5xx de hub die faalt, 0 een verzoek dat geen antwoord kreeg. De slechtste check noemt de SLO die als eerste brak, bijvoorbeeld "api under 1000 ms". |
| Response time, as the client sees it | **p95 by kind**: pages, API, NLQ, sign-in; p50, p95 en p99; p95 per endpoint; tabel per endpoint                                                                              | De SLO's: pagina's onder 2 s, API onder 1 s, NLQ onder 3 s. De endpointtabel is gesorteerd op p95; routes worden benoemd naar hun patroon, nooit naar een URL met een id.                                                                                                  |
| Server side: the proxy               | Requests / s by route, p95 by route, responses per minute by status, **audit records per transaction**, errors during the run                                                 | Gemeten in de proxy; het verschil met de p95 aan clientzijde zijn de UI en het netwerk. Auditrecords per transactie boven 1 betekent dat de batchschrijver de belasting opvangt (hypothese 2 van het runbook); bij 1 wacht elke query op zijn eigen transactie.            |
| Azure: who saturates first           | CPU en geheugen als % van de limiet van elke app, replica's, herstarts, burst credits van Postgres (Azure Monitor)                                                            | Neo4j op 100 % CPU is het plafond; Neo4j bij bijna 100 % geheugen eindigt in een out-of-memory-kill (exit 137); stijgende replica's zijn de schaalregel; Postgres-credits onder ongeveer 10 vertragen alles wat de server deelt.                                           |

![De serverrij van dezelfde run: verzoeken per seconde per route op de proxy, de auditketen en de routes voor taken en NLQ; p95 per route met twee pieken tot 5 seconden; de antwoorden per minuut van de proxy, allemaal 200 en 201; auditrecords per transactie tussen 1 en 7](img/load-stress-test-server.jpg)

![De Azure-rij van dezelfde run: CPU als aandeel van de limiet van elke app, met de UI op 99 % vanaf de fase met 400 gebruikers, de proxy op 48 %, Neo4j op 35 %; geheugen met Neo4j op 74 %; drie UI-replica's; geen herstarts; burst credits van Postgres op 39](img/load-stress-test-containers.jpg)

De schermafbeeldingen zijn `20261006-2140-stress-aca`, de run die 400 gebruikers
bereikte zonder mislukt verzoek en het plafond naar de CPU van de UI verplaatste.
Hoe u een resultaat hypothese voor hypothese leest, en wat elk getal betekende
voor de dimensioneringsbeslissingen
([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md),
[ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)), staat in het
[runbook](../knowledge/runbooks/load-and-stress-test.md).

## De schermafbeeldingen actueel houden

De schermafbeeldingen op deze pagina zijn op 2026-10-16 gemaakt van de live
Grafana in kioskmodus (`&kiosk` in de URL verbergt de omlijsting), op 1600 bij
1200 pixels. Een dashboard dat verandert, krijgt op dezelfde manier een nieuwe
schermafbeelding; de bestanden staan in `docs/operations/img/` en de
contentgenerator kopieert ze naar de hub.
