---
source: docs/security/threat-model-klarbefund.md
sourceHash: 51e257302a125e1719ff971d82f32d6b549109f005c8e3aedd44e0668236dfc2
language: de
summary: STRIDE-Analyse der iPhone-App; jede Gegenmaßnahme nennt den Code oder Test, der sie belegt.
---

# Bedrohungsmodell: Klarbefund, die iPhone-App

Das Bedrohungsmodell des Hubs ist [`threat-model.md`](threat-model.md). Dieses
hier gilt für die App in [`clients/ios`](../../clients/ios), die auf dem Telefon einer Person
läuft, deren Laborwerte enthält und nichts irgendwohin sendet, sofern die
Person es nicht sagt. Verfasst am 2026-10-15 auf Basis von Commit [`64737039`](https://github.com/ma3u/MinimumViableHealthDataspacev2/commit/64737039);
jede Gegenmaßnahme nennt den Code oder Test, der sie belegt, und
[`clients/ios/Tests/SharedTests/SecurityPostureTests.swift`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift) sichert diejenigen
ab, die Build-Einstellungen sind. [STRIDE](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats), wie im Modell des Hubs.

## Systemkontext

```
   Papierbefund ──Kamera───────▶ ┌────────────────────────────────────┐
   Labor-PDF ──Dateien/Teilen──▶ │ Klarbefund (iOS 26, Swift 6)       │
   Apple Health ──Lesen────────▶ │ OCR · Kodierung · AES-GCM-Speicher │
                                 └──────┬──────────┬──────────────────┘
                  optional, Einwilligung│          │optional, Einwilligung
                                        ▼          ▼
                      ┌───────────────────┐   ┌──────────────────────────────────────┐
                      │ EHDS-Hub          │   │ Erklärdienst                         │
                      │ (ADR-049/054/057) │   │ standardmäßig auf dem Gerät;         │
                      │ OIDC+PKCE, App    │   │ gehostet: Azure OpenAI,              │
                      │ Attest, Bearer    │   │ EU-Datenzone, oder eigener Schlüssel │
                      └───────────────────┘   └──────────────────────────────────────┘
```

Die Verbindung zum Hub ist die Gerätefreigabe ([ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)), das Sandbox-Konto mit App Attest ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)) und die Wochenmittel ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)), angemeldet mit [OpenID Connect](https://openid.net/specs/openid-connect-core-1_0.html) und [PKCE S256](https://www.rfc-editor.org/rfc/rfc7636#section-4.2); [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) weist die App nach. Die gehostete Erklärung läuft auf Azure OpenAI in der [EU-Datenzone](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types#data-zone-standard).

Vertrauensgrenzen: Dem Gerät (Secure Enclave, [Data Protection](https://support.apple.com/guide/security/data-protection-overview-secf6276da8a/web), App-Sandbox)
wird so vertraut, wie Apple es bereitstellt. Alles, was das Gerät verlässt,
überquert eine Grenze und tut das nur nach einer Einwilligung, die die Person
für genau diesen Zweck gegeben hat.

## Schutzgüter

| Schutzgut                           | Speicherort                                                                                                                               | Warum es wichtig ist                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Laborwerte, Befunde, Seitenbilder   | der Speicher, [`ReportStore.swift`](../../clients/ios/Sources/MeinBefund/ReportStore.swift)                                               | Gesundheitsdaten nach [Art. 9 DSGVO](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_9) |
| Der Speicherschlüssel               | Keychain, [`WhenUnlockedThisDeviceOnly`](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly) | entschlüsselt alles oben Genannte                                                             |
| Hub-Token (Device Grant, App-Token) | Keychain, `ThisDeviceOnly`, [`EHDSConnection`](../../clients/ios/Sources/MeinBefund/EHDSConnection.swift)                                 | Schreibzugriff auf die eigene Akte der Person im Hub                                          |
| App-Attest-Schlüssel                | Secure Enclave, [`DeviceCheck`](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity)                  | weist dem Hub beim Erstellen von Konten eine echte App nach                                   |
| Einwilligungen und ihr Verlauf      | [`Consents.swift`](../../clients/ios/Sources/Shared/Consents.swift)                                                                       | die Rechtsgrundlage für jede Übermittlung                                                     |
| Diagnose-Export                     | nur auf Anforderung geschrieben, [ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)                                           | enthält Werte; darf nie in das Repository gelangen                                            |

## STRIDE

### Spoofing (Vortäuschung einer Identität)

| Bedrohung                                                                | Gegenmaßnahme                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Eine gefälschte App erstellt Hub-Konten oder überträgt Daten als die App | Die Kontoerstellung erfordert eine Apple-App-Attest-Attestierung, die der Hub verifiziert ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)); jeder spätere Aufruf trägt das App-Token                                                                                                                                                                                                                         | erfüllt |
| Ein gefälschter Hub greift Token ab                                      | OIDC-Discovery nur vom konfigurierten Issuer, [PKCE S256](https://www.rfc-editor.org/rfc/rfc7636#section-4.2), [`ASWebAuthenticationSession`](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession); [ATS](https://developer.apple.com/documentation/security/preventing-insecure-network-connections) verbietet Klartext ([`OIDCSession.swift`](../../clients/ios/Sources/MeinBefund/OIDCSession.swift)) | erfüllt |
| Ein gefälschter Erklärdienst liest Werte                                 | Der Anbieter wird in der Anfrage genannt, die die Person freigibt ([`CloudConsentSheet.swift`](../../clients/ios/Sources/MeinBefund/CloudConsentSheet.swift)); HTTPS durch [ATS](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)                                                                                                                                                                     | erfüllt |
| Jemand anderes am entsperrten Telefon                                    | App-Sperre: Face ID, Touch ID oder der Gerätecode, bevor sich die Abdeckung hebt, standardmäßig aktiv ([`AppLock.swift`](../../clients/ios/Sources/MeinBefund/AppLock.swift), [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md))                                                                                                                                                              | erfüllt |

### Tampering (Manipulation)

| Bedrohung                                                               | Gegenmaßnahme                                                                                                                                                                                                                                   | Status     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Gespeicherte Einträge auf dem Datenträger oder über ein Kabel verändert | Jeder Eintrag mit AES-GCM versiegelt (authentifiziert), Schlüssel in der Keychain; ein Kabeltest konnte keine gespeicherten Daten kopieren                                                                                                      | erfüllt    |
| Ein falsch gelesener Wert wird als Laborergebnis behandelt              | Die Provenienz hält OCR-Werte auf `preliminary`; nur die Textebene eines PDFs, das vom Labor selbst stammt, ergibt `final` ([`Provenance.swift`](../../clients/ios/Sources/Shared/Provenance.swift))                                            | erfüllt    |
| Ein manipulierter Build                                                 | App Attest weist die App gegenüber dem Hub nach, nicht gegenüber sich selbst; Jailbreak- und Debugger-Erkennung mit Begründung abgelehnt ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)) | akzeptiert |
| Eine Abhängigkeit mit Hintertür                                         | Überhaupt kein Paket von Drittanbietern ([`Package.swift`](../../clients/ios/Package.swift), [`project.yml`](../../clients/ios/project.yml), [`docs/sbom/klarbefund-ios.cdx.json`](../sbom/klarbefund-ios.cdx.json))                            | erfüllt    |

### Repudiation (Abstreitbarkeit)

| Bedrohung                                           | Gegenmaßnahme                                                                                                                                                                                                                                                                                     | Status  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| „Dieser Übermittlung habe ich nie zugestimmt“       | Einwilligungsereignisse mit Zeitpunkt, Gesundheitsdateninhaber und Wirksamkeitsdatum, widerrufbar, mit Verlauf ([`Consents.swift`](../../clients/ios/Sources/Shared/Consents.swift))                                                                                                              | erfüllt |
| Was gesendet wurde, lässt sich nicht rekonstruieren | Eine Synchronisierung ist ein [FHIR-Bundle](https://hl7.org/fhir/R4/bundle.html) mit einem SHA-256-Fingerabdruck, den die App speichert ([`EHDSConnection.swift`](../../clients/ios/Sources/MeinBefund/EHDSConnection.swift), [ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)) | erfüllt |

### Information disclosure (Offenlegung von Informationen)

| Bedrohung                                       | Gegenmaßnahme                                                                                                                                                                                                                                                                                                               | Status     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Werte verlassen das Gerät ohne Zutun der Person | OCR, Kodierung, Analyse und Export auf dem Gerät; die einzigen Netzwerkaufrufe sind die beiden optionalen oben, jeder hinter seiner eigenen Einwilligung                                                                                                                                                                    | erfüllt    |
| Backups oder iCloud enthalten den Speicher      | [Speicher vom Backup ausgeschlossen](https://developer.apple.com/documentation/foundation/urlresourcevalues/isexcludedfrombackup); [`NSFileProtectionComplete`](https://developer.apple.com/documentation/foundation/nsfileprotectioncomplete) als Standard; Exporte und Diagnosedaten mit vollständigem Schutz geschrieben | erfüllt    |
| Der App-Umschalter zeigt Werte                  | [`PrivacyCover.swift`](../../clients/ios/Sources/MeinBefund/PrivacyCover.swift) deckt das Fenster ab, wenn die App nicht aktiv ist                                                                                                                                                                                          | erfüllt    |
| Logs enthalten Werte                            | Logzeilen enthalten nur Anzahlen und Codes ([`Logging.swift`](../../clients/ios/Sources/Shared/Logging.swift))                                                                                                                                                                                                              | erfüllt    |
| Eine Cloud-Frage identifiziert die Person       | Höchstens 40 Werte, kein Name, kein Geburtsdatum, keine Versichertennummer; der Dienst erzwingt dasselbe ([`CloudAnalysis.swift`](../../clients/ios/Sources/Shared/CloudAnalysis.swift), [ADR-034](../ADRs/ADR-034-claude-workload-identity-federation.md))                                                                 | erfüllt    |
| Übermittlung in ein Drittland                   | Standard auf dem Gerät; gehosteter Standard ist Azure OpenAI in der [EU-Datenzone](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types#data-zone-standard); die Anthropic-Option ist Opt-in und sagt „USA“                                                                                    | teilweise  |
| Screenshots oder Bildschirmaufnahmen            | Nicht verhindert (iOS erlaubt keine zuverlässige Sperre)                                                                                                                                                                                                                                                                    | akzeptiert |

### Denial of service (Dienstverweigerung)

| Bedrohung                                   | Gegenmaßnahme                                                                                                                                                                                                                                                                                     | Status     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Der Hub ist ausgefallen                     | Die App funktioniert ohne den Hub; die Akte liegt auf dem Gerät                                                                                                                                                                                                                                   | erfüllt    |
| Ein feindseliger Scan überflutet den Parser | Vision und der Parser arbeiten auf begrenzten Bildern; ein verschlechterter Scan verliert Zeilen, hängt aber nie ([`ScanningTests.swift`](../../clients/ios/Tests/SharedTests/ScanningTests.swift), [`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift)) | erfüllt    |
| Verlorenes Telefon                          | Export in vier Formaten, den die Person aufbewahrt; absichtlich keine Wiederherstellung über den Hub                                                                                                                                                                                              | akzeptiert |

### Elevation of privilege (Rechteausweitung)

| Bedrohung                                    | Gegenmaßnahme                                                                                                                                                                                                                                                                                           | Status  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Debug-Einstiegspunkte in einem Release-Build | `-MBSelfTest`, `-MBDemoSeed`, `-MBShot` werden herauskompiliert (`#if DEBUG`)                                                                                                                                                                                                                           | erfüllt |
| Die App schreibt in Apple Health             | [Nur-Lese-Autorisierung](https://developer.apple.com/documentation/healthkit/protecting-user-privacy) ([`WearableSource.swift`](../../clients/ios/Sources/MeinBefund/WearableSource.swift)); abgesichert durch [`SecurityPostureTests`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift) | erfüllt |
| Das App-Token kann mehr als die Akte         | Der Hub beschränkt das Token auf die Sandbox-Akte dieses Kontos; `isSandboxUsername` auf jeder App-Route                                                                                                                                                                                                | erfüllt |

## Restrisiken und was sie schließt

1. **App-Sperre**: entschieden und implementiert am 2026-10-15 ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)). ([TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) O.Auth)
2. **Keine Manipulations- oder Jailbreak-Erkennung**: mit Begründung in [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md) abgelehnt; der versiegelte Speicher und App Attest sind die Kontrollen. (O.Resi)
3. **Kein Certificate Pinning**: mit Begründung in [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md) abgelehnt; ATS ohne Ausnahmedomain, verwaltete Rotation. (O.Ntwk)
4. **Gehostete Anthropic-Option.** Opt-in, auf dem Bildschirm genannt, aber
   eine Übermittlung in die USA; der Betreiber braucht eine Rechtsgrundlage
   für die Übermittlung oder muss die Option abschalten.
5. **Unabhängiger Test.** Dieses Modell und die Tests stammen vom Projekt
   selbst. Ein unabhängiger Penetrationstest gegen einen Release-Build auf
   einem Gerät und die TR-03161-Lückenliste auf Ebene der Anforderungen
   stehen noch aus; siehe
   [`security-test-report-2026-10-15.md`](security-test-report-2026-10-15.md).
