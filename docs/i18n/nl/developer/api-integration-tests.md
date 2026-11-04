---
source: docs/developer/api-integration-tests.md
sourceHash: 73ea4c43140a195c8743ad059aea7d2badba3731a9c248dae581d3fabd99ac50
language: nl
summary: De Bruno-collectie en de controles voor de dataspace, de identiteit en het domein: wat elke suite dekt, hoe u die uitvoert en of ze actueel is, met gemeten getallen.
---

# Integratietests via de API's

De hub wordt van buitenaf getest, zoals een partner hem zou gebruiken, door drie
suites die zijn HTTP-API's aanroepen: de Bruno-collectie voor de eigen routes van de hub,
en twee shell-suites voor het dataspaceprotocol en de identiteitslaag. Deze
pagina zegt wat elke suite dekt, hoe u die uitvoert en hoe actueel ze is, met de
getallen gemeten op 2026-11-03.

## De drie suites

| Suite                     | Wat ze aanroept                                                       | Uitvoeren met                              | Draait in CI                                                                     |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Bruno-collectie           | de `/api/*`-routes van de hub, plus de EDC-diensten en de Neo4j-proxy | `./scripts/run-api-tests.sh <environment>` | `bruno-smoke.yml` (PR's), `compliance.yml` (nachtelijk), `demo-smoke.yml` (live) |
| EHDS-dataspacecontroles   | de Management API en de DSP 2025-1-endpoints van het EDC-controlevlak | `./scripts/run-ehds-dataspace-checks.sh`   | `compliance.yml`, job "DSP 2025-1 TCK"                                           |
| EHDS-identiteitscontroles | IdentityHub, IssuerService en het controlevlak (DCP 1.0)              | `./scripts/run-ehds-identity-checks.sh`    | `compliance.yml`, job "DCP v1.0 Compliance"                                      |

Een vierde suite, `scripts/run-ehds-tests.sh`, controleert het gezondheidsdomein in de
graaf (FHIR, OMOP, HealthDCAT-AP, de toegangsketen van art. 53) via Neo4j
in plaats van via HTTP; `compliance.yml` voert die uit als "EHDS Health Domain".

Geen van de suites is de Eclipse TCK. Ze zijn van ons, ze sturen de API's aan met
`curl` of Bruno, en de DSP- en DCP-suites treden nooit op als protocolpeer, dus het
zijn controles op beschikbaarheid en vorm van onze eigen stack, geen bewijzen van conformiteit.
De echte [Eclipse DSP- en DCP-TCK's](https://github.com/eclipse-dataspacetck) invoeren
is fase 1 van [#338](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/338).
De [SDLC](../SDLC.md#63-protocol-compliance) bevat de geschiedenis van het waarom.

## De Bruno-collectie

`bruno/MVHDv2/` is geordend naar de persona die een verzoek verstuurt, één map
per rol van Verordening (EU) 2025/327, plus de tweezijdige procedures van
hoofdstuk IV, de rolgrenzen, en de protocol- en platformoppervlakken
([ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md)). Een partner
gebruikt de collectie om tegen de hub te oefenen.

| Map                       | Verzoeken | Draait tegen                          |
| ------------------------- | --------: | ------------------------------------- |
| 00 Public                 |         8 | Local, Azure-Dev                      |
| 01 Patient                |        22 | Local, Azure-Dev                      |
| 02 Data Holder            |        16 | Local, Azure-Dev                      |
| 03 Data User              |        14 | Local, Azure-Dev                      |
| 04 Access Body            |        13 | Local, Azure-Dev                      |
| 05 Dataspace Operator     |        30 | Local, Azure-Dev                      |
| 06 Trust Centre           |         3 | Local, Azure-Dev                      |
| 07 Journey - Data permit  |        16 | Local, Azure-Dev                      |
| 08 Journey - Data request |         5 | Local, Azure-Dev                      |
| 09 Access control         |        39 | Local, Azure-Dev                      |
| 10 Connecting partner     |        20 | Alleen Local (EDC is intern op Azure) |
| 11 Platform               |         6 | Alleen Local (de proxy is intern)     |
| 12 EUDI wallet            |         3 | Local met `BRUNO_EUDI=1`              |
| 13 Static export          |        32 | Alleen Static-mock                    |
| **Totaal**                |   **227** |                                       |

Een Local-run verstuurt dus 192 verzoeken, een Azure-Dev-run 166 en een Static-mock-run 32.

### Uitvoeren

```bash
./scripts/run-api-tests.sh Static-mock   # GitHub Pages fixtures, GET only, no secret needed
./scripts/run-api-tests.sh Local         # the compose stack on :3003
./scripts/run-api-tests.sh Azure-Dev     # the live hub, needs NEXTAUTH_SECRET
./scripts/run-api-tests.sh Local "07 Journey - Data permit"   # one folder
```

De runner smeedt per persona één NextAuth-sessie (`ui/scripts/forge-bruno-session.mjs`)
uit `NEXTAUTH_SECRET`, zodat geen enkel `.bru`-bestand ooit een cookie bevat. Voor `Local`
leest hij het geheim uit de UI-container als de variabele niet is gezet; voor
`Azure-Dev` exporteert u het zelf en het wordt nooit afgedrukt. Rapporten komen in
`test-results/bruno/` terecht (te wijzigen met `BRUNO_REPORT_DIR`): een samenvattende JSON die de
compliance-baseline leest, en HTML, JUnit en ruwe JSON onder `raw/`.

### De regels die een verzoek volgt

Uit [`.claude/rules/testing.md`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/.claude/rules/testing.md)
en [ADR-031](../ADRs/ADR-031-checks-must-assert.md):

- Het staat in de map van de persona die het verstuurt; een verzoek dat twee persona's
  versturen, hoort in een journeymap en noemt de handelende persona.
- Het controleert de status **en** ten minste één eigenschap van de body. Een verzoek
  waarvan de enige controle `res.status: lt 500` is, kan niet falen en wordt geweigerd.
- Een verzoek waarvan het onderwerp op een stack niet kan bestaan, wordt zichtbaar overgeslagen, met een test
  met de naam `SKIPPED: <reason>`. Het slaagt nooit stilzwijgend.
- Geen sessiecookie of andere inloggegevens in een `.bru`-bestand.

Drie scripts dwingen dit af in pre-commit en de PR Gate:

| Controle                          | Wat ervoor zorgt dat ze faalt                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `scripts/check-bruno-coverage.py` | een route zonder verzoek, een verzoek waarvan de route weg is, een verzoek zonder assert, inloggegevens              |
| `scripts/check-bruno-strength.py` | een 2xx-verzoek dat zwakker is dan `docs/bruno-soft-assertion-allowlist.txt` toestaat (alleen containertypen)        |
| `scripts/check-workflow-paths.py` | een workflow waarvan het `paths`-filter een script mist dat hij uitvoert, zodat een fix hem niet opnieuw zou starten |

### Zijn ze actueel?

Gemeten op 2026-11-03 tegen `main` op `b0586238`:

| Vraag                                     | Antwoord                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heeft elke route een verzoek?             | **Ja.** `check-bruno-coverage.py`: 109 geïmplementeerde routes, 109 met een verzoek (100 %), 0 op de allowlist zonder verzoek.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Kan elk verzoek falen?                    | **Ja.** Geen enkel verzoek mist een assert of een test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Zijn de succespaden sterk?                | **Gedeeltelijk.** `check-bruno-strength.py`: van 127 live 2xx-verzoeken controleren er 49 alleen een containertype; alle 49 staan op de allowlist, die als ratel werkt.                                                                                                                                                                                                                                                                                                                                                                             |
| Antwoordt de statische demo?              | **Ja.** `run-api-tests.sh Static-mock`: 32 geslaagd, 0 mislukt, 0 overgeslagen van 32 (99 asserties) tegen GitHub Pages.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Antwoordt de compose-stack? (CI, `main`)  | **Bijna.** `compliance.yml`-run [41586005794](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005794): 191 geslaagd, 1 mislukt van 192. De fout is `03 Data User/13 A dataset described in German` ("de titel staat er in het Engels en in het Duits"). De ondergrens is 179/0, dus de job Compliance Report faalt.                                                                                                                                                                                                        |
| Antwoordt de live hub? (`demo-smoke.yml`) | **Pas na de fix van 2026-11-03.** Run [41586005885](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005885): 30 geslaagd, 136 mislukt van 166, waarvan 163 met 401. Het geheim was juist; de cookie-jar van Bruno verving de sessieheader door de `acaAffinity`-cookie van de ingress ([gotchas](../gotchas.md), 2026-11-03). Met `--disable-cookies` haalde dezelfde run 165 van 166; de enige die overbleef is `03 Data User/07 Federated cohort statistics`, een 503 van de gefedereerde query. De ondergrens is 153/0. |
| DSP-controles (CI)                        | 25 geslaagd, 0 mislukt, 8 overgeslagen van 33, op de ondergrens van 25/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| DCP-controles (CI)                        | 27 geslaagd, 0 mislukt, 0 overgeslagen van 27, op de ondergrens van 27/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| EHDS-domeincontroles (CI)                 | 25 geslaagd, 0 mislukt, 5 overgeslagen van 30, boven de ondergrens van 18/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

De collectie is dus actueel ten opzichte van de code: elke route is gedekt en de
dekkingspoort houdt dat zo. Op 2026-11-03 waren beide resultaten op `main` rood; beide
zijn opgelost en worden gevolgd in
[#839](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/839). De
live run haalt 166 van 166 sinds #853, en de ondergrens ervan is 166/0 sinds #856.

## De compliance-baseline

Het resultaat van elke suite wordt vergeleken met een ondergrens in
[`scripts/compliance-baseline.json`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/compliance-baseline.json)
door `scripts/check-compliance-baseline.py`. De job faalt wanneer `passed` onder
de ondergrens zakt of `failed` erboven uitkomt, zodat een suite die nog niet slaagt
toch kan voorkomen dat het slechter wordt. Verhoog een ondergrens telkens wanneer een suite
verbetert; voor het verlagen ervan is een reden in de `note` nodig, en `review_by` laat een
ondergrens verlopen, zodat niemand hem eeuwig laag kan laten.

```bash
python3 scripts/check-compliance-baseline.py --results test-results
```

## De dataspace- en identiteitscontroles

Beide hebben de volledige JAD-stack nodig (zie [de stack en de omgeving](stack-and-environment.md))
met seedfasen 1 tot en met 7 afgerond.

```bash
./scripts/run-ehds-dataspace-checks.sh   # DSP: catalogue, negotiation, transfer, policy (33 checks)
./scripts/run-ehds-identity-checks.sh    # DCP: DIDs, keys, credentials, scopes, trust lists (27 checks)
```

Ze lezen `EDC_MANAGEMENT_URL`, `EDC_IDENTITY_URL` en `EDC_ISSUER_URL`, en
gebruiken standaard de compose-poorten. De identiteitscontroles starten en stoppen de
container `rogue-issuer` (compose-profiel `trust-check`) om te laten zien dat een
credential van een uitgever die op geen enkele vertrouwenslijst staat, wordt geweigerd. Op Azure draaien dezelfde
suites vanuit een ACA-job (`scripts/azure/08-compliance-runner.sh`,
`compliance.yml` gestart met `target: azure`), waar de controles die
in een container moeten kijken, worden overgeslagen.
