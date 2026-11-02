---
source: docs/security/threat-model-klarbefund.md
sourceHash: 1ceeaff87c54101e16f2d380ce062cdedff21add41e30c2256406c9c72351e5a
language: es
summary: "Análisis STRIDE de la app para iPhone; cada mitigación cita el código o la prueba que la demuestra."
---

# Modelo de amenazas: Klarbefund, la aplicación para iPhone

El modelo de amenazas del hub es [`threat-model.md`](threat-model.md). Este es
el de la aplicación en `clients/ios`, que se ejecuta en el teléfono de una
persona, contiene sus valores de laboratorio y no envía nada a ninguna parte
salvo que esa persona lo indique. Redactado el 2026-10-15 sobre el commit
`64737039`; cada mitigación nombra el código o la prueba que la demuestra, y
`clients/ios/Tests/SharedTests/SecurityPostureTests.swift` fija las que son
ajustes de compilación. STRIDE, como en el modelo del hub.

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

Límites de confianza: se confía en el dispositivo (Secure Enclave, Data
Protection, sandbox de la aplicación) tal como Apple lo proporciona. Todo lo
que sale del dispositivo cruza un límite y solo lo hace tras un
consentimiento que la persona dio para esa finalidad.

## Activos

| Activo                                                    | Dónde                                                  | Por qué importa                                                            |
| --------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Valores de laboratorio, informes, imágenes de las páginas | el almacén, `ReportStore.swift`                        | Datos de salud del art. 9 del RGPD                                         |
| La clave del almacén                                      | Llavero (Keychain), `WhenUnlockedThisDeviceOnly`       | descifra todo lo anterior                                                  |
| Tokens del hub (device grant, token de la aplicación)     | Llavero (Keychain), `ThisDeviceOnly`, `EHDSConnection` | acceso de escritura a la propia historia clínica de la persona en el hub   |
| Clave de App Attest                                       | Secure Enclave, `DeviceCheck`                          | demuestra al hub que se trata de una aplicación auténtica al crear cuentas |
| Consentimientos y su historial                            | `Consents.swift`                                       | la base jurídica de cada transferencia                                     |
| Exportación de diagnóstico                                | se escribe solo a petición, ADR-038                    | contiene valores; nunca debe entrar en el repositorio                      |

## STRIDE

### Spoofing (suplantación de identidad)

| Amenaza                                                                                      | Mitigación                                                                                                                                            | Estado   |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Una aplicación falsa crea cuentas en el hub o envía datos haciéndose pasar por la aplicación | La creación de cuentas exige una atestación de Apple App Attest que el hub verifica (ADR-054); cada llamada posterior lleva el token de la aplicación | cumplido |
| Un hub falso recolecta tokens                                                                | Descubrimiento OIDC solo desde el emisor configurado, PKCE S256, `ASWebAuthenticationSession`; ATS prohíbe el texto sin cifrar (`OIDCSession.swift`)  | cumplido |
| Un servicio de explicaciones falso lee valores                                               | El proveedor se nombra en la solicitud que la persona aprueba (`CloudConsentSheet.swift`); HTTPS impuesto por ATS                                     | cumplido |
| Otra persona ante el teléfono desbloqueado                                                   | Bloqueo de la aplicación: Face ID, Touch ID o el código antes de que se retire la cubierta, activado por defecto (`AppLock.swift`, ADR-060)           | cumplido |

### Tampering (manipulación)

| Amenaza                                                            | Mitigación                                                                                                                                                 | Estado   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Registros almacenados alterados en el disco o a través de un cable | Cada registro sellado con AES-GCM (autenticado), clave en el llavero; una prueba por cable no pudo copiar datos almacenados                                | cumplido |
| Un valor mal leído tratado como resultado de laboratorio           | La procedencia mantiene los valores de OCR como `preliminary`; solo la capa de texto de un PDF del propio laboratorio produce `final` (`Provenance.swift`) | cumplido |
| Una compilación manipulada                                         | App Attest demuestra la aplicación ante el hub, no ante sí misma; detección de jailbreak y de depurador descartada con sus motivos (ADR-060)               | aceptado |
| Una dependencia con una puerta trasera                             | Ningún paquete de terceros en absoluto (`Package.swift`, `project.yml`, `docs/sbom/klarbefund-ios.cdx.json`)                                               | cumplido |

### Repudiation (repudio)

| Amenaza                                | Mitigación                                                                                                                    | Estado   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| «Nunca consentí esa transferencia»     | Eventos de consentimiento con hora, tenedor de datos de salud y fecha de efecto, revocables, con historial (`Consents.swift`) | cumplido |
| Lo que se envió no puede reconstruirse | Una sincronización es un Bundle FHIR con una huella SHA-256 que la aplicación registra (`EHDSConnection.swift`, ADR-057)      | cumplido |

### Information disclosure (divulgación de información)

| Amenaza                                                          | Mitigación                                                                                                                                                                                                   | Estado   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Los valores salen del dispositivo sin intervención de la persona | OCR, codificación, análisis y exportación en el dispositivo; las únicas llamadas de red son las dos opcionales de arriba, cada una sujeta a su propio consentimiento                                         | cumplido |
| Las copias de seguridad o iCloud se llevan el almacén            | Almacén excluido de la copia de seguridad; `NSFileProtectionComplete` por defecto; exportaciones y diagnósticos escritos con protección completa                                                             | cumplido |
| El selector de aplicaciones muestra valores                      | `PrivacyCover.swift` cubre la ventana cuando la aplicación no está activa                                                                                                                                    | cumplido |
| Los registros contienen valores                                  | Las líneas de registro solo contienen recuentos y códigos (`Logging.swift`)                                                                                                                                  | cumplido |
| Una pregunta a la nube identifica a la persona                   | Como máximo 40 valores, sin nombre, fecha de nacimiento ni número de seguro; el servicio impone lo mismo (`CloudAnalysis.swift`, ADR-034)                                                                    | cumplido |
| Transferencia a un tercer país                                   | Por defecto en el dispositivo; por defecto en modo alojado, Azure OpenAI en la zona de datos de la UE; la opción de Anthropic requiere activación expresa (opt-in) e indica «United States» (Estados Unidos) | parcial  |
| Capturas de pantalla o grabación de pantalla                     | No se impiden (iOS no permite ningún bloqueo fiable)                                                                                                                                                         | aceptado |

### Denial of service (denegación de servicio)

| Amenaza                                | Mitigación                                                                                                                                                     | Estado   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| El hub no está disponible              | La aplicación funciona sin el hub; la historia clínica está en el dispositivo                                                                                  | cumplido |
| Un escaneo hostil satura el analizador | Vision y el analizador trabajan sobre imágenes acotadas; un escaneo degradado pierde filas, nunca se bloquea (`ScanningTests.swift`, `AccuracyBenchmarkTests`) | cumplido |
| Teléfono perdido                       | Exportación en cuatro formatos para que la persona la conserve; sin recuperación desde el hub, por diseño                                                      | aceptado |

### Elevation of privilege (elevación de privilegios)

| Amenaza                                                       | Mitigación                                                                                                                        | Estado   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Puntos de entrada de depuración en una compilación de release | `-MBSelfTest`, `-MBDemoSeed`, `-MBShot` se excluyen en la compilación (`#if DEBUG`)                                               | cumplido |
| La aplicación escribe en Apple Health                         | Autorización de solo lectura (`WearableSource.swift`); fijada por `SecurityPostureTests`                                          | cumplido |
| El token de la aplicación permite más que la historia clínica | El hub limita el alcance del token a la historia clínica sandbox de esa cuenta; `isSandboxUsername` en cada ruta de la aplicación | cumplido |

## Riesgos residuales y lo que los cierra

1. **Bloqueo de la aplicación**: decidido e implementado el 2026-10-15 (ADR-060). (TR-03161 O.Auth)
2. **Sin detección de manipulación ni de jailbreak**: descartada con sus motivos en el ADR-060; el almacén sellado y App Attest son los controles. (O.Resi)
3. **Sin anclaje de certificados**: descartado con sus motivos en el ADR-060; ATS sin dominio de excepción, rotación gestionada. (O.Ntwk)
4. **Opción alojada de Anthropic.** Requiere activación expresa y se nombra
   en pantalla, pero es una transferencia a los Estados Unidos; el operador
   necesita una base para la transferencia o debe desactivarla.
5. **Prueba independiente.** Este modelo y las pruebas son del propio
   proyecto. Siguen pendientes una prueba de penetración independiente sobre
   una compilación de release en un dispositivo y la lista de carencias de la
   TR-03161 a nivel de requisitos; véase
   [`security-test-report-2026-10-15.md`](security-test-report-2026-10-15.md).
