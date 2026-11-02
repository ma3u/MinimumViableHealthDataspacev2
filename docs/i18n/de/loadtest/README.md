---
source: docs/loadtest/README.md
sourceHash: 9b7e7f5dd475758fc226e0d982b2c501af4ad553de56333c6de01c2760ad9ecf
language: de
summary: "Jeder Last-, Stress- und Spike-Lauf gegen den Live-Hub und den Compose-Stack, mit seinem Grafana-Dashboard, was er gefunden hat, was sich dadurch geändert hat, und die noch ausstehenden Läufe."
---

# Last-, Stress- und Spike-Tests: Ergebnisse und Dashboards

Was der Live-Hub unter https://ehds.mabu.red unter Last leistet, gemessen mit der
k6-Suite in [`load-tests/`](../../load-tests/) und im Grafana der Plattform
aufgezeichnet. Diese Seite ist der Index: jeder Lauf, was er ergab, was sich
daraufhin änderte und die Läufe, die noch ausstehen. Die ausführlichen Berichte sind verlinkt, und
jeder Live-Lauf hat seinen Dashboard-Link.

Die Dashboards erfordern eine Anmeldung unter <https://grafana.ehds.mabu.red> und zeigen
Daten nur, während der Stack läuft (er hält außerhalb der Bürozeiten an, ADR-053). Jeder Link
öffnet das Dashboard **Last- und Stresstest** mit der `testid` und dem Zeitraum des Laufs;
die rohen k6-Zusammenfassungen liegen auf dem Laptop, der sie ausgeführt hat
(`load-tests/results/<testid>*`), und in den Issues.

| Szenario    | Was es tut                                                      | Letzter Live-Lauf | Ergebnis                                                                                 |
| ----------- | --------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `smoke`     | 1 Nutzer, 30 s, jeder Endpunkt einmal                           | 2026-10-05        | besteht                                                                                  |
| `load`      | 50 Nutzer, 15 min, der Persona-Mix                              | 2026-10-06, 21:15 | **besteht jedes SLO**: p95 155 ms API, 43 ms Seiten, 217 ms NLQ, 0 fehlgeschlagen        |
| `audited`   | 1 bis 20 parallele NLQ-Abfragen durch die Audit-Kette           | 2026-10-05        | besteht nach #534 und #536 (Ratenbegrenzung pro Nutzer)                                  |
| `contracts` | bis zu 10 Nutzer, die über den EDC verhandeln und übertragen    | 2026-10-06, 13:52 | besteht: 578 Anfragen, 0 fehlgeschlagen, p95 287 ms                                      |
| `stress`    | 50, 100, 200, 400 Nutzer, Abbruch bei fehlgeschlagenen Anfragen | 2026-10-06, 21:40 | **400 Nutzer, 0 fehlgeschlagen**; die Latenz-SLOs brechen ab 200 Nutzern, Obergrenze: UI |
| `spike`     | ein plötzlicher Sprung auf viele Nutzer und zurück              | noch nicht        | als Nächstes, nach `size-ui.sh` (ADR-061)                                                |
| `soak`      | eine gleichmäßige Last über zwei Stunden                        | noch nicht        | nach `spike`; misst die Postgres-Burst-Credits                                           |
| `signin`    | 5 bis 50 Anmeldungen pro Minute gegen Keycloak                  | noch nicht live   | Compose: 12 von 127 Anmeldungen über 3 s                                                 |
| `proxy`     | der Proxy allein, 5 bis 25 Nutzer                               | noch nicht live   | braucht einen Job innerhalb der Umgebung; Compose besteht                                |

## Die Live-Läufe, neueste zuerst

### 2026-10-06 abends: Last und Stress nach den Korrekturen des Tages

Stack: Neo4j mit 2 vCPU und 4 GiB (ADR-056), die Graphansichten auf die
neuesten 30 Zugriffsereignisse begrenzt (#580), die Wiederholungsschleife des Onboarding-Agenten behoben (#581),
der Aufgabenspeicher auf dem Flexible Server (#589).

| Lauf                                                                                                                                                                      | Nutzer             | Anfragen        | Fehlgeschlagen | p95 alle / API / Seiten / NLQ     | Bewertung                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------- | -------------- | --------------------------------- | -------------------------------------------------------------- |
| [`20261006-2115-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-2115-load-aca&from=1791321300000&to=1791322320000)     | 50 über 15 min     | 19.509 (21,5/s) | **0,00 %**     | 146 ms / 155 ms / 43 ms / 217 ms  | jedes SLO gehalten, Prüfungen 99,97 %                          |
| [`20261006-2140-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-2140-stress-aca&from=1791322800000&to=1791324300000) | 50 bis 400, 20 min | 81.518 (63,6/s) | **0,00 %**     | 3,35 s / 3,53 s / 3,23 s / 4,93 s | Latenz-SLOs ab 200 Nutzern überschritten; jede Antwort korrekt |

Die Obergrenze war die UI: drei Replikate mit je einem halben Kern bei 99 % CPU ab der
Stufe mit 400 Nutzern, Neo4j bei 0,82 seiner 2 Kerne und 2,66 GB von 4 GiB, der
Proxy bei 0,06 Kernen. Die Fehler in den Logs stammten von der UI, die die EDC-Management-API
unter der falschen Adresse aufrief (etwa 8.900 404-Zeilen im Stresslauf),
die #648 bei jedem Deploy festschreibt; die EDC-Seiten leisteten in diesen Läufen keine echte Arbeit,
der nächste `load`-Lauf danach verschiebt also die Zahlen.

Was sich daraufhin änderte: [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md),
ein ganzer Kern pro UI-Replikat, bis zu sechs Replikate mit einer HTTP-Concurrency-Regel von
15, angewendet durch `scripts/azure/size-ui.sh`; ein Deploy wartet jetzt, solange ein Lauf aktiv ist
(`LOAD_TEST_RUNNING`), weil ein Merge am 2026-10-06 die UI und den
Proxy mitten in einem Lauf neu ausgerollt hatte.

### 2026-10-06 nachmittags: der erste Stresslauf bis 400 Nutzer

| Lauf                                                                                                                                                                      | Nutzer         | Anfragen      | Fehlgeschlagen | p95 API / Seiten / NLQ        | Bewertung                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------- | -------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| [`20261006-1728-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1728-stress-aca&from=1791307740000&to=1791309060000) | 50 bis 400     | 84.624 (66/s) | **0,00 %**     | 3,19 s / 2,8 s / 4,35 s       | alle Stufen erreicht; Neo4j startete nach ADR-056 nicht neu                      |
| [`20261006-1455-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1455-load-aca&from=1791298500000&to=1791299520000)     | 50 über 15 min | 10.000+       | 0,03 %         | Seiten und API unter den SLOs | mit #580 und #579 ausgerollt; beide Audit-Ketten nach dem Lauf intakt            |
| [`20261006-1152-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1152-load-aca&from=1791287580000&to=1791288600000)     | 50 über 15 min |               | 0              | 151 ms insgesamt              | mit #576; lief neben der Wiederholungsschleife des Onboarding-Agenten (#577)     |
| [`20261006-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-stress-aca&from=1791274440000&to=1791275580000)           | 50 bis 400     |               | 2,1 % am Ende  | `/api/graph` 64 s am Ende     | bei etwa 300 Nutzern abgebrochen: Neo4j wegen Speichermangels beendet (Exit 137) |
| [`20261006-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-load-aca&from=1791273300000&to=1791274320000)               | 50 über 15 min |               | 0              |                               | die morgendliche Basislinie innerhalb der Umgebung                               |

Der morgendliche Stresslauf fand die Obergrenze von Neo4j beim Speicher; der Lauf am Nachmittag,
nach `size-neo4j.sh` (2 vCPU, 4 GiB, Heap 1,5 GiB, Page Cache 1 GiB), erreichte
400 Nutzer ohne fehlgeschlagene Anfrage und verschob die Obergrenze zur UI. Ein Lastlauf
dazwischen (`20261006-1359-load-aca`) scheiterte an der Latenz, weil der Onboarding-Agent
im Hintergrund eine festhängende Nachweisanfrage dreißigmal pro Sekunde wiederholte
(#577); die Korrektur (#581) ging vor den Abendläufen hinaus.

### 2026-10-05: die Basislinie

Die ersten Läufe gegen den Live-Hub, von einem Laptop in Berlin, mit der
Seite der Plattform aus Azure Monitor: [die Azure-Basislinie](2026-10-baseline.md).
50 Nutzer über 15 Minuten bestanden ohne fehlgeschlagene Anfrage, aber mit einem API-p95 von
1,8 s, mit `/api/graph` bei 10 s; die auditierten Abfragen stießen an die Ratenbegrenzung des Proxys
(83,6 % 429 vor #534, 23,2 % danach). Neo4j bei 97 % seiner 2 GiB war
die erste Obergrenze. Dieselbe Suite gegen [den Compose-Stack](2026-10-05-local.md)
auf einem Laptop, zum Vergleich: Der Lastlauf besteht jedes SLO bei 50 Nutzern, der Stresslauf bricht
zwischen 100 und 200 Nutzern an der CPU der UI.

![Dashboard Last- und Stresstest, 50 Nutzer gegen ehds.mabu.red am 2026-10-05](img/2026-10-05-load-azure.png)

## Wo die Plattform steht

Die [Bewertung der Produktionsreife vom Oktober 2026](2026-10-production-readiness.md)
liest diese Läufe zusammen mit der Sicherheitsarbeit und den ADRs gegen das
Well-Architected Framework und das Cloud Adoption Framework, Säule für Säule: was vorhanden ist,
was offen ist und was zwischen dem Demonstrator und einer
betreibbaren Plattform steht.

## Was das Dashboard zeigt

Das Dashboard **Last- und Stresstest** (`observability/grafana/dashboards-azure/load-stress-test.json`)
hat drei Zeilen, jede nach der `testid` des Laufs gefiltert:

- **Load (k6): what the test is doing**: virtuelle Nutzer, Anfragen pro Sekunde,
  fehlgeschlagene Anfragen, p95 pro Gruppe (Seiten, API, NLQ), die langsamsten Endpunkte.
- **Server side: the proxy**: Anfragen und p95 nach Route, Ablehnungen durch die Ratenbegrenzung,
  die Datensätze der Audit-Kette pro Transaktion, die Logzeilen dieses Laufs.
- **Containers**: CPU und Speicher der UI, des Proxys, von Neo4j, Keycloak und den
  Konnektoren, Replikate und die Burst-Credits des Flexible Server.

Das Dashboard **EDC-Verträge und -Übertragungen** (`mvhd-edc-dsp`) verfolgt die
Verhandlungen und Übertragungen, die ein `contracts`-Lauf durch die Konnektoren treibt.
Wie man ein Ergebnis Hypothese für Hypothese liest, steht im
[Runbook](../knowledge/runbooks/load-and-stress-test.md).

## Die Läufe, die noch ausstehen

1. `stress` nach `scripts/azure/size-ui.sh` (ADR-061): wo das API-SLO von 1 s
   mit Replikaten auf ganzen Kernen zuerst bricht; das p95 pro Stufe kommt in die
   Tabelle des ADR.
2. `spike`, dann `soak` über zwei Stunden: die Postgres-Burst-Credits (Hypothese
   4 des Runbooks) und die Kosten pro 1.000 Anfragen aus Cost Management über
   das Soak-Fenster.
3. `signin` live: ob die Anmeldung ein Singleton ist (Hypothese 6).
4. `load` noch einmal, mit EDC-Seiten, die echte Arbeit leisten (#648 schreibt die
   Adresse des Konnektors bei jedem Deploy fest).

Jeder innerhalb der Bürozeiten, angekündigt, einer nach dem anderen; ein Deploy wartet, solange ein Lauf
aktiv ist. Das Verfahren ist das [Runbook](../knowledge/runbooks/load-and-stress-test.md);
die offenen Punkte werden in [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571) verfolgt.

## Reproduzieren

```bash
scripts/azure/run-load-test.sh load            # inside Azure, as a Container Apps job
ABORT_ON=failures scripts/azure/run-load-test.sh stress
load-tests/run.sh load azure                   # from a laptop, metrics to a local Grafana
```

Die Sitzungen werden für zehn Nutzer pro Persona gefälscht und dem Job als
Secret übergeben; niemand Echtes meldet sich an. Die Suite, ihre Szenarien und ihre Schwellenwerte sind
in [`load-tests/README.md`](../../load-tests/README.md) dokumentiert.
