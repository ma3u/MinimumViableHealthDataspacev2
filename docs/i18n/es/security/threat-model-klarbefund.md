---
source: docs/security/threat-model-klarbefund.md
sourceHash: 51e257302a125e1719ff971d82f32d6b549109f005c8e3aedd44e0668236dfc2
language: es
summary: Análisis STRIDE de la app para iPhone; cada mitigación cita el código o la prueba que la demuestra.
---

# Modelo de amenazas: Klarbefund, la aplicación para iPhone

El modelo de amenazas del hub es [`threat-model.md`](threat-model.md). Este es
el de la aplicación en [`clients/ios`](../../clients/ios), que se ejecuta en el teléfono de una
persona, contiene sus valores de laboratorio y no envía nada a ninguna parte
salvo que esa persona lo indique. Redactado el 2026-10-15 sobre el commit
[`64737039`](https://github.com/ma3u/MinimumViableHealthDataspacev2/commit/64737039); cada mitigación nombra el código o la prueba que la demuestra, y
[`clients/ios/Tests/SharedTests/SecurityPostureTests.swift`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift) fija las que son
ajustes de compilación. [STRIDE](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats), como en el modelo del hub.

## Contexto del sistema

```
   informe en papel ──cámara─────────────────▶ ┌──────────────────────────────────────┐
   PDF del laboratorio ──archivos/compartir──▶ │ Klarbefund (iOS 26, Swift 6)         │
   Apple Health ──lectura────────────────────▶ │ OCR · codificación · almacén AES-GCM │
                                               └──────┬──────────┬────────────────────┘
                              opcional, consentimiento│          │opcional, consentimiento
                                                      ▼          ▼
                                    ┌───────────────────┐   ┌────────────────────────────────┐
                                    │ hub del EEDS      │   │ servicio de explicaciones      │
                                    │ (ADR-049/054/057) │   │ en el dispositivo por defecto; │
                                    │ OIDC+PKCE, App    │   │ alojado: Azure OpenAI, zona    │
                                    │ Attest, Bearer    │   │ de datos UE, o clave propia    │
                                    └───────────────────┘   └────────────────────────────────┘
```

La conexión con el hub es la concesión de dispositivo ([ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)), la cuenta sandbox con App Attest ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)) y las medias semanales ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)), con inicio de sesión mediante [OpenID Connect](https://openid.net/specs/openid-connect-core-1_0.html) y [PKCE S256](https://www.rfc-editor.org/rfc/rfc7636#section-4.2); [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) acredita la aplicación. La explicación alojada se ejecuta en Azure OpenAI en la [zona de datos de la UE](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types#data-zone-standard).

Límites de confianza: se confía en el dispositivo (Secure Enclave, [Data
Protection](https://support.apple.com/guide/security/data-protection-overview-secf6276da8a/web), sandbox de la aplicación) tal como Apple lo proporciona. Todo lo
que sale del dispositivo cruza un límite y solo lo hace tras un
consentimiento que la persona dio para esa finalidad.

## Activos

| Activo                                                    | Dónde                                                                                                                                               | Por qué importa                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Valores de laboratorio, informes, imágenes de las páginas | el almacén, [`ReportStore.swift`](../../clients/ios/Sources/MeinBefund/ReportStore.swift)                                                           | Datos de salud del [art. 9 del RGPD](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_9) |
| La clave del almacén                                      | Llavero (Keychain), [`WhenUnlockedThisDeviceOnly`](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly) | descifra todo lo anterior                                                                     |
| Tokens del hub (device grant, token de la aplicación)     | Llavero (Keychain), `ThisDeviceOnly`, [`EHDSConnection`](../../clients/ios/Sources/MeinBefund/EHDSConnection.swift)                                 | acceso de escritura a la propia historia clínica de la persona en el hub                      |
| Clave de App Attest                                       | Secure Enclave, [`DeviceCheck`](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity)                            | demuestra al hub que se trata de una aplicación auténtica al crear cuentas                    |
| Consentimientos y su historial                            | [`Consents.swift`](../../clients/ios/Sources/Shared/Consents.swift)                                                                                 | la base jurídica de cada transferencia                                                        |
| Exportación de diagnóstico                                | se escribe solo a petición, [ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)                                                          | contiene valores; nunca debe entrar en el repositorio                                         |

## STRIDE

### Spoofing (suplantación de identidad)

| Amenaza                                                                                      | Mitigación                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Estado   |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Una aplicación falsa crea cuentas en el hub o envía datos haciéndose pasar por la aplicación | La creación de cuentas exige una atestación de Apple App Attest que el hub verifica ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)); cada llamada posterior lleva el token de la aplicación                                                                                                                                                                                                                                  | cumplido |
| Un hub falso recolecta tokens                                                                | Descubrimiento OIDC solo desde el emisor configurado, [PKCE S256](https://www.rfc-editor.org/rfc/rfc7636#section-4.2), [`ASWebAuthenticationSession`](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession); [ATS](https://developer.apple.com/documentation/security/preventing-insecure-network-connections) prohíbe el texto sin cifrar ([`OIDCSession.swift`](../../clients/ios/Sources/MeinBefund/OIDCSession.swift)) | cumplido |
| Un servicio de explicaciones falso lee valores                                               | El proveedor se nombra en la solicitud que la persona aprueba ([`CloudConsentSheet.swift`](../../clients/ios/Sources/MeinBefund/CloudConsentSheet.swift)); HTTPS impuesto por [ATS](https://developer.apple.com/documentation/security/preventing-insecure-network-connections)                                                                                                                                                                                   | cumplido |
| Otra persona ante el teléfono desbloqueado                                                   | Bloqueo de la aplicación: Face ID, Touch ID o el código antes de que se retire la cubierta, activado por defecto ([`AppLock.swift`](../../clients/ios/Sources/MeinBefund/AppLock.swift), [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md))                                                                                                                                                                    | cumplido |

### Tampering (manipulación)

| Amenaza                                                            | Mitigación                                                                                                                                                                                                                                | Estado   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Registros almacenados alterados en el disco o a través de un cable | Cada registro sellado con AES-GCM (autenticado), clave en el llavero; una prueba por cable no pudo copiar datos almacenados                                                                                                               | cumplido |
| Un valor mal leído tratado como resultado de laboratorio           | La procedencia mantiene los valores de OCR como `preliminary`; solo la capa de texto de un PDF del propio laboratorio produce `final` ([`Provenance.swift`](../../clients/ios/Sources/Shared/Provenance.swift))                           | cumplido |
| Una compilación manipulada                                         | App Attest demuestra la aplicación ante el hub, no ante sí misma; detección de jailbreak y de depurador descartada con sus motivos ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)) | aceptado |
| Una dependencia con una puerta trasera                             | Ningún paquete de terceros en absoluto ([`Package.swift`](../../clients/ios/Package.swift), [`project.yml`](../../clients/ios/project.yml), [`docs/sbom/klarbefund-ios.cdx.json`](../sbom/klarbefund-ios.cdx.json))                       | cumplido |

### Repudiation (repudio)

| Amenaza                                | Mitigación                                                                                                                                                                                                                                                                              | Estado   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| «Nunca consentí esa transferencia»     | Eventos de consentimiento con hora, tenedor de datos de salud y fecha de efecto, revocables, con historial ([`Consents.swift`](../../clients/ios/Sources/Shared/Consents.swift))                                                                                                        | cumplido |
| Lo que se envió no puede reconstruirse | Una sincronización es un [Bundle FHIR](https://hl7.org/fhir/R4/bundle.html) con una huella SHA-256 que la aplicación registra ([`EHDSConnection.swift`](../../clients/ios/Sources/MeinBefund/EHDSConnection.swift), [ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)) | cumplido |

### Information disclosure (divulgación de información)

| Amenaza                                                          | Mitigación                                                                                                                                                                                                                                                                                                                       | Estado   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Los valores salen del dispositivo sin intervención de la persona | OCR, codificación, análisis y exportación en el dispositivo; las únicas llamadas de red son las dos opcionales de arriba, cada una sujeta a su propio consentimiento                                                                                                                                                             | cumplido |
| Las copias de seguridad o iCloud se llevan el almacén            | [Almacén excluido de la copia de seguridad](https://developer.apple.com/documentation/foundation/urlresourcevalues/isexcludedfrombackup); [`NSFileProtectionComplete`](https://developer.apple.com/documentation/foundation/nsfileprotectioncomplete) por defecto; exportaciones y diagnósticos escritos con protección completa | cumplido |
| El selector de aplicaciones muestra valores                      | [`PrivacyCover.swift`](../../clients/ios/Sources/MeinBefund/PrivacyCover.swift) cubre la ventana cuando la aplicación no está activa                                                                                                                                                                                             | cumplido |
| Los registros contienen valores                                  | Las líneas de registro solo contienen recuentos y códigos ([`Logging.swift`](../../clients/ios/Sources/Shared/Logging.swift))                                                                                                                                                                                                    | cumplido |
| Una pregunta a la nube identifica a la persona                   | Como máximo 40 valores, sin nombre, fecha de nacimiento ni número de seguro; el servicio impone lo mismo ([`CloudAnalysis.swift`](../../clients/ios/Sources/Shared/CloudAnalysis.swift), [ADR-034](../ADRs/ADR-034-claude-workload-identity-federation.md))                                                                      | cumplido |
| Transferencia a un tercer país                                   | Por defecto en el dispositivo; por defecto en modo alojado, Azure OpenAI en la [zona de datos de la UE](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types#data-zone-standard); la opción de Anthropic requiere activación expresa (opt-in) e indica «United States» (Estados Unidos)             | parcial  |
| Capturas de pantalla o grabación de pantalla                     | No se impiden (iOS no permite ningún bloqueo fiable)                                                                                                                                                                                                                                                                             | aceptado |

### Denial of service (denegación de servicio)

| Amenaza                                | Mitigación                                                                                                                                                                                                                                                                                    | Estado   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| El hub no está disponible              | La aplicación funciona sin el hub; la historia clínica está en el dispositivo                                                                                                                                                                                                                 | cumplido |
| Un escaneo hostil satura el analizador | Vision y el analizador trabajan sobre imágenes acotadas; un escaneo degradado pierde filas, nunca se bloquea ([`ScanningTests.swift`](../../clients/ios/Tests/SharedTests/ScanningTests.swift), [`AccuracyBenchmarkTests`](../../clients/ios/Tests/SharedTests/AccuracyBenchmarkTests.swift)) | cumplido |
| Teléfono perdido                       | Exportación en cuatro formatos para que la persona la conserve; sin recuperación desde el hub, por diseño                                                                                                                                                                                     | aceptado |

### Elevation of privilege (elevación de privilegios)

| Amenaza                                                       | Mitigación                                                                                                                                                                                                                                                                                             | Estado   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Puntos de entrada de depuración en una compilación de release | `-MBSelfTest`, `-MBDemoSeed`, `-MBShot` se excluyen en la compilación (`#if DEBUG`)                                                                                                                                                                                                                    | cumplido |
| La aplicación escribe en Apple Health                         | [Autorización de solo lectura](https://developer.apple.com/documentation/healthkit/protecting-user-privacy) ([`WearableSource.swift`](../../clients/ios/Sources/MeinBefund/WearableSource.swift)); fijada por [`SecurityPostureTests`](../../clients/ios/Tests/SharedTests/SecurityPostureTests.swift) | cumplido |
| El token de la aplicación permite más que la historia clínica | El hub limita el alcance del token a la historia clínica sandbox de esa cuenta; `isSandboxUsername` en cada ruta de la aplicación                                                                                                                                                                      | cumplido |

## Riesgos residuales y lo que los cierra

1. **Bloqueo de la aplicación**: decidido e implementado el 2026-10-15 ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)). ([TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) O.Auth)
2. **Sin detección de manipulación ni de jailbreak**: descartada con sus motivos en el [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md); el almacén sellado y App Attest son los controles. (O.Resi)
3. **Sin anclaje de certificados**: descartado con sus motivos en el [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md); ATS sin dominio de excepción, rotación gestionada. (O.Ntwk)
4. **Opción alojada de Anthropic.** Requiere activación expresa y se nombra
   en pantalla, pero es una transferencia a los Estados Unidos; el operador
   necesita una base para la transferencia o debe desactivarla.
5. **Prueba independiente.** Este modelo y las pruebas son del propio
   proyecto. Siguen pendientes una prueba de penetración independiente sobre
   una compilación de release en un dispositivo y la lista de carencias de la
   TR-03161 a nivel de requisitos; véase
   [`security-test-report-2026-10-15.md`](security-test-report-2026-10-15.md).
