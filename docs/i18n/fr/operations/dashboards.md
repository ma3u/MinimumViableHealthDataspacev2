---
source: docs/operations/dashboards.md
sourceHash: 3d796f92422c1394fef39f33f07d075ac089df13e188171c47f181c797aa358e
language: fr
summary: "Les trois tableaux de bord Grafana du hub en ligne, avec captures : contrats et transferts EDC, la piste d’audit EEDS, et les tests de charge et de stress ; ce que montre chaque ligne, comment la lire et comment se connecter."
---

# Les tableaux de bord

Trois tableaux de bord [Grafana](https://grafana.com/docs/grafana/latest/) montrent ce que fait le hub en production : les contrats et
transferts que négocient les connecteurs, la piste d’audit réglementaire et son
intégrité, et la plateforme pendant un test de charge. Ils fonctionnent sur le Grafana propre du hub
à l’adresse <https://grafana.ehds.mabu.red>, qui fait partie de la pile d’observabilité
de l’[ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md)
(collecteur [OpenTelemetry](https://github.com/open-telemetry/opentelemetry-collector-releases/releases/tag/v0.161.0), [Prometheus](https://prometheus.io/docs/introduction/overview/), [Loki](https://grafana.com/docs/loki/latest/), [Tempo](https://grafana.com/docs/tempo/latest/), Grafana, avec Azure
Monitor et [Log Analytics](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/log-analytics-overview) pour les conteneurs et les journaux des connecteurs).

| Tableau de bord                                                                                                                                        | Id                | Répond à                                                                                                                | Plage par défaut, actualisation |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| [Contrats et transferts EDC](https://grafana.ehds.mabu.red/d/mvhd-edc-dsp/edc-contracts-and-transfers?from=now-90d&to=now&timezone=browser&refresh=1m) | `mvhd-edc-dsp`    | Qu’ont négocié et transféré les connecteurs, qu’est-ce qui a été refusé et pourquoi                                     | 24 heures, 1 minute             |
| [Piste d’audit EEDS](https://grafana.ehds.mabu.red/d/mvhd-ehds-audit/ehds-audit-trail?from=now-30d&to=now&timezone=browser&refresh=1m)                 | `mvhd-ehds-audit` | Les preuves sont-elles intactes, qu’est-ce qui a été enregistré, que copie un auditeur                                  | 24 heures, 1 minute             |
| [Test de charge et de stress](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test)                                                     | `mvhd-load-test`  | Que fait [k6](https://grafana.com/docs/k6/latest/), à quelle vitesse le hub répond-il, quel conteneur sature en premier | 1 heure, 10 secondes            |

**Connexion.** Grafana demande sa propre connexion. Le mot de passe du compte de l’exploitant
est le secret Key Vault `grafana-admin-password` dans
`kv-mvhd-b53a0449` ; celui du compte en lecture seule de l’auditeur est
`keycloak-user-mvhd-auditor-password`. Rien sur ces tableaux de bord ne constitue des
données d’un patient : la piste d’audit ne conserve les questions et les requêtes que sous forme de SHA-256,
et les tests de charge s’exécutent sur des patients synthétiques.

**Quand il n’y a rien à voir.** La pile s’arrête hors des heures de bureau
([ADR-053](../ADRs/ADR-053-everything-stops-off-hours.md)), si bien que les panneaux
qui lisent le proxy ou les connecteurs sont alors vides ; ceux qui lisent
Azure Monitor conservent leur historique. Élargissez la plage temporelle avant de conclure
que rien ne s’est produit ; le panneau **Newest record** indique quand le dernier événement
s’est produit.

**D’où ils proviennent.** Les tableaux de bord sont des fichiers JSON sous
[`observability/grafana/dashboards-azure/`](../../observability/grafana/dashboards-azure/)
(les variantes Azure lisent Azure Monitor et Log Analytics) et
[`observability/grafana/dashboards/`](../../observability/grafana/dashboards/)
(la pile compose lit Prometheus et Loki), générés par
[`observability/grafana/build-dashboards.py`](../../observability/grafana/build-dashboards.py) et provisionnés avec l’application
d’observabilité. Une modification d’un tableau de bord est une modification de son JSON, revue
comme du code.

## Contrats et transferts EDC

![Le tableau de bord Contrats et transferts EDC sur 90 jours : 2 791 négociations demandées et 2 788 finalisées, 2 787 transferts demandés, 2 785 démarrés, 794 refusés faute d’autorisation de traitement de données, un interrompu ; les états des négociations dans le temps avec un pic le 6 octobre, les tests de charge](img/edc-contracts-transfers.jpg)

Chaque négociation de contrat et chaque transfert de données [DSP](https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/), comptés à partir de la chaîne de hachage `dsp`
de la piste d’audit : le hub écrit un enregistrement lorsqu’il sollicite le
connecteur (demandé) ou refuse un transfert faute d’autorisation de traitement de données, et
les rappels des connecteurs écrivent chaque état ultérieur (accepté, finalisé,
démarré, terminé, interrompu). Le tableau de bord est la vue de l’exploitant sur les
mêmes enregistrements que l’auditeur lit sur le tableau de bord de la piste d’audit.

| Ligne                                        | Panneaux                                                                                                | Comment le lire                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Header                                       | What this shows ; **Newest record**                                                                     | L’enregistrement le plus récent de la chaîne, quelle que soit la plage temporelle. « 9 days ago » avec des panneaux vides signifie que rien n’a été négocié depuis : élargissez la plage.                                                                                                                                                                                                                                                                                      |
| Contract negotiations (DSP)                  | Requested, Agreed, Finalized, Terminated or failed ; **Negotiation states** dans le temps               | Requested et Finalized devraient correspondre sur une période calme ; un écart est une négociation qui n’est jamais revenue du connecteur, ce qu’explique la ligne **Connector services**. « Agreed » est un état transitoire et vaut normalement 0.                                                                                                                                                                                                                           |
| Data transfers                               | Requested, Started, Completed, **Refused (no data permit)**, Terminated or failed ; **Transfer states** | Refused, c’est le contrôle qui fonctionne : [art. 61(1)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#061.001), pas d’accès sans autorisation ([art. 68](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_68)). Le parcours de contrat k6 en demande une sans autorisation à dessein, une fois sur quatre, si bien que les refus portent une étiquette _Load test run_ et sont attendus ([#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571)). |
| Refused, terminated and failed, with reasons | Tableau **Not completed**                                                                               | Chaque enregistrement qui n’est pas un succès, avec la raison donnée par le connecteur, les parties et l’exécution à laquelle il appartient.                                                                                                                                                                                                                                                                                                                                   |
| Connector services (EDC)                     | Errors by service, log lines by service, latest connector errors (Log Analytics)                        | Lignes ERROR et SEVERE par service de connecteur, sans les propres erreurs d’export de l’agent OpenTelemetry. Zéro est le cas normal ; les services EDC ne journalisent au niveau INFO qu’au démarrage et en cas de problème, si bien qu’une heure calme est une heure saine.                                                                                                                                                                                                  |

Les chiffres de la capture d’écran sont ceux des tests de charge des 5 et 6 octobre 2026 :
environ 2 800 négociations et transferts en quelques heures, chaque négociation
finalisée, et 794 transferts refusés parce que le parcours les demandait sans
autorisation. « Completed » reste à 0 parce que les plans de données de la démo répondent
par un transfert démarré, sans rappel de fin ; le nombre de transferts dans les
[résultats des tests de charge](../loadtest/README.md) correspond aux transferts démarrés.

![Les lignes inférieures du tableau de bord EDC : le tableau Not completed avec les transferts refusés de l’exécution de stress, chacun avec sa raison et ses parties ; les erreurs et les lignes de journal par service de connecteur sur 90 jours issues de Log Analytics, avec le pic du 15 septembre ; les dernières erreurs des connecteurs](img/edc-contracts-transfers-connectors.jpg)

Les lignes inférieures de la capture d’écran : chaque transfert refusé de l’exécution de stress
avec `did:web:pharmaco.de` comme partie et la raison, et les lignes d’erreur des connecteurs
sur 90 jours, où l’unique pic correspond au jour où la couche d’identité
a été réamorcée.

## Piste d’audit EEDS

![Le tableau de bord Piste d’audit EEDS : les deux chaînes INTACT, 17 540 enregistrements de requêtes et 11 946 enregistrements de contrats et de transferts sur 30 jours, 0 écriture d’audit échouée, 0 requête refusée, 794 transferts refusés ; en dessous, les enregistrements les plus récents de la chaîne des contrats et des transferts avec le hachage, l’exécution, le résultat, les parties, l’heure et le numéro de séquence](img/ehds-audit-trail.jpg)

La piste d’audit réglementaire de l’[ADR-045](../ADRs/ADR-045-observability-and-regulatory-audit-trail.md) :
chaque requête en langage naturel ou fédérée, chaque négociation de contrat et
chaque transfert est un [`AuditEvent`](https://hl7.org/fhir/R4/auditevent.html) FHIR R4, chaîné par hachage au précédent,
et une requête dont l’enregistrement ne peut pas être écrit est refusée. Le tableau de bord s’ouvre
sur le guide de l’auditeur, qu’un auditeur peut suivre sans le projet :

![Le guide de l’auditeur en haut du tableau de bord : ce que demande le règlement, puis sept étapes, de la définition de la période d’audit à la consignation des têtes de chaîne, et la limite connue d’une chaîne qui réside dans la base de données qu’elle protège](img/ehds-audit-trail-guide.jpg)

| Ligne                             | Panneaux                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Comment le lire                                                                                                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auditor guide                     | Le règlement ([art. 61(1)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#061.001), [68](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_68), [73(1)(e)](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#073.001), [9](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_9) ; [RGPD art. 5(2)](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#005.002), [30](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_30)) et sept étapes | La procédure d’un audit, du sélecteur de période au rapport. Suivez-la dans l’ordre.                                                                                                                                                                                                                      |
| Integrity of the evidence         | **Query chain**, Query records, **Contract & transfer chain**, Contract & transfer records, Audit writes failed, Refused queries, Refused transfers                                                                                                                                                                                                                                                                                                      | Les deux chaînes doivent afficher **INTACT** : le proxy recalcule chaque hachage depuis le premier enregistrement à chaque actualisation. **BROKEN** signifie qu’un enregistrement a été modifié, supprimé ou réordonné : arrêtez et faites remonter. Audit writes failed doit valoir 0 ou être expliqué. |
| What was recorded                 | Contract and transfer records by kind ; query records by kind                                                                                                                                                                                                                                                                                                                                                                                            | Le volume dans le temps, par type d’enregistrement ; un test de charge apparaît sous la forme d’un pic étiqueté avec son exécution.                                                                                                                                                                       |
| Records, newest first             | Contract and transfer records ; query records                                                                                                                                                                                                                                                                                                                                                                                                            | Une ligne par enregistrement : accord, ressource et autorisation, indicateur de démo, hachage, exécution du test de charge, résultat, parties, raison, heure, qui l’a signalé, numéro de séquence, objet. Les questions et le Cypher n’apparaissent que sous forme de SHA-256.                            |
| For the audit report: chain heads | Query chain head ; contract & transfer chain head                                                                                                                                                                                                                                                                                                                                                                                                        | Copiez les deux valeurs, nombre d’enregistrements et hachage, dans le rapport d’audit. Lors de l’audit suivant, la chaîne doit toujours avoir la même tête au même numéro d’enregistrement ; sinon, des enregistrements ont été réécrits après coup.                                                      |

Deux choses qu’un auditeur doit savoir, toutes deux sur le tableau de bord lui-même : un enregistrement
marqué **Demo** est du trafic de démonstration, pas une utilisation réelle ; un enregistrement avec un
**Load test run** a été écrit par une exécution k6 contre le hub avec du trafic
synthétique et est compté à part. Et la limite connue ([#418](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/418)) : la chaîne réside dans
Neo4j et prouve l’ordre et l’intégrité, mais une personne disposant d’un accès en écriture à la
base de données pourrait la reconstruire à partir d’un point donné ; comparer les têtes de chaîne entre
deux audits permet de le détecter, et un condensé quotidien signé avec une copie non modifiable est
ce qui comble cette lacune. Les enregistrements bruts sont des `AuditEvent` FHIR à
`/audit/chains/query/events` et `/audit/chains/dsp/events` sur le proxy ;
[`scripts/verify-audit-chain.sh`](../../scripts/verify-audit-chain.sh) recalcule la chaîne en dehors de Grafana.

## Test de charge et de stress

![Le tableau de bord Test de charge et de stress sur l’exécution de stress du 6 octobre 2026 : utilisateurs virtuels passant de 50 à 400, jusqu’à 107 requêtes par seconde, 0 % de requêtes échouées, 0 limitée en débit, le pire contrôle à 84,9 %, 15 091 itérations ; le p95 par type montant à 5,6 secondes pour NLQ, 5,1 secondes pour l’API et 3,7 secondes pour les pages à partir de l’étape à 200 utilisateurs](img/load-stress-test.jpg)

Ce qu’il faut surveiller pendant que k6 s’exécute contre le hub ([#519](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/519)) : la charge que le test
applique, le temps de réponse que voit le client par type et par point de terminaison, la
vue propre du proxy sur la même exécution, et quel conteneur sature en premier. Le
tableau de bord est filtré par l’id **Test run** de l’exécution ([`testid`](https://grafana.com/docs/k6/latest/using-k6/tags-and-groups/)), de sorte que deux exécutions
ne se mélangent jamais ; les liens des [résultats des tests de charge](../loadtest/README.md) ouvrent
chaque exécution sur son propre id et sa propre plage temporelle.

| Ligne                                | Panneaux                                                                                                                                                                                   | Comment le lire                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Load (k6): what the test is doing    | Virtual users, requests / s, **Failed requests**, Rate limited (429), Checks passed (worst check), Iterations ; users and requests over time ; responses by HTTP status                    | Failed est la part des requêtes dont le statut n’était pas celui qu’attendait l’étape ; le [SLO](https://grafana.com/docs/k6/latest/using-k6/thresholds/) est inférieur à 1 %. 429 est la limite de débit, 5xx le hub en échec, 0 une requête restée sans réponse. Le pire contrôle nomme le SLO qui a cédé en premier, « api under 1000 ms » par exemple.         |
| Response time, as the client sees it | **p95 by kind** : pages, API, NLQ, sign-in ; p50, p95 and p99 ; p95 per endpoint ; per endpoint table                                                                                      | Les SLO : pages sous 2 s, API sous 1 s, NLQ sous 3 s. Le tableau des points de terminaison est trié par p95 ; les routes sont nommées par leur motif, jamais par une URL contenant un id.                                                                                                                                                                          |
| Server side: the proxy               | Requests / s by route, p95 by route, responses per minute by status, **audit records per transaction**, errors during the run                                                              | Mesuré dans le proxy ; la différence avec le p95 côté client correspond à l’UI et au réseau. Plus d’un enregistrement d’audit par transaction signifie que l’écrivain par lots absorbe la charge (hypothèse 2 du runbook) ; à 1, chaque requête attend sa propre transaction.                                                                                      |
| Azure: who saturates first           | CPU and memory as % of each app's limit, replicas, restarts, [Postgres](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-compute) burst credits (Azure Monitor) | Neo4j à 100 % de CPU est le plafond ; Neo4j proche de 100 % de mémoire finit par un arrêt pour manque de mémoire (code de sortie 137) ; des réplicas en hausse, c’est [la règle de mise à l’échelle](https://learn.microsoft.com/en-us/azure/container-apps/scale-app) ; des crédits Postgres inférieurs à environ 10 ralentissent tout ce qui partage le serveur. |

![La ligne côté serveur de la même exécution : requêtes par seconde par route sur le proxy, la chaîne d’audit et les routes des tâches et de NLQ ; p95 par route avec deux pics à 5 secondes ; les réponses du proxy par minute, toutes en 200 et 201 ; enregistrements d’audit par transaction entre 1 et 7](img/load-stress-test-server.jpg)

![La ligne Azure de la même exécution : CPU en part de la limite de chaque application, avec l’UI à 99 % à partir de l’étape à 400 utilisateurs, le proxy à 48 %, Neo4j à 35 % ; mémoire avec Neo4j à 74 % ; trois réplicas de l’UI ; aucun redémarrage ; crédits de rafale Postgres à 39](img/load-stress-test-containers.jpg)

Les captures d’écran correspondent à `20261006-2140-stress-aca`, l’exécution qui a atteint 400 utilisateurs
sans aucune requête échouée et a déplacé le plafond vers le CPU de l’UI. Comment lire un
résultat hypothèse par hypothèse, et ce que chaque chiffre a signifié pour les décisions de
dimensionnement ([ADR-056](../ADRs/ADR-056-neo4j-grows-to-2-vcpu-and-4-gib.md),
[ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md)), figure dans le
[runbook](../knowledge/runbooks/load-and-stress-test.md).

## Maintenir les captures d’écran à jour

Les captures d’écran de cette page ont été prises le 2026-10-16 depuis le Grafana en production
en mode kiosque (`&kiosk` dans l’URL masque l’habillage), à 1600 sur 1200
pixels. Un tableau de bord qui change reçoit une nouvelle capture d’écran de la même manière ; les
fichiers se trouvent dans [`docs/operations/img/`](img/) et le générateur de contenu les copie
vers le hub.
