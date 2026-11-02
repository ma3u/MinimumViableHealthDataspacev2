---
source: docs/security/threat-model.md
sourceHash: 7dd719e1cad0af1761954b2a7e3ec54002d86543fc9ac430bca41b4230ef456c
language: nl
---

# Dreigingsmodel: de EHDS Integration Hub

STRIDE, voor de hub zoals die draait op Azure Container Apps: de UI en haar
API (Next.js 15), Keycloak 26.8, de neo4j-proxy, de EDC-V-connectoren met hun
IdentityHub en IssuerService, Neo4j 5.26 en de PostgreSQL Flexible Server.
Geschreven op 2026-10-16; elke maatregel noemt de code, de test of het besluit
dat hem aantoont. De app die met de hub verbindt, heeft een eigen model,
[`threat-model-klarbefund.md`](threat-model-klarbefund.md). Wat het project
heeft getest en gevonden, staat in het
[beveiligingstestrapport](security-test-report-2026-10-15.md); hoe het
platform voor echte gegevens zou worden beheerd, beschrijft de
[operationele richtlijn](operational-guideline.md).

De gegevens op de hub zijn synthetisch: 127 gegenereerde patiënten, fictieve
organisaties, vervalste sessies voor belastingtests. De onderstaande dreigingen
worden beoordeeld alsof de gegevens echt waren, omdat de hub een
referentie-implementatie is voor een platform dat echte gegevens zal bevatten;
waar een maatregel voldoende is voor de demo maar niet voor echte gegevens,
vermeldt de tabel dat.

## Hoe u dit model leest

STRIDE stelt zes vragen bij elke gegevensstroom: kan de afzender worden
vervalst, kunnen de gegevens worden gemanipuleerd, kan de handeling worden
ontkend, kan informatie worden openbaar gemaakt, kan de dienst worden
geweigerd, kunnen bevoegdheden worden verhoogd? De systeemcontext in sectie 1
nummert de gegevensstromen en de vertrouwensgrenzen die ze overschrijden; de
sequentie in sectie 3 toont één volledige uitwisseling met de id van elke
dreiging bij de stap waar die zou optreden; de zes tabellen bevatten
vervolgens één rij per dreiging met de stroom waarop die ligt, de status en de
maatregel met het bewijs. Het bewijs is een bestand, een test, een script of
een besluit in deze repository, zodat elke rij kan worden gecontroleerd
zonder iemand iets te vragen.

Er worden vier aanvallers verondersteld, en elke rij noemt er via haar stroom
impliciet ten minste één:

| Aanvaller                         | Bereikt                                                         | Heeft                                                                     | Wil                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Iedereen op internet              | B1: de pagina's en de API van de hub, het inloggen bij Keycloak | Niets; of een gelekte cookie, token of wachtwoord                         | Het dossier van een patiënt, een sessie, de beheerconsole, het platform offline                                                    |
| Een ingelogde deelnemer           | B1 met een geldige sessie, in zijn rol                          | Een legitiem account in één rol                                           | Gegevens buiten zijn rol of zijn gegevensvergunning, het dossier van een andere patiënt, meer gewicht dan zijn rate limit toestaat |
| Een peer-connector                | B2 via het openbare control plane                               | Zijn eigen DID en bewijsstukken; vervalste of gestolen                    | Een contract waarop hij geen recht heeft, gegevens zonder overeenkomst, een valse identiteit                                       |
| Een insider met beheerdersrechten | B2 en B3 via `az`, `gh` en de scripts                           | Rechten op het abonnement, de deploy-identiteit, het beheerderswachtwoord | Secrets, een onopgemerkte wijziging, een gewiste audittrail                                                                        |

Een vijfde, de toeleveringsketen, heeft geen eigen stroom: een gecompromitteerde
afhankelijkheid of image komt binnen via de deploy (F7) en wordt behandeld
onder Tampering (manipulatie) (T-07).

## 1. Systeemcontext: gegevensstromen en vertrouwensgrenzen

![De gegevensstromen en vertrouwensgrenzen van de hub: buiten de mensen, de app, een peer-connector en de beheerder; de UI en Keycloak achter de internetgrens; de proxy, de connectoren, de crawler en de observability binnen de omgeving; Neo4j, PostgreSQL, Vault en Key Vault achter de gegevensgrens; eenentwintig genummerde stromen](img/hub-trust-boundaries.svg)

Bron: [`diagrams/hub-trust-boundaries.puml`](diagrams/hub-trust-boundaries.puml),
gerenderd met `scripts/render-plantuml.sh`.

Drie grenzen, en wat het overschrijden van elk ervan betekent:

| Grens                   | Wie er een verzoek overheen kan sturen                | Wat de identiteit aantoont                                                                  |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| B1, de internetgrens    | Iedereen                                              | De sessiecookie (NextAuth JWT), een bearer-token van Keycloak of een DCP-bewijsstuk         |
| B2, de omgeving         | De eigen apps en jobs van de hub, via interne ingress | De aanroeperheader die de hub zet (`X-Caller`), het catalogustoken, de DID van de connector |
| B3, gegevens en secrets | Alleen de omgeving                                    | De managed identity (Key Vault-verwijzingen), het Vault-token, de databasereferenties       |

De genummerde stromen (F1 tot en met F21) zijn waarnaar de STRIDE-tabellen
verwijzen. De belangrijkste, en waarom:

| Stroom             | Wat er overgaat                                              | Waarom juist deze in de gaten moet worden gehouden                                                                                    |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| F1                 | Elk pagina- en API-verzoek, met de sessiecookie              | De enige weg die een anonieme aanvaller naar de gegevens heeft; elke route erachter vereist een sessie (ADR-044)                      |
| F2, F8             | Inloggen en de tokenuitwisseling met Keycloak                | Een vervalst token of een token met te ruime scope is een vervalste identiteit voor alles verderop                                    |
| F3, F4             | Het bearer-token van de app en het aanmaken van haar account | Een telefoon valt buiten ieders controle; App Attest zorgt dat alleen de echte app accounts kan aanmaken                              |
| F5                 | DSP en DCP tussen connectoren                                | De enige stroom waarin software van een onbekende bewust met de onze praat; de identiteit is de DID en het bewijsstuk, niet een login |
| F9                 | De aanroep van de hub naar de proxy, met de aanroeperheader  | De proxy vertrouwt de header omdat alleen de hub hem kan bereiken; de grens B2 maakt dat vertrouwen gegrond                           |
| F10, F11           | De beheer-API en het catalogustoken                          | Volledige controle over de connectoren; interne ingress en één token in Key Vault vormen de hele verdediging                          |
| F14, F15           | Lees- en schrijfacties op de graaf, en de auditrecords       | Waar de patiëntgegevens en het bewijs zich bevinden; geparametriseerde query's en de hashketen zijn de controles                      |
| F19 tot en met F21 | Sleutels en secrets                                          | Vault, zijn verzegelde toestand en Key Vault; niets hiervan wordt ooit naar een app gekopieerd                                        |

## 2. Assets

| Asset                                                                                         | Gevoeligheid | Waar het staat                                         | Opmerkingen                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Patiëntdossiers (FHIR, OMOP)                                                                  | Hoog         | Neo4j (B3)                                             | Vandaag synthetisch; het model behandelt ze als echt                                                     |
| Wie wiens dossier heeft gelezen, de auditketen                                                | Hoog         | Neo4j, met hashketen (B3)                              | Regelgevend bewijs (art. 73); tien jaar ([bewaarbeleid](../audit-retention-policy.md))                   |
| Ondertekeningssleutels van deelnemers                                                         | Hoog         | Vault, toestand op de Flexible Server (B3)             | Verlaten Vault nooit; ADR-046                                                                            |
| Beheerderssecrets: `NEXTAUTH_SECRET`, database- en beheerderswachtwoorden, het catalogustoken | Hoog         | Azure Key Vault, waarnaar de apps verwijzen (B3)       | ADR-036; het live `NEXTAUTH_SECRET` is geroteerd nadat het een gepubliceerde standaardwaarde was geweest |
| Sessies en tokens                                                                             | Hoog         | Cookie in de browser, bearer in de app                 | NextAuth JWT; access- en refresh-tokens van Keycloak                                                     |
| Verifieerbare bewijsstukken en gegevensvergunningen                                           | Middel       | IdentityHub (B2)                                       | Lidmaatschap, EHDS-deelnemer, doel, kwaliteitslabel, de gegevensvergunning als bewijsstuk                |
| Contracten, overdrachten, taken                                                               | Middel       | EDC-toestand in PostgreSQL (B3), gespiegeld naar Neo4j | ODRL-beleid, overeenkomsten, `TransferEvent`-knooppunten                                                 |
| Catalogusmetadata                                                                             | Laag         | Neo4j, de connectoren                                  | HealthDCAT-AP; bewust openbaar                                                                           |
| Het graafschema en de code                                                                    | Laag         | GitHub, openbaar                                       | De documentatie is het schema                                                                            |

## 3. STRIDE

![Eén gegevensuitwisseling als sequentie, met de STRIDE-id van elke dreiging bij de stap waar die ligt: inloggen en verzoek via de hub, daarna de DSP-onderhandeling en de controle van het DCP-bewijsstuk in de connectoren, daarna de overdracht en het auditrecord](img/hub-exchange-threats.svg)

Bron: [`diagrams/hub-exchange-threats.puml`](diagrams/hub-exchange-threats.puml).

Status: **Gesloten** betekent dat een test of een buildinstelling het
vastlegt; **Aanwezig** betekent dat de code het doet en een test het indirect
uitoefent; **Demo** betekent voldoende voor synthetische gegevens en benoemd
als open voor echte gegevens; **Open** betekent dat nog niets het doet.

### Spoofing (vervalsing van identiteit)

| ID   | Dreiging                                               | Stroom | Status   | Maatregel en bewijs                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------ | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | Een connector doet zich voor als een deelnemer         | F5     | Aanwezig | `did:web`-resolutie tegen het DID-document van de IdentityHub, één per deelnemer; de DCP-presentatie bevat het lidmaatschapsbewijs (ADR-007, ADR-009). Gecontroleerd door `scripts/run-ehds-identity-checks.sh` bij elke pull request.                                                                                                                                     |
| S-02 | Een vervalste sessie bereikt een API-route             | F1     | Gesloten | NextAuth JWT ondertekend met `NEXTAUTH_SECRET` uit Key Vault; `requireAuth()` in elke handler, vastgelegd door `ui/__tests__/unit/api/every-route-needs-a-session.test.ts` (ADR-044).                                                                                                                                                                                      |
| S-03 | Een opnieuw afgespeelde presentatie van een bewijsstuk | F5     | Aanwezig | De DCP-implementatie van EDC-V koppelt de presentatie aan het verzoek; de DCP-controles van `compliance.yml` voeren het uit. Niet opnieuw geverifieerd door de hub zelf.                                                                                                                                                                                                   |
| S-04 | Overname van de Keycloak-realm of -console             | F2, F6 | Gesloten | De beheerconsole is niet bereikbaar vanaf internet (`guard-keycloak-console.sh`, F10 van het testrapport); het beheerderswachtwoord staat in Key Vault; de realm staat onder versiebeheer en wordt op afwijkingen gecontroleerd ([runbook](../knowledge/runbooks/keycloak-realm-drift.md)). MFA op het admin-account is een zaak van de beheerder (richtlijn, identiteit). |
| S-05 | Een nep-Klarbefund maakt accounts aan                  | F3     | Aanwezig | Het aanmaken van een account beantwoordt alleen een verzoek waarvan de Apple App Attest-attestatie verifieert (ADR-054); de challenge is ondertekend en vijf minuten geldig.                                                                                                                                                                                               |

### Tampering (manipulatie)

| ID   | Dreiging                                                                   | Stroom   | Status   | Maatregel en bewijs                                                                                                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-01 | Cypher-injectie                                                            | F14, F15 | Gesloten | Overal geparametriseerde Cypher; de NLQ-engine weigert een query die de identiteit van een patiënt zou lezen, tenzij de UI aangeeft dat de rol dat mag (`revealsPatientIdentity()`); tests in `services/neo4j-proxy/__tests__/`.                                         |
| T-02 | Contractvoorwaarden onderweg gewijzigd                                     | F5       | Aanwezig | TLS aan de rand; de overeenkomst wordt ondertekend door de connector van de aanbieder. Wederzijds geauthenticeerde DSP-endpoints zijn een punt van de richtlijn voor echte gegevens.                                                                                     |
| T-03 | Een vervalste claim in een bewijsstuk                                      | F5       | Aanwezig | Bewijsstukken worden uitgegeven en geverifieerd door de IssuerService en de IdentityHub (EDC-V); de hub toont, hij ondertekent niet opnieuw. Een HSM voor de sleutel van de uitgever is een punt van de richtlijn.                                                       |
| T-04 | Cross-site request forgery bij een mutatie                                 | F1       | Aanwezig | Sessiecookie met `SameSite=Lax` (NextAuth); de CSP verbiedt inline scripts; geen enkele mutatie leest haar parameters uit een GET.                                                                                                                                       |
| T-05 | Een toestandssprong in de onderhandeling                                   | F5       | Aanwezig | De toestandsmachines bevinden zich in het control plane van EDC-V (REQUESTED, AGREED, FINALIZED; overdrachten REQUESTED tot COMPLETED) en worden via leases in PostgreSQL beheerd; de hub spiegelt, hij stuurt niet aan. De DSP 2025-1 TCK draait bij elke pull request. |
| T-06 | De audittrail wordt bewerkt                                                | F15      | Gesloten | Elk record draagt de hash van zijn voorganger, SHA-256 over canonieke JSON; `verifyChain()` meldt elke wijziging, verwijdering of herschikking (ADR-045, `audit-chain.ts`). Beide ketens waren na elke belastingrun intact.                                              |
| T-07 | Een wijziging in de toeleveringsketen, in een afhankelijkheid of een image | F7       | Gesloten | Eén CycloneDX-SBOM per onderdeel, gecontroleerd tegen de lockfiles; grype en trivy bij elke push; npm audit in pre-push met in tijd begrensde uitzonderingen; images vastgezet; CodeQL. [SBOM](../sbom/README.md), `security-scan.yml`.                                  |

### Repudiation (ontkenning)

| ID   | Dreiging                                                             | Stroom   | Status   | Maatregel en bewijs                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Een partij ontkent dat een overdracht heeft plaatsgevonden           | F15      | Gesloten | `TransferEvent` met de DID van afzender en ontvanger en een tijdstempel, in de met hashes geketende keten `dsp` (ADR-045).                                                                                                                  |
| R-02 | Een partij ontkent met een contract te hebben ingestemd              | F5       | Aanwezig | De overeenkomst wordt ondertekend door de connector en opgeslagen in de EDC-toestand; met haar id gespiegeld naar de graaf.                                                                                                                 |
| R-03 | Het lezen van het dossier van een patiënt wordt ontkend of verborgen | F14, F15 | Gesloten | Elke toegang die de proxy bedient, is een toegangsgebeurtenis in de keten `query`; de patiënt ziet op zijn eigen pagina wie zijn dossier heeft gelezen; bewaring tien jaar ([beleid](../audit-retention-policy.md)).                        |
| R-04 | Een handeling van een beheerder laat geen spoor na                   | F6, F7   | Aanwezig | Inloggebeurtenissen van Keycloak worden zeven dagen bewaard; deploys zijn runs van GitHub Actions; elke live stap is een script onder `scripts/azure/` en wordt vastgelegd in de gotchas of een ADR. Een SIEM is een punt van de richtlijn. |

### Information disclosure (openbaarmaking van informatie)

| ID   | Dreiging                                                    | Stroom             | Status   | Maatregel en bewijs                                                                                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I-01 | Een anonieme aanroeper leest gegevens                       | F1                 | Gesloten | Elke API-route vereist een sessie (ADR-044); de pagina's die ze lezen, staan in `PROTECTED_PATHS` en verwijzen door; 40 black-box-controles van de live hub bevestigen de 401's en de doorverwijzingen (`check-hub-blackbox.sh`).                                                                                  |
| I-02 | De beheer-API van de connectoren is van buitenaf bereikbaar | F10                | Aanwezig | Alleen interne ingress; de UI bereikt haar via haar interne naam, die bij elke deploy wordt vastgezet (#648). De catalogus-crawler stuurt zijn token alleen naar vermelde hosts.                                                                                                                                   |
| I-03 | Secrets in de pagina of de repository                       | F1, F7             | Gesloten | Alleen omgeving aan de serverkant; Key Vault-verwijzingen (ADR-036); gitleaks in de hooks en in de CI; een test controleert dat geen secret in de HTML terechtkomt.                                                                                                                                                |
| I-04 | Cross-site scripting exfiltreert een sessie                 | F1                 | Gesloten | Een nonce per verzoek in de CSP met `strict-dynamic`, geen `unsafe-inline` voor scripts; sessiecookie met `HttpOnly`; headers vastgelegd door `next.config.js` en via black-box gecontroleerd. De pagina buiten kantooruren miste ooit enkele headers (F8, observe).                                               |
| I-05 | Een database is bereikbaar vanaf internet                   | F14 tot en met F20 | Gesloten | Neo4j, PostgreSQL en Vault hebben geen openbare ingress; de Flexible Server laat alleen de omgeving toe.                                                                                                                                                                                                           |
| I-06 | Clickjacking                                                | F1                 | Gesloten | `X-Frame-Options: DENY` en `frame-ancestors 'none'`, via black-box gecontroleerd.                                                                                                                                                                                                                                  |
| I-07 | Heridentificatie uit een cohort                             | F9, F12            | Aanwezig | `MIN_COHORT_SIZE` van 5 in de proxy voor gefedereerde query's; andere rollen dan de houder van gezondheidsgegevens en de beheerder zien een pseudoniem, het geboortejaar en geen woonplaats (#475). Outputcontrole door de instantie voor toegang tot gezondheidsgegevens is een proces dat de demo niet uitvoert. |
| I-08 | Een verlopen of ingetrokken bewijsstuk wordt geaccepteerd   | F5                 | Demo     | De IdentityHub controleert de vervaldatum; er is geen intrekkingslijst in de demo. Statuslijsten en een intrekkingsprocedure zijn punten van de richtlijn voor echte gegevens.                                                                                                                                     |
| I-09 | Logs bevatten persoonsgegevens                              | F13                | Aanwezig | De proxy logt aantallen en codes, de aanroeper als hash; Azure Monitor bewaart 30 dagen; de operationele logs zijn gescheiden van de auditketen (ADR-045).                                                                                                                                                         |

### Denial of service (dienstweigering)

| ID   | Dreiging                                             | Stroom   | Status       | Maatregel en bewijs                                                                                                                                                                                                                                                                                                   |
| ---- | ---------------------------------------------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Eén gebruiker put de proxy uit                       | F9       | Gesloten     | Per gebruiker: `RATE_LIMIT_MAX` verzoeken en `RATE_LIMIT_HEAVY_MAX` analytische query's per `RATE_LIMIT_WINDOW_MS`; per deelnemer tien keer zoveel voor aanroepers die geen gebruiker noemen; de auditroute heeft een eigen limiet. Gemeten: 83.6 % geweigerd ervoor, 23.2 % na de limiet per gebruiker (2026-10-05). |
| D-02 | Een stortvloed aan DSP-berichten naar de connectoren | F5       | Demo         | Het control plane van EDC-V beheert zijn toestandsmachines via leases in PostgreSQL en breekt af na een time-out; geen rate limit aan de rand van de connector. Een WAF en rate limits per hostnaam zijn punten van de richtlijn.                                                                                     |
| D-03 | Een onbegrensde query                                | F14, F15 | Gesloten     | `LIMIT` op elke lijstroute; de graafweergaven begrensd tot de nieuwste 30 toegangsgebeurtenissen (#580), waarmee het ene verzoek verdween dat de UI bij 90 gelijktijdige gebruikers onderuithaalde; elke uitgaande aanroep heeft een time-out.                                                                        |
| D-04 | Belasting haalt het platform onderuit                | F1       | Aanwezig     | 400 gebruikers zonder mislukt verzoek (2026-10-06); de UI schaalt via een HTTP-concurrencyregel naar zes replica's met hele cores (ADR-061); health checks op elk image; een deploy wacht zolang een belastingtest loopt. De latentie-SLO's worden vanaf 200 gebruikers overschreden; dit wordt hierna gemeten.       |
| D-05 | De stack staat uit                                   | F1       | Geaccepteerd | Buiten kantooruren stopt alles bij besluit (ADR-053) en de UI meldt dat; een 24x7-contract heft het schema op (richtlijn, beschikbaarheid).                                                                                                                                                                           |

### Elevation of privilege (verhoging van bevoegdheden)

| ID   | Dreiging                                                | Stroom   | Status   | Maatregel en bewijs                                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01 | Een patiënt bereikt een beheerroute                     | F1       | Gesloten | `requireAuth(["EDC_ADMIN"])` op de beheerroutes, 403 voor elke andere rol; de rollenmatrix in `.claude/rules/api-conventions.md`; de Bruno-map `09 Access control` controleert het tegen een echte server.                                                     |
| E-02 | Een onderzoeker leest de identiteit van een patiënt     | F1, F9   | Gesloten | `seesPatientIdentity()` beslist op basis van de rol; `refuseForeignRecord()` antwoordt 403 voor het dossier van een andere patiënt; de NLQ-proxy weigert identiteitslezingen zonder de header van de UI (#475). Bruno `09 Access control/28` tot en met `/30`. |
| E-03 | Rollen geïnjecteerd in het token                        | F2, F8   | Gesloten | Rollen komen alleen uit de claims van de realm; bij de UI-client staat full scope uit en vallen precies de zeven EHDS-rollen binnen de scope (#648, `wire-ui-client-scope.sh`); `auth.ts` mapt niets anders.                                                   |
| E-04 | Het catalogustoken wordt van elders gebruikt            | F10, F11 | Aanwezig | Eén token in Key Vault, dat de UI en de crawler als verwijzing bereikt; de crawler stuurt het alleen naar `DSP_CATALOG_TOKEN_HOSTS`; een verkeerd token geeft 401, nooit een terugval op de sessie (ADR-020, ADR-036).                                         |
| E-05 | Een overdracht zonder overeenkomst                      | F5, F12  | Aanwezig | Het data plane geeft alleen een EDR uit voor een afgeronde overeenkomst (EDC-V); de hub legt bij elke overdracht de `contractId` vast. De TCK dekt het protocol af.                                                                                            |
| E-06 | Het beheerdersaccount `edcadmin` met een demowachtwoord | F2       | Open     | `EDC_ADMIN` leest het dossier van een patiënt zonder contractonderhandeling. `scripts/azure/secure-accounts.sh` zet het, en elk niet-demo-account, over op een gegenereerd wachtwoord in Key Vault; moet nog tegen de live realm worden uitgevoerd (#671).     |

### Samenvatting

| Categorie              | Dreigingen | Gesloten | Aanwezig |  Demo |  Open | Geaccepteerd |
| ---------------------- | ---------: | -------: | -------: | ----: | ----: | -----------: |
| Spoofing               |          5 |        2 |        3 |     0 |     0 |            0 |
| Tampering              |          7 |        3 |        4 |     0 |     0 |            0 |
| Repudiation            |          4 |        2 |        2 |     0 |     0 |            0 |
| Information disclosure |          9 |        5 |        3 |     1 |     0 |            0 |
| Denial of service      |          5 |        2 |        1 |     1 |     0 |            1 |
| Elevation of privilege |          6 |        3 |        2 |     0 |     1 |            0 |
| **Alle**               |     **36** |   **17** |   **15** | **2** | **1** |        **1** |

Gesloten en aanwezig verschillen in hoe ze worden aangetoond: een gesloten
rij heeft een test of een buildinstelling die faalt wanneer de maatregel
verdwijnt; een aanwezige rij steunt erop dat de code het doet en op de suites
die het uitoefenen. Aanwezige rijen omzetten in gesloten rijen is het gewone
werk aan dit model.

## 4. Wat de demo accepteert, en wat echte gegevens nodig hebben

| Restrisico                                            | Waarom het voor de demo wordt geaccepteerd                                        | Wat het sluit                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Geen intrekking van bewijsstukken (I-08)              | Elk bewijsstuk wordt door de demo aan een fictieve deelnemer uitgegeven           | Een statuslijst in de IssuerService en een intrekkingsprocedure; richtlijn, identiteit |
| Geen rate limit aan de rand van de connectoren (D-02) | De connectoren praten alleen met fictieve peers                                   | Een WAF en limieten per hostnaam; richtlijn, rand                                      |
| Geen mTLS tussen apps (T-02)                          | Eén omgeving, interne ingress                                                     | Private endpoints en wederzijds geauthenticeerde DSP-endpoints; richtlijn, connectoren |
| Neo4j heeft één databasegebruiker                     | Over toegang wordt beslist in de hub en de proxy, en de gegevens zijn synthetisch | Neo4j Enterprise of een beheerde graaf met rollen en back-ups; richtlijn, gegevens     |
| Beheerdersaccounts met demowachtwoorden (E-06)        | Achter die accounts zitten geen echte gegevens van wie dan ook                    | `secure-accounts.sh --all-non-demo`; #671                                              |
| Geen onafhankelijke test                              | De eigen tests van het project zijn tot nu toe het bewijs                         | Een penetratietest van de hub; testrapport, laatste sectie; #655                       |
| De stack staat buiten kantooruren uit (D-05)          | Een kostenbesluit voor een demo                                                   | Een 24x7-servicecontract; richtlijn, beschikbaarheid                                   |

## 5. Hoe dit model actueel blijft

- Een nieuwe API-route heeft een sessie nodig of een vervangend ADR; anders
  faalt de test `every-route-needs-a-session.test.ts`.
- Een nieuwe route die patiëntvelden teruggeeft, vraagt eerst
  `seesPatientIdentity()`, en de Bruno-collectie krijgt een verzoek dat de
  weigering controleert.
- Elke wijziging doorloopt de beveiligingsscan, CodeQL, de compliancesuites
  en de black-box-controles; een bevinding komt met een status in het
  beveiligingstestrapport, nooit alleen in een commitbericht.
- De diagrammen zijn PlantUML-bronnen onder `diagrams/`, gerenderd door
  `scripts/render-plantuml.sh`; een stroom die aan het systeem wordt
  toegevoegd, krijgt hier een nummer en een rij in de tabel die hem
  analyseert.

## 6. Hoe u dit model zelf verifieert

Elke gesloten rij heeft een controle die op een laptop kan worden uitgevoerd
of in de CI kan worden gelezen:

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

De compliancesuites (`compliance.yml`: de DSP 2025-1 TCK, de DCP-controles,
de EHDS-suites) dekken de connectorrijen S-01, S-03, T-05 en E-05 af bij elke
pull request. Een rij waarvan de controle in deze lijst ontbreekt, is een
aanwezige rij, en de volgende stap ervoor is de test die haar zou verplaatsen.
