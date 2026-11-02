---
source: docs/klarbefund/report-for-health-insurers.md
sourceHash: 821e6839f6e4c6afb7b5fe7ead3e9e6b766be700275755cd2ba9f59988ae279a
language: es
summary: "Las tres preguntas de una aseguradora, si la extracción es correcta, si los datos están seguros, si es un producto sanitario, respondidas con las evidencias, además de la oferta de marca blanca y consultoría."
---

# Klarbefund: informe de pruebas para aseguradoras de salud

Fecha 2026-10-15. Elaborado por el proyecto para una caja del seguro de enfermedad obligatorio
o una aseguradora privada, un grupo hospitalario o un proveedor de ePA que plantee las mismas tres
preguntas: _¿es correcta la extracción, están seguros los datos y es esto un
producto sanitario?_ Todo lo que aquí figura lo generan herramientas que cualquiera puede ejecutar sobre
el repositorio, con los comandos indicados, y cada punto abierto se designa como
abierto. La versión de una página para una reunión del comité de dirección es la tabla resumen; el
resto son las pruebas que respaldan cada línea.

**Qué se ofrece.** Klarbefund es un entorno de demostración y una
implementación de referencia de código abierto (Apache 2.0). No es un producto con un proveedor
detrás. Lo que el proyecto ofrece a una aseguradora es, o bien una **versión de marca
blanca** de la aplicación, con el nombre de la aseguradora y bajo su responsabilidad como operador,
o bien **consultoría técnica** para integrar el escáner, el diccionario de codificación
y el generador FHIR en una aplicación de ePA o de historia clínica electrónica que la aseguradora ya explote. Ambas
vías parten de las pruebas que se presentan a continuación.

## Resumen

| Pregunta                                       | Respuesta, con las pruebas                                                                                                                                                                                                                                                                                                    | Estado                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| ¿Lee correctamente los valores de laboratorio? | Referencia sintética bajo nueve condiciones de escaneo: 0 errores silenciosos, 0 valores inventados, 50 de 72 filas exactas; los escaneos degradados pierden filas, nunca muestran un valor erróneo. 1751 codificaciones de analitos, 71 unidades, LOINC y UCUM.                                                              | demostrado, piloto con informes reales abierto               |
| ¿Están seguros los datos?                      | En el dispositivo por defecto, Face ID o código de acceso delante de los resultados, AES-GCM por registro, clave en el Keychain respaldado por el Secure Enclave, ningún paquete de terceros, Apple Health en solo lectura. CodeQL 0 hallazgos, 0 vulnerabilidades conocidas, 9 pruebas de postura, modelo de amenazas, SBOM. | probado por el propio proyecto, prueba independiente abierta |
| ¿Es un producto sanitario?                     | Finalidad prevista: almacenar, mostrar, exportar y explicar qué es una medición; ningún diagnóstico, ningún veredicto. Según MDCG 2019-11, por lo general no es un producto; el coloreado de las tendencias es el caso límite que el proyecto ha dejado por escrito.                                                          | posición redactada, dictamen externo abierto                 |
| ¿Encaja con la ePA y el EEDS?                  | FHIR R4 con LOINC, UCUM, SNOMED CT, CVX y ATC; la base de datos de prueba contiene ya cuatro de las cinco categorías prioritarias del art. 14 del EEDS; el hub exporta el historial completo en un único Bundle; la etiqueta de bienestar del art. 47 se aplica si se comercializa como interoperable.                        | sí                                                           |
| ¿Es una DiGA?                                  | No, por diseño: una DiGA debe ser un producto con marcado CE. No se reivindica ningún certificado de DiGA.                                                                                                                                                                                                                    | n/a                                                          |
| ¿Puede mi equipo verificarlo?                  | Sí: cada cifra tiene un comando, los escaneos y las pruebas se ejecutan en un Mac con Xcode, y la colección de API del hub (Bruno) ensaya la integración.                                                                                                                                                                     | sí                                                           |

## 1. Qué hace Klarbefund

Una persona fotografía un informe de laboratorio o abre el PDF del laboratorio.
La aplicación lo lee en el dispositivo, codifica cada fila con LOINC y UCUM, conserva
el intervalo de referencia impreso, muestra tendencias entre informes y exporta el
historial como FHIR R4, OMOP CDM, JSON o PDF. Los valores leídos de una fotografía siguen siendo
`preliminary` hasta que la persona los comprueba; solo la capa de texto del PDF propio de un laboratorio
produce `final`. Con consentimiento, la aplicación escribe el historial de la persona
en su propia cuenta del hub de demostración EEDS, y junto a él las medias semanales de Apple
Health. Fuera de eso, nada sale del teléfono.

Detalles: [`README.md`](README.md) (dirigido a las personas usuarias),
[`clients/ios/README.md`](../../clients/ios/README.md) (desarrollo),
[`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md).

## 2. Exactitud

La medida es `ExtractionAccuracy`: una comparación campo por campo con una
verdad comprobada a mano: valor, unidad, código, intervalo de referencia y fecha. La cifra
que importa clínicamente son los **errores silenciosos**, filas que la aplicación mostró como valor
y en las que se equivocó; la referencia verifica cero en todas las condiciones.

| Condición                       | Encontradas | Exactas | Errores silenciosos | Espurios |
| ------------------------------- | ----------: | ------: | ------------------: | -------: |
| escaneo limpio a 150 dpi        |           8 |       8 |                   0 |        0 |
| inclinado 1 grado               |           8 |       8 |                   0 |        0 |
| inclinado 2 grados              |           7 |       5 |                   0 |        0 |
| inclinado 5 grados              |           5 |       0 |                   0 |        0 |
| habitación con poca luz         |           8 |       8 |                   0 |        0 |
| reflejo del flash               |           8 |       8 |                   0 |        0 |
| ligero desenfoque de movimiento |           7 |       7 |                   0 |        0 |
| desenfoque intenso              |           0 |       0 |                   0 |        0 |
| baja resolución                 |           7 |       6 |                   0 |        0 |
| **las nueve**                   |          58 |      50 |               **0** |    **0** |

Hojas sintéticas de 8 filas cada una, leídas con Apple Vision, 2026-10-15
([`accuracy-benchmark.json`](accuracy-benchmark.json)). Un piloto con informes
reales, con consentimiento por escrito y en el que solo los recuentos salen de la carpeta del participante,
está diseñado ([`evidence.md`](evidence.md#measuring-accuracy)) y
aún no se ha ejecutado; el piloto propio de una aseguradora es el siguiente paso natural.

## 3. Seguridad y protección de datos

| Capa                         | Qué se hizo                                                                                                                                                                                                               | Resultado, 2026-10-15                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Análisis estático            | CodeQL sobre la aplicación (82 archivos Swift); CodeQL y Semgrep sobre el hub en CI                                                                                                                                       | 0 hallazgos                                                                                                          |
| Dependencias                 | Listas CycloneDX para la aplicación y cada servicio del hub ([`docs/sbom/`](../sbom/README.md)); grype y npm audit sobre ellas                                                                                            | 0 vulnerabilidades conocidas; la aplicación tiene 0 paquetes de terceros                                             |
| Secretos                     | gitleaks sobre el árbol y los últimos 200 commits                                                                                                                                                                         | 0 tras la revisión                                                                                                   |
| Contenedores, manifiestos    | trivy sobre Dockerfiles y manifiestos de Kubernetes                                                                                                                                                                       | 0 HIGH tras dos correcciones; 2 MEDIUM, 12 LOW aceptados o abiertos                                                  |
| Configuración de compilación | `SecurityPostureTests`: entitlements, manifiesto de privacidad, ATS, criptografía, PKCE, HealthKit en solo lectura, cumplimiento de exportación                                                                           | 11 de 11 superadas                                                                                                   |
| Modelo de amenazas           | STRIDE para la aplicación ([`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md)) junto al del hub                                                                                                       | redactado; riesgos residuales enumerados                                                                             |
| Hub en vivo, desde fuera     | 40 comprobaciones anónimas de caja negra: controles de acceso de las rutas, redirecciones, cabeceras, TLS, consola de Keycloak                                                                                            | las comprobaciones de TLS y de la consola se superan; las de los controles de acceso requieren el horario de oficina |
| RGPD                         | Art. 25 por defecto, art. 5 minimización, art. 6/9 consentimientos, art. 15/17/20 derechos: cumplidos en el código; transparencia y transferencias, parcialmente; EIPD y función de responsable del tratamiento, abiertas | véase [`self-assessment.md`](self-assessment.md)                                                                     |
| BSI TR-03161 parte 1         | Evaluado por grupo de objetivos: 9 cumplidos, 3 parciales, 1 abierto (resiliencia, descartada con motivos en ADR-060), 2 n/a                                                                                              | entrada para el análisis de brechas de un laboratorio                                                                |

El método completo, los hallazgos y las correcciones se encuentran en
[`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md).
Es el proyecto probándose a sí mismo. Una prueba de penetración independiente, que
una aseguradora solicitará con razón, figura allí junto con lo que aportaría.

## 4. Posición regulatoria

| Marco                     | Posición                                                                                                                                                                                                                                                                                                                                                                                                      | Abierto                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| MDR / IVDR                | Almacenamiento, visualización, exportación y explicación de qué es una medición; ningún diagnóstico, puntuación de riesgo ni recomendación terapéutica. Por lo general no es un producto según MDCG 2019-11 Rev.1. La pantalla de tendencias colorea los valores frente a intervalos publicados y con fuente; la posición del proyecto es que una comparación con un número citado no constituye un hallazgo. | calificación por escrito, dictamen externo  |
| DiGA (§ 139e SGB V)       | No aplica; deliberadamente no es un producto                                                                                                                                                                                                                                                                                                                                                                  | ninguno                                     |
| Reglamento de IA de la UE | No es de alto riesgo mientras no sea un producto; cada respuesta, en el dispositivo o alojada, nombra su proveedor y su modelo (art. 50)                                                                                                                                                                                                                                                                      | ninguno                                     |
| EEDS 2025/327             | Art. 3, acceso al historial con consentimiento; etiqueta de bienestar del art. 47 si se comercializa como interoperable con sistemas de historia clínica electrónica                                                                                                                                                                                                                                          | texto de la etiqueta cuando se comercialice |
| Apple                     | Beta de TestFlight aprobada para probadores externos; etiqueta App Privacy: datos de salud, no vinculados, sin seguimiento                                                                                                                                                                                                                                                                                    | ninguno                                     |

## 5. La base de datos de prueba y los tipos de resultado que contiene

El hub de demostración funciona con 127 pacientes sintéticos (Synthea) más historiales
introducidos a mano, en un grafo Neo4j que refleja FHIR R4 y OMOP CDM. El 2026-10-15
incorporó los cuatro tipos de resultado que un integrador de ePA solicita en primer lugar (ADR-059).

| Tipo de resultado                                            | Codificación         | En la aplicación | En la base de datos de prueba | Cómo lo obtiene un integrador                    |
| ------------------------------------------------------------ | -------------------- | ---------------- | ----------------------------- | ------------------------------------------------ |
| Laboratorio, sangre y orina                                  | LOINC, UCUM          | sí               | sí                            | `/api/patient/observations`, Bundle FHIR         |
| ECG en reposo, Holter                                        | LOINC 11524-6, EC    | sí               | **nuevo**                     | `include=all`, DiagnosticReport con Observations |
| Espirometría, CPET, prueba de esfuerzo, lactato              | LOINC, PF y EC       | sí               | previsto                      |                                                  |
| Composición corporal por DXA                                 | LOINC 38269-7, RAD   | sí               | previsto                      |                                                  |
| Monitorización continua de glucosa                           | LOINC 107930-0       | sí               | previsto                      |                                                  |
| Presión arterial de 24 h, pantallas de dispositivos          | LOINC                | sí               | previsto                      |                                                  |
| Medias semanales de wearables                                | LOINC                | sí               | sí                            | escritas por la aplicación (ADR-057)             |
| Informes de imagen (radiografía, ecocardiografía, ecografía) | LOINC, RAD           | no (narrativo)   | **nuevo**                     | `include=all`, DiagnosticReport con conclusión   |
| Registro de vacunación                                       | CVX                  | no               | **nuevo**                     | `include=all`, Immunization                      |
| Plan de medicación (BMP)                                     | ATC, posología 1-0-1 | no               | **nuevo**                     | `include=all`, MedicationStatement               |
| Afecciones, medicamentos                                     | SNOMED CT, RxNorm    | a través del hub | sí                            | API de perfil, `$everything`                     |

Candidatos siguientes, por categoría del art. 14 del EEDS: microbiología, paneles de
alergia, genética (resultados de laboratorio); anatomía patológica, estudios del sueño, informes
narrativos de ECG (informes); resultados comunicados por el paciente e informes de alta
(historia clínica resumida, informes de alta). Cada uno supone un archivo de datos iniciales y un mapeador.

Ensayo: `bruno/MVHDv2/01 Patient/06 My whole record` obtiene el Bundle
con las cuatro categorías y falla de forma visible cuando falta una categoría.

## 6. Vías de integración

1. **Aplicación de marca blanca.** La aplicación tal cual, renombrada y firmada por la aseguradora,
   con la aseguradora como operador: aviso de privacidad, EIPD, contrato de encargo del tratamiento
   para el servicio de explicación alojado (Azure OpenAI, zona de datos de la UE, por
   defecto) y la cuenta de Apple. El código sigue siendo de código abierto.
2. **Componentes en una aplicación de ePA o de historia clínica electrónica existente.** El paquete Swift `Shared`
   (escaneo, el diccionario de 1751 codificaciones, procedencia, generadores FHIR y OMOP,
   consentimientos) no tiene ninguna dependencia de terceros y está cubierto por 419
   pruebas; se integra en una aplicación iOS existente. El mismo diccionario existe en
   TypeScript (`services/epa-ingest`) para una vía en el lado del servidor.
3. **Solo en el lado del hub.** La plataforma de una aseguradora lee el historial como FHIR R4
   desde la API del hub, o ejecuta la CLI de ingesta de ePA sobre los PDF que ya
   posee, sin la aplicación.

En todas las vías, las funciones de protección de datos corresponden a la aseguradora; el proyecto
aporta las plantillas y las pruebas.

## 7. Qué sigue abierto

| Punto                                                                                    | Quién lo cierra                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Prueba de penetración independiente, lista de brechas de TR-03161                        | un laboratorio reconocido por el BSI             |
| Exactitud del piloto con informes reales                                                 | el piloto de la aseguradora, con consentimientos |
| Calificación MDR por escrito, dictamen externo                                           | asesoría regulatoria                             |
| EIPD, registro de las actividades de tratamiento, función de responsable del tratamiento | el operador                                      |
| Secciones de la página de perfil para los nuevos tipos de resultado                      | el proyecto                                      |
| Conjunto de pruebas Swift en CI (requiere permisos sobre los flujos de trabajo)          | el propietario del repositorio                   |

## 8. Verifíquelo usted mismo

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2 && cd MinimumViableHealthDataspacev2
cd clients/ios && swift test                                   # 419 tests, incl. the benchmark and the posture tests
cd ../.. && scripts/security/scan-repo.sh                      # SBOM check, grype, trivy, gitleaks, semgrep, hadolint, npm audit
scripts/security/check-hub-blackbox.sh                         # the live hub from outside, office hours Mon-Fri 05:17-18:13 UTC
./scripts/run-api-tests.sh Local "01 Patient"                  # the record as an integrator receives it
```

Documentos: [`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md),
[`run-on-mac.md`](run-on-mac.md), [`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md),
[`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md),
[ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md).
