---
source: docs/developer/api-integration-tests.md
sourceHash: 73ea4c43140a195c8743ad059aea7d2badba3731a9c248dae581d3fabd99ac50
language: de
summary: "Die Bruno-Sammlung und die Datenraum-, Identitäts- und Domänenprüfungen: was jede abdeckt, wie Sie sie ausführen und ob sie aktuell ist, mit gemessenen Zahlen."
---

# Integrationstests über die APIs

Der Hub wird von außen getestet, so wie ein Partner ihn nutzen würde, und zwar durch drei
Suiten, die seine HTTP-APIs aufrufen: die Bruno-Sammlung für die eigenen Routen des Hubs
und zwei Shell-Suiten für das Datenraumprotokoll und die Identitätsschicht. Diese
Seite beschreibt, was jede abdeckt, wie Sie sie ausführen und wie aktuell sie ist, mit den
am 2026-11-03 gemessenen Zahlen.

## Die drei Suiten

| Suite                    | Was sie aufruft                                                        | Ausführen mit                              | Läuft in CI                                                                    |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| Bruno-Sammlung           | die `/api/*`-Routen des Hubs, dazu die EDC-Dienste und den Neo4j-Proxy | `./scripts/run-api-tests.sh <environment>` | `bruno-smoke.yml` (PRs), `compliance.yml` (nächtlich), `demo-smoke.yml` (live) |
| EHDS-Datenraumprüfungen  | die Management API und die DSP-2025-1-Endpunkte der EDC-Control-Plane  | `./scripts/run-ehds-dataspace-checks.sh`   | `compliance.yml`, Job "DSP 2025-1 TCK"                                         |
| EHDS-Identitätsprüfungen | IdentityHub, IssuerService und die Control Plane (DCP 1.0)             | `./scripts/run-ehds-identity-checks.sh`    | `compliance.yml`, Job "DCP v1.0 Compliance"                                    |

Eine vierte Suite, `scripts/run-ehds-tests.sh`, prüft die Gesundheitsdomäne im
Graphen (FHIR, OMOP, HealthDCAT-AP, die Zugangskette nach Art. 53) über Neo4j
statt über HTTP; `compliance.yml` führt sie als "EHDS Health Domain" aus.

Keine der Suiten ist das Eclipse TCK. Es sind unsere eigenen, sie steuern die APIs mit
`curl` oder Bruno, und die DSP- und DCP-Suiten treten nie als Protokollgegenstelle auf. Sie
sind daher Erreichbarkeits- und Strukturprüfungen unseres eigenen Stacks, keine Konformitätsnachweise.
Die Einführung der echten [Eclipse-DSP- und -DCP-TCKs](https://github.com/eclipse-dataspacetck)
ist Phase 1 von [#338](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/338).
Der [SDLC](../SDLC.md#63-protocol-compliance) erläutert die Vorgeschichte.

## Die Bruno-Sammlung

`bruno/MVHDv2/` ist nach der Persona geordnet, die eine Anfrage sendet: ein Ordner
je Rolle der Verordnung (EU) 2025/327, dazu die zweiseitigen Verfahren aus
Kapitel IV, die Rollengrenzen sowie die Protokoll- und Plattformschnittstellen
([ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md)). Ein Partner
nutzt sie, um gegen den Hub zu proben.

| Ordner                    | Anfragen | Läuft gegen                          |
| ------------------------- | -------: | ------------------------------------ |
| 00 Public                 |        8 | Local, Azure-Dev                     |
| 01 Patient                |       22 | Local, Azure-Dev                     |
| 02 Data Holder            |       16 | Local, Azure-Dev                     |
| 03 Data User              |       14 | Local, Azure-Dev                     |
| 04 Access Body            |       13 | Local, Azure-Dev                     |
| 05 Dataspace Operator     |       30 | Local, Azure-Dev                     |
| 06 Trust Centre           |        3 | Local, Azure-Dev                     |
| 07 Journey - Data permit  |       16 | Local, Azure-Dev                     |
| 08 Journey - Data request |        5 | Local, Azure-Dev                     |
| 09 Access control         |       39 | Local, Azure-Dev                     |
| 10 Connecting partner     |       20 | nur Local (EDC ist auf Azure intern) |
| 11 Platform               |        6 | nur Local (der Proxy ist intern)     |
| 12 EUDI wallet            |        3 | Local mit `BRUNO_EUDI=1`             |
| 13 Static export          |       32 | nur Static-mock                      |
| **Summe**                 |  **227** |                                      |

Ein Local-Lauf sendet also 192 Anfragen, ein Azure-Dev-Lauf 166 und ein Static-mock-Lauf 32.

### Ausführen

```bash
./scripts/run-api-tests.sh Static-mock   # GitHub Pages fixtures, GET only, no secret needed
./scripts/run-api-tests.sh Local         # the compose stack on :3003
./scripts/run-api-tests.sh Azure-Dev     # the live hub, needs NEXTAUTH_SECRET
./scripts/run-api-tests.sh Local "07 Journey - Data permit"   # one folder
```

Der Runner erzeugt je Persona eine NextAuth-Sitzung (`ui/scripts/forge-bruno-session.mjs`)
aus `NEXTAUTH_SECRET`, sodass keine `.bru`-Datei je ein Cookie enthält. Für `Local`
liest er das Secret aus dem UI-Container, wenn die Variable nicht gesetzt ist; für
`Azure-Dev` exportieren Sie es selbst, und es wird nie ausgegeben. Berichte landen in
`test-results/bruno/` (überschreibbar mit `BRUNO_REPORT_DIR`): ein Zusammenfassungs-JSON, das die
Compliance-Baseline liest, sowie HTML, JUnit und Roh-JSON unter `raw/`.

### Die Regeln, denen eine Anfrage folgt

Aus [`.claude/rules/testing.md`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/.claude/rules/testing.md)
und [ADR-031](../ADRs/ADR-031-checks-must-assert.md):

- Sie liegt im Ordner der Persona, die sie sendet; eine Anfrage, die zwei Personas
  senden, gehört in einen Journey-Ordner und nennt die handelnde Persona.
- Sie prüft den Status **und** mindestens eine Eigenschaft des Bodys. Eine Anfrage,
  deren einzige Prüfung `res.status: lt 500` ist, kann nicht fehlschlagen und wird abgelehnt.
- Eine Anfrage, deren Gegenstand auf einem Stack nicht existieren kann, wird deutlich sichtbar
  übersprungen, mit einem Test namens `SKIPPED: <reason>`. Sie besteht nie stillschweigend.
- Kein Sitzungscookie und keine andere Anmeldeinformation in einer `.bru`-Datei.

Drei Skripte setzen dies in pre-commit und im PR Gate durch:

| Prüfung                           | Was sie scheitern lässt                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `scripts/check-bruno-coverage.py` | eine Route ohne Anfrage, eine Anfrage ohne Route, eine Anfrage ohne Assertion, eine Anmeldeinformation            |
| `scripts/check-bruno-strength.py` | eine 2xx-Anfrage, die schwächer prüft, als `docs/bruno-soft-assertion-allowlist.txt` erlaubt (nur Containertypen) |
| `scripts/check-workflow-paths.py` | ein Workflow, dessen `paths`-Filter ein Skript auslässt, das er ausführt, sodass ein Fix ihn nicht erneut startet |

### Sind sie aktuell?

Gemessen am 2026-11-03 gegen `main` bei `b0586238`:

| Frage                                      | Antwort                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hat jede Route eine Anfrage?               | **Ja.** `check-bruno-coverage.py`: 109 implementierte Routen, 109 mit Anfrage (100 %), 0 ohne Anfrage auf der Allowlist.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Kann jede Anfrage fehlschlagen?            | **Ja.** Keiner Anfrage fehlt eine Assertion oder ein Test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Sind die Erfolgspfade streng geprüft?      | **Teilweise.** `check-bruno-strength.py`: Von 127 aktiven 2xx-Anfragen prüfen 49 nur einen Containertyp; alle 49 stehen auf der Allowlist, die als Ratsche dient.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Antwortet die statische Demo?              | **Ja.** `run-api-tests.sh Static-mock`: 32 bestanden, 0 fehlgeschlagen, 0 übersprungen von 32 (99 Assertions) gegen GitHub Pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Antwortet der Compose-Stack? (CI, `main`)  | **Fast.** `compliance.yml`-Lauf [41586005794](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005794): 191 bestanden, 1 fehlgeschlagen von 192. Der Fehlschlag ist `03 Data User/13 A dataset described in German` ("the title is there in English and in German"). Die Untergrenze liegt bei 179/0, daher schlägt der Job Compliance Report fehl.                                                                                                                                                                                                          |
| Antwortet der Live-Hub? (`demo-smoke.yml`) | **Erst seit dem Fix vom 2026-11-03.** Lauf [41586005885](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005885): 30 bestanden, 136 fehlgeschlagen von 166, davon 163 mit 401. Das Secret war richtig; Brunos Cookie-Speicher ersetzte den Sitzungsheader durch das `acaAffinity`-Cookie des Ingress ([Gotchas](../gotchas.md), 2026-11-03). Mit `--disable-cookies` erreichte derselbe Lauf 165 von 166; die verbleibende Anfrage ist `03 Data User/07 Federated cohort statistics`, ein 503 aus der föderierten Abfrage. Die Untergrenze liegt bei 153/0. |
| DSP-Prüfungen (CI)                         | 25 bestanden, 0 fehlgeschlagen, 8 übersprungen von 33, auf der Untergrenze von 25/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| DCP-Prüfungen (CI)                         | 27 bestanden, 0 fehlgeschlagen, 0 übersprungen von 27, auf der Untergrenze von 27/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| EHDS-Domänenprüfungen (CI)                 | 25 bestanden, 0 fehlgeschlagen, 5 übersprungen von 30, über der Untergrenze von 18/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Die Sammlung ist also auf dem Stand des Codes: Jede Route ist abgedeckt, und das
Abdeckungs-Gate hält das so. Am 2026-11-03 waren beide Ergebnisse auf `main` rot; beide
sind behoben und werden in
[#839](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/839) verfolgt. Der
Live-Lauf erreicht seit #853 166 von 166, und seine Untergrenze liegt seit #856 bei 166/0.

## Die Compliance-Baseline

Das Ergebnis jeder Suite wird mit einer Untergrenze in
[`scripts/compliance-baseline.json`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/compliance-baseline.json)
verglichen, und zwar durch `scripts/check-compliance-baseline.py`. Der Job schlägt fehl, wenn `passed` unter die
Untergrenze fällt oder `failed` darüber steigt; so kann eine Suite, die noch nicht besteht,
trotzdem eine Verschlechterung verhindern. Heben Sie eine Untergrenze an, sobald sich eine Suite
verbessert; eine Absenkung braucht eine Begründung in ihrem `note`, und `review_by` lässt eine
Untergrenze ablaufen, damit niemand sie dauerhaft niedrig lassen kann.

```bash
python3 scripts/check-compliance-baseline.py --results test-results
```

## Die Datenraum- und Identitätsprüfungen

Beide brauchen den vollständigen JAD-Stack (siehe [den Stack und die Umgebung](stack-and-environment.md))
mit abgeschlossenen Seed-Phasen 1 bis 7.

```bash
./scripts/run-ehds-dataspace-checks.sh   # DSP: catalogue, negotiation, transfer, policy (33 checks)
./scripts/run-ehds-identity-checks.sh    # DCP: DIDs, keys, credentials, scopes, trust lists (27 checks)
```

Sie lesen `EDC_MANAGEMENT_URL`, `EDC_IDENTITY_URL` und `EDC_ISSUER_URL` und
verwenden standardmäßig die Compose-Ports. Die Identitätsprüfungen starten und stoppen den
Container `rogue-issuer` (Compose-Profil `trust-check`), um zu zeigen, dass ein
Nachweis eines Ausstellers, der auf keiner Vertrauensliste steht, abgelehnt wird. Auf Azure laufen dieselben
Suiten aus einem ACA-Job (`scripts/azure/08-compliance-runner.sh`,
`compliance.yml` mit `target: azure` gestartet), wobei die Prüfungen übersprungen werden, die
in einen Container hineinsehen müssen.
