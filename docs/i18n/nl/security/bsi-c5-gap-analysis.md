---
source: docs/security/bsi-c5-gap-analysis.md
sourceHash: 09e0d014903c7a9c94c0d15df0d72be1ab532ba429c5804bcaf34cc64d921295
language: nl
summary: "De hub tegen de criteriacatalogus BSI C5:2020, voor art. 50, lid 6, EHDS."
---

# BSI C5-gapanalyse: EHDS-integratiehub

**Norm**: BSI Cloud Computing Compliance Criteria Catalogue (C5:2020)
**Relevantie**: EHDS art. 50, lid 6, vereist dat door een instantie voor toegang tot gezondheidsgegevens (HDAB) goedgekeurde dataspaces voldoen aan C5 of een gelijkwaardige norm.
**Reikwijdte**: Beoordeling van demo/MVP. Een volledige productieaudit vereist een geaccrediteerde C5-auditor.

---

## Legenda van de status

| Symbool | Betekenis                                   |
| ------- | ------------------------------------------- |
| ✅      | Geïmplementeerd (demo)                      |
| 🟡      | Gedeeltelijk geïmplementeerd                |
| ⚠️      | Geaccepteerd risico voor de demo            |
| ❌      | Niet van toepassing of niet geïmplementeerd |
| 🔵      | Alleen productieroadmap                     |

---

## C5-beheersdomeinen

### OIS: Organisatie en informatiebeveiliging

| Beheersmaatregel | Eis                             | Demostatus | Leemte / mitigatie                             |
| ---------------- | ------------------------------- | ---------- | ---------------------------------------------- |
| OIS-01           | IB-beleid gedocumenteerd        | ✅         | Dit document + dreigingsmodel                  |
| OIS-02           | IB-rollen toegewezen            | ⚠️         | Alleen fictieve persona's; geen echte CISO     |
| OIS-03           | Risicobeoordeling               | ✅         | threat-model.md + STRIDE-analyse               |
| OIS-04           | Inventaris van bedrijfsmiddelen | ✅         | Bedrijfsmiddelen vermeld in het dreigingsmodel |
| OIS-05           | Beveiliging van leveranciers    | ⚠️         | Neo4j, Keycloak, NATS: niet formeel beoordeeld |

### CCM: Wijzigingsbeheer

| Beheersmaatregel | Eis                                | Demostatus | Leemte / mitigatie                            |
| ---------------- | ---------------------------------- | ---------- | --------------------------------------------- |
| CCM-01           | Wijzigingsproces gedocumenteerd    | ✅         | Git-workflow + PR-reviews                     |
| CCM-02           | Beveiligingsreview bij wijzigingen | 🟡         | Deze fase voegt beveiligingspoorten in CI toe |
| CCM-03           | Terugdraaiplan                     | ✅         | Git revert + Docker-imagetags                 |

### DEV: Ontwikkelingsbeveiliging (het meest relevant voor code)

| Beheersmaatregel | Eis                                  | Demostatus | Leemte / mitigatie                                    |
| ---------------- | ------------------------------------ | ---------- | ----------------------------------------------------- |
| DEV-01           | Richtlijnen voor veilig programmeren | ✅         | `.claude/rules/code-style.md`                         |
| DEV-02           | Invoervalidatie                      | ✅         | Geparametriseerde Cypher-query's                      |
| DEV-03           | Uitvoercodering                      | 🟡         | React escapet automatisch; CSP toegevoegd in D2       |
| DEV-04           | Afdwingen van authenticatie          | ✅         | NextAuth + Keycloak OIDC                              |
| DEV-05           | Beheer van afhankelijkheden          | ✅         | `npm audit --audit-level=high` in CI                  |
| DEV-06           | Statische analyse                    | 🟡         | ESLint + TypeScript strict; nog geen SAST-tool        |
| DEV-07           | Geen hardgecodeerde inloggegevens    | ✅         | Alleen omgevingsvariabelen; geparametriseerde query's |
| DEV-08           | Scannen op geheimen                  | ⚠️         | Nog geen `detect-secrets` of `gitleaks` in CI         |
| DEV-09           | Beveiligingstests                    | ✅         | E2E-tests SEC-01–SEC-10 (D3)                          |
| DEV-10           | Openbaarmaking van kwetsbaarheden    | ⚠️         | Nog geen SECURITY.md of CVD-beleid                    |

### IAM: Identiteits- en toegangsbeheer

| Beheersmaatregel | Eis                                 | Demostatus | Leemte / mitigatie                                                                                                                                |
| ---------------- | ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM-01           | Authenticatie vereist               | ✅         | Alle routes (UI + API) vereisen een sessie; pentest D6 heeft getServerSession-controles toegevoegd aan alle /api/admin/_ en /api/patient/_ routes |
| IAM-02           | Rolgebaseerde toegangscontrole      | ✅         | 7 Keycloak-rollen + middleware                                                                                                                    |
| IAM-03           | Minimale rechten                    | 🟡         | Rollenmatrix geïmplementeerd; geen fijnmazige ABAC                                                                                                |
| IAM-04           | MFA voor geprivilegieerde accounts  | ⚠️         | Keycloak-MFA niet geconfigureerd in de demo                                                                                                       |
| IAM-05           | Sessiebeheer                        | ✅         | NextAuth-sessies + NEXTAUTH_SECRET                                                                                                                |
| IAM-06           | Levenscyclus van inloggegevens      | ⚠️         | Demo-inloggegevens zijn statisch                                                                                                                  |
| IAM-07           | Beheer van geprivilegieerde toegang | ⚠️         | Beheerdersrol alleen via Keycloak; geen PAM-systeem                                                                                               |

### COS: Communicatiebeveiliging

| Beheersmaatregel | Eis                             | Demostatus                   | Leemte / mitigatie                                                   |
| ---------------- | ------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| COS-01           | Versleuteling tijdens transport | ✅ (lokaal) / 🔵 (productie) | HTTPS in productie; HTTP op localhost aanvaardbaar voor ontwikkeling |
| COS-02           | Sterke TLS-configuratie         | ⚠️                           | Niet gevalideerd; afhankelijk van reverse proxy                      |
| COS-03           | Certificaatbeheer               | 🔵                           | Alleen productie: certificaatrotatie via Let's Encrypt               |
| COS-04           | Interne netwerksegmentatie      | ⚠️                           | Alleen isolatie via Docker-netwerk                                   |

### DIP: Gegevensintegriteit en -bescherming

| Beheersmaatregel | Eis                          | Demostatus | Leemte / mitigatie                                          |
| ---------------- | ---------------------------- | ---------- | ----------------------------------------------------------- |
| DIP-01           | Gegevensclassificatie        | ✅         | Tabel met bedrijfsmiddelen in het dreigingsmodel            |
| DIP-02           | Versleuteling in rust        | ⚠️         | Neo4j-gegevens in de demo niet versleuteld in rust          |
| DIP-03           | Back-up en herstel           | ⚠️         | Geen back-up van het Neo4j-volume in de demo                |
| DIP-04           | Minimale gegevensverwerking  | ✅         | FHIR retourneert alleen de opgevraagde velden               |
| DIP-05           | Auditlogging                 | ✅         | `TransferEvent`-knooppunten, geschreven door de neo4j-proxy |
| DIP-06           | Integriteit van logbestanden | ⚠️         | Logbestanden zijn wijzigbaar in Neo4j                       |

### LOG: Logging en monitoring

| Beheersmaatregel | Eis                               | Demostatus | Leemte / mitigatie                            |
| ---------------- | --------------------------------- | ---------- | --------------------------------------------- |
| LOG-01           | Beveiligingsgebeurtenissen gelogd | 🟡         | Toegangslogs via Neo4j; geen SIEM             |
| LOG-02           | Bewaren van logbestanden          | ⚠️         | Geen bewaarbeleid; alleen op basis van volume |
| LOG-03           | Waarschuwingen bij afwijkingen    | ❌         | Geen waarschuwingen in de demo                |
| LOG-04           | Toegangscontrole op logbestanden  | ⚠️         | Neo4j-beheerder kan logbestanden wijzigen     |

### INS: Incidentbeheer

| Beheersmaatregel | Eis                                      | Demostatus | Leemte / mitigatie                        |
| ---------------- | ---------------------------------------- | ---------- | ----------------------------------------- |
| INS-01           | Incidentresponsplan                      | ⚠️         | Niet gedocumenteerd                       |
| INS-02           | Classificatie van beveiligingsincidenten | ⚠️         | Niet gedefinieerd                         |
| INS-03           | Proces voor melding van inbreuken        | ⚠️         | AVG art. 33 vereist melding binnen 72 uur |

---

## Prioriteitenplan voor het dichten van leemtes

### Demofase (nu implementeren)

| Prioriteit | Beheersmaatregel | Actie                                                     | Issue                           |
| ---------- | ---------------- | --------------------------------------------------------- | ------------------------------- |
| P0         | DEV-07           | Geparametriseerde Cypher (D1)                             | ✅ Gereed: fase 23              |
| P0         | DEV-03           | CSP + beveiligingsheaders (D2)                            | ✅ Gereed: fase 23              |
| P0         | DEV-09           | Beveiligings-E2E-tests (D3)                               | ✅ Gereed: fase 23              |
| P0         | DEV-05           | npm audit in CI (D4)                                      | ✅ Gereed: fase 23              |
| P1         | DEV-08           | Pre-commit-hook `detect-secrets` toevoegen                | GitHub #4: D5                   |
| P1         | DEV-10           | SECURITY.md + CVD-beleid opstellen                        | GitHub #4: D8                   |
| P1         | IAM-01           | Controleren dat alle API-routes authenticatie controleren | ✅ Gereed: fase 24 (pentest D6) |

### Productieroadmap

| Prioriteit | Beheersmaatregel | Actie                                                                |
| ---------- | ---------------- | -------------------------------------------------------------------- |
| P0         | COS-01/02        | TLS 1.3 + HSTS + certificaatrotatie                                  |
| P0         | IAM-04           | MFA voor EDC_ADMIN + HDAB_AUTHORITY                                  |
| P0         | DIP-02           | Schijfversleuteling voor Neo4j                                       |
| P1         | DEV-06           | SAST (CodeQL of Semgrep) in CI                                       |
| P1         | DEV-08           | gitleaks in CI + pre-commit                                          |
| P1         | LOG-01           | SIEM-integratie (OpenSearch / Loki)                                  |
| P1         | LOG-03           | Waarschuwingen bij mislukte authenticatie / afwijkende toegang       |
| P2         | INS-01           | Runbook voor incidentrespons                                         |
| P2         | DIP-06           | Auditlog dat alleen kan worden aangevuld (Neo4j Enterprise of Kafka) |
| P2         | IAM-03           | ABAC via OPA-beleid                                                  |
| P2         | DSP              | Met DID ondertekende contractberichten volgens DSP §5.3              |
| P2         | DCP              | Controles van VC-handtekening + vervaldatum + intrekking             |

---

## Toewijzing aan de EHDS-regelgeving

| EHDS-artikel   | Eis                                          | C5-beheersmaatregelen | Demostatus                  |
| -------------- | -------------------------------------------- | --------------------- | --------------------------- |
| Art. 3, lid 1  | Recht van de patiënt op toegang tot gegevens | IAM-01, IAM-03        | ✅ /patient/\* routes       |
| Art. 6         | Juistheid van gegevens                       | DIP-04, DIP-05        | 🟡                          |
| Art. 10        | Toestemming voor secundair gebruik           | IAM-02, DIP-01        | ✅ ODRL-beleidsknooppunten  |
| Art. 45        | Goedkeuring door de HDAB vereist             | IAM-02                | ✅ HDABApproval-knooppunten |
| Art. 50, lid 6 | C5 of gelijkwaardig vereist                  | Alle domeinen         | 🟡 Demo gedeeltelijk        |
| Art. 51        | Audittrail                                   | LOG-01, DIP-05        | 🟡                          |
| AVG art. 25    | Privacy by design                            | DIP-04, IAM-03        | 🟡                          |
| AVG art. 32    | Technische beveiligingsmaatregelen           | COS-01, DIP-02        | ⚠️                          |

---

_Laatst bijgewerkt: 2026-03-28 | Fase 24: pentest + API-authenticatiefix (D6)_
_Volgende review: vóór elke productie-implementatie of indiening voor HDAB-accreditatie._
