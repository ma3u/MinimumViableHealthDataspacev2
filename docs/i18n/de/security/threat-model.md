---
source: docs/security/threat-model.md
sourceHash: 7dd719e1cad0af1761954b2a7e3ec54002d86543fc9ac430bca41b4230ef456c
language: de
summary: "STRIDE für den Hub auf Azure: Datenflüsse und Vertrauensgrenzen, die vier Angreifer, ein Austausch mit jeder Bedrohung an ihrem Schritt und jede Gegenmaßnahme mit dem Code, dem Test oder der Entscheidung, die sie belegt; was die Demo hinnimmt, was echte Daten brauchen und wie man jede Zeile prüft."
---

# Bedrohungsmodell: der EHDS Integration Hub

STRIDE, für den Hub, wie er auf Azure Container Apps läuft: die UI und ihre
API (Next.js 15), Keycloak 26.8, der neo4j-proxy, die EDC-V-Konnektoren mit
ihrem IdentityHub und ihrem IssuerService, Neo4j 5.26 und der PostgreSQL
Flexible Server. Verfasst am 2026-10-16; jede Gegenmaßnahme nennt den Code,
den Test oder die Entscheidung, die sie belegt. Die App, die sich mit dem Hub
verbindet, hat ihr eigenes Modell,
[`threat-model-klarbefund.md`](threat-model-klarbefund.md). Was das Projekt
getestet und gefunden hat, steht im
[Sicherheitstestbericht](security-test-report-2026-10-15.md); wie die
Plattform für echte Daten betrieben würde, beschreibt der
[Betriebsleitfaden](operational-guideline.md).

Die Daten auf dem Hub sind synthetisch: 127 generierte Patienten, fiktive
Organisationen, gefälschte Lasttest-Sitzungen. Die folgenden Bedrohungen
werden so bewertet, als wären die Daten echt, denn der Hub ist eine
Referenzimplementierung für eine Plattform, die echte Daten enthalten wird;
wo eine Gegenmaßnahme für die Demo genügt, für echte Daten aber nicht, sagt
die Tabelle das.

## So lesen Sie dieses Modell

STRIDE stellt jedem Datenfluss sechs Fragen: Kann der Absender gefälscht,
können die Daten manipuliert, kann die Handlung abgestritten, können
Informationen offengelegt, kann der Dienst verweigert, können Rechte
ausgeweitet werden? Der Systemkontext in Abschnitt 1 nummeriert die
Datenflüsse und die Vertrauensgrenzen, die sie überqueren; die Sequenz in
Abschnitt 3 zeigt einen vollständigen Austausch mit der ID jeder Bedrohung an
dem Schritt, an dem sie auftreten würde; die sechs Tabellen enthalten dann
eine Zeile pro Bedrohung mit dem Fluss, auf dem sie liegt, ihrem Status und
der Gegenmaßnahme samt Nachweis. Der Nachweis ist eine Datei, ein Test, ein
Skript oder eine Entscheidung in diesem Repository, sodass sich jede Zeile
prüfen lässt, ohne jemanden fragen zu müssen.

Es werden vier Angreifer angenommen, und jede Zeile benennt über ihren Fluss
implizit mindestens einen davon:

| Angreifer                        | Erreicht                                                        | Besitzt                                                              | Will                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Beliebige Personen im Internet   | B1: die Seiten und die API des Hubs, die Anmeldung von Keycloak | Nichts; oder ein geleaktes Cookie, Token oder Passwort               | Die Akte eines Patienten, eine Sitzung, die Administrationskonsole, die Plattform offline                                              |
| Ein angemeldeter Teilnehmer      | B1 mit einer gültigen Sitzung, in seiner Rolle                  | Ein legitimes Konto in einer Rolle                                   | Daten außerhalb seiner Rolle oder seiner Datengenehmigung, die Akte eines anderen Patienten, mehr Gewicht, als sein Rate Limit erlaubt |
| Ein Peer-Konnektor               | B2 über die öffentliche Control Plane                           | Seine eigene DID und seine Nachweise; gefälschte oder gestohlene     | Einen Vertrag, auf den er keinen Anspruch hat, Daten ohne Vereinbarung, eine falsche Identität                                         |
| Ein Insider mit Betreiberrechten | B2 und B3 über `az`, `gh` und die Skripte                       | Rechte an der Subscription, die Deploy-Identität, das Admin-Passwort | Secrets, eine unbemerkte Änderung, einen gelöschten Audit-Trail                                                                        |

Ein fünfter, die Lieferkette, hat keinen eigenen Fluss: Eine kompromittierte
Abhängigkeit oder ein kompromittiertes Image kommt über das Deployment (F7)
herein und wird unter Tampering (Manipulation) behandelt (T-07).

## 1. Systemkontext: Datenflüsse und Vertrauensgrenzen

![Die Datenflüsse und Vertrauensgrenzen des Hubs: außen die Menschen, die App, ein Peer-Konnektor und der Betreiber; die UI und Keycloak hinter der Internetgrenze; der Proxy, die Konnektoren, der Crawler und die Observability innerhalb der Umgebung; Neo4j, PostgreSQL, Vault und Key Vault hinter der Datengrenze; einundzwanzig nummerierte Flüsse](img/hub-trust-boundaries.svg)

Quelle: [`diagrams/hub-trust-boundaries.puml`](diagrams/hub-trust-boundaries.puml),
gerendert mit `scripts/render-plantuml.sh`.

Drei Grenzen, und was das Überqueren jeder einzelnen bedeutet:

| Grenze                 | Wer eine Anfrage über sie senden kann                     | Was die Identität belegt                                                                       |
| ---------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| B1, die Internetgrenze | Jeder                                                     | Das Sitzungscookie (NextAuth JWT), ein Bearer-Token von Keycloak oder ein DCP-Nachweis         |
| B2, die Umgebung       | Die eigenen Apps und Jobs des Hubs, über internen Ingress | Der Aufrufer-Header, den der Hub setzt (`X-Caller`), das Katalog-Token, die DID des Konnektors |
| B3, Daten und Secrets  | Nur die Umgebung                                          | Die Managed Identity (Key-Vault-Referenzen), das Vault-Token, die Zugangsdaten der Datenbank   |

Auf die nummerierten Flüsse (F1 bis F21) beziehen sich die STRIDE-Tabellen.
Die wichtigsten, und warum:

| Fluss       | Was übertragen wird                                              | Warum gerade dieser beobachtet werden muss                                                                                                      |
| ----------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| F1          | Jede Seiten- und API-Anfrage, mit dem Sitzungscookie             | Der einzige Weg, den ein anonymer Angreifer zu den Daten hat; jede Route dahinter braucht eine Sitzung (ADR-044)                                |
| F2, F8      | Anmeldung und Token-Austausch mit Keycloak                       | Ein gefälschtes oder zu weit gefasstes Token ist eine gefälschte Identität für alles Nachgelagerte                                              |
| F3, F4      | Das Bearer-Token der App und ihre Kontoerstellung                | Ein Telefon liegt außerhalb jeder Kontrolle; App Attest sorgt dafür, dass nur die echte App Konten erstellt                                     |
| F5          | DSP und DCP zwischen Konnektoren                                 | Der einzige Fluss, in dem die Software eines Fremden planmäßig mit unserer spricht; die Identität ist die DID und der Nachweis, keine Anmeldung |
| F9          | Der Aufruf des Hubs an den Proxy, mit dem Aufrufer-Header        | Der Proxy vertraut dem Header, weil nur der Hub ihn erreichen kann; die Grenze B2 macht dieses Vertrauen tragfähig                              |
| F10, F11    | Die Management-API und das Katalog-Token                         | Volle Kontrolle über die Konnektoren; interner Ingress und ein Token in Key Vault sind die gesamte Verteidigung                                 |
| F14, F15    | Lese- und Schreibzugriffe auf den Graphen und die Audit-Einträge | Wo die Patientendaten und die Nachweise liegen; parametrisierte Abfragen und die Hash-Kette sind die Kontrollen                                 |
| F19 bis F21 | Schlüssel und Secrets                                            | Vault, sein versiegelter Zustand und Key Vault; nichts davon wird je in eine App kopiert                                                        |

## 2. Schutzgüter

| Schutzgut                                                                                | Schutzbedarf | Speicherort                                         | Anmerkungen                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Patientenakten (FHIR, OMOP)                                                              | Hoch         | Neo4j (B3)                                          | Heute synthetisch; das Modell behandelt sie als echt                                                                   |
| Wer wessen Akte gelesen hat, die Audit-Kette                                             | Hoch         | Neo4j, hash-verkettet (B3)                          | Regulatorischer Nachweis (Art. 73); zehn Jahre ([Aufbewahrungsrichtlinie](../audit-retention-policy.md))               |
| Signaturschlüssel der Teilnehmer                                                         | Hoch         | Vault, Zustand auf dem Flexible Server (B3)         | Verlassen Vault nie; ADR-046                                                                                           |
| Betreiber-Secrets: `NEXTAUTH_SECRET`, Datenbank- und Admin-Passwörter, das Katalog-Token | Hoch         | Azure Key Vault, von den Apps referenziert (B3)     | ADR-036; das live verwendete `NEXTAUTH_SECRET` wurde rotiert, nachdem es ein veröffentlichter Standardwert gewesen war |
| Sitzungen und Token                                                                      | Hoch         | Cookie im Browser, Bearer in der App                | NextAuth JWT; Access- und Refresh-Token von Keycloak                                                                   |
| Verifizierbare Nachweise und Datengenehmigungen                                          | Mittel       | IdentityHub (B2)                                    | Mitgliedschaft, EHDS-Teilnehmer, Zweck, Qualitätslabel, die Datengenehmigung als Nachweis                              |
| Verträge, Transfers, Aufgaben                                                            | Mittel       | EDC-Zustand in PostgreSQL (B3), in Neo4j gespiegelt | ODRL-Richtlinien, Vereinbarungen, `TransferEvent`-Knoten                                                               |
| Katalog-Metadaten                                                                        | Niedrig      | Neo4j, die Konnektoren                              | HealthDCAT-AP; absichtlich öffentlich                                                                                  |
| Das Graph-Schema und der Code                                                            | Niedrig      | GitHub, öffentlich                                  | Die Dokumentation ist das Schema                                                                                       |

## 3. STRIDE

![Ein Datenaustausch als Sequenz, mit der STRIDE-ID jeder Bedrohung an dem Schritt, an dem sie liegt: Anmeldung und Anfrage über den Hub, dann die DSP-Verhandlung und die Prüfung des DCP-Nachweises in den Konnektoren, dann der Transfer und der Audit-Eintrag](img/hub-exchange-threats.svg)

Quelle: [`diagrams/hub-exchange-threats.puml`](diagrams/hub-exchange-threats.puml).

Status: **Geschlossen** bedeutet, dass ein Test oder eine Build-Einstellung
die Gegenmaßnahme absichert; **Umgesetzt** bedeutet, dass der Code sie
ausführt und ein Test sie indirekt prüft; **Demo** bedeutet, dass sie für
synthetische Daten genügt und für echte Daten als offen benannt ist;
**Offen** bedeutet, dass noch nichts sie umsetzt.

### Spoofing (Vortäuschung einer Identität)

| ID   | Bedrohung                                               | Fluss  | Status      | Gegenmaßnahme und Nachweis                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | Ein Konnektor gibt sich als Teilnehmer aus              | F5     | Umgesetzt   | `did:web`-Auflösung gegen das DID-Dokument des IdentityHub, eines pro Teilnehmer; die DCP-Präsentation enthält den Mitgliedschaftsnachweis (ADR-007, ADR-009). Geprüft durch `scripts/run-ehds-identity-checks.sh` bei jedem Pull Request.                                                                                                              |
| S-02 | Eine gefälschte Sitzung erreicht eine API-Route         | F1     | Geschlossen | NextAuth JWT, signiert mit `NEXTAUTH_SECRET` aus Key Vault; `requireAuth()` in jedem Handler, abgesichert durch `ui/__tests__/unit/api/every-route-needs-a-session.test.ts` (ADR-044).                                                                                                                                                                  |
| S-03 | Eine wiederholt eingespielte Nachweispräsentation       | F5     | Umgesetzt   | Die DCP-Implementierung von EDC-V bindet die Präsentation an die Anfrage; die DCP-Prüfungen von `compliance.yml` führen sie aus. Vom Hub selbst nicht erneut verifiziert.                                                                                                                                                                               |
| S-04 | Übernahme des Keycloak-Realms oder der Keycloak-Konsole | F2, F6 | Geschlossen | Die Administrationskonsole ist aus dem Internet nicht erreichbar (`guard-keycloak-console.sh`, F10 des Testberichts); das Admin-Passwort liegt in Key Vault; der Realm ist versioniert und wird auf Abweichungen geprüft ([Runbook](../knowledge/runbooks/keycloak-realm-drift.md)). MFA für den Admin ist Sache des Betreibers (Leitfaden, Identität). |
| S-05 | Ein gefälschtes Klarbefund erstellt Konten              | F3     | Umgesetzt   | Die Kontoerstellung beantwortet nur eine Anfrage, deren Apple-App-Attest-Attestierung sich verifizieren lässt (ADR-054); die Challenge ist signiert und fünf Minuten gültig.                                                                                                                                                                            |

### Tampering (Manipulation)

| ID   | Bedrohung                                                                | Fluss    | Status      | Gegenmaßnahme und Nachweis                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------ | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-01 | Cypher-Injection                                                         | F14, F15 | Geschlossen | Überall parametrisiertes Cypher; die NLQ-Engine verweigert eine Abfrage, die die Identität eines Patienten lesen würde, sofern die UI nicht angibt, dass die Rolle das darf (`revealsPatientIdentity()`); Tests in `services/neo4j-proxy/__tests__/`.              |
| T-02 | Vertragsbedingungen bei der Übertragung verändert                        | F5       | Umgesetzt   | TLS am Rand; die Vereinbarung wird vom Konnektor des Anbieters signiert. Gegenseitig authentifizierte DSP-Endpunkte sind ein Punkt des Leitfadens für echte Daten.                                                                                                 |
| T-03 | Ein gefälschter Claim in einem Nachweis                                  | F5       | Umgesetzt   | Nachweise werden von IssuerService und IdentityHub (EDC-V) ausgestellt und verifiziert; der Hub zeigt an, er signiert nicht neu. Ein HSM für den Schlüssel des Ausstellers ist ein Punkt des Leitfadens.                                                           |
| T-04 | Cross-Site Request Forgery bei einer Mutation                            | F1       | Umgesetzt   | Sitzungscookie mit `SameSite=Lax` (NextAuth); die CSP verbietet Inline-Skripte; keine Mutation liest ihre Parameter aus einem GET.                                                                                                                                 |
| T-05 | Ein Zustandssprung in der Verhandlung                                    | F5       | Umgesetzt   | Die Zustandsautomaten liegen in der Control Plane von EDC-V (REQUESTED, AGREED, FINALIZED; Transfers REQUESTED bis COMPLETED) und werden über Leases in PostgreSQL verwaltet; der Hub spiegelt, er steuert nicht. Das DSP-2025-1-TCK läuft bei jedem Pull Request. |
| T-06 | Der Audit-Trail wird bearbeitet                                          | F15      | Geschlossen | Jeder Eintrag trägt den Hash seines Vorgängers, SHA-256 über kanonisches JSON; `verifyChain()` meldet jede Änderung, Entfernung oder Umordnung (ADR-045, `audit-chain.ts`). Beide Ketten waren nach jedem Lastlauf intakt.                                         |
| T-07 | Eine Änderung in der Lieferkette, in einer Abhängigkeit oder einem Image | F7       | Geschlossen | Eine CycloneDX-Stückliste pro Teil, gegen die Lockfiles geprüft; grype und trivy bei jedem Push; npm audit im Pre-Push mit befristeten Ausnahmen; Images festgelegt; CodeQL. [SBOM](../sbom/README.md), `security-scan.yml`.                                       |

### Repudiation (Abstreitbarkeit)

| ID   | Bedrohung                                                                   | Fluss    | Status      | Gegenmaßnahme und Nachweis                                                                                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Eine Partei bestreitet, dass ein Transfer stattgefunden hat                 | F15      | Geschlossen | `TransferEvent` mit der DID von Sender und Empfänger und einem Zeitstempel, in der hash-verketteten Kette `dsp` (ADR-045).                                                                                                                                    |
| R-02 | Eine Partei bestreitet, einem Vertrag zugestimmt zu haben                   | F5       | Umgesetzt   | Die Vereinbarung wird vom Konnektor signiert und im EDC-Zustand gespeichert; mit ihrer ID in den Graphen gespiegelt.                                                                                                                                          |
| R-03 | Ein Lesezugriff auf die Akte eines Patienten wird bestritten oder verborgen | F14, F15 | Geschlossen | Jeder Zugriff, den der Proxy bedient, ist ein Zugriffsereignis in der Kette `query`; der Patient sieht auf seiner eigenen Seite, wer seine Akte gelesen hat; Aufbewahrung zehn Jahre ([Richtlinie](../audit-retention-policy.md)).                            |
| R-04 | Eine Handlung des Betreibers hinterlässt keine Spur                         | F6, F7   | Umgesetzt   | Anmeldeereignisse von Keycloak werden sieben Tage aufbewahrt; Deployments sind Läufe von GitHub Actions; jeder Live-Schritt ist ein Skript unter `scripts/azure/` und wird in den Gotchas oder einem ADR festgehalten. Ein SIEM ist ein Punkt des Leitfadens. |

### Information disclosure (Offenlegung von Informationen)

| ID   | Bedrohung                                                   | Fluss       | Status      | Gegenmaßnahme und Nachweis                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I-01 | Ein anonymer Aufrufer liest Daten                           | F1          | Geschlossen | Jede API-Route braucht eine Sitzung (ADR-044); die Seiten, die sie lesen, stehen in `PROTECTED_PATHS` und leiten weiter; 40 Black-Box-Prüfungen des Live-Hubs bestätigen die 401-Antworten und die Weiterleitungen (`check-hub-blackbox.sh`).                                                                |
| I-02 | Die Management-API der Konnektoren ist von außen erreichbar | F10         | Umgesetzt   | Nur interner Ingress; die UI erreicht sie über ihren internen Namen, der bei jedem Deployment festgelegt wird (#648). Der Katalog-Crawler sendet sein Token nur an gelistete Hosts.                                                                                                                          |
| I-03 | Secrets in der Seite oder im Repository                     | F1, F7      | Geschlossen | Nur serverseitige Umgebung; Key-Vault-Referenzen (ADR-036); gitleaks in den Hooks und in der CI; ein Test stellt sicher, dass kein Secret in das HTML gelangt.                                                                                                                                               |
| I-04 | Cross-Site-Scripting exfiltriert eine Sitzung               | F1          | Geschlossen | Eine Nonce pro Anfrage in der CSP mit `strict-dynamic`, kein `unsafe-inline` für Skripte; Sitzungscookie mit `HttpOnly`; Header durch `next.config.js` festgelegt und per Black-Box geprüft. Der Seite außerhalb der Betriebszeiten fehlten einmal einige Header (F8, observe).                              |
| I-05 | Eine Datenbank ist aus dem Internet erreichbar              | F14 bis F20 | Geschlossen | Neo4j, PostgreSQL und Vault haben keinen öffentlichen Ingress; der Flexible Server lässt nur die Umgebung zu.                                                                                                                                                                                                |
| I-06 | Clickjacking                                                | F1          | Geschlossen | `X-Frame-Options: DENY` und `frame-ancestors 'none'`, per Black-Box geprüft.                                                                                                                                                                                                                                 |
| I-07 | Re-Identifizierung aus einer Kohorte                        | F9, F12     | Umgesetzt   | `MIN_COHORT_SIZE` von 5 im Proxy für föderierte Abfragen; andere Rollen als der Gesundheitsdateninhaber und der Betreiber sehen ein Pseudonym, das Geburtsjahr und keinen Wohnort (#475). Eine Ausgabekontrolle durch die Zugangsstelle für Gesundheitsdaten ist ein Prozess, den die Demo nicht durchführt. |
| I-08 | Ein abgelaufener oder widerrufener Nachweis wird akzeptiert | F5          | Demo        | Der IdentityHub prüft den Ablauf; in der Demo gibt es keine Widerrufsliste. Statuslisten und ein Widerrufsverfahren sind Punkte des Leitfadens für echte Daten.                                                                                                                                              |
| I-09 | Logs enthalten personenbezogene Daten                       | F13         | Umgesetzt   | Der Proxy protokolliert Anzahlen und Codes, den Aufrufer als Hash; Azure Monitor bewahrt 30 Tage auf; die Betriebslogs sind von der Audit-Kette getrennt (ADR-045).                                                                                                                                          |

### Denial of service (Dienstverweigerung)

| ID   | Bedrohung                                        | Fluss    | Status      | Gegenmaßnahme und Nachweis                                                                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------ | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Ein Nutzer erschöpft den Proxy                   | F9       | Geschlossen | Pro Nutzer: `RATE_LIMIT_MAX` Anfragen und `RATE_LIMIT_HEAVY_MAX` analytische Abfragen pro `RATE_LIMIT_WINDOW_MS`; pro Teilnehmer das Zehnfache davon für Aufrufer, die keinen Nutzer nennen; die Audit-Route hat ein eigenes Limit. Gemessen: 83.6 % abgelehnt vorher, 23.2 % nach dem Limit pro Nutzer (2026-10-05). |
| D-02 | Eine Flut von DSP-Nachrichten an die Konnektoren | F5       | Demo        | Die Control Plane von EDC-V verwaltet ihre Zustandsautomaten über Leases in PostgreSQL und bricht nach Zeitüberschreitung ab; kein Rate Limit am Rand des Konnektors. Eine WAF und Rate Limits pro Hostname sind Punkte des Leitfadens.                                                                               |
| D-03 | Eine unbegrenzte Abfrage                         | F14, F15 | Geschlossen | `LIMIT` auf jeder Listenroute; die Graph-Ansichten auf die neuesten 30 Zugriffsereignisse begrenzt (#580), womit die eine Anfrage wegfiel, die die UI bei 90 gleichzeitigen Nutzern lahmlegte; jeder ausgehende Aufruf hat ein Timeout.                                                                               |
| D-04 | Last legt die Plattform lahm                     | F1       | Umgesetzt   | 400 Nutzer ohne fehlgeschlagene Anfrage (2026-10-06); die UI skaliert über eine HTTP-Concurrency-Regel auf sechs Replikate mit ganzen Kernen (ADR-061); Health Checks in jedem Image; ein Deployment wartet, solange ein Lasttest läuft. Die Latenz-SLOs brechen ab 200 Nutzern; das wird als Nächstes gemessen.      |
| D-05 | Der Stack ist abgeschaltet                       | F1       | Akzeptiert  | Außerhalb der Betriebszeiten stoppt alles per Entscheidung (ADR-053), und die UI sagt das; ein 24x7-Vertrag hebt den Zeitplan auf (Leitfaden, Verfügbarkeit).                                                                                                                                                         |

### Elevation of privilege (Rechteausweitung)

| ID   | Bedrohung                                             | Fluss    | Status      | Gegenmaßnahme und Nachweis                                                                                                                                                                                                                          |
| ---- | ----------------------------------------------------- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01 | Ein Patient erreicht eine Admin-Route                 | F1       | Geschlossen | `requireAuth(["EDC_ADMIN"])` auf den Admin-Routen, 403 für jede andere Rolle; die Rollenmatrix in `.claude/rules/api-conventions.md`; der Bruno-Ordner `09 Access control` prüft es gegen einen echten Server.                                      |
| E-02 | Ein Forscher liest die Identität eines Patienten      | F1, F9   | Geschlossen | `seesPatientIdentity()` entscheidet nach Rolle; `refuseForeignRecord()` antwortet 403 für die Akte eines anderen Patienten; der NLQ-Proxy verweigert Identitätsabfragen ohne den Header der UI (#475). Bruno `09 Access control/28` bis `/30`.      |
| E-03 | In das Token eingeschleuste Rollen                    | F2, F8   | Geschlossen | Rollen stammen nur aus den Claims des Realms; beim UI-Client ist Full Scope deaktiviert, und genau die sieben EHDS-Rollen sind im Scope (#648, `wire-ui-client-scope.sh`); `auth.ts` bildet nichts anderes ab.                                      |
| E-04 | Das Katalog-Token wird von anderswo verwendet         | F10, F11 | Umgesetzt   | Ein Token in Key Vault, das die UI und den Crawler als Referenz erreicht; der Crawler sendet es nur an `DSP_CATALOG_TOKEN_HOSTS`; ein falsches Token ergibt 401, nie einen Rückfall auf die Sitzung (ADR-020, ADR-036).                             |
| E-05 | Ein Transfer ohne Vereinbarung                        | F5, F12  | Umgesetzt   | Die Data Plane gibt einen EDR nur für eine finalisierte Vereinbarung aus (EDC-V); der Hub speichert bei jedem Transfer die `contractId`. Das TCK deckt das Protokoll ab.                                                                            |
| E-06 | Das Betreiberkonto `edcadmin` mit einem Demo-Passwort | F2       | Offen       | `EDC_ADMIN` liest die Akte eines Patienten ohne Vertragsverhandlung. `scripts/azure/secure-accounts.sh` stellt es und jedes Nicht-Demo-Konto auf ein generiertes Passwort in Key Vault um; muss noch gegen den Live-Realm ausgeführt werden (#671). |

### Zusammenfassung

| Kategorie              | Bedrohungen | Geschlossen | Umgesetzt |  Demo | Offen | Akzeptiert |
| ---------------------- | ----------: | ----------: | --------: | ----: | ----: | ---------: |
| Spoofing               |           5 |           2 |         3 |     0 |     0 |          0 |
| Tampering              |           7 |           3 |         4 |     0 |     0 |          0 |
| Repudiation            |           4 |           2 |         2 |     0 |     0 |          0 |
| Information disclosure |           9 |           5 |         3 |     1 |     0 |          0 |
| Denial of service      |           5 |           2 |         1 |     1 |     0 |          1 |
| Elevation of privilege |           6 |           3 |         2 |     0 |     1 |          0 |
| **Alle**               |      **36** |      **17** |    **15** | **2** | **1** |      **1** |

Geschlossen und umgesetzt unterscheiden sich darin, wie sie belegt werden:
Eine geschlossene Zeile hat einen Test oder eine Build-Einstellung, der oder
die fehlschlägt, wenn die Gegenmaßnahme wegfällt; eine umgesetzte Zeile
verlässt sich darauf, dass der Code sie ausführt, und auf die Suiten, die ihn
durchlaufen. Umgesetzte Zeilen in geschlossene zu verwandeln, ist die
gewöhnliche Arbeit an diesem Modell.

## 4. Was die Demo akzeptiert und was echte Daten brauchen

| Restrisiko                                                     | Warum es für die Demo akzeptiert wird                                            | Was es schließt                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Kein Widerruf von Nachweisen (I-08)                            | Jeder Nachweis wird von der Demo an einen fiktiven Teilnehmer ausgestellt        | Eine Statusliste im IssuerService und ein Widerrufsverfahren; Leitfaden, Identität       |
| Kein Rate Limit am Rand der Konnektoren (D-02)                 | Die Konnektoren sprechen nur mit fiktiven Peers                                  | Eine WAF und Limits pro Hostname; Leitfaden, Rand                                        |
| Kein mTLS zwischen Apps (T-02)                                 | Eine Umgebung, interner Ingress                                                  | Private Endpoints und gegenseitig authentifizierte DSP-Endpunkte; Leitfaden, Konnektoren |
| Neo4j hat einen einzigen Datenbanknutzer                       | Der Zugriff wird im Hub und im Proxy entschieden, und die Daten sind synthetisch | Neo4j Enterprise oder ein verwalteter Graph mit Rollen und Backups; Leitfaden, Daten     |
| Betreiberkonten mit Demo-Passwörtern (E-06)                    | Hinter ihnen liegen keine echten Daten von irgendjemandem                        | `secure-accounts.sh --all-non-demo`; #671                                                |
| Kein unabhängiger Test                                         | Die eigenen Tests des Projekts sind bisher der Nachweis                          | Ein Penetrationstest des Hubs; Testbericht, letzter Abschnitt; #655                      |
| Der Stack ist außerhalb der Betriebszeiten abgeschaltet (D-05) | Eine Kostenentscheidung für eine Demo                                            | Ein 24x7-Servicevertrag; Leitfaden, Verfügbarkeit                                        |

## 5. Wie dieses Modell aktuell gehalten wird

- Eine neue API-Route braucht eine Sitzung oder ein ablösendes ADR; der Test
  `every-route-needs-a-session.test.ts` schlägt sonst fehl.
- Eine neue Route, die Patientenfelder zurückgibt, fragt zuerst
  `seesPatientIdentity()`, und die Bruno-Sammlung erhält eine Anfrage, die
  die Ablehnung prüft.
- Jede Änderung durchläuft den Security-Scan, CodeQL, die Compliance-Suiten
  und die Black-Box-Prüfungen; ein Befund kommt mit einem Status in den
  Sicherheitstestbericht, nie nur in eine Commit-Nachricht.
- Die Diagramme sind PlantUML-Quellen unter `diagrams/`, gerendert von
  `scripts/render-plantuml.sh`; ein Fluss, der dem System hinzugefügt wird,
  bekommt hier eine Nummer und eine Zeile in der Tabelle, die ihn analysiert.

## 6. Wie Sie dieses Modell selbst verifizieren

Jede geschlossene Zeile hat eine Prüfung, die sich auf einem Laptop ausführen
oder in der CI nachlesen lässt:

```bash
cd ui && npx vitest run __tests__/unit/api/every-route-needs-a-session.test.ts   # S-02, I-01, E-01
cd ui && npx vitest run __tests__/unit/api/patient-route.test.ts                   # E-02, I-07
scripts/security/check-hub-blackbox.sh                                             # I-01, I-04, I-06, S-04 against the live hub
scripts/security/scan-repo.sh                                                      # T-07: grype, npm audit, trivy, gitleaks, semgrep, hadolint, shellcheck
scripts/security/generate-sbom.sh --check                                          # T-07: the bills match the lockfiles
./scripts/run-api-tests.sh Azure-Dev "09 Access control"                           # E-01, E-02, E-04 by persona, against a real server
scripts/azure/guard-keycloak-console.sh --check                                    # S-04: console 403, admin REST 401, master realm 401
cd services/neo4j-proxy && npm test                                                # T-01, T-06, D-01, D-03
```

Die Compliance-Suiten (`compliance.yml`: das DSP-2025-1-TCK, die
DCP-Prüfungen, die EHDS-Suiten) decken die Konnektor-Zeilen S-01, S-03, T-05
und E-05 bei jedem Pull Request ab. Eine Zeile, deren Prüfung in dieser Liste
fehlt, ist eine umgesetzte Zeile, und der nächste Schritt für sie ist der
Test, der sie verschieben würde.
