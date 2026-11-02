---
source: docs/security/bsi-c5-gap-analysis.md
sourceHash: 09e0d014903c7a9c94c0d15df0d72be1ab532ba429c5804bcaf34cc64d921295
language: fr
---

# Analyse des écarts BSI C5 : hub d’intégration EEDS

**Référentiel** : catalogue de critères de conformité du cloud computing du BSI (C5:2020)
**Pertinence** : l’art. 50(6) de l’EEDS exige que les espaces de données approuvés par l’organisme responsable de l’accès aux données de santé (HDAB) satisfassent au C5 ou à un équivalent.
**Périmètre** : évaluation de démonstration/MVP. Un audit complet de production requiert un auditeur C5 accrédité.

---

## Légende des statuts

| Symbole | Signification                                     |
| ------- | ------------------------------------------------- |
| ✅      | Implémenté (démonstration)                        |
| 🟡      | Partiellement implémenté                          |
| ⚠️      | Risque accepté pour la démonstration              |
| ❌      | Non applicable ou non implémenté                  |
| 🔵      | Uniquement dans la feuille de route de production |

---

## Domaines de contrôle C5

### OIS : Sécurité organisationnelle et de l’information

| Contrôle | Exigence                   | Statut démo | Écart / Atténuation                              |
| -------- | -------------------------- | ----------- | ------------------------------------------------ |
| OIS-01   | Politique de SI documentée | ✅          | Le présent document + modèle de menaces          |
| OIS-02   | Rôles de SI attribués      | ⚠️          | Personas fictifs uniquement ; pas de RSSI réel   |
| OIS-03   | Appréciation des risques   | ✅          | threat-model.md + analyse STRIDE                 |
| OIS-04   | Inventaire des actifs      | ✅          | Actifs listés dans le modèle de menaces          |
| OIS-05   | Sécurité des fournisseurs  | ⚠️          | Neo4j, Keycloak, NATS : pas évalués formellement |

### CCM : Gestion des changements

| Contrôle | Exigence                          | Statut démo | Écart / Atténuation                                     |
| -------- | --------------------------------- | ----------- | ------------------------------------------------------- |
| CCM-01   | Processus de changement documenté | ✅          | Workflow Git + revues de PR                             |
| CCM-02   | Revue de sécurité des changements | 🟡          | Cette phase ajoute des contrôles de sécurité dans la CI |
| CCM-03   | Plan de retour arrière            | ✅          | Git revert + tags d’images Docker                       |

### DEV : Sécurité du développement (la plus pertinente pour le code)

| Contrôle | Exigence                          | Statut démo | Écart / Atténuation                                         |
| -------- | --------------------------------- | ----------- | ----------------------------------------------------------- |
| DEV-01   | Directives de codage sécurisé     | ✅          | `.claude/rules/code-style.md`                               |
| DEV-02   | Validation des entrées            | ✅          | Requêtes Cypher paramétrées                                 |
| DEV-03   | Encodage des sorties              | 🟡          | Échappement automatique par React ; CSP ajoutée en D2       |
| DEV-04   | Application de l’authentification | ✅          | NextAuth + Keycloak OIDC                                    |
| DEV-05   | Gestion des dépendances           | ✅          | `npm audit --audit-level=high` dans la CI                   |
| DEV-06   | Analyse statique                  | 🟡          | ESLint + TypeScript strict ; pas encore d’outil SAST        |
| DEV-07   | Aucun identifiant codé en dur     | ✅          | Variables d’environnement uniquement ; requêtes paramétrées |
| DEV-08   | Détection de secrets              | ⚠️          | Pas encore de `detect-secrets` ni de `gitleaks` dans la CI  |
| DEV-09   | Tests de sécurité                 | ✅          | Tests E2E SEC-01–SEC-10 (D3)                                |
| DEV-10   | Divulgation des vulnérabilités    | ⚠️          | Pas encore de SECURITY.md ni de politique CVD               |

### IAM : Gestion des identités et des accès

| Contrôle | Exigence                            | Statut démo | Écart / Atténuation                                                                                                                                      |
| -------- | ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAM-01   | Authentification requise            | ✅          | Toutes les routes (UI + API) exigent une session ; le pentest D6 a ajouté des gardes getServerSession à toutes les routes /api/admin/_ et /api/patient/_ |
| IAM-02   | Contrôle d’accès basé sur les rôles | ✅          | 7 rôles Keycloak + middleware                                                                                                                            |
| IAM-03   | Moindre privilège                   | 🟡          | Matrice des rôles implémentée ; pas d’ABAC à granularité fine                                                                                            |
| IAM-04   | MFA pour les comptes à privilèges   | ⚠️          | MFA Keycloak non configurée dans la démonstration                                                                                                        |
| IAM-05   | Gestion des sessions                | ✅          | Sessions NextAuth + NEXTAUTH_SECRET                                                                                                                      |
| IAM-06   | Cycle de vie des identifiants       | ⚠️          | Les identifiants de démonstration sont statiques                                                                                                         |
| IAM-07   | Gestion des accès à privilèges      | ⚠️          | Rôle d’administration via Keycloak uniquement ; pas de système PAM                                                                                       |

### COS : Sécurité des communications

| Contrôle | Exigence                       | Statut démo            | Écart / Atténuation                                                       |
| -------- | ------------------------------ | ---------------------- | ------------------------------------------------------------------------- |
| COS-01   | Chiffrement en transit         | ✅ (local) / 🔵 (prod) | HTTPS en production ; HTTP sur localhost acceptable pour le développement |
| COS-02   | Configuration TLS robuste      | ⚠️                     | Non validée ; dépend du proxy inverse                                     |
| COS-03   | Gestion des certificats        | 🔵                     | Production uniquement : rotation des certificats via Let's Encrypt        |
| COS-04   | Segmentation du réseau interne | ⚠️                     | Isolation réseau Docker uniquement                                        |

### DIP : Intégrité et protection des données

| Contrôle | Exigence                   | Statut démo | Écart / Atténuation                                        |
| -------- | -------------------------- | ----------- | ---------------------------------------------------------- |
| DIP-01   | Classification des données | ✅          | Tableau des actifs du modèle de menaces                    |
| DIP-02   | Chiffrement au repos       | ⚠️          | Données Neo4j non chiffrées au repos dans la démonstration |
| DIP-03   | Sauvegarde et restauration | ⚠️          | Pas de sauvegarde du volume Neo4j dans la démonstration    |
| DIP-04   | Minimisation des données   | ✅          | FHIR ne renvoie que les champs demandés                    |
| DIP-05   | Journalisation d’audit     | ✅          | Nœuds `TransferEvent`, écrits par le neo4j-proxy           |
| DIP-06   | Intégrité des journaux     | ⚠️          | Les journaux sont modifiables dans Neo4j                   |

### LOG : Journalisation et surveillance

| Contrôle | Exigence                           | Statut démo | Écart / Atténuation                                          |
| -------- | ---------------------------------- | ----------- | ------------------------------------------------------------ |
| LOG-01   | Événements de sécurité journalisés | 🟡          | Journaux d’accès via Neo4j ; pas de SIEM                     |
| LOG-02   | Conservation des journaux          | ⚠️          | Pas de politique de conservation ; uniquement liée au volume |
| LOG-03   | Alertes sur les anomalies          | ❌          | Pas d’alertes dans la démonstration                          |
| LOG-04   | Contrôle d’accès aux journaux      | ⚠️          | L’administrateur Neo4j peut modifier les journaux            |

### INS : Gestion des incidents

| Contrôle | Exigence                                 | Statut démo | Écart / Atténuation                                |
| -------- | ---------------------------------------- | ----------- | -------------------------------------------------- |
| INS-01   | Plan de réponse aux incidents            | ⚠️          | Non documenté                                      |
| INS-02   | Classification des incidents de sécurité | ⚠️          | Non définie                                        |
| INS-03   | Processus de notification des violations | ⚠️          | L’art. 33 du RGPD exige une notification sous 72 h |

---

## Plan prioritaire de résorption des écarts

### Phase de démonstration (à implémenter maintenant)

| Priorité | Contrôle | Action                                                             | Ticket                          |
| -------- | -------- | ------------------------------------------------------------------ | ------------------------------- |
| P0       | DEV-07   | Cypher paramétré (D1)                                              | ✅ Fait : phase 23              |
| P0       | DEV-03   | CSP + en-têtes de sécurité (D2)                                    | ✅ Fait : phase 23              |
| P0       | DEV-09   | Tests E2E de sécurité (D3)                                         | ✅ Fait : phase 23              |
| P0       | DEV-05   | npm audit dans la CI (D4)                                          | ✅ Fait : phase 23              |
| P1       | DEV-08   | Ajouter un hook pre-commit `detect-secrets`                        | GitHub #4 : D5                  |
| P1       | DEV-10   | Créer SECURITY.md + politique CVD                                  | GitHub #4 : D8                  |
| P1       | IAM-01   | Vérifier que toutes les routes d’API contrôlent l’authentification | ✅ Fait : phase 24 (pentest D6) |

### Feuille de route de production

| Priorité | Contrôle  | Action                                                       |
| -------- | --------- | ------------------------------------------------------------ |
| P0       | COS-01/02 | TLS 1.3 + HSTS + rotation des certificats                    |
| P0       | IAM-04    | MFA pour EDC_ADMIN + HDAB_AUTHORITY                          |
| P0       | DIP-02    | Chiffrement du disque Neo4j                                  |
| P1       | DEV-06    | SAST (CodeQL ou Semgrep) dans la CI                          |
| P1       | DEV-08    | gitleaks dans la CI + pre-commit                             |
| P1       | LOG-01    | Intégration SIEM (OpenSearch / Loki)                         |
| P1       | LOG-03    | Alertes sur les échecs d’authentification / accès anormaux   |
| P2       | INS-01    | Runbook de réponse aux incidents                             |
| P2       | DIP-06    | Journal d’audit en ajout seul (Neo4j Enterprise ou Kafka)    |
| P2       | IAM-03    | ABAC via des politiques OPA                                  |
| P2       | DSP       | Messages de contrat signés par DID selon DSP §5.3            |
| P2       | DCP       | Contrôles de signature, d’expiration et de révocation des VC |

---

## Correspondance avec la réglementation EEDS

| Article de l’EEDS | Exigence                                 | Contrôles C5      | Statut démo                |
| ----------------- | ---------------------------------------- | ----------------- | -------------------------- |
| Art. 3(1)         | Droit du patient d’accéder aux données   | IAM-01, IAM-03    | ✅ Routes /patient/\*      |
| Art. 6            | Exactitude des données                   | DIP-04, DIP-05    | 🟡                         |
| Art. 10           | Consentement à l’utilisation secondaire  | IAM-02, DIP-01    | ✅ Nœuds de politique ODRL |
| Art. 45           | Approbation HDAB requise                 | IAM-02            | ✅ Nœuds HDABApproval      |
| Art. 50(6)        | C5 ou équivalent requis                  | Tous les domaines | 🟡 Démo partielle          |
| Art. 51           | Piste d’audit                            | LOG-01, DIP-05    | 🟡                         |
| RGPD, art. 25     | Protection des données dès la conception | DIP-04, IAM-03    | 🟡                         |
| RGPD, art. 32     | Mesures techniques de sécurité           | COS-01, DIP-02    | ⚠️                         |

---

_Dernière mise à jour : 2026-03-28 | Phase 24 : pentest + correctif d’authentification API (D6)_
_Prochaine revue : avant tout déploiement en production ou toute soumission en vue d’une accréditation HDAB._
