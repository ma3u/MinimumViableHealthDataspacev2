---
source: docs/operations/dashboards.md
sourceHash: 39db3b7928f591277ed59e3c3ca266cb08249a1cebe8b4abc594966839e6f1b1
language: de
---

# Die Dashboards

Drei Grafana-Dashboards zeigen, was der Live-Hub tut: die Verträge und
Übertragungen, die die Konnektoren aushandeln, den regulatorischen Audit-Trail und seine
Integrität sowie die Plattform unter einem Lasttest. Sie laufen im eigenen
Grafana des Hubs unter <https://grafana.ehds.mabu.red>, als Teil des Observability-Stacks
aus [ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)
(OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, mit Azure
Monitor und Log Analytics für die Container und die Logs der Konnektoren).

| Dashboard                                                                                                                                                   | Id                | Beantwortet                                                                          | Standardzeitraum, Aktualisierung |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------ | -------------------------------- |
| [EDC-Verträge und -Übertragungen](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=now-90d&to=now&timezone=browser&refresh=1m) | `mvhd-edc-dsp`    | Was haben die Konnektoren ausgehandelt und übertragen, was wurde abgelehnt und warum | 24 Stunden, 1 Minute             |
| [EHDS-Audit-Trail](https://grafana.ehds.mabu.red/d/mvhd-ehds-audit/ehds-audit-trail?from=now-30d&to=now&timezone=browser&refresh=1m)                        | `mvhd-ehds-audit` | Sind die Belege intakt, was wurde aufgezeichnet, was übernimmt ein Prüfer            | 24 Stunden, 1 Minute             |
| [Last- und Stresstest](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test)                                                                 | `mvhd-load-test`  | Was tut k6, wie schnell antwortet der Hub, welcher Container sättigt zuerst          | 1 Stunde, 10 Sekunden            |

**Anmeldung.** Grafana verlangt eine eigene Anmeldung. Das Passwort des Betreiberkontos
ist das Key-Vault-Secret `grafana-admin-password` in
`kv-mvhd-b53a0449`; das schreibgeschützte Konto des Prüfers ist
`keycloak-user-mvhd-auditor-password`. Nichts auf diesen Dashboards sind Daten
einer Patientin oder eines Patienten: Der Audit-Trail speichert Fragen und Abfragen nur als SHA-256,
und die Lasttests laufen gegen synthetische Patienten.

**Wenn es nichts zu sehen gibt.** Der Stack hält außerhalb der Bürozeiten an
([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)), sodass die Panels,
die den Proxy oder die Konnektoren lesen, dann leer sind; die Panels, die
Azure Monitor lesen, behalten ihren Verlauf. Erweitern Sie den Zeitraum, bevor Sie schließen,
dass nichts geschehen ist; das Panel **Newest record** zeigt, wann zuletzt etwas
geschah.

**Woher sie stammen.** Die Dashboards sind JSON unter
[`observability/grafana/dashboards-azure/`](../../observability/grafana/dashboards-azure/)
(die Azure-Varianten lesen Azure Monitor und Log Analytics) und
[`observability/grafana/dashboards/`](../../observability/grafana/dashboards/)
(der Compose-Stack liest Prometheus und Loki), erzeugt von
`observability/grafana/build-dashboards.py` und mit der
Observability-App bereitgestellt. Eine Änderung an einem Dashboard ist eine Änderung an seinem JSON und wird
wie Code geprüft.

## EDC-Verträge und -Übertragungen

![Das Dashboard EDC-Verträge und -Übertragungen über 90 Tage: 2.791 Verhandlungen angefragt und 2.788 abgeschlossen, 2.787 Übertragungen angefragt, 2.785 gestartet, 794 mangels Datengenehmigung abgelehnt, eine beendet; die Verhandlungszustände im Zeitverlauf mit einer Spitze am 6. Oktober, den Lasttests](img/edc-contracts-transfers.jpg)

Jede DSP-Vertragsverhandlung und jede Datenübertragung, gezählt aus der `dsp`-Hash-Kette
des Audit-Trails: Der Hub schreibt einen Datensatz, wenn er den
Konnektor anfragt (requested) oder eine Übertragung mangels Datengenehmigung ablehnt, und
die Callbacks der Konnektoren schreiben jeden späteren Zustand (agreed, finalized,
started, completed, terminated). Das Dashboard ist die Sicht des Betreibers auf
dieselben Datensätze, die der Prüfer auf dem Dashboard des Audit-Trails liest.

| Zeile                                        | Panels                                                                                                 | Wie man sie liest                                                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                                       | What this shows; **Newest record**                                                                     | Der neueste Datensatz der Kette, unabhängig vom Zeitraum. „9 days ago“ bei leeren Panels bedeutet, dass seitdem nichts ausgehandelt wurde: Erweitern Sie den Zeitraum.                                                                                |
| Contract negotiations (DSP)                  | Requested, Agreed, Finalized, Terminated or failed; **Negotiation states** im Zeitverlauf              | Requested und Finalized sollten über einen ruhigen Zeitraum übereinstimmen; eine Lücke ist eine Verhandlung, die nie vom Konnektor zurückkam, was die Zeile **Connector services** erklärt. „Agreed“ ist ein Übergangszustand und normalerweise 0.    |
| Data transfers                               | Requested, Started, Completed, **Refused (no data permit)**, Terminated or failed; **Transfer states** | Refused ist das Tor, das wirkt: Art. 61(1), kein Zugang ohne Genehmigung (Art. 68). Die k6-Vertragsjourney fragt absichtlich bei einem von vier Malen ohne Genehmigung an, daher tragen Ablehnungen ein Tag _Load test run_ und sind erwartet (#571). |
| Refused, terminated and failed, with reasons | Tabelle **Not completed**                                                                              | Jeder Datensatz, der kein Erfolg ist, mit der Begründung des Konnektors, den Beteiligten und dem Lauf, zu dem er gehört.                                                                                                                              |
| Connector services (EDC)                     | Errors by service, log lines by service, latest connector errors (Log Analytics)                       | ERROR- und SEVERE-Zeilen je Konnektordienst, ohne die eigenen Exportfehler des OpenTelemetry-Agenten. Null ist der Normalfall; die EDC-Dienste protokollieren auf INFO nur beim Start und bei Problemen, eine ruhige Stunde ist also eine gesunde.    |

Die Zahlen im Screenshot sind die Lasttests vom 5. und 6. Oktober 2026:
etwa 2.800 Verhandlungen und Übertragungen in wenigen Stunden, jede Verhandlung
abgeschlossen und 794 Übertragungen abgelehnt, weil die Journey ohne
Genehmigung anfragte. „Completed“ bleibt bei 0, weil die Data Planes der Demo
mit einer gestarteten Übertragung und ohne Abschluss-Callback antworten; die Übertragungszahlen in
den [Lasttest-Ergebnissen](../loadtest/README.md) sind die gestarteten.

![Die unteren Zeilen des EDC-Dashboards: die Tabelle Not completed mit den abgelehnten Übertragungen des Stresslaufs, jede mit ihrer Begründung und den Beteiligten; Fehler und Logzeilen je Konnektordienst über 90 Tage aus Log Analytics, mit der Spitze vom 15. September; die letzten Konnektorfehler](img/edc-contracts-transfers-connectors.jpg)

Die unteren Zeilen im Screenshot: jede abgelehnte Übertragung des Stresslaufs
mit `did:web:pharmaco.de` als Beteiligtem und der Begründung sowie die Fehlerzeilen der Konnektoren
über 90 Tage, wobei die eine Spitze der Tag ist, an dem die Identitätsschicht
neu befüllt wurde.

## EHDS-Audit-Trail

![Das Dashboard EHDS-Audit-Trail: beide Ketten INTACT, 17.540 Abfragedatensätze und 11.946 Vertrags- und Übertragungsdatensätze über 30 Tage, 0 fehlgeschlagene Audit-Schreibvorgänge, 0 abgelehnte Abfragen, 794 abgelehnte Übertragungen; darunter die neuesten Datensätze der Vertrags- und Übertragungskette mit Hash, Lauf, Ergebnis, Beteiligten, Zeit und Sequenznummer](img/ehds-audit-trail.jpg)

Der regulatorische Audit-Trail aus [ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md):
Jede natürlichsprachliche oder föderierte Abfrage, jede Vertragsverhandlung und
jede Übertragung ist ein FHIR-R4-`AuditEvent`, per Hash mit dem vorherigen verkettet,
und eine Anfrage, deren Datensatz nicht geschrieben werden kann, wird abgelehnt. Das Dashboard beginnt
mit dem Leitfaden für Prüfer, dem ein Prüfer ohne das Projekt folgen kann:

![Der Leitfaden für Prüfer oben auf dem Dashboard: was die Verordnung verlangt, dann sieben Schritte vom Festlegen des Prüfzeitraums bis zum Notieren der Kettenköpfe, und die bekannte Grenze einer Kette, die in der Datenbank liegt, die sie schützt](img/ehds-audit-trail-guide.jpg)

| Zeile                             | Panels                                                                                                                                              | Wie man sie liest                                                                                                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auditor guide                     | Die Verordnung (Art. 61(1), 68, 73(1)(e), 9; DSGVO Art. 5(2), 30) und sieben Schritte                                                               | Der Ablauf einer Prüfung, von der Zeitauswahl bis zum Bericht. Folgen Sie ihm der Reihe nach.                                                                                                                                                                                                 |
| Integrity of the evidence         | **Query chain**, Query records, **Contract & transfer chain**, Contract & transfer records, Audit writes failed, Refused queries, Refused transfers | Beide Ketten müssen **INTACT** anzeigen: Der Proxy berechnet bei jeder Aktualisierung jeden Hash ab dem ersten Datensatz neu. **BROKEN** bedeutet, dass ein Datensatz geändert, entfernt oder umsortiert wurde: anhalten und eskalieren. Audit writes failed muss 0 sein oder erklärt werden. |
| What was recorded                 | Contract and transfer records by kind; query records by kind                                                                                        | Das Volumen im Zeitverlauf, nach Art des Datensatzes; ein Lasttest erscheint als Spitze, markiert mit seinem Lauf.                                                                                                                                                                            |
| Records, newest first             | Contract and transfer records; query records                                                                                                        | Eine Zeile pro Datensatz: Vereinbarung, Asset und Genehmigung, Demo-Kennzeichen, Hash, Lasttestlauf, Ergebnis, Beteiligte, Begründung, Zeit, wer ihn gemeldet hat, Sequenznummer, Gegenstand. Fragen und Cypher erscheinen nur als SHA-256.                                                   |
| For the audit report: chain heads | Query chain head; contract & transfer chain head                                                                                                    | Übernehmen Sie beide Werte, Anzahl der Datensätze und Hash, in den Prüfbericht. Bei der nächsten Prüfung muss die Kette noch denselben Kopf bei derselben Datensatznummer haben; andernfalls wurden Datensätze nachträglich umgeschrieben.                                                    |

Zwei Dinge sollte ein Prüfer wissen, beide stehen auf dem Dashboard selbst: Ein Datensatz
mit der Kennzeichnung **Demo** ist Demonstrationsverkehr, keine echte Nutzung; ein Datensatz mit einem
**Load test run** wurde von einem k6-Lauf gegen den Hub mit synthetischem
Verkehr geschrieben und wird gesondert gezählt. Und die bekannte Grenze (#418): Die Kette liegt in
Neo4j und belegt Reihenfolge und Integrität, aber jemand mit Schreibzugriff auf die
Datenbank könnte sie ab einem bestimmten Punkt neu aufbauen; der Vergleich der Kettenköpfe zwischen
Prüfungen deckt das auf, und ein signierter täglicher Digest mit einer einmal beschreibbaren Kopie
schließt diese Lücke. Die Rohdatensätze sind FHIR-`AuditEvent`s unter
`/audit/chains/query/events` und `/audit/chains/dsp/events` auf dem Proxy;
`scripts/verify-audit-chain.sh` berechnet die Kette außerhalb von Grafana neu.

## Last- und Stresstest

![Das Dashboard Last- und Stresstest beim Stresslauf vom 6. Oktober 2026: virtuelle Nutzer steigen von 50 auf 400, bis zu 107 Anfragen pro Sekunde, 0 % fehlgeschlagene Anfragen, 0 ratenbegrenzt, die schlechteste Prüfung bei 84,9 %, 15.091 Iterationen; das p95 nach Art steigt ab der Stufe mit 200 Nutzern auf 5,6 Sekunden für NLQ, 5,1 Sekunden für die API und 3,7 Sekunden für Seiten](img/load-stress-test.jpg)

Worauf man achten sollte, während k6 gegen den Hub läuft (#519): die Last, die der Test
erzeugt, die Antwortzeit, die der Client sieht, nach Art und nach Endpunkt, die
eigene Sicht des Proxys auf denselben Lauf und welcher Container zuerst sättigt. Das
Dashboard ist nach der **Test run**-Id des Laufs (`testid`) gefiltert, sodass sich zwei Läufe
nie vermischen; die Links in den [Lasttest-Ergebnissen](../loadtest/README.md) öffnen
jeden Lauf mit seiner eigenen Id und seinem Zeitraum.

| Zeile                                | Panels                                                                                                                                                                        | Wie man sie liest                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load (k6): what the test is doing    | Virtual users, requests / s, **Failed requests**, Rate limited (429), Checks passed (worst check), Iterations; Nutzer und Anfragen im Zeitverlauf; Antworten nach HTTP-Status | Failed ist der Anteil der Anfragen mit einem Status, den der Schritt nicht erwartet hat; das SLO liegt unter 1 %. 429 ist die Ratenbegrenzung, 5xx ein Fehler des Hubs, 0 eine Anfrage ohne Antwort. Die schlechteste Prüfung nennt das SLO, das zuerst gebrochen wurde, zum Beispiel „api under 1000 ms“. |
| Response time, as the client sees it | **p95 by kind**: pages, API, NLQ, sign-in; p50, p95 und p99; p95 per endpoint; Tabelle per endpoint                                                                           | Die SLOs: Seiten unter 2 s, API unter 1 s, NLQ unter 3 s. Die Endpunkttabelle ist nach p95 sortiert; Routen werden nach ihrem Muster benannt, nie nach einer URL mit einer Id.                                                                                                                             |
| Server side: the proxy               | Requests / s by route, p95 by route, responses per minute by status, **audit records per transaction**, errors during the run                                                 | Im Proxy gemessen; der Unterschied zum clientseitigen p95 sind die UI und das Netz. Audit-Datensätze pro Transaktion über 1 bedeuten, dass der Batch-Writer die Last aufnimmt (Hypothese 2 des Runbooks); bei 1 wartet jede Abfrage auf ihre eigene Transaktion.                                           |
| Azure: who saturates first           | CPU und Speicher als % des Limits jeder App, Replikate, Neustarts, Postgres-Burst-Credits (Azure Monitor)                                                                     | Neo4j bei 100 % CPU ist die Obergrenze; Neo4j nahe 100 % Speicher endet mit einem Abbruch wegen Speichermangels (Exit 137); steigende Replikate sind die Skalierungsregel; Postgres-Credits unter etwa 10 drosseln alles, was sich den Server teilt.                                                       |

![Die serverseitige Zeile desselben Laufs: Anfragen pro Sekunde nach Route auf dem Proxy, die Audit-Kette und die Routen für Aufgaben und NLQ; p95 nach Route mit zwei Spitzen auf 5 Sekunden; die Antworten des Proxys pro Minute, alle 200 und 201; Audit-Datensätze pro Transaktion zwischen 1 und 7](img/load-stress-test-server.jpg)

![Die Azure-Zeile desselben Laufs: CPU als Anteil des Limits jeder App, mit der UI bei 99 % ab der Stufe mit 400 Nutzern, dem Proxy bei 48 %, Neo4j bei 35 %; Speicher mit Neo4j bei 74 %; drei UI-Replikate; keine Neustarts; Postgres-Burst-Credits bei 39](img/load-stress-test-containers.jpg)

Die Screenshots zeigen `20261006-2140-stress-aca`, den Lauf, der 400 Nutzer
ohne fehlgeschlagene Anfrage erreichte und die Obergrenze zur CPU der UI verschob. Wie man ein
Ergebnis Hypothese für Hypothese liest und was jede Zahl für die Dimensionierungsentscheidungen
bedeutete ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md),
[ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)), steht im
[Runbook](../knowledge/runbooks/load-and-stress-test.md).

## Die Screenshots aktuell halten

Die Screenshots auf dieser Seite wurden am 2026-10-16 im Live-Grafana
im Kioskmodus aufgenommen (`&kiosk` an der URL blendet die Bedienelemente aus), mit 1600 mal 1200
Pixeln. Ein Dashboard, das sich ändert, erhält auf dieselbe Weise einen neuen Screenshot; die
Dateien liegen in `docs/operations/img/`, und der Inhaltsgenerator kopiert sie
in den Hub.
