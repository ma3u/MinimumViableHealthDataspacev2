---
source: docs/security/operational-guideline.md
sourceHash: ecd7586f5a4e88a5099596d7c1f9eec81a888d8df3250d3cacbcab6dc9a5a13a
language: nl
summary: "Hoe u de hub en Klarbefund echt host: welke EHDS-rol (Verordening (EU) 2025/327) welk deel beheert, wat BSI C5, IT-Grundschutz, TR-02102 en TR-03161 van elk deel vragen, de termijnen bij incidenten, de bewaring en de go-livechecklist per rol."
---

# Operationele richtlijn: de hub en Klarbefund hosten onder de EHDS en de BSI-normen

Wat in deze repository staat, is een demonstrator: één Azure-resourcegroep, één
operator, fictieve deelnemers, synthetische patiënten en een stack die 's nachts
stopt om binnen een persoonlijk tegoed te blijven. Deze richtlijn is geschreven
voor de dag waarop iemand het echt host: een instantie voor toegang tot
gezondheidsgegevens, een exploitatiemaatschappij die voor zo'n instantie werkt,
een zorgverzekeraar, een ziekenhuisgroep of een leverancier die de
white-label-app overneemt. Zij beschrijft welke rol in Verordening (EU) 2025/327
(de EHDS) welk onderdeel exploiteert, wat de BSI-normen van elk onderdeel
vereisen en wat er ten opzichte van de demo moet veranderen voordat er echte
gezondheidsgegevens mee in aanraking komen.

De artikelnummers zijn die van de vastgestelde verordening. Oudere bestanden in
deze repository dragen nog de nummers van het voorstel van 2022; de
concordantie staat in
[`docs/ehds-article-numbering.md`](../ehds-article-numbering.md). Het bewijs
achter elk "de demo doet dit al" hieronder staat in het
[beveiligingstestrapport](security-test-report-2026-10-15.md), de twee
dreigingsmodellen ([hub](threat-model.md), [app](threat-model-klarbefund.md)),
de [C5-gapanalyse](bsi-c5-gap-analysis.md) en de
[zelfbeoordeling](../klarbefund/self-assessment.md) van Klarbefund. Dit document
is een richtlijn van het project, geen juridisch advies en geen certificering.

## 1. De rollen in de EHDS, en wie wat exploiteert

De verordening benoemt de rollen; zij zegt niet wie de servers onder de
instantie voor toegang beheert. De zeven Keycloak-rollen van de hub zijn de
technische schaduw van de juridische rollen, en de tabel geeft aan welke
juridische actor achter elke technische rol staat zodra het systeem de demo
verlaat.

| EHDS-rol (Vo. 2025/327)                                                                                                   | Wat de verordening ervan verwacht                                                                                                                                                                                                               | Hubrol / component                                                                                                     | Wie het in een echte uitrol exploiteert                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Natuurlijke persoon** (de patiënt), art. 3 tot en met 10, opt-out art. 71                                               | Toegang tot de eigen elektronische gezondheidsgegevens, toevoeging, rectificatie, beperking, informatie over wie toegang heeft gehad; het recht om zich af te melden voor secundair gebruik.                                                    | `PATIENT`; `/patient/*`; Klarbefund op de telefoon; aanmelding met de EUDI-wallet (ADR-028)                            | De persoon zelf, via de toegangsdienst van de autoriteit voor digitale gezondheid of een EPD-systeem; de app is van hem of haar, de operator ziet de inhoud nooit.         |
| **Gezondheidswerker**, art. 11                                                                                            | Toegang tot de prioritaire categorieën van de personen onder zijn of haar zorg, gelogd en zichtbaar voor de persoon.                                                                                                                            | Geen rol in de demo (toegang tot het dossier voor primair gebruik loopt via de ePA, niet via de hub)                   | De operator van het EPD-systeem; de hub ontvangt alleen wat de persoon exporteert.                                                                                         |
| **Houder van gezondheidsgegevens**, art. 2(2)(y), verplichtingen art. 60, beschrijving van datasets art. 77               | De categorieën van art. 51 op basis van een vergunning beschikbaar stellen, datasets beschrijven, met de instantie voor toegang communiceren, het kwaliteitslabel toepassen (art. 78).                                                          | `DATA_HOLDER`; `/data/share`, `/data/transfer`; de connector (control plane, data plane, IdentityHub)                  | De houder zelf (een ziekenhuis, een verzekeraar, een register); de exploitatiemaatschappij kan zijn connector hosten onder een verwerkersovereenkomst volgens art. 28 AVG. |
| **Gebruiker van gezondheidsgegevens**, art. 61, aanvragen art. 67, vergunning art. 68                                     | Uitsluitend verwerken binnen de beveiligde verwerkingsomgeving, uitsluitend voor het doel van de vergunning (art. 53), nooit voor de verboden doeleinden (art. 54), resultaten publiceren, inbreuken melden.                                    | `DATA_USER`; `/data/discover`, `/negotiate`, `/analytics`, `/query`                                                    | De instelling van de onderzoeker; zij exploiteert nooit infrastructuur, zij is een tenant van de SPE.                                                                      |
| **Instantie voor toegang tot gezondheidsgegevens (HDAB)**, art. 55, taken art. 57, handhaving art. 63                     | Beslissen over aanvragen, vergunningen verlenen, de SPE ter beschikking stellen (art. 73), het openbare register en de informatieplichten bijhouden (art. 58, 59), handhaven (art. 63), verwerkingsverantwoordelijke van de SPE zijn (art. 74). | `HDAB_AUTHORITY`; `/compliance`, `/admin/policies`, het vergunningsregister, `HDABApproval`-knooppunten                | De aangewezen overheidsinstantie; zij is eigenaar van de beslissingen en van de verwerkingsverantwoordelijkheid, ook waar zij de exploitatie inkoopt.                      |
| **Betrouwbare houder van gezondheidsgegevens**, art. 72                                                                   | Een houder die de vereenvoudigde procedure voor zijn eigen gegevens mag uitvoeren, met dezelfde SPE- en logverplichtingen.                                                                                                                      | Een `DATA_HOLDER` met door de HDAB gedelegeerde rechten (in de demo niet apart gemodelleerd)                           | De houder, onder toezicht van de instantie voor toegang.                                                                                                                   |
| **Operator van de beveiligde verwerkingsomgeving**, art. 73                                                               | Toegang alleen voor gemachtigde natuurlijke personen, geen download van persoonsgegevens, elke toegang en elke output gelogd, outputs vóór vrijgave op persoonsgegevens gecontroleerd, beveiliging geaudit.                                     | `TRUST_CENTER_OPERATOR`; `/analytics`, `/query`, `SPESession`, de OMOP-aggregaten; ADR-037, ADR-052                    | De instantie voor toegang of haar exploitatiemaatschappij; op een gecertificeerde cloud (C5-attestatie) met confidential computing waar de gegevens dat rechtvaardigen.    |
| **Autoriteit voor digitale gezondheid**, art. 19; nationale contactpunten, art. 23 en 75                                  | Primair gebruik: de toegangsdienst, MyHealth@EU; secundair gebruik: HealthData@EU en de grensoverschrijdende vergunningen.                                                                                                                      | De tweede instantie voor toegang en de grensoverschrijdende vergunning in de seed; de gefedereerde catalogus (ADR-020) | De aangewezen autoriteiten van de lidstaat; de hub is een deelnemer, nooit het nationale contactpunt zelf.                                                                 |
| **Fabrikant van EPD-systemen**, hoofdstuk III; label voor **wellnessapps**, art. 48                                       | Conformiteit van de Europese interoperabiliteits- en logcomponenten van het EPD-systeem; een wellnessapp kan interoperabiliteit met een EPD-systeem verklaren.                                                                                  | Klarbefund als app van het wellnesstype die naar de ePA exporteert; FHIR R4 in de EEHRxF-profielen                     | De leverancier die de app uitbrengt; in het white-labelgeval de verzekeraar als de entiteit die haar in de handel brengt.                                                  |
| **Platformoperator** (geen EHDS-rol; de exploitatiemaatschappij van `docs/ehds-operating-company.md`)                     | Beheert identiteit, catalogus, connectoren, SPE en monitoring voor de bovengenoemde actoren; voor elk van hen een verwerker volgens art. 28 AVG.                                                                                                | `EDC_ADMIN`; `/admin/*`, de Azure-resourcegroep, Keycloak, Vault, Key Vault, de pipelines                              | Een gecontracteerde operator met een ISO 27001-ISMS op basis van IT-Grundschutz en daaronder een cloud met C5-attestatie.                                                  |
| **Toezichthoudende autoriteiten**: gegevensbescherming (AVG), markttoezicht (hoofdstuk III), BSI / nationaal CSIRT (NIS2) | Ontvangen meldingen van inbreuken, auditen, handhaven.                                                                                                                                                                                          | De audittrail (ADR-045), het activiteitenverslag, het vergunningsregister                                              | Geen operators; de operator moet hen binnen de termijnen van sectie 7 kunnen antwoorden.                                                                                   |

### Het exploitatiemodel als proces

Het diagram is een proces in BPMN-stijl met één swimlane per rol: rechthoeken
zijn taken, ruiten zijn beslissingen, de lus aan het eind is de outputcontrole,
de groene punten zijn begin en einde. De artikelnummers zijn de vastgestelde.
De lanes van de houder, de gebruiker en de persoon zijn van henzelf; in de lane
van de instantie voor toegang liggen alle beslissingen; de lanes van de
exploitatiemaatschappij en van de SPE-operator bevatten het technische werk dat
deze repository implementeert.

![EHDS-exploitatiemodel: één swimlane per rol, van de onboarding van de houder via aanvraag, vergunning, opt-out, extractie, de beveiligde verwerkingsomgeving en outputcontrole tot de gepubliceerde resultaten](img/ehds-operating-model.svg)

Bron: [`diagrams/ehds-operating-model.puml`](diagrams/ehds-operating-model.puml), gerenderd met `scripts/render-plantuml.sh`.

Drie verantwoordelijkheden die het diagram zichtbaar maakt en die een contract
moet herhalen: de instantie voor toegang beslist en de operator voert uit; de
opt-out van de persoon bereikt de extractie bij de houder via de
beleidsevaluatie van de operator, niet via goede wil; en geen output verlaat de
SPE op gezag van de operator, alleen op dat van de instantie voor toegang.

Daaruit volgen twee dingen. **De verwerkingsverantwoordelijkheid ligt nooit bij
de operator.** De instantie voor toegang is verwerkingsverantwoordelijke voor de
SPE en de vergunningsgegevens (art. 74); de houder is verwerkingsverantwoordelijke
voor zijn brongegevens; de operator verwerkt op instructie. Elk hostingcontract
herhaalt dit. **Roltoekenningen zijn beslissingen, geen tickets.** Wie
`HDAB_AUTHORITY` of `TRUST_CENTER_OPERATOR` wordt, beslist de instantie voor
toegang schriftelijk; de operator voert de toekenning in Keycloak uit en de
toekenning wordt gelogd (ADR-045). De demo kent rollen toe in een seedbestand;
een echte uitrol verwijdert de seed en bewaart de geschiedenis van de
toekenningen.

## 2. Hostingarchitectuur: van de demo naar een exploiteerbaar platform

De demo draait alles in één Azure Container Apps-omgeving, `rg-mvhd-dev`
(ADR-012), die buiten kantoortijden wordt gestopt (ADR-053, ADR-058). De opzet
hieronder behoudt de componenten en verandert hoe ze worden geplaatst.

### De oplossing in lagen

![De oplossing als gelaagde ArchiMate-weergave: de bedrijfslaag met de zes EHDS-rollen en de processen die elk uitvoert, de applicatielaag met de zes diensten en de componenten die ze realiseren, de technologielaag met het Azure-platform, de databases, de vaults en de iPhone](img/ehds-solution-layers.svg)

Bron: [`diagrams/ehds-solution-layers.puml`](diagrams/ehds-solution-layers.puml),
ArchiMate 3.2-notatie. De bedrijfslaag is sectie 1 van deze richtlijn: elke rol
voert zijn eigen processen uit, en de tweezijdige procedure van hoofdstuk IV
(aanvragen, beslissen, verwerken) loopt van links naar rechts. De applicatielaag
benoemt wat de hub aan die processen levert en welke component dat realiseert;
de technologielaag is het platform van de tabel hieronder, zoals de demo het
vandaag draait. Een pijl van een lagere band naar een hogere leest als "dient".

| Zone                  | Componenten                                                            | Demo vandaag                                                                              | Vereist voor echte gegevens                                                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge                  | TLS-terminatie, WAF, rate limits                                       | ACA-ingress met beheerde certificaten; headers ingesteld door `next.config` (F8)          | Een web application firewall vóór elke publieke hostnaam; TLS volgens BSI TR-02102-2 (minimaal TLS 1.2, bij voorkeur 1.3, geen CBC-suites); HSTS preloaded; rate limits per route en per identiteit; bot- en DDoS-bescherming van de cloud.                                                                |
| Identiteit            | Keycloak, IdentityHub, IssuerService, de EUDI-wallet-backend           | Keycloak `start-dev` achter een Caddy-guard (F10); realm uit `keycloak-realm.json`        | Keycloak in productiemodus met een eigen database op de Flexible Server, de beheerconsole alleen bereikbaar vanuit het netwerk van de operator, MFA voor elke geprivilegieerde rol (C5 IAM-04), de realm onder versiebeheer en gecontroleerd op drift (`docs/knowledge/runbooks/keycloak-realm-drift.md`). |
| Applicatie            | De hub (Next.js), de neo4j-proxy, de uitlegdienst, de crawlers         | Publieke ingress voor de hub en Keycloak; interne ingress voor de rest                    | Alleen de hub en Keycloak publiek; al het andere op interne ingress of private endpoints; elk image ondertekend en vastgepind op digest; de stuklijsten in `docs/sbom/` opnieuw gegenereerd bij elke wijziging van een afhankelijkheid.                                                                    |
| Connectoren           | Control plane, data planes, IdentityHub, Vault per deelnemer           | Eén connectorset per fictieve deelnemer (ADR-024)                                         | Eén connector per juridische houder, geëxploiteerd door de houder of door de operator onder contract; DSP-endpoints wederzijds geauthenticeerd; de sleutels van de deelnemer in een eigen Vault-namespace (ADR-046), nooit gedeeld.                                                                        |
| Gegevens              | Neo4j, de PostgreSQL Flexible Server, Azure Files                      | Beheerde Postgres (ADR-041); Neo4j op Azure Files (ADR-017); geen back-ups                | Versleuteling at rest met door de klant beheerde sleutels (C5 CRY-03, DIP-02); zoneredundante Postgres met point-in-time restore; Neo4j Enterprise of een beheerde graafdatabase met elk kwartaal geteste back-ups (DIP-03); geen synthetische en echte gegevens in dezelfde instantie.                    |
| Beveiligde verwerking | `/analytics`, `/query`, de OMOP-aggregaten, `SPESession`               | Aggregaten in dezelfde Neo4j; confidential computing beoordeeld (ADR-037, ADR-052)        | Een aparte omgeving volgens art. 73: geïsoleerd netwerk, geen uitgaand internet, geen downloadpad, output vóór vrijgave gecontroleerd door de instantie voor toegang, confidential VM's of enclaves waar de gegevens van de vergunning dat rechtvaardigen; ten minste jaarlijks geaudit.                   |
| Geheimen              | Key Vault, Vault                                                       | Elk operatorgeheim een Key Vault-referentie (ADR-036); Vault-status op Postgres (ADR-046) | Behouden; daarnaast rotatie volgens schema (C5 CRY-04), door HSM's beschermde sleutels voor het ondertekenen van credentials en een gedocumenteerde break-glass-procedure met goedkeuring door twee personen.                                                                                              |
| Observeerbaarheid     | De OpenTelemetry-collector, Grafana, Loki, Tempo, Prometheus (ADR-045) | Eén observability-app; logs in Azure Monitor                                              | Logs doorgestuurd naar een SIEM dat het SOC van de operator bewaakt; onveranderlijkheid voor de audittrail (DIP-06); bewaartermijnen volgens sectie 6; alerts op de gebeurtenissen van sectie 7.                                                                                                           |
| Beschikbaarheid       | De hele stack                                                          | Stopt om 18:13 UTC, start om 05:17 UTC op werkdagen                                       | 24x7 met de doelen van het dienstverleningscontract; het schema buiten kantoortijden is een kostenmaatregel van de demo en wordt verwijderd (het is één `az`-aanroep, `scripts/azure/offhours.sh`, en ADR-053 wordt vervangen door de hostingbeslissing).                                                  |

De ene resourcegroep van de demo wordt ten minste drie abonnementen of
resourcegroepen met gescheiden identiteiten: identiteit en edge, het platform,
en de beveiligde verwerkingsomgeving. De identiteit van de SPE heeft nooit
rechten in de andere. Dit is C5-controledomein "PSS" (portabiliteit en
segregatie) en IT-Grundschutz NET.1.1 in de praktijk.

## 3. De BSI-normen, onderdeel voor onderdeel

| Norm                                                               | Van toepassing op                                              | Wat zij hier vraagt                                                                                                                                                                                                                                                                                                    | Waar het project staat                                                                                                                                                                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BSI C5:2020** (Cloud Computing Compliance Criteria Catalogue)    | De onderliggende cloud en de operator als cloudserviceprovider | Een attestatierapport (type 2) voor de infrastructuur van de cloudprovider, en het eigen C5-rapport van de operator voor het platform als hij het als dienst aanbiedt. De criteria die de code kan halen, worden control per control gevolgd.                                                                          | [C5-gapanalyse](bsi-c5-gap-analysis.md): de criteria voor ontwikkeling, IAM en auditlogging geheel of gedeeltelijk gehaald; de organisatorische open.                                                                              |
| **ISO 27001 op basis van IT-Grundschutz**                          | De operator                                                    | Een ISMS met de bouwstenen die bij deze stack passen: APP.3.1 webapplicaties, APP.4.4 Kubernetes (ACA volgt hetzelfde model), SYS.1.6 containers, CON.1 cryptografie, ORP.4 identiteits- en autorisatiebeheer, OPS.1.1.5 logging, OPS.1.2.5 beheer op afstand, DER.2.1 incidentafhandeling, CON.2 gegevensbescherming. | Niet iets wat een repository kan bevatten; de dreigingsmodellen en het testrapport zijn input voor de risicoanalyse.                                                                                                               |
| **TR-02102-1 en -2** (cryptografische mechanismen, TLS)            | Elke verbinding en elk opgeslagen geheim                       | TLS 1.2 of 1.3 met de vermelde suites; AES-GCM met 256 bit voor gegevens at rest; RSA met 3000 bit of ECDSA P-256 en hoger voor handtekeningen; SHA-256 en hoger; sleutels geroteerd.                                                                                                                                  | De app: AES-GCM per record, sleutel in de Secure Enclave (zelfbeoordeling O.Cryp). De hub: TLS van het platform, black-box gecontroleerd; de suites van de edge zijn die van de cloud en moeten in het contract worden vastgelegd. |
| **TR-03161** (beveiligingseisen voor gezondheidstoepassingen)      | Klarbefund en elke white-labelbuild ervan                      | De doelstellingen van deel 1 (mobiele apps) en deel 2 (web/backends): doel, architectuur, broncode, derden, cryptografie, authenticatie, gegevensopslag, betaalde middelen, netwerk, platform, veerkracht.                                                                                                             | [Zelfbeoordeling](../klarbefund/self-assessment.md), doelstelling per doelstelling; de lijst op het niveau van de eisen en een onafhankelijke test staan open (testrapport, sectie "What an independent test would add").          |
| **TR-03116-4** (TLS in federale projecten)                         | Elke uitrol voor een overheidsinstantie                        | Het TLS-profiel dat een federale operator moet gebruiken; strenger dan TR-02102-2 wat betreft ciphersuites en certificaatketens.                                                                                                                                                                                       | Niet gecontroleerd; de configuratie van de edge is die van de cloud.                                                                                                                                                               |
| **TR-03107-1** (elektronische identiteiten en vertrouwensdiensten) | Aanmelding van natuurlijke personen                            | Betrouwbaarheidsniveaus voor identificatie; "substantieel" of "hoog" voor toegang tot het eigen gezondheidsdossier.                                                                                                                                                                                                    | De aanmelding met de EUDI-wallet (ADR-028) richt zich via de wallet op "hoog"; gebruikersnaam en wachtwoord in Keycloak zijn alleen voor de demo.                                                                                  |
| **NIS2 zoals omgezet (BSIG)**, KRITIS-drempels                     | De operator en de gezondheidsentiteiten op het platform        | Risicobeheersmaatregelen, incidentmelding binnen 24 uur (vroegtijdige waarschuwing) en 72 uur, beveiliging van de toeleveringsketen, verantwoordelijkheid van het bestuur; KRITIS-registratie als de drempels voor de zorg worden bereikt.                                                                             | Sectie 7 geeft de termijnen; het document over de exploitatiemaatschappij bevat het escalatiemodel.                                                                                                                                |

De volgorde is van belang voor een aanbesteding: het C5-rapport van de cloud is
wat een publieke inkoper als eerste vraagt, het ISMS van de operator als
tweede, de TR-03161-test van de app als derde. Geen van deze wordt door code
voortgebracht; de code levert het bewijs dat zij lezen.

## 4. Identiteit en toegang

- **Eén identiteitsprovider, geëxploiteerd door de platformoperator, met de
  realm onder versiebeheer.** Keycloak bevat de rollen; de hub vertrouwt
  uitsluitend de rollen in het token (`ui/src/lib/auth.ts`). Elke API-route
  vereist een sessie (ADR-044); elke uitzondering per route wordt als ADR
  vastgelegd, nooit als configuratievlag.
- **Organisaties bewijzen wie ze zijn met verifieerbare credentials**, uitgegeven
  op basis van een gezaghebbend register (DCP v1.0, `did:web`). De IssuerService
  is van de operator; de sleutels van de houder blijven in de Vault-namespace
  van de houder. De seed van de demo geeft credentials uit aan fictieve
  organisaties; een echte uitrol geeft ze pas uit na de onboardingstappen in
  het document over de exploitatiemaatschappij, stap 3.
- **Natuurlijke personen melden zich aan via de EUDI-wallet of de nationale
  eID**, op betrouwbaarheidsniveau "hoog" voor hun eigen dossier (art. 16,
  identificatiebeheer; TR-03107). Gebruikersnaam en wachtwoord blijven voor
  medewerkers, met MFA, en nooit voor patiënten.
- **Geprivilegieerde rollen** (`EDC_ADMIN`, `HDAB_AUTHORITY`,
  `TRUST_CENTER_OPERATOR`) vereisen MFA, een benoemde persoon, een
  gedocumenteerde toekenning door de instantie voor toegang en elk kwartaal een
  herbeoordeling. Serviceaccounts (het token van de catalogus-crawler, ADR-020;
  het sandboxaccount van de app, ADR-054) worden vermeld met eigenaar, scope en
  rotatiedatum.
- **De beheerconsole van Keycloak staat niet op het internet** (bevinding F10,
  de Caddy-guard in `scripts/azure/guard-keycloak-console.sh`); beheer verloopt
  via een privénetwerk of een bastion met sessieopname.
- **Sessies** zijn kort voor geprivilegieerde rollen, gebonden aan de client en
  ingetrokken bij een rolwijziging. `NEXTAUTH_SECRET` en elk ander
  operatorgeheim is een Key Vault-referentie (ADR-036), volgens schema
  geroteerd.
- **Wie de identiteit van een patiënt ziet, wordt bepaald door de rol, nooit
  door een parameter** (`ui/src/lib/patient-identity.ts`): houders en de
  platformoperator voor primair gebruik, de patiënt alleen voor het eigen
  dossier (`refuseForeignRecord`), alle anderen een pseudoniem. De NLQ-proxy
  weigert query's die de identiteit onthullen. Dit blijft zoals het is en wordt
  bij elke build getest.

## 5. Gegevensbescherming

- **Verwerkingsverantwoordelijkheid en contracten.** De instantie voor toegang
  is verwerkingsverantwoordelijke voor de beveiligde verwerkingsomgeving (art. 74) en geeft de operator als verwerker instructies; de houder is
  verwerkingsverantwoordelijke voor zijn brongegevens; de gebruiker van
  gezondheidsgegevens is verwerkingsverantwoordelijke voor wat hij mag
  verwerken, uitsluitend binnen de SPE. Elk paar sluit een overeenkomst volgens
  art. 28 AVG; het document over de exploitatiemaatschappij geeft het model.
- **Een gegevensbeschermingseffectbeoordeling** vóór de livegang, voor het
  platform als geheel en apart voor de SPE. De twee dreigingsmodellen zijn de
  technische input; de DPIA voegt de rechtsgrond per gegevenscategorie (art. 51)
  en de restrisico's toe.
- **Gegevensminimalisatie en doelbinding** (art. 66): de instantie voor toegang
  beslist voor elke vergunning of geanonimiseerde gegevens de vraag
  beantwoorden, en pas daarna gepseudonimiseerde gegevens. De OMOP-aggregaten
  van de hub en de k-anonimiteit van de cohortweergaven zijn het
  geanonimiseerde pad; de FHIR-extractie is het gepseudonimiseerde pad en draait
  alleen binnen de SPE.
- **Pseudonimiseringssleutels** worden bewaard door de instantie voor toegang of
  een vertrouwde derde, nooit door de gebruiker van gezondheidsgegevens en nooit
  door de operator van de SPE.
- **De opt-out** (art. 71) is een register dat de instantie voor toegang
  bijhoudt; de connector van de houder controleert het vóór de extractie. De
  demo heeft toestemmingsrecords in de app en op de patiëntpagina; een echte
  uitrol koppelt het nationale opt-outregister aan de ODRL-beleidsevaluatie.
- **Patiëntrechten voor primair gebruik** (art. 3 tot en met 10): toegang,
  toevoeging, rectificatie, beperking en de lijst van wie toegang heeft gehad.
  Het toegangslogboek van de patiëntpagina en de audittrail (ADR-045) zijn de
  implementatie; de operator moet een verzoek binnen de maand van de AVG
  beantwoorden.
- **Locatie.** Elke verwerker bevindt zich in de EU of de EER; de
  modelaanbieder van de uitlegdienst wordt gekozen op regio en quotum
  (ADR-035), en het model op het apparaat is de standaard, zodat geen enkele
  gezondheidswaarde de telefoon verlaat tenzij de persoon haar verstuurt.
- **De app** bevat niets wat de operator kan lezen: waarden, pagina's en
  diagnostiek zijn per record versleuteld met een sleutel in de Secure Enclave,
  uitgesloten van back-ups, achter Face ID of de toegangscode (ADR-060). De
  white-labeloperator neemt dit over; hij mag geen telemetrie toevoegen die
  waarden bevat.

## 6. Logging, bewaartermijnen en de audittrail

Wat moet worden gelogd, hoe lang, en wie het mag lezen. Het
[beleid voor het bewaren van auditgegevens](../audit-retention-policy.md) van
het project bevat de actuele cijfers (het noemt nog de artikelnummers van het
voorstel); de verplichtingen komen uit art. 57 (de instantie voor toegang houdt
een register van aanvragen en vergunningen bij), art. 73 (elke toegang tot de
SPE en elke output gelogd), art. 58 en 59 (informatie aan het publiek,
jaarverslag) en de verantwoordingsplicht van de AVG.

| Gebeurtenis                                                      | Gelogd door                          | Leesbaar voor                                                                         | Bewaartermijn (projectbeleid)                   |
| ---------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Gegevenstoegang, overdracht, contract (de `TransferEvent`-keten) | De neo4j-proxy en de connectoren     | De instantie voor toegang, de houder voor zijn gegevens, auditors                     | 10 jaar                                         |
| Vergunningsbesluiten, intrekkingen                               | De instantie voor toegang in de hub  | Openbaar register voor het besluit, partijen voor het dossier                         | 10 jaar                                         |
| SPE-sessies: wie, welke dataset, welke query, welke output       | De SPE                               | De instantie voor toegang; de gebruiker van gezondheidsgegevens voor de eigen sessies | 10 jaar                                         |
| Roltoekenningen en -intrekkingen, geprivilegieerde aanmeldingen  | Keycloak, doorgestuurd naar het SIEM | Het beveiligingsteam van de operator, auditors                                        | 2 jaar, langer als een incident ernaar verwijst |
| HTTP-toegang aan de edge, authenticatiegebeurtenissen            | De edge en Keycloak                  | Het beveiligingsteam van de operator                                                  | 2 jaar                                          |
| Eigen dossier van de patiënt: elke leesactie, door wie           | De hub                               | De patiënt, op zijn of haar pagina                                                    | Zo lang als het dossier                         |
| App: diagnostiek die de persoon kiest te exporteren              | De app, alleen op het apparaat       | De persoon; de ontwikkelaars alleen als deze wordt verstuurd                          | De persoon beslist                              |

Drie regels die de demo al naleeft en die een echte uitrol moet naleven: de
audittrail wordt geschreven door de dienst die de actie heeft uitgevoerd, niet
door de client; hij is append-only voor iedereen behalve de bewaartermijntaak
(DIP-06, te implementeren met een onveranderlijke opslag of een ondertekende
keten); en geen logregel bevat een gezondheidswaarde of een naam waar een
pseudoniem volstaat.

## 7. Incidenten, termijnen en wie wie meldt

| Aanleiding                                                      | Termijn                                                                                                                     | Wie meldt aan wie                                                                                                                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbreuk in verband met persoonsgegevens                         | AVG art. 33: 72 uur aan de toezichthoudende autoriteit; art. 34: de betrokkenen zonder onredelijke vertraging               | De operator informeert de verwerkingsverantwoordelijke (instantie voor toegang of houder) zonder onredelijke vertraging; de verwerkingsverantwoordelijke meldt het aan de autoriteit.                    |
| Significant incident bij een gezondheidsentiteit of de operator | NIS2 zoals omgezet: vroegtijdige waarschuwing binnen 24 uur, melding binnen 72 uur, eindverslag binnen een maand            | Het CSIRT-contact van de operator aan het BSI; tegelijkertijd de getroffen houders.                                                                                                                      |
| Gegevens gebruikt buiten de vergunning                          | Art. 63(2): de instantie voor toegang kan de vergunning intrekken en de verwerking zonder onredelijke vertraging stopzetten | De SPE-operator meldt het onmiddellijk aan de instantie voor toegang; de instantie beslist en informeert, als een inbreuk in de zin van de AVG mogelijk is, onmiddellijk de toezichthoudende autoriteit. |
| SPE-audit stelt een tekortkoming vast                           | Art. 73(3): corrigerende maatregel                                                                                          | De instantie voor toegang geeft de operator instructies; het herstel wordt bij de volgende audit aangetoond.                                                                                             |
| Ernstig incident met een EPD-systeem of een app                 | Art. 44 (risico's en ernstige incidenten)                                                                                   | De fabrikant aan de markttoezichtautoriteit; voor de white-label-app de entiteit die haar in de handel brengt.                                                                                           |
| Kwetsbaarheid in een afhankelijkheid, hoog of kritiek           | Projectregel: verholpen of een in de tijd begrensde uitzondering binnen de CI-gate (`docs/npm-audit-exceptions.json`)       | Het beveiligingsteam van de operator; de scan draait bij elke push (`security-scan.yml`).                                                                                                                |

### Incidentcoördinatie tussen de partijen

Een escalatie is een reeks meldingen met deadlines, en wordt daarom als
sequentie getekend: één levenslijn per partij, één bericht per melding, de
wettelijke termijnen vet op het bericht, en de takken die tegelijkertijd lopen
in één parallel blok.

![Incidentcoördinatie als sequentie: de operator detecteert, triageert en beperkt binnen het uur; daarna meldt de verwerkingsverantwoordelijke parallel binnen 72 uur aan de gegevensbeschermingsautoriteit en zonder onredelijke vertraging aan de betrokkenen, waarschuwt de operator het CSIRT binnen 24 uur en rapporteert binnen 72 uur en een maand, trekt de instantie voor toegang een misbruikte vergunning in en kunnen de houders opschorten; daarna het herstel, het verslag na het incident en de corrigerende maatregel na een SPE-audit](img/ehds-incident-coordination.svg)

Bron: [`diagrams/ehds-incident-coordination.puml`](diagrams/ehds-incident-coordination.puml),
gerenderd met `scripts/render-plantuml.sh`. De termijnen komen uit
[AVG art. 33 en 34](https://eur-lex.europa.eu/eli/reg/2016/679/oj),
[NIS2 art. 23](https://eur-lex.europa.eu/eli/dir/2022/2555/oj) zoals omgezet
in de BSIG, en [Verordening (EU) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj)
art. 61, 63(2) en 73(3); de tabel hierboven noemt ze elk.

Over de termijnen valt voor de operator niet te onderhandelen: de
verwerkingsverantwoordelijke is eigenaar van die van de AVG, de operator van
die van NIS2, de instantie voor toegang van die van de EHDS. De contactlijst in
de incidentprocedure noemt voor elk een persoon, met een plaatsvervanger, en de
tabletopoefening vóór de livegang loopt dit diagram één keer door.

De alerting die deze tabel voedt, ten minste: een geprivilegieerde aanmelding
vanaf een nieuwe locatie, elk verzoek aan de beheerconsole dat Keycloak
überhaupt bereikt, een query in de SPE die de identiteit zou onthullen, een
mislukte App Attest-verificatie in grote aantallen, een connector waarvan de
verificatie van de credential mislukt, een back-uptaak die niet is gedraaid,
en elk percentage HTTP 5xx boven de ondergrens.

## 8. Het platform exploiteren

- **Wijzigingsbeheer.** Elke wijziging is een pull request met de gates in
  `docs/quality-gates.md`: typecontrole, lint, unit- en journeytests, de
  Bruno-collectie tegen de hub, Semgrep, gitleaks, hadolint, de SBOM-controle,
  CodeQL voor TypeScript en Swift, trivy en grype. Merges worden alleen vanaf
  `main` uitgerold via `deploy-azure.yml`; de productieomgeving voegt een
  releasegoedkeuring door de change board van de operator en een ondertekend
  image toe.
- **Kwetsbaarheidsbeheer.** De scans in `scripts/security/scan-repo.sh` draaien
  bij elke push en elke nacht; bevindingen met hoge en kritieke ernst worden
  binnen de termijn van het contract verholpen of in de tijd begrensd met een
  schriftelijke uitzondering. Het
  [beveiligingstestrapport](security-test-report-2026-10-15.md) wordt bij elke
  release herhaald en eenmaal per jaar door een onafhankelijke tester.
- **Patching.** Basisimages maandelijks en bij advisories opnieuw gebouwd;
  Keycloak, Neo4j en Postgres op ondersteunde hoofdversies (ADR-030 voor Neo4j,
  het runbook voor Postgres 16 naar 17 als patroon).
- **Back-ups en herstel.** Postgres met point-in-time restore over zones heen;
  Neo4j met dagelijkse back-ups en elk kwartaal een hersteltest; de status van
  Vault staat op Postgres (ADR-046) en de unsealsleutels in Key Vault, met een
  gedocumenteerde hersteloefening. Doelen om in het contract overeen te komen:
  recovery point één uur, recovery time vier uur voor de hub, één werkdag voor
  de SPE.
- **Beschikbaarheid.** 24x7; het schema van de demo wordt verwijderd;
  healthchecks in elk image (bevinding F6) en probes in elke app-definitie; twee
  replica's voor de hub en de proxy; de pagina voor buiten kantoortijden wordt
  een onderhoudspagina die alleen binnen aangekondigde vensters wordt gebruikt.
- **Sleutelbeheer.** Ondertekeningssleutels voor credentials in een HSM;
  TLS-certificaten geautomatiseerd; elk geheim ten minste jaarlijks en bij
  personeelswisselingen geroteerd; de break-glass-procedure met goedkeuring door
  twee personen en een logboek.
- **Leveranciersbeveiliging** (C5 OIS-05): Keycloak, Neo4j, de EDC-componenten,
  de cloud en de modelaanbieder beoordeeld en vermeld met hun attestaties; de
  stuklijsten in `docs/sbom/` zijn de inventaris.
- **Exit.** Gegevensexport in FHIR R4 en OMOP CDM is al de interface van de
  hub; het contract noemt het formaat, de termijn en het bewijs van verwijdering
  aan het einde.

## 9. Klarbefund in een white-labeluitrol

De app verandert van eigenaar, maar niet van architectuur. De entiteit die haar
in de handel brengt:

- behoudt de standaard op het apparaat: waarden, pagina's en de uitleg blijven
  op de telefoon tenzij de persoon ze verstuurt (zelfbeoordeling O.Purp,
  O.Data);
- behoudt de app-vergrendeling en de versleuteling per record (ADR-060, O.Auth,
  O.Cryp) en voegt geen analytics toe die waarden zien;
- exploiteert de dienst voor sandboxaccounts (ADR-054) en, indien aangeboden,
  de uitlegdienst (ADR-034, ADR-035) in de EU onder eigen naam en met een eigen
  DPIA;
- publiceert een privacyverklaring in de taal van de persoon en een adres voor
  het melden van kwetsbaarheden;
- laat de TR-03161-test uitvoeren en, als zij interoperabiliteit met een
  EPD-systeem claimt, de verklaring volgens art. 48; zij claimt geen DiGA-status
  zonder de CE-markering die de DiGA-route vereist (zelfbeoordeling,
  "Regulation");
- herhaalt het bewijs van nauwkeurigheid op haar eigen rapportformaten vóór de
  pilot (de benchmark in [`evidence.md`](../klarbefund/evidence.md) is
  synthetisch).

## 10. Vóór de livegang: de checklist per rol

| #   | Onderdeel                                                                                                       | Eigenaar                                              | Bewijs                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Hostingcontract met verwerkingsverantwoordelijkheid volgens art. 74 en voorwaarden volgens art. 28 AVG per paar | Instantie voor toegang, operator                      | Ondertekende contracten                                                                                       |
| 2   | Type 2-C5-rapport van de cloudprovider beoordeeld; de scope dekt elke gebruikte dienst                          | Operator                                              | Rapport, scopemapping                                                                                         |
| 3   | ISMS van de operator gecertificeerd of op een gedateerd plan; de bouwstenen van sectie 3 toegewezen             | Operator                                              | Certificaat of auditplan                                                                                      |
| 4   | DPIA voor het platform en voor de SPE                                                                           | Instantie voor toegang (verwerkingsverantwoordelijke) | DPIA-documenten                                                                                               |
| 5   | Netwerkzones, private endpoints, WAF, TLS-profiel volgens TR-02102-2 of TR-03116-4                              | Operator                                              | Architectuur, scan van buitenaf (`check-hub-blackbox.sh` uitgebreid)                                          |
| 6   | Keycloak in productiemodus, beheerconsole privé, MFA op geprivilegieerde rollen, realm in git                   | Operator                                              | Realm-diff, `guard-keycloak-console.sh --check`                                                               |
| 7   | Aanmelding met EUDI of eID voor natuurlijke personen op betrouwbaarheidsniveau "hoog"                           | Operator, autoriteit voor digitale gezondheid         | Conformiteitstest van de walletflow                                                                           |
| 8   | Versleuteling at rest met door de klant beheerde sleutels; back-ups en een hersteloefening                      | Operator                                              | Key Vault-configuratie, verslag van de oefening                                                               |
| 9   | SPE geïsoleerd, geen downloadpad, procedure voor outputcontrole, jaarlijkse audit gepland                       | Instantie voor toegang, SPE-operator                  | Auditplan, procedure                                                                                          |
| 10  | Audittrail onveranderlijk, doorgestuurd naar het SIEM, bewaartermijn volgens sectie 6                           | Operator                                              | SIEM-configuratie, bewaartermijntaak                                                                          |
| 11  | Incidentprocedure met de termijnen van sectie 7 en benoemde contactpersonen                                     | Operator, instantie voor toegang                      | Procedure, contactlijst, een tabletopoefening                                                                 |
| 12  | Onafhankelijke penetratietest van de hub en de TR-03161-test van de app                                         | Operator, eigenaar van de app                         | Rapporten; bevindingen gesloten of schriftelijk geaccepteerd                                                  |
| 13  | Schema buiten kantoortijden verwijderd; replica's en probes aanwezig                                            | Operator                                              | App-definities                                                                                                |
| 14  | Synthetische gegevens uit de productiegraaf verwijderd; seeds uitgeschakeld; demovlag uit                       | Operator                                              | `MATCH (p:Patient) RETURN count(p)` is gelijk aan het aantal van de houders; `NEXT_PUBLIC_DEMO_TK` niet gezet |
| 15  | Opt-outregister gekoppeld aan de beleidsevaluatie                                                               | Instantie voor toegang, operator                      | Beleidstest met een record waarvoor een opt-out geldt                                                         |
| 16  | Adres voor het melden van kwetsbaarheden gepubliceerd; leverancierslijst met attestaties                        | Operator                                              | `SECURITY.md`, leveranciersregister                                                                           |

## 11. Wat de demonstrator niet doet

Zodat niemand er meer in leest dan er is:

- Het is één tenant, één operator, één regio, 's nachts gestopt.
- De deelnemers, instanties voor toegang en patiënten zijn fictief; de
  credentials worden door de eigen issuer uitgegeven, zonder register.
- Er is geen SIEM, geen WAF, geen door de klant beheerde sleutels, geen back-up
  van de graaf, geen MFA, en de beveiligde verwerkingsomgeving is een set
  weergaven op dezelfde database, geen geïsoleerde omgeving (ADR-037 en ADR-052
  leggen vast wat is beoordeeld).
- Er is geen onafhankelijke penetratietest en geen TR-03161-test geweest; het
  [beveiligingstestrapport](security-test-report-2026-10-15.md) is het project
  dat zichzelf test.
- De verwijzingen naar EHDS-artikelen zijn deels de nummers van het voorstel;
  dit document gebruikt de vastgestelde.

Wat het wel heeft, zijn de opzet, de rollen, de logging, de rolgebaseerde
identiteitsregels, de connectoren en de exports die een echte uitrol nodig
heeft, met elke beslissing vastgelegd als ADR en elke bewering gekoppeld aan een
test. Dat maakt het tot een referentie en niet tot een product.

## Bronnen

- Verordening (EU) 2025/327 betreffende de Europese ruimte voor gezondheidsgegevens, PB L, 5 maart 2025.
- Verordening (EU) 2016/679 (AVG), art. 28, 33, 34, 35.
- Richtlijn (EU) 2022/2555 (NIS2) en de nationale omzetting ervan.
- BSI, Cloud Computing Compliance Criteria Catalogue C5:2020.
- BSI, IT-Grundschutz-Kompendium, actuele editie; BSI-standaarden 200-1 tot en met 200-3.
- BSI TR-02102-1 en TR-02102-2, cryptografische mechanismen en TLS.
- BSI TR-03161, beveiligingseisen voor digitale gezondheidstoepassingen, delen 1 tot en met 3.
- BSI TR-03116-4, cryptografische eisen voor federale projecten, TLS.
- BSI TR-03107-1, elektronische identiteiten en vertrouwensdiensten in de e-overheid.
- Deze repository: de hierboven genoemde ADR's, `docs/ehds-operating-company.md`,
  `docs/audit-retention-policy.md`, `docs/ehds-article-numbering.md`.
