---
source: docs/security/operational-guideline.md
sourceHash: ecd7586f5a4e88a5099596d7c1f9eec81a888d8df3250d3cacbcab6dc9a5a13a
language: de
summary: "Wie man den Hub und Klarbefund wirklich betreibt: welche EHDS-Rolle (Verordnung (EU) 2025/327) welchen Teil betreibt, was BSI C5, IT-Grundschutz, TR-02102 und TR-03161 von jedem Teil verlangen, die Fristen bei Vorfällen, die Aufbewahrung und die Go-live-Checkliste je Rolle."
---

# Betriebsleitfaden: Betrieb des Hubs und von Klarbefund nach dem EHDS und den BSI-Standards

Was in diesem Repository liegt, ist ein Demonstrator: eine Azure-Ressourcengruppe, ein
Betreiber, fiktive Teilnehmer, synthetische Patienten und ein Stack, der
nachts anhält, um im Rahmen eines persönlichen Guthabens zu bleiben. Dieser Leitfaden ist für den
Tag geschrieben, an dem jemand ihn tatsächlich betreibt: eine Zugangsstelle für Gesundheitsdaten, eine Betreibergesellschaft
in deren Auftrag, eine Krankenkasse, ein Klinikverbund oder ein Anbieter, der
die White-Label-App übernimmt. Er legt dar, welche Rolle nach der Verordnung (EU) 2025/327
(dem EHDS) welchen Teil betreibt, was die BSI-Standards von jedem Teil verlangen
und was sich gegenüber der Demo ändern muss, bevor echte Gesundheitsdaten damit in Berührung kommen.

Die Artikelnummern sind die der verabschiedeten Verordnung. Ältere Dateien in diesem
Repository tragen noch die Nummern des Vorschlags von 2022; die Zuordnung steht in
[`docs/ehds-article-numbering.md`](../ehds-article-numbering.md). Die
Belege für jedes „die Demo tut das bereits“ weiter unten stehen im
[Sicherheitstestbericht](security-test-report-2026-10-15.md), in den beiden Bedrohungsmodellen
([Hub](threat-model.md), [App](threat-model-klarbefund.md)), in der
[C5-Lückenanalyse](bsi-c5-gap-analysis.md) und in der
[Selbstbewertung](../klarbefund/self-assessment.md) von Klarbefund. Dieses Dokument ist ein
Leitfaden des Projekts, keine Rechtsberatung und keine Zertifizierung.

## 1. Die Rollen im EHDS und wer was betreibt

Die Verordnung benennt die Rollen; sie sagt nicht, wer die Server unterhalb
der Zugangsstelle betreibt. Die sieben Keycloak-Rollen des Hubs sind der technische Schatten
der rechtlichen Rollen, und die Tabelle zeigt, welcher rechtliche Akteur hinter jeder
technischen Rolle steht, sobald das System die Demo verlässt.

| EHDS-Rolle (VO 2025/327)                                                                                  | Was die Verordnung von ihr erwartet                                                                                                                                                                                                      | Hub-Rolle / Komponente                                                                                      | Wer sie in einem echten Betrieb betreibt                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Natürliche Person** (die Patientin oder der Patient), Art. 3 bis 10, Widerspruch Art. 71                | Zugang zu den eigenen elektronischen Gesundheitsdaten, Ergänzung, Berichtigung, Einschränkung, Auskunft darüber, wer zugegriffen hat; das Recht zum Widerspruch gegen die Sekundärnutzung.                                               | `PATIENT`; `/patient/*`; Klarbefund auf dem Telefon; Anmeldung mit der EUDI-Wallet (ADR-028)                | Die Person selbst, über den Zugangsdienst der digitalen Gesundheitsbehörde oder ein EHR-System; die App gehört ihr, der Betreiber sieht ihren Inhalt nie.                                                       |
| **Angehöriger der Gesundheitsberufe**, Art. 11                                                            | Zugang zu den vorrangigen Kategorien der Personen in seiner Behandlung, protokolliert und für die Person sichtbar.                                                                                                                       | In der Demo keine Rolle (der Zugang zur Akte für die Primärnutzung läuft über die ePA, nicht über den Hub)  | Der Betreiber des EHR-Systems; der Hub erhält nur, was die Person exportiert.                                                                                                                                   |
| **Gesundheitsdateninhaber**, Art. 2(2)(y), Pflichten Art. 60, Datensatzbeschreibung Art. 77               | Die Kategorien nach Art. 51 auf Grundlage einer Genehmigung bereitstellen, Datensätze beschreiben, mit der Zugangsstelle kommunizieren, das Qualitätslabel anwenden (Art. 78).                                                           | `DATA_HOLDER`; `/data/share`, `/data/transfer`; der Konnektor (Control Plane, Data Plane, IdentityHub)      | Der Gesundheitsdateninhaber selbst (ein Krankenhaus, eine Krankenkasse, ein Register); die Betreibergesellschaft kann seinen Konnektor im Rahmen eines Auftragsverarbeitungsvertrags nach Art. 28 DSGVO hosten. |
| **Gesundheitsdatennutzer**, Art. 61, Anträge Art. 67, Genehmigung Art. 68                                 | Nur innerhalb der sicheren Verarbeitungsumgebung verarbeiten, nur für den Zweck der Genehmigung (Art. 53), nie für die verbotenen Zwecke (Art. 54), Ergebnisse veröffentlichen, Verletzungen melden.                                     | `DATA_USER`; `/data/discover`, `/negotiate`, `/analytics`, `/query`                                         | Die Einrichtung der Forschenden; sie betreibt nie Infrastruktur, sie ist Mandant der SPE.                                                                                                                       |
| **Zugangsstelle für Gesundheitsdaten (HDAB)**, Art. 55, Aufgaben Art. 57, Durchsetzung Art. 63            | Über Anträge entscheiden, Genehmigungen erteilen, die SPE bereitstellen (Art. 73), das öffentliche Register führen und die Informationspflichten erfüllen (Art. 58, 59), durchsetzen (Art. 63), Verantwortlicher der SPE sein (Art. 74). | `HDAB_AUTHORITY`; `/compliance`, `/admin/policies`, das Genehmigungsregister, `HDABApproval`-Knoten         | Die benannte öffentliche Stelle; ihr gehören die Entscheidungen und die Verantwortlichkeit, auch wo sie den Betrieb einkauft.                                                                                   |
| **Vertrauenswürdiger Gesundheitsdateninhaber**, Art. 72                                                   | Ein Gesundheitsdateninhaber, der das vereinfachte Verfahren für die eigenen Daten durchführen darf, mit denselben Pflichten zu SPE und Protokollierung.                                                                                  | Ein `DATA_HOLDER` mit von der HDAB übertragenen Rechten (in der Demo nicht gesondert modelliert)            | Der Gesundheitsdateninhaber, unter der Aufsicht der Zugangsstelle.                                                                                                                                              |
| **Betreiber der sicheren Verarbeitungsumgebung**, Art. 73                                                 | Zugang nur für befugte natürliche Personen, kein Herunterladen personenbezogener Daten, jeder Zugriff und jede Ausgabe protokolliert, Ausgaben vor der Freigabe auf personenbezogene Daten geprüft, Sicherheit auditiert.                | `TRUST_CENTER_OPERATOR`; `/analytics`, `/query`, `SPESession`, die OMOP-Aggregate; ADR-037, ADR-052         | Die Zugangsstelle oder ihre Betreibergesellschaft; auf einer zertifizierten Cloud (C5-Testat), mit Confidential Computing, wo die Daten es erfordern.                                                           |
| **Digitale Gesundheitsbehörde**, Art. 19; nationale Kontaktstellen, Art. 23 und 75                        | Primärnutzung: der Zugangsdienst, MyHealth@EU; Sekundärnutzung: HealthData@EU und die grenzüberschreitenden Genehmigungen.                                                                                                               | Die zweite Zugangsstelle und die grenzüberschreitende Genehmigung im Seed; der föderierte Katalog (ADR-020) | Die benannten Behörden des Mitgliedstaats; der Hub ist Teilnehmer, nie selbst die nationale Kontaktstelle.                                                                                                      |
| **Hersteller von EHR-Systemen**, Kapitel III; Label für **Wellness-Apps**, Art. 48                        | Konformität der europäischen Interoperabilitäts- und Protokollierungskomponenten des EHR-Systems; eine Wellness-App kann ihre Interoperabilität mit einem EHR-System erklären.                                                           | Klarbefund als App der Wellness-Art, die in die ePA exportiert; FHIR R4 in den EEHRxF-Profilen              | Der Anbieter, der die App ausliefert; im White-Label-Fall die Krankenkasse als die Stelle, die sie in Verkehr bringt.                                                                                           |
| **Plattformbetreiber** (keine EHDS-Rolle; die Betreibergesellschaft aus `docs/ehds-operating-company.md`) | Betreibt Identität, Katalog, Konnektoren, SPE und Monitoring für die oben genannten Akteure; Auftragsverarbeiter nach Art. 28 DSGVO für jeden von ihnen.                                                                                 | `EDC_ADMIN`; `/admin/*`, die Azure-Ressourcengruppe, Keycloak, Vault, Key Vault, die Pipelines              | Ein beauftragter Betreiber mit einem ISMS nach ISO 27001 auf der Basis von IT-Grundschutz und einer C5-testierten Cloud darunter.                                                                               |
| **Aufsichtsbehörden**: Datenschutz (DSGVO), Marktüberwachung (Kapitel III), BSI / nationales CSIRT (NIS2) | Erhalten Meldungen von Verletzungen, prüfen, setzen durch.                                                                                                                                                                               | Der Audit-Trail (ADR-045), der Tätigkeitsbericht, das Genehmigungsregister                                  | Keine Betreiber; der Betreiber muss ihnen innerhalb der Fristen aus Abschnitt 7 antworten können.                                                                                                               |

### Das Betriebsmodell als Prozess

Das Diagramm ist ein Prozess im BPMN-Stil mit einer Swimlane pro Rolle: Kästen sind
Aufgaben, Rauten sind Entscheidungen, die Schleife am Ende ist die Ausgabekontrolle,
die grünen Punkte sind Start und Ende. Die Artikelnummern sind die der verabschiedeten Fassung. Die
Bahnen des Gesundheitsdateninhabers, des Gesundheitsdatennutzers und der Person gehören diesen selbst; die Bahn der
Zugangsstelle ist der Ort jeder Entscheidung; die Bahnen der Betreibergesellschaft und des
SPE-Betreibers enthalten die technische Arbeit, die dieses Repository
umsetzt.

![EHDS-Betriebsmodell: eine Swimlane pro Rolle, vom Onboarding des Gesundheitsdateninhabers über Antrag, Genehmigung, Widerspruch, Extraktion, die sichere Verarbeitungsumgebung und die Ausgabekontrolle bis zu den veröffentlichten Ergebnissen](img/ehds-operating-model.svg)

Quelle: [`diagrams/ehds-operating-model.puml`](diagrams/ehds-operating-model.puml), gerendert mit `scripts/render-plantuml.sh`.

Drei Verantwortlichkeiten, die das Diagramm sichtbar macht und die ein Vertrag
wiederholen muss: Die Zugangsstelle entscheidet, der Betreiber führt aus; der
Widerspruch der Person erreicht die Extraktion des Gesundheitsdateninhabers über die Richtlinienauswertung des Betreibers,
nicht über guten Willen; und keine Ausgabe verlässt die SPE auf Geheiß des
Betreibers, nur auf das der Zugangsstelle.

Zwei Dinge folgen daraus. **Die Verantwortlichkeit liegt nie beim Betreiber.** Die Zugangsstelle
ist Verantwortliche für die SPE und die Genehmigungsdaten (Art. 74); der Gesundheitsdateninhaber ist
Verantwortlicher für seine Quelldaten; der Betreiber verarbeitet auf Weisung. Jeder
Hosting-Vertrag wiederholt dies. **Rollenvergaben sind Entscheidungen, keine Tickets.**
Wer `HDAB_AUTHORITY` oder `TRUST_CENTER_OPERATOR` wird, entscheidet die
Zugangsstelle schriftlich; der Betreiber führt die Vergabe in Keycloak aus, und die
Vergabe wird protokolliert (ADR-045). Die Demo vergibt Rollen in einer Seed-Datei; ein echter
Betrieb entfernt den Seed und behält die Vergabehistorie.

## 2. Hosting-Architektur: von der Demo zu einer betreibbaren Plattform

Die Demo betreibt alles in einer Umgebung von Azure Container Apps,
`rg-mvhd-dev` (ADR-012), außerhalb der Bürozeiten angehalten (ADR-053, ADR-058). Der Aufbau
unten behält die Komponenten bei und ändert, wie sie platziert sind.

### Die Lösung in Schichten

![Die Lösung als geschichtete ArchiMate-Sicht: die Geschäftsschicht mit den sechs EHDS-Rollen und den Prozessen, die jede ausführt, die Anwendungsschicht mit den sechs Diensten und den Komponenten, die sie realisieren, die Technologieschicht mit der Azure-Plattform, den Datenbanken, den Vaults und dem iPhone](img/ehds-solution-layers.svg)

Quelle: [`diagrams/ehds-solution-layers.puml`](diagrams/ehds-solution-layers.puml),
Notation ArchiMate 3.2. Die Geschäftsschicht ist Abschnitt 1 dieses Leitfadens:
Jede Rolle führt ihre eigenen Prozesse aus, und das zweiseitige Verfahren aus Kapitel
IV (beantragen, entscheiden, verarbeiten) verläuft von links nach rechts. Die Anwendungsschicht benennt,
was der Hub diesen Prozessen bereitstellt und welche Komponente es realisiert;
die Technologieschicht ist die Plattform der Tabelle unten, so wie die Demo sie heute
betreibt. Ein Pfeil von einem unteren zu einem oberen Band bedeutet „dient“.

| Zone                 | Komponenten                                                             | Demo heute                                                                                     | Erforderlich für echte Daten                                                                                                                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge                 | TLS-Terminierung, WAF, Ratenbegrenzungen                                | ACA-Ingress mit verwalteten Zertifikaten; Header gesetzt durch `next.config` (F8)              | Eine Web Application Firewall vor jedem öffentlichen Hostnamen; TLS nach BSI TR-02102-2 (mindestens TLS 1.2, bevorzugt 1.3, keine CBC-Suites); HSTS mit Preload; Ratenbegrenzungen pro Route und pro Identität; Bot- und DDoS-Schutz aus der Cloud.                                                               |
| Identität            | Keycloak, IdentityHub, IssuerService, das Backend der EUDI-Wallet       | Keycloak `start-dev` hinter einem Caddy-Wächter (F10); Realm aus `keycloak-realm.json`         | Keycloak im Produktionsmodus mit eigener Datenbank auf dem Flexible Server, Admin-Konsole nur aus dem Netz des Betreibers erreichbar, MFA für jede privilegierte Rolle (C5 IAM-04), der Realm unter Versionskontrolle und auf Drift geprüft (`docs/knowledge/runbooks/keycloak-realm-drift.md`).                  |
| Anwendung            | Der Hub (Next.js), der neo4j-proxy, der Erklärdienst, die Crawler       | Öffentlicher Ingress für den Hub und Keycloak; interner Ingress für den Rest                   | Nur der Hub und Keycloak öffentlich; alles andere über internen Ingress oder Private Endpoints; jedes Image signiert und per Digest fixiert; die Stücklisten in `docs/sbom/` bei jeder Abhängigkeitsänderung neu erzeugt.                                                                                         |
| Konnektoren          | Control Plane, Data Planes, IdentityHub, Vault je Teilnehmer            | Ein Konnektorsatz je fiktivem Teilnehmer (ADR-024)                                             | Ein Konnektor je rechtlichem Gesundheitsdateninhaber, betrieben vom Gesundheitsdateninhaber oder vertraglich vom Betreiber; DSP-Endpunkte gegenseitig authentifiziert; die Schlüssel des Teilnehmers in seinem eigenen Vault-Namespace (ADR-046), nie geteilt.                                                    |
| Daten                | Neo4j, der PostgreSQL Flexible Server, Azure Files                      | Verwaltetes Postgres (ADR-041); Neo4j auf Azure Files (ADR-017); keine Backups                 | Verschlüsselung ruhender Daten mit kundenverwalteten Schlüsseln (C5 CRY-03, DIP-02); zonenredundantes Postgres mit Point-in-Time-Wiederherstellung; Neo4j Enterprise oder ein verwalteter Graph mit vierteljährlich getesteten Backups (DIP-03); keine synthetischen und keine echten Daten in derselben Instanz. |
| Sichere Verarbeitung | `/analytics`, `/query`, die OMOP-Aggregate, `SPESession`                | Aggregate im selben Neo4j; Confidential Computing bewertet (ADR-037, ADR-052)                  | Eine eigene Umgebung nach Art. 73: isoliertes Netz, kein ausgehendes Internet, kein Download-Pfad, Ausgaben vor der Freigabe von der Zugangsstelle geprüft, Confidential VMs oder Enklaven, wo die Daten der Genehmigung es erfordern; mindestens jährlich auditiert.                                             |
| Secrets              | Key Vault, Vault                                                        | Jedes Betreiber-Secret eine Key-Vault-Referenz (ADR-036); Vault-Zustand auf Postgres (ADR-046) | Beibehalten; Rotation nach Zeitplan ergänzen (C5 CRY-04), HSM-gestützte Schlüssel zum Signieren von Credentials und ein dokumentiertes Break-Glass-Verfahren mit Vier-Augen-Freigabe.                                                                                                                             |
| Beobachtbarkeit      | Der OpenTelemetry Collector, Grafana, Loki, Tempo, Prometheus (ADR-045) | Eine Observability-App; Logs in Azure Monitor                                                  | Logs an ein SIEM geliefert, das das SOC des Betreibers überwacht; Unveränderlichkeit für den Audit-Trail (DIP-06); Aufbewahrung nach Abschnitt 6; Alarmierung bei den Ereignissen aus Abschnitt 7.                                                                                                                |
| Verfügbarkeit        | Der gesamte Stack                                                       | Hält werktags um 18:13 UTC an, startet um 05:17 UTC                                            | 24x7 mit den Zielen des Dienstleistungsvertrags; der Zeitplan außerhalb der Bürozeiten ist eine Kostenmaßnahme der Demo und wird entfernt (es ist ein einziger `az`-Aufruf, `scripts/azure/offhours.sh`, und ADR-053 wird durch die Hosting-Entscheidung abgelöst).                                               |

Aus der einen Ressourcengruppe der Demo werden mindestens drei Subscriptions oder
Ressourcengruppen mit getrennten Identitäten: Identität und Edge, die Plattform
und die sichere Verarbeitungsumgebung. Die Identität der SPE hat nie Rechte
in den anderen. Das ist der C5-Kontrollbereich „PSS“ (Portabilität und
Trennung) und IT-Grundschutz NET.1.1 in der Praxis.

## 3. Die BSI-Standards, Teil für Teil

| Standard                                                          | Gilt für                                                         | Was er hier verlangt                                                                                                                                                                                                                                                                                                                                               | Wo das Projekt steht                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BSI C5:2020** (Kriterienkatalog Cloud Computing)                | Die darunterliegende Cloud und den Betreiber als Cloud-Anbieter  | Einen Testatbericht (Typ 2) des Cloud-Anbieters für die Infrastruktur und den eigenen C5-Bericht des Betreibers für die Plattform, wenn er sie als Dienst anbietet. Die Kriterien, die der Code erfüllen kann, werden Kontrolle für Kontrolle verfolgt.                                                                                                            | [C5-Lückenanalyse](bsi-c5-gap-analysis.md): die Kriterien zu Entwicklung, IAM und Audit-Protokollierung erfüllt oder teilweise erfüllt; die organisatorischen offen.                                                                 |
| **ISO 27001 auf der Basis von IT-Grundschutz**                    | Den Betreiber                                                    | Ein ISMS mit den Bausteinen, die zu diesem Stack passen: APP.3.1 Webanwendungen und Webservices, APP.4.4 Kubernetes (ACA folgt demselben Modell), SYS.1.6 Containerisierung, CON.1 Kryptokonzept, ORP.4 Identitäts- und Berechtigungsmanagement, OPS.1.1.5 Protokollierung, OPS.1.2.5 Fernwartung, DER.2.1 Behandlung von Sicherheitsvorfällen, CON.2 Datenschutz. | Nichts, was ein Repository enthalten kann; die Bedrohungsmodelle und der Testbericht sind Eingaben für die Risikoanalyse.                                                                                                            |
| **TR-02102-1 und -2** (kryptographische Verfahren, TLS)           | Jede Verbindung und jedes gespeicherte Secret                    | TLS 1.2 oder 1.3 mit den aufgeführten Suites; AES-GCM mit 256 Bit für ruhende Daten; RSA mit 3000 Bit oder ECDSA P-256 und darüber für Signaturen; SHA-256 und darüber; Schlüssel rotiert.                                                                                                                                                                         | Die App: AES-GCM pro Datensatz, Schlüssel in der Secure Enclave (Selbstbewertung O.Cryp). Der Hub: TLS von der Plattform, als Blackbox geprüft; die Suites der Edge sind die der Cloud und müssen im Vertrag festgeschrieben werden. |
| **TR-03161** (Sicherheitsanforderungen an Gesundheitsanwendungen) | Klarbefund und jede White-Label-Version davon                    | Die Prüfaspekte von Teil 1 (mobile Apps) und Teil 2 (Web/Backends): Zweck, Architektur, Quellcode, Drittanbieter, Kryptographie, Authentisierung, Datenspeicherung, kostenpflichtige Ressourcen, Netzwerk, Plattform, Resilienz.                                                                                                                                   | [Selbstbewertung](../klarbefund/self-assessment.md), Prüfaspekt für Prüfaspekt; die Liste auf Anforderungsebene und ein unabhängiger Test sind offen (Testbericht, Abschnitt „What an independent test would add“).                  |
| **TR-03116-4** (TLS in Projekten des Bundes)                      | Jeden Betrieb für eine öffentliche Stelle                        | Das TLS-Profil, das ein Betreiber des Bundes verwenden muss; strenger als TR-02102-2 bei Cipher Suites und Zertifikatsketten.                                                                                                                                                                                                                                      | Nicht geprüft; die Konfiguration der Edge ist die der Cloud.                                                                                                                                                                         |
| **TR-03107-1** (elektronische Identitäten und Vertrauensdienste)  | Anmeldung natürlicher Personen                                   | Vertrauensniveaus für die Identifizierung; „substantiell“ oder „hoch“ für den Zugang zur eigenen Gesundheitsakte.                                                                                                                                                                                                                                                  | Die Anmeldung mit der EUDI-Wallet (ADR-028) zielt über die Wallet auf „hoch“; Benutzername und Passwort in Keycloak nur für die Demo.                                                                                                |
| **NIS2 in der Umsetzung (BSIG)**, KRITIS-Schwellenwerte           | Den Betreiber und die Gesundheitseinrichtungen auf der Plattform | Risikomanagementmaßnahmen, Meldung von Vorfällen in 24 Stunden (Frühwarnung) und 72 Stunden, Sicherheit der Lieferkette, Verantwortung der Geschäftsleitung; KRITIS-Registrierung, wenn die Schwellenwerte für Gesundheit erreicht sind.                                                                                                                           | Abschnitt 7 nennt die Fristen; das Dokument zur Betreibergesellschaft enthält das Eskalationsmodell.                                                                                                                                 |

Die Reihenfolge zählt für eine Ausschreibung: Den C5-Bericht der Cloud fragt ein öffentlicher
Auftraggeber zuerst an, das ISMS des Betreibers als Zweites, den TR-03161-Test der App als
Drittes. Keines davon entsteht durch Code; der Code erzeugt die Belege, die
sie lesen.

## 4. Identität und Zugriff

- **Ein Identitätsanbieter, betrieben vom Plattformbetreiber, mit dem
  Realm unter Versionskontrolle.** Keycloak hält die Rollen; der Hub vertraut nur
  den Rollen im Token (`ui/src/lib/auth.ts`). Jede API-Route braucht eine
  Sitzung (ADR-044); die eine Ausnahme pro Route wird als ADR festgehalten, nie
  als Konfigurationsschalter.
- **Organisationen weisen nach, wer sie sind, mit verifizierbaren Nachweisen**, ausgestellt
  gegen ein maßgebliches Register (DCP v1.0, `did:web`). Der IssuerService
  gehört dem Betreiber; die Schlüssel des Gesundheitsdateninhabers bleiben in dessen Vault-Namespace.
  Der Seed der Demo stellt fiktiven Organisationen Nachweise aus;
  ein echter Betrieb stellt sie erst nach den Onboarding-Schritten im
  Dokument zur Betreibergesellschaft aus, Schritt 3.
- **Natürliche Personen melden sich über die EUDI-Wallet oder die nationale eID an**,
  mit dem Vertrauensniveau „hoch“ für die eigene Akte (Art. 16, Identifizierungsmanagement;
  TR-03107). Benutzername und Passwort bleiben für das Personal, mit MFA,
  und nie für Patienten.
- **Privilegierte Rollen** (`EDC_ADMIN`, `HDAB_AUTHORITY`,
  `TRUST_CENTER_OPERATOR`) erfordern MFA, eine namentlich benannte Person, eine dokumentierte Vergabe durch
  die Zugangsstelle und eine vierteljährliche Überprüfung. Dienstkonten (das Token des
  Katalog-Crawlers, ADR-020; das Sandbox-Konto der App, ADR-054) werden
  mit Verantwortlichem, Umfang und Rotationsdatum aufgeführt.
- **Die Keycloak-Admin-Konsole ist nicht im Internet** (Befund F10, der
  Caddy-Wächter in `scripts/azure/guard-keycloak-console.sh`); die Administration
  läuft über ein privates Netz oder einen Bastion-Host mit Sitzungsaufzeichnung.
- **Sitzungen** sind für privilegierte Rollen kurz, an den Client gebunden und
  werden bei Rollenänderung widerrufen. `NEXTAUTH_SECRET` und jedes andere Betreiber-Secret
  ist eine Key-Vault-Referenz (ADR-036), nach Zeitplan rotiert.
- **Wer die Identität einer Patientin oder eines Patienten sieht, entscheidet die Rolle, nie ein
  Parameter** (`ui/src/lib/patient-identity.ts`): die Gesundheitsdateninhaber und der Plattformbetreiber
  für die Primärnutzung, die Patientin oder der Patient nur für die eigene Akte
  (`refuseForeignRecord`), alle anderen ein Pseudonym. Der NLQ-Proxy verweigert
  identitätsoffenbarende Abfragen. Das bleibt so und wird bei jedem
  Build getestet.

## 5. Datenschutz

- **Verantwortlichkeit und Verträge.** Die Zugangsstelle ist Verantwortliche für die
  sichere Verarbeitungsumgebung (Art. 74) und erteilt dem Betreiber als Auftragsverarbeiter Weisungen;
  der Gesundheitsdateninhaber ist Verantwortlicher für seine Quelldaten; der Gesundheitsdatennutzer ist
  Verantwortlicher für das, was er verarbeiten darf, und zwar nur innerhalb der SPE. Jedes
  Paar schließt einen Vertrag nach Art. 28 DSGVO; das Dokument zur Betreibergesellschaft liefert
  das Muster.
- **Eine Datenschutz-Folgenabschätzung** vor dem Go-live, für die Plattform
  als Ganzes und gesondert für die SPE. Die beiden Bedrohungsmodelle sind die
  technische Eingabe; die DSFA ergänzt die Rechtsgrundlage je Datenkategorie (Art. 51)
  und die Restrisiken.
- **Datenminimierung und Zweckbindung** (Art. 66): Die Zugangsstelle
  entscheidet für jede Genehmigung, ob anonymisierte Daten die Frage beantworten, und
  erst dann pseudonymisierte Daten. Die OMOP-Aggregate des Hubs und die k-Anonymität
  der Kohortenansichten sind der anonymisierte Weg; die FHIR-Extraktion ist der
  pseudonymisierte und läuft nur innerhalb der SPE.
- **Pseudonymisierungsschlüssel** liegen bei der Zugangsstelle oder einem vertrauenswürdigen Dritten,
  nie beim Gesundheitsdatennutzer und nie beim Betreiber der SPE.
- **Der Widerspruch** (Art. 71) ist ein Register, das die Zugangsstelle führt; der
  Konnektor des Gesundheitsdateninhabers prüft es vor der Extraktion. Die Demo hat Einwilligungsdatensätze
  in der App und auf der Patientenseite; ein echter Betrieb bindet das
  nationale Widerspruchsregister in die ODRL-Richtlinienauswertung ein.
- **Patientenrechte für die Primärnutzung** (Art. 3 bis 10): Zugang, Ergänzung,
  Berichtigung, Einschränkung und die Liste, wer zugegriffen hat. Das Zugriffsprotokoll
  der Patientenseite und der Audit-Trail (ADR-045) sind die Umsetzung;
  der Betreiber muss eine Anfrage innerhalb des Monats der DSGVO beantworten.
- **Datenstandort.** Jeder Auftragsverarbeiter sitzt in der EU oder im EWR; der Modellanbieter des Erklärdienstes
  wird nach Region und Kontingent gewählt (ADR-035), und das
  Modell auf dem Gerät ist die Voreinstellung, sodass kein Gesundheitswert das Telefon verlässt,
  es sei denn, die Person sendet ihn.
- **Die App** enthält nichts, was der Betreiber lesen kann: Werte, Seiten und
  Diagnosedaten sind pro Datensatz mit einem Schlüssel in der Secure Enclave verschlüsselt,
  von Backups ausgeschlossen, hinter Face ID oder dem Gerätecode (ADR-060). Der
  White-Label-Betreiber übernimmt das; er darf keine Telemetrie ergänzen, die
  Werte überträgt.

## 6. Protokollierung, Aufbewahrung und der Audit-Trail

Was protokolliert werden muss, wie lange und wer es lesen darf. Die
[Richtlinie zur Audit-Aufbewahrung](../audit-retention-policy.md) des Projekts enthält die aktuellen
Zahlen (sie zitiert noch die Artikelnummern des Vorschlags); die Pflichten ergeben sich
aus Art. 57 (die Zugangsstelle führt Aufzeichnungen über Anträge und Genehmigungen),
Art. 73 (jeder Zugriff auf die SPE und jede Ausgabe protokolliert), Art. 58 und 59
(Information der Öffentlichkeit, Jahresbericht) und der Rechenschaftspflicht nach der DSGVO.

| Ereignis                                                                   | Protokolliert von                   | Lesbar für                                                             | Aufbewahrung (Projektrichtlinie)                  |
| -------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| Datenzugriff, Übertragung, Vertrag (die `TransferEvent`-Kette)             | Der neo4j-proxy und die Konnektoren | Die Zugangsstelle, den Gesundheitsdateninhaber für seine Daten, Prüfer | 10 Jahre                                          |
| Entscheidungen über Genehmigungen, Widerrufe                               | Die Zugangsstelle im Hub            | Öffentliches Register für die Entscheidung, Beteiligte für die Akte    | 10 Jahre                                          |
| SPE-Sitzungen: wer, welcher Datensatz, welche Abfrage, welche Ausgabe      | Die SPE                             | Die Zugangsstelle; den Gesundheitsdatennutzer für die eigenen          | 10 Jahre                                          |
| Rollenvergaben und -widerrufe, privilegierte Anmeldungen                   | Keycloak, an das SIEM geliefert     | Das Sicherheitsteam des Betreibers, Prüfer                             | 2 Jahre, länger, wenn ein Vorfall darauf verweist |
| HTTP-Zugriffe an der Edge, Authentifizierungsereignisse                    | Die Edge und Keycloak               | Das Sicherheitsteam des Betreibers                                     | 2 Jahre                                           |
| Eigene Akte der Patientin oder des Patienten: jeder Lesezugriff, durch wen | Der Hub                             | Die Patientin oder den Patienten, auf der eigenen Seite                | So lange wie die Akte                             |
| App: Diagnosedaten, die die Person exportieren möchte                      | Die App, nur auf dem Gerät          | Die Person; die Entwickler nur, wenn sie gesendet werden               | Die Person entscheidet                            |

Drei Regeln, die die Demo bereits einhält und die ein echter Betrieb einhalten muss:
Der Audit-Trail wird von dem Dienst geschrieben, der die Aktion ausgeführt hat, nicht vom
Client; er ist für alle außer dem Aufbewahrungsjob nur erweiterbar
(DIP-06, umzusetzen mit einem unveränderlichen Speicher oder einer signierten Kette); und keine Logzeile
enthält einen Gesundheitswert oder einen Namen, wo ein Pseudonym genügt.

## 7. Vorfälle, Fristen und wer wen benachrichtigt

| Auslöser                                                                 | Frist                                                                                                    | Wer benachrichtigt wen                                                                                                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verletzung des Schutzes personenbezogener Daten                          | DSGVO Art. 33: 72 Stunden an die Aufsichtsbehörde; Art. 34: die Personen unverzüglich                    | Der Betreiber informiert den Verantwortlichen (Zugangsstelle oder Gesundheitsdateninhaber) unverzüglich; der Verantwortliche meldet an die Behörde.                              |
| Erheblicher Vorfall bei einer Gesundheitseinrichtung oder beim Betreiber | NIS2 in der Umsetzung: Frühwarnung in 24 Stunden, Meldung in 72 Stunden, Abschlussbericht in einem Monat | Der CSIRT-Kontakt des Betreibers an das BSI; parallel die betroffenen Gesundheitsdateninhaber.                                                                                   |
| Datennutzung außerhalb der Genehmigung                                   | Art. 63(2): Die Zugangsstelle kann die Genehmigung widerrufen und die Verarbeitung unverzüglich beenden  | Der SPE-Betreiber meldet sofort an die Zugangsstelle; die Zugangsstelle entscheidet und informiert, falls eine Verletzung nach DSGVO möglich ist, umgehend die Aufsichtsbehörde. |
| SPE-Audit stellt einen Mangel fest                                       | Art. 73(3): Abhilfemaßnahme                                                                              | Die Zugangsstelle weist den Betreiber an; die Behebung wird im nächsten Audit belegt.                                                                                            |
| Schwerwiegender Vorfall eines EHR-Systems oder einer App                 | Art. 44 (Risiken und schwerwiegende Vorfälle)                                                            | Der Hersteller an die Marktüberwachungsbehörde; bei der White-Label-App die Stelle, die sie in Verkehr bringt.                                                                   |
| Schwachstelle in einer Abhängigkeit, hoch oder kritisch                  | Projektregel: behoben oder befristete Ausnahme innerhalb des CI-Gates (`docs/npm-audit-exceptions.json`) | Das Sicherheitsteam des Betreibers; der Scan läuft bei jedem Push (`security-scan.yml`).                                                                                         |

### Koordination von Vorfällen zwischen den Beteiligten

Eine Eskalation ist eine Reihe von Benachrichtigungen mit Fristen, deshalb ist sie als
Sequenz gezeichnet: eine Lebenslinie pro Beteiligtem, eine Nachricht pro Benachrichtigung, die gesetzlichen
Fristen fett an der Nachricht und die Zweige, die gleichzeitig laufen, in
einem parallelen Block.

![Koordination von Vorfällen als Sequenz: Der Betreiber erkennt, triagiert und begrenzt innerhalb einer Stunde; dann parallel: Der Verantwortliche meldet innerhalb von 72 Stunden an die Datenschutzbehörde und unverzüglich an die Personen, der Betreiber warnt das CSIRT innerhalb von 24 Stunden und meldet innerhalb von 72 Stunden und einem Monat, die Zugangsstelle widerruft eine missbrauchte Genehmigung und die Gesundheitsdateninhaber können aussetzen; dann die Behebung, der Bericht nach dem Vorfall und die Abhilfemaßnahme nach einem SPE-Audit](img/ehds-incident-coordination.svg)

Quelle: [`diagrams/ehds-incident-coordination.puml`](diagrams/ehds-incident-coordination.puml),
gerendert mit `scripts/render-plantuml.sh`. Die Fristen stammen aus
[DSGVO Art. 33 und 34](https://eur-lex.europa.eu/eli/reg/2016/679/oj),
[NIS2 Art. 23](https://eur-lex.europa.eu/eli/dir/2022/2555/oj) in der Umsetzung
im BSIG und [Verordnung (EU) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj)
Art. 61, 63(2) und 73(3); die Tabelle oben nennt jede einzelne.

Die Fristen stehen nicht zur Verhandlung des Betreibers: Dem Verantwortlichen gehören die
Fristen der DSGVO, dem Betreiber die der NIS2, der Zugangsstelle die des EHDS. Die
Kontaktliste im Vorfallverfahren nennt für jede eine Person mit
Vertretung, und die Tabletop-Übung vor dem Go-live geht dieses Diagramm einmal durch.

Die Alarmierung, die diese Tabelle speist, mindestens: eine privilegierte Anmeldung von einem
neuen Standort, eine Anfrage an die Admin-Konsole, die Keycloak überhaupt erreicht, eine Abfrage
in der SPE, die eine Identität offenlegen würde, eine fehlgeschlagene App-Attest-Prüfung in
größerer Zahl, ein Konnektor, dessen Nachweisprüfung fehlschlägt, ein Backup-Job, der
nicht gelaufen ist, und jede HTTP-5xx-Rate über dem Grundniveau.

## 8. Betrieb der Plattform

- **Änderungsmanagement.** Jede Änderung ist ein Pull Request mit den Gates aus
  `docs/quality-gates.md`: Typprüfung, Lint, Unit- und Journey-Tests, die
  Bruno-Collection gegen den Hub, Semgrep, gitleaks, hadolint, die SBOM-Prüfung,
  CodeQL für TypeScript und Swift, trivy und grype. Merges werden
  über `deploy-azure.yml` ausschließlich von `main` ausgerollt; die Produktionsumgebung
  ergänzt eine Release-Freigabe durch das Change Board des Betreibers und ein signiertes Image.
- **Schwachstellenmanagement.** Die Scans in `scripts/security/scan-repo.sh`
  laufen bei jedem Push und nächtlich; hohe und kritische Befunde werden innerhalb
  des vertraglichen Zeitfensters behoben oder mit einer schriftlichen Ausnahme befristet. Der
  [Sicherheitstestbericht](security-test-report-2026-10-15.md) wird bei
  jedem Release und einmal jährlich durch einen unabhängigen Tester wiederholt.
- **Patching.** Basis-Images monatlich und bei Sicherheitshinweisen neu gebaut; Keycloak,
  Neo4j und Postgres auf unterstützten Hauptversionen (ADR-030 für Neo4j, das
  Runbook für Postgres 16 auf 17 als Muster).
- **Backups und Wiederherstellung.** Postgres mit Point-in-Time-Wiederherstellung über
  Zonen hinweg; Neo4j mit täglichen Backups und einem vierteljährlichen Wiederherstellungstest; der Zustand von Vault
  liegt auf Postgres (ADR-046) und die Unseal-Schlüssel in Key Vault, mit einer
  dokumentierten Wiederherstellungsübung. Im Vertrag zu vereinbarende Ziele: Recovery
  Point eine Stunde, Recovery Time vier Stunden für den Hub, ein Arbeitstag für
  die SPE.
- **Verfügbarkeit.** 24x7; der Zeitplan der Demo wird entfernt; Health Checks in
  jedem Image (Befund F6) und Probes in jeder App-Definition; zwei Replikate
  für den Hub und den Proxy; die Seite außerhalb der Bürozeiten wird zu einer Wartungsseite,
  die nur in angekündigten Wartungsfenstern verwendet wird.
- **Schlüsselverwaltung.** Signaturschlüssel für Nachweise in einem HSM; TLS-Zertifikate
  automatisiert; jedes Secret mindestens jährlich und bei
  Personalwechsel rotiert; das Break-Glass-Verfahren mit Vier-Augen-Freigabe und einem
  Protokoll.
- **Sicherheit der Lieferanten** (C5 OIS-05): Keycloak, Neo4j, die EDC-Komponenten,
  die Cloud und der Modellanbieter bewertet und mit ihren
  Testaten aufgeführt; die Stücklisten in `docs/sbom/` sind das Inventar.
- **Ausstieg.** Der Datenexport in FHIR R4 und OMOP CDM ist bereits die
  Schnittstelle des Hubs; der Vertrag nennt das Format, die Frist und den Löschnachweis
  am Ende.

## 9. Klarbefund in einem White-Label-Betrieb

Die App wechselt den Eigentümer, nicht die Architektur. Die Stelle, die sie
in Verkehr bringt:

- behält die Voreinstellung auf dem Gerät bei: Werte, Seiten und die Erklärung bleiben auf dem
  Telefon, es sei denn, die Person sendet sie (Selbstbewertung O.Purp, O.Data);
- behält die App-Sperre und die Verschlüsselung pro Datensatz bei (ADR-060, O.Auth,
  O.Cryp) und ergänzt keine Analysewerkzeuge, die Werte sehen;
- betreibt den Dienst für Sandbox-Konten (ADR-054) und, falls angeboten, den
  Erklärdienst (ADR-034, ADR-035) in der EU unter eigenem Namen und
  mit eigener DSFA;
- veröffentlicht eine Datenschutzerklärung in der Sprache der Person und eine Adresse für die
  Meldung von Schwachstellen;
- beauftragt den TR-03161-Test und, wenn sie Interoperabilität mit einem
  EHR-System beansprucht, die Erklärung nach Art. 48; sie beansprucht keinen DiGA-Status ohne
  die CE-Kennzeichnung, die der DiGA-Weg erfordert (Selbstbewertung, „Regulation“);
- wiederholt den Genauigkeitsnachweis mit ihren eigenen Befundformaten vor dem Pilotbetrieb
  (der Benchmark in [`evidence.md`](../klarbefund/evidence.md) ist synthetisch).

## 10. Vor dem Go-live: die Checkliste nach Rolle

| #   | Punkt                                                                                                     | Verantwortlich                         | Nachweis                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Hosting-Vertrag mit Verantwortlichkeit nach Art. 74 und Klauseln nach Art. 28 DSGVO je Paar               | Zugangsstelle, Betreiber               | Unterzeichnete Verträge                                                                                                  |
| 2   | C5-Bericht Typ 2 des Cloud-Anbieters geprüft; der Umfang deckt jeden genutzten Dienst ab                  | Betreiber                              | Bericht, Zuordnung des Umfangs                                                                                           |
| 3   | ISMS des Betreibers zertifiziert oder mit datiertem Plan; die Bausteine aus Abschnitt 3 zugeordnet        | Betreiber                              | Zertifikat oder Auditplan                                                                                                |
| 4   | DSFA für die Plattform und für die SPE                                                                    | Zugangsstelle (Verantwortliche)        | DSFA-Dokumente                                                                                                           |
| 5   | Netzzonen, Private Endpoints, WAF, TLS-Profil nach TR-02102-2 oder TR-03116-4                             | Betreiber                              | Architektur, Scan von außen (`check-hub-blackbox.sh` erweitert)                                                          |
| 6   | Keycloak im Produktionsmodus, Admin-Konsole privat, MFA für privilegierte Rollen, Realm in Git            | Betreiber                              | Realm-Diff, `guard-keycloak-console.sh --check`                                                                          |
| 7   | Anmeldung mit EUDI oder eID für natürliche Personen mit Vertrauensniveau „hoch“                           | Betreiber, digitale Gesundheitsbehörde | Konformitätstest des Wallet-Ablaufs                                                                                      |
| 8   | Verschlüsselung ruhender Daten mit kundenverwalteten Schlüsseln; Backups und eine Wiederherstellungsübung | Betreiber                              | Key-Vault-Konfiguration, Protokoll der Übung                                                                             |
| 9   | SPE isoliert, kein Download-Pfad, Verfahren zur Ausgabekontrolle, jährliches Audit geplant                | Zugangsstelle, SPE-Betreiber           | Auditplan, Verfahren                                                                                                     |
| 10  | Audit-Trail unveränderlich, an das SIEM geliefert, Aufbewahrung nach Abschnitt 6                          | Betreiber                              | SIEM-Konfiguration, Aufbewahrungsjob                                                                                     |
| 11  | Vorfallverfahren mit den Fristen aus Abschnitt 7 und benannten Kontakten                                  | Betreiber, Zugangsstelle               | Verfahren, Kontaktliste, eine Tabletop-Übung                                                                             |
| 12  | Unabhängiger Penetrationstest des Hubs und der TR-03161-Test der App                                      | Betreiber, Eigentümer der App          | Berichte; Befunde geschlossen oder schriftlich akzeptiert                                                                |
| 13  | Zeitplan außerhalb der Bürozeiten entfernt; Replikate und Probes vorhanden                                | Betreiber                              | App-Definitionen                                                                                                         |
| 14  | Synthetische Daten aus dem Produktionsgraphen entfernt; Seeds deaktiviert; Demo-Schalter aus              | Betreiber                              | `MATCH (p:Patient) RETURN count(p)` entspricht der Zahl der Gesundheitsdateninhaber; `NEXT_PUBLIC_DEMO_TK` nicht gesetzt |
| 15  | Widerspruchsregister in die Richtlinienauswertung eingebunden                                             | Zugangsstelle, Betreiber               | Richtlinientest mit einem Datensatz mit Widerspruch                                                                      |
| 16  | Adresse für die Meldung von Schwachstellen veröffentlicht; Lieferantenliste mit Testaten                  | Betreiber                              | `SECURITY.md`, Lieferantenregister                                                                                       |

## 11. Was der Demonstrator nicht leistet

Damit niemand mehr hineinliest, als darin steckt:

- Er ist ein Mandant, ein Betreiber, eine Region, nachts angehalten.
- Seine Teilnehmer, Zugangsstellen und Patienten sind fiktiv; seine Nachweise
  werden von seinem eigenen Aussteller gegen kein Register ausgestellt.
- Er hat kein SIEM, keine WAF, keine kundenverwalteten Schlüssel, kein Backup des Graphen,
  keine MFA, und die sichere Verarbeitungsumgebung ist eine Reihe von Sichten auf dieselbe
  Datenbank, keine isolierte Umgebung (ADR-037 und ADR-052 halten fest, was
  bewertet wurde).
- Er hatte keinen unabhängigen Penetrationstest und keinen TR-03161-Test; der
  [Sicherheitstestbericht](security-test-report-2026-10-15.md) ist das Projekt,
  das sich selbst testet.
- Seine Verweise auf EHDS-Artikel sind teilweise die Nummern des Vorschlags; dieses
  Dokument verwendet die der verabschiedeten Fassung.

Was er hat, sind der Aufbau, die Rollen, die Protokollierung, die rollenbasierten
Identitätsregeln, die Konnektoren und die Exporte, die ein echter Betrieb
braucht, mit jeder Entscheidung als ADR festgehalten und jeder Aussage an einen Test gebunden.
Das macht ihn zu einer Referenz und nicht zu einem Produkt.

## Quellen

- Verordnung (EU) 2025/327 über den europäischen Gesundheitsdatenraum, ABl. L vom 5. März 2025.
- Verordnung (EU) 2016/679 (DSGVO), Art. 28, 33, 34, 35.
- Richtlinie (EU) 2022/2555 (NIS2) und ihre nationale Umsetzung.
- BSI, Kriterienkatalog Cloud Computing C5:2020.
- BSI, IT-Grundschutz-Kompendium, aktuelle Edition; BSI-Standards 200-1 bis 200-3.
- BSI TR-02102-1 und TR-02102-2, kryptographische Verfahren und TLS.
- BSI TR-03161, Sicherheitsanforderungen an digitale Gesundheitsanwendungen, Teile 1 bis 3.
- BSI TR-03116-4, kryptographische Vorgaben für Projekte der Bundesregierung, TLS.
- BSI TR-03107-1, elektronische Identitäten und Vertrauensdienste im E-Government.
- Dieses Repository: die oben zitierten ADRs, `docs/ehds-operating-company.md`,
  `docs/audit-retention-policy.md`, `docs/ehds-article-numbering.md`.
