---
source: docs/klarbefund/developer-guide.md
sourceHash: 6789a3d05981809fb20a7746a513b48f8afc847a07723a7603fabad1c480dd7f
language: nl
summary: "De app bouwen, starten en testen: de pijplijn van camera tot verzegelde opslag, het gedeelde woordenboek, de opbouw van de opslag, de ontwikkeldataset, de twee testsuites, diagnose en TestFlight."
---

# Ontwikkelaarshandleiding van Klarbefund

Hoe u de iPhone-app in
[`clients/ios/`](../../clients/ios/) bouwt, uitvoert, test en wijzigt. De [gebruikershandleiding](user-guide.md) laat zien
wat een persoon ziet; deze handleiding laat zien wat daarachter zit. Het korte overzicht van de commando’s
is [`clients/ios/README.md`](../../clients/ios/README.md); het werk wordt bijgehouden
in [issue #186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186).

Elke schermafbeelding en elk getal in deze handleiding komt uit de eigen
fictieve ontwikkeldataset van de app. Nergens in de repository is een echt rapport
betrokken, en [de twee regels aan het einde](#two-rules-that-are-not-negotiable)
leggen uit waarom daarover niet te onderhandelen valt.

## Wat u nodig hebt

| Tool                                                                     | Versie                                                                                                                                                                                                                                                    | Waarom                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS met Xcode                                                          | [Xcode 26](https://developer.apple.com/documentation/xcode-release-notes) of nieuwer, iOS 26 SDK of nieuwer; de CI bouwt met Xcode 26.6 op de [macOS 26-runner](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md) | De app richt zich op iOS 26; het Swift-pakket declareert macOS 26 voor de tools                                                                                                                                                      |
| Swift                                                                    | 6.0, [strikte concurrency](https://www.swift.org/documentation/concurrency/)                                                                                                                                                                              | [`Package.swift`](../../clients/ios/Package.swift) en [`project.yml`](../../clients/ios/project.yml) leggen het allebei vast                                                                                                         |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen)                        | `brew install xcodegen`                                                                                                                                                                                                                                   | Het `.xcodeproj` wordt gegenereerd uit `project.yml` en nooit gecommit                                                                                                                                                               |
| Node                                                                     | zoals voor `ui/`                                                                                                                                                                                                                                          | Alleen om het woordenboek opnieuw te genereren uit [`services/epa-ingest`](../../services/epa-ingest)                                                                                                                                |
| [PlantUML](https://www.plantuml.com/), [Graphviz](https://graphviz.org/) | `brew install plantuml`                                                                                                                                                                                                                                   | Alleen om de diagrammen in deze handleiding opnieuw te renderen                                                                                                                                                                      |
| Een iPhone                                                               | iOS 26 of later                                                                                                                                                                                                                                           | Alleen voor de camera, Face ID, [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) en [TestFlight](https://developer.apple.com/testflight/); al het andere draait in de simulator |

## Hoe het in elkaar zit

![Klarbefund als gelaagde ArchiMate-weergave: de bedrijfslaag met de persoon, de arts en het onderzoeksteam en de zes dingen die een persoon doet; de applicatielaag met de vier diensten, de app, het Shared-pakket, de tools, de hub en de generator; de technologielaag met de frameworks van de iPhone, de Mac en Azure Container Apps](img/klarbefund-architecture.svg)

Bron: [`diagrams/klarbefund-architecture.puml`](diagrams/klarbefund-architecture.puml),
gerenderd met [`scripts/render-plantuml.sh`](../../scripts/render-plantuml.sh) `docs/klarbefund/diagrams/*.puml`.

De weergave volgt [ArchiMate 3.2](https://pubs.opengroup.org/architecture/archimate32-doc/): de bedrijfslaag (geel) bevat wie wat
doet, de applicatielaag (blauw) de diensten die de software levert en
de componenten die ze realiseren, de technologielaag (groen) waarop alles
draait. Een pijl van een lagere band naar een hogere betekent “bedient”; een gestippelde
pijl met een holle punt betekent “realiseert”. Drie dingen zijn eruit af te lezen:

- **[`Sources/Shared`](../../clients/ios/Sources/Shared/)** is een Swift-pakket dat voor iOS en macOS compileert. Het
  bevat de parser, de nabewerking van de tekstherkenning, het gegenereerde woordenboek van analyten
  en de referentiebereiken, het recordmodel met zijn herkomst, en
  de exportformaten ([FHIR R4](https://hl7.org/fhir/R4/), [OMOP CDM](https://ohdsi.github.io/CommonDataModel/cdm54.html), het diagnostiekpakket). Niets daarin
  raakt het netwerk, de sleutelhanger of de opslag, en daarom kan elk
  getal dat de app berekent op een Mac worden gereproduceerd met `swift test`.
- **[`Sources/MeinBefund`](../../clients/ios/Sources/MeinBefund/)** is de app: SwiftUI-views, scannen met [VisionKit](https://developer.apple.com/documentation/visionkit/vndocumentcameraviewcontroller), de
  verzegelde opslag, het deelmenu van de exports, de EHDS-verbinding, de appvergrendeling,
  de analyseaanbieders, en de demogegevens en de zelftest die alleen in debug bestaan.
- **[`Tools/`](../../clients/ios/Tools)** zijn vier opdrachtregelprogramma’s bovenop het Shared-pakket:
  [`LabFile`](../../clients/ios/Tools/LabFile) importeert een pdf of afbeelding precies zoals de app dat zou doen, [`ScanReplay`](../../clients/ios/Tools/ScanReplay)
  haalt een diagnostiekexport opnieuw door de huidige parser, [`AnalyteParity`](../../clients/ios/Tools/AnalyteParity)
  bewijst dat het gegenereerde woordenboek gelijk is aan zijn TypeScript-bron, en [`IconGen`](../../clients/ios/Tools/IconGen)
  tekent het app-icoon.

```
clients/ios/
  project.yml                    XcodeGen spec: the Shared framework and the MeinBefund app
  Package.swift                  SwiftPM: Shared, the four tools, SharedTests
  Sources/Shared/                parser, provenance model, formats; *.generated.swift are generated
  Sources/MeinBefund/            the app; en.lproj and de.lproj hold the strings
  Tools/{LabFile,ScanReplay,AnalyteParity,IconGen}/
  Tests/SharedTests/             Swift Testing: what the app computes
  Tests/UITests/                 XCUITest: what it shows, and what a tap does
  Scripts/                       build, install, upload, screenshots, localisation, CodeQL
  appstore/                      App Store Connect texts and the screenshot upload
```

## Bouwen en uitvoeren

```bash
cd clients/ios
brew install xcodegen                          # once
swift test                                     # the Shared package, on the Mac
swift run AnalyteParity                        # the generated table agrees with its source
xcodegen generate && open MeinBefund.xcodeproj # then run the MeinBefund scheme in Xcode
```

Let vanaf de opdrachtregel naar een simulator op de **ad-hochandtekening**:
zonder die mislukt elke aanroep van de sleutelhanger met [`-34018`](https://developer.apple.com/documentation/security/errsecmissingentitlement) en kan de opslag
zijn sleutel niet aanmaken.

```bash
xcodebuild -project MeinBefund.xcodeproj -scheme MeinBefund \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=YES build
```

Op een aangesloten iPhone: [`Scripts/install-device.sh`](../../clients/ios/Scripts/install-device.sh). Het gegenereerde project
bevat geen ondertekeningsteam, dus een kale `xcodebuild` voor een apparaat mislukt; het
script vult er een in uit `TEAM_ID` of uit de sleutelhanger, en installeert wat het
heeft gebouwd. TestFlight: [`Scripts/archive-and-upload.sh`](../../clients/ios/Scripts/archive-and-upload.sh); de kop ervan noemt de vier
dingen die eerst in het Apple Developer-account moeten bestaan. De versie is
vastgelegd in `project.yml`: `MARKETING_VERSION` komt overeen met het record in [App Store Connect](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)
en `CURRENT_PROJECT_VERSION` stijgt bij elke upload, omdat App
Store Connect een buildnummer dat het al heeft gezien weigert, en wel pas na de upload.

## Demogegevens en startargumenten

<img src="img/list.png" width="300" alt="De lijst met rapporten gevuld door de ontwikkeldataset: zeven fictieve rapporten van een laboratorium, een praktijk en een studiecentrum over drie jaar"> <img src="img/detail.png" width="300" alt="Een fictief rapport uit de ontwikkeldataset, met te controleren waarden en de lijsten met niet-gekoppelde en niet-gelezen regels">

Elk startargument hieronder bestaat alleen in een Debug-build. De controles zijn
`#if DEBUG`, niet alleen een vlag: een vlag kan worden ontdekt, code die niet
is gecompileerd niet.

| Argument               | Wat het doet                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-MBDemoSeed`          | Twee fictieve rapporten, alleen in het geheugen. Genoeg voor een schermafbeelding; hiermee start elke UI-test.                                                                 |
| `-MBDevData`           | Zeven fictieve rapporten over drie jaar en vier bronnen, in code opgebouwd: een trend heeft vorm, de lijst met niet-gekoppelde regels heeft rijen, elk rapport heeft pagina’s. |
| `-MBShot <screen>`     | Opent een scherm direct zodra de rapporten zijn geladen: `list detail scan trends reference history profile consent settings privacy consents connect`.                        |
| `-MBSelfTest`          | Stuurt één synthetisch rapport door de hele pipeline in het app-target en logt 27 controles (zie [De zelftest](#the-self-test)).                                               |
| `-MBExportDiagnostics` | Bouwt het diagnostiekarchief in de tijdelijke map van de app voor [`Scripts/pull-diagnostics.sh`](../../clients/ios/Scripts/pull-diagnostics.sh).                              |

De ontwikkeldataset wordt **opgebouwd, niet opgeslagen**. Een rij vermeldt het label, de waarde,
de eenheid en het bereik dat het laboratorium heeft afgedrukt, en [`Analytes.lookup`](../../clients/ios/Sources/Shared/Analytes.generated.swift#L2775) codeert haar
precies zoals het een scan codeert. Geen enkele code in de dataset kan fout zijn, een rij die het
woordenboek niet kan coderen, komt vanzelf in de lijst met niet-gekoppelde regels terecht, en de
dataset volgt het woordenboek wanneer het woordenboek verandert. De pagina’s worden
getekend door [`SyntheticSheet`](../../clients/ios/Sources/Shared/SyntheticSheet.swift), dezelfde renderer die de tests lezen.

Een demostart vergrendelt nooit: de appvergrendeling leest de seedvlag en blijft open,
zodat de UI-tests en het schermafbeeldingsscript draaien waar niemand een
vraag om de toegangscode kan beantwoorden. In een release-build bestaan noch de vlag noch de uitzondering.

Schermafbeeldingen voor de documentatie en de App Store komen uit één script,
dat elk scherm via een argument start in plaats van via gescripte tikken, zodat
een nieuwe opname na een lay-outwijziging geen nieuwe coördinaten nodig heeft:

```bash
SEED=-MBDevData OUT=/tmp/shots SCREENS="list detail trends" Scripts/capture-screenshots.sh
Scripts/capture-screenshots.sh                 # the App Store set, size-checked, into appstore/screenshots/en
```

## Van de camera naar de opslag

![De scanpipeline als sequentie: de scanner van de app geeft de pagina’s door aan LabImport, dat de herkomst bepaalt, de tekst herkent of leest, de doorgangen op elkaar afstemt, de rollen van de kolommen afleidt, elke rij tegen het gegenereerde woordenboek parseert, de kop leest en het resultaat doorgeeft aan het controlescherm en daarna aan de verzegelde opslag](img/klarbefund-scan-pipeline.svg)

Bron: [`diagrams/klarbefund-scan-pipeline.puml`](diagrams/klarbefund-scan-pipeline.puml).

De volgorde ligt vast en elke stap heeft één eigenaar
([ADR-033](../ADRs/ADR-033-lab-report-extraction-pipeline.md)):

1. **Eerst de herkomst.** [`LabImport`](../../clients/ios/Sources/Shared/LabImport.swift) beslist op basis van het bestand, nooit op basis van de
   extensie: een pdf met de eigen tekstlaag van het laboratorium is
   `lab-issued-digital` en de Observations ervan zijn `final`; alles wat
   door de tekstherkenning moet, is `ocr-transcribed` en `preliminary`. Dat is
   bewust streng, omdat het markeren van een transcriptie als `final` de fout is
   die ertoe doet.
2. **Herkenning.** [`VisionDocumentReader`](../../clients/ios/Sources/Shared/VisionDocumentReader.swift) voert twee [Vision](https://developer.apple.com/documentation/vision/recognizing-text-in-images)-doorgangen uit, Duits en
   Engels, met taalcorrectie **uit**: `Lp(a)` of een
   decimale komma “corrigeren” is ronduit schadelijk. [`DocumentReconciler`](../../clients/ios/Sources/Shared/DocumentReconciler.swift) voegt de doorgangen samen
   en [`TableRoles`](../../clients/ios/Sources/Shared/TableRoles.swift) leidt per tabel af welke kolom het label, de waarde, de eenheid
   en het bereik bevat.
3. **Parseren.** [`LabLineParser`](../../clients/ios/Sources/Shared/LabLineParser.swift) leest elke rij. Wanneer het gewone parseren
   niets vindt, zijn de bladlezers aan de beurt: ambulante bloeddruk,
   rust- en inspannings-ecg, Holter, cardiopulmonale inspanningstest, lactaat,
   CGM-glucoseprofiel, DXA en het scherm van een lichaamsanalyseweegschaal, dat
   een dashboard is en geen rapport, en alleen op de hoofdwaarde wordt gelezen.
4. **Coderen.** [`Analytes.lookup(label, unit)`](../../clients/ios/Sources/Shared/Analytes.generated.swift#L2775) kiest de LOINC-code. De eenheid
   beslist, nooit de naam alleen. Een grootheid die LOINC niet codeert (visceraal vet
   als massa, een waterverhouding), wordt meegenomen met haar eenheid, zonder code en met een verplichte
   reden; een organisme uit een ontlastingsonderzoek draagt zijn [NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy)-id,
   omdat LOINC tests benoemt en geen organismen.
5. **De kop.** [`ReportMetadata`](../../clients/ios/Sources/Shared/ReportMetadata.swift) en [`PrintedFields`](../../clients/ios/Sources/Shared/PrintedFields.swift) lezen het laboratorium,
   de labdatum, de uitgiftedatum en het rapportnummer van het blad; de labdatum
   heeft voorrang boven de ontvangst- en uitgiftedatum, en de persoon bevestigt
   haar vóór het opslaan.
6. **Behoud.** Elke rij die op een meting lijkt, eindigt als gecodeerd,
   niet-gekoppeld of niet-gelezen. Een rij in geen van de drie is niet te onderscheiden van
   een rij die nooit is afgedrukt, en precies zo raakte er ooit een HbA1c-rij
   zoek ([`docs/gotchas.md`](../gotchas.md#2026-09-19-the-measurement-that-justified-the-ocr-hybrid-was-taken-on-the-wrong-os), 2026-09-19). De zelftest controleert dit.
7. **Controleren en opslaan.** [`ReviewViews`](../../clients/ios/Sources/MeinBefund/ReviewViews.swift) toont wat is gelezen; [`ReportStore`](../../clients/ios/Sources/MeinBefund/ReportStore.swift)
   verzegelt het.

`swift run LabFile ~/Downloads/befund.pdf` voert de stappen 1 tot en met 6 uit op een Mac en
toont de herkomst, de kop en elke rij als gecodeerd, niet-gekoppeld of
niet-gelezen; `--values` voegt de getallen toe, `--rows` voegt de lay-out van de tekstherkenning toe.
Het weigert een pad binnen deze repository.

## De opslag en de vergrendeling

Drie verzegelde bestanden per rapport onder `Application Support/Reports`, elk
[AES-GCM](https://developer.apple.com/documentation/cryptokit/aes/gcm) onder dezelfde sleutel uit de sleutelhanger, [volledige bestandsbeveiliging](https://developer.apple.com/documentation/foundation/nsfileprotectioncomplete), [uitgesloten van
reservekopieën](https://developer.apple.com/documentation/foundation/urlresourcevalues/isexcludedfrombackup):

```
<id>.sealed         the record (LabReport)
<id>.scan.sealed    the pages as one PDF
<id>.diag.sealed    the scan's diagnostics (ScanDiagnostics)
profile.sealed      sex, date of birth, height (Profile)
consents.sealed     the three consent decisions (ConsentLedger)
```

De sleutel is [`ThisDeviceOnly`](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly) en niet beschikbaar zolang de telefoon vergrendeld is, zodat een
kopie van de container alleen versleutelde tekst oplevert en de eigen momentopname die het systeem van de app maakt
mislukt met `EPERM`; [`SecurityPostureTests`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift) legt de build-instellingen vast en de
[zelfbeoordeling](self-assessment.md) registreert de meting. Records
die zijn geschreven voordat een veld bestond, laten zich nog steeds decoderen: elk later veld is optioneel of
heeft een standaardwaarde.

De appvergrendeling ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md))
bestaat uit twee typen. [`AppLockPolicy`](../../clients/ios/Sources/Shared/AppLockPolicy.swift) in Shared beslist _of_ een controle nodig is
en is puur, zodat [`AppLockPolicyTests`](../../clients/ios/Tests/SharedTests/AppLockPolicyTests.swift) op een Mac draait; [`AppLock`](../../clients/ios/Sources/MeinBefund/AppLock.swift) in de app vraagt
[LocalAuthentication](https://developer.apple.com/documentation/localauthentication) _hoe_, met Face ID, Touch ID of de toegangscode, en
[`PrivacyCover`](../../clients/ios/Sources/MeinBefund/PrivacyCover.swift) tekent de afdekking die de appkiezer ziet. Dezelfde ADR legt uit waarom
certificate pinning en jailbreakdetectie zijn afgewezen.

## Het woordenboek wordt gegenereerd, nooit gekopieerd

[`Sources/Shared/Analytes.generated.swift`](../../clients/ios/Sources/Shared/Analytes.generated.swift), [`ReferenceRanges.generated.swift`](../../clients/ios/Sources/Shared/ReferenceRanges.generated.swift)
en [`PromptText.generated.swift`](../../clients/ios/Sources/Shared/PromptText.generated.swift) worden gemaakt uit
[`services/epa-ingest`](../../services/epa-ingest):

```bash
cd services/epa-ingest && npm run generate:swift
cd clients/ios && swift run AnalyteParity      # 1760 codings, 96 units on 2026-11-07
```

Bewerk ze niet met de hand. Voeg een analyt toe aan [`analytes.ts`](../../services/epa-ingest/src/analytes.ts) of een bereik aan
[`reference-ranges.ts`](../../services/epa-ingest/src/reference-ranges.ts), genereer opnieuw en commit beide. CI faalt wanneer een gegenereerd bestand
niet meer aansluit op zijn bron, omdat een verouderde kopie precies de stille
afwijking is die de monorepo moest voorkomen: een iPhone die Lp(a) op de ene manier codeert
en de ingestdienst op een andere, opgemerkt wanneer een waarde bij een arts terechtkomt.

De generator voor referentiebereiken weigert een bereik waarvan het woordenboek de analyt
niet kent of waarvan de eenheid voor die analyt niet is gedefinieerd. Alleen analyten met
een citeerbare gepubliceerde bron krijgen een bereik
([ADR-039](../ADRs/ADR-039-published-reference-ranges.md)); voor elke andere
analyt tekent het scherm Trends het bereik dat het eigen laboratorium van de persoon heeft afgedrukt.

## Tests, en waarvoor elk dient

```bash
swift test                                     # Swift Testing: what the app computes
Scripts/run-ui-tests.sh                        # XCUITest: what it shows, and what a tap does
swift test --filter AccuracyBenchmarkTests     # the accuracy benchmark; KLARBEFUND_BENCHMARK_OUT=<file> writes its JSON
swift test --filter SecurityPostureTests       # the build settings the self-assessment relies on
```

**De unitsuite** ([`Tests/SharedTests/`](../../clients/ios/Tests/SharedTests/), [Swift Testing](https://developer.apple.com/documentation/testing)) is de grootste en vangt op wat
te beredeneren is: een eenheid die de verkeerde code kiest, een datum die van de
verkeerde regel wordt gelezen, een exportkolom op de verkeerde plaats. [`FhirBundleParityTests`](../../clients/ios/Tests/SharedTests/FhirBundleParityTests.swift) legt
de bundel vast op de referentiebundel die `services/epa-ingest` schrijft, zodat beide schrijvers
dezelfde FHIR uitvoeren voor hetzelfde blad.

**De UI-suite** ([`Tests/UITests/`](../../clients/ios/Tests/UITests/), [XCUITest](https://developer.apple.com/documentation/xctest/xcuiapplication)) bestaat omdat de unitsuite geen enkele
van de laatste defecten heeft gevonden: een kaart die aan de rand van de grafiek werd afgekapt, een selectie
die zichzelf bij de volgende render vergat, `LOINC Optional("2093-3")` op het ene
scherm dat een persoon met het eigen papier vergelijkt. Elke test start met
`-MBDemoSeed` en bereikt zijn scherm met `-MBShot`, zodat hij breekt wanneer verandert wat hij
controleert en niet wanneer een knop verschuift. Drie dingen die met vallen en opstaan zijn geleerd,
staan in [`docs/gotchas.md`](../gotchas.md#2026-09-20--an-accessibilityidentifier-on-a-chart-renames-everything-inside-it): een `accessibilityIdentifier` op een container hernoemt
alles erin; een `Button` waarvan het label `Color.clear` is, staat niet in de
toegankelijkheidsboom; de selectie van [Swift Charts](https://developer.apple.com/documentation/charts) reageert op een vinger en niet op een
gesynthetiseerde tik, dus liggen er echte knoppen over de markeringen.

### De zelftest

Alles na de camera draait in het app-target en dus niet in
`swift test`: de verzegelde opslag, de pdf van de pagina’s, de export. `-MBSelfTest`
stuurt één synthetisch rapport door de hele keten en logt elk van zijn 27
controles: herkenning en codering, een bronvermelding per waarde, de labdatum gelezen uit de
kop, de pagina’s als pdf, het ontsleutelen van de drie verzegelde bestanden, het opnieuw afspelen
van het diagnostiekrecord dat de extractie exact reproduceert, het bouwen van het archief,
en de export voor de arts die met de bijgevoegde pagina’s binnen de 25 MB van de ePA past.

```bash
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest
xcrun simctl spawn <udid> log show --last 2m --predicate 'subsystem == "red.mabu.meinbefund"' --style compact
```

### De nauwkeurigheidsbenchmark

[`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift) leest synthetische bladen met bekende inhoud met Vision en schrijft,
als `KLARBEFUND_BENCHMARK_OUT` is gezet, de nauwkeurigheid op veldniveau als JSON; de gepubliceerde kopie is
[`docs/klarbefund/accuracy-benchmark.json`](accuracy-benchmark.json), en [`ExtractionAccuracyTests`](../../clients/ios/Tests/SharedTests/ExtractionAccuracyTests.swift)
test de maat zelf. De pagina [bewijs](evidence.md) citeert die en [run-on-mac](run-on-mac.md)
reproduceert elk getal. Een echt rapport wordt op dezelfde manier gemeten, op de
eigen Mac van de persoon en nooit in de repository, met `ScanReplay --truth`
tegen een met de hand geschreven `truth.json` naast de export: het toont welke velden
van welke rijen fout waren, nooit de waarden.

## Een verkeerd gelezen blad debuggen

De opslag levert alleen versleutelde tekst op, dus bewijsmateriaal verlaat de telefoon via de eigen functie
**Diagnostiek exporteren** van de app, die in woorden om bevestiging vraagt en een
zip aan het deelmenu overhandigt
([ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)):

```
klarbefund-diagnostics-<date>/
  about.json                 build, device, dictionary size, counts
  log.txt                    this session's log lines: counts and codes only
  <title>-<id8>/
    report.json              the stored record: values, metadata, page text
    diagnostics.json         both Vision passes, the reconciled rows, the layout
    scan.pdf                 the pages as scanned
```

Met de telefoon via USB aangesloten en een Debug-build geïnstalleerd, doet
`Scripts/pull-diagnostics.sh` de export en het uitpakken in één keer, onder
`~/Downloads`. Pak uit **buiten deze repository**, en daarna:

```bash
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date>          # every report, with the current parser
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date> --ocr    # re-run Vision on scan.pdf
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date> --truth  # accuracy against truth.json
```

Het opnieuw afspelen toont wat de telefoon heeft gecodeerd, wat nu codeert, wat nieuw gecodeerd
of verloren is, en elke rij met haar reden. Voeg een analyt toe aan [`analytes.ts`](../../services/epa-ingest/src/analytes.ts),
genereer opnieuw, speel opnieuw af en zie de rijen van het echte blad van niet-gekoppeld naar
gecodeerd gaan zonder het opnieuw te scannen. Beide tools weigeren een pad binnen
`clients/ios/`.

## De verbinding met de EHDS-hub

Het patiëntenscherm van de hub start een [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8628) device grant voor de openbare
[Keycloak](https://www.keycloak.org/docs/latest/server_admin/#device-authorization-grant)-client `klarbefund-app` en toont die als een QR-code met een
`klarbefund://connect`-link; de app vraagt Keycloak herhaaldelijk om het token en
registreert zich bij de hub
([ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)).

- [`Shared/EHDSConnect.swift`](../../clients/ios/Sources/Shared/EHDSConnect.swift): de link, geweigerd tenzij de hub en de uitgever ervan
  op `TrustedHub.production` staan (plus `.development` in een debug-build), en de
  poller met zijn vier antwoorden. [`EHDSConnectTests`](../../clients/ios/Tests/SharedTests/EHDSConnectTests.swift) dekt elk ervan af.
- [`EHDSConnection.swift`](../../clients/ios/Sources/MeinBefund/EHDSConnection.swift): tokens en een apparaat-id in de sleutelhanger als
  `ThisDeviceOnly`, verversen, registreren, het dossier lezen, ontkoppelen (wat
  het refresh token bij Keycloak intrekt), en de twee synchronisatieschakelaars.
- [`ConnectView.swift`](../../clients/ios/Sources/MeinBefund/ConnectView.swift): het sheet, de gegevensscanner van [VisionKit](https://developer.apple.com/documentation/visionkit/datascannerviewcontroller) alleen voor QR-codes,
  een plakveld en “Is dit uw account?”.
- **Een EHDS-account aanmaken** ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md))
  roept de twee routes van de hub aan die zonder sessie antwoorden; het account
  wordt alleen aangemaakt voor een verzoek waarvan de Apple [App Attest](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server)-attestatie kan worden geverifieerd,
  en daarom toont de simulator de knop uitgeschakeld met de reden.
- **Mijn rapporten sturen** en **Mijn apparaattrends sturen**
  ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)) posten
  naar het eigen dossier van de persoon; het dossier zelf bevat rapporten, vaccinaties
  en het medicatieoverzicht ([ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)).
- [`ConnectUITests`](../../clients/ios/Tests/UITests/ConnectUITests.swift) en [`AccountUITests`](../../clients/ios/Tests/UITests/AccountUITests.swift) draaien tegen `DemoEHDSTransport` onder
  `-MBDemoSeed`; [`LiveConnectUITests`](../../clients/ios/Tests/UITests/LiveConnectUITests.swift) en [`LiveAccountUITests`](../../clients/ios/Tests/UITests/LiveAccountUITests.swift) draaien tegen een
  echte hub wanneer ze een verse link krijgen
  ([`docs/knowledge/runbooks/klarbefund-connect.md`](../knowledge/runbooks/klarbefund-connect.md)).

## Exports

| Actie                            | Schrijver                                                                                                                                    | Inhoud                                                                                                                                                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delen voor mijn arts             | [`ReportExport`](../../clients/ios/Sources/MeinBefund/ReportExport.swift), [`FhirBundle`](../../clients/ios/Sources/Shared/FhirBundle.swift) | Pdf-samenvatting met de originele pagina’s als bijlage, plus een FHIR R4-bundel                                                                                                                                                                                                 |
| Exporteren voor onderzoek (OMOP) | [`OmopExport`](../../clients/ios/Sources/Shared/OmopExport.swift)                                                                            | OMOP CDM v5.4 [`measurement.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#measurement), [`person.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#person), [`observation_period.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#observation_period) |
| Al mijn gegevens exporteren      | [`DataExport`](../../clients/ios/Sources/MeinBefund/DataExport.swift)                                                                        | elk rapport, elke pagina, elke waarde, elk profielveld en elke toestemming, als JSON en pdf’s                                                                                                                                                                                   |
| Diagnostiek exporteren           | [`DiagnosticsBundle`](../../clients/ios/Sources/Shared/DiagnosticsBundle.swift)                                                              | het record, beide Vision-doorgangen, de pagina’s, het sessielogboek                                                                                                                                                                                                             |

De OMOP-tabellen bevatten overal `measurement_concept_id = 0`, met opzet:
LOINC koppelen aan een OMOP-concept vereist de [Athena](https://athena.ohdsi.org/)-woordenlijst, die niet op
een telefoon staat, en een verzonnen id zou een verkeerde identificatie aan een echte
meting hangen. Het afgedrukte bereik wordt letterlijk bewaard in [`RawLabValue.referenceText`](../../clients/ios/Sources/Shared/Provenance.swift#L67)
en reist mee als [`referenceRange.text`](https://hl7.org/fhir/R4/observation-definitions.html#Observation.referenceRange.text); een bereik zonder getal erin overleeft
alleen daar, en [obs-3](https://hl7.org/fhir/R4/observation.html#invs) van FHIR staat dat toe: een referentiebereik moet minstens een ondergrens, een bovengrens of een tekst hebben.

## Talen

Engels is de basis, Duits de vertaling, volgens de taal van de telefoon.
[`Scripts/check-localization.sh`](../../clients/ios/Scripts/check-localization.sh) faalt wanneer een voor de gebruiker zichtbare string geen
Duitse vertaling heeft of wanneer een Duitse zin in de Engelse basis is blijven staan; het gebruikt
[`xcodebuild -exportLocalizations`](https://developer.apple.com/documentation/xcode/localization), dezelfde extractor die de editor van Xcode gebruikt, zodat
het SwiftUI-`Text`-literals en `INFOPLIST_KEY_*`-waarden ziet die geen grep over
de bronnen zou vinden. De toestemmingsvraag voor de camera is ooit in het Duits naar
elke Engelstalige telefoon uitgeleverd, en daarom bestaat het script.

## Statische analyse en CI

```bash
Scripts/codeql-swift.sh                        # CodeQL on the app and Shared, about 15 minutes
```

[CodeQL](https://docs.github.com/en/code-security/codeql-cli) heeft een echte build nodig om Swift te zien, dus op GitHub draait het alleen wanneer
`clients/ios/` verandert ([`.github/workflows/codeql-swift.yml`](../../.github/workflows/codeql-swift.yml)), op een macOS-runner.
De pre-push-hook `codeql-swift` voert dezelfde suite uit wanneer een push
de Swift-bronnen wijzigt; hij eindigt met 1 bij elke bevinding die niet met haar
reden in [`Scripts/codeql-accepted.txt`](../../clients/ios/Scripts/codeql-accepted.txt) staat. Swift heeft een macOS-runner nodig, die
minder gelijktijdigheid biedt dan Linux, dus de iOS-job is op pad gefilterd op
`clients/ios/**` en blokkeert nooit de web- of servicesuites; omgekeerd sluiten de
workflows voor `ui/**` en `services/**` `clients/ios/**` uit.

De beveiligingsstatus van de app, het dreigingsmodel en wat een onafhankelijke
test zou toevoegen, staan in het [dreigingsmodel](../security/threat-model-klarbefund.md),
het [beveiligingstestrapport](../security/security-test-report-2026-10-15.md)
en de [zelfbeoordeling](self-assessment.md).

## Twee regels waarover niet te onderhandelen valt

1. **Nooit gezondheidsgegevens in `clients/ios/`.** Geen labrapporten, geen scans, geen
   geëxporteerde HealthKit-archieven, geen schermafbeeldingen met echte waarden, zelfs
   niet tijdelijk, zelfs niet in gitignore. Testfixtures zijn synthetisch, zoals
   [`services/epa-ingest/__tests__/fixtures/`](../../services/epa-ingest/__tests__/fixtures/) al is. De tools weigeren om dezelfde reden een
   pad binnen de repository.
2. **Geen echte organisatie in demo-inhoud.** [`CLAUDE.md`](../../CLAUDE.md) verbiedt dit buiten
   de vlag `NEXT_PUBLIC_DEMO_TK`. De studie waarvoor deze app is gebouwd, is echt;
   het democentrum, het laboratorium en de praktijk in de ontwikkeldataset zijn
   fictief.

## Waar de beslissingen staan

| ADR                                                                                                  | Beslist                                                                  |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [ADR-033](../ADRs/ADR-033-lab-report-extraction-pipeline.md)                                         | De extractiepipeline en haar volgorde                                    |
| [ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)                                       | Diagnostiek bewaard bij de scan, geëxporteerd op verzoek                 |
| [ADR-039](../ADRs/ADR-039-published-reference-ranges.md)                                             | Alleen citeerbare gepubliceerde bereiken, naast die van het laboratorium |
| [ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)                                    | Verbinden via OAuth device grant en QR-code                              |
| [ADR-050](../ADRs/ADR-050-klarbefund-beta-by-public-testflight-link.md)                              | De bèta via een openbare TestFlight-link                                 |
| [ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)                   | Een account aanmaken, afgeschermd door App Attest                        |
| [ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)                                   | Wekelijkse apparaatgemiddelden versturen, achter een eigen schakelaar    |
| [ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)          | Wat het dossier bevat                                                    |
| [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md) | De appvergrendeling; pinning en jailbreakdetectie afgewezen              |
