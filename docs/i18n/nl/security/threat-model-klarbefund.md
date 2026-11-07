---
source: docs/security/threat-model-klarbefund.md
sourceHash: 51e257302a125e1719ff971d82f32d6b549109f005c8e3aedd44e0668236dfc2
language: nl
summary: STRIDE-analyse van de iPhone-app; elke maatregel noemt de code of test die haar aantoont.
---

# Dreigingsmodel: Klarbefund, de iPhone-app

Het dreigingsmodel van de hub is [`threat-model.md`](threat-model.md). Dit
model is voor de app in [`clients/ios`](../../clients/ios), die op de telefoon van een persoon
draait, diens laboratoriumwaarden bevat en niets naar wie dan ook stuurt
zolang die persoon dat niet zegt. Geschreven op 2026-10-15 tegen commit
[`64737039`](https://github.com/ma3u/MinimumViableHealthDataspacev2/commit/64737039); elke maatregel noemt de code of test die hem aantoont, en
[`clients/ios/Tests/SharedTests/SecurityPostureTests.swift`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift) legt de maatregelen
vast die buildinstellingen zijn. [STRIDE](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats), zoals in het model van de hub.

## Systeemcontext

```
   papieren uitslag ──camera──▶ ┌─────────────────────────────────┐
   lab-pdf ──bestanden/delen──▶ │ Klarbefund (iOS 26, Swift 6)    │
   Apple Health ──lezen───────▶ │ OCR · codering · AES-GCM-opslag │
                                └──────┬──────────┬───────────────┘
                 optioneel, toestemming│          │optioneel, toestemming
                                       ▼          ▼
                     ┌───────────────────┐   ┌────────────────────────────┐
                     │ EHDS-hub          │   │ uitlegdienst               │
                     │ (ADR-049/054/057) │   │ standaard op het apparaat; │
                     │ OIDC+PKCE, App    │   │ gehost: Azure OpenAI EU-   │
                     │ Attest, Bearer    │   │ datazone, of eigen sleutel │
                     └───────────────────┘   └────────────────────────────┘
```

De verbinding met de hub is de device grant ([ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)), het sandboxaccount met App Attest ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)) en de weekgemiddelden ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)), aangemeld met [OpenID Connect](https://openid.net/specs/openid-connect-core-1_0.html) en [PKCE S256](https://www.rfc-editor.org/rfc/rfc7636#section-4.2); [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) bewijst de app. De gehoste uitleg draait op Azure OpenAI in de [EU-datazone](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types#data-zone-standard).

Vertrouwensgrenzen: het apparaat (Secure Enclave, [Data Protection](https://support.apple.com/guide/security/data-protection-overview-secf6276da8a/web),
app-sandbox) wordt vertrouwd zoals Apple het levert. Alles wat het apparaat
verlaat, overschrijdt een grens en doet dat alleen na een toestemming die de
persoon voor dat doel heeft gegeven.

## Assets

| Asset                                         | Waar                                                                                                                                      | Waarom het ertoe doet                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Laboratoriumwaarden, uitslagen, paginabeelden | de opslag, [`ReportStore.swift`](../../clients/ios/Sources/MeinBefund/ReportStore.swift)                                                  | Gezondheidsgegevens volgens [art. 9 AVG](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_9) |
| De opslagsleutel                              | Keychain, [`WhenUnlockedThisDeviceOnly`](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly) | ontsleutelt al het bovenstaande                                                                   |
| Hubtokens (device grant, app-token)           | Keychain, `ThisDeviceOnly`, [`EHDSConnection`](../../clients/ios/Sources/MeinBefund/EHDSConnection.swift)                                 | schrijftoegang tot het eigen dossier van de persoon op de hub                                     |
| App Attest-sleutel                            | Secure Enclave, [`DeviceCheck`](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity)                  | bewijst de hub bij het aanmaken van accounts dat het om een echte app gaat                        |
| Toestemmingen en hun geschiedenis             | [`Consents.swift`](../../clients/ios/Sources/Shared/Consents.swift)                                                                       | de rechtsgrond voor elke overdracht                                                               |
| Diagnose-export                               | alleen op verzoek geschreven, [ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)                                              | bevat waarden; mag nooit in de repository terechtkomen                                            |

## STRIDE

### Spoofing (vervalsing van identiteit)

| Dreiging                                                        | Maatregel                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Status  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Een nep-app maakt hubaccounts aan of stuurt gegevens als de app | Het aanmaken van een account vereist een Apple App Attest-attestatie die de hub verifieert ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)); elke latere aanroep draagt het app-token                                                                                                                                                                                                                                  | voldaan |
| Een nep-hub verzamelt tokens                                    | OIDC-discovery alleen bij de geconfigureerde issuer, [PKCE S256](https://www.rfc-editor.org/rfc/rfc7636#section-4.2), [`ASWebAuthenticationSession`](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession); [ATS](https://developer.apple.com/documentation/security/preventing-insecure-network-connections) verbiedt platte tekst ([`OIDCSession.swift`](../../clients/ios/Sources/MeinBefund/OIDCSession.swift)) | voldaan |
| Een nep-uitlegdienst leest waarden                              | De aanbieder wordt genoemd in het verzoek dat de persoon goedkeurt ([`CloudConsentSheet.swift`](../../clients/ios/Sources/MeinBefund/CloudConsentSheet.swift)); HTTPS door [ATS](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)                                                                                                                                                                               | voldaan |
| Iemand anders bij de ontgrendelde telefoon                      | App-vergrendeling: Face ID, Touch ID of de toegangscode voordat de afdekking wegvalt, standaard aan ([`AppLock.swift`](../../clients/ios/Sources/MeinBefund/AppLock.swift), [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md))                                                                                                                                                                          | voldaan |

### Tampering (manipulatie)

| Dreiging                                                            | Maatregel                                                                                                                                                                                                                            | Status       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| Opgeslagen records gewijzigd op schijf of via een kabel             | Elk record verzegeld met AES-GCM (geauthenticeerd), sleutel in de Keychain; een kabeltest kon geen opgeslagen gegevens kopiëren                                                                                                      | voldaan      |
| Een verkeerd gelezen waarde wordt behandeld als laboratoriumuitslag | De herkomstregistratie houdt OCR-waarden op `preliminary`; alleen de tekstlaag van een pdf van het laboratorium zelf levert `final` op ([`Provenance.swift`](../../clients/ios/Sources/Shared/Provenance.swift))                     | voldaan      |
| Een gemanipuleerde build                                            | App Attest bewijst de app tegenover de hub, niet tegenover zichzelf; detectie van jailbreak en debugger met redenen afgewezen ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)) | geaccepteerd |
| Een afhankelijkheid met een achterdeur                              | Helemaal geen pakket van derden ([`Package.swift`](../../clients/ios/Package.swift), [`project.yml`](../../clients/ios/project.yml), [`docs/sbom/klarbefund-ios.cdx.json`](../sbom/klarbefund-ios.cdx.json))                         | voldaan      |

### Repudiation (ontkenning)

| Dreiging                                               | Maatregel                                                                                                                                                                                                                                                                               | Status  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| "Voor die overdracht heb ik nooit toestemming gegeven" | Toestemmingsgebeurtenissen met tijdstip, houder van gezondheidsgegevens en ingangsdatum, intrekbaar, met geschiedenis ([`Consents.swift`](../../clients/ios/Sources/Shared/Consents.swift))                                                                                             | voldaan |
| Wat er is verzonden, valt niet te reconstrueren        | Een synchronisatie is een [FHIR-Bundle](https://hl7.org/fhir/R4/bundle.html) met een SHA-256-vingerafdruk die de app vastlegt ([`EHDSConnection.swift`](../../clients/ios/Sources/MeinBefund/EHDSConnection.swift), [ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)) | voldaan |

### Information disclosure (openbaarmaking van informatie)

| Dreiging                                                        | Maatregel                                                                                                                                                                                                                                                                                                                  | Status       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Waarden verlaten het apparaat zonder tussenkomst van de persoon | OCR, codering, analyse en export op het apparaat; de enige netwerkaanroepen zijn de twee optionele hierboven, elk achter een eigen toestemming                                                                                                                                                                             | voldaan      |
| Back-ups of iCloud nemen de opslag mee                          | [Opslag uitgesloten van back-up](https://developer.apple.com/documentation/foundation/urlresourcevalues/isexcludedfrombackup); [`NSFileProtectionComplete`](https://developer.apple.com/documentation/foundation/nsfileprotectioncomplete) als standaard; exports en diagnosegegevens geschreven met volledige bescherming | voldaan      |
| De appkiezer toont waarden                                      | [`PrivacyCover.swift`](../../clients/ios/Sources/MeinBefund/PrivacyCover.swift) dekt het venster af wanneer de app niet actief is                                                                                                                                                                                          | voldaan      |
| Logs bevatten waarden                                           | Logregels bevatten alleen aantallen en codes ([`Logging.swift`](../../clients/ios/Sources/Shared/Logging.swift))                                                                                                                                                                                                           | voldaan      |
| Een cloudvraag identificeert de persoon                         | Hoogstens 40 waarden, geen naam, geboortedatum of verzekeringsnummer; de dienst dwingt hetzelfde af ([`CloudAnalysis.swift`](../../clients/ios/Sources/Shared/CloudAnalysis.swift), [ADR-034](../ADRs/ADR-034-claude-workload-identity-federation.md))                                                                     | voldaan      |
| Doorgifte naar een derde land                                   | Standaard op het apparaat; gehoste standaard Azure OpenAI in de [EU-datazone](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types#data-zone-standard); de Anthropic-optie is opt-in en vermeldt "United States" (Verenigde Staten)                                                           | gedeeltelijk |
| Schermafbeeldingen of schermopnamen                             | Niet verhinderd (iOS staat geen betrouwbare blokkade toe)                                                                                                                                                                                                                                                                  | geaccepteerd |

### Denial of service (dienstweigering)

| Dreiging                                | Maatregel                                                                                                                                                                                                                                                                                       | Status       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| De hub is onbereikbaar                  | De app werkt zonder de hub; het dossier staat op het apparaat                                                                                                                                                                                                                                   | voldaan      |
| Een vijandige scan overspoelt de parser | Vision en de parser werken op begrensde afbeeldingen; een slechtere scan verliest rijen, maar loopt nooit vast ([`ScanningTests.swift`](../../clients/ios/Tests/SharedTests/ScanningTests.swift), [`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift)) | voldaan      |
| Verloren telefoon                       | Export in vier formaten die de persoon zelf bewaart; bewust geen herstel vanuit de hub                                                                                                                                                                                                          | geaccepteerd |

### Elevation of privilege (verhoging van bevoegdheden)

| Dreiging                               | Maatregel                                                                                                                                                                                                                                                                                               | Status  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Debug-ingangen in een release-build    | `-MBSelfTest`, `-MBDemoSeed`, `-MBShot` worden weggecompileerd (`#if DEBUG`)                                                                                                                                                                                                                            | voldaan |
| De app schrijft naar Apple Health      | [Alleen-lezen-autorisatie](https://developer.apple.com/documentation/healthkit/protecting-user-privacy) ([`WearableSource.swift`](../../clients/ios/Sources/MeinBefund/WearableSource.swift)); vastgelegd door [`SecurityPostureTests`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift) | voldaan |
| Het app-token kan meer dan het dossier | De hub beperkt de scope van het token tot het sandboxdossier van dat account; `isSandboxUsername` op elke app-route                                                                                                                                                                                     | voldaan |

## Restrisico's en wat ze sluit

1. **App-vergrendeling**: besloten en geïmplementeerd op 2026-10-15 ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)). ([TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) O.Auth)
2. **Geen detectie van manipulatie of jailbreak**: met redenen afgewezen in [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md); de verzegelde opslag en App Attest zijn de controles. (O.Resi)
3. **Geen certificate pinning**: met redenen afgewezen in [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md); ATS zonder uitzonderingsdomein, beheerde rotatie. (O.Ntwk)
4. **Gehoste Anthropic-optie.** Opt-in, op het scherm genoemd, maar een
   doorgifte naar de Verenigde Staten; de beheerder heeft een grondslag voor
   doorgifte nodig of moet de optie uitschakelen.
5. **Onafhankelijke test.** Dit model en de tests zijn van het project zelf.
   Een onafhankelijke penetratietest tegen een release-build op een apparaat,
   en de TR-03161-lijst met tekortkomingen op het niveau van de eisen, staan
   nog open; zie
   [`security-test-report-2026-10-15.md`](security-test-report-2026-10-15.md).
