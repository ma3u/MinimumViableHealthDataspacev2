---
source: docs/klarbefund/developer-guide.md
sourceHash: 48236d50693674d8724bcd9602038d3c906575395278be36555efd640d0eaf1c
language: es
---

# Guía para desarrolladores de Klarbefund

Cómo compilar, ejecutar, probar y modificar la aplicación de iPhone en
[`clients/ios/`](../../clients/ios/). La [guía del usuario](user-guide.md) muestra
lo que ve una persona; esta guía muestra lo que lo hace posible. La ficha breve de comandos
es [`clients/ios/README.md`](../../clients/ios/README.md); el trabajo se sigue
en la [incidencia #186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186).

Cada captura de pantalla y cada número de esta guía proceden del conjunto de datos de desarrollo
ficticio de la propia aplicación. En ninguna parte del repositorio interviene un informe real,
y [las dos reglas del final](#two-rules-that-are-not-negotiable)
explican por qué esto no es negociable.

## Lo que necesita

| Herramienta        | Versión                    | Para qué                                                                                        |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------------------------- |
| macOS con Xcode    | Xcode 27, SDK de iOS 26    | La aplicación se dirige a iOS 26; el paquete Swift declara macOS 26 para las herramientas       |
| Swift              | 6.0, concurrencia estricta | `Package.swift` y `project.yml` la fijan ambos                                                  |
| XcodeGen           | `brew install xcodegen`    | El `.xcodeproj` se genera a partir de `project.yml` y nunca se hace commit de él                |
| Node               | como para `ui/`            | Solo para regenerar el diccionario a partir de `services/epa-ingest`                            |
| PlantUML, Graphviz | `brew install plantuml`    | Solo para volver a renderizar los diagramas de esta guía                                        |
| Un iPhone          | iOS 26 o posterior         | Solo para la cámara, Face ID, App Attest y TestFlight; todo lo demás se ejecuta en el simulador |

## Cómo está construida

![Klarbefund como vista ArchiMate por capas: la capa de negocio con la persona, el médico y el equipo de investigación, y las seis cosas que hace una persona; la capa de aplicación con los cuatro servicios, la aplicación, el paquete Shared, las herramientas, el hub y el generador; la capa tecnológica con los frameworks del iPhone, el Mac y Azure Container Apps](img/klarbefund-architecture.svg)

Fuente: [`diagrams/klarbefund-architecture.puml`](diagrams/klarbefund-architecture.puml),
renderizado con `scripts/render-plantuml.sh docs/klarbefund/diagrams/*.puml`.

La vista sigue ArchiMate 3.2: la capa de negocio (amarilla) recoge quién hace
qué, la capa de aplicación (azul) los servicios que presta el software y
los componentes que los realizan, la capa tecnológica (verde) aquello sobre lo que todo
se ejecuta. Una flecha de una banda inferior a una superior significa «sirve»; una flecha
punteada con punta hueca significa «realiza». Tres cosas que se desprenden de ella:

- **`Sources/Shared`** es un paquete Swift que compila para iOS y macOS.
  Contiene el analizador, el posprocesamiento del reconocimiento de texto, el diccionario generado de analitos
  y los rangos de referencia, el modelo de registro con su procedencia, y
  los formatos de exportación (FHIR R4, OMOP CDM, el paquete de diagnósticos). Nada de lo que
  contiene toca la red, el llavero ni el almacenamiento, y por eso cada
  número que calcula la aplicación puede reproducirse en un Mac con `swift test`.
- **`Sources/MeinBefund`** es la aplicación: las vistas SwiftUI, el escaneo con VisionKit, el
  almacenamiento sellado, la hoja de compartir de las exportaciones, la conexión con el EEDS, el bloqueo de la aplicación,
  los proveedores de análisis, y los datos de demostración y la autoprueba que solo existen en depuración.
- **`Tools/`** son cuatro programas de línea de comandos sobre el paquete Shared:
  `LabFile` importa un PDF o una imagen exactamente como lo haría la aplicación, `ScanReplay`
  vuelve a pasar una exportación de diagnósticos por el analizador actual, `AnalyteParity`
  demuestra que el diccionario generado es igual a su fuente TypeScript, e `IconGen`
  dibuja el icono de la aplicación.

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

## Compilar y ejecutar

```bash
cd clients/ios
brew install xcodegen                          # once
swift test                                     # the Shared package, on the Mac
swift run AnalyteParity                        # the generated table agrees with its source
xcodegen generate && open MeinBefund.xcodeproj # then run the MeinBefund scheme in Xcode
```

Desde la línea de comandos hacia un simulador, tenga en cuenta la **firma ad hoc**:
sin ella, todas las llamadas al llavero fallan con `-34018` y el almacenamiento no puede
crear su clave.

```bash
xcodebuild -project MeinBefund.xcodeproj -scheme MeinBefund \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=YES build
```

En un iPhone conectado: `Scripts/install-device.sh`. El proyecto generado
no incluye ningún equipo de firma, por lo que un `xcodebuild` sin más para un dispositivo falla; el
script aporta uno a partir de `TEAM_ID` o del llavero, e instala lo que ha
compilado. TestFlight: `Scripts/archive-and-upload.sh`; su encabezado nombra los cuatro
elementos que deben existir antes en la cuenta de Apple Developer. La versión está
fijada en `project.yml`: `MARKETING_VERSION` coincide con el registro de App Store Connect
y `CURRENT_PROJECT_VERSION` aumenta con cada subida, porque App
Store Connect rechaza un número de build que ya ha visto, y lo hace después de la subida.

## Datos de demostración y argumentos de arranque

<img src="img/list.png" width="300" alt="La lista de informes rellenada por el conjunto de datos de desarrollo: siete informes ficticios de un laboratorio, una consulta y un centro de estudio a lo largo de tres años"> <img src="img/detail.png" width="300" alt="Un informe ficticio del conjunto de datos de desarrollo, con valores por revisar y las listas de filas no asignadas y no leídas">

Cada uno de los argumentos de arranque siguientes existe solo en una compilación Debug. Las comprobaciones son
`#if DEBUG`, no solo un indicador: un indicador puede descubrirse, el código que no está
compilado no.

| Argumento              | Qué hace                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-MBDemoSeed`          | Dos informes ficticios, solo en memoria. Suficiente para una captura de pantalla; es con lo que arranca cada prueba de interfaz.                                                                |
| `-MBDevData`           | Siete informes ficticios a lo largo de tres años y cuatro fuentes, construidos en el código: una tendencia tiene forma, la lista de filas no asignadas tiene filas, cada informe tiene páginas. |
| `-MBShot <screen>`     | Abre una pantalla directamente una vez cargados los informes: `list detail scan trends reference history profile consent settings privacy consents connect`.                                    |
| `-MBSelfTest`          | Hace pasar un informe sintético por todo el pipeline en el target de la aplicación y registra 27 comprobaciones (véase [La autoprueba](#the-self-test)).                                        |
| `-MBExportDiagnostics` | Genera el archivo de diagnósticos en el directorio temporal de la aplicación para `Scripts/pull-diagnostics.sh`.                                                                                |

El conjunto de datos de desarrollo se **construye, no se almacena**. Una fila indica la etiqueta, el valor,
la unidad y el rango que imprimió el laboratorio, y `Analytes.lookup` la codifica
exactamente como codifica un escaneo. Ningún código del conjunto de datos puede ser erróneo, una fila que el
diccionario no sabe codificar acaba por sí sola en la lista de filas no asignadas, y el
conjunto de datos sigue al diccionario cuando este cambia. Las páginas las
dibuja `SyntheticSheet`, el mismo renderizador que leen las pruebas.

Un arranque de demostración nunca se bloquea: el bloqueo de la aplicación lee el indicador de seed y permanece abierto,
de modo que las pruebas de interfaz y el script de capturas de pantalla se ejecutan donde nadie puede responder a una
solicitud de código. En una compilación de producción no existen ni el indicador ni la excepción.

Las capturas de pantalla para la documentación y el App Store proceden de un único script,
que abre cada pantalla mediante un argumento en lugar de toques programados, de modo que
repetir las capturas tras un cambio de diseño no requiere nuevas coordenadas:

```bash
SEED=-MBDevData OUT=/tmp/shots SCREENS="list detail trends" Scripts/capture-screenshots.sh
Scripts/capture-screenshots.sh                 # the App Store set, size-checked, into appstore/screenshots/en
```

## De la cámara al almacenamiento

![El pipeline de escaneo como secuencia: el escáner de la aplicación entrega las páginas a LabImport, que decide la procedencia, reconoce o lee el texto, concilia las pasadas, deduce las funciones de las columnas, analiza cada fila frente al diccionario generado, lee el encabezado y entrega el resultado a la pantalla de revisión y después al almacenamiento sellado](img/klarbefund-scan-pipeline.svg)

Fuente: [`diagrams/klarbefund-scan-pipeline.puml`](diagrams/klarbefund-scan-pipeline.puml).

El orden es fijo y cada paso tiene un único responsable
([ADR-033](../ADRs/ADR-033-lab-report-extraction-pipeline.md)):

1. **Primero la procedencia.** `LabImport` decide según el archivo, nunca según su
   extensión: un PDF que contiene la capa de texto propia del laboratorio es
   `lab-issued-digital` y sus Observations son `final`; todo lo que tenga que
   pasar por el reconocimiento de texto es `ocr-transcribed` y `preliminary`. Es
   estricto a propósito, porque marcar una transcripción como `final` es el fallo
   que importa.
2. **Reconocimiento.** `VisionDocumentReader` ejecuta dos pasadas de Vision, en alemán y en
   inglés, con la corrección lingüística **desactivada**: «corregir» `Lp(a)` o una
   coma decimal es claramente perjudicial. `DocumentReconciler` fusiona las pasadas
   y `TableRoles` deduce, para cada tabla, qué columna contiene la etiqueta, el valor, la unidad
   y el rango.
3. **Análisis.** `LabLineParser` lee cada fila. Cuando el análisis ordinario no encuentra
   nada, entran en juego los lectores de hojas: presión arterial ambulatoria,
   ECG en reposo y de esfuerzo, Holter, prueba de esfuerzo cardiopulmonar, lactato,
   perfil de glucosa CGM, DXA y la pantalla de una báscula de composición corporal, que es
   un panel y no un informe, y de la que solo se lee el valor principal.
4. **Codificación.** `Analytes.lookup(label, unit)` elige el código LOINC. La unidad
   decide, nunca el nombre por sí solo. Una magnitud que LOINC no codifica (la grasa visceral
   como masa, una proporción de agua) se conserva con su unidad, sin código y con un
   motivo obligatorio; un organismo de un análisis de heces lleva su identificador de NCBI Taxonomy,
   porque LOINC nombra pruebas y no organismos.
5. **El encabezado.** `ReportMetadata` y `PrintedFields` leen de la hoja el laboratorio,
   la fecha de laboratorio, la fecha de emisión y el número de informe; la fecha de laboratorio
   tiene preferencia sobre las fechas de recepción y de emisión, y la persona la confirma
   antes de guardar.
6. **Conservación.** Cada fila que parece una medición termina como codificada,
   no asignada o no leída. Una fila que no está en ninguna de las tres es indistinguible de
   una fila que nunca se imprimió, y así es exactamente como una vez se perdió una fila de HbA1c
   (`docs/gotchas.md`, 2026-09-19). La autoprueba lo comprueba.
7. **Revisión y guardado.** `ReviewViews` muestra lo que se leyó; `ReportStore`
   lo sella.

`swift run LabFile ~/Downloads/befund.pdf` ejecuta los pasos 1 a 6 en un Mac y
muestra la procedencia, el encabezado y cada fila como codificada, no asignada o
no leída; `--values` añade los números, `--rows` añade la disposición del reconocimiento de texto.
Rechaza cualquier ruta dentro de este repositorio.

## El almacenamiento y el bloqueo

Tres archivos sellados por informe en `Application Support/Reports`, cada uno
en AES-GCM con la misma clave del llavero, protección completa de archivos, excluidos de la
copia de seguridad:

```
<id>.sealed         the record (LabReport)
<id>.scan.sealed    the pages as one PDF
<id>.diag.sealed    the scan's diagnostics (ScanDiagnostics)
profile.sealed      sex, date of birth, height (Profile)
consents.sealed     the three consent decisions (ConsentLedger)
```

La clave es `ThisDeviceOnly` y no está disponible mientras el teléfono está bloqueado, de modo que una
copia del contenedor solo produce texto cifrado y la instantánea que el propio sistema toma de la aplicación
falla con `EPERM`; `SecurityPostureTests` fija los ajustes de compilación y la
[autoevaluación](self-assessment.md) recoge la medición. Los registros
escritos antes de que existiera un campo siguen decodificándose: cada campo posterior es opcional o
tiene un valor predeterminado.

El bloqueo de la aplicación ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md))
consta de dos tipos. `AppLockPolicy`, en Shared, decide _si_ corresponde una comprobación
y es puro, de modo que `AppLockPolicyTests` se ejecuta en un Mac; `AppLock`, en la aplicación, pregunta
a LocalAuthentication _cómo_, con Face ID, Touch ID o el código, y
`PrivacyCover` dibuja la cubierta que ve el selector de aplicaciones. El mismo ADR explica por qué
se descartaron el anclaje de certificados y la detección de jailbreak.

## El diccionario se genera, nunca se copia

`Sources/Shared/Analytes.generated.swift`, `ReferenceRanges.generated.swift`
y `PromptText.generated.swift` se producen a partir de
[`services/epa-ingest`](../../services/epa-ingest):

```bash
cd services/epa-ingest && npm run generate:swift
cd clients/ios && swift run AnalyteParity      # 1589 codings, 71 units today
```

No los edite a mano. Añada un analito en `analytes.ts` o un rango en
`reference-ranges.ts`, regenere y haga commit de ambos. La CI falla cuando un archivo generado
no está al día con su fuente, porque una copia desactualizada es exactamente la divergencia
silenciosa que el monorepo se eligió para evitar: un iPhone que codifica Lp(a) de una manera
y el servicio de ingesta de otra, descubierto cuando un valor llega a un médico.

El generador de rangos de referencia rechaza un rango cuyo analito no conoce el diccionario
o cuya unidad no está definida para ese analito. Solo los analitos con
una fuente publicada citable obtienen un rango
([ADR-039](../ADRs/ADR-039-published-reference-ranges.md)); para cualquier otro
analito, la pantalla Tendencias dibuja el rango que imprimió el propio laboratorio de la persona.

## Pruebas, y para qué sirve cada una

```bash
swift test                                     # Swift Testing: what the app computes
Scripts/run-ui-tests.sh                        # XCUITest: what it shows, and what a tap does
swift test --filter ExtractionAccuracyTests    # the accuracy benchmark, JSON to docs/klarbefund/accuracy-benchmark.json
swift test --filter SecurityPostureTests       # the build settings the self-assessment relies on
```

**La suite unitaria** (`Tests/SharedTests/`) es la más grande y detecta lo que
puede razonarse: una unidad que elige el código equivocado, una fecha leída de la
línea equivocada, una columna de exportación en el lugar equivocado. `FhirBundleParityTests` fija
el bundle al bundle de referencia que escribe `services/epa-ingest`, de modo que ambos generadores
emiten el mismo FHIR para la misma hoja.

**La suite de interfaz** (`Tests/UITests/`) existe porque la suite unitaria no detectó ninguno
de los últimos defectos: una tarjeta recortada en el borde del gráfico, una selección
que se olvidaba de sí misma en el siguiente renderizado, `LOINC Optional("2093-3")` en la única
pantalla que una persona compara con su propio papel. Cada prueba arranca con
`-MBDemoSeed` y llega a su pantalla con `-MBShot`, de modo que falla cuando cambia lo que
comprueba y no cuando se mueve un botón. Tres cosas aprendidas por las malas
están en `docs/gotchas.md`: un `accessibilityIdentifier` en un contenedor renombra
todo lo que contiene; un `Button` cuya etiqueta es `Color.clear` no está en el
árbol de accesibilidad; la selección de Swift Charts responde a un dedo y no a un
toque sintetizado, así que hay botones reales sobre las marcas.

### La autoprueba

Todo lo que viene después de la cámara se ejecuta en el target de la aplicación y, por tanto, no en
`swift test`: el almacenamiento sellado, el PDF de las páginas, la exportación. `-MBSelfTest`
hace pasar un informe sintético por toda la cadena y registra cada una de sus 27
comprobaciones: reconocimiento y codificación, una cita por valor, la fecha de laboratorio leída del
encabezado, las páginas como PDF, el descifrado de los tres archivos sellados, la reproducción
del registro de diagnósticos que reproduce exactamente la extracción, la generación del archivo,
y la exportación para el médico que cabe en los 25 MB de la ePA con las páginas
anexadas.

```bash
xcrun simctl launch <udid> red.mabu.meinbefund -MBSelfTest
xcrun simctl spawn <udid> log show --last 2m --predicate 'subsystem == "red.mabu.meinbefund"' --style compact
```

### La prueba comparativa de precisión

`ExtractionAccuracyTests` lee hojas sintéticas de contenido conocido y escribe
la precisión a nivel de campo en `docs/klarbefund/accuracy-benchmark.json`; la página de
[evidencias](evidence.md) la cita y [run-on-mac](run-on-mac.md)
reproduce cada número. Un informe real se mide de la misma manera, en el
propio Mac de la persona y nunca en el repositorio, con `ScanReplay --truth`
frente a un `truth.json` escrito a mano junto a la exportación: muestra qué campos
de qué filas eran erróneos, nunca los valores.

## Depurar una hoja mal leída

El almacenamiento solo produce texto cifrado, así que las pruebas salen del teléfono a través de la función
**Exportar diagnósticos** de la propia aplicación, que pide confirmación con palabras y entrega un
zip a la hoja de compartir
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

Con el teléfono conectado por USB y una compilación Debug instalada,
`Scripts/pull-diagnostics.sh` realiza la exportación y la descompresión de una vez, en
`~/Downloads`. Descomprima **fuera de este repositorio** y, después:

```bash
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date>          # every report, with the current parser
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date> --ocr    # re-run Vision on scan.pdf
swift run ScanReplay ~/Downloads/klarbefund-diagnostics-<date> --truth  # accuracy against truth.json
```

La reproducción muestra lo que codificó el teléfono, lo que se codifica ahora, lo que se ha codificado nuevo
o se ha perdido, y cada fila con su motivo. Añada un analito en `analytes.ts`,
regenere, reproduzca y observe cómo las filas de la hoja real pasan de no asignadas a
codificadas sin volver a escanearla. Ambas herramientas rechazan cualquier ruta dentro de
`clients/ios/`.

## La conexión con el hub del EEDS

La pantalla del paciente del hub inicia una concesión de dispositivo (device grant) OAuth 2.0 para el cliente
público de Keycloak `klarbefund-app` y la muestra como un código QR que lleva un
enlace `klarbefund://connect`; la aplicación consulta periódicamente a Keycloak para obtener el token y
se registra en el hub
([ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)).

- `Shared/EHDSConnect.swift`: el enlace, rechazado salvo que su hub y su emisor figuren
  en `TrustedHub.production` (más `.development` en una compilación de depuración), y el
  sondeador con sus cuatro respuestas. `EHDSConnectTests` cubre cada una.
- `EHDSConnection.swift`: los tokens y un identificador de dispositivo en el llavero como
  `ThisDeviceOnly`, la renovación, el registro, la lectura del historial, la desconexión (que
  revoca el token de actualización en Keycloak) y los dos interruptores de sincronización.
- `ConnectView.swift`: la hoja, el escáner de datos de VisionKit limitado a códigos QR,
  un campo para pegar y «¿Es esta su cuenta?».
- **Crear una cuenta del EEDS** ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md))
  llama a las dos rutas del hub que responden sin sesión; la cuenta
  solo se crea para una solicitud cuya certificación de Apple App Attest se verifica,
  y por eso el simulador muestra el botón desactivado con su motivo.
- **Enviar mis informes** y **Enviar las tendencias de mis dispositivos**
  ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)) publican
  en el propio historial de la persona; el propio historial contiene informes, vacunaciones
  y el plan de medicación ([ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)).
- `ConnectUITests` y `AccountUITests` se ejecutan contra `DemoEHDSTransport` con
  `-MBDemoSeed`; `LiveConnectUITests` y `LiveAccountUITests` se ejecutan contra un
  hub real cuando se les proporciona un enlace nuevo
  (`docs/knowledge/runbooks/klarbefund-connect.md`).

## Exportaciones

| Acción                             | Generador                    | Contenido                                                                       |
| ---------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Compartir para mi médico           | `ReportExport`, `FhirBundle` | Resumen en PDF con las páginas originales anexadas, más un bundle FHIR R4       |
| Exportar para investigación (OMOP) | `OmopExport`                 | OMOP CDM v5.4 `measurement.csv`, `person.csv`, `observation_period.csv`         |
| Exportar todos mis datos           | `DataExport`                 | cada informe, página, valor, campo del perfil y consentimiento, como JSON y PDF |
| Exportar diagnósticos              | `DiagnosticsBundle`          | el registro, las dos pasadas de Vision, las páginas, el registro de la sesión   |

Las tablas OMOP llevan `measurement_concept_id = 0` en todas partes, deliberadamente:
asignar LOINC a un concepto OMOP requiere el vocabulario Athena, que no está en
un teléfono, e inventar un identificador pondría un identificador erróneo en una medición
real. El rango impreso se conserva literalmente en `RawLabValue.referenceText`
y viaja como `referenceRange.text`; un rango sin ningún número solo sobrevive
ahí, y la regla rng-2 de FHIR lo permite.

## Idiomas

El inglés es la base y el alemán la traducción, según el idioma del teléfono.
`Scripts/check-localization.sh` falla cuando una cadena visible para el usuario no tiene
alemán o cuando una frase en alemán se ha quedado en la base inglesa; utiliza
`xcodebuild -exportLocalizations`, el mismo extractor que usa el editor de Xcode, de modo
que ve los literales `Text` de SwiftUI y los valores `INFOPLIST_KEY_*` que ningún grep sobre
las fuentes encontraría. La solicitud de permiso de la cámara se llegó a distribuir en alemán a
todos los teléfonos en inglés, y por eso existe el script.

## Análisis estático y CI

```bash
Scripts/codeql-swift.sh                        # CodeQL on the app and Shared, about 15 minutes
```

CodeQL necesita una compilación real para ver Swift, así que en GitHub solo se ejecuta cuando
cambia `clients/ios/` (`.github/workflows/codeql-swift.yml`), en un runner de
macOS. El hook pre-push `codeql-swift` ejecuta la misma suite cuando un push
modifica las fuentes Swift; termina con 1 ante cualquier hallazgo que no figure, con su
motivo, en `Scripts/codeql-accepted.txt`. Swift necesita un runner de macOS, que
ofrece menos concurrencia que Linux, así que el job de iOS se filtra por ruta a
`clients/ios/**` y nunca bloquea las suites web o de servicios; a la inversa, los
workflows de `ui/**` y `services/**` excluyen `clients/ios/**`.

La postura de seguridad de la aplicación, su modelo de amenazas y lo que aportaría una prueba
independiente están en el [modelo de amenazas](../security/threat-model-klarbefund.md),
el [informe de pruebas de seguridad](../security/security-test-report-2026-10-15.md)
y la [autoevaluación](self-assessment.md).

## Dos reglas que no son negociables

1. **Ningún dato de salud en `clients/ios/`, nunca.** Ni informes de laboratorio, ni escaneos, ni
   archivos de HealthKit exportados, ni capturas de pantalla con valores reales, ni
   siquiera temporalmente, ni siquiera ignorados por git. Los fixtures de prueba son sintéticos, como
   ya lo es `services/epa-ingest/__tests__/fixtures/`. Las herramientas rechazan una
   ruta dentro del repositorio por la misma razón.
2. **Ninguna organización real en el contenido de demostración.** `CLAUDE.md` lo prohíbe fuera
   del indicador `NEXT_PUBLIC_DEMO_TK`. El estudio para el que se ha creado esta aplicación es real;
   el centro de demostración, el laboratorio y la consulta del conjunto de datos de desarrollo son
   ficticios.

## Dónde están las decisiones

| ADR                                                                                                  | Decide                                                                        |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [ADR-033](../ADRs/ADR-033-lab-report-extraction-pipeline.md)                                         | El pipeline de extracción y su orden                                          |
| [ADR-038](../ADRs/ADR-038-scan-retained-diagnostics-export.md)                                       | Diagnósticos conservados con el escaneo, exportados a petición                |
| [ADR-039](../ADRs/ADR-039-published-reference-ranges.md)                                             | Solo rangos publicados citables, junto a los del laboratorio                  |
| [ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)                                    | Conexión mediante concesión de dispositivo OAuth y código QR                  |
| [ADR-050](../ADRs/ADR-050-klarbefund-beta-by-public-testflight-link.md)                              | La beta mediante enlace público de TestFlight                                 |
| [ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)                   | Creación de una cuenta, condicionada por App Attest                           |
| [ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)                                   | Envío de las medias semanales de los dispositivos, tras un interruptor propio |
| [ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)          | Lo que contiene el historial                                                  |
| [ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md) | El bloqueo de la aplicación; anclaje y detección de jailbreak descartados     |
