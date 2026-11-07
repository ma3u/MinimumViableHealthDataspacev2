---
source: docs/loadtest/2026-10-production-readiness.md
sourceHash: e4bba5749b0d00cb2da2c23f840ccb992cfd0ea64f64a7dce4327cbf887315ab
language: fr
summary: "L’évaluation Well-Architected et Cloud Adoption au 16 octobre 2026 : ce qui est en place par pilier, avec les preuves, ce qui reste ouvert, les scores et ce qui sépare le démonstrateur d’une plateforme exploitable."
---

# Évaluation de la préparation à la production, octobre 2026

[Well-Architected Framework (WAF)](https://learn.microsoft.com/en-us/azure/well-architected/pillars) et [Cloud Adoption Framework (CAF)](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/), appliqués
au hub d’intégration EEDS tel qu’il fonctionne sur [Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/overview) le 2026-10-16.
Chaque pilier indique ce qui est en place, avec les preuves, et ce qui reste
ouvert. Les notes sont l’appréciation propre du projet sur une échelle de dix points ; rien
de tout cela n’est un audit indépendant. Le WAF compte cinq piliers ; la durabilité n’en fait pas partie : c’est le
[guide de durabilité](https://learn.microsoft.com/en-us/azure/well-architected/sustainability/) distinct de Microsoft pour les charges de travail, évalué ici à côté.

| Pilier                                                                                                                | Note     | En une ligne                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WAF : [Excellence opérationnelle](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/)   | 7/10     | Déploiement à chaque fusion, traçage et journaux structurés, seize runbooks ; pas de règles d’alerte, pas d’astreinte                                                                                                 |
| WAF : [Sécurité](https://learn.microsoft.com/en-us/azure/well-architected/security/)                                  | 8/10     | Testé par le projet, neuf constats sur dix clos ; pas de test indépendant                                                                                                                                             |
| WAF : [Fiabilité](https://learn.microsoft.com/en-us/azure/well-architected/reliability/)                              | 6/10     | 400 utilisateurs sans aucune requête échouée, contrôles de santé partout, Postgres géré avec restauration ; Neo4j sur un seul nœud, sans sauvegarde                                                                   |
| WAF : [Efficacité des performances](https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/) | 7/10     | Dimensionné à partir de mesures, 50 utilisateurs dans chaque SLO ; 200 utilisateurs pas encore                                                                                                                        |
| WAF : [Optimisation des coûts](https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/)           | 7/10     | Tout s’arrête hors des heures de bureau, coût pour 1 000 requêtes mesuré ; pas de ventilation des coûts par locataire                                                                                                 |
| Durabilité (guide distinct, pas un pilier du WAF)                                                                     | 6/10     | La pile fonctionne un tiers de la semaine ; pas de choix tenant compte du carbone                                                                                                                                     |
| CAF : [Stratégie et plan](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/strategy/)                 | 8/10     | Les rôles de l’EEDS, les normes du BSI et soixante décisions ([ADR-001](../ADRs/ADR-001-postgresql-neo4j-split.md) à [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)) consignés par écrit ; pas de SLA |
| CAF : [Gouverner et gérer](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/govern/)                  | 6/10     | Politique de conservation, piste d’audit, délais d’incident ; pas de SOC, pas d’équipe d’incident nommément désignée                                                                                                  |
| **Global**                                                                                                            | **7/10** | **Un démonstrateur mesuré. Pas une plateforme exploitable pour des données réelles ; l’écart est listé à la fin.**                                                                                                    |

La plateforme évaluée : le hub et ses connecteurs sur Azure Container Apps dans
`rg-mvhd-dev`, West Europe, 21 applications et 9 tâches. PostgreSQL sur un Flexible
Server ([ADR-041](../ADRs/ADR-041-managed-postgres-on-azure-containerised-locally.md)),
Neo4j Community à 2 vCPU et 4 GiB ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md)),
l’UI sur des cœurs entiers avec jusqu’à six réplicas ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)),
Vault avec son état sur le Flexible Server ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)),
arrêtés hors des heures de bureau ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md),
[ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)). Les
chiffres de charge sont les exécutions de [l’index des résultats](README.md) ; l’état
de la sécurité est le [rapport de tests de sécurité du 2026-10-15](../security/security-test-report-2026-10-15.md) ;
la manière dont la plateforme doit être exploitée en conditions réelles est décrite dans le
[guide d’exploitation](../security/operational-guideline.md).

## Pilier WAF 1 : Excellence opérationnelle, 7/10

En place :

- Une fusion dans main déploie sur Azure ([`deploy-azure.yml`](../../.github/workflows/deploy-azure.yml)) ; le déploiement attend
  tant qu’un test de charge s’exécute et fixe les adresses des connecteurs à chaque exécution. Le
  contrôle de PR, les workflows de test, de sécurité et [CodeQL](https://docs.github.com/en/code-security/codeql-cli) s’exécutent à chaque pull request,
  les suites de conformité après les modifications de main ; [`demo-smoke.yml`](../../.github/workflows/demo-smoke.yml) exécute [Bruno](https://www.usebruno.com/), [Playwright](https://playwright.dev/) et [ZAP](https://www.zaproxy.org/) contre le
  hub en production.
- Collecteur [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-collector-releases/releases/tag/v0.161.0), [Prometheus](https://prometheus.io/docs/introduction/overview/), [Loki](https://grafana.com/docs/loki/latest/), [Tempo](https://grafana.com/docs/tempo/latest/) et [Grafana](https://grafana.com/docs/grafana/latest/)
  ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)) ;
  le proxy est tracé ([`src/tracing.ts`](../../services/neo4j-proxy/src/tracing.ts)) et journalise en JSON structuré avec
  l’appelant et l’exécution sur chaque ligne ([`pino`](https://getpino.io/)) ; chaque enregistrement d’audit porte son
  exécution. Journaux dans Azure Monitor pendant 30 jours.
- Vault conserve son état d’un redémarrage à l’autre, localement dans un fichier et sur Azure dans une
  base de données sur le Flexible Server avec un sidecar de descellement ([ADR-046](../ADRs/ADR-046-vault-keeps-its-state-on-the-flexible-server.md)).
- Seize runbooks sous [`docs/knowledge/runbooks/`](../knowledge/runbooks/) : déploiement, amorçage, dérive du
  realm, reprise de Postgres, hors des heures de bureau, test de charge et de stress, la chaîne d’audit,
  la connexion de Klarbefund.
- Chaque image comporte un [`HEALTHCHECK`](https://docs.docker.com/reference/dockerfile/#healthcheck) ; les robots d’indexation exposent `/metrics` et sont
  contrôlés sur ce point ; les phases d’amorçage peuvent être reprises.
- La documentation est publiée depuis le dépôt et vérifiée en
  pre-commit, de sorte que la documentation ne peut pas diverger des fichiers.

Ouvert :

- Pas de règles d’alerte. Le tableau de bord de charge, la chaîne d’audit et les crédits de rafale
  Postgres sont lus par une personne ; personne n’est alerté.
- Pas de modèle d’astreinte et pas d’exploitant nommément désigné ; le guide d’exploitation
  décrit les rôles, le projet ne peut pas les pourvoir.
- Pas d’indicateurs de fonctionnalité au-delà des commutateurs de la démo.

## Pilier WAF 2 : Sécurité, 8/10

En place :

- Le [rapport de tests de sécurité du 2026-10-15](../security/security-test-report-2026-10-15.md) :
  CodeQL, [Semgrep](https://github.com/semgrep/semgrep/releases/tag/v1.176.0), [grype](https://github.com/anchore/grype/releases/tag/v0.118.0), npm audit, [trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0), [gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), [hadolint](https://github.com/hadolint/hadolint), [shellcheck](https://www.shellcheck.net/),
  les tests de posture de l’application et 46 contrôles anonymes en boîte noire du hub en production.
  Dix constats ; neuf clos, un examiné et accepté (la clé de développement
  publiée de la pile compose locale ; Azure prend ses clés dans
  Vault).
- Le [modèle de menaces du hub](../security/threat-model.md) et
  [celui de l’application](../security/threat-model-klarbefund.md), chaque mesure d’atténuation
  nommant le code ou le test qui la démontre ; une nomenclature logicielle [CycloneDX](https://cyclonedx.org/) par
  partie déployable ([SBOM](../sbom/README.md)), vérifiée par rapport aux fichiers de verrouillage.
- Chaque route d’API exige une session ([ADR-044](../ADRs/ADR-044-every-api-route-needs-a-session.md)) ;
  qui voit l’identité d’un patient est décidé par le rôle, jamais par un paramètre
  de requête ; l’UI lit le graphe directement et le proxy dessert les plans
  de données ([ADR-043](../ADRs/ADR-043-graph-access-direct-or-through-the-proxy.md)).
- Limites de débit dans le proxy, par utilisateur et par participant, mesurées sous
  charge ; k-anonymat avec une cohorte minimale de cinq dans la
  configuration du proxy.
- Les secrets de l’exploitant sont des références Key Vault ([ADR-036](../ADRs/ADR-036-operator-secrets-in-key-vault.md)) ;
  le `NEXTAUTH_SECRET` de production a fait l’objet d’une rotation ; les clés des participants résident dans Vault.
- Keycloak : événements de connexion conservés sept jours, le périmètre du client de l’UI limité aux
  sept rôles de l’EEDS, la console d’administration hors d’Internet, chaque rôle privilégié
  derrière la protection de la console. L’application se verrouille avec Face ID ou le code d’accès
  ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)).
- Seuls le hub et Keycloak disposent d’un ingress public ; tout le reste est interne
  à l’environnement.
- La [politique de conservation des audits](../audit-retention-policy.md) : dix ans pour
  les enregistrements d’accès, de transfert, de contrat et d’autorisation, deux ans pour les connexions et
  les journaux de périphérie, appliquée par `/api/admin/audit/retention`, qui ne peut pas détruire
  l’unique copie.

Ouvert :

- Pas de test d’intrusion indépendant du hub et pas de test [TR-03161](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TR03161/TR-03161-1.pdf?__blob=publicationFile&v=2) de l’application ;
  la dernière section du rapport indique ce que chacun apporterait.
- Pas de mTLS entre les applications et pas de points de terminaison privés ; le guide exige les deux
  avant des données réelles.
- Neo4j n’a qu’un seul utilisateur de base de données ; l’accès est contrôlé dans le hub et le proxy.
- La rotation des secrets est consignée par écrit, mais pas planifiée.
- Les comptes de l’exploitant et `edcadmin` ne disposent de mots de passe générés dans Key Vault
  qu’une fois que [`scripts/azure/secure-accounts.sh`](../../scripts/azure/secure-accounts.sh) a été exécuté sur le realm de production.

## Pilier WAF 3 : Fiabilité, 6/10

En place :

- L’exécution de stress du 2026-10-06 a atteint 400 utilisateurs avec 0 requête échouée sur
  81 518, à 63,6 requêtes par seconde ; rien n’a redémarré. À 50 utilisateurs, chaque
  SLO est respecté.
- Chaque image dispose d’un contrôle de santé dont sont issues les [sondes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes) de Container Apps ; le
  proxy se vide proprement sur `SIGTERM` ; chaque appel sortant a un délai d’expiration ; `/api/tasks`
  répond depuis son magasin lorsque le connecteur échoue et le signale.
- PostgreSQL sur le Flexible Server conserve sept jours de [restauration à un instant](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-backup-restore)
  donné ; le realm, les contrats et le magasin de tâches s’y trouvent. L’état de
  Vault s’y trouve aussi.
- Les vues du graphe sont limitées aux 30 événements d’accès les plus récents, ce qui a supprimé
  la seule requête capable de faire tomber l’UI.
- Un déploiement ne peut pas intervenir au milieu d’une exécution de charge.

Ouvert :

- Neo4j est un seul nœud Community sur Azure Files, sans sauvegarde. Ses données sont
  aujourd’hui des données synthétiques réamorçables ; avant toute donnée réelle, le guide exige
  Neo4j Enterprise ou un graphe géré avec des sauvegardes testées chaque trimestre.
- Pas de disjoncteur ; un connecteur lent n’est borné que par des délais d’expiration.
- À partir de 200 utilisateurs, les SLO de latence cèdent sur le CPU de l’UI. La nouvelle taille de l’UI
  ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)) est appliquée par `scripts/azure/size-ui.sh` et pas encore mesurée.
- Les pages des connecteurs n’ont effectué aucun travail réel lors des exécutions jusqu’ici (l’UI appelait
  l’API de gestion à une mauvaise adresse, fixée depuis) ; la prochaine exécution `load`
  sera la première avec des contrats et des transferts sous charge.
- Pas d’ingénierie du chaos ; les exécutions de stress en sont ce qui s’en rapproche le plus.

## Pilier WAF 4 : Efficacité des performances, 7/10

En place :

- Mesuré, pas deviné : le plafond est passé de la mémoire de Neo4j au CPU de l’UI
  en une journée d’exécutions, et chaque taille a été décidée à partir de la mesure
  ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md) pour Neo4j, [ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md) pour l’UI, avec la
  [scalabilité par composant](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md#scalability-per-component)).
- À 50 utilisateurs : p95 de l’API 155 ms, pages 43 ms, NLQ 217 ms, 21,5 requêtes par
  seconde. `/api/graph` dans le SLO après la limitation et le redimensionnement.
- Neo4j à 2 vCPU et 4 GiB, tas de 1,5 GiB, cache de pages de 1 GiB ; des index pour
  chaque chemin de requête FHIR dans [`neo4j/init-schema.cypher`](../../neo4j/init-schema.cypher) (plus de 70, dont trois
  index vectoriels).
- L’écrivain par lots de la chaîne d’audit absorbe la charge d’écriture ; les requêtes auditées ne
  constituent pas un plafond (434 ms au p95 à environ 16 par seconde).
- Next.js compresse ses réponses ; la démo statique est servie par GitHub
  Pages.

Ouvert :

- Pas de cache de réponses sur le catalogue ni sur la vue d’ensemble ; pas de compression dans le
  proxy.
- 200 utilisateurs dans les SLO est l’objectif de la prochaine exécution `stress`, après
  `size-ui.sh` ; le p95 par étape va dans le tableau de l’[ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md).
- Pas de CDN devant le hub en production.

## Pilier WAF 5 : Optimisation des coûts, 7/10

En place :

- Tout s’arrête à 18:13 UTC et démarre à 05:17 UTC les jours ouvrés,
  déclenché par Azure en tant qu’identité managée ; environ 65 heures de bureau par semaine. La
  décision a suivi un mois facturé 741 € pour une estimation de 426 € pour
  une pile fonctionnant 24 heures sur 24 ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)).
- Règles de mise à l’échelle de Container Apps : l’UI selon une règle de concurrence HTTP de 15, d’un
  à six réplicas ; tout à zéro hors des heures de bureau.
- Le coût d’une requête est connu : au prix catalogue, les applications qui servent une requête
  coûtent environ 0,60 $ de l’heure, soit environ **0,01 $ pour 1 000 requêtes à 50 utilisateurs**
  ([ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md), d’après `20261006-2115-load-aca`) ; une exécution de stress de 20 minutes avec six réplicas de l’UI
  ajoute environ 0,22 $.
- Des garde-fous de coûts surveillent le total ([`cost-guards.yml`](../../.github/workflows/cost-guards.yml)).

Ouvert :

- Un groupe de ressources, une facture : pas de ventilation des coûts par locataire ni par rôle.
- Le coût pour 1 000 requêtes issu de [Cost Management](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/overview-cost-management) sur une fenêtre de `soak` reste
  à relever.

## Durabilité, 6/10 (guide distinct, pas un pilier du WAF)

Évaluée selon le [guide de Microsoft pour des charges de travail durables](https://learn.microsoft.com/en-us/azure/well-architected/sustainability/),
qui se trouve à côté des cinq piliers du WAF et n’en fait pas partie.

En place :

- La pile fonctionne un tiers de la semaine ([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md), [ADR-058](../ADRs/ADR-058-azure-triggers-the-off-hours-schedule.md)).
- L’utilisation des ressources est visible : la ligne des conteneurs du tableau de bord de charge, Cost
  Management.
- La seule requête gaspilleuse, la vue du graphe non limitée, a disparu.

Ouvert :

- West Europe, aucun signal carbone dans le planning ni dans le choix de la région.

## CAF

**Stratégie et plan, 8/10.** La motivation réglementaire est consignée article par article
(règlement (UE) [2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng) dans sa numérotation adoptée) ; le
[guide d’exploitation](../security/operational-guideline.md) indique quel
rôle de l’EEDS exploite quelle partie et ce que [BSI C5](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/CloudComputing/ComplianceControlsCatalogue/2020/C5_2020.pdf?__blob=publicationFile&v=5), [IT-Grundschutz](https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/IT-Grundschutz/IT-Grundschutz-Kompendium/it-grundschutz-kompendium_node.html), [TR-02102](https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/Publications/TechGuidelines/TG02102/BSI-TR-02102-1.pdf?__blob=publicationFile&v=15) et
TR-03161 exigent de chacune ; soixante [ADR](../ADRs/), de l’[ADR-001](../ADRs/ADR-001-postgresql-neo4j-split.md) à l’[ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md), consignaient les décisions au 2026-10-16 ; l’index de planification
suit le travail. Ouvert : un SLA formel pour les participants, que le guide
place dans le contrat de service de l’exploitant.

**Préparer, 7/10.** Azure à partir d’une fusion ; la pile locale en une commande compose ;
les phases d’amorçage reprenables ; un Dockerfile par partie avec sa nomenclature
logicielle. Ouvert : l’environnement propre de l’exploitant, qui n’existe pas encore.

**Adopter, 7/10.** Les contrôles [DSP 2025-1](https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/), [DCP](https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/) et EEDS propres au hub ([`run-ehds-dataspace-checks.sh`](../../scripts/run-ehds-dataspace-checks.sh), [`run-ehds-identity-checks.sh`](../../scripts/run-ehds-identity-checks.sh), [`run-ehds-tests.sh`](../../scripts/run-ehds-tests.sh))
s’exécutent après les modifications de main, une fois par nuit depuis l’[ADR-074](../ADRs/ADR-074-e2e-and-compliance-suites-run-nightly-when-main-changed.md) ; ce ne sont pas
les TCK d’Eclipse, [DSP TCK](https://github.com/eclipse-dataspacetck/dsp-tck) et [DCP TCK](https://github.com/eclipse-dataspacetck/dcp-tck), dont aucun n’a encore été exécuté ; la collection Bruno vérifie chaque route par persona
([ADR-031](../ADRs/ADR-031-checks-must-assert.md), [ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md)) ;
le 2026-10-15, le [rapport de test de sécurité](../security/security-test-report-2026-10-15.md) comptait 2 488 tests unitaires de l’UI et 419 tests Swift. Ouvert : l’ingénierie
du chaos, et une répétition de la migration de Neo4j 5 vers 2025
([ADR-030](../ADRs/ADR-030-neo4j-2025-lts-migration.md)).

**Gouverner et gérer, 6/10.** La politique de conservation et la piste d’audit
inviolable existent ([ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)) ; les délais d’incident du RGPD et de NIS2 et qui
détient chacun d’eux figurent dans le guide ([section 7](../security/operational-guideline.md#7-incidents-clocks-and-who-notifies-whom)) ; les rôles de l’EEDS ont leur
liste de contrôle de mise en service ([section 10](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)). Ouvert : un SLA et son tableau de bord, un plan de réponse
aux incidents avec une équipe nommément désignée, une gestion des changements au-delà des pull requests,
la ventilation des coûts par locataire, un test indépendant.

## Ce qui sépare le démonstrateur d’une plateforme exploitable

L’écart ne se situe plus dans le code ; il se situe dans l’exploitation, et la
[liste de contrôle du guide](../security/operational-guideline.md#10-before-go-live-the-checklist-by-role)
le présente par rôle de l’EEDS. Les éléments que le projet peut encore réaliser lui-même :

| #   | Élément                                                                                                                                                            | Pilier                    | Suivi dans                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `stress` après `size-ui.sh`, puis `spike`, `soak` et `signin` ; le p95 par étape dans l’[ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)             | Performances, Fiabilité   | [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571)                                                                                                |
| 2   | Règles d’alerte sur le tableau de bord de charge et sur la chaîne d’audit, et qui est alerté                                                                       | Excellence opérationnelle | ouvert                                                                                                                                                                   |
| 3   | Une sauvegarde de Neo4j, ou Neo4j Enterprise ou un graphe géré, avant toute donnée non synthétique                                                                 | Fiabilité                 | [guide, section 2](../security/operational-guideline.md#2-hosting-architecture-from-the-demo-to-an-operable-platform)                                                    |
| 4   | Compression et un cache court sur les réponses du catalogue et de la vue d’ensemble                                                                                | Performances              | ouvert                                                                                                                                                                   |
| 5   | Rotation planifiée des secrets : les clients Keycloak, le service de comptes, le jeton du catalogue                                                                | Sécurité                  | [guide, section 2](../security/operational-guideline.md#2-hosting-architecture-from-the-demo-to-an-operable-platform)                                                    |
| 6   | Un test d’intrusion indépendant du hub et un test TR-03161 de l’application                                                                                        | Sécurité                  | [#655](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/655)                                                                                                |
| 7   | Comptes de l’exploitant et `edcadmin` avec des mots de passe générés dans Key Vault ([`scripts/azure/secure-accounts.sh`](../../scripts/azure/secure-accounts.sh)) | Sécurité                  | [#671](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/671) a ajouté le script ; l’exécuter sur le realm en production reste à faire                         |
| 8   | Un SLA avec son tableau de bord, et le plan de réponse aux incidents avec une équipe nommément désignée                                                            | Gouverner et gérer        | guide, sections [7](../security/operational-guideline.md#7-incidents-clocks-and-who-notifies-whom) et [8](../security/operational-guideline.md#8-operating-the-platform) |
