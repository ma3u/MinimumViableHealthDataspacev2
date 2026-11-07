---
source: docs/loadtest/2026-10-production-readiness.md
sourceHash: e4bba5749b0d00cb2da2c23f840ccb992cfd0ea64f64a7dce4327cbf887315ab
language: de
summary: "Die Bewertung nach Well-Architected und Cloud Adoption Framework mit Stand 16.10.2026: was je Säule umgesetzt ist, mit Belegen, was offen ist, die Bewertungen und was zwischen dem Demonstrator und einer betreibbaren Plattform steht."
---

# Bewertung der Produktionsreife, Oktober 2026

[Well-Architected Framework (WAF)](https://learn.microsoft.com/en-us/azure/well-architected/pillars) und [Cloud Adoption Framework (CAF)](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/), angewendet
auf den EHDS Integration Hub, wie er am 2026-10-16 auf [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/overview) läuft.
Jede Säule nennt, was vorhanden ist, mit den Belegen, und was noch
offen ist. Die Bewertungen sind das eigene Urteil des Projekts auf einer Zehn-Punkte-Skala; nichts
davon ist ein unabhängiges Audit. Das WAF hat fünf Säulen; Nachhaltigkeit gehört nicht dazu, sondern ist
Microsofts eigener [Leitfaden zur Nachhaltigkeit](https://learn.microsoft.com/en-us/azure/well-architected/sustainability/) für Workloads, hier daneben bewertet.

| Säule                                                                                                       | Bewertung | In einer Zeile                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WAF: [Optimaler Betrieb](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/)  | 7/10      | Deploy bei jedem Merge, Tracing und strukturierte Logs, sechzehn Runbooks; keine Alarmregeln, keine Rufbereitschaft                                                                                                        |
| WAF: [Sicherheit](https://learn.microsoft.com/en-us/azure/well-architected/security/)                       | 8/10      | Vom Projekt getestet, neun von zehn Befunden geschlossen; kein unabhängiger Test                                                                                                                                           |
| WAF: [Zuverlässigkeit](https://learn.microsoft.com/en-us/azure/well-architected/reliability/)               | 6/10      | 400 Nutzer ohne fehlgeschlagene Anfrage, Health Checks überall, verwaltetes Postgres mit Wiederherstellung; Neo4j ein Knoten, kein Backup                                                                                  |
| WAF: [Leistungseffizienz](https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/) | 7/10      | Aus Messungen dimensioniert, 50 Nutzer innerhalb jedes SLO; 200 Nutzer noch nicht                                                                                                                                          |
| WAF: [Kostenoptimierung](https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/)       | 7/10      | Alles hält außerhalb der Bürozeiten an, Kosten pro 1.000 Anfragen gemessen; keine Kostenzuordnung pro Mandant                                                                                                              |
| Nachhaltigkeit (eigener Leitfaden, keine WAF-Säule)                                                         | 6/10      | Der Stack läuft ein Drittel der Woche; keine CO2-bewusste Wahl                                                                                                                                                             |
| CAF: [Strategie und Plan](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/strategy/)       | 8/10      | Die EHDS-Rollen, die BSI-Standards und sechzig Entscheidungen ([ADR-001](../ADRs/ADR-001-postgresql-neo4j-split.md) bis [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)) schriftlich festgehalten; kein SLA |
| CAF: [Steuern und Verwalten](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/govern/)      | 6/10      | Aufbewahrungsrichtlinie, Audit-Trail, Vorfallfristen; kein SOC, kein benanntes Vorfallteam                                                                                                                                 |
| **Gesamt**                                                                                                  | **7/10**  | **Ein vermessener Demonstrator. Keine betreibbare Plattform für echte Daten; die Lücke ist am Ende aufgeführt.**                                                                                                           |

Die bewertete Plattform: der Hub und seine Konnektoren auf Azure Container Apps in
`rg-mvhd-dev`, West Europe, 21 Apps und 9 Jobs. PostgreSQL auf einem Flexible
Server ([ADR-041](../ADRs/ADR-041-managed-postgres-on-azure-containerised-locally.md)),
Neo4j Community mit 2 vCPU und 4 GiB ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md)),
die UI auf ganzen Kernen mit bis zu sechs Replikaten ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)),
Vault mit seinem Zustand auf dem Flexible Server ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)),
außerhalb der Bürozeiten angehalten ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md),
[ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)). Die
Lastzahlen sind die Läufe im [Ergebnisindex](README.md); der Sicherheitsstand
ist der [Sicherheitstestbericht vom 2026-10-15](../security/security-test-report-2026-10-15.md);
wie die Plattform tatsächlich betrieben werden soll, beschreibt der
[Betriebsleitfaden](../security/operational-guideline.md).

## WAF-Säule 1: Optimaler Betrieb, 7/10

Vorhanden:

- Ein Merge nach main rollt auf Azure aus ([`deploy-azure.yml`](../../.github/workflows/deploy-azure.yml)); der Deploy wartet,
  solange ein Lasttest läuft, und schreibt bei jedem Lauf die Adressen der Konnektoren fest. Das
  PR-Gate sowie die Workflows für Tests, Sicherheit und [CodeQL](https://docs.github.com/en/code-security/codeql-cli) laufen bei jedem Pull Request,
  die Compliance-Suites nach Änderungen an main; [`demo-smoke.yml`](../../.github/workflows/demo-smoke.yml) führt [Bruno](https://www.usebruno.com/), [Playwright](https://playwright.dev/) und [ZAP](https://www.zaproxy.org/) gegen den
  Live-Hub aus.
- [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-collector-releases/releases/tag/v0.161.0) Collector, [Prometheus](https://prometheus.io/docs/introduction/overview/), [Loki](https://grafana.com/docs/loki/latest/), [Tempo](https://grafana.com/docs/tempo/latest/) und [Grafana](https://grafana.com/docs/grafana/latest/)
  ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md));
  der Proxy wird getraced ([`src/tracing.ts`](../../services/neo4j-proxy/src/tracing.ts)) und protokolliert strukturiertes JSON mit dem
  Aufrufer und dem Lauf in jeder Zeile ([`pino`](https://getpino.io/)); jeder Audit-Datensatz trägt seinen
  Lauf. Logs in Azure Monitor für 30 Tage.
- Vault behält seinen Zustand über Neustarts hinweg, lokal in einer Datei und auf Azure in einer
  Datenbank auf dem Flexible Server mit einem Unseal-Sidecar ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)).
- Sechzehn Runbooks unter [`docs/knowledge/runbooks/`](../knowledge/runbooks/): Deploy, Seeding, Realm-Drift,
  Postgres-Wiederherstellung, Betrieb außerhalb der Bürozeiten, Last- und Stresstest, die Audit-Kette,
  die Verbindung zu Klarbefund.
- Jedes Image hat einen [`HEALTHCHECK`](https://docs.docker.com/reference/dockerfile/#healthcheck); die Crawler stellen `/metrics` bereit und werden
  darüber geprüft; die Seed-Phasen lassen sich fortsetzen.
- Die Dokumentation wird aus dem Repository veröffentlicht und im
  Pre-Commit geprüft, sodass die Dokumentation nicht von den Dateien abweichen kann.

Offen:

- Keine Alarmregeln. Das Last-Dashboard, die Audit-Kette und die Postgres-Burst-Credits
  werden von einer Person gelesen; niemand wird alarmiert.
- Kein Rufbereitschaftsmodell und kein benannter Betreiber; der Betriebsleitfaden
  beschreibt die Rollen, das Projekt kann sie nicht besetzen.
- Keine Feature Flags über die Demo-Schalter hinaus.

## WAF-Säule 2: Sicherheit, 8/10

Vorhanden:

- Der [Sicherheitstestbericht vom 2026-10-15](../security/security-test-report-2026-10-15.md):
  CodeQL, [Semgrep](https://github.com/semgrep/semgrep/releases/tag/v1.176.0), [grype](https://github.com/anchore/grype/releases/tag/v0.118.0), npm audit, [trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0), [gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), [hadolint](https://github.com/hadolint/hadolint), [shellcheck](https://www.shellcheck.net/),
  die Sicherheitstests der App und 46 anonyme Blackbox-Prüfungen des Live-Hubs.
  Zehn Befunde; neun geschlossen, einer geprüft und akzeptiert (der veröffentlichte
  Entwicklungsschlüssel des lokalen Compose-Stacks; Azure bezieht seine Schlüssel aus
  Vault).
- Das [Bedrohungsmodell des Hubs](../security/threat-model.md) und
  [das der App](../security/threat-model-klarbefund.md), wobei jede Gegenmaßnahme
  den Code oder Test nennt, der sie belegt; eine [CycloneDX](https://cyclonedx.org/)-Stückliste pro
  auslieferbarem Teil ([SBOM](../sbom/README.md)), gegen die Lockfiles geprüft.
- Jede API-Route braucht eine Sitzung ([ADR-044](../ADRs/ADR-044-every-api-route-needs-a-session.md));
  wer die Identität einer Patientin oder eines Patienten sieht, entscheidet die Rolle, nie ein
  Abfrageparameter; die UI liest den Graphen direkt und der Proxy bedient die Data
  Planes ([ADR-043](../ADRs/ADR-043-graph-access-direct-or-through-the-proxy.md)).
- Ratenbegrenzungen im Proxy, pro Nutzer und pro Teilnehmer, unter
  Last gemessen; k-Anonymität mit einer Mindestkohorte von fünf in der Konfiguration
  des Proxys.
- Betreiber-Secrets sind Key-Vault-Referenzen ([ADR-036](../ADRs/ADR-036-operator-secrets-in-key-vault.md));
  das Live-`NEXTAUTH_SECRET` wurde rotiert; die Schlüssel der Teilnehmer liegen in Vault.
- Keycloak: Anmeldeereignisse sieben Tage lang aufbewahrt, der Scope des UI-Clients auf
  die sieben EHDS-Rollen beschränkt, die Admin-Konsole nicht im Internet, jede privilegierte
  Rolle hinter dem Konsolenwächter. Die App sperrt sich mit Face ID oder dem Gerätecode
  ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)).
- Nur der Hub und Keycloak haben öffentlichen Ingress; alles andere ist intern
  in der Umgebung.
- Die [Richtlinie zur Audit-Aufbewahrung](../audit-retention-policy.md): zehn Jahre für
  Zugriffs-, Übertragungs-, Vertrags- und Genehmigungsdatensätze, zwei Jahre für Anmeldungen und
  Edge-Logs, angewendet durch `/api/admin/audit/retention`, das
  die einzige Kopie nicht vernichten kann.

Offen:

- Kein unabhängiger Penetrationstest des Hubs und kein [TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2)-Test der App;
  der letzte Abschnitt des Berichts sagt, was jeder davon ergänzen würde.
- Kein mTLS zwischen den Apps und keine Private Endpoints; der Leitfaden verlangt beides
  vor echten Daten.
- Neo4j hat einen einzigen Datenbanknutzer; der Zugriff wird im Hub und im Proxy gesteuert.
- Die Rotation von Secrets ist aufgeschrieben, nicht eingeplant.
- Die Betreiberkonten und `edcadmin` haben erst dann generierte Passwörter nur in Key Vault,
  wenn [`scripts/azure/secure-accounts.sh`](../../scripts/azure/secure-accounts.sh) gegen den Live-Realm gelaufen ist.

## WAF-Säule 3: Zuverlässigkeit, 6/10

Vorhanden:

- Der Stresslauf vom 2026-10-06 erreichte 400 Nutzer mit 0 fehlgeschlagenen Anfragen von
  81.518, bei 63,6 Anfragen pro Sekunde; nichts startete neu. Bei 50 Nutzern hält jedes
  SLO.
- Jedes Image hat einen Health Check, und die [Probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes) von Container Apps gehen davon aus; der
  Proxy leert sich bei `SIGTERM`; jeder ausgehende Aufruf hat ein Timeout; `/api/tasks`
  antwortet aus seinem Speicher, wenn der Konnektor ausfällt, und sagt das auch.
- PostgreSQL auf dem Flexible Server hält sieben Tage [Point-in-Time](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-backup-restore)-Wiederherstellung
  vor; der Realm, die Verträge und der Aufgabenspeicher liegen dort. Der Zustand
  von Vault liegt ebenfalls dort.
- Die Graphansichten sind auf die neuesten 30 Zugriffsereignisse begrenzt, was
  die eine Anfrage beseitigte, die die UI zum Absturz bringen konnte.
- Ein Deploy kann nicht mitten in einem Lastlauf landen.

Offen:

- Neo4j ist ein einzelner Community-Knoten auf Azure Files ohne Backup. Seine Daten sind
  heute erneut einspielbare synthetische Daten; vor echten Daten verlangt der Leitfaden
  Neo4j Enterprise oder einen verwalteten Graphen mit vierteljährlich getesteten Backups.
- Kein Circuit Breaker; ein langsamer Konnektor wird nur durch Timeouts begrenzt.
- Ab 200 Nutzern brechen die Latenz-SLOs an der CPU der UI. Die neue Größe der UI
  ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)) wird durch `scripts/azure/size-ui.sh` angewendet und ist noch nicht gemessen.
- Die Seiten der Konnektoren leisteten in den bisherigen Läufen keine echte Arbeit (die UI rief
  die Management-API unter der falschen Adresse auf, inzwischen festgeschrieben); der nächste `load`-Lauf
  ist der erste mit Verträgen und Übertragungen unter Last.
- Kein Chaos Engineering; die Stressläufe kommen dem am nächsten.

## WAF-Säule 4: Leistungseffizienz, 7/10

Vorhanden:

- Gemessen, nicht geschätzt: Die Obergrenze wanderte innerhalb eines Tages voller Läufe vom Speicher von Neo4j zur CPU der UI,
  und jede Größe wurde aus der Messung entschieden
  ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md) für Neo4j, [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md) für die UI, mit der
  [Skalierbarkeit pro Komponente](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md#scalability-per-component)).
- Bei 50 Nutzern: API-p95 155 ms, Seiten 43 ms, NLQ 217 ms, 21,5 Anfragen pro
  Sekunde. `/api/graph` innerhalb des SLO nach der Begrenzung und der Größenänderung.
- Neo4j mit 2 vCPU und 4 GiB, Heap 1,5 GiB, Page Cache 1 GiB; Indizes für
  jeden FHIR-Abfragepfad in [`neo4j/init-schema.cypher`](../../neo4j/init-schema.cypher) (mehr als 70, drei
  Vektorindizes).
- Der Batch-Writer der Audit-Kette nimmt die Schreiblast auf; auditierte Abfragen sind
  keine Obergrenze (434 ms p95 bei etwa 16 pro Sekunde).
- Next.js komprimiert seine Antworten; die statische Demo wird von GitHub
  Pages ausgeliefert.

Offen:

- Kein Antwort-Cache für den Katalog oder die Übersicht; keine Komprimierung im
  Proxy.
- 200 Nutzer innerhalb der SLOs ist das Ziel des nächsten `stress`-Laufs, nach
  `size-ui.sh`; das p95 pro Stufe kommt in die Tabelle von [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md).
- Kein CDN vor dem Live-Hub.

## WAF-Säule 5: Kostenoptimierung, 7/10

Vorhanden:

- Alles hält werktags um 18:13 UTC an und startet um 05:17 UTC,
  ausgelöst von Azure als verwaltete Identität; etwa 65 Bürostunden pro Woche. Die
  Entscheidung folgte auf einen Monat, der 741 € abrechnete, gegenüber einer Schätzung von 426 € für
  einen Stack, der rund um die Uhr läuft ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)).
- Skalierungsregeln von Container Apps: die UI mit einer HTTP-Concurrency-Regel von 15, ein
  bis sechs Replikate; alles auf null außerhalb der Bürozeiten.
- Die Kosten einer Anfrage sind bekannt: Zum Listenpreis kosten die Apps, die eine Anfrage bedienen,
  etwa 0,60 $ pro Stunde, etwa **0,01 $ pro 1.000 Anfragen bei 50 Nutzern**
  ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md), aus `20261006-2115-load-aca`); ein 20-minütiger Stresslauf mit sechs
  UI-Replikaten kostet zusätzlich etwa 0,22 $.
- Kostenwächter überwachen die Gesamtsumme ([`cost-guards.yml`](../../.github/workflows/cost-guards.yml)).

Offen:

- Eine Ressourcengruppe, eine Rechnung: keine Kostenzuordnung pro Mandant oder pro Rolle.
- Die Kosten pro 1.000 Anfragen aus [Cost Management](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/overview-cost-management) über ein `soak`-Fenster sind
  noch zu ermitteln.

## Nachhaltigkeit, 6/10 (eigener Leitfaden, keine WAF-Säule)

Bewertet nach Microsofts [Leitfaden für nachhaltige Workloads](https://learn.microsoft.com/en-us/azure/well-architected/sustainability/),
der neben den fünf WAF-Säulen steht und nicht zu ihnen gehört.

Vorhanden:

- Der Stack läuft ein Drittel der Woche ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md), [ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)).
- Der Ressourcenverbrauch ist sichtbar: die Container-Zeile des Last-Dashboards, Cost
  Management.
- Die eine verschwenderische Anfrage, die unbegrenzte Graphansicht, ist beseitigt.

Offen:

- West Europe, kein CO2-Signal im Zeitplan oder in der Wahl der Region.

## CAF

**Strategie und Plan, 8/10.** Die regulatorische Motivation ist pro Artikel
festgehalten (Verordnung (EU) [2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng) in ihrer verabschiedeten Nummerierung); der
[Betriebsleitfaden](../security/operational-guideline.md) benennt, welche
EHDS-Rolle welchen Teil betreibt und was [BSI C5](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CloudComputing/ComplianceControlsCatalogue/2020/C5_2020.pdf?__blob=publicationFile&v=5), [IT-Grundschutz](https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/IT-Grundschutz-Kompendium/it-grundschutz-kompendium_node.html), [TR-02102](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TG02102/BSI-TR-02102-1.pdf?__blob=publicationFile&v=15) und
TR-03161 von jedem verlangen; sechzig [ADRs](../ADRs/), [ADR-001](../ADRs/ADR-001-postgresql-neo4j-split.md) bis [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md), hielten am 2026-10-16 die Entscheidungen fest; der Planungsindex
verfolgt die Arbeit. Offen: ein formales SLA für die Teilnehmer, das der Leitfaden
in den Dienstleistungsvertrag des Betreibers legt.

**Bereit, 7/10.** Azure aus einem Merge; der lokale Stack mit einem Compose-Befehl;
die Seed-Phasen fortsetzbar; ein Dockerfile pro Teil mit seiner
Stückliste. Offen: die eigene Umgebung des Betreibers, die es noch nicht gibt.

**Einführen, 7/10.** Die eigenen [DSP 2025-1](https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/)-, [DCP](https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/)- und EHDS-Prüfungen des Hubs ([`run-ehds-dataspace-checks.sh`](../../scripts/run-ehds-dataspace-checks.sh), [`run-ehds-identity-checks.sh`](../../scripts/run-ehds-identity-checks.sh), [`run-ehds-tests.sh`](../../scripts/run-ehds-tests.sh))
laufen nach Änderungen an main, seit [ADR-074](../ADRs/ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md) einmal pro Nacht; sie sind nicht die
TCKs von Eclipse, [DSP TCK](https://github.com/eclipse-dataspacetck/dsp-tck) und [DCP TCK](https://github.com/eclipse-dataspacetck/dcp-tck), die beide noch nicht gelaufen sind; die Bruno-Collection prüft jede Route pro Persona
([ADR-031](../ADRs/ADR-031-checks-must-assert.md), [ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md));
am 2026-10-15 zählte der [Sicherheitstestbericht](../security/security-test-report-2026-10-15.md) 2.488 UI-Unit-Tests und 419 Swift-Tests. Offen: Chaos
Engineering und eine Probe der Migration von Neo4j 5 auf 2025
([ADR-030](../ADRs/ADR-030-neo4j-2025-lts-migration.md)).

**Steuern und Verwalten, 6/10.** Die Aufbewahrungsrichtlinie und der manipulationssichere
Audit-Trail existieren ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)); die Vorfallfristen nach DSGVO und NIS2 und wer
welche verantwortet, stehen im Leitfaden ([Abschnitt 7](../security/operational-guideline.md#7-incidents-clocks-and-who-notifies-whom)); die EHDS-Rollen haben ihre
Go-live-Checkliste ([Abschnitt 10](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)). Offen: ein SLA und sein Dashboard, ein Plan zur Reaktion auf Vorfälle
mit einem benannten Team, Änderungsmanagement über Pull Requests hinaus,
Kostenzuordnung pro Mandant, ein unabhängiger Test.

## Was zwischen dem Demonstrator und einer betreibbaren Plattform steht

Die Lücke liegt nicht mehr im Code; sie liegt im Betrieb, und die
[Checkliste des Leitfadens](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)
führt sie nach EHDS-Rolle auf. Die Punkte, die das Projekt selbst noch erledigen kann:

| #   | Punkt                                                                                                                                                  | Säule                               | Verfolgt in                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `stress` nach `size-ui.sh`, dann `spike`, `soak` und `signin`; das p95 pro Stufe in [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)     | Leistungseffizienz, Zuverlässigkeit | [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571)                                                                                                       |
| 2   | Alarmregeln für das Last-Dashboard und die Audit-Kette, und wer alarmiert wird                                                                         | Optimaler Betrieb                   | offen                                                                                                                                                                           |
| 3   | Ein Neo4j-Backup, oder Neo4j Enterprise oder ein verwalteter Graph, vor allen nicht synthetischen Daten                                                | Zuverlässigkeit                     | [Leitfaden, Abschnitt 2](../security/operational-guideline.md#2-hosting-architecture-from-the-demo-to-an-operable-platform)                                                     |
| 4   | Komprimierung und ein kurzer Cache für die Antworten von Katalog und Übersicht                                                                         | Leistungseffizienz                  | offen                                                                                                                                                                           |
| 5   | Rotation von Secrets nach Zeitplan: die Keycloak-Clients, der Kontodienst, das Katalog-Token                                                           | Sicherheit                          | [Leitfaden, Abschnitt 2](../security/operational-guideline.md#2-hosting-architecture-from-the-demo-to-an-operable-platform)                                                     |
| 6   | Ein unabhängiger Penetrationstest des Hubs und ein TR-03161-Test der App                                                                               | Sicherheit                          | [#655](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/655)                                                                                                       |
| 7   | Betreiberkonten und `edcadmin` mit generierten Passwörtern in Key Vault ([`scripts/azure/secure-accounts.sh`](../../scripts/azure/secure-accounts.sh)) | Sicherheit                          | [#671](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/671) brachte das Skript; es gegen den Live-Realm auszuführen ist offen                                       |
| 8   | Ein SLA mit seinem Dashboard und der Plan zur Reaktion auf Vorfälle mit einem benannten Team                                                           | Steuern und Verwalten               | Leitfaden, Abschnitte [7](../security/operational-guideline.md#7-incidents-clocks-and-who-notifies-whom) und [8](../security/operational-guideline.md#8-operating-the-platform) |
