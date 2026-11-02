---
source: docs/klarbefund/evidence.md
sourceHash: fc5bb296ce79d86a900f5cca02fcf97d746c0622fb87b553939e7d62d0325723
language: fr
summary: "Le banc d’essai de précision, le contrôle de parité du dictionnaire, le journal d’exécution et ce qui manque encore."
---

# Klarbefund : preuves

Ce qu’un examinateur extérieur à ce projet peut vérifier au sujet de Klarbefund, le scanner
de comptes rendus de laboratoire pour iPhone ([#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)),
et ce qui manque encore. Rédigé pour la première question d’un assureur, d’un hôpital ou d’un
auditeur : _l’extraction est-elle correcte, les données sont-elles en sécurité, et s’agit-il
d’un dispositif médical ?_ La protection des données, la BSI TR-03161 et la réglementation sont
évaluées dans [`self-assessment.md`](self-assessment.md) ; la manière d’exécuter tout cela
sur un Mac est décrite dans [`run-on-mac.md`](run-on-mac.md). La description destinée aux personnes se trouve dans
[`README.md`](README.md), le volet développeur dans
[`clients/ios/README.md`](../../clients/ios/README.md).

Klarbefund est open source sous [licence Apache 2.0](../../LICENSE). Le
projet n’est pas un fournisseur : il n’y a ni entreprise derrière lui, ni contrat de support, ni
garantie. Quiconque déploie l’application, ou un fork de celle-ci, l’exploite et assume
les obligations de protection des données et de sécurité qui en découlent.

## Statut

- Lors de la soumission au HL7 AI Challenge 2026 (date limite 2026-06-30), Klarbefund
  était un prototype. Le prix ("Open Solution") a été attribué à la plateforme EEDS de
  ce dépôt.
- Lors de la présentation des lauréats, l’application a été montrée en démonstration en direct.
- Elle est dans TestFlight, approuvée par la revue bêta d’Apple pour les testeurs externes
  ([ADR-050](../ADRs/ADR-050-klarbefund-beta-by-public-testflight-link.md)).
- Elle lit Apple Santé (HealthKit, en lecture seule) et se connecte au hub de démonstration,
  dont l’utilisation secondaire s’exécute dans l’environnement de traitement sécurisé du hub
  ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)).

## Ce qui est déjà prouvé

| Affirmation                                                                 | Preuve                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Une numérisation dégradée perd des lignes, elle n’invente jamais de valeurs | `Tests/SharedTests/ScanningTests.swift` : feuilles synthétiques avec inclinaison, reflets, faible luminosité, flou et basse résolution, lues avec Vision ; toute valeur codée absente de la feuille fait échouer le test |
| Règles numériques allemandes (virgule décimale, `1.240` = 1240, `0.300`)    | `Tests/SharedTests/LabLineParserTests.swift`                                                                                                                                                                             |
| L’unité détermine le code LOINC ; l’urine n’est jamais du sérum             | `LabLineParserTests.swift`, `RealScanLessonsTests.swift` (mises en page de 19 numérisations réelles, toutes les valeurs inventées)                                                                                       |
| Rien n’est écarté silencieusement                                           | Autotest (`-MBSelfTest`, 27 contrôles) : chaque ligne imprimée finit codée, non mise en correspondance ou non lue                                                                                                        |
| Les valeurs OCR restent provisoires                                         | Modèle de provenance (`Sources/Shared/Provenance.swift`) : seule la couche texte du PDF propre à un laboratoire produit le statut FHIR `final`                                                                           |
| Une numérisation réelle peut être rejouée sans le téléphone ni l’image      | `swift run ScanReplay`, `swift run LabFile` ; tous deux refusent les chemins situés dans ce dépôt                                                                                                                        |
| Les exports sont standard                                                   | Bundle FHIR R4 avec LOINC et UCUM (`FhirBundleParityTests.swift`), OMOP CDM v5.4 (`OmopExportTests.swift`)                                                                                                               |
| Les données restent sur l’appareil par défaut                               | OCR et analyse sur l’appareil, chiffrement par élément, aucune sauvegarde iCloud, consentements distincts, export et suppression ([README](README.md#privacy-and-safety))                                                |

## Mesurer l’exactitude

`ExtractionAccuracy` (`clients/ios/Sources/Shared/ExtractionAccuracy.swift`)
compare une extraction à une vérité vérifiée manuellement, champ par champ : la valeur avec
son comparateur, l’unité, le code LOINC (ou le refus attendu), l’intervalle de référence
imprimé et la date du laboratoire. Ses chiffres clés :

- **exactes** : lignes correctes dans chaque champ vérifié ;
- **erreurs silencieuses** : lignes qui ont été codées, donc affichées comme une valeur, et erronées en
  valeur, en unité ou en code. C’est le chiffre qui compte cliniquement ; l’objectif
  est zéro ;
- **parasites** : valeurs codées sans aucune ligne correspondante sur la feuille ;
- **manquées** et **non lues** : lignes perdues, et lignes transmises à la personne qui vérifie.

Deux façons de l’exécuter :

1. **Benchmark synthétique, dans la CI.** `AccuracyBenchmarkTests` génère le
   panel synthétique dans neuf conditions de numérisation, le lit avec Vision et vérifie
   l’absence d’erreur silencieuse dans chacune. En local : `cd clients/ios && swift test` ; si
   `KLARBEFUND_BENCHMARK_OUT=<file>` est défini, les décomptes y sont écrits au format JSON.
   Un job `ios-unit-tests` pour `.github/workflows/test.yml` (en attente, YAML dans
   [`run-on-mac.md`](run-on-mac.md#4-put-the-swift-suite-into-ci)) exécute
   toute la suite Swift sur `macos-26` et conserve ce JSON comme
   artefact `klarbefund-accuracy-benchmark` ; tant qu’il n’est pas intégré, la CI ne construit que la
   cible `Shared`. Aucune donnée réelle n’est en jeu, le JSON peut donc être publié
   tel quel.
2. **Pilote sur des comptes rendus réels, jamais dans le dépôt.** Un participant exporte
   des diagnostics depuis l’application (ADR-038), et un `truth.json` est rédigé à côté de chaque
   `diagnostics.json` à partir du document papier :

   ```json
   {
     "schema": 1,
     "labDate": "2026-09-12",
     "rows": [
       {
         "label": "LDL-Cholesterin",
         "value": 141,
         "unit": "mg/dl",
         "loinc": "2089-1",
         "referenceText": "< 116"
       },
       {
         "label": "Ferritin",
         "value": 10,
         "comparator": "<",
         "unit": "ug/l",
         "loinc": "2276-4"
       },
       {
         "label": "Natrium [U]",
         "value": 80,
         "unit": "mmol/l",
         "loinc": null,
         "refused": true
       }
     ]
   }
   ```

   ```bash
   cd clients/ios
   swift run ScanReplay ~/Pilot/export --truth          # per row: which fields were wrong, no values
   swift run ScanReplay ~/Pilot/export --truth --json   # counts only, the part to publish
   ```

   Seuls les décomptes quittent le dossier du participant. Avant qu’un compte rendu soit utilisé :
   consentement écrit du participant (finalité, conservation, retrait, et
   transmission ou non des valeurs à un service d’explication), et vérification que l’étude dont
   provient le compte rendu ne restreint pas le partage de ses résultats.

Les valeurs cibles par champ sont fixées avant la mesure d’un pilote, et la taille
d’échantillon du pilote est indiquée à côté de chaque chiffre.

## Procès-verbal d’exécution

La liste de contrôle de [`run-on-mac.md`](run-on-mac.md) a été exécutée pour la dernière fois le 2026-10-15 au
commit `1474295d` de cette branche, sous macOS 26.7.1 avec Xcode 26 (Swift 6.4).
Tout ce qui suit relève du benchmark synthétique ; aucun compte rendu réel n’a été utilisé, les
décomptes sont donc publiés tels quels dans
[`accuracy-benchmark.json`](accuracy-benchmark.json), le fichier écrit par l’exécution.
C’est le projet qui se vérifie lui-même : un examinateur le reproduit avec les trois mêmes
commandes, et un pilote sur des comptes rendus réels reste ouvert.

| Étape                     | Résultat                                                |
| ------------------------- | ------------------------------------------------------- |
| `swift build`             | Shared, AnalyteParity, ScanReplay et LabFile construits |
| `swift run AnalyteParity` | parité ok : 1589 codages, 71 unités                     |
| `swift test`              | 319 tests dans 54 suites réussis, 0 échec, environ 10 s |

Un panel synthétique de 8 lignes, lu avec Vision dans neuf conditions, soit 72
lignes de vérité au total. `AccuracyBenchmarkTests` vérifie l’absence d’erreur silencieuse dans
chaque condition ; les autres colonnes sont rapportées, non vérifiées.

| Condition                    | Trouvées | Exactes | Erreurs silencieuses | Parasites | Lignes non lues | Référence correcte |
| ---------------------------- | -------: | ------: | -------------------: | --------: | --------------: | -----------------: |
| numérisation nette à 150 dpi |        8 |       8 |                    0 |         0 |               0 |              8 / 8 |
| inclinée de 1 degré          |        8 |       8 |                    0 |         0 |               0 |              8 / 8 |
| inclinée de 2 degrés         |        7 |       5 |                    0 |         0 |               0 |              5 / 7 |
| inclinée de 5 degrés         |        5 |       0 |                    0 |         0 |               2 |              0 / 5 |
| pièce sombre                 |        8 |       8 |                    0 |         0 |               0 |              8 / 8 |
| reflet du flash              |        8 |       8 |                    0 |         0 |               0 |              8 / 8 |
| léger flou de bougé          |        7 |       7 |                    0 |         0 |               1 |              7 / 7 |
| flou important               |        0 |       0 |                    0 |         0 |               0 |              0 / 0 |
| basse résolution             |        7 |       6 |                    0 |         0 |               1 |              7 / 7 |
| **les neuf**                 |       58 |      50 |                **0** |     **0** |               4 |            51 / 58 |

Ce que disent les chiffres : une feuille nette, sombre, avec reflets ou légèrement inclinée est lue
entièrement et exactement. À mesure que la feuille se dégrade, l’application perd des lignes, d’abord dans la
colonne de l’intervalle de référence, puis des lignes entières, jusqu’à ce qu’un flou important ne donne plus rien
du tout. À aucun moment elle n’affiche une valeur, une unité ou un code erroné, ce qui est
la propriété que la suite impose.

Un constat issu de l’exécution elle-même : la cible de test ne se compilait pas avec
Swift 6.4, car `Comparator` était devenu ambigu entre `Shared` et le
SDK de la plateforme. Le test nomme désormais `Shared.Comparator`, comme `OmopExportTests`
le faisait déjà.

## Ouvert

| Sujet                                       | Ce qui manque                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Destination (MDR)                           | Une qualification écrite selon le MDCG 2019-11 Rev.1. Le cas limite est l’écran des tendances, qui colore les valeurs par rapport à des plages publiées (ADR-039) ; la position du projet est qu’une comparaison avec un nombre cité n’est pas un résultat d’examen. Un avis externe.                                                                                                                                                                                                                       |
| Exploitant du service d’explication hébergé | Les explications s’exécutent sur l’appareil par défaut. La personne peut basculer vers le service hébergé (par défaut Azure OpenAI, zone de données de l’UE ; Anthropic sur adhésion, États-Unis) ou vers son propre compte Azure OpenAI ou Anthropic. Quiconque exploite le service hébergé traite des données de santé et doit documenter ce rôle (registre des activités de traitement, contrats de sous-traitance).                                                                                     |
| Protection des données                      | Diagramme des flux de données et modèle d’analyse d’impact relative à la protection des données pour un exploitant.                                                                                                                                                                                                                                                                                                                                                                                         |
| Sécurité                                    | Un modèle de menaces, un SBOM et un test de sécurité autoréalisé existent depuis le 2026-10-15 (`docs/security/threat-model-klarbefund.md`, `docs/sbom/`, `docs/security/security-test-report-2026-10-15.md`). L’application se verrouille avec Face ID ou le code d’accès depuis le 2026-10-15 (ADR-060). Ouvert : un test d’intrusion indépendant et la liste des écarts au niveau des exigences par rapport à la BSI TR-03161 partie 1. CodeQL s’exécute à chaque modification iOS (`codeql-swift.yml`). |
| Exactitude du pilote                        | Fichiers de vérité et décomptes agrégés issus de comptes rendus réels, comme ci-dessus.                                                                                                                                                                                                                                                                                                                                                                                                                     |
