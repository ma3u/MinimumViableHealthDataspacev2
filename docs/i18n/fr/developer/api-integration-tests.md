---
source: docs/developer/api-integration-tests.md
sourceHash: 0367043d7487f01912d6553af1519b396aaa727692440c7b99590d3323686d3e
language: fr
summary: "La collection Bruno et les contrôles de l’espace de données, de l’identité et du domaine : ce que couvre chacun, comment l’exécuter et s’il est à jour, avec des chiffres mesurés."
---

# Tests d’intégration par les API

Le hub est testé depuis l’extérieur, comme un partenaire l’utiliserait, par trois
suites qui appellent ses API HTTP : la collection [Bruno](https://www.usebruno.com/) pour les routes propres au hub,
et deux suites shell pour le protocole d’espace de données et la couche d’identité. Cette
page indique ce que couvre chacune, comment l’exécuter et à quel point elle est à jour, avec les
chiffres mesurés le 2026-11-03.

## Les trois suites

| Suite                                 | Ce qu’elle appelle                                                                                                                                                                                               | Commande d’exécution                                                                   | Exécutée en CI                                                                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collection Bruno                      | les routes `/api/*` du hub, ainsi que les services EDC et le proxy Neo4j                                                                                                                                         | [`./scripts/run-api-tests.sh <environment>`](../../scripts/run-api-tests.sh)           | [`bruno-smoke.yml`](../../.github/workflows/bruno-smoke.yml) (PR), [`compliance.yml`](../../.github/workflows/compliance.yml) (chaque nuit), [`demo-smoke.yml`](../../.github/workflows/demo-smoke.yml) (en production) |
| Contrôles de l’espace de données EEDS | la Management API du plan de contrôle EDC et les points de terminaison [DSP 2025-1](https://eclipse-dataspace-protocol-base.github.io/DataspaceProtocol/2025-1/)                                                 | [`./scripts/run-ehds-dataspace-checks.sh`](../../scripts/run-ehds-dataspace-checks.sh) | `compliance.yml`, job "DSP 2025-1 TCK"                                                                                                                                                                                  |
| Contrôles d’identité EEDS             | [IdentityHub](https://github.com/eclipse-edc/IdentityHub/releases/tag/v1.0.0-RC5), IssuerService et le plan de contrôle ([DCP 1.0](https://eclipse-dataspace-dcp.github.io/decentralized-claims-protocol/v1.0/)) | [`./scripts/run-ehds-identity-checks.sh`](../../scripts/run-ehds-identity-checks.sh)   | `compliance.yml`, job "DCP v1.0 Compliance"                                                                                                                                                                             |

Une quatrième suite, [`scripts/run-ehds-tests.sh`](../../scripts/run-ehds-tests.sh), contrôle le domaine de la santé dans le
graphe ([FHIR](https://hl7.org/fhir/R4/), [OMOP](https://ohdsi.github.io/CommonDataModel/cdm54.html), [HealthDCAT-AP](https://data.health.europa.eu/healthdcat-ap/releases/release-8/), la chaîne d’accès de l’[art. 53](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#art_53)) via Neo4j
plutôt que via HTTP ; `compliance.yml` l’exécute sous le nom "EHDS Health Domain".

Aucune de ces suites n’est le TCK Eclipse. Elles sont les nôtres, elles pilotent les API avec
`curl` ou Bruno, et celles pour DSP et DCP n’agissent jamais comme pair du protocole : ce
sont donc des contrôles de disponibilité et de forme sur notre propre pile, pas des preuves de conformité.
L’adoption des véritables TCK Eclipse [DSP](https://github.com/eclipse-dataspacetck/dsp-tck) et [DCP](https://github.com/eclipse-dataspacetck/dcp-tck)
est la phase 1 de [#338](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/338).
Le [SDLC](../SDLC.md#63-protocol-compliance) retrace l’historique de ce choix.

## La collection Bruno

[`bruno/MVHDv2/`](../../bruno/MVHDv2) est organisé selon la persona qui envoie une requête, un dossier
par rôle du [règlement (UE) 2025/327](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng), plus les procédures bilatérales du
[chapitre IV](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng#cpt_IV), les frontières entre rôles, et les surfaces du protocole et de la plateforme
([ADR-032](../ADRs/ADR-032-persona-organised-api-collection.md)). Un partenaire
l’utilise pour s’exercer face au hub.

| Dossier                   | Requêtes | Exécuté contre                               |
| ------------------------- | -------: | -------------------------------------------- |
| 00 Public                 |        8 | Local, Azure-Dev                             |
| 01 Patient                |       22 | Local, Azure-Dev                             |
| 02 Data Holder            |       16 | Local, Azure-Dev                             |
| 03 Data User              |       14 | Local, Azure-Dev                             |
| 04 Access Body            |       13 | Local, Azure-Dev                             |
| 05 Dataspace Operator     |       30 | Local, Azure-Dev                             |
| 06 Trust Centre           |        3 | Local, Azure-Dev                             |
| 07 Journey - Data permit  |       16 | Local, Azure-Dev                             |
| 08 Journey - Data request |        5 | Local, Azure-Dev                             |
| 09 Access control         |       39 | Local, Azure-Dev                             |
| 10 Connecting partner     |       20 | Local uniquement (EDC est interne sur Azure) |
| 11 Platform               |        6 | Local uniquement (le proxy est interne)      |
| 12 EUDI wallet            |        3 | Local avec `BRUNO_EUDI=1`                    |
| 13 Static export          |       32 | Static-mock uniquement                       |
| **Total**                 |  **227** |                                              |

Une exécution Local envoie donc 192 requêtes, une exécution Azure-Dev 166 et une exécution Static-mock 32.

### L’exécuter

```bash
./scripts/run-api-tests.sh Static-mock   # GitHub Pages fixtures, GET only, no secret needed
./scripts/run-api-tests.sh Local         # the compose stack on :3003
./scripts/run-api-tests.sh Azure-Dev     # the live hub, needs NEXTAUTH_SECRET
./scripts/run-api-tests.sh Local "07 Journey - Data permit"   # one folder
```

Le lanceur forge une session [NextAuth](https://next-auth.js.org/) par persona ([`ui/scripts/forge-bruno-session.mjs`](../../ui/scripts/forge-bruno-session.mjs))
à partir de `NEXTAUTH_SECRET`, si bien qu’aucun fichier `.bru` ne contient jamais de cookie. Pour `Local`, il
lit le secret dans le conteneur de l’UI quand la variable n’est pas définie ; pour
`Azure-Dev`, vous l’exportez vous-même et il n’est jamais affiché. Les rapports arrivent dans
`test-results/bruno/` (modifiable avec `BRUNO_REPORT_DIR`) : un JSON de synthèse que lit la
référence de conformité, ainsi que du HTML, du JUnit et du JSON brut sous `raw/`.

### Les règles que suit une requête

Selon [`.claude/rules/testing.md`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/.claude/rules/testing.md)
et l’[ADR-031](../ADRs/ADR-031-checks-must-assert.md) :

- Elle se trouve dans le dossier de la persona qui l’envoie ; une requête que deux personas
  envoient va dans un dossier de parcours et nomme la persona qui agit.
- Elle vérifie le statut **et** au moins une propriété du corps. Une requête
  dont la seule vérification est `res.status: lt 500` ne peut pas échouer et est refusée.
- Une requête dont l’objet ne peut pas exister sur une pile est ignorée bruyamment, avec un test
  nommé `SKIPPED: <reason>`. Elle ne réussit jamais en silence.
- Aucun cookie de session ni autre identifiant dans un fichier `.bru`.

Trois scripts font respecter ces règles dans pre-commit et dans le PR Gate :

| Contrôle                                                                   | Ce qui le fait échouer                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`scripts/check-bruno-coverage.py`](../../scripts/check-bruno-coverage.py) | une route sans requête, une requête dont la route a disparu, une requête sans assertion, un identifiant                                                                   |
| [`scripts/check-bruno-strength.py`](../../scripts/check-bruno-strength.py) | une requête 2xx plus permissive que ce qu’autorise [`docs/bruno-soft-assertion-allowlist.txt`](../bruno-soft-assertion-allowlist.txt) (uniquement des types de conteneur) |
| [`scripts/check-workflow-paths.py`](../../scripts/check-workflow-paths.py) | un workflow dont le filtre `paths` omet un script qu’il exécute, de sorte qu’une correction ne le relancerait pas                                                         |

### Sont-elles à jour ?

Mesuré le 2026-11-03 sur `main` à [`b0586238`](https://github.com/ma3u/MinimumViableHealthDataspacev2/commit/b0586238) :

| Question                                                                                      | Réponse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chaque route a-t-elle une requête ?                                                           | **Oui.** [`check-bruno-coverage.py`](../../scripts/check-bruno-coverage.py) : 109 routes implémentées, 109 avec requête (100 %), 0 sur la liste d’exceptions sans requête.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Chaque requête peut-elle échouer ?                                                            | **Oui.** Aucune requête ne manque d’assertion ou de test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Les chemins de réussite sont-ils robustes ?                                                   | **En partie.** [`check-bruno-strength.py`](../../scripts/check-bruno-strength.py) : sur 127 requêtes 2xx en production, 49 ne vérifient qu’un type de conteneur ; les 49 figurent sur la liste d’exceptions, qui sert de cliquet.                                                                                                                                                                                                                                                                                                                                                                                              |
| La démo statique répond-elle ?                                                                | **Oui.** [`run-api-tests.sh Static-mock`](../../scripts/run-api-tests.sh) : 32 réussies, 0 en échec, 0 ignorée sur 32 (99 assertions) contre GitHub Pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| La pile compose répond-elle ? (CI, `main`)                                                    | **Presque.** Exécution [`compliance.yml`](../../.github/workflows/compliance.yml) [41586005794](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005794) : 191 réussies, 1 en échec sur 192. L’échec est `03 Data User/13 A dataset described in German` (« le titre est présent en anglais et en allemand »). Le plancher est 179/0, donc le job Compliance Report échoue.                                                                                                                                                                                                                            |
| Le hub en production répond-il ? ([`demo-smoke.yml`](../../.github/workflows/demo-smoke.yml)) | **Pas avant la correction du 2026-11-03.** Exécution [41586005885](https://github.com/ma3u/MinimumViableHealthDataspacev2/actions/runs/41586005885) : 30 réussies, 136 en échec sur 166, dont 163 en 401. Le secret était correct ; le cookie jar de Bruno a remplacé l’en-tête de session par le cookie `acaAffinity` de l’ingress ([pièges](../gotchas.md), 2026-11-03). Avec [`--disable-cookies`](https://docs.usebruno.com/bru-cli/commandOptions), la même exécution a obtenu 165 sur 166 ; la dernière restante est `03 Data User/07 Federated cohort statistics`, un 503 de la requête fédérée. Le plancher est 153/0. |
| Contrôles DSP (CI)                                                                            | 25 réussis, 0 en échec, 8 ignorés sur 33, au plancher de 25/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Contrôles DCP (CI)                                                                            | 27 réussis, 0 en échec, 0 ignoré sur 27, au plancher de 27/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Contrôles du domaine EEDS (CI)                                                                | 25 réussis, 0 en échec, 5 ignorés sur 30, au-dessus du plancher de 18/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

La collection est donc à jour avec le code : chaque route est couverte et le
contrôle de couverture la maintient ainsi. Le 2026-11-03, les deux résultats sur `main` étaient rouges ; tous deux
sont corrigés et suivis dans
[#839](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/839). L’exécution
en production obtient 166 sur 166 depuis [#853](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/853), et son plancher est de 166/0 depuis [#856](https://github.com/ma3u/MinimumViableHealthDataspacev2/pull/856).

## La référence de conformité

Le résultat de chaque suite est comparé à un plancher dans
[`scripts/compliance-baseline.json`](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/scripts/compliance-baseline.json)
par [`scripts/check-compliance-baseline.py`](../../scripts/check-compliance-baseline.py). Le job échoue quand `passed` descend
sous le plancher ou que `failed` le dépasse, de sorte qu’une suite qui ne réussit pas encore
peut tout de même empêcher une dégradation. Relevez un plancher chaque fois qu’une suite
s’améliore ; en abaisser un exige une raison dans son `note`, et `review_by` fait
expirer un plancher pour que personne ne puisse le laisser bas indéfiniment.

```bash
python3 scripts/check-compliance-baseline.py --results test-results
```

## Les contrôles de l’espace de données et de l’identité

Les deux nécessitent la pile [JAD](https://github.com/eclipse-dataspace-hub/jad) complète (voir [la pile et l’environnement](stack-and-environment.md))
avec les phases d’amorçage 1 à 7 terminées.

```bash
./scripts/run-ehds-dataspace-checks.sh   # DSP: catalogue, negotiation, transfer, policy (33 checks)
./scripts/run-ehds-identity-checks.sh    # DCP: DIDs, keys, credentials, scopes, trust lists (27 checks)
```

Ils lisent `EDC_MANAGEMENT_URL`, `EDC_IDENTITY_URL` et `EDC_ISSUER_URL`, et
utilisent par défaut les ports de compose. Les contrôles d’identité démarrent et arrêtent le
conteneur [`rogue-issuer`](../../docker-compose.jad.yml#L808) (profil compose `trust-check`) pour montrer qu’une
attestation émise par un émetteur absent de toute liste de confiance est refusée. Sur Azure, les mêmes
suites s’exécutent depuis un job [ACA](https://learn.microsoft.com/en-us/azure/container-apps/jobs) ([`scripts/azure/08-compliance-runner.sh`](../../scripts/azure/08-compliance-runner.sh),
[`compliance.yml`](../../.github/workflows/compliance.yml) déclenché avec `target: azure`), où les contrôles qui doivent
regarder à l’intérieur d’un conteneur sont ignorés.
