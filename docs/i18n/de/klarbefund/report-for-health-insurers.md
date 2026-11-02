---
source: docs/klarbefund/report-for-health-insurers.md
sourceHash: 821e6839f6e4c6afb7b5fe7ead3e9e6b766be700275755cd2ba9f59988ae279a
language: de
---

# Klarbefund: Nachweisbericht für Krankenversicherungen

Stand 2026-10-15. Vom Projekt erstellt für eine gesetzliche oder private
Krankenversicherung, einen Krankenhausverbund oder einen ePA-Anbieter, die dieselben drei
Fragen stellen: _Ist die Extraktion richtig, sind die Daten sicher, und ist dies ein
Medizinprodukt?_ Alles hier wird von Werkzeugen erzeugt, die jede Person auf dem
Repository mit den angegebenen Befehlen ausführen kann, und jeder offene Punkt ist als
offen benannt. Die einseitige Fassung für eine Lenkungsrunde ist die Übersichtstabelle; der
Rest sind die Belege hinter jeder Zeile.

**Was angeboten wird.** Klarbefund ist eine Demo-Umgebung und eine Open-Source-Referenzimplementierung (Apache 2.0). Es ist kein Produkt mit einem Hersteller
dahinter. Was das Projekt einer Krankenversicherung anbietet, ist entweder eine **White-Label-Version** der App, unter dem Namen und in der Betreiberverantwortung der Krankenversicherung,
oder **technische Beratung**, um den Scanner, das Codierungswörterbuch
und den FHIR-Writer in eine ePA- oder EHR-App zu integrieren, die die Krankenversicherung bereits betreibt. Beide
Wege beginnen mit den folgenden Belegen.

## Übersicht

| Frage                           | Antwort, mit Beleg                                                                                                                                                                                                                                                                                | Status                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Liest sie Laborwerte richtig?   | Synthetischer Benchmark unter neun Scanbedingungen: 0 stille Fehler, 0 erfundene Werte, 50 von 72 Zeilen exakt; verschlechterte Scans verlieren Zeilen, sie zeigen nie einen falschen Wert. 1751 Analyt-Codierungen, 71 Einheiten, LOINC und UCUM.                                                | belegt, Pilot mit echten Befunden offen                     |
| Sind die Daten sicher?          | Standardmäßig auf dem Gerät, Face ID oder Gerätecode vor den Ergebnissen, AES-GCM pro Datensatz, Schlüssel im von der Secure Enclave gestützten Schlüsselbund, kein Paket Dritter, Apple Health nur lesend. CodeQL 0 Befunde, 0 bekannte Schwachstellen, 9 Posture-Tests, Bedrohungsmodell, SBOM. | selbst getestet, unabhängiger Test offen                    |
| Ist es ein Medizinprodukt?      | Zweckbestimmung: speichern, anzeigen, exportieren und erklären, was eine Messgröße ist; keine Diagnose, kein Urteil. Nach MDCG 2019-11 im Allgemeinen kein Medizinprodukt; die Einfärbung der Trends ist der Grenzfall, den das Projekt schriftlich festgehalten hat.                             | Position schriftlich festgehalten, externes Gutachten offen |
| Passt es zur ePA und zum EHDS?  | FHIR R4 mit LOINC, UCUM, SNOMED CT, CVX und ATC; die Testdatenbank enthält jetzt vier der fünf vorrangigen Kategorien nach EHDS Art. 14; der Hub exportiert die gesamte Akte in einem Bundle; das Wellness-Etikett nach Art. 47 gilt, wenn die App als interoperabel vermarktet wird.             | ja                                                          |
| Ist es eine DiGA?               | Nein, bewusst: Eine DiGA muss ein CE-gekennzeichnetes Medizinprodukt sein. Es werden keine DiGA-Zertifikate beansprucht.                                                                                                                                                                          | entfällt                                                    |
| Kann mein Team dies überprüfen? | Ja: Zu jeder Zahl gibt es einen Befehl, die Scans und Tests laufen auf einem Mac mit Xcode, und die API-Sammlung des Hubs (Bruno) probt die Integration.                                                                                                                                          | ja                                                          |

## 1. Was Klarbefund tut

Eine Person fotografiert einen Laborbefund oder öffnet das PDF des Labors.
Die App liest ihn auf dem Gerät, codiert jede Zeile mit LOINC und UCUM, behält
den gedruckten Referenzbereich, zeigt Trends über mehrere Befunde und exportiert die
Akte als FHIR R4, OMOP CDM, JSON oder PDF. Aus einem Foto gelesene Werte bleiben
`preliminary`, bis die Person sie prüft; nur die eigene PDF-Textebene eines Labors
ergibt `final`. Mit Einwilligung schreibt die App die Akte der Person
in ihr eigenes Konto auf dem EHDS-Demo-Hub und daneben Wochenmittelwerte aus Apple
Health. Ansonsten verlässt nichts das Telefon.

Details: [`README.md`](README.md) (für Nutzerinnen und Nutzer),
[`clients/ios/README.md`](../../clients/ios/README.md) (Entwicklung),
[`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md).

## 2. Genauigkeit

Das Maß ist `ExtractionAccuracy`: ein Feld-für-Feld-Vergleich mit einer
von Hand geprüften Wahrheit, Wert, Einheit, Code, Referenzbereich und Datum. Die klinisch
entscheidende Zahl sind die **stillen Fehler**, Zeilen, die die App als Wert angezeigt
und falsch erfasst hat; der Benchmark stellt null unter jeder Bedingung sicher.

| Bedingung                  | Gefunden | Exakt | Stille Fehler | Unecht |
| -------------------------- | -------: | ----: | ------------: | -----: |
| sauberer Scan mit 150 dpi  |        8 |     8 |             0 |      0 |
| 1 Grad schräg              |        8 |     8 |             0 |      0 |
| 2 Grad schräg              |        7 |     5 |             0 |      0 |
| 5 Grad schräg              |        5 |     0 |             0 |      0 |
| dunkler Raum               |        8 |     8 |             0 |      0 |
| Blitzreflex                |        8 |     8 |             0 |      0 |
| leichte Bewegungsunschärfe |        7 |     7 |             0 |      0 |
| starke Unschärfe           |        0 |     0 |             0 |      0 |
| niedrige Auflösung         |        7 |     6 |             0 |      0 |
| **alle neun**              |       58 |    50 |         **0** |  **0** |

Synthetische Blätter mit je 8 Zeilen, gelesen mit Apple Vision, 2026-10-15
([`accuracy-benchmark.json`](accuracy-benchmark.json)). Ein Pilot mit echten
Befunden, mit schriftlicher Einwilligung und bei dem nur Zählwerte den Ordner der teilnehmenden
Person verlassen, ist konzipiert ([`evidence.md`](evidence.md#measuring-accuracy)) und
noch nicht durchgeführt; ein eigener Pilot einer Krankenversicherung ist der naheliegende nächste Schritt.

## 3. Sicherheit und Datenschutz

| Ebene                | Was getan wurde                                                                                                                                                                                         | Ergebnis, 2026-10-15                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Statische Analyse    | CodeQL über die App (82 Swift-Dateien); CodeQL und Semgrep über den Hub in der CI                                                                                                                       | 0 Befunde                                                                                         |
| Abhängigkeiten       | CycloneDX-Stücklisten für die App und jeden Hub-Dienst ([`docs/sbom/`](../sbom/README.md)); grype und npm audit dagegen                                                                                 | 0 bekannte Schwachstellen; die App hat 0 Pakete Dritter                                           |
| Geheimnisse          | gitleaks über den Baum und die letzten 200 Commits                                                                                                                                                      | 0 nach Prüfung                                                                                    |
| Container, Manifeste | trivy über Dockerfiles und Kubernetes-Manifeste                                                                                                                                                         | 0 HIGH nach zwei Korrekturen; 2 MEDIUM, 12 LOW akzeptiert oder offen                              |
| Build-Konfiguration  | `SecurityPostureTests`: Entitlements, Privacy Manifest, ATS, Kryptographie, PKCE, HealthKit nur lesend, Exportkonformität                                                                               | 11 von 11 bestanden                                                                               |
| Bedrohungsmodell     | STRIDE für die App ([`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md)) neben dem des Hubs                                                                                          | geschrieben; Restrisiken aufgeführt                                                               |
| Live-Hub, von außen  | 40 anonyme Black-Box-Prüfungen: Routen-Zugangskontrollen, Weiterleitungen, Header, TLS, Keycloak-Konsole                                                                                                | TLS- und Konsolenprüfungen bestanden; Prüfungen der Zugangskontrollen brauchen die Betriebszeiten |
| DSGVO                | Art. 25 durch Voreinstellungen, Art. 5 Minimierung, Art. 6/9 Einwilligungen, Art. 15/17/20 Rechte: im Code erfüllt; Transparenz und Übermittlungen teilweise; DSFA und Rolle des Verantwortlichen offen | siehe [`self-assessment.md`](self-assessment.md)                                                  |
| BSI TR-03161 Teil 1  | Nach Prüfzielgruppe bewertet: 9 erfüllt, 3 teilweise, 1 offen (Widerstandsfähigkeit, mit Begründung abgelehnt in ADR-060), 2 entfallen                                                                  | Grundlage für die Lückenanalyse eines Prüflabors                                                  |

Die vollständige Methode, die Befunde und die Korrekturen stehen in
[`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md).
Es ist das Projekt, das sich selbst testet. Ein unabhängiger Penetrationstest, den
eine Krankenversicherung zu Recht verlangen wird, ist dort mit dem aufgeführt, was er ergänzen würde.

## 4. Regulatorische Position

| Rahmenwerk           | Position                                                                                                                                                                                                                                                                                                                                                                         | Offen                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| MDR / IVDR           | Speichern, Anzeigen, Exportieren und Erklären, was eine Messgröße ist; keine Diagnose, kein Risikowert und keine Therapieempfehlung. Nach MDCG 2019-11 Rev.1 im Allgemeinen kein Medizinprodukt. Der Trendbildschirm färbt Werte gegenüber veröffentlichten, belegten Bereichen ein; die Position des Projekts ist, dass ein Vergleich mit einer zitierten Zahl kein Befund ist. | schriftliche Qualifizierung, externes Gutachten |
| DiGA (§ 139e SGB V)  | Nicht anwendbar; bewusst kein Medizinprodukt                                                                                                                                                                                                                                                                                                                                     | keiner                                          |
| KI-Verordnung der EU | Kein Hochrisiko-System, solange kein Medizinprodukt; jede Antwort, auf dem Gerät oder gehostet, nennt ihren Anbieter und ihr Modell (Art. 50)                                                                                                                                                                                                                                    | keiner                                          |
| EHDS 2025/327        | Art. 3 Zugang zur Akte mit Einwilligung; Wellness-Etikett nach Art. 47, wenn als interoperabel mit EHR-Systemen vermarktet                                                                                                                                                                                                                                                       | Etikettentext bei Vermarktung                   |
| Apple                | TestFlight-Beta für externe Tester freigegeben; App-Datenschutz-Etikett: Gesundheitsdaten, nicht verknüpft, nicht für Tracking verwendet                                                                                                                                                                                                                                         | keiner                                          |

## 5. Die Testdatenbank und die Arten von Ergebnissen, die sie enthält

Der Demo-Hub läuft mit 127 synthetischen Patientinnen und Patienten (Synthea) und zusätzlich von Hand angelegten
Akten, in einem Neo4j-Graphen, der FHIR R4 und OMOP CDM abbildet. Am 2026-10-15
kamen die vier Ergebnistypen hinzu, nach denen ein ePA-Integrator zuerst fragt (ADR-059).

| Ergebnistyp                                     | Codierung            | In der App      | In der Testdatenbank | Wie ein Integrator sie erhält                    |
| ----------------------------------------------- | -------------------- | --------------- | -------------------- | ------------------------------------------------ |
| Labor, Blut und Urin                            | LOINC, UCUM          | ja              | ja                   | `/api/patient/observations`, FHIR-Bundle         |
| Ruhe-EKG, Holter                                | LOINC 11524-6, EC    | ja              | **neu**              | `include=all`, DiagnosticReport mit Observations |
| Spirometrie, CPET, Belastungstest, Laktat       | LOINC, PF und EC     | ja              | geplant              |                                                  |
| DXA-Körperzusammensetzung                       | LOINC 38269-7, RAD   | ja              | geplant              |                                                  |
| Kontinuierliche Glukosemessung                  | LOINC 107930-0       | ja              | geplant              |                                                  |
| 24-h-Blutdruck, Geräteanzeigen                  | LOINC                | ja              | geplant              |                                                  |
| Wochenmittelwerte von Wearables                 | LOINC                | ja              | ja                   | von der App geschrieben (ADR-057)                |
| Bildgebungsbefunde (Röntgen, Echo, Ultraschall) | LOINC, RAD           | nein (Freitext) | **neu**              | `include=all`, DiagnosticReport mit Beurteilung  |
| Impfnachweis                                    | CVX                  | nein            | **neu**              | `include=all`, Immunization                      |
| Medikationsplan (BMP)                           | ATC, Dosierung 1-0-1 | nein            | **neu**              | `include=all`, MedicationStatement               |
| Diagnosen, Medikamente                          | SNOMED CT, RxNorm    | über den Hub    | ja                   | Profil-API, `$everything`                        |

Kandidaten danach, nach Kategorie gemäß EHDS Art. 14: Mikrobiologie, Allergie-Panels, Genetik (Laborergebnisse); Pathologie, Schlaflaboruntersuchungen, EKG-Freitextbefunde (Befundberichte); patientenberichtete Ergebnisse und Entlassbriefe
(Patientenkurzakte, Entlassungsberichte). Jeder ist eine Seed-Datei und ein Mapper.

Probe: `bruno/MVHDv2/01 Patient/06 My whole record` ruft das Bundle
mit allen vier Kategorien ab und schlägt deutlich fehl, wenn eine Kategorie fehlt.

## 6. Integrationswege

1. **White-Label-App.** Die App, wie sie ist, umbenannt und signiert von der Krankenversicherung,
   mit der Krankenversicherung als Betreiber: Datenschutzerklärung, DSFA, Auftragsverarbeitungsvertrag
   für den gehosteten Erklärdienst (standardmäßig Azure OpenAI, EU-Datenzone)
   und das Apple-Konto. Der Code bleibt Open Source.
2. **Komponenten in eine bestehende ePA- oder EHR-App.** Das Swift-Paket `Shared`
   (Scannen, das Wörterbuch mit 1751 Codierungen, Provenienz, FHIR- und OMOP-Writer, Einwilligungen) hat keine Abhängigkeit von Dritten und ist durch 419
   Tests abgedeckt; es lässt sich in eine bestehende iOS-App einfügen. Dasselbe Wörterbuch gibt es in
   TypeScript (`services/epa-ingest`) für einen serverseitigen Weg.
3. **Nur auf Seite des Hubs.** Die Plattform einer Krankenversicherung liest die Akte als FHIR R4
   aus der API des Hubs oder führt die ePA-Ingest-CLI gegen PDFs aus, die sie bereits
   hält, ohne die App.

Auf jedem Weg trägt die Krankenversicherung die Datenschutzrollen; das Projekt
liefert die Vorlagen und die Belege.

## 7. Was noch offen ist

| Punkt                                                                      | Wer ihn schließt                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Unabhängiger Penetrationstest, TR-03161-Lückenliste                        | ein vom BSI anerkanntes Prüflabor                     |
| Genauigkeit im Pilot mit echten Befunden                                   | der Pilot der Krankenversicherung, mit Einwilligungen |
| Schriftliche MDR-Qualifizierung, externes Gutachten                        | regulatorische Rechtsberatung                         |
| DSFA, Verzeichnis von Verarbeitungstätigkeiten, Rolle des Verantwortlichen | der Betreiber                                         |
| Abschnitte der Profilseite für die neuen Ergebnistypen                     | das Projekt                                           |
| Swift-Suite in der CI (braucht Workflow-Rechte)                            | der Repository-Eigentümer                             |

## 8. Selbst überprüfen

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2 && cd MinimumViableHealthDataspacev2
cd clients/ios && swift test                                   # 419 tests, incl. the benchmark and the posture tests
cd ../.. && scripts/security/scan-repo.sh                      # SBOM check, grype, trivy, gitleaks, semgrep, hadolint, npm audit
scripts/security/check-hub-blackbox.sh                         # the live hub from outside, office hours Mon-Fri 05:17-18:13 UTC
./scripts/run-api-tests.sh Local "01 Patient"                  # the record as an integrator receives it
```

Dokumente: [`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md),
[`run-on-mac.md`](run-on-mac.md), [`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md),
[`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md),
[ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md).
