---
source: docs/developer/api-integration-tests.md
sourceHash: 73ea4c43140a195c8743ad059aea7d2badba3731a9c248dae581d3fabd99ac50
language: es
summary: La colección de Bruno y las comprobaciones del espacio de datos, de identidad y del dominio: qué cubre cada una, cómo ejecutarla y si está al día, con cifras medidas.
---

# Pruebas de integración a través de las API

El hub se prueba desde fuera, tal como lo usaría un socio, mediante tres
conjuntos de pruebas que llaman a sus API HTTP: la colección de Bruno para las rutas propias del hub,
y dos conjuntos de shell para el protocolo del espacio de datos y la capa de identidad. Esta
página explica qué cubre cada uno, cómo ejecutarlo y lo actualizado que está, con las
cifras medidas el 2026-11-03.

## Los tres conjuntos de pruebas

| Conjunto                                     | Qué llama                                                                   | Se ejecuta con                             | Se ejecuta en CI                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| Colección de Bruno                           | las rutas `/api/*` del hub, además de los servicios EDC y el proxy de Neo4j | `./scripts/run-api-tests.sh <environment>` | `bruno-smoke.yml` (PR), `compliance.yml` (cada noche), `demo-smoke.yml` (en vivo) |
| Comprobaciones del espacio de datos del EEDS | la Management API del plano de control de EDC y los endpoints de DSP 2025-1 | `./scripts/run-ehds-dataspace-checks.sh`   | `compliance.yml`, job "DSP 2025-1 TCK"                                            |
| Comprobaciones de identidad del EEDS         | IdentityHub, IssuerService y el plano de control (DCP 1.0)                  | `./scripts/run-ehds-identity-checks.sh`    | `compliance.yml`, job "DCP v1.0 Compliance"                                       |

Un cuarto conjunto, `scripts/run-ehds-tests.sh`, comprueba el dominio sanitario en el
grafo (FHIR, OMOP, HealthDCAT-AP, la cadena de acceso del art. 53) a través de Neo4j
en lugar de HTTP; `compliance.yml` lo ejecuta como "EHDS Health Domain".

Ninguno de los conjuntos es el TCK de Eclipse. Son nuestros, ejercitan las API con
`curl` o Bruno, y los de DSP y DCP nunca actúan como contraparte del protocolo, de modo que
son comprobaciones de disponibilidad y de forma sobre nuestra propia pila, no pruebas de conformidad.
Adoptar los verdaderos [TCK de DSP y DCP de Eclipse](https://github.com/eclipse-dataspacetck)
es la fase 1 de [#338](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/338).
El [SDLC](../SDLC.md#63-protocol-compliance) recoge la historia del porqué.

## La colección de Bruno

`bruno/MVHDv2/` se organiza según el perfil que envía una petición, una carpeta
por cada función del Reglamento (UE) 2025/327, más los procedimientos bilaterales del
capítulo IV, los límites entre funciones y las superficies del protocolo y de la plataforma
([ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md)). Un socio
la utiliza para ensayar contra el hub.

| Carpeta                   | Peticiones | Se ejecuta contra                    |
| ------------------------- | ---------: | ------------------------------------ |
| 00 Public                 |          8 | Local, Azure-Dev                     |
| 01 Patient                |         22 | Local, Azure-Dev                     |
| 02 Data Holder            |         16 | Local, Azure-Dev                     |
| 03 Data User              |         14 | Local, Azure-Dev                     |
| 04 Access Body            |         13 | Local, Azure-Dev                     |
| 05 Dataspace Operator     |         30 | Local, Azure-Dev                     |
| 06 Trust Centre           |          3 | Local, Azure-Dev                     |
| 07 Journey - Data permit  |         16 | Local, Azure-Dev                     |
| 08 Journey - Data request |          5 | Local, Azure-Dev                     |
| 09 Access control         |         39 | Local, Azure-Dev                     |
| 10 Connecting partner     |         20 | Solo Local (EDC es interno en Azure) |
| 11 Platform               |          6 | Solo Local (el proxy es interno)     |
| 12 EUDI wallet            |          3 | Local con `BRUNO_EUDI=1`             |
| 13 Static export          |         32 | Solo Static-mock                     |
| **Total**                 |    **227** |                                      |

Así, una ejecución Local envía 192 peticiones, una Azure-Dev 166 y una Static-mock 32.

### Cómo ejecutarla

```bash
./scripts/run-api-tests.sh Static-mock   # GitHub Pages fixtures, GET only, no secret needed
./scripts/run-api-tests.sh Local         # the compose stack on :3003
./scripts/run-api-tests.sh Azure-Dev     # the live hub, needs NEXTAUTH_SECRET
./scripts/run-api-tests.sh Local "07 Journey - Data permit"   # one folder
```

El ejecutor forja una sesión de NextAuth por perfil (`ui/scripts/forge-bruno-session.mjs`)
a partir de `NEXTAUTH_SECRET`, de modo que ningún archivo `.bru` contiene nunca una cookie. Para `Local`
lee el secreto del contenedor de la UI cuando la variable no está definida; para
`Azure-Dev` usted mismo lo exporta y nunca se imprime. Los informes se guardan en
`test-results/bruno/` (se cambia con `BRUNO_REPORT_DIR`): un JSON de resumen que lee la
línea base de cumplimiento, y HTML, JUnit y JSON en bruto en `raw/`.

### Las reglas que sigue una petición

Según [`.claude/rules/testing.md`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/.claude/rules/testing.md)
y [ADR-031](../ADRs/ADR-031-checks-must-assert.md):

- Se ubica en la carpeta del perfil que la envía; una petición que envían dos perfiles
  va en una carpeta de recorrido y nombra el perfil que actúa.
- Comprueba el código de estado **y** al menos una propiedad del cuerpo. Una petición
  cuya única comprobación es `res.status: lt 500` no puede fallar y se rechaza.
- Una petición cuyo objeto no puede existir en una pila se omite de forma visible, con una prueba
  llamada `SKIPPED: <reason>`. Nunca pasa en silencio.
- Ninguna cookie de sesión ni otra credencial en un archivo `.bru`.

Tres scripts lo hacen cumplir en pre-commit y en el PR Gate:

| Comprobación                      | Qué la hace fallar                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `scripts/check-bruno-coverage.py` | una ruta sin petición, una petición cuya ruta ya no existe, una petición sin aserción, una credencial                     |
| `scripts/check-bruno-strength.py` | una petición 2xx más laxa de lo que permite `docs/bruno-soft-assertion-allowlist.txt` (solo tipos contenedor)             |
| `scripts/check-workflow-paths.py` | un flujo de trabajo cuyo filtro `paths` omite un script que ejecuta, de modo que una corrección no lo volvería a ejecutar |

### ¿Están al día?

Medido el 2026-11-03 contra `main` en `b0586238`:

| Pregunta                                     | Respuesta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Tiene cada ruta una petición?               | **Sí.** `check-bruno-coverage.py`: 109 rutas implementadas, 109 con petición (100 %), 0 en la lista de permitidas sin petición.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ¿Puede fallar cada petición?                 | **Sí.** Ninguna petición carece de una aserción o de una prueba.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ¿Son sólidos los caminos de éxito?           | **En parte.** `check-bruno-strength.py`: de 127 peticiones 2xx en vivo, 49 solo comprueban un tipo contenedor; las 49 están en la lista de permitidas, que es el trinquete.                                                                                                                                                                                                                                                                                                                                                                                            |
| ¿Responde la demostración estática?          | **Sí.** `run-api-tests.sh Static-mock`: 32 superadas, 0 fallidas, 0 omitidas de 32 (99 aserciones) contra GitHub Pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ¿Responde la pila de compose? (CI, `main`)   | **Casi.** Ejecución de `compliance.yml` [41586005794](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005794): 191 superadas, 1 fallida de 192. El fallo es `03 Data User/13 A dataset described in German` ("the title is there in English and in German"). El mínimo es 179/0, por lo que falla el job Compliance Report.                                                                                                                                                                                                                   |
| ¿Responde el hub en vivo? (`demo-smoke.yml`) | **No hasta la corrección del 2026-11-03.** Ejecución [41586005885](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005885): 30 superadas, 136 fallidas de 166, 163 de ellas con 401. El secreto era correcto; el almacén de cookies de Bruno sustituyó la cabecera de sesión por la cookie `acaAffinity` del ingress ([gotchas](../gotchas.md), 2026-11-03). Con `--disable-cookies` la misma ejecución obtuvo 165 de 166; la que queda es `03 Data User/07 Federated cohort statistics`, un 503 de la consulta federada. El mínimo es 153/0. |
| Comprobaciones de DSP (CI)                   | 25 superadas, 0 fallidas, 8 omitidas de 33, en el mínimo de 25/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Comprobaciones de DCP (CI)                   | 27 superadas, 0 fallidas, 0 omitidas de 27, en el mínimo de 27/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Comprobaciones del dominio del EEDS (CI)     | 25 superadas, 0 fallidas, 5 omitidas de 30, por encima del mínimo de 18/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Así pues, la colección está al día con el código: cada ruta está cubierta y la
puerta de cobertura lo mantiene así. El 2026-11-03 ambos resultados en `main` estaban en rojo; ambos
están corregidos y se siguen en
[#839](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/839). La
ejecución en vivo obtiene 166 de 166 desde #853, y su mínimo es 166/0 desde #856.

## La línea base de cumplimiento

El resultado de cada conjunto se compara con un mínimo en
[`scripts/compliance-baseline.json`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/compliance-baseline.json)
mediante `scripts/check-compliance-baseline.py`. El job falla cuando `passed` cae
por debajo del mínimo o `failed` lo supera, de modo que un conjunto que aún no pasa
puede proteger igualmente contra un empeoramiento. Suba un mínimo cada vez que un conjunto
mejore; bajarlo exige una razón en su `note`, y `review_by` hace que un
mínimo caduque para que nadie pueda dejarlo bajo para siempre.

```bash
python3 scripts/check-compliance-baseline.py --results test-results
```

## Las comprobaciones del espacio de datos y de identidad

Ambas necesitan la pila JAD completa (consulte [la pila y el entorno](stack-and-environment.md))
con las fases de carga 1 a 7 terminadas.

```bash
./scripts/run-ehds-dataspace-checks.sh   # DSP: catalogue, negotiation, transfer, policy (33 checks)
./scripts/run-ehds-identity-checks.sh    # DCP: DIDs, keys, credentials, scopes, trust lists (27 checks)
```

Leen `EDC_MANAGEMENT_URL`, `EDC_IDENTITY_URL` y `EDC_ISSUER_URL`, y
usan por defecto los puertos de compose. Las comprobaciones de identidad inician y detienen el
contenedor `rogue-issuer` (perfil de compose `trust-check`) para demostrar que se rechaza una
credencial de un emisor que no figura en ninguna lista de confianza. En Azure los mismos
conjuntos se ejecutan desde un job de ACA (`scripts/azure/08-compliance-runner.sh`,
`compliance.yml` lanzado con `target: azure`), donde se omiten las comprobaciones que necesitan
mirar dentro de un contenedor.
