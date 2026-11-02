---
source: docs/security/threat-model.md
sourceHash: 7dd719e1cad0af1761954b2a7e3ec54002d86543fc9ac430bca41b4230ef456c
language: es
summary: "STRIDE para el hub en Azure: los flujos de datos y los límites de confianza, los cuatro atacantes, un intercambio con cada amenaza en su paso y cada mitigación con el código, la prueba o la decisión que la demuestra; lo que acepta la demo, lo que exigen los datos reales y cómo verificar cada fila."
---

# Modelo de amenazas: el hub de integración del EEDS

STRIDE, para el hub tal como se ejecuta en Azure Container Apps: la UI y su
API (Next.js 15), Keycloak 26.8, el neo4j-proxy, los conectores EDC-V con su
IdentityHub y su IssuerService, Neo4j 5.26 y el PostgreSQL Flexible Server.
Redactado el 2026-10-16; cada mitigación nombra el código, la prueba o la
decisión que la demuestra. La aplicación que se conecta al hub tiene su propio
modelo, [`threat-model-klarbefund.md`](threat-model-klarbefund.md). Lo que el
proyecto probó y encontró está en el
[informe de pruebas de seguridad](security-test-report-2026-10-15.md); cómo se
operaría la plataforma con datos reales lo describe la
[guía operativa](operational-guideline.md).

Los datos del hub son sintéticos: 127 pacientes generados, organizaciones
ficticias, sesiones falsificadas para pruebas de carga. Las amenazas que
siguen se evalúan como si los datos fueran reales, porque el hub es una
implementación de referencia para una plataforma que contendrá datos reales;
cuando una mitigación basta para la demostración y no para datos reales, la
tabla lo indica.

## Cómo leer este modelo

STRIDE plantea seis preguntas a cada flujo de datos: ¿se puede suplantar al
remitente, manipular los datos, repudiar la acción, divulgar información,
denegar el servicio, elevar privilegios? El contexto del sistema de la
sección 1 numera los flujos de datos y los límites de confianza que cruzan; la
secuencia de la sección 3 muestra un intercambio completo con el identificador
de cada amenaza en el paso donde se produciría; las seis tablas contienen
después una fila por amenaza con el flujo en el que se sitúa, su estado y la
mitigación con su evidencia. La evidencia es un archivo, una prueba, un script
o una decisión de este repositorio, de modo que cada fila puede comprobarse
sin preguntar a nadie.

Se suponen cuatro atacantes, y cada fila nombra al menos uno de forma
implícita mediante su flujo:

| Atacante                                     | Alcanza                                                           | Posee                                                                                     | Quiere                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Cualquiera en internet                       | B1: las páginas y la API del hub, el inicio de sesión de Keycloak | Nada; o una cookie, un token o una contraseña filtrados                                   | La historia clínica de un paciente, una sesión, la consola de administración, la plataforma fuera de servicio                          |
| Un participante con sesión iniciada          | B1 con una sesión válida, en su rol                               | Una cuenta legítima en un rol                                                             | Datos fuera de su rol o de su permiso de datos, la historia clínica de otro paciente, más peso del que permite su límite de frecuencia |
| Un conector par                              | B2 a través del plano de control público                          | Su propio DID y sus credenciales; falsificadas o robadas                                  | Un contrato al que no tiene derecho, datos sin acuerdo, una identidad falsa                                                            |
| Una persona interna con derechos de operador | B2 y B3 a través de `az`, `gh` y los scripts                      | Derechos sobre la suscripción, la identidad de despliegue, la contraseña de administrador | Secretos, un cambio inadvertido, un registro de auditoría borrado                                                                      |

Un quinto, la cadena de suministro, no tiene flujo propio: una dependencia o
una imagen comprometida llega a través del despliegue (F7) y se trata en
Tampering (manipulación) (T-07).

## 1. Contexto del sistema: flujos de datos y límites de confianza

![Los flujos de datos y los límites de confianza del hub: fuera, las personas, la aplicación, un conector par y el operador; la UI y Keycloak tras el límite de internet; el proxy, los conectores, el crawler y la observabilidad dentro del entorno; Neo4j, PostgreSQL, Vault y Key Vault tras el límite de datos; veintiún flujos numerados](img/hub-trust-boundaries.svg)

Fuente: [`diagrams/hub-trust-boundaries.puml`](diagrams/hub-trust-boundaries.puml),
renderizado con `scripts/render-plantuml.sh`.

Tres límites, y lo que significa cruzar cada uno:

| Límite                    | Quién puede enviar una solicitud a través de él                       | Qué demuestra la identidad                                                                                    |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| B1, el límite de internet | Cualquiera                                                            | La cookie de sesión (JWT de NextAuth), un token de portador de Keycloak o una credencial DCP                  |
| B2, el entorno            | Las aplicaciones y jobs propios del hub, a través del ingress interno | La cabecera de llamante que fija el hub (`X-Caller`), el token del catálogo, el DID del conector              |
| B3, datos y secretos      | Solo el entorno                                                       | La identidad administrada (referencias de Key Vault), el token de Vault, las credenciales de la base de datos |

Los flujos numerados (F1 a F21) son a los que se refieren las tablas STRIDE.
Los que más importan, y por qué:

| Flujo     | Qué cruza                                                        | Por qué es el que hay que vigilar                                                                                                                      |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1        | Cada solicitud de página y de API, con la cookie de sesión       | El único camino que tiene un atacante anónimo hacia los datos; cada ruta detrás de él exige una sesión (ADR-044)                                       |
| F2, F8    | El inicio de sesión y el intercambio de tokens con Keycloak      | Un token falsificado o con un alcance excesivo es una identidad falsificada para todo lo que viene después                                             |
| F3, F4    | El token de portador de la aplicación y la creación de su cuenta | Un teléfono está fuera del control de cualquiera; App Attest es lo que reserva la creación de cuentas a la aplicación auténtica                        |
| F5        | DSP y DCP entre conectores                                       | El único flujo en el que el software de un desconocido habla con el nuestro por diseño; la identidad es el DID y la credencial, no un inicio de sesión |
| F9        | La llamada del hub al proxy, con la cabecera de llamante         | El proxy confía en la cabecera porque solo el hub puede alcanzarlo; el límite B2 es lo que hace fundada esa confianza                                  |
| F10, F11  | La API de gestión y el token del catálogo                        | Control total de los conectores; el ingress interno y un token en Key Vault son toda la defensa                                                        |
| F14, F15  | Lecturas y escrituras en el grafo, y los registros de auditoría  | Donde residen los datos de los pacientes y la evidencia; las consultas parametrizadas y la cadena de hashes son los controles                          |
| F19 a F21 | Claves y secretos                                                | Vault, su estado sellado y Key Vault; nada de esto se copia nunca en una aplicación                                                                    |

## 2. Activos

| Activo                                                                                                               | Sensibilidad | Dónde reside                                               | Notas                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Historias clínicas de los pacientes (FHIR, OMOP)                                                                     | Alta         | Neo4j (B3)                                                 | Hoy sintéticas; el modelo las trata como reales                                                          |
| Quién leyó la historia clínica de quién, la cadena de auditoría                                                      | Alta         | Neo4j, encadenada por hashes (B3)                          | Evidencia regulatoria (art. 73); diez años ([política de conservación](../audit-retention-policy.md))    |
| Claves de firma de los participantes                                                                                 | Alta         | Vault, estado en el Flexible Server (B3)                   | Nunca salen de Vault; ADR-046                                                                            |
| Secretos del operador: `NEXTAUTH_SECRET`, contraseñas de la base de datos y de administración, el token del catálogo | Alta         | Azure Key Vault, referenciado por las aplicaciones (B3)    | ADR-036; el `NEXTAUTH_SECRET` en producción se rotó después de haber sido un valor por defecto publicado |
| Sesiones y tokens                                                                                                    | Alta         | Cookie en el navegador, token de portador en la aplicación | JWT de NextAuth; tokens de acceso y de actualización de Keycloak                                         |
| Credenciales verificables y permisos de datos                                                                        | Media        | IdentityHub (B2)                                           | Afiliación, participante del EEDS, finalidad, etiqueta de calidad, el permiso de datos como credencial   |
| Contratos, transferencias, tareas                                                                                    | Media        | Estado de EDC en PostgreSQL (B3), replicado en Neo4j       | Políticas ODRL, acuerdos, nodos `TransferEvent`                                                          |
| Metadatos del catálogo                                                                                               | Baja         | Neo4j, los conectores                                      | HealthDCAT-AP; públicos por diseño                                                                       |
| El esquema del grafo y el código                                                                                     | Baja         | GitHub, público                                            | La documentación es el esquema                                                                           |

## 3. STRIDE

![Un intercambio de datos como secuencia, con el identificador STRIDE de cada amenaza en el paso donde se sitúa: inicio de sesión y solicitud a través del hub, después la negociación DSP y la verificación de la credencial DCP en los conectores, después la transferencia y el registro de auditoría](img/hub-exchange-threats.svg)

Fuente: [`diagrams/hub-exchange-threats.puml`](diagrams/hub-exchange-threats.puml).

Estado: **Cerrado** significa que una prueba o un ajuste de compilación lo
fija; **Implantado** significa que el código lo hace y una prueba lo ejercita
de forma indirecta; **Demo** significa suficiente para datos sintéticos y
señalado como abierto para datos reales; **Abierto** significa que nada lo
hace todavía.

### Spoofing (suplantación de identidad)

| ID   | Amenaza                                               | Flujo  | Estado     | Mitigación y evidencia                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | Un conector suplanta a un participante                | F5     | Implantado | Resolución `did:web` contra el documento DID del IdentityHub, uno por participante; la presentación DCP lleva la credencial de afiliación (ADR-007, ADR-009). Comprobado por `scripts/run-ehds-identity-checks.sh` en cada pull request.                                                                                                                                  |
| S-02 | Una sesión falsificada alcanza una ruta de la API     | F1     | Cerrado    | JWT de NextAuth firmado con `NEXTAUTH_SECRET` de Key Vault; `requireAuth()` en cada handler, fijado por `ui/__tests__/unit/api/every-route-needs-a-session.test.ts` (ADR-044).                                                                                                                                                                                            |
| S-03 | Una presentación de credencial reproducida            | F5     | Implantado | La implementación DCP de EDC-V vincula la presentación a la solicitud; las comprobaciones DCP de `compliance.yml` la ejecutan. El propio hub no lo vuelve a verificar.                                                                                                                                                                                                    |
| S-04 | Toma de control del realm o de la consola de Keycloak | F2, F6 | Cerrado    | La consola de administración no es accesible desde internet (`guard-keycloak-console.sh`, F10 del informe de pruebas); la contraseña de administrador está en Key Vault; el realm está bajo control de versiones y se comprueba su deriva ([runbook](../knowledge/runbooks/keycloak-realm-drift.md)). La MFA del administrador corresponde al operador (guía, identidad). |
| S-05 | Un Klarbefund falso crea cuentas                      | F3     | Implantado | La creación de cuentas solo responde a una solicitud cuya atestación de Apple App Attest se verifica (ADR-054); el desafío está firmado y es válido cinco minutos.                                                                                                                                                                                                        |

### Tampering (manipulación)

| ID   | Amenaza                                                                  | Flujo    | Estado     | Mitigación y evidencia                                                                                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------ | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01 | Inyección de Cypher                                                      | F14, F15 | Cerrado    | Cypher parametrizado en todas partes; el motor NLQ rechaza una consulta que leería la identidad de un paciente salvo que la UI indique que el rol puede hacerlo (`revealsPatientIdentity()`); pruebas en `services/neo4j-proxy/__tests__/`.                                             |
| T-02 | Condiciones del contrato modificadas en tránsito                         | F5       | Implantado | TLS en el perímetro; el acuerdo lo firma el conector del proveedor. Los endpoints DSP con autenticación mutua son un punto de la guía para datos reales.                                                                                                                                |
| T-03 | Una afirmación de credencial falsificada                                 | F5       | Implantado | Las credenciales las emiten y verifican el IssuerService y el IdentityHub (EDC-V); el hub muestra, no vuelve a firmar. Un HSM para la clave del emisor es un punto de la guía.                                                                                                          |
| T-04 | Falsificación de solicitudes entre sitios (CSRF) en una mutación         | F1       | Implantado | Cookie de sesión `SameSite=Lax` (NextAuth); la CSP prohíbe los scripts en línea; ninguna mutación lee sus parámetros de un GET.                                                                                                                                                         |
| T-05 | Un salto de estado en la negociación                                     | F5       | Implantado | Las máquinas de estados residen en el plano de control de EDC-V (REQUESTED, AGREED, FINALIZED; transferencias de REQUESTED a COMPLETED) y se gestionan mediante arrendamientos (leases) en PostgreSQL; el hub replica, no dirige. El TCK de DSP 2025-1 se ejecuta en cada pull request. |
| T-06 | El registro de auditoría editado                                         | F15      | Cerrado    | Cada registro lleva el hash de su predecesor, SHA-256 sobre JSON canónico; `verifyChain()` informa de cualquier cambio, eliminación o reordenación (ADR-045, `audit-chain.ts`). Ambas cadenas estaban intactas tras cada ejecución de carga.                                            |
| T-07 | Un cambio en la cadena de suministro, en una dependencia o en una imagen | F7       | Cerrado    | Una lista de materiales CycloneDX por componente, comprobada frente a los lockfiles; grype y trivy en cada push; npm audit en pre-push con excepciones de duración limitada; imágenes fijadas; CodeQL. [SBOM](../sbom/README.md), `security-scan.yml`.                                  |

### Repudiation (repudio)

| ID   | Amenaza                                                                | Flujo    | Estado     | Mitigación y evidencia                                                                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Una parte niega que se produjera una transferencia                     | F15      | Cerrado    | `TransferEvent` con el DID del emisor y del receptor y una marca de tiempo, en la cadena `dsp` encadenada por hashes (ADR-045).                                                                                                                       |
| R-02 | Una parte niega haber aceptado un contrato                             | F5       | Implantado | El acuerdo lo firma el conector y se almacena en el estado de EDC; se replica en el grafo con su identificador.                                                                                                                                       |
| R-03 | Una lectura de la historia clínica de un paciente se niega o se oculta | F14, F15 | Cerrado    | Cada acceso que sirve el proxy es un evento de acceso en la cadena `query`; el paciente ve en su propia página quién leyó su historia clínica; conservación diez años ([política](../audit-retention-policy.md)).                                     |
| R-04 | Una acción del operador no deja rastro                                 | F6, F7   | Implantado | Eventos de inicio de sesión de Keycloak conservados siete días; los despliegues son ejecuciones de GitHub Actions; cada paso en producción es un script en `scripts/azure/` y se registra en los gotchas o en un ADR. Un SIEM es un punto de la guía. |

### Information disclosure (divulgación de información)

| ID   | Amenaza                                                   | Flujo     | Estado     | Mitigación y evidencia                                                                                                                                                                                                                                                                                                       |
| ---- | --------------------------------------------------------- | --------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-01 | Un llamante anónimo lee datos                             | F1        | Cerrado    | Cada ruta de la API exige una sesión (ADR-044); las páginas que las leen están en `PROTECTED_PATHS` y redirigen; 40 comprobaciones de caja negra del hub en producción confirman los 401 y las redirecciones (`check-hub-blackbox.sh`).                                                                                      |
| I-02 | La API de gestión de los conectores accesible desde fuera | F10       | Implantado | Solo ingress interno; la UI la alcanza por su nombre interno, fijado en cada despliegue (#648). El crawler del catálogo solo envía su token a los hosts de la lista.                                                                                                                                                         |
| I-03 | Secretos en la página o en el repositorio                 | F1, F7    | Cerrado    | Solo entorno del lado del servidor; referencias de Key Vault (ADR-036); gitleaks en los hooks y en la CI; una prueba comprueba que ningún secreto llega al HTML.                                                                                                                                                             |
| I-04 | Un cross-site scripting exfiltra una sesión               | F1        | Cerrado    | Un nonce por solicitud en la CSP con `strict-dynamic`, sin `unsafe-inline` para scripts; cookie de sesión `HttpOnly`; cabeceras fijadas por `next.config.js` y comprobadas en caja negra. A la página fuera del horario de servicio le faltaron algunas cabeceras una vez (F8, observe).                                     |
| I-05 | Una base de datos accesible desde internet                | F14 a F20 | Cerrado    | Neo4j, PostgreSQL y Vault no tienen ingress público; el Flexible Server solo admite el entorno.                                                                                                                                                                                                                              |
| I-06 | Clickjacking                                              | F1        | Cerrado    | `X-Frame-Options: DENY` y `frame-ancestors 'none'`, comprobados en caja negra.                                                                                                                                                                                                                                               |
| I-07 | Reidentificación a partir de una cohorte                  | F9, F12   | Implantado | `MIN_COHORT_SIZE` de 5 en el proxy para consultas federadas; los roles distintos del tenedor de datos de salud y del operador ven un seudónimo, el año de nacimiento y ningún lugar de residencia (#475). El control de resultados por el organismo de acceso a datos de salud es un proceso que la demostración no ejecuta. |
| I-08 | Una credencial caducada o revocada aceptada               | F5        | Demo       | El IdentityHub comprueba la caducidad; no hay lista de revocación en la demostración. Las listas de estado y un procedimiento de revocación son puntos de la guía para datos reales.                                                                                                                                         |
| I-09 | Los registros contienen datos personales                  | F13       | Implantado | El proxy registra recuentos y códigos, el llamante como hash; Azure Monitor conserva 30 días; los registros operativos están separados de la cadena de auditoría (ADR-045).                                                                                                                                                  |

### Denial of service (denegación de servicio)

| ID   | Amenaza                                            | Flujo    | Estado     | Mitigación y evidencia                                                                                                                                                                                                                                                                                                                          |
| ---- | -------------------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Un usuario agota el proxy                          | F9       | Cerrado    | Por usuario: `RATE_LIMIT_MAX` solicitudes y `RATE_LIMIT_HEAVY_MAX` consultas analíticas por `RATE_LIMIT_WINDOW_MS`; por participante, diez veces eso para los llamantes que no nombran a ningún usuario; la ruta de auditoría tiene el suyo propio. Medido: 83.6 % rechazadas antes, 23.2 % después del límite por usuario (2026-10-05).        |
| D-02 | Una avalancha de mensajes DSP hacia los conectores | F5       | Demo       | El plano de control de EDC-V gestiona sus máquinas de estados mediante arrendamientos en PostgreSQL y aplica tiempos de espera; no hay límite de frecuencia en el perímetro del conector. Un WAF y límites de frecuencia por nombre de host son puntos de la guía.                                                                              |
| D-03 | Una consulta sin límite                            | F14, F15 | Cerrado    | `LIMIT` en cada ruta de listado; las vistas del grafo limitadas a los 30 eventos de acceso más recientes (#580), lo que eliminó la única solicitud que tumbaba la UI con 90 usuarios simultáneos; cada llamada saliente tiene un tiempo de espera.                                                                                              |
| D-04 | La carga tumba la plataforma                       | F1       | Implantado | 400 usuarios sin ninguna solicitud fallida (2026-10-06); la UI escala según una regla de concurrencia HTTP hasta seis réplicas de núcleos completos (ADR-061); health checks en cada imagen; un despliegue espera mientras se ejecuta una prueba de carga. Los SLO de latencia se incumplen a partir de 200 usuarios; se medirá a continuación. |
| D-05 | La pila está apagada                               | F1       | Aceptado   | Todo se detiene fuera del horario de servicio por decisión (ADR-053) y la UI lo indica; un contrato 24x7 elimina el horario (guía, disponibilidad).                                                                                                                                                                                             |

### Elevation of privilege (elevación de privilegios)

| ID   | Amenaza                                                             | Flujo    | Estado     | Mitigación y evidencia                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01 | Un paciente alcanza una ruta de administración                      | F1       | Cerrado    | `requireAuth(["EDC_ADMIN"])` en las rutas de administración, 403 para cualquier otro rol; la matriz de roles en `.claude/rules/api-conventions.md`; la carpeta de Bruno `09 Access control` lo comprueba contra un servidor real.                                                |
| E-02 | Un investigador lee la identidad de un paciente                     | F1, F9   | Cerrado    | `seesPatientIdentity()` decide según el rol; `refuseForeignRecord()` responde 403 para la historia clínica de otro paciente; el proxy NLQ rechaza lecturas de identidad sin la cabecera de la UI (#475). Bruno `09 Access control/28` a `/30`.                                   |
| E-03 | Roles inyectados en el token                                        | F2, F8   | Cerrado    | Los roles proceden únicamente de los claims del realm; el cliente de la UI tiene el full scope desactivado y exactamente los siete roles del EEDS en su alcance (#648, `wire-ui-client-scope.sh`); `auth.ts` no asigna nada más.                                                 |
| E-04 | El token del catálogo usado desde otro lugar                        | F10, F11 | Implantado | Un único token en Key Vault, que llega a la UI y al crawler como referencia; el crawler solo lo envía a `DSP_CATALOG_TOKEN_HOSTS`; un token incorrecto da 401, nunca un retorno a la sesión (ADR-020, ADR-036).                                                                  |
| E-05 | Una transferencia sin acuerdo                                       | F5, F12  | Implantado | El plano de datos solo entrega un EDR para un acuerdo finalizado (EDC-V); el hub registra el `contractId` con cada transferencia. El TCK cubre el protocolo.                                                                                                                     |
| E-06 | La cuenta de operador `edcadmin` con una contraseña de demostración | F2       | Abierto    | `EDC_ADMIN` lee la historia clínica de un paciente sin negociación de contrato. `scripts/azure/secure-accounts.sh` la pasa, junto con cada cuenta que no es de demostración, a una contraseña generada en Key Vault; pendiente de ejecutar contra el realm en producción (#671). |

### Resumen

| Categoría              | Amenazas | Cerrado | Implantado |  Demo | Abierto | Aceptado |
| ---------------------- | -------: | ------: | ---------: | ----: | ------: | -------: |
| Spoofing               |        5 |       2 |          3 |     0 |       0 |        0 |
| Tampering              |        7 |       3 |          4 |     0 |       0 |        0 |
| Repudiation            |        4 |       2 |          2 |     0 |       0 |        0 |
| Information disclosure |        9 |       5 |          3 |     1 |       0 |        0 |
| Denial of service      |        5 |       2 |          1 |     1 |       0 |        1 |
| Elevation of privilege |        6 |       3 |          2 |     0 |       1 |        0 |
| **Todas**              |   **36** |  **17** |     **15** | **2** |   **1** |    **1** |

Cerrado e implantado difieren en cómo se demuestran: una fila cerrada tiene
una prueba o un ajuste de compilación que falla cuando la mitigación
desaparece; una fila implantada depende de que el código lo haga y de las
suites que lo ejercitan. Convertir filas implantadas en filas cerradas es el
trabajo habitual de este modelo.

## 4. Lo que la demostración acepta, y lo que necesitan los datos reales

| Riesgo residual                                                   | Por qué se acepta para la demostración                                  | Qué lo cierra                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Sin revocación de credenciales (I-08)                             | Cada credencial la emite la demostración a un participante ficticio     | Una lista de estado en el IssuerService y un procedimiento de revocación; guía, identidad |
| Sin límite de frecuencia en el perímetro de los conectores (D-02) | Los conectores solo hablan con pares ficticios                          | Un WAF y límites por nombre de host; guía, perímetro                                      |
| Sin mTLS entre aplicaciones (T-02)                                | Un solo entorno, ingress interno                                        | Endpoints privados y endpoints DSP con autenticación mutua; guía, conectores              |
| Neo4j tiene un único usuario de base de datos                     | El acceso se decide en el hub y en el proxy, y los datos son sintéticos | Neo4j Enterprise o un grafo administrado con roles y copias de seguridad; guía, datos     |
| Cuentas de operador con contraseñas de demostración (E-06)        | Detrás de ellas no hay datos reales de nadie                            | `secure-accounts.sh --all-non-demo`; #671                                                 |
| Sin prueba independiente                                          | Las pruebas propias del proyecto son la evidencia hasta ahora           | Una prueba de penetración del hub; informe de pruebas, última sección; #655               |
| La pila está apagada fuera del horario de servicio (D-05)         | Una decisión de costes para una demostración                            | Un contrato de servicio 24x7; guía, disponibilidad                                        |

## 5. Cómo se mantiene fiel este modelo

- Una nueva ruta de la API necesita una sesión o un ADR que sustituya al
  vigente; de lo contrario, la prueba `every-route-needs-a-session.test.ts`
  falla.
- Una nueva ruta que devuelve campos de paciente consulta primero
  `seesPatientIdentity()`, y la colección de Bruno recibe una solicitud que
  comprueba el rechazo.
- Cada cambio ejecuta el análisis de seguridad, CodeQL, las suites de
  cumplimiento y las comprobaciones de caja negra; un hallazgo entra en el
  informe de pruebas de seguridad con un estado, nunca solo en un mensaje de
  commit.
- Los diagramas son fuentes PlantUML en `diagrams/`, renderizadas por
  `scripts/render-plantuml.sh`; un flujo que se añade al sistema recibe aquí
  un número y una fila en la tabla que lo analiza.

## 6. Cómo verificar este modelo usted mismo

Cada fila cerrada tiene una comprobación que puede ejecutarse en un portátil o
consultarse en la CI:

```bash
cd ui && npx vitest run __tests__/unit/api/every-route-needs-a-session.test.ts   # S-02, I-01, E-01
cd ui && npx vitest run __tests__/unit/api/patient-route.test.ts                   # E-02, I-07
scripts/security/check-hub-blackbox.sh                                             # I-01, I-04, I-06, S-04 against the live hub
scripts/security/scan-repo.sh                                                      # T-07: grype, npm audit, trivy, gitleaks, semgrep, hadolint, shellcheck
scripts/security/generate-sbom.sh --check                                          # T-07: the bills match the lockfiles
./scripts/run-api-tests.sh Azure-Dev "09 Access control"                           # E-01, E-02, E-04 by persona, against a real server
scripts/azure/guard-keycloak-console.sh --check                                    # S-04: console 403, admin REST 401, master realm 401
cd services/neo4j-proxy && npm test                                                # T-01, T-06, D-01, D-03
```

Las suites de cumplimiento (`compliance.yml`: el TCK de DSP 2025-1, las
comprobaciones DCP, las suites del EEDS) cubren las filas de los conectores,
S-01, S-03, T-05, E-05, en cada pull request. Una fila cuya comprobación falta
en esta lista es una fila implantada, y el siguiente paso para ella es la
prueba que la haría avanzar.
