---
source: docs/security/bsi-c5-gap-analysis.md
sourceHash: 09e0d014903c7a9c94c0d15df0d72be1ab532ba429c5804bcaf34cc64d921295
language: de
summary: "Der Hub gegen den Kriterienkatalog BSI C5:2020, für Art. 50 Abs. 6 EHDS."
---

# BSI-C5-Lückenanalyse: EHDS Integration Hub

**Standard**: BSI Kriterienkatalog Cloud Computing (C5:2020)
**Relevanz**: EHDS Art. 50(6) verlangt, dass von einer Zugangsstelle für Gesundheitsdaten (HDAB) genehmigte Datenräume C5 oder ein Äquivalent erfüllen.
**Umfang**: Bewertung von Demo/MVP. Ein vollständiges Produktionsaudit erfordert einen akkreditierten C5-Prüfer.

---

## Statuslegende

| Symbol | Bedeutung                            |
| ------ | ------------------------------------ |
| ✅     | Umgesetzt (Demo)                     |
| 🟡     | Teilweise umgesetzt                  |
| ⚠️     | Akzeptiertes Risiko für die Demo     |
| ❌     | Nicht anwendbar oder nicht umgesetzt |
| 🔵     | Nur Produktions-Roadmap              |

---

## C5-Kontrolldomänen

### OIS: Organisation und Informationssicherheit

| Kontrolle | Anforderung                | Demo-Status | Lücke / Maßnahme                             |
| --------- | -------------------------- | ----------- | -------------------------------------------- |
| OIS-01    | IS-Richtlinie dokumentiert | ✅          | Dieses Dokument + Bedrohungsmodell           |
| OIS-02    | IS-Rollen zugewiesen       | ⚠️          | Nur fiktive Personas; kein echter CISO       |
| OIS-03    | Risikobewertung            | ✅          | threat-model.md + STRIDE-Analyse             |
| OIS-04    | Inventar der Assets        | ✅          | Assets im Bedrohungsmodell aufgeführt        |
| OIS-05    | Sicherheit der Lieferanten | ⚠️          | Neo4j, Keycloak, NATS: nicht formal bewertet |

### CCM: Änderungsmanagement

| Kontrolle | Anforderung                       | Demo-Status | Lücke / Maßnahme                                |
| --------- | --------------------------------- | ----------- | ----------------------------------------------- |
| CCM-01    | Änderungsprozess dokumentiert     | ✅          | Git-Workflow + PR-Reviews                       |
| CCM-02    | Sicherheitsprüfung bei Änderungen | 🟡          | Diese Phase ergänzt Sicherheits-Gates in der CI |
| CCM-03    | Rollback-Plan                     | ✅          | Git revert + Docker-Image-Tags                  |

### DEV: Entwicklungssicherheit (für den Code am relevantesten)

| Kontrolle | Anforderung                            | Demo-Status | Lücke / Maßnahme                                     |
| --------- | -------------------------------------- | ----------- | ---------------------------------------------------- |
| DEV-01    | Richtlinien für sichere Programmierung | ✅          | `.claude/rules/code-style.md`                        |
| DEV-02    | Eingabevalidierung                     | ✅          | Parametrisierte Cypher-Abfragen                      |
| DEV-03    | Ausgabekodierung                       | 🟡          | React escapt automatisch; CSP in D2 ergänzt          |
| DEV-04    | Durchsetzung der Authentisierung       | ✅          | NextAuth + Keycloak OIDC                             |
| DEV-05    | Abhängigkeitsmanagement                | ✅          | `npm audit --audit-level=high` in der CI             |
| DEV-06    | Statische Analyse                      | 🟡          | ESLint + TypeScript strict; noch kein SAST-Werkzeug  |
| DEV-07    | Keine fest codierten Zugangsdaten      | ✅          | Nur Umgebungsvariablen; parametrisierte Abfragen     |
| DEV-08    | Scannen nach Geheimnissen              | ⚠️          | Noch kein `detect-secrets` oder `gitleaks` in der CI |
| DEV-09    | Sicherheitstests                       | ✅          | E2E-Tests SEC-01–SEC-10 (D3)                         |
| DEV-10    | Offenlegung von Schwachstellen         | ⚠️          | Noch keine SECURITY.md und keine CVD-Richtlinie      |

### IAM: Identitäts- und Zugriffsmanagement

| Kontrolle | Anforderung                        | Demo-Status | Lücke / Maßnahme                                                                                                                                         |
| --------- | ---------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM-01    | Authentisierung erforderlich       | ✅          | Alle Routen (UI + API) erfordern eine Sitzung; der Pentest D6 hat getServerSession-Prüfungen zu allen Routen /api/admin/_ und /api/patient/_ hinzugefügt |
| IAM-02    | Rollenbasierte Zugriffskontrolle   | ✅          | 7 Keycloak-Rollen + Middleware                                                                                                                           |
| IAM-03    | Minimale Rechte                    | 🟡          | Rollenmatrix umgesetzt; kein feingranulares ABAC                                                                                                         |
| IAM-04    | MFA für privilegierte Konten       | ⚠️          | Keycloak-MFA in der Demo nicht konfiguriert                                                                                                              |
| IAM-05    | Sitzungsverwaltung                 | ✅          | NextAuth-Sitzungen + NEXTAUTH_SECRET                                                                                                                     |
| IAM-06    | Lebenszyklus von Zugangsdaten      | ⚠️          | Demo-Zugangsdaten sind statisch                                                                                                                          |
| IAM-07    | Verwaltung privilegierter Zugriffe | ⚠️          | Admin-Rolle nur über Keycloak; kein PAM-System                                                                                                           |

### COS: Kommunikationssicherheit

| Kontrolle | Anforderung                         | Demo-Status                  | Lücke / Maßnahme                                                           |
| --------- | ----------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| COS-01    | Verschlüsselung bei der Übertragung | ✅ (lokal) / 🔵 (Produktion) | HTTPS in der Produktion; HTTP auf localhost für die Entwicklung akzeptabel |
| COS-02    | Starke TLS-Konfiguration            | ⚠️                           | Nicht validiert; hängt vom Reverse Proxy ab                                |
| COS-03    | Zertifikatsverwaltung               | 🔵                           | Nur Produktion: Zertifikatsrotation über Let's Encrypt                     |
| COS-04    | Segmentierung des internen Netzes   | ⚠️                           | Nur Netzwerkisolation durch Docker                                         |

### DIP: Datenintegrität und Datenschutz

| Kontrolle | Anforderung                     | Demo-Status | Lücke / Maßnahme                                           |
| --------- | ------------------------------- | ----------- | ---------------------------------------------------------- |
| DIP-01    | Datenklassifizierung            | ✅          | Asset-Tabelle des Bedrohungsmodells                        |
| DIP-02    | Verschlüsselung ruhender Daten  | ⚠️          | Neo4j-Daten in der Demo im Ruhezustand nicht verschlüsselt |
| DIP-03    | Sicherung und Wiederherstellung | ⚠️          | Kein Backup des Neo4j-Volumes in der Demo                  |
| DIP-04    | Datenminimierung                | ✅          | FHIR gibt nur angeforderte Felder zurück                   |
| DIP-05    | Audit-Protokollierung           | ✅          | `TransferEvent`-Knoten, geschrieben vom neo4j-proxy        |
| DIP-06    | Integrität der Protokolle       | ⚠️          | Protokolle sind in Neo4j veränderbar                       |

### LOG: Protokollierung und Überwachung

| Kontrolle | Anforderung                         | Demo-Status | Lücke / Maßnahme                                  |
| --------- | ----------------------------------- | ----------- | ------------------------------------------------- |
| LOG-01    | Sicherheitsereignisse protokolliert | 🟡          | Zugriffsprotokolle über Neo4j; kein SIEM          |
| LOG-02    | Aufbewahrung von Protokollen        | ⚠️          | Keine Aufbewahrungsrichtlinie; nur volumenbasiert |
| LOG-03    | Alarmierung bei Anomalien           | ❌          | Keine Alarmierung in der Demo                     |
| LOG-04    | Zugriffskontrolle für Protokolle    | ⚠️          | Neo4j-Admin kann Protokolle ändern                |

### INS: Vorfallmanagement

| Kontrolle | Anforderung                                     | Demo-Status | Lücke / Maßnahme                                |
| --------- | ----------------------------------------------- | ----------- | ----------------------------------------------- |
| INS-01    | Plan zur Reaktion auf Vorfälle                  | ⚠️          | Nicht dokumentiert                              |
| INS-02    | Klassifizierung von Sicherheitsvorfällen        | ⚠️          | Nicht definiert                                 |
| INS-03    | Prozess zur Meldung von Datenschutzverletzungen | ⚠️          | DSGVO Art. 33 verlangt eine Meldung binnen 72 h |

---

## Priorisierter Plan zum Schließen der Lücken

### Demo-Phase (jetzt umsetzen)

| Priorität | Kontrolle | Maßnahme                                                | Issue                              |
| --------- | --------- | ------------------------------------------------------- | ---------------------------------- |
| P0        | DEV-07    | Parametrisiertes Cypher (D1)                            | ✅ Erledigt: Phase 23              |
| P0        | DEV-03    | CSP + Sicherheits-Header (D2)                           | ✅ Erledigt: Phase 23              |
| P0        | DEV-09    | Sicherheits-E2E-Tests (D3)                              | ✅ Erledigt: Phase 23              |
| P0        | DEV-05    | npm audit in der CI (D4)                                | ✅ Erledigt: Phase 23              |
| P1        | DEV-08    | Pre-commit-Hook `detect-secrets` ergänzen               | GitHub #4: D5                      |
| P1        | DEV-10    | SECURITY.md + CVD-Richtlinie erstellen                  | GitHub #4: D8                      |
| P1        | IAM-01    | Prüfen, dass alle API-Routen die Authentisierung prüfen | ✅ Erledigt: Phase 24 (Pentest D6) |

### Produktions-Roadmap

| Priorität | Kontrolle | Maßnahme                                                               |
| --------- | --------- | ---------------------------------------------------------------------- |
| P0        | COS-01/02 | TLS 1.3 + HSTS + Zertifikatsrotation                                   |
| P0        | IAM-04    | MFA für EDC_ADMIN + HDAB_AUTHORITY                                     |
| P0        | DIP-02    | Festplattenverschlüsselung für Neo4j                                   |
| P1        | DEV-06    | SAST (CodeQL oder Semgrep) in der CI                                   |
| P1        | DEV-08    | gitleaks in der CI + Pre-commit                                        |
| P1        | LOG-01    | SIEM-Integration (OpenSearch / Loki)                                   |
| P1        | LOG-03    | Alarmierung bei fehlgeschlagener Authentisierung / auffälligem Zugriff |
| P2        | INS-01    | Runbook zur Reaktion auf Vorfälle                                      |
| P2        | DIP-06    | Nur anfügbares Audit-Log (Neo4j Enterprise oder Kafka)                 |
| P2        | IAM-03    | ABAC über OPA-Richtlinien                                              |
| P2        | DSP       | DID-signierte Vertragsnachrichten gemäß DSP §5.3                       |
| P2        | DCP       | Prüfung von VC-Signatur, Ablauf und Widerruf                           |

---

## Zuordnung zur EHDS-Regulierung

| EHDS-Artikel  | Anforderung                                              | C5-Kontrollen  | Demo-Status               |
| ------------- | -------------------------------------------------------- | -------------- | ------------------------- |
| Art. 3(1)     | Recht der Patientinnen und Patienten auf Zugang zu Daten | IAM-01, IAM-03 | ✅ Routen /patient/\*     |
| Art. 6        | Richtigkeit der Daten                                    | DIP-04, DIP-05 | 🟡                        |
| Art. 10       | Einwilligung zur Sekundärnutzung                         | IAM-02, DIP-01 | ✅ ODRL-Richtlinienknoten |
| Art. 45       | Genehmigung der HDAB erforderlich                        | IAM-02         | ✅ HDABApproval-Knoten    |
| Art. 50(6)    | C5 oder Äquivalent erforderlich                          | Alle Domänen   | 🟡 Demo teilweise         |
| Art. 51       | Audit-Trail                                              | LOG-01, DIP-05 | 🟡                        |
| DSGVO Art. 25 | Datenschutz durch Technikgestaltung                      | DIP-04, IAM-03 | 🟡                        |
| DSGVO Art. 32 | Technische Sicherheitsmaßnahmen                          | COS-01, DIP-02 | ⚠️                        |

---

_Zuletzt aktualisiert: 2026-03-28 | Phase 24: Pentest + Korrektur der API-Authentisierung (D6)_
_Nächste Prüfung: Vor jedem Produktions-Deployment oder jeder Einreichung zur HDAB-Akkreditierung._
