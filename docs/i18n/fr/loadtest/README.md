---
source: docs/loadtest/README.md
sourceHash: 9b7e7f5dd475758fc226e0d982b2c501af4ad553de56333c6de01c2760ad9ecf
language: fr
---

# Tests de charge, de stress et de pic : résultats et tableaux de bord

Ce que fait sous charge le hub en production à l’adresse https://ehds.mabu.red, mesuré avec la
suite k6 de [`load-tests/`](../../load-tests/) et enregistré sur le
Grafana de la plateforme. Cette page en est l’index : chaque exécution, ce qu’elle a révélé, ce qui a changé
en conséquence, et les exécutions qui restent à faire. Les rapports détaillés sont liés, et
chaque exécution en production a son lien vers le tableau de bord.

Les tableaux de bord nécessitent une connexion sur <https://grafana.ehds.mabu.red> et n’affichent
des données que lorsque la pile est en marche (elle s’arrête hors des heures de bureau, ADR-053). Chaque lien
ouvre le tableau de bord **Test de charge et de stress** sur le `testid` et la plage temporelle de l’exécution ;
les synthèses k6 brutes se trouvent sur l’ordinateur portable qui les a exécutées
(`load-tests/results/<testid>*`) et dans les tickets.

| Scénario    | Ce qu’il fait                                                       | Dernière exécution en production | Résultat                                                                                             |
| ----------- | ------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `smoke`     | 1 utilisateur, 30 s, chaque point de terminaison une fois           | 2026-10-05                       | réussit                                                                                              |
| `load`      | 50 utilisateurs, 15 min, le mélange de personas                     | 2026-10-06, 21:15                | **respecte chaque SLO** : p95 155 ms API, 43 ms pages, 217 ms NLQ, 0 échec                           |
| `audited`   | 1 à 20 requêtes NLQ parallèles à travers la chaîne d’audit          | 2026-10-05                       | réussit après #534 et #536 (limite de débit par utilisateur)                                         |
| `contracts` | jusqu’à 10 utilisateurs qui négocient et transfèrent via l’EDC      | 2026-10-06, 13:52                | réussit : 578 requêtes, 0 échec, p95 287 ms                                                          |
| `stress`    | 50, 100, 200, 400 utilisateurs, abandon en cas de requêtes échouées | 2026-10-06, 21:40                | **400 utilisateurs, 0 échec** ; les SLO de latence cèdent à partir de 200 utilisateurs, plafond : UI |
| `spike`     | un saut soudain vers de nombreux utilisateurs, puis retour          | pas encore                       | ensuite, après `size-ui.sh` (ADR-061)                                                                |
| `soak`      | une charge constante pendant deux heures                            | pas encore                       | après `spike` ; mesure les crédits de rafale Postgres                                                |
| `signin`    | 5 à 50 connexions par minute contre Keycloak                        | pas encore en production         | compose : 12 connexions sur 127 au-delà de 3 s                                                       |
| `proxy`     | le proxy seul, 5 à 25 utilisateurs                                  | pas encore en production         | nécessite une tâche à l’intérieur de l’environnement ; compose réussit                               |

## Les exécutions en production, de la plus récente à la plus ancienne

### 2026-10-06 au soir : charge et stress après les corrections de la journée

Pile : Neo4j à 2 vCPU et 4 GiB (ADR-056), les vues du graphe limitées aux
30 événements d’accès les plus récents (#580), la boucle de nouvelles tentatives de l’agent d’intégration corrigée (#581),
le magasin de tâches sur le Flexible Server (#589).

| Exécution                                                                                                                                                                 | Utilisateurs      | Requêtes        | Échecs     | p95 global / API / pages / NLQ    | Verdict                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------- | ---------- | --------------------------------- | ------------------------------------------------------------------------------ |
| [`20261006-2115-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-2115-load-aca&from=1791321300000&to=1791322320000)     | 50 pendant 15 min | 19 509 (21,5/s) | **0,00 %** | 146 ms / 155 ms / 43 ms / 217 ms  | chaque SLO respecté, contrôles à 99,97 %                                       |
| [`20261006-2140-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-2140-stress-aca&from=1791322800000&to=1791324300000) | 50 à 400, 20 min  | 81 518 (63,6/s) | **0,00 %** | 3,35 s / 3,53 s / 3,23 s / 4,93 s | SLO de latence dépassés à partir de 200 utilisateurs ; chaque réponse correcte |

Le plafond était l’UI : trois réplicas d’un demi-cœur à 99 % de CPU à partir de l’étape
à 400 utilisateurs, Neo4j à 0,82 de ses 2 cœurs et 2,66 GB sur 4 GiB, le
proxy à 0,06 cœur. Les erreurs dans les journaux venaient de l’UI qui appelait l’API de
gestion de l’EDC à une mauvaise adresse (environ 8 900 lignes 404 pendant l’exécution de stress),
adresse que #648 fixe à chaque déploiement ; les pages EDC n’ont effectué aucun travail réel lors de ces exécutions,
si bien que le prochain `load` après cette correction fera bouger les chiffres.

Ce qui a changé en conséquence : l’[ADR-061](../ADRs/ADR-061-the-ui-scales-out-on-whole-cores.md),
un cœur entier par réplica de l’UI, jusqu’à six réplicas selon une règle de concurrence HTTP de
15, appliqué par `scripts/azure/size-ui.sh` ; un déploiement attend désormais tant qu’une exécution est en cours
(`LOAD_TEST_RUNNING`), parce qu’une fusion le 2026-10-06 a redéployé l’UI et le
proxy au milieu d’une exécution.

### 2026-10-06 après-midi : la première exécution de stress jusqu’à 400 utilisateurs

| Exécution                                                                                                                                                                 | Utilisateurs      | Requêtes      | Échecs         | p95 API / pages / NLQ      | Verdict                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------- | -------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| [`20261006-1728-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1728-stress-aca&from=1791307740000&to=1791309060000) | 50 à 400          | 84 624 (66/s) | **0,00 %**     | 3,19 s / 2,8 s / 4,35 s    | toutes les étapes atteintes ; Neo4j n’a pas redémarré après l’ADR-056                            |
| [`20261006-1455-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1455-load-aca&from=1791298500000&to=1791299520000)     | 50 pendant 15 min | 10 000+       | 0,03 %         | pages et API sous les SLO  | avec #580 et #579 déployés ; les deux chaînes d’audit intactes après l’exécution                 |
| [`20261006-1152-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-1152-load-aca&from=1791287580000&to=1791288600000)     | 50 pendant 15 min |               | 0              | 151 ms au global           | avec #576 ; exécutée à côté de la boucle de nouvelles tentatives de l’agent d’intégration (#577) |
| [`20261006-stress-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-stress-aca&from=1791274440000&to=1791275580000)           | 50 à 400          |               | 2,1 % à la fin | `/api/graph` 64 s à la fin | abandonnée à environ 300 utilisateurs : Neo4j arrêté pour manque de mémoire (code de sortie 137) |
| [`20261006-load-aca`](https://grafana.ehds.mabu.red/d/mvhd-load-test/load-and-stress-test?var-testid=20261006-load-aca&from=1791273300000&to=1791274320000)               | 50 pendant 15 min |               | 0              |                            | la référence du matin à l’intérieur de l’environnement                                           |

L’exécution de stress du matin a trouvé le plafond de Neo4j par la mémoire ; l’exécution de l’après-midi,
après `size-neo4j.sh` (2 vCPU, 4 GiB, tas de 1,5 GiB, cache de pages de 1 GiB), a atteint
400 utilisateurs sans aucune requête échouée et a déplacé le plafond vers l’UI. Une exécution de charge
intermédiaire (`20261006-1359-load-aca`) a échoué sur la latence parce que l’agent
d’intégration relançait en arrière-plan une demande de justificatif bloquée trente fois par seconde
(#577) ; la correction (#581) a été déployée avant les exécutions du soir.

### 2026-10-05 : la référence

Les premières exécutions contre le hub en production, depuis un ordinateur portable à Berlin, avec le
côté plateforme issu d’Azure Monitor : [la référence Azure](2026-10-baseline.md).
50 utilisateurs pendant 15 minutes ont réussi sans aucune requête échouée, mais avec un p95 de l’API de
1,8 s, avec `/api/graph` à 10 s ; les requêtes auditées ont atteint la limite de débit
du proxy (83,6 % de 429 avant #534, 23,2 % après). Neo4j à 97 % de ses 2 GiB était
le premier plafond. La même suite contre [la pile compose](2026-10-05-local.md)
sur un ordinateur portable, à titre de comparaison : la charge respecte chaque SLO à 50 utilisateurs, le stress cède
entre 100 et 200 utilisateurs sur le CPU de l’UI.

![Tableau de bord Test de charge et de stress, 50 utilisateurs contre ehds.mabu.red le 2026-10-05](img/2026-10-05-load-azure.png)

## Où en est la plateforme

L’[évaluation de la préparation à la production d’octobre 2026](2026-10-production-readiness.md)
lit ces exécutions conjointement avec les travaux de sécurité et les ADR au regard des cadres
Well-Architected et Cloud Adoption, pilier par pilier : ce qui est en place,
ce qui reste ouvert, et ce qui sépare le démonstrateur d’une plateforme
exploitable.

## Ce que montre le tableau de bord

Le tableau de bord **Test de charge et de stress** (`observability/grafana/dashboards-azure/load-stress-test.json`)
comporte trois lignes, chacune filtrée par le `testid` de l’exécution :

- **Load (k6): what the test is doing** : utilisateurs virtuels, requêtes par seconde,
  requêtes échouées, p95 par groupe (pages, API, NLQ), les points de terminaison les plus lents.
- **Server side: the proxy** : requêtes et p95 par route, refus dus à la limite de débit,
  les enregistrements de la chaîne d’audit par transaction, les lignes de journal de cette exécution.
- **Containers** : CPU et mémoire de l’UI, du proxy, de Neo4j, de Keycloak et des
  connecteurs, réplicas et crédits de rafale du Flexible Server.

Le tableau de bord **Contrats et transferts EDC** (`mvhd-edc-dsp`) suit les
négociations et les transferts qu’une exécution `contracts` fait passer par les connecteurs.
La manière de lire un résultat, hypothèse par hypothèse, est décrite dans le
[runbook](../knowledge/runbooks/load-and-stress-test.md).

## Les exécutions qui restent à faire

1. `stress` après `scripts/azure/size-ui.sh` (ADR-061) : où le SLO d’API de 1 s
   cède pour la première fois avec des réplicas à cœurs entiers ; le p95 par étape va dans le
   tableau de l’ADR.
2. `spike`, puis `soak` pendant deux heures : les crédits de rafale Postgres (hypothèse
   4 du runbook) et le coût pour 1 000 requêtes issu de Cost Management sur
   la fenêtre du `soak`.
3. `signin` en production : la connexion est-elle un singleton (hypothèse 6).
4. `load` une fois de plus avec les pages EDC effectuant un travail réel (#648 fixe
   l’adresse du connecteur à chaque déploiement).

Chacune pendant les heures de bureau, annoncée, l’une après l’autre ; un déploiement attend tant qu’une exécution
est en cours. La procédure est le [runbook](../knowledge/runbooks/load-and-stress-test.md) ;
les points ouverts sont suivis dans [#571](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/571).

## Reproduire

```bash
scripts/azure/run-load-test.sh load            # inside Azure, as a Container Apps job
ABORT_ON=failures scripts/azure/run-load-test.sh stress
load-tests/run.sh load azure                   # from a laptop, metrics to a local Grafana
```

Les sessions sont forgées pour dix utilisateurs par persona et transmises à la tâche sous forme de
secret ; rien de réel ne se connecte. La suite, ses scénarios et ses seuils sont
documentés dans [`load-tests/README.md`](../../load-tests/README.md).
