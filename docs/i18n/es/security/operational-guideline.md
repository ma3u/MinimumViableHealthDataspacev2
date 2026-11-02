---
source: docs/security/operational-guideline.md
sourceHash: ecd7586f5a4e88a5099596d7c1f9eec81a888d8df3250d3cacbcab6dc9a5a13a
language: es
summary: "Cómo alojar de verdad el hub y Klarbefund: qué rol del EEDS (Reglamento (UE) 2025/327) opera cada parte, qué exigen BSI C5, IT-Grundschutz, TR-02102 y TR-03161 a cada parte, los plazos ante incidentes, la conservación y la lista de comprobación de puesta en producción por rol."
---

# Guía operativa: alojar el hub y Klarbefund conforme al EEDS y a las normas del BSI

Lo que contiene este repositorio es un demostrador: un grupo de recursos de
Azure, un operador, participantes ficticios, pacientes sintéticos y una pila
que se detiene por la noche para no salirse de un crédito personal. Esta guía
está escrita para el día en que alguien lo aloje de verdad: un organismo de
acceso a datos de salud, una empresa operadora que trabaje para uno, una
aseguradora de salud, un grupo hospitalario o un proveedor que adopte la
aplicación de marca blanca. Indica qué papel del Reglamento (UE) 2025/327
(el EEDS) opera cada parte, qué exigen las normas del BSI a cada parte y qué
debe cambiar respecto a la demostración antes de que cualquier dato de salud
real la toque.

Los números de artículo son los del Reglamento adoptado. Algunos archivos
más antiguos de este repositorio aún llevan los números de la propuesta de
2022; la correspondencia está en
[`docs/ehds-article-numbering.md`](../ehds-article-numbering.md). Las
pruebas que respaldan cada «la demostración ya lo hace» que figura a
continuación están en el [informe de pruebas de seguridad](security-test-report-2026-10-15.md),
los dos modelos de amenazas ([hub](threat-model.md), [aplicación](threat-model-klarbefund.md)),
el [análisis de brechas C5](bsi-c5-gap-analysis.md) y la
[autoevaluación](../klarbefund/self-assessment.md) de Klarbefund. Este
documento es una guía del proyecto, no asesoramiento jurídico ni una
certificación.

## 1. Los papeles en el EEDS y quién opera qué

El Reglamento nombra los papeles; no dice quién gestiona los servidores por
debajo del organismo de acceso. Los siete roles de Keycloak del hub son la
sombra técnica de los papeles jurídicos, y la tabla indica qué actor jurídico
está detrás de cada uno técnico cuando el sistema deja de ser una
demostración.

| Papel en el EEDS (Regl. 2025/327)                                                                                          | Qué espera de él el Reglamento                                                                                                                                                                                                                 | Rol / componente del hub                                                                                           | Quién lo opera en un despliegue real                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Persona física** (el paciente), art. 3 a 10, autoexclusión art. 71                                                       | Acceso a sus propios datos de salud electrónicos, inserción, rectificación, limitación, información sobre quién ha accedido; el derecho de autoexclusión del uso secundario.                                                                   | `PATIENT`; `/patient/*`; Klarbefund en el teléfono; inicio de sesión con la cartera EUDI (ADR-028)                 | La propia persona, a través del servicio de acceso de la autoridad de sanidad digital o de un sistema de HCE; la aplicación es suya y el operador nunca ve su contenido.              |
| **Profesional sanitario**, art. 11                                                                                         | Acceso a las categorías prioritarias de las personas a su cargo, registrado y visible para la persona.                                                                                                                                         | No es un rol en la demostración (el acceso para uso primario al historial pasa por la ePA, no por el hub)          | El operador del sistema de HCE; el hub solo recibe lo que la persona exporta.                                                                                                         |
| **Tenedor de datos de salud**, art. 2(2)(y), obligaciones art. 60, descripción del conjunto de datos art. 77               | Poner a disposición las categorías del art. 51 con un permiso, describir los conjuntos de datos, comunicarse con el organismo de acceso, aplicar la etiqueta de calidad (art. 78).                                                             | `DATA_HOLDER`; `/data/share`, `/data/transfer`; el conector (plano de control, plano de datos, IdentityHub)        | El propio tenedor (un hospital, una aseguradora, un registro); la empresa operadora puede alojar su conector con un contrato de encargo del tratamiento conforme al art. 28 del RGPD. |
| **Usuario de datos de salud**, art. 61, solicitudes art. 67, permiso art. 68                                               | Tratar solo dentro del entorno de tratamiento seguro, solo para la finalidad del permiso (art. 53), nunca para las finalidades prohibidas (art. 54), publicar los resultados, notificar las violaciones.                                       | `DATA_USER`; `/data/discover`, `/negotiate`, `/analytics`, `/query`                                                | La institución del investigador; nunca opera infraestructura, es un inquilino del SPE.                                                                                                |
| **Organismo de acceso a datos de salud (HDAB)**, art. 55, funciones art. 57, ejecución art. 63                             | Resolver las solicitudes, expedir los permisos, proporcionar el SPE (art. 73), llevar el registro público y cumplir las obligaciones de información (art. 58, 59), hacer cumplir (art. 63), ser responsable del tratamiento del SPE (art. 74). | `HDAB_AUTHORITY`; `/compliance`, `/admin/policies`, el registro de permisos, nodos `HDABApproval`                  | El organismo público designado; es titular de las decisiones y de la responsabilidad del tratamiento incluso cuando contrata la operación.                                            |
| **Tenedor fiable de datos de salud**, art. 72                                                                              | Un tenedor autorizado a aplicar el procedimiento simplificado para sus propios datos, con las mismas obligaciones de SPE y de registro.                                                                                                        | Un `DATA_HOLDER` con derechos delegados por el HDAB (no modelado por separado en la demostración)                  | El tenedor, bajo la supervisión del organismo de acceso.                                                                                                                              |
| **Operador del entorno de tratamiento seguro**, art. 73                                                                    | Acceso solo para personas físicas autorizadas, sin descarga de datos personales, todo acceso y todo resultado registrado, resultados comprobados en busca de datos personales antes de su entrega, seguridad auditada.                         | `TRUST_CENTER_OPERATOR`; `/analytics`, `/query`, `SPESession`, los agregados OMOP; ADR-037, ADR-052                | El organismo de acceso o su empresa operadora; en una nube certificada (atestación C5) con computación confidencial cuando los datos lo justifiquen.                                  |
| **Autoridad de sanidad digital**, art. 19; puntos de contacto nacionales, art. 23 y 75                                     | Uso primario: el servicio de acceso, MyHealth@EU; uso secundario: HealthData@EU y los permisos transfronterizos.                                                                                                                               | El segundo organismo de acceso y el permiso transfronterizo de los datos iniciales; el catálogo federado (ADR-020) | Las autoridades designadas del Estado miembro; el hub es un participante, nunca el propio punto de contacto nacional.                                                                 |
| **Fabricante de sistemas de HCE**, capítulo III; etiqueta de **aplicación de bienestar**, art. 48                          | Conformidad de los componentes europeos de interoperabilidad y de registro del sistema de HCE; una aplicación de bienestar puede declarar su interoperabilidad con un sistema de HCE.                                                          | Klarbefund como aplicación de tipo bienestar que exporta a la ePA; FHIR R4 en los perfiles del EEHRxF              | El proveedor que distribuye la aplicación; en el caso de marca blanca, la aseguradora como entidad que la introduce en el mercado.                                                    |
| **Operador de la plataforma** (no es un papel del EEDS; la empresa operadora de `docs/ehds-operating-company.md`)          | Gestiona la identidad, el catálogo, los conectores, el SPE y la monitorización para los actores anteriores; un encargado del tratamiento conforme al art. 28 del RGPD para cada uno de ellos.                                                  | `EDC_ADMIN`; `/admin/*`, el grupo de recursos de Azure, Keycloak, Vault, Key Vault, los pipelines                  | Un operador contratado con un SGSI ISO 27001 sobre la base de IT-Grundschutz y una nube con atestación C5 por debajo.                                                                 |
| **Autoridades de control**: protección de datos (RGPD), vigilancia del mercado (capítulo III), BSI / CSIRT nacional (NIS2) | Reciben las notificaciones de violaciones, auditan, hacen cumplir.                                                                                                                                                                             | El registro de auditoría (ADR-045), el informe de actividad, el registro de permisos                               | No son operadores; el operador debe poder responderles dentro de los plazos de la sección 7.                                                                                          |

### El modelo operativo como proceso

El diagrama es un proceso de estilo BPMN con un carril por papel: los
rectángulos son tareas, los rombos son decisiones, el bucle del final es el
control de resultados y los puntos verdes son el inicio y el fin. Los números
de artículo son los adoptados. Los carriles del tenedor, del usuario y de la
persona son suyos; el carril del organismo de acceso es donde se toma cada
decisión; los carriles de la empresa operadora y del operador del SPE
contienen el trabajo técnico que implementa este repositorio.

![Modelo operativo del EEDS: un carril por papel, desde la incorporación del tenedor, pasando por la solicitud, el permiso, la autoexclusión, la extracción, el entorno de tratamiento seguro y el control de resultados, hasta los resultados publicados](img/ehds-operating-model.svg)

Fuente: [`diagrams/ehds-operating-model.puml`](diagrams/ehds-operating-model.puml), renderizado con `scripts/render-plantuml.sh`.

Tres responsabilidades que el diagrama hace visibles y que un contrato debe
repetir: el organismo de acceso decide y el operador ejecuta; la
autoexclusión de la persona llega a la extracción del tenedor a través de la
evaluación de políticas del operador, no por buena voluntad; y ningún
resultado sale del SPE por decisión del operador, solo por decisión del
organismo de acceso.

De ello se derivan dos cosas. **La responsabilidad del tratamiento nunca es
del operador.** El organismo de acceso es responsable del tratamiento del SPE
y de los datos del permiso (art. 74); el tenedor es responsable de sus datos
de origen; el operador trata siguiendo instrucciones. Todo contrato de
alojamiento lo repite. **La asignación de roles es una decisión, no un
ticket.** Quién pasa a ser `HDAB_AUTHORITY` o `TRUST_CENTER_OPERATOR` lo
decide el organismo de acceso por escrito; el operador ejecuta la asignación
en Keycloak y la asignación queda registrada (ADR-045). La demostración
asigna los roles en un archivo de datos iniciales; un despliegue real elimina
esos datos iniciales y conserva el historial de asignaciones.

## 2. Arquitectura de alojamiento: de la demostración a una plataforma operable

La demostración ejecuta todo en un único entorno de Azure Container Apps,
`rg-mvhd-dev` (ADR-012), detenido fuera del horario de oficina (ADR-053,
ADR-058). La configuración siguiente conserva los componentes y cambia su
ubicación.

### La solución por capas

![La solución como vista por capas de ArchiMate: la capa de negocio con los seis papeles del EEDS y los procesos que realiza cada uno, la capa de aplicación con los seis servicios y los componentes que los realizan, la capa tecnológica con la plataforma Azure, las bases de datos, las cajas fuertes de secretos y el iPhone](img/ehds-solution-layers.svg)

Fuente: [`diagrams/ehds-solution-layers.puml`](diagrams/ehds-solution-layers.puml),
notación ArchiMate 3.2. La capa de negocio es la sección 1 de esta guía: cada
papel realiza sus propios procesos, y el procedimiento bilateral del capítulo
IV (solicitar, decidir, tratar) discurre de izquierda a derecha. La capa de
aplicación nombra lo que el hub proporciona a esos procesos y qué componente
lo realiza; la capa tecnológica es la plataforma de la tabla siguiente, tal
como la ejecuta hoy la demostración. Una flecha de una franja inferior a una
superior se lee «sirve a».

| Zona               | Componentes                                                                    | Demostración hoy                                                                                          | Necesario para datos reales                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perímetro          | Terminación TLS, WAF, límites de tasa                                          | Ingress de ACA con certificados gestionados; cabeceras definidas por `next.config` (F8)                   | Un cortafuegos de aplicaciones web delante de cada nombre de host público; TLS conforme a BSI TR-02102-2 (TLS 1.2 como mínimo, 1.3 preferible, sin suites CBC); HSTS precargado; límites de tasa por ruta y por identidad; protección frente a bots y DDoS de la nube.                                                       |
| Identidad          | Keycloak, IdentityHub, IssuerService, el backend de la cartera EUDI            | Keycloak `start-dev` detrás de una protección Caddy (F10); realm a partir de `keycloak-realm.json`        | Keycloak en modo de producción con su propia base de datos en el Flexible Server, consola de administración accesible solo desde la red del operador, MFA para cada rol privilegiado (C5 IAM-04), el realm bajo control de versiones y con comprobación de desviaciones (`docs/knowledge/runbooks/keycloak-realm-drift.md`). |
| Aplicación         | El hub (Next.js), el neo4j-proxy, el servicio de explicación, los rastreadores | Ingress público para el hub y Keycloak; ingress interno para el resto                                     | Solo el hub y Keycloak públicos; todo lo demás con ingress interno o endpoints privados; cada imagen firmada y fijada por digest; las listas de materiales de `docs/sbom/` regeneradas en cada cambio de dependencias.                                                                                                       |
| Conectores         | Plano de control, planos de datos, IdentityHub, Vault por participante         | Un conjunto de conectores por participante ficticio (ADR-024)                                             | Un conector por tenedor jurídico, operado por el tenedor o por el operador bajo contrato; endpoints DSP con autenticación mutua; las claves del participante en su propio espacio de nombres de Vault (ADR-046), nunca compartidas.                                                                                          |
| Datos              | Neo4j, el PostgreSQL Flexible Server, Azure Files                              | Postgres gestionado (ADR-041); Neo4j en Azure Files (ADR-017); sin copias de seguridad                    | Cifrado en reposo con claves gestionadas por el cliente (C5 CRY-03, DIP-02); Postgres con redundancia de zona y restauración a un momento dado; Neo4j Enterprise o un grafo gestionado con copias de seguridad probadas trimestralmente (DIP-03); nunca datos sintéticos y datos reales en la misma instancia.               |
| Tratamiento seguro | `/analytics`, `/query`, los agregados OMOP, `SPESession`                       | Agregados en el mismo Neo4j; computación confidencial evaluada (ADR-037, ADR-052)                         | Un entorno separado conforme al art. 73: red aislada, sin acceso saliente a internet, sin vía de descarga, resultados comprobados por el organismo de acceso antes de su entrega, máquinas virtuales confidenciales o enclaves cuando los datos del permiso lo justifiquen; auditado al menos una vez al año.                |
| Secretos           | Key Vault, Vault                                                               | Cada secreto del operador es una referencia de Key Vault (ADR-036); estado de Vault en Postgres (ADR-046) | Mantener; añadir rotación periódica (C5 CRY-04), claves respaldadas por HSM para las credenciales de firma y un procedimiento de emergencia documentado con aprobación de dos personas.                                                                                                                                      |
| Observabilidad     | El colector OpenTelemetry, Grafana, Loki, Tempo, Prometheus (ADR-045)          | Una aplicación de observabilidad; registros en Azure Monitor                                              | Registros enviados a un SIEM que vigila el SOC del operador; inmutabilidad del registro de auditoría (DIP-06); conservación según la sección 6; alertas sobre los eventos de la sección 7.                                                                                                                                   |
| Disponibilidad     | Toda la pila                                                                   | Se detiene a las 18:13 UTC y arranca a las 05:17 UTC los días laborables                                  | 24x7 con los objetivos del contrato de servicio; el horario fuera de oficina es una medida de coste de la demostración y se elimina (es una llamada `az`, `scripts/azure/offhours.sh`, y el ADR-053 queda sustituido por la decisión de alojamiento).                                                                        |

El único grupo de recursos de la demostración se convierte en al menos tres
suscripciones o grupos de recursos con identidades separadas: identidad y
perímetro, la plataforma y el entorno de tratamiento seguro. La identidad del
SPE nunca tiene derechos en los demás. Esto es en la práctica el dominio de
control C5 «PSS» (portabilidad y segregación) y el módulo NET.1.1 de
IT-Grundschutz.

## 3. Las normas del BSI, parte por parte

| Norma                                                                                | Se aplica a                                                             | Qué exige aquí                                                                                                                                                                                                                                                                                                                      | Situación del proyecto                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BSI C5:2020** (Catálogo de criterios de cumplimiento de la computación en la nube) | La nube subyacente y el operador como proveedor de servicios en la nube | Un informe de atestación (tipo 2) del proveedor de la nube para la infraestructura, y el propio informe C5 del operador para la plataforma si la ofrece como servicio. Los criterios que el código puede cumplir se siguen control por control.                                                                                     | [Análisis de brechas C5](bsi-c5-gap-analysis.md): los criterios de desarrollo, IAM y registro de auditoría cumplidos total o parcialmente; los organizativos, abiertos.                                                      |
| **ISO 27001 sobre la base de IT-Grundschutz**                                        | El operador                                                             | Un SGSI con los módulos que corresponden a esta pila: APP.3.1 aplicaciones web, APP.4.4 Kubernetes (ACA es el mismo modelo), SYS.1.6 contenedores, CON.1 criptografía, ORP.4 gestión de identidades y autorizaciones, OPS.1.1.5 registro, OPS.1.2.5 mantenimiento remoto, DER.2.1 gestión de incidentes, CON.2 protección de datos. | No es algo que pueda contener un repositorio; los modelos de amenazas y el informe de pruebas son entradas del análisis de riesgos.                                                                                          |
| **TR-02102-1 y -2** (mecanismos criptográficos, TLS)                                 | Cada conexión y cada secreto almacenado                                 | TLS 1.2 o 1.3 con las suites enumeradas; AES-GCM de 256 bits para los datos en reposo; RSA de 3000 bits o ECDSA P-256 y superiores para las firmas; SHA-256 y superiores; claves rotadas.                                                                                                                                           | La aplicación: AES-GCM por registro, clave en el Secure Enclave (autoevaluación O.Cryp). El hub: TLS de la plataforma, comprobado en caja negra; las suites del perímetro son las de la nube y deben fijarse en el contrato. |
| **TR-03161** (requisitos de seguridad para aplicaciones de salud)                    | Klarbefund y cualquier versión de marca blanca de ella                  | Los objetivos de la parte 1 (aplicaciones móviles) y de la parte 2 (web/backends): finalidad, arquitectura, código fuente, terceros, criptografía, autenticación, almacenamiento de datos, recursos de pago, red, plataforma, resiliencia.                                                                                          | [Autoevaluación](../klarbefund/self-assessment.md), objetivo por objetivo; la lista por requisito y una prueba independiente siguen abiertas (informe de pruebas, sección «What an independent test would add»).             |
| **TR-03116-4** (TLS en proyectos federales)                                          | Cualquier despliegue para un organismo público                          | El perfil TLS que debe usar un operador federal; más estricto que TR-02102-2 en suites de cifrado y cadenas de certificados.                                                                                                                                                                                                        | No comprobado; la configuración del perímetro es la de la nube.                                                                                                                                                              |
| **TR-03107-1** (identidades electrónicas y servicios de confianza)                   | Inicio de sesión de personas físicas                                    | Niveles de garantía de la identificación; «sustancial» o «alto» para el acceso al propio historial de salud.                                                                                                                                                                                                                        | El inicio de sesión con la cartera EUDI (ADR-028) apunta a «alto» mediante la cartera; el usuario y la contraseña de Keycloak son solo para la demostración.                                                                 |
| **NIS2 tal como se ha transpuesto (BSIG)**, umbrales KRITIS                          | El operador y las entidades sanitarias de la plataforma                 | Medidas de gestión de riesgos, notificación de incidentes en 24 horas (alerta temprana) y 72 horas, seguridad de la cadena de suministro, responsabilidad de la dirección; registro KRITIS si se alcanzan los umbrales del sector sanitario.                                                                                        | La sección 7 indica los plazos; el documento de la empresa operadora contiene el modelo de escalado.                                                                                                                         |

El orden importa en una licitación: el informe C5 de la nube es lo primero
que pide un comprador público, el SGSI del operador lo segundo y la prueba
TR-03161 de la aplicación lo tercero. Ninguno de ellos lo produce el código;
el código produce las pruebas que ellos leen.

## 4. Identidad y acceso

- **Un único proveedor de identidad, operado por el operador de la
  plataforma, con el realm bajo control de versiones.** Keycloak contiene los
  roles; el hub solo confía en los roles del token (`ui/src/lib/auth.ts`).
  Cada ruta de la API necesita una sesión (ADR-044); la única excepción por
  ruta se redacta como un ADR, nunca como un indicador de configuración.
- **Las organizaciones demuestran quiénes son con credenciales verificables**
  emitidas frente a un registro con autoridad (DCP v1.0, `did:web`). El
  IssuerService es del operador; las claves del tenedor permanecen en el
  espacio de nombres de Vault del tenedor. Los datos iniciales de la
  demostración emiten credenciales a organizaciones ficticias; un despliegue
  real solo las emite tras los pasos de incorporación del documento de la
  empresa operadora, paso 3.
- **Las personas físicas inician sesión mediante la cartera EUDI o la eID
  nacional**, con nivel de garantía «alto» para su propio historial (art. 16,
  gestión de la identificación; TR-03107). El usuario y la contraseña se
  mantienen para el personal, con MFA, y nunca para los pacientes.
- **Los roles privilegiados** (`EDC_ADMIN`, `HDAB_AUTHORITY`,
  `TRUST_CENTER_OPERATOR`) requieren MFA, una persona identificada, una
  asignación documentada por el organismo de acceso y una revisión cada
  trimestre. Las cuentas de servicio (el token del rastreador del catálogo,
  ADR-020; la cuenta sandbox de la aplicación, ADR-054) se enumeran con su
  responsable, su alcance y su fecha de rotación.
- **La consola de administración de Keycloak no está en internet** (hallazgo
  F10, la protección Caddy de `scripts/azure/guard-keycloak-console.sh`); la
  administración pasa por una red privada o un bastión con grabación de
  sesiones.
- **Las sesiones** son cortas para los roles privilegiados, están vinculadas
  al cliente y se revocan al cambiar de rol. `NEXTAUTH_SECRET` y cualquier
  otro secreto del operador es una referencia de Key Vault (ADR-036), rotada
  periódicamente.
- **Quién ve la identidad de un paciente se decide por rol, nunca por un
  parámetro** (`ui/src/lib/patient-identity.ts`): los tenedores y el operador
  de la plataforma para el uso primario, el paciente solo para su propio
  historial (`refuseForeignRecord`), todos los demás un seudónimo. El proxy
  NLQ rechaza las consultas que revelan la identidad. Esto se mantiene tal
  cual y se prueba en cada compilación.

## 5. Protección de datos

- **Responsabilidad del tratamiento y contratos.** El organismo de acceso es
  responsable del tratamiento del entorno de tratamiento seguro (art. 74) y da
  instrucciones al operador como encargado; el tenedor es responsable de sus
  datos de origen; el usuario de datos es responsable de lo que se le permite
  tratar, solo dentro del SPE. Cada pareja firma un contrato conforme al
  art. 28 del RGPD; el documento de la empresa operadora ofrece el modelo.
- **Una evaluación de impacto relativa a la protección de datos** antes de la
  puesta en producción, para la plataforma en su conjunto y para el SPE por
  separado. Los dos modelos de amenazas son la entrada técnica; la EIPD añade
  la base jurídica por categoría de datos (art. 51) y los riesgos residuales.
- **Minimización de datos y limitación de la finalidad** (art. 66): el
  organismo de acceso decide para cada permiso si los datos anonimizados
  responden a la pregunta, y solo después los datos seudonimizados. Los
  agregados OMOP del hub y el k-anonimato de las vistas de cohortes son la vía
  anonimizada; la extracción FHIR es la seudonimizada y solo se ejecuta dentro
  del SPE.
- **Las claves de seudonimización** las custodia el organismo de acceso o un
  tercero de confianza, nunca el usuario de datos y nunca el operador del SPE.
- **La autoexclusión** (art. 71) es un registro que lleva el organismo de
  acceso; el conector del tenedor lo consulta antes de la extracción. La
  demostración tiene registros de consentimiento en la aplicación y en la
  página del paciente; un despliegue real integra el registro nacional de
  autoexclusión en la evaluación de políticas ODRL.
- **Derechos del paciente para el uso primario** (art. 3 a 10): acceso,
  inserción, rectificación, limitación y la lista de quién ha accedido. El
  registro de accesos de la página del paciente y el registro de auditoría
  (ADR-045) son la implementación; el operador debe responder a una solicitud
  dentro del mes que fija el RGPD.
- **Residencia.** Cada encargado del tratamiento está en la UE o el EEE; el
  proveedor del modelo del servicio de explicación se elige por región y
  cuota (ADR-035), y el modelo en el dispositivo es el predeterminado, de modo
  que ningún valor de salud sale del teléfono a menos que la persona lo envíe.
- **La aplicación** no contiene nada que el operador pueda leer: los valores,
  las páginas y los diagnósticos se cifran por registro con una clave en el
  Secure Enclave, se excluyen de las copias de seguridad y quedan protegidos
  por Face ID o el código de acceso (ADR-060). El operador de marca blanca
  hereda esto; no debe añadir telemetría que transporte valores.

## 6. Registro, conservación y registro de auditoría

Qué debe registrarse, durante cuánto tiempo y quién puede leerlo. La
[política de conservación de auditoría](../audit-retention-policy.md) del
proyecto contiene las cifras actuales (todavía cita los números de artículo
de la propuesta); las obligaciones proceden del art. 57 (el organismo de
acceso lleva un registro de solicitudes y permisos), del art. 73 (todo acceso
al SPE y todo resultado registrado), de los art. 58 y 59 (información al
público, informe anual) y de la responsabilidad proactiva del RGPD.

| Evento                                                                      | Registrado por                        | Legible por                                                      | Conservación (política del proyecto)                |
| --------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| Acceso a datos, transferencia, contrato (la cadena `TransferEvent`)         | El neo4j-proxy y los conectores       | El organismo de acceso, el tenedor para sus datos, los auditores | 10 años                                             |
| Decisiones sobre permisos, revocaciones                                     | El organismo de acceso en el hub      | Registro público para la decisión, las partes para el expediente | 10 años                                             |
| Sesiones del SPE: quién, qué conjunto de datos, qué consulta, qué resultado | El SPE                                | El organismo de acceso; el usuario de datos para las suyas       | 10 años                                             |
| Asignaciones y revocaciones de roles, inicios de sesión privilegiados       | Keycloak, enviado al SIEM             | El equipo de seguridad del operador, los auditores               | 2 años, más si un incidente hace referencia a ellos |
| Acceso HTTP en el perímetro, eventos de autenticación                       | El perímetro y Keycloak               | El equipo de seguridad del operador                              | 2 años                                              |
| Historial propio del paciente: cada lectura, por quién                      | El hub                                | El paciente, en su página                                        | Mientras exista el historial                        |
| Aplicación: diagnósticos que la persona decide exportar                     | La aplicación, solo en el dispositivo | La persona; los desarrolladores solo si se envían                | Lo decide la persona                                |

Tres reglas que la demostración ya cumple y que un despliegue real debe
cumplir: el registro de auditoría lo escribe el servicio que realizó la
acción, no el cliente; solo admite anexar para todos salvo para la tarea de
conservación (DIP-06, implementar con un almacén inmutable o una cadena
firmada); y ninguna línea de registro contiene un valor de salud o un nombre
donde basta un seudónimo.

## 7. Incidentes, plazos y quién notifica a quién

| Desencadenante                                                    | Plazo                                                                                                                             | Quién notifica a quién                                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Violación de la seguridad de los datos personales                 | Art. 33 del RGPD: 72 horas a la autoridad de control; art. 34: a las personas sin dilación indebida                               | El operador informa al responsable del tratamiento (organismo de acceso o tenedor) sin dilación indebida; el responsable notifica a la autoridad.                                         |
| Incidente significativo en una entidad sanitaria o en el operador | NIS2 tal como se ha transpuesto: alerta temprana en 24 horas, notificación en 72 horas, informe final en un mes                   | El contacto CSIRT del operador al BSI; los tenedores afectados en paralelo.                                                                                                               |
| Datos utilizados fuera del permiso                                | Art. 63(2): el organismo de acceso puede revocar el permiso y detener el tratamiento sin dilación indebida                        | El operador del SPE informa de inmediato al organismo de acceso; el organismo de acceso decide y, si es posible una violación del RGPD, informa inmediatamente a la autoridad de control. |
| La auditoría del SPE detecta una deficiencia                      | Art. 73(3): medida correctora                                                                                                     | El organismo de acceso da instrucciones al operador; la corrección se acredita en la siguiente auditoría.                                                                                 |
| Incidente grave de un sistema de HCE o de una aplicación          | Art. 44 (riesgos e incidentes graves)                                                                                             | El fabricante a la autoridad de vigilancia del mercado; en el caso de la aplicación de marca blanca, la entidad que la introduce en el mercado.                                           |
| Vulnerabilidad alta o crítica en una dependencia                  | Regla del proyecto: corregida o con excepción limitada en el tiempo dentro de la barrera de CI (`docs/npm-audit-exceptions.json`) | El equipo de seguridad del operador; el análisis se ejecuta en cada push (`security-scan.yml`).                                                                                           |

### Coordinación de incidentes entre las partes

Un escalado es un conjunto de notificaciones con plazos, por lo que se
representa como una secuencia: una línea de vida por parte, un mensaje por
notificación, los plazos legales en negrita sobre el mensaje y las ramas que
se ejecutan al mismo tiempo en un bloque paralelo.

![Coordinación de incidentes como secuencia: el operador detecta, clasifica y contiene en la primera hora; después, en paralelo, el responsable del tratamiento notifica a la autoridad de protección de datos en 72 horas y a las personas sin dilación indebida, el operador alerta al CSIRT en 24 horas e informa en 72 horas y en un mes, el organismo de acceso revoca un permiso utilizado indebidamente y los tenedores pueden suspender; después, la corrección, el informe posterior al incidente y la medida correctora tras una auditoría del SPE](img/ehds-incident-coordination.svg)

Fuente: [`diagrams/ehds-incident-coordination.puml`](diagrams/ehds-incident-coordination.puml),
renderizado con `scripts/render-plantuml.sh`. Los plazos proceden de los
[art. 33 y 34 del RGPD](https://eur-lex.europa.eu/eli/reg/2016/679/oj),
del [art. 23 de la NIS2](https://eur-lex.europa.eu/eli/dir/2022/2555/oj) tal como se ha transpuesto
en la BSIG, y del [Reglamento (UE) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj),
art. 61, 63(2) y 73(3); la tabla anterior nombra cada uno.

Los plazos no los negocia el operador: el responsable del tratamiento es
titular de los del RGPD, el operador de los de la NIS2 y el organismo de
acceso de los del EEDS. La lista de contactos del procedimiento de incidentes
nombra a una persona para cada uno, con un suplente, y el ejercicio de mesa
previo a la puesta en producción recorre este diagrama una vez.

Las alertas que alimentan esta tabla son, como mínimo: un inicio de sesión
privilegiado desde una ubicación nueva, cualquier petición a la consola de
administración que llegue a Keycloak, una consulta en el SPE que revelaría la
identidad, una verificación de App Attest fallida en volumen, un conector
cuya verificación de credenciales falla, una tarea de copia de seguridad que
no se ha ejecutado y toda tasa de HTTP 5xx por encima del umbral.

## 8. Operar la plataforma

- **Gestión de cambios.** Cada cambio es una pull request con las barreras de
  `docs/quality-gates.md`: comprobación de tipos, lint, pruebas unitarias y de
  recorridos, la colección Bruno contra el hub, Semgrep, gitleaks, hadolint,
  la comprobación de la SBOM, CodeQL para TypeScript y Swift, trivy y grype.
  Las fusiones se despliegan mediante `deploy-azure.yml` solo desde `main`; el
  entorno de producción añade una aprobación de la versión por el comité de
  cambios del operador y una imagen firmada.
- **Gestión de vulnerabilidades.** Los análisis de
  `scripts/security/scan-repo.sh` se ejecutan en cada push y cada noche; los
  hallazgos altos y críticos se corrigen dentro del plazo del contrato o se
  limitan en el tiempo con una excepción por escrito. El
  [informe de pruebas de seguridad](security-test-report-2026-10-15.md) se
  repite en cada versión y una vez al año por un evaluador independiente.
- **Parches.** Imágenes base reconstruidas mensualmente y ante avisos;
  Keycloak, Neo4j y Postgres en versiones principales con soporte (ADR-030
  para Neo4j, el runbook de Postgres 16 a 17 para el patrón).
- **Copias de seguridad y recuperación.** Postgres con restauración a un
  momento dado entre zonas; Neo4j con copias de seguridad diarias y una prueba
  de restauración cada trimestre; el estado de Vault está en Postgres
  (ADR-046) y las claves de desellado en Key Vault, con un simulacro de
  recuperación documentado. Objetivos que acordar en el contrato: punto de
  recuperación de una hora, tiempo de recuperación de cuatro horas para el hub
  y de una jornada laboral para el SPE.
- **Disponibilidad.** 24x7; se elimina el horario de la demostración;
  comprobaciones de estado en cada imagen (hallazgo F6) y sondas en cada
  definición de aplicación; dos réplicas para el hub y el proxy; la página de
  fuera de horario pasa a ser una página de mantenimiento usada solo dentro de
  ventanas anunciadas.
- **Gestión de claves.** Claves de firma de credenciales en un HSM;
  certificados TLS automatizados; cada secreto rotado al menos una vez al año
  y ante cambios de personal; el procedimiento de emergencia con aprobación de
  dos personas y un registro.
- **Seguridad de los proveedores** (C5 OIS-05): Keycloak, Neo4j, los
  componentes EDC, la nube y el proveedor del modelo evaluados y enumerados
  con sus atestaciones; las listas de materiales de `docs/sbom/` son el
  inventario.
- **Salida.** La exportación de datos en FHIR R4 y OMOP CDM ya es la interfaz
  del hub; el contrato fija el formato, el plazo y la prueba de supresión al
  final.

## 9. Klarbefund en un despliegue de marca blanca

La aplicación cambia de propietario, pero no de arquitectura. La entidad que
la introduce en el mercado:

- mantiene el procesamiento en el dispositivo como opción predeterminada: los
  valores, las páginas y la explicación permanecen en el teléfono a menos que
  la persona los envíe (autoevaluación O.Purp, O.Data);
- mantiene el bloqueo de la aplicación y el cifrado por registro (ADR-060,
  O.Auth, O.Cryp) y no añade analítica que vea valores;
- opera el servicio de cuentas sandbox (ADR-054) y, si se ofrece, el servicio
  de explicación (ADR-034, ADR-035) en la UE, en su propio nombre y con su
  propia EIPD;
- publica un aviso de privacidad en el idioma de la persona y una dirección
  para la divulgación de vulnerabilidades;
- encarga la prueba TR-03161 y, si declara interoperabilidad con un sistema de
  HCE, la declaración del art. 48; no reivindica la condición de DiGA sin el
  marcado CE que exige la vía DiGA (autoevaluación, «Regulation»);
- repite las pruebas de exactitud con sus propios formatos de informe antes
  del piloto (la prueba comparativa de [`evidence.md`](../klarbefund/evidence.md) es sintética).

## 10. Antes de la puesta en producción: la lista de comprobación por papel

| #   | Elemento                                                                                                                       | Responsable                                       | Prueba                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Contrato de alojamiento con la responsabilidad del tratamiento conforme al art. 74 y cláusulas del art. 28 del RGPD por pareja | Organismo de acceso, operador                     | Contratos firmados                                                                                               |
| 2   | Informe C5 de tipo 2 del proveedor de la nube revisado; el alcance cubre cada servicio utilizado                               | Operador                                          | Informe, correspondencia del alcance                                                                             |
| 3   | SGSI del operador certificado o con un plan fechado; los módulos de la sección 3 asignados                                     | Operador                                          | Certificado o plan de auditoría                                                                                  |
| 4   | EIPD para la plataforma y para el SPE                                                                                          | Organismo de acceso (responsable del tratamiento) | Documentos de la EIPD                                                                                            |
| 5   | Zonas de red, endpoints privados, WAF, perfil TLS conforme a TR-02102-2 o TR-03116-4                                           | Operador                                          | Arquitectura, análisis desde el exterior (`check-hub-blackbox.sh` ampliado)                                      |
| 6   | Keycloak en modo de producción, consola de administración privada, MFA en los roles privilegiados, realm en git                | Operador                                          | Diferencias del realm, `guard-keycloak-console.sh --check`                                                       |
| 7   | Inicio de sesión con EUDI o eID para personas físicas con nivel de garantía «alto»                                             | Operador, autoridad de sanidad digital            | Prueba de conformidad del flujo de la cartera                                                                    |
| 8   | Cifrado en reposo con claves gestionadas por el cliente; copias de seguridad y un simulacro de restauración                    | Operador                                          | Configuración de Key Vault, acta del simulacro                                                                   |
| 9   | SPE aislado, sin vía de descarga, procedimiento de control de resultados, auditoría anual programada                           | Organismo de acceso, operador del SPE             | Plan de auditoría, procedimiento                                                                                 |
| 10  | Registro de auditoría inmutable, enviado al SIEM, conservación según la sección 6                                              | Operador                                          | Configuración del SIEM, tarea de conservación                                                                    |
| 11  | Procedimiento de incidentes con los plazos de la sección 7 y contactos nombrados                                               | Operador, organismo de acceso                     | Procedimiento, lista de contactos, un ejercicio de mesa                                                          |
| 12  | Prueba de penetración independiente del hub y prueba TR-03161 de la aplicación                                                 | Operador, propietario de la aplicación            | Informes; hallazgos cerrados o aceptados por escrito                                                             |
| 13  | Horario fuera de oficina eliminado; réplicas y sondas en su sitio                                                              | Operador                                          | Definiciones de las aplicaciones                                                                                 |
| 14  | Datos sintéticos eliminados del grafo de producción; datos iniciales desactivados; indicador de demostración desactivado       | Operador                                          | `MATCH (p:Patient) RETURN count(p)` coincide con el recuento de los tenedores; `NEXT_PUBLIC_DEMO_TK` sin definir |
| 15  | Registro de autoexclusión integrado en la evaluación de políticas                                                              | Organismo de acceso, operador                     | Prueba de políticas con un registro autoexcluido                                                                 |
| 16  | Dirección de divulgación de vulnerabilidades publicada; lista de proveedores con atestaciones                                  | Operador                                          | `SECURITY.md`, registro de proveedores                                                                           |

## 11. Lo que el demostrador no hace

Para que nadie lea en él más de lo que hay:

- Es un inquilino, un operador, una región, detenido por la noche.
- Sus participantes, organismos de acceso y pacientes son ficticios; sus
  credenciales las emite su propio emisor frente a ningún registro.
- No tiene SIEM, ni WAF, ni claves gestionadas por el cliente, ni copia de
  seguridad del grafo, ni MFA, y el entorno de tratamiento seguro es un
  conjunto de vistas sobre la misma base de datos, no un entorno aislado (el
  ADR-037 y el ADR-052 recogen lo que se evaluó).
- No ha tenido ninguna prueba de penetración independiente ni ninguna prueba
  TR-03161; el [informe de pruebas de seguridad](security-test-report-2026-10-15.md)
  es el proyecto probándose a sí mismo.
- Sus referencias a artículos del EEDS son en parte los números de la
  propuesta; este documento utiliza los adoptados.

Lo que sí tiene es la estructura, los papeles, el registro, las reglas de
identidad basadas en roles, los conectores y las exportaciones que necesita
un despliegue real, con cada decisión redactada como un ADR y cada afirmación
vinculada a una prueba. Eso es lo que lo convierte en una referencia y no en
un producto.

## Fuentes

- Reglamento (UE) 2025/327 relativo al Espacio Europeo de Datos de Salud, DO L, 5 de marzo de 2025.
- Reglamento (UE) 2016/679 (RGPD), art. 28, 33, 34, 35.
- Directiva (UE) 2022/2555 (NIS2) y su transposición nacional.
- BSI, Catálogo de criterios de cumplimiento de la computación en la nube C5:2020.
- BSI, IT-Grundschutz-Kompendium, edición vigente; normas BSI 200-1 a 200-3.
- BSI TR-02102-1 y TR-02102-2, mecanismos criptográficos y TLS.
- BSI TR-03161, requisitos de seguridad para aplicaciones sanitarias digitales, partes 1 a 3.
- BSI TR-03116-4, requisitos criptográficos para proyectos federales, TLS.
- BSI TR-03107-1, identidades electrónicas y servicios de confianza en la administración electrónica.
- Este repositorio: los ADR citados anteriormente, `docs/ehds-operating-company.md`,
  `docs/audit-retention-policy.md`, `docs/ehds-article-numbering.md`.
