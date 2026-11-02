---
source: docs/operations/dashboards.md
sourceHash: 39db3b7928f591277ed59e3c3ca266cb08249a1cebe8b4abc594966839e6f1b1
language: es
---

# Los cuadros de mando

Tres cuadros de mando de Grafana muestran lo que hace el hub en producción:
los contratos y las transferencias que negocian los conectores, el registro
de auditoría reglamentario y su integridad, y la plataforma durante una
prueba de carga. Se ejecutan en el propio Grafana del hub, en
<https://grafana.ehds.mabu.red>, que forma parte de la pila de observabilidad
del [ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)
(colector OpenTelemetry, Prometheus, Loki, Tempo, Grafana, con Azure Monitor y
Log Analytics para los contenedores y los registros de los conectores).

| Cuadro de mando                                                                                                                                            | Id                | Responde a                                                                              | Intervalo predeterminado, actualización |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| [Contratos y transferencias EDC](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=now-90d&to=now&timezone=browser&refresh=1m) | `mvhd-edc-dsp`    | Qué negociaron y transfirieron los conectores, qué se rechazó y por qué                 | 24 horas, 1 minuto                      |
| [Registro de auditoría del EEDS](https://grafana.ehds.mabu.red/d/mvhd-ehds-audit/ehds-audit-trail?from=now-30d&to=now&timezone=browser&refresh=1m)         | `mvhd-ehds-audit` | Si las pruebas están intactas, qué se registró, qué copia un auditor                    | 24 horas, 1 minuto                      |
| [Prueba de carga y estrés](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test)                                                            | `mvhd-load-test`  | Qué está haciendo k6, con qué rapidez responde el hub, qué contenedor se satura primero | 1 hora, 10 segundos                     |

**Inicio de sesión.** Grafana pide su propio inicio de sesión. La contraseña
de la cuenta del operador es el secreto de Key Vault `grafana-admin-password`
en `kv-mvhd-b53a0449`; la de la cuenta de solo lectura del auditor es
`keycloak-user-mvhd-auditor-password`. Nada de lo que muestran estos cuadros
de mando son datos de un paciente: el registro de auditoría guarda las
preguntas y las consultas solo como SHA-256, y las pruebas de carga se
ejecutan contra pacientes sintéticos.

**Cuando no hay nada que ver.** La pila se detiene fuera del horario de
oficina ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)), por lo que
los paneles que leen el proxy o los conectores están vacíos en ese tiempo; los
que leen Azure Monitor conservan su historial. Amplíe el intervalo de tiempo
antes de concluir que no ha ocurrido nada; el panel **Newest record** indica
cuándo ocurrió lo último.

**De dónde proceden.** Los cuadros de mando son JSON en
[`observability/grafana/dashboards-azure/`](../../observability/grafana/dashboards-azure/)
(las variantes de Azure leen Azure Monitor y Log Analytics) y
[`observability/grafana/dashboards/`](../../observability/grafana/dashboards/)
(la pila de compose lee Prometheus y Loki), generados por
`observability/grafana/build-dashboards.py` y aprovisionados con la
aplicación de observabilidad. Un cambio en un cuadro de mando es un cambio en
su JSON, revisado como el código.

## Contratos y transferencias EDC

![El cuadro de mando de contratos y transferencias EDC durante 90 días: 2.791 negociaciones solicitadas y 2.788 finalizadas, 2.787 transferencias solicitadas, 2.785 iniciadas, 794 rechazadas por falta de un permiso de datos, una terminada; los estados de negociación a lo largo del tiempo con un único pico el 6 de octubre, las pruebas de carga](img/edc-contracts-transfers.jpg)

Cada negociación de contrato y cada transferencia de datos DSP, contadas a
partir de la cadena de hash `dsp` del registro de auditoría: el hub escribe un
registro cuando hace la petición al conector (solicitada) o cuando rechaza una
transferencia por falta de un permiso de datos, y las devoluciones de llamada
de los conectores escriben cada estado posterior (acordada, finalizada,
iniciada, completada, terminada). El cuadro de mando es la vista del operador
sobre los mismos registros que el auditor lee en el cuadro de mando del
registro de auditoría.

| Fila                                         | Paneles                                                                                                | Cómo leerla                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                                       | What this shows; **Newest record**                                                                     | El registro más reciente de la cadena, sea cual sea el intervalo de tiempo. «9 days ago» con paneles vacíos significa que no se ha negociado nada desde entonces: amplíe el intervalo.                                                                                        |
| Contract negotiations (DSP)                  | Requested, Agreed, Finalized, Terminated or failed; **Negotiation states** a lo largo del tiempo       | Requested y Finalized deberían coincidir en un periodo tranquilo; una diferencia es una negociación que nunca volvió del conector, lo que explica la fila **Connector services**. «Agreed» es un estado transitorio y normalmente vale 0.                                     |
| Data transfers                               | Requested, Started, Completed, **Refused (no data permit)**, Terminated or failed; **Transfer states** | Refused es la barrera funcionando: art. 61(1), ningún acceso sin permiso (art. 68). El recorrido de contratos de k6 pide uno sin permiso a propósito, una vez de cada cuatro, por lo que los rechazos llevan una etiqueta _Load test run_ y son esperados (#571).             |
| Refused, terminated and failed, with reasons | Tabla **Not completed**                                                                                | Cada registro que no es un éxito, con el motivo del conector, las partes y la ejecución a la que pertenece.                                                                                                                                                                   |
| Connector services (EDC)                     | Errores por servicio, líneas de registro por servicio, últimos errores del conector (Log Analytics)    | Líneas ERROR y SEVERE por servicio de conector, sin los propios errores de exportación del agente de OpenTelemetry. Cero es el caso normal; los servicios EDC registran a nivel INFO solo al arrancar y cuando hay problemas, por lo que una hora tranquila es una hora sana. |

Las cifras de la captura de pantalla son las pruebas de carga del 5 y el 6 de
octubre de 2026: unas 2.800 negociaciones y transferencias en pocas horas,
todas las negociaciones finalizadas y 794 transferencias rechazadas porque el
recorrido hizo la petición sin permiso. «Completed» se queda en 0 porque los
planos de datos de la demostración responden con una transferencia iniciada y
sin devolución de llamada de finalización; los recuentos de transferencias de
los [resultados de las pruebas de carga](../loadtest/README.md) son los de las
iniciadas.

![Las filas inferiores del cuadro de mando EDC: la tabla Not completed con las transferencias rechazadas de la ejecución de estrés, cada una con su motivo y sus partes; errores y líneas de registro por servicio de conector durante 90 días desde Log Analytics, con el pico del 15 de septiembre; los últimos errores del conector](img/edc-contracts-transfers-connectors.jpg)

Las filas inferiores de la captura de pantalla: cada transferencia rechazada
de la ejecución de estrés con `did:web:pharmaco.de` como parte y el motivo, y
las líneas de error de los conectores durante 90 días, donde el único pico es
el día en que se volvieron a cargar los datos iniciales de la capa de
identidad.

## Registro de auditoría del EEDS

![El cuadro de mando del registro de auditoría del EEDS: ambas cadenas INTACT, 17.540 registros de consultas y 11.946 registros de contratos y transferencias en 30 días, 0 escrituras de auditoría fallidas, 0 consultas rechazadas, 794 transferencias rechazadas; debajo, los registros más recientes de la cadena de contratos y transferencias con hash, ejecución, resultado, partes, hora y número de secuencia](img/ehds-audit-trail.jpg)

El registro de auditoría reglamentario del [ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md):
cada consulta en lenguaje natural o federada, cada negociación de contrato y
cada transferencia es un `AuditEvent` de FHIR R4, encadenado por hash al
anterior, y una petición cuyo registro no puede escribirse se rechaza. El
cuadro de mando se abre con la guía del auditor, que un auditor puede seguir
sin el proyecto:

![La guía del auditor en la parte superior del cuadro de mando: lo que exige el reglamento, después siete pasos desde fijar el periodo de auditoría hasta anotar las cabezas de las cadenas, y el límite conocido de una cadena que reside en la base de datos que protege](img/ehds-audit-trail-guide.jpg)

| Fila                              | Paneles                                                                                                                                             | Cómo leerla                                                                                                                                                                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auditor guide                     | El reglamento (art. 61(1), 68, 73(1)(e), 9; art. 5(2) y 30 del RGPD) y siete pasos                                                                  | El procedimiento de una auditoría, desde el selector de tiempo hasta el informe. Sígalo en orden.                                                                                                                                                                         |
| Integrity of the evidence         | **Query chain**, Query records, **Contract & transfer chain**, Contract & transfer records, Audit writes failed, Refused queries, Refused transfers | Ambas cadenas deben indicar **INTACT**: el proxy recalcula cada hash desde el primer registro en cada actualización. **BROKEN** significa que un registro se ha modificado, eliminado o reordenado: deténgase y escale. Audit writes failed debe ser 0 o estar explicado. |
| What was recorded                 | Contract and transfer records by kind; query records by kind                                                                                        | El volumen a lo largo del tiempo, por tipo de registro; una prueba de carga aparece como un pico etiquetado con su ejecución.                                                                                                                                             |
| Records, newest first             | Contract and transfer records; query records                                                                                                        | Una fila por registro: acuerdo, activo y permiso, indicador de demostración, hash, ejecución de prueba de carga, resultado, partes, motivo, hora, quién lo notificó, número de secuencia, qué. Las preguntas y el Cypher aparecen solo como SHA-256.                      |
| For the audit report: chain heads | Query chain head; contract & transfer chain head                                                                                                    | Copie ambos valores, el recuento de registros y el hash, en el informe de auditoría. En la siguiente auditoría la cadena debe seguir teniendo la misma cabeza en el mismo número de registro; si no, se reescribieron registros a posteriori.                             |

Dos cosas que un auditor debe saber, ambas en el propio cuadro de mando: un
registro marcado como **Demo** es tráfico de demostración, no un uso real; un
registro con un **Load test run** lo escribió una ejecución de k6 contra el hub
con tráfico sintético y se contabiliza aparte. Y el límite conocido (#418): la
cadena reside en Neo4j y demuestra el orden y la integridad, pero alguien con
acceso de escritura a la base de datos podría reconstruirla a partir de un
punto determinado; comparar las cabezas de las cadenas entre auditorías lo
detecta, y un resumen diario firmado con una copia de escritura única es lo
que lo cierra. Los registros en bruto son `AuditEvent` de FHIR en
`/audit/chains/query/events` y `/audit/chains/dsp/events` en el proxy;
`scripts/verify-audit-chain.sh` recalcula la cadena fuera de Grafana.

## Prueba de carga y estrés

![El cuadro de mando de prueba de carga y estrés en la ejecución de estrés del 6 de octubre de 2026: usuarios virtuales que suben de 50 a 400, hasta 107 peticiones por segundo, 0 % de peticiones fallidas, 0 limitadas por tasa, la peor comprobación en el 84,9 %, 15.091 iteraciones; el p95 por tipo sube a 5,6 segundos para NLQ, 5,1 segundos para la API y 3,7 segundos para las páginas a partir de la etapa de 200 usuarios](img/load-stress-test.jpg)

Qué vigilar mientras k6 se ejecuta contra el hub (#519): la carga que aplica
la prueba, el tiempo de respuesta que ve el cliente por tipo y por endpoint,
la propia vista del proxy sobre la misma ejecución y qué contenedor se satura
primero. El cuadro de mando se filtra por el id de **Test run** de la
ejecución (`testid`), de modo que dos ejecuciones nunca se mezclan; los
enlaces de los [resultados de las pruebas de carga](../loadtest/README.md)
abren cada ejecución con su propio id e intervalo de tiempo.

| Fila                                 | Paneles                                                                                                                                                                                | Cómo leerla                                                                                                                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load (k6): what the test is doing    | Virtual users, requests / s, **Failed requests**, Rate limited (429), Checks passed (worst check), Iterations; usuarios y peticiones a lo largo del tiempo; respuestas por estado HTTP | Failed es la proporción de peticiones con un estado que el paso no esperaba; el SLO es inferior al 1 %. 429 es el límite de tasa, 5xx el hub fallando, 0 una petición que no obtuvo respuesta. La peor comprobación nombra el SLO que se rompió primero, por ejemplo «api under 1000 ms». |
| Response time, as the client sees it | **p95 by kind**: pages, API, NLQ, sign-in; p50, p95 y p99; p95 por endpoint; tabla por endpoint                                                                                        | Los SLO: páginas por debajo de 2 s, API por debajo de 1 s, NLQ por debajo de 3 s. La tabla de endpoints está ordenada por p95; las rutas se nombran por su patrón, nunca por una URL con un id.                                                                                           |
| Server side: the proxy               | Requests / s by route, p95 by route, responses per minute by status, **audit records per transaction**, errors during the run                                                          | Medido en el proxy; la diferencia con el p95 del lado del cliente es la UI y la red. Más de 1 registro de auditoría por transacción significa que el escritor por lotes asume la carga (hipótesis 2 del runbook); con 1, cada consulta espera a su propia transacción.                    |
| Azure: who saturates first           | CPU y memoria como % del límite de cada aplicación, réplicas, reinicios, créditos de ráfaga de Postgres (Azure Monitor)                                                                | Neo4j al 100 % de CPU es el techo; Neo4j cerca del 100 % de memoria termina en una terminación por falta de memoria (código de salida 137); el aumento de réplicas es la regla de escalado; créditos de Postgres por debajo de unos 10 ralentizan todo lo que comparte el servidor.       |

![La fila del lado del servidor de la misma ejecución: peticiones por segundo por ruta en el proxy, la cadena de auditoría y las rutas de tareas y NLQ; p95 por ruta con dos picos de 5 segundos; las respuestas por minuto del proxy, todas 200 y 201; registros de auditoría por transacción entre 1 y 7](img/load-stress-test-server.jpg)

![La fila de Azure de la misma ejecución: CPU como proporción del límite de cada aplicación, con la UI al 99 % a partir de la etapa de 400 usuarios, el proxy al 48 %, Neo4j al 35 %; memoria con Neo4j al 74 %; tres réplicas de la UI; ningún reinicio; créditos de ráfaga de Postgres en 39](img/load-stress-test-containers.jpg)

Las capturas de pantalla son de `20261006-2140-stress-aca`, la ejecución que
alcanzó 400 usuarios sin ninguna petición fallida y desplazó el techo a la CPU
de la UI. Cómo leer un resultado hipótesis por hipótesis, y qué significó cada
cifra para las decisiones de dimensionamiento
([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md),
[ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)), se explica en
el [runbook](../knowledge/runbooks/load-and-stress-test.md).

## Mantener actualizadas las capturas de pantalla

Las capturas de pantalla de esta página se tomaron el 2026-10-16 del Grafana
en producción en modo quiosco (`&kiosk` en la URL oculta los elementos de la
interfaz), a 1600 por 1200 píxeles. Un cuadro de mando que cambia recibe una
nueva captura de pantalla de la misma manera; los archivos están en
`docs/operations/img/` y el generador de contenido los copia al hub.
