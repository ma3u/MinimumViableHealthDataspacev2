---
source: docs/loadtest/2026-10-production-readiness.md
sourceHash: e4bba5749b0d00cb2da2c23f840ccb992cfd0ea64f64a7dce4327cbf887315ab
language: es
summary: "La evaluación Well-Architected y Cloud Adoption a 16 de octubre de 2026: lo que hay por pilar, con las evidencias, lo pendiente, las puntuaciones y lo que separa al demostrador de una plataforma operable."
---

# Evaluación de preparación para producción, octubre de 2026

El [Well-Architected Framework (WAF)](https://learn.microsoft.com/en-us/azure/well-architected/pillars) y el [Cloud Adoption Framework (CAF)](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/),
aplicados al hub de integración EEDS tal como se ejecuta en Azure Container
Apps el 2026-10-16. Cada pilar indica lo que está implantado, con las
pruebas, y lo que sigue abierto. Las puntuaciones son el juicio propio del
proyecto en una escala de diez puntos; nada de esto es una auditoría
independiente. El WAF tiene cinco pilares; la sostenibilidad no es uno de ellos, sino la
[guía de sostenibilidad](https://learn.microsoft.com/en-us/azure/well-architected/sustainability/) independiente de Microsoft para cargas de trabajo, evaluada aquí junto a ellos.

| Pilar                                                                                                               | Puntuación | En una línea                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WAF: [excelencia operativa](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/)       | 7/10       | Despliegue en cada fusión, trazas y registros estructurados, dieciséis runbooks; sin reglas de alerta, sin guardias                                                                                        |
| WAF: [seguridad](https://learn.microsoft.com/en-us/azure/well-architected/security/)                                | 8/10       | Probado por el proyecto con nueve de diez hallazgos cerrados; sin prueba independiente                                                                                                                     |
| WAF: [fiabilidad](https://learn.microsoft.com/en-us/azure/well-architected/reliability/)                            | 6/10       | 400 usuarios sin ninguna petición fallida, comprobaciones de estado en todas partes, Postgres gestionado con restauración; Neo4j un solo nodo, sin copia de seguridad                                      |
| WAF: [eficiencia del rendimiento](https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/) | 7/10       | Dimensionado a partir de mediciones, 50 usuarios dentro de todos los SLO; 200 usuarios todavía no                                                                                                          |
| WAF: [optimización de costes](https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/)          | 7/10       | Todo se detiene fuera del horario de oficina, coste por 1.000 peticiones medido; sin asignación de costes por inquilino                                                                                    |
| Sostenibilidad (guía aparte, no es un pilar del WAF)                                                                | 6/10       | La pila funciona un tercio de la semana; sin elección consciente del carbono                                                                                                                               |
| CAF: [estrategia y plan](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/strategy/)                | 8/10       | Los papeles del EEDS, las normas del BSI y sesenta decisiones ([ADR-001](../ADRs/ADR-001-postgresql-neo4j-split.md) a [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)) por escrito; sin SLA |
| CAF: [gobierno y gestión](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/govern/)                 | 6/10       | Política de conservación, registro de auditoría, plazos de incidentes; sin SOC, sin equipo de incidentes nombrado                                                                                          |
| **Global**                                                                                                          | **7/10**   | **Un demostrador medido. No es una plataforma operable para datos reales; la brecha se enumera al final.**                                                                                                 |

La plataforma evaluada: el hub y sus conectores en [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/overview) en
`rg-mvhd-dev`, West Europe, 21 aplicaciones y 9 tareas. PostgreSQL en un
Flexible Server ([ADR-041](../ADRs/ADR-041-managed-postgres-on-azure-containerised-locally.md)),
Neo4j Community con 2 vCPU y 4 GiB ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md)),
la UI en núcleos completos con hasta seis réplicas ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)),
Vault con su estado en el Flexible Server ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)),
detenido fuera del horario de oficina ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md),
[ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)). Las
cifras de carga son las ejecuciones del [índice de resultados](README.md); el
estado de la seguridad es el [informe de pruebas de seguridad del 2026-10-15](../security/security-test-report-2026-10-15.md);
cómo se pretende operar la plataforma de verdad es la
[guía operativa](../security/operational-guideline.md).

## Pilar 1 del WAF: excelencia operativa, 7/10

Implantado:

- Una fusión en main despliega en Azure ([`deploy-azure.yml`](../../.github/workflows/deploy-azure.yml)); el despliegue
  espera mientras se ejecuta una prueba de carga y fija las direcciones de los
  conectores en cada ejecución. La barrera de PR y los flujos de trabajo de
  pruebas, seguridad y [CodeQL](https://docs.github.com/en/code-security/codeql-cli) se ejecutan en cada pull request, las baterías de cumplimiento tras los cambios en main;
  [`demo-smoke.yml`](../../.github/workflows/demo-smoke.yml) ejecuta [Bruno](https://www.usebruno.com/), [Playwright](https://playwright.dev/) y [ZAP](https://www.zaproxy.org/) contra el hub en
  producción.
- Colector [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-collector-releases/releases/tag/v0.161.0), [Prometheus](https://prometheus.io/docs/introduction/overview/), [Loki](https://grafana.com/docs/loki/latest/), [Tempo](https://grafana.com/docs/tempo/latest/) y [Grafana](https://grafana.com/docs/grafana/latest/)
  ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md));
  el proxy tiene trazas ([`src/tracing.ts`](../../services/neo4j-proxy/src/tracing.ts)) y registra JSON estructurado con el
  llamante y la ejecución en cada línea ([`pino`](https://getpino.io/)); cada registro de auditoría
  lleva su ejecución. Registros en Azure Monitor durante 30 días.
- Vault conserva su estado a través de los reinicios, localmente en un
  archivo y en Azure en una base de datos del Flexible Server con un sidecar
  de desellado ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)).
- Dieciséis runbooks en [`docs/knowledge/runbooks/`](../knowledge/runbooks/): despliegue, carga de datos
  iniciales, desviación del realm, recuperación de Postgres, fuera del horario
  de oficina, prueba de carga y estrés, la cadena de auditoría, la conexión de
  Klarbefund.
- Cada imagen lleva un [`HEALTHCHECK`](https://docs.docker.com/reference/dockerfile/#healthcheck); los rastreadores exponen `/metrics` y se
  comprueban a través de él; las fases de carga de datos iniciales pueden
  reanudarse.
- La documentación se publica desde el repositorio y se comprueba en el
  pre-commit, por lo que los documentos no pueden desviarse de los archivos.

Abierto:

- Sin reglas de alerta. El cuadro de mando de carga, la cadena de auditoría y
  los créditos de ráfaga de Postgres los lee una persona; no se avisa a nadie.
- Sin modelo de guardias y sin operador nombrado; la guía operativa describe
  los papeles, el proyecto no puede cubrirlos.
- Sin feature flags más allá de los interruptores de la demostración.

## Pilar 2 del WAF: seguridad, 8/10

Implantado:

- El [informe de pruebas de seguridad del 2026-10-15](../security/security-test-report-2026-10-15.md):
  CodeQL, [Semgrep](https://github.com/semgrep/semgrep/releases/tag/v1.176.0), [grype](https://github.com/anchore/grype/releases/tag/v0.118.0), npm audit, [trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0), [gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), [hadolint](https://github.com/hadolint/hadolint), [shellcheck](https://www.shellcheck.net/),
  las pruebas de postura de la aplicación y 46 comprobaciones anónimas de caja
  negra del hub en producción. Diez hallazgos; nueve cerrados, uno revisado y
  aceptado (la clave de desarrollo publicada de la pila local de compose;
  Azure toma sus claves de Vault).
- El [modelo de amenazas del hub](../security/threat-model.md) y
  [el de la aplicación](../security/threat-model-klarbefund.md), en los que
  cada mitigación nombra el código o la prueba que la demuestra; una lista de
  materiales [CycloneDX](https://cyclonedx.org/) por cada parte desplegable ([SBOM](../sbom/README.md)),
  comprobada frente a los archivos de bloqueo.
- Cada ruta de la API necesita una sesión ([ADR-044](../ADRs/ADR-044-every-api-route-needs-a-session.md));
  quién ve la identidad de un paciente se decide por rol, nunca por un
  parámetro de consulta; la UI lee el grafo directamente y el proxy sirve a
  los planos de datos ([ADR-043](../ADRs/ADR-043-graph-access-direct-or-through-the-proxy.md)).
- Límites de tasa en el proxy, por usuario y por participante, medidos bajo
  carga; k-anonimato con una cohorte mínima de cinco en la configuración del
  proxy.
- Los secretos del operador son referencias de Key Vault ([ADR-036](../ADRs/ADR-036-operator-secrets-in-key-vault.md));
  el `NEXTAUTH_SECRET` en producción se ha rotado; las claves de los
  participantes residen en Vault.
- Keycloak: eventos de inicio de sesión conservados siete días, el alcance del
  cliente de la UI limitado a los siete roles del EEDS, la consola de
  administración fuera de internet, cada rol privilegiado detrás de la
  protección de la consola. La aplicación se bloquea con Face ID o el código
  de acceso ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)).
- Solo el hub y Keycloak tienen ingress público; todo lo demás es interno al
  entorno.
- La [política de conservación de auditoría](../audit-retention-policy.md):
  diez años para los registros de acceso, transferencia, contrato y permiso,
  dos años para los inicios de sesión y los registros del perímetro, aplicada
  por `/api/admin/audit/retention`, que no puede destruir la única copia.

Abierto:

- Sin prueba de penetración independiente del hub y sin prueba [TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) de la
  aplicación; la última sección del informe indica lo que aportaría cada una.
- Sin mTLS entre aplicaciones y sin endpoints privados; la guía exige ambos
  antes de los datos reales.
- Neo4j tiene un único usuario de base de datos; el acceso se controla en el
  hub y en el proxy.
- La rotación de secretos está documentada, no programada.
- Las cuentas del operador y `edcadmin` solo tienen contraseñas generadas en
  Key Vault una vez que [`scripts/azure/secure-accounts.sh`](../../scripts/azure/secure-accounts.sh) se ha ejecutado
  contra el realm en producción.

## Pilar 3 del WAF: fiabilidad, 6/10

Implantado:

- La ejecución de estrés del 2026-10-06 alcanzó 400 usuarios con 0 peticiones
  fallidas de 81.518, a 63,6 peticiones por segundo; nada se reinició. Con 50
  usuarios se cumplen todos los SLO.
- Cada imagen tiene una comprobación de estado y las [sondas](https://learn.microsoft.com/en-us/azure/container-apps/health-probes) de Container Apps
  proceden de ella; el proxy se vacía con `SIGTERM`; cada llamada saliente
  tiene un tiempo de espera; `/api/tasks` responde desde su almacén cuando el
  conector falla y lo indica.
- PostgreSQL en el Flexible Server conserva siete días de [restauración a un](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-backup-restore)
  momento dado; el realm, los contratos y el almacén de tareas residen allí.
  El estado de Vault también.
- Las vistas del grafo están limitadas a los 30 eventos de acceso más
  recientes, lo que eliminó la única petición que podía hacer caer la UI.
- Un despliegue no puede producirse en mitad de una ejecución de carga.

Abierto:

- Neo4j es un único nodo Community en Azure Files sin copia de seguridad. Sus
  datos son hoy datos sintéticos que pueden volver a cargarse; antes de
  cualquier dato real, la guía exige Neo4j Enterprise o un grafo gestionado con
  copias de seguridad probadas trimestralmente.
- Sin circuit breaker; un conector lento solo está acotado por los tiempos de
  espera.
- A partir de 200 usuarios los SLO de latencia se rompen por la CPU de la UI.
  El nuevo tamaño de la UI ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)) lo aplica `scripts/azure/size-ui.sh` y
  aún no se ha medido.
- Las páginas de los conectores no hicieron trabajo real en las ejecuciones
  realizadas hasta ahora (la UI llamaba a la API de gestión en la dirección
  equivocada, fijada desde entonces); la siguiente ejecución `load` será la
  primera con contratos y transferencias bajo carga.
- Sin ingeniería del caos; las ejecuciones de estrés son lo más parecido.

## Pilar 4 del WAF: eficiencia del rendimiento, 7/10

Implantado:

- Medido, no supuesto: el techo pasó de la memoria de Neo4j a la CPU de la UI
  en un solo día de ejecuciones, y cada tamaño se decidió a partir de la
  medición ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md) para Neo4j, [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md) para la UI, con la
  [escalabilidad por componente](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md#scalability-per-component)).
- Con 50 usuarios: p95 de la API 155 ms, páginas 43 ms, NLQ 217 ms, 21,5
  peticiones por segundo. `/api/graph` dentro del SLO tras el límite y el
  redimensionamiento.
- Neo4j con 2 vCPU y 4 GiB, heap de 1,5 GiB, caché de páginas de 1 GiB;
  índices para cada ruta de consulta FHIR en [`neo4j/init-schema.cypher`](../../neo4j/init-schema.cypher) (más
  de 70, tres índices vectoriales).
- El escritor por lotes de la cadena de auditoría asume la carga de escritura;
  las consultas auditadas no son un techo (434 ms de p95 a unas 16 por
  segundo).
- Next.js comprime sus respuestas; la demostración estática la sirve GitHub
  Pages.

Abierto:

- Sin caché de respuestas en el catálogo ni en la vista general; sin
  compresión en el proxy.
- 200 usuarios dentro de los SLO es el objetivo de la siguiente ejecución
  `stress`, después de `size-ui.sh`; el p95 por etapa se incorpora a la tabla
  del [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md).
- Sin CDN delante del hub en producción.

## Pilar 5 del WAF: optimización de costes, 7/10

Implantado:

- Todo se detiene a las 18:13 UTC y arranca a las 05:17 UTC los días
  laborables, activado por Azure como identidad administrada; unas 65 horas
  de oficina a la semana. La decisión siguió a un mes que facturó 741 € frente
  a una estimación de 426 € para una pila funcionando las 24 horas ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)).
- Reglas de escalado de Container Apps: la UI con una regla de concurrencia
  HTTP de 15, de una a seis réplicas; todo a cero fuera del horario de
  oficina.
- Se conoce el coste de una petición: a precio de lista, las aplicaciones que
  atienden una petición facturan unos 0,60 $ por hora, unos **0,01 $ por 1.000
  peticiones con 50 usuarios** ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md), a partir de `20261006-2115-load-aca`);
  una ejecución de estrés de 20 minutos con seis réplicas de la UI añade unos
  0,22 $.
- Las protecciones de costes vigilan el total ([`cost-guards.yml`](../../.github/workflows/cost-guards.yml)).

Abierto:

- Un grupo de recursos, una factura: sin asignación de costes por inquilino ni
  por rol.
- El coste por 1.000 peticiones según [Cost Management](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/overview-cost-management) durante una ventana de
  `soak` está aún por obtener.

## Sostenibilidad, 6/10 (guía aparte, no es un pilar del WAF)

Evaluada según la [guía de Microsoft para cargas de trabajo sostenibles](https://learn.microsoft.com/en-us/azure/well-architected/sustainability/),
que está junto a los cinco pilares del WAF y no forma parte de ellos.

Implantado:

- La pila funciona un tercio de la semana ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md), [ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)).
- El uso de recursos es visible: la fila de contenedores del cuadro de mando
  de carga, Cost Management.
- La única petición derrochadora, la vista del grafo sin límite, ha
  desaparecido.

Abierto:

- West Europe, sin señal de carbono en el horario ni en la elección de la
  región.

## CAF

**Estrategia y plan, 8/10.** La motivación reglamentaria está redactada por
artículo (Reglamento (UE) [2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng) en su numeración adoptada); la
[guía operativa](../security/operational-guideline.md) indica qué papel del
EEDS opera cada parte y qué exigen a cada una [BSI C5](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CloudComputing/ComplianceControlsCatalogue/2020/C5_2020.pdf?__blob=publicationFile&v=5), [IT-Grundschutz](https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/IT-Grundschutz-Kompendium/it-grundschutz-kompendium_node.html),
[TR-02102](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TG02102/BSI-TR-02102-1.pdf?__blob=publicationFile&v=15) y TR-03161; sesenta [ADR](../ADRs/), del [ADR-001](../ADRs/ADR-001-postgresql-neo4j-split.md) al [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md), recogían las decisiones a 2026-10-16; el índice de
planificación sigue el trabajo. Abierto: un SLA formal para los
participantes, que la guía incluye en el contrato de servicio del operador.

**Preparación, 7/10.** Azure desde una fusión; la pila local con un solo
comando de compose; las fases de carga de datos iniciales pueden reanudarse;
un Dockerfile por parte con su lista de materiales. Abierto: el propio
entorno del operador, que aún no existe.

**Adopción, 7/10.** Las comprobaciones propias del hub para [DSP 2025-1](https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/), [DCP](https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/) y el EEDS ([`run-ehds-dataspace-checks.sh`](../../scripts/run-ehds-dataspace-checks.sh), [`run-ehds-identity-checks.sh`](../../scripts/run-ehds-identity-checks.sh), [`run-ehds-tests.sh`](../../scripts/run-ehds-tests.sh))
se ejecutan tras los cambios en main, una vez por noche desde el [ADR-074](../ADRs/ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md); no son los
TCK de Eclipse, [DSP TCK](https://github.com/eclipse-dataspacetck/dsp-tck) y [DCP TCK](https://github.com/eclipse-dataspacetck/dcp-tck), ninguno de los cuales se ha ejecutado todavía; la colección Bruno verifica cada ruta por
persona ([ADR-031](../ADRs/ADR-031-checks-must-assert.md), [ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md));
el 2026-10-15 el [informe de pruebas de seguridad](../security/security-test-report-2026-10-15.md) contaba 2.488 pruebas unitarias de la UI y 419 pruebas
de Swift. Abierto: la ingeniería del caos y un ensayo de la migración de
Neo4j 5 a 2025 ([ADR-030](../ADRs/ADR-030-neo4j-2025-lts-migration.md)).

**Gobierno y gestión, 6/10.** La política de conservación y el registro de
auditoría con evidencia de manipulación existen ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)); los plazos de
incidentes del RGPD y de la NIS2, y quién es titular de cada uno, están en la
guía ([sección 7](../security/operational-guideline.md#7-incidents-clocks-and-who-notifies-whom)); los papeles del EEDS tienen su lista de comprobación para la
puesta en producción ([sección 10](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)). Abierto: un SLA y su cuadro de mando, un
plan de respuesta a incidentes con un equipo nombrado, una gestión de cambios
más allá de las pull requests, la asignación de costes por inquilino, una
prueba independiente.

## Lo que separa al demostrador de una plataforma operable

La brecha ya no está en el código; está en la operación, y la
[lista de comprobación de la guía](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)
la enumera por papel del EEDS. Los elementos que el propio proyecto todavía
puede abordar:

| #   | Elemento                                                                                                                                                    | Pilar                   | Seguimiento en                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `stress` después de `size-ui.sh`, después `spike`, `soak` y `signin`; el p95 por etapa en el [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md) | Rendimiento, fiabilidad | [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571)                                                                                               |
| 2   | Reglas de alerta en el cuadro de mando de carga y en la cadena de auditoría, y a quién se avisa                                                             | Excelencia operativa    | abierto                                                                                                                                                                 |
| 3   | Una copia de seguridad de Neo4j, o Neo4j Enterprise o un grafo gestionado, antes de cualquier dato no sintético                                             | Fiabilidad              | [guía, sección 2](../security/operational-guideline.md#2-hosting-architecture-from-the-demo-to-an-operable-platform)                                                    |
| 4   | Compresión y una caché breve en las respuestas del catálogo y de la vista general                                                                           | Rendimiento             | abierto                                                                                                                                                                 |
| 5   | Rotación periódica de secretos: los clientes de Keycloak, el servicio de cuentas, el token del catálogo                                                     | Seguridad               | [guía, sección 2](../security/operational-guideline.md#2-hosting-architecture-from-the-demo-to-an-operable-platform)                                                    |
| 6   | Una prueba de penetración independiente del hub y una prueba TR-03161 de la aplicación                                                                      | Seguridad               | [#655](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/655)                                                                                               |
| 7   | Cuentas del operador y `edcadmin` con contraseñas generadas en Key Vault ([`scripts/azure/secure-accounts.sh`](../../scripts/azure/secure-accounts.sh))     | Seguridad               | [#671](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/671) añadió el script; ejecutarlo contra el realm en vivo sigue pendiente                            |
| 8   | Un SLA con su cuadro de mando y el plan de respuesta a incidentes con un equipo nombrado                                                                    | Gobierno y gestión      | guía, secciones [7](../security/operational-guideline.md#7-incidents-clocks-and-who-notifies-whom) y [8](../security/operational-guideline.md#8-operating-the-platform) |
