---
source: docs/security/bsi-c5-gap-analysis.md
sourceHash: 09e0d014903c7a9c94c0d15df0d72be1ab532ba429c5804bcaf34cc64d921295
language: es
summary: "El hub frente al catálogo de criterios BSI C5:2020, para el art. 50, apartado 6, del EEDS."
---

# Análisis de brechas BSI C5: hub de integración EEDS

**Norma**: catálogo de criterios de cumplimiento para la computación en la nube del BSI (C5:2020)
**Pertinencia**: el art. 50, apartado 6, del EEDS exige que los espacios de datos aprobados por el organismo de acceso a datos de salud (HDAB) cumplan C5 o un equivalente.
**Alcance**: evaluación de demostración/MVP. Una auditoría completa de producción requiere un auditor C5 acreditado.

---

## Leyenda de estados

| Símbolo | Significado                           |
| ------- | ------------------------------------- |
| ✅      | Implementado (demostración)           |
| 🟡      | Implementado parcialmente             |
| ⚠️      | Riesgo aceptado para la demostración  |
| ❌      | No aplicable o no implementado        |
| 🔵      | Solo en la hoja de ruta de producción |

---

## Dominios de control de C5

### OIS: Seguridad organizativa y de la información

| Control | Requisito                                           | Estado de la demostración | Brecha / mitigación                             |
| ------- | --------------------------------------------------- | ------------------------- | ----------------------------------------------- |
| OIS-01  | Política de seguridad de la información documentada | ✅                        | Este documento + modelo de amenazas             |
| OIS-02  | Funciones de seguridad de la información asignadas  | ⚠️                        | Solo personas ficticias; ningún CISO real       |
| OIS-03  | Evaluación de riesgos                               | ✅                        | threat-model.md + análisis STRIDE               |
| OIS-04  | Inventario de activos                               | ✅                        | Activos enumerados en el modelo de amenazas     |
| OIS-05  | Seguridad de los proveedores                        | ⚠️                        | Neo4j, Keycloak, NATS: no evaluados formalmente |

### CCM: Gestión de cambios

| Control | Requisito                            | Estado de la demostración | Brecha / mitigación                          |
| ------- | ------------------------------------ | ------------------------- | -------------------------------------------- |
| CCM-01  | Proceso de cambios documentado       | ✅                        | Flujo de trabajo de Git + revisiones de PR   |
| CCM-02  | Revisión de seguridad de los cambios | 🟡                        | Esta fase añade controles de seguridad en CI |
| CCM-03  | Plan de reversión                    | ✅                        | Git revert + etiquetas de imagen de Docker   |

### DEV: Seguridad en el desarrollo (lo más relevante para el código)

| Control | Requisito                                 | Estado de la demostración | Brecha / mitigación                                      |
| ------- | ----------------------------------------- | ------------------------- | -------------------------------------------------------- |
| DEV-01  | Directrices de programación segura        | ✅                        | `.claude/rules/code-style.md`                            |
| DEV-02  | Validación de entradas                    | ✅                        | Consultas Cypher parametrizadas                          |
| DEV-03  | Codificación de salidas                   | 🟡                        | React escapa automáticamente; CSP añadida en D2          |
| DEV-04  | Aplicación de la autenticación            | ✅                        | NextAuth + Keycloak OIDC                                 |
| DEV-05  | Gestión de dependencias                   | ✅                        | `npm audit --audit-level=high` en CI                     |
| DEV-06  | Análisis estático                         | 🟡                        | ESLint + TypeScript strict; todavía sin herramienta SAST |
| DEV-07  | Sin credenciales codificadas en el código | ✅                        | Solo variables de entorno; consultas parametrizadas      |
| DEV-08  | Detección de secretos                     | ⚠️                        | Todavía sin `detect-secrets` ni `gitleaks` en CI         |
| DEV-09  | Pruebas de seguridad                      | ✅                        | Pruebas E2E SEC-01–SEC-10 (D3)                           |
| DEV-10  | Divulgación de vulnerabilidades           | ⚠️                        | Todavía sin SECURITY.md ni política de CVD               |

### IAM: Gestión de identidades y accesos

| Control | Requisito                         | Estado de la demostración | Brecha / mitigación                                                                                                                          |
| ------- | --------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM-01  | Autenticación obligatoria         | ✅                        | Todas las rutas (UI + API) requieren sesión; el pentest D6 añadió controles getServerSession a todas las rutas /api/admin/_ y /api/patient/_ |
| IAM-02  | Control de acceso basado en roles | ✅                        | 7 roles de Keycloak + middleware                                                                                                             |
| IAM-03  | Mínimo privilegio                 | 🟡                        | Matriz de roles implementada; sin ABAC de grano fino                                                                                         |
| IAM-04  | MFA para cuentas privilegiadas    | ⚠️                        | MFA de Keycloak no configurada en la demostración                                                                                            |
| IAM-05  | Gestión de sesiones               | ✅                        | Sesiones de NextAuth + NEXTAUTH_SECRET                                                                                                       |
| IAM-06  | Ciclo de vida de las credenciales | ⚠️                        | Las credenciales de demostración son estáticas                                                                                               |
| IAM-07  | Gestión de accesos privilegiados  | ⚠️                        | Rol de administración solo a través de Keycloak; sin sistema PAM                                                                             |

### COS: Seguridad de las comunicaciones

| Control | Requisito                      | Estado de la demostración | Brecha / mitigación                                                 |
| ------- | ------------------------------ | ------------------------- | ------------------------------------------------------------------- |
| COS-01  | Cifrado en tránsito            | ✅ (local) / 🔵 (prod)    | HTTPS en producción; HTTP en localhost aceptable para desarrollo    |
| COS-02  | Configuración TLS robusta      | ⚠️                        | No validada; depende del proxy inverso                              |
| COS-03  | Gestión de certificados        | 🔵                        | Solo en producción: rotación de certificados mediante Let's Encrypt |
| COS-04  | Segmentación de la red interna | ⚠️                        | Solo aislamiento de redes de Docker                                 |

### DIP: Integridad y protección de los datos

| Control | Requisito                         | Estado de la demostración | Brecha / mitigación                                            |
| ------- | --------------------------------- | ------------------------- | -------------------------------------------------------------- |
| DIP-01  | Clasificación de los datos        | ✅                        | Tabla de activos del modelo de amenazas                        |
| DIP-02  | Cifrado en reposo                 | ⚠️                        | Datos de Neo4j no cifrados en reposo en la demostración        |
| DIP-03  | Copia de seguridad y recuperación | ⚠️                        | Sin copia de seguridad del volumen de Neo4j en la demostración |
| DIP-04  | Minimización de datos             | ✅                        | FHIR solo devuelve los campos solicitados                      |
| DIP-05  | Registro de auditoría             | ✅                        | Nodos `TransferEvent`, escritos por el neo4j-proxy             |
| DIP-06  | Integridad de los registros       | ⚠️                        | Los registros son modificables en Neo4j                        |

### LOG: Registro y supervisión

| Control | Requisito                         | Estado de la demostración | Brecha / mitigación                                       |
| ------- | --------------------------------- | ------------------------- | --------------------------------------------------------- |
| LOG-01  | Registro de eventos de seguridad  | 🟡                        | Registros de acceso a través de Neo4j; sin SIEM           |
| LOG-02  | Conservación de los registros     | ⚠️                        | Sin política de conservación; solo en función del volumen |
| LOG-03  | Alertas ante anomalías            | ❌                        | Sin alertas en la demostración                            |
| LOG-04  | Control de acceso a los registros | ⚠️                        | El administrador de Neo4j puede modificar los registros   |

### INS: Gestión de incidentes

| Control | Requisito                                | Estado de la demostración | Brecha / mitigación                                           |
| ------- | ---------------------------------------- | ------------------------- | ------------------------------------------------------------- |
| INS-01  | Plan de respuesta a incidentes           | ⚠️                        | No documentado                                                |
| INS-02  | Clasificación de incidentes de seguridad | ⚠️                        | No definida                                                   |
| INS-03  | Proceso de notificación de violaciones   | ⚠️                        | El art. 33 del RGPD exige la notificación en un plazo de 72 h |

---

## Plan prioritario de cierre de brechas

### Fase de demostración (implementar ahora)

| Prioridad | Control | Acción                                                              | Incidencia                     |
| --------- | ------- | ------------------------------------------------------------------- | ------------------------------ |
| P0        | DEV-07  | Cypher parametrizado (D1)                                           | ✅ Hecho: fase 23              |
| P0        | DEV-03  | CSP + cabeceras de seguridad (D2)                                   | ✅ Hecho: fase 23              |
| P0        | DEV-09  | Pruebas E2E de seguridad (D3)                                       | ✅ Hecho: fase 23              |
| P0        | DEV-05  | npm audit en CI (D4)                                                | ✅ Hecho: fase 23              |
| P1        | DEV-08  | Añadir el hook de pre-commit `detect-secrets`                       | GitHub #4: D5                  |
| P1        | DEV-10  | Crear SECURITY.md + política de CVD                                 | GitHub #4: D8                  |
| P1        | IAM-01  | Verificar que todas las rutas de la API comprueban la autenticación | ✅ Hecho: fase 24 (pentest D6) |

### Hoja de ruta de producción

| Prioridad | Control   | Acción                                                           |
| --------- | --------- | ---------------------------------------------------------------- |
| P0        | COS-01/02 | TLS 1.3 + HSTS + rotación de certificados                        |
| P0        | IAM-04    | MFA para EDC_ADMIN + HDAB_AUTHORITY                              |
| P0        | DIP-02    | Cifrado de disco de Neo4j                                        |
| P1        | DEV-06    | SAST (CodeQL o Semgrep) en CI                                    |
| P1        | DEV-08    | gitleaks en CI + pre-commit                                      |
| P1        | LOG-01    | Integración con SIEM (OpenSearch / Loki)                         |
| P1        | LOG-03    | Alertas ante autenticaciones fallidas / accesos anómalos         |
| P2        | INS-01    | Runbook de respuesta a incidentes                                |
| P2        | DIP-06    | Registro de auditoría de solo anexado (Neo4j Enterprise o Kafka) |
| P2        | IAM-03    | ABAC mediante políticas de OPA                                   |
| P2        | DSP       | Mensajes de contrato firmados con DID según DSP §5.3             |
| P2        | DCP       | Comprobaciones de firma, caducidad y revocación de VC            |

---

## Correspondencia con la normativa del EEDS

| Artículo del EEDS   | Requisito                                  | Controles C5       | Estado de la demostración |
| ------------------- | ------------------------------------------ | ------------------ | ------------------------- |
| Art. 3, apartado 1  | Derecho del paciente a acceder a sus datos | IAM-01, IAM-03     | ✅ rutas /patient/\*      |
| Art. 6              | Exactitud de los datos                     | DIP-04, DIP-05     | 🟡                        |
| Art. 10             | Consentimiento para el uso secundario      | IAM-02, DIP-01     | ✅ nodos de política ODRL |
| Art. 45             | Se requiere la aprobación del HDAB         | IAM-02             | ✅ nodos HDABApproval     |
| Art. 50, apartado 6 | Se requiere C5 o un equivalente            | Todos los dominios | 🟡 Demostración parcial   |
| Art. 51             | Pista de auditoría                         | LOG-01, DIP-05     | 🟡                        |
| RGPD art. 25        | Protección de datos desde el diseño        | DIP-04, IAM-03     | 🟡                        |
| RGPD art. 32        | Medidas técnicas de seguridad              | COS-01, DIP-02     | ⚠️                        |

---

_Última actualización: 2026-03-28 | Fase 24: pentest + corrección de autenticación de la API (D6)_
_Próxima revisión: antes de cualquier despliegue en producción o de la presentación de la solicitud de acreditación ante el HDAB._
