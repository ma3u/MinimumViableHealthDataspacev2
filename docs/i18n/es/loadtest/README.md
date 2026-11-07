---
source: docs/loadtest/README.md
sourceHash: cf616f25aec58b6486411a41333ab1183aec6cffd7e78d9b0822dfd30a72c95b
language: es
summary: Cada prueba de carga, estrés y picos contra el hub en producción y la pila de Compose, con su panel de Grafana, lo que encontró, lo que cambió por ello y las pruebas que faltan.
---

# Pruebas de carga, estrés y picos: resultados y cuadros de mando

Lo que hace bajo carga el hub en producción en <https://ehds.mabu.red>, medido
con la batería de [k6](https://github.com/grafana/k6/releases/tag/v2.3.0) de [`load-tests/`](../../load-tests/) y registrado en el
Grafana de la plataforma. Esta página es el índice: cada ejecución, lo que
encontró, lo que cambió a raíz de ella y las ejecuciones que quedan por
hacer. Los informes detallados están enlazados, y cada ejecución en
producción tiene el enlace a su cuadro de mando.

Los cuadros de mando requieren iniciar sesión en <https://grafana.ehds.mabu.red>
y solo muestran datos mientras la pila está en marcha (se detiene fuera del
horario de oficina, [ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)). Cada enlace abre el cuadro de mando **Prueba de
carga y estrés** con el `testid` y el intervalo de tiempo de la ejecución; los
resúmenes en bruto de k6 están en el portátil que las ejecutó
(`load-tests/results/<testid>*`) y en las incidencias.

| Escenario   | Qué hace                                                            | Última ejecución en producción | Resultado                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke`     | 1 usuario, 30 s, cada endpoint una vez                              | 2026-10-05                     | supera la prueba                                                                                                                                                                                     |
| `load`      | 50 usuarios, 15 min, la combinación de personas                     | 2026-10-06, 21:15              | **cumple todos los SLO**: p95 155 ms API, 43 ms páginas, 217 ms NLQ, 0 fallidas                                                                                                                      |
| `audited`   | 1 a 20 consultas NLQ en paralelo a través de la cadena de auditoría | 2026-10-05                     | supera la prueba tras [#534](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/534) y [#536](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/536) (límite de tasa por usuario) |
| `contracts` | hasta 10 usuarios negociando y transfiriendo a través del EDC       | 2026-10-06, 13:52              | supera la prueba: 578 peticiones, 0 fallidas, p95 287 ms                                                                                                                                             |
| `stress`    | 50, 100, 200, 400 usuarios, interrupción ante peticiones fallidas   | 2026-10-06, 21:40              | **400 usuarios, 0 fallidas**; los SLO de latencia se rompen a partir de 200 usuarios, techo: UI                                                                                                      |
| `spike`     | un salto repentino a muchos usuarios y vuelta atrás                 | todavía no                     | la siguiente, después de [`size-ui.sh`](../../scripts/azure/size-ui.sh) ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md))                                                             |
| `soak`      | una carga constante durante dos horas                               | todavía no                     | después de `spike`; mide los créditos de ráfaga de Postgres                                                                                                                                          |
| `signin`    | 5 a 50 inicios de sesión por minuto contra Keycloak                 | todavía no en producción       | compose: 12 de 127 inicios de sesión por encima de 3 s                                                                                                                                               |
| `proxy`     | solo el proxy, 5 a 25 usuarios                                      | todavía no en producción       | necesita una tarea dentro del entorno; compose supera la prueba                                                                                                                                      |

## Las ejecuciones en producción, de la más reciente a la más antigua

### 2026-10-06 por la tarde-noche: carga y estrés tras las correcciones del día

Pila: Neo4j con 2 vCPU y 4 GiB ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md)), las vistas del grafo limitadas a los
30 eventos de acceso más recientes ([#580](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/580)), el bucle de reintentos del agente
de incorporación corregido ([#581](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/581)), el almacén de tareas en el Flexible Server
([#589](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/589)).

| Ejecución                                                                                                                                                                 | Usuarios          | Peticiones      | Fallidas   | p95 todo / API / páginas / NLQ    | Veredicto                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------- | ---------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| [`20261006-2115-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-2115-load-aca&from=1791321300000&to=1791322320000)     | 50 durante 15 min | 19.509 (21,5/s) | **0,00 %** | 146 ms / 155 ms / 43 ms / 217 ms  | se cumplieron todos los SLO, comprobaciones 99,97 %                                |
| [`20261006-2140-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-2140-stress-aca&from=1791322800000&to=1791324300000) | 50 a 400, 20 min  | 81.518 (63,6/s) | **0,00 %** | 3,35 s / 3,53 s / 3,23 s / 4,93 s | SLO de latencia superados a partir de 200 usuarios; todas las respuestas correctas |

El techo fue la UI: tres réplicas de medio núcleo al 99 % de CPU a partir de
la etapa de 400 usuarios, Neo4j con 0,82 de sus 2 núcleos y 2,66 GB de 4 GiB,
el proxy con 0,06 núcleos. Los errores de los registros eran la UI llamando a
la API de gestión del EDC en la dirección equivocada (unas 8.900 líneas 404 en
la ejecución de estrés), que [#648](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/648) fija en cada despliegue; las páginas EDC no
hicieron trabajo real en estas ejecuciones, por lo que la siguiente `load`
posterior a esa corrección cambiará las cifras.

Lo que cambió a raíz de ello: el [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md),
un núcleo completo por réplica de la UI, hasta seis réplicas con una regla de
concurrencia HTTP de 15, aplicado por [`scripts/azure/size-ui.sh`](../../scripts/azure/size-ui.sh); ahora un
despliegue espera mientras hay una ejecución en curso (`LOAD_TEST_RUNNING`),
porque una fusión del 2026-10-06 volvió a desplegar la UI y el proxy en mitad
de una ejecución.

### 2026-10-06 por la tarde: la primera ejecución de estrés hasta 400 usuarios

| Ejecución                                                                                                                                                                 | Usuarios          | Peticiones    | Fallidas       | p95 API / páginas / NLQ             | Veredicto                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------- | -------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`20261006-1728-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1728-stress-aca&from=1791307740000&to=1791309060000) | 50 a 400          | 84.624 (66/s) | **0,00 %**     | 3,19 s / 2,8 s / 4,35 s             | se alcanzaron todas las etapas; Neo4j no se reinició tras el [ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md)                                                                                                   |
| [`20261006-1455-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1455-load-aca&from=1791298500000&to=1791299520000)     | 50 durante 15 min | más de 10.000 | 0,03 %         | páginas y API por debajo de los SLO | con [#580](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/580) y [#579](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/579) desplegados; ambas cadenas de auditoría intactas tras la ejecución     |
| [`20261006-1152-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1152-load-aca&from=1791287580000&to=1791288600000)     | 50 durante 15 min |               | 0              | 151 ms en total                     | con [#576](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/576); se ejecutó junto al bucle de reintentos del agente de incorporación ([#577](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/577)) |
| [`20261006-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-stress-aca&from=1791274440000&to=1791275580000)           | 50 a 400          |               | 2,1 % al final | `/api/graph` 64 s al final          | interrumpida en torno a 300 usuarios: Neo4j terminado por falta de memoria (código de salida 137)                                                                                                                            |
| [`20261006-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-load-aca&from=1791273300000&to=1791274320000)               | 50 durante 15 min |               | 0              |                                     | la referencia de la mañana dentro del entorno                                                                                                                                                                                |

La ejecución de estrés de la mañana encontró el techo de Neo4j por la memoria;
la ejecución de la tarde, después de [`size-neo4j.sh`](../../scripts/azure/size-neo4j.sh) (2 vCPU, 4 GiB, heap de
1,5 GiB, caché de páginas de 1 GiB), alcanzó 400 usuarios sin ninguna petición
fallida y desplazó el techo a la UI. Una ejecución de carga intermedia
(`20261006-1359-load-aca`) falló por latencia porque el agente de
incorporación estaba reintentando en segundo plano una petición de credencial
bloqueada treinta veces por segundo ([#577](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/577)); la corrección ([#581](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/581)) se publicó
antes de las ejecuciones de la tarde-noche.

### 2026-10-05: la referencia

Las primeras ejecuciones contra el hub en producción, desde un portátil en
Berlín, con la vista de la plataforma desde Azure Monitor: [la referencia en Azure](2026-10-baseline.md).
50 usuarios durante 15 minutos superaron la prueba sin ninguna petición
fallida, pero con un p95 de la API de 1,8 s, con `/api/graph` en 10 s; las
consultas auditadas chocaron con el límite de tasa del proxy (83,6 % de 429
antes de [#534](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/534), 23,2 % después). Neo4j al 97 % de sus 2 GiB fue el primer
techo. La misma batería contra [la pila de compose](2026-10-05-local.md) en
un portátil, a modo de comparación: la carga cumple todos los SLO con 50
usuarios y el estrés se rompe entre 100 y 200 usuarios por la CPU de la UI.

![Cuadro de mando de prueba de carga y estrés, 50 usuarios contra ehds.mabu.red el 2026-10-05](img/2026-10-05-load-azure.png)

## Dónde se encuentra la plataforma

La [evaluación de preparación para producción de octubre de 2026](2026-10-production-readiness.md)
lee estas ejecuciones junto con el trabajo de seguridad y los ADR conforme al
[Well-Architected](https://learn.microsoft.com/en-us/azure/well-architected/pillars) Framework y al [Cloud Adoption](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/) Framework, pilar por pilar: lo
que está implantado, lo que está abierto y lo que separa al demostrador de una
plataforma operable.

## Lo que muestra el cuadro de mando

El cuadro de mando **Prueba de carga y estrés** ([`observability/grafana/dashboards-azure/load-stress-test.json`](../../observability/grafana/dashboards-azure/load-stress-test.json))
tiene tres filas, cada una filtrada por el `testid` de la ejecución:

- **Load (k6): what the test is doing**: usuarios virtuales, peticiones por
  segundo, peticiones fallidas, p95 por grupo (páginas, API, NLQ), los
  endpoints más lentos.
- **Server side: the proxy**: peticiones y p95 por ruta, rechazos por límite
  de tasa, los registros por transacción de la cadena de auditoría, las líneas
  de registro de esta ejecución.
- **Containers**: CPU y memoria de la UI, el proxy, Neo4j, Keycloak y los
  conectores, réplicas y los créditos de ráfaga del Flexible Server.

El cuadro de mando **Contratos y transferencias EDC** ([`mvhd-edc-dsp`](../operations/dashboards.md#edc-contracts-and-transfers)) sigue
las negociaciones y transferencias que una ejecución `contracts` impulsa a
través de los conectores. Cómo leer un resultado, hipótesis por hipótesis, se
explica en el [runbook](../knowledge/runbooks/load-and-stress-test.md).

## Las ejecuciones que quedan por hacer

1. `stress` después de [`scripts/azure/size-ui.sh`](../../scripts/azure/size-ui.sh) ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)): dónde se rompe
   por primera vez el SLO de 1 s de la API con réplicas de núcleos completos;
   el p95 por etapa se incorpora a la tabla del ADR.
2. `spike`, después `soak` durante dos horas: los créditos de ráfaga de
   Postgres (hipótesis 4 del runbook) y el coste por 1.000 peticiones según
   [Cost Management](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/overview-cost-management) durante la ventana de `soak`.
3. `signin` en producción: si el inicio de sesión es un punto único
   (hipótesis 6).
4. `load` una vez más con las páginas EDC haciendo trabajo real ([#648](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/648) fija la
   dirección del conector en cada despliegue).

Cada una dentro del horario de oficina, anunciada, una a una; un despliegue
espera mientras hay una ejecución en curso. El procedimiento es el
[runbook](../knowledge/runbooks/load-and-stress-test.md); los puntos abiertos
se siguen en [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571).

## Reproducir

```bash
scripts/azure/run-load-test.sh load            # inside Azure, as a Container Apps job
ABORT_ON=failures scripts/azure/run-load-test.sh stress
load-tests/run.sh load azure                   # from a laptop, metrics to a local Grafana
```

Las sesiones se generan para diez usuarios por persona y se entregan a la
tarea como un secreto; no inicia sesión nada real. La batería, sus escenarios
y sus umbrales están documentados en [`load-tests/README.md`](../../load-tests/README.md).
