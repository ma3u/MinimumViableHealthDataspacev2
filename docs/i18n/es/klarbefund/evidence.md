---
source: docs/klarbefund/evidence.md
sourceHash: fc5bb296ce79d86a900f5cca02fcf97d746c0622fb87b553939e7d62d0325723
language: es
---

# Klarbefund: pruebas

Lo que un revisor ajeno a este proyecto puede comprobar sobre Klarbefund, el escáner de informes de
laboratorio para iPhone ([#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)),
y lo que todavía falta. Redactado para la primera pregunta de una aseguradora, de un hospital o de un
auditor: _¿es correcta la extracción, están seguros los datos y es esto un
producto sanitario?_ La protección de datos, BSI TR-03161 y la regulación se
evalúan en [`self-assessment.md`](self-assessment.md); cómo ejecutar todo esto
en un Mac se explica en [`run-on-mac.md`](run-on-mac.md). La descripción dirigida a las personas usuarias está en
[`README.md`](README.md), la parte de desarrollo en
[`clients/ios/README.md`](../../clients/ios/README.md).

Klarbefund es de código abierto bajo la [Apache License 2.0](../../LICENSE). El
proyecto no es un proveedor: no hay ninguna empresa detrás, ningún contrato de soporte y
ninguna garantía. Quien despliegue la aplicación, o una bifurcación de ella, la opera y asume
las obligaciones de protección de datos y de seguridad que ello conlleva.

## Estado

- En la presentación al HL7 AI Challenge 2026 (plazo 2026-06-30), Klarbefund
  era un prototipo. El premio ("Open Solution") fue para la plataforma EEDS de
  este repositorio.
- En la presentación de los ganadores, la aplicación se mostró como demostración en directo.
- Está en TestFlight, aprobada por la revisión beta de Apple para probadores externos
  ([ADR-050](../ADRs/ADR-050-klarbefund-beta-by-public-testflight-link.md)).
- Lee Apple Health (HealthKit, solo lectura) y se conecta al hub de demostración,
  cuyo uso secundario se ejecuta en el entorno de tratamiento seguro del hub
  ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)).

## Lo que ya está demostrado

| Afirmación                                                        | Prueba                                                                                                                                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un escaneo degradado pierde filas, nunca inventa valores          | `Tests/SharedTests/ScanningTests.swift`: hojas sintéticas con inclinación, reflejos, poca luz, desenfoque y baja resolución, leídas con Vision; cualquier valor codificado que no esté en la hoja hace fallar la prueba |
| Reglas numéricas alemanas (coma decimal, `1.240` = 1240, `0.300`) | `Tests/SharedTests/LabLineParserTests.swift`                                                                                                                                                                            |
| La unidad selecciona el código LOINC; la orina nunca es suero     | `LabLineParserTests.swift`, `RealScanLessonsTests.swift` (diseños de 19 escaneos reales, todos los valores inventados)                                                                                                  |
| Nada se descarta en silencio                                      | Autoprueba (`-MBSelfTest`, 27 comprobaciones): cada fila impresa termina codificada, sin asignar o sin leer                                                                                                             |
| Los valores de OCR siguen siendo preliminares                     | Modelo de procedencia (`Sources/Shared/Provenance.swift`): solo la capa de texto del PDF propio de un laboratorio produce FHIR `final`                                                                                  |
| Un escaneo real puede reproducirse sin el teléfono ni la imagen   | `swift run ScanReplay`, `swift run LabFile`; ambos rechazan rutas dentro de este repositorio                                                                                                                            |
| Las exportaciones son estándar                                    | Bundle FHIR R4 con LOINC y UCUM (`FhirBundleParityTests.swift`), OMOP CDM v5.4 (`OmopExportTests.swift`)                                                                                                                |
| Por defecto, los datos permanecen en el dispositivo               | OCR y análisis en el dispositivo, cifrado por elemento, sin copia de seguridad en iCloud, consentimientos separados, exportación y supresión ([README](README.md#privacy-and-safety))                                   |

## Medición de la exactitud

`ExtractionAccuracy` (`clients/ios/Sources/Shared/ExtractionAccuracy.swift`)
compara una extracción con una verdad comprobada a mano, campo por campo: el valor con
su comparador, la unidad, el código LOINC (o el rechazo esperado), el intervalo de referencia
impreso y la fecha del laboratorio. Sus cifras principales:

- **exactas**: filas correctas en todos los campos comprobados;
- **errores silenciosos**: filas que se codificaron, y por tanto se mostraron como valor, y que son erróneas en
  valor, unidad o código. Esta es la cifra que importa clínicamente; el objetivo
  es cero;
- **espurios**: valores codificados sin ninguna fila de la hoja que los respalde;
- **omitidas** y **sin leer**: filas perdidas y líneas entregadas al revisor.

Dos formas de ejecutarlo:

1. **Referencia sintética, en CI.** `AccuracyBenchmarkTests` genera el
   panel sintético bajo nueve condiciones de escaneo, lo lee con Vision y verifica
   cero errores silenciosos en cada una. En local: `cd clients/ios && swift test`; con
   `KLARBEFUND_BENCHMARK_OUT=<file>` definido, los recuentos se escriben allí como JSON.
   Un job `ios-unit-tests` para `.github/workflows/test.yml` (pendiente, YAML en
   [`run-on-mac.md`](run-on-mac.md#4-put-the-swift-suite-into-ci)) ejecuta el
   conjunto completo de Swift en `macos-26` y conserva ese JSON como el
   artefacto `klarbefund-accuracy-benchmark`; hasta que se incorpore, CI solo compila el
   target `Shared`. No interviene ningún dato real, por lo que el JSON puede publicarse
   tal cual.
2. **Piloto con informes reales, nunca en el repositorio.** Un participante exporta
   diagnósticos desde la aplicación (ADR-038), y se escribe un `truth.json` junto a cada
   `diagnostics.json` a partir del papel:

   ```json
   {
     "schema": 1,
     "labDate": "2026-09-12",
     "rows": [
       {
         "label": "LDL-Cholesterin",
         "value": 141,
         "unit": "mg/dl",
         "loinc": "2089-1",
         "referenceText": "< 116"
       },
       {
         "label": "Ferritin",
         "value": 10,
         "comparator": "<",
         "unit": "ug/l",
         "loinc": "2276-4"
       },
       {
         "label": "Natrium [U]",
         "value": 80,
         "unit": "mmol/l",
         "loinc": null,
         "refused": true
       }
     ]
   }
   ```

   ```bash
   cd clients/ios
   swift run ScanReplay ~/Pilot/export --truth          # per row: which fields were wrong, no values
   swift run ScanReplay ~/Pilot/export --truth --json   # counts only, the part to publish
   ```

   Solo los recuentos salen de la carpeta del participante. Antes de utilizar un informe:
   consentimiento por escrito del participante (finalidad, conservación, retirada, y
   si los valores se envían a un servicio de explicación), y una comprobación de que el estudio del que
   procede el informe no restringe la comunicación de sus resultados.

Los valores objetivo por campo se fijan antes de medir un piloto, y el
tamaño de la muestra del piloto se indica junto a cada cifra.

## Registro de ejecución

La lista de comprobación de [`run-on-mac.md`](run-on-mac.md) se ejecutó por última vez el 2026-10-15 en el
commit `1474295d` de esta rama, en macOS 26.7.1 con Xcode 26 (Swift 6.4).
Todo lo que figura a continuación es la referencia sintética; no intervino ningún informe real, por lo que los
recuentos se publican tal cual en
[`accuracy-benchmark.json`](accuracy-benchmark.json), el archivo que escribió la ejecución.
Es el proyecto comprobándose a sí mismo: un revisor lo reproduce con los mismos
tres comandos, y un piloto con informes reales sigue abierto.

| Paso                      | Resultado                                                  |
| ------------------------- | ---------------------------------------------------------- |
| `swift build`             | Shared, AnalyteParity, ScanReplay y LabFile compilados     |
| `swift run AnalyteParity` | paridad correcta: 1589 codificaciones, 71 unidades         |
| `swift test`              | 319 pruebas en 54 conjuntos superadas, 0 fallos, unos 10 s |

Un panel sintético de 8 filas, leído con Vision bajo nueve condiciones, 72
filas de verdad en total. `AccuracyBenchmarkTests` verifica cero errores silenciosos en
cada condición; las demás columnas se informan, no se verifican.

| Condición                       | Encontradas | Exactas | Errores silenciosos | Espurios | Líneas sin leer | Referencia correcta |
| ------------------------------- | ----------: | ------: | ------------------: | -------: | --------------: | ------------------: |
| escaneo limpio a 150 dpi        |           8 |       8 |                   0 |        0 |               0 |               8 / 8 |
| inclinado 1 grado               |           8 |       8 |                   0 |        0 |               0 |               8 / 8 |
| inclinado 2 grados              |           7 |       5 |                   0 |        0 |               0 |               5 / 7 |
| inclinado 5 grados              |           5 |       0 |                   0 |        0 |               2 |               0 / 5 |
| habitación con poca luz         |           8 |       8 |                   0 |        0 |               0 |               8 / 8 |
| reflejo del flash               |           8 |       8 |                   0 |        0 |               0 |               8 / 8 |
| ligero desenfoque de movimiento |           7 |       7 |                   0 |        0 |               1 |               7 / 7 |
| desenfoque intenso              |           0 |       0 |                   0 |        0 |               0 |               0 / 0 |
| baja resolución                 |           7 |       6 |                   0 |        0 |               1 |               7 / 7 |
| **las nueve**                   |          58 |      50 |               **0** |    **0** |               4 |             51 / 58 |

Lo que dicen las cifras: una hoja limpia, con poca luz, con reflejos o ligeramente inclinada se lee
por completo y con exactitud. A medida que la hoja se degrada, la aplicación pierde filas, primero en la
columna del intervalo de referencia, luego filas enteras, hasta que el desenfoque intenso no produce nada
en absoluto. En ningún momento muestra un valor, una unidad o un código erróneos, que es
la propiedad que impone el conjunto de pruebas.

Un hallazgo de la propia ejecución: el target de pruebas no compilaba con
Swift 6.4, porque `Comparator` se había vuelto ambiguo entre `Shared` y el
SDK de la plataforma. La prueba nombra ahora `Shared.Comparator`, como ya hacía
`OmopExportTests`.

## Abierto

| Tema                                         | Qué falta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalidad prevista (MDR)                     | Una calificación por escrito según MDCG 2019-11 Rev.1. El caso límite es la pantalla de tendencias, que colorea los valores frente a intervalos publicados (ADR-039); la posición del proyecto es que una comparación con un número citado no constituye un hallazgo. Un dictamen externo.                                                                                                                                                                                                                                   |
| Operador del servicio de explicación alojado | Por defecto, las explicaciones se ejecutan en el dispositivo. La persona puede cambiar al servicio alojado (por defecto Azure OpenAI, zona de datos de la UE; Anthropic de forma voluntaria, Estados Unidos) o a su propia cuenta de Azure OpenAI o de Anthropic. Quien explote el servicio alojado trata datos de salud y debe documentar esa función (registro de las actividades de tratamiento, contratos de encargo del tratamiento).                                                                                   |
| Protección de datos                          | Diagrama de flujo de datos y una plantilla de evaluación de impacto relativa a la protección de datos para un operador.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Seguridad                                    | Desde el 2026-10-15 existen un modelo de amenazas, un SBOM y una prueba de seguridad realizada por el propio proyecto (`docs/security/threat-model-klarbefund.md`, `docs/sbom/`, `docs/security/security-test-report-2026-10-15.md`). La aplicación se bloquea con Face ID o con el código de acceso desde el 2026-10-15 (ADR-060). Abierto: una prueba de penetración independiente y la lista de brechas a nivel de requisito frente a BSI TR-03161 parte 1. CodeQL se ejecuta en cada cambio de iOS (`codeql-swift.yml`). |
| Exactitud del piloto                         | Archivos de verdad y recuentos agregados de informes reales, como se ha descrito.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
