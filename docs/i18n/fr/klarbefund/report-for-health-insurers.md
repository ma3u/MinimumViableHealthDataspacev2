---
source: docs/klarbefund/report-for-health-insurers.md
sourceHash: 821e6839f6e4c6afb7b5fe7ead3e9e6b766be700275755cd2ba9f59988ae279a
language: fr
summary: "Les trois questions d’un assureur santé, l’extraction est-elle juste, les données sont-elles sûres, est-ce un dispositif médical, avec les preuves, plus l’offre en marque blanche et de conseil."
---

# Klarbefund : rapport de preuves pour les assureurs santé

Date 2026-10-15. Établi par le projet pour une caisse d’assurance maladie obligatoire ou un
assureur santé privé, un groupe hospitalier ou un fournisseur d’ePA qui pose les trois mêmes
questions : _l’extraction est-elle correcte, les données sont-elles en sécurité, et s’agit-il
d’un dispositif médical ?_ Tout ce qui figure ici est produit par des outils que chacun peut exécuter sur
le dépôt, avec les commandes indiquées, et chaque point ouvert est désigné comme
ouvert. La version d’une page pour une réunion de pilotage est le tableau de synthèse ; le
reste constitue les preuves derrière chaque ligne.

**Ce qui est proposé.** Klarbefund est un environnement de démonstration et une implémentation
de référence open source (Apache 2.0). Ce n’est pas un produit avec un fournisseur
derrière lui. Ce que le projet propose à un assureur, c’est soit une **version en marque blanche**
de l’application, sous le nom de l’assureur et sous sa responsabilité d’exploitant,
soit un **conseil technique** pour intégrer le scanner, le dictionnaire de codage
et le module d’écriture FHIR dans une application ePA ou de DSE que l’assureur exploite déjà. Les deux
voies partent des preuves ci-dessous.

## Synthèse

| Question                                           | Réponse, avec les preuves                                                                                                                                                                                                                                                                                                          | Statut                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Lit-elle correctement les valeurs de laboratoire ? | Benchmark synthétique dans neuf conditions de numérisation : 0 erreur silencieuse, 0 valeur inventée, 50 lignes exactes sur 72 ; les numérisations dégradées perdent des lignes, elles n’affichent jamais une valeur erronée. 1751 codages d’analytes, 71 unités, LOINC et UCUM.                                                   | prouvé, pilote sur des comptes rendus réels ouvert |
| Les données sont-elles en sécurité ?               | Sur l’appareil par défaut, Face ID ou code d’accès devant les résultats, AES-GCM par enregistrement, clé dans le trousseau (Keychain) adossé à la Secure Enclave, aucun paquet tiers, Apple Santé en lecture seule. CodeQL 0 résultat, 0 vulnérabilité connue, 9 tests de posture, modèle de menaces, SBOM.                        | autotesté, test indépendant ouvert                 |
| S’agit-il d’un dispositif médical ?                | Destination : stocker, afficher, exporter et expliquer ce qu’est une mesure ; aucun diagnostic, aucun verdict. Selon le MDCG 2019-11, généralement pas un dispositif ; la coloration des tendances est le cas limite que le projet a consigné par écrit.                                                                           | position écrite, avis externe ouvert               |
| S’intègre-t-elle à l’ePA et à l’EEDS ?             | FHIR R4 avec LOINC, UCUM, SNOMED CT, CVX et ATC ; la base de données de test contient désormais quatre des cinq catégories prioritaires de l’art. 14 de l’EEDS ; le hub exporte l’ensemble du dossier dans un seul Bundle ; le label de bien-être de l’art. 47 s’applique si l’application est commercialisée comme interopérable. | oui                                                |
| S’agit-il d’une DiGA ?                             | Non, par conception : une DiGA doit être un dispositif portant le marquage CE. Aucun certificat DiGA n’est revendiqué.                                                                                                                                                                                                             | s.o.                                               |
| Mon équipe peut-elle vérifier cela ?               | Oui : chaque chiffre a une commande, les numérisations et les tests s’exécutent sur un Mac avec Xcode, et la collection d’API du hub (Bruno) permet de répéter l’intégration.                                                                                                                                                      | oui                                                |

## 1. Ce que fait Klarbefund

Une personne photographie un compte rendu de laboratoire ou ouvre le PDF du laboratoire.
L’application le lit sur l’appareil, code chaque ligne avec LOINC et UCUM, conserve
l’intervalle de référence imprimé, affiche les tendances d’un compte rendu à l’autre, et exporte le
dossier au format FHIR R4, OMOP CDM, JSON ou PDF. Les valeurs lues à partir d’une photographie restent
`preliminary` jusqu’à ce que la personne les vérifie ; seule la couche texte du PDF propre à un laboratoire
produit `final`. Avec le consentement de la personne, l’application écrit son dossier
dans son propre compte sur le hub de démonstration EEDS, et à côté les moyennes hebdomadaires issues d’Apple
Santé. Sinon, rien ne quitte le téléphone.

Détails : [`README.md`](README.md) (destiné aux personnes),
[`clients/ios/README.md`](../../clients/ios/README.md) (développeur),
[`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md).

## 2. Exactitude

La mesure est `ExtractionAccuracy` : une comparaison champ par champ avec une
vérité vérifiée manuellement (valeur, unité, code, intervalle de référence et date). Le chiffre
qui compte cliniquement est celui des **erreurs silencieuses**, les lignes que l’application a affichées comme une valeur
et qui étaient erronées ; le benchmark vérifie qu’il vaut zéro dans chaque condition.

| Condition                    | Trouvées | Exactes | Erreurs silencieuses | Parasites |
| ---------------------------- | -------: | ------: | -------------------: | --------: |
| numérisation nette à 150 dpi |        8 |       8 |                    0 |         0 |
| inclinée de 1 degré          |        8 |       8 |                    0 |         0 |
| inclinée de 2 degrés         |        7 |       5 |                    0 |         0 |
| inclinée de 5 degrés         |        5 |       0 |                    0 |         0 |
| pièce sombre                 |        8 |       8 |                    0 |         0 |
| reflet du flash              |        8 |       8 |                    0 |         0 |
| léger flou de bougé          |        7 |       7 |                    0 |         0 |
| flou important               |        0 |       0 |                    0 |         0 |
| basse résolution             |        7 |       6 |                    0 |         0 |
| **les neuf**                 |       58 |      50 |                **0** |     **0** |

Feuilles synthétiques, 8 lignes chacune, lues avec Apple Vision, 2026-10-15
([`accuracy-benchmark.json`](accuracy-benchmark.json)). Un pilote sur des comptes rendus
réels, avec consentement écrit et seuls les décomptes quittant le dossier du participant,
est conçu ([`evidence.md`](evidence.md#measuring-accuracy)) mais
pas encore réalisé ; le propre pilote d’un assureur est l’étape suivante naturelle.

## 3. Sécurité et protection des données

| Couche                                | Ce qui a été fait                                                                                                                                                                                              | Résultat, 2026-10-15                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Analyse statique                      | CodeQL sur l’application (82 fichiers Swift) ; CodeQL et Semgrep sur le hub dans la CI                                                                                                                         | 0 résultat                                                                                           |
| Dépendances                           | Nomenclatures CycloneDX pour l’application et chaque service du hub ([`docs/sbom/`](../sbom/README.md)) ; grype et npm audit sur celles-ci                                                                     | 0 vulnérabilité connue ; l’application a 0 paquet tiers                                              |
| Secrets                               | gitleaks sur l’arborescence et les 200 derniers commits                                                                                                                                                        | 0 après examen                                                                                       |
| Conteneurs, manifestes                | trivy sur les Dockerfiles et les manifestes Kubernetes                                                                                                                                                         | 0 HIGH après deux correctifs ; 2 MEDIUM, 12 LOW acceptés ou ouverts                                  |
| Configuration de build                | `SecurityPostureTests` : entitlements, manifeste de confidentialité, ATS, cryptographie, PKCE, HealthKit en lecture seule, conformité à l’exportation                                                          | 11 sur 11 réussis                                                                                    |
| Modèle de menaces                     | STRIDE pour l’application ([`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md)) à côté de celui du hub                                                                                      | rédigé ; risques résiduels listés                                                                    |
| Hub en production, depuis l’extérieur | 40 contrôles anonymes en boîte noire : contrôles d’accès des routes, redirections, en-têtes, TLS, console Keycloak                                                                                             | les contrôles TLS et de console réussissent ; les contrôles d’accès nécessitent les heures de bureau |
| RGPD                                  | Art. 25 par défaut, art. 5 minimisation, art. 6/9 consentements, art. 15/17/20 droits : satisfaits dans le code ; transparence et transferts partiellement ; AIPD et rôle de responsable du traitement ouverts | voir [`self-assessment.md`](self-assessment.md)                                                      |
| BSI TR-03161 partie 1                 | Évaluée par groupe d’objectifs : 9 satisfaits, 3 partiels, 1 ouvert (résilience, refusée avec justification dans ADR-060), 2 s.o.                                                                              | entrée de l’analyse des écarts d’un laboratoire                                                      |

La méthode complète, les constats et les correctifs figurent dans
[`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md).
C’est le projet qui se teste lui-même. Un test d’intrusion indépendant, qu’un
assureur demandera à juste titre, y est répertorié avec ce qu’il apporterait.

## 4. Position réglementaire

| Cadre                                | Position                                                                                                                                                                                                                                                                                                                                                                               | Ouvert                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| MDR / IVDR                           | Stockage, affichage, export et explication de ce qu’est une mesure ; aucun diagnostic, score de risque ou conseil thérapeutique. Généralement pas un dispositif selon le MDCG 2019-11 Rev.1. L’écran des tendances colore les valeurs par rapport à des plages publiées et sourcées ; la position du projet est qu’une comparaison avec un nombre cité n’est pas un résultat d’examen. | qualification écrite, avis externe          |
| DiGA (§ 139e SGB V)                  | Sans objet ; délibérément pas un dispositif                                                                                                                                                                                                                                                                                                                                            | aucun                                       |
| Règlement européen sur l’IA (AI Act) | Pas à haut risque tant que l’application n’est pas un dispositif ; chaque réponse, sur l’appareil ou hébergée, nomme son fournisseur et son modèle (art. 50)                                                                                                                                                                                                                           | aucun                                       |
| EEDS 2025/327                        | Art. 3 accès au dossier avec consentement ; art. 47 label de bien-être si commercialisée comme interopérable avec des systèmes de DSE                                                                                                                                                                                                                                                  | texte du label lors de la commercialisation |
| Apple                                | Bêta TestFlight approuvée pour les testeurs externes ; label App Privacy : données de santé, non liées, non suivies                                                                                                                                                                                                                                                                    | aucun                                       |

## 5. La base de données de test, et les types de résultats qu’elle contient

Le hub de démonstration fonctionne avec 127 patients synthétiques (Synthea) ainsi que des
dossiers saisis manuellement, dans un graphe Neo4j qui reflète FHIR R4 et OMOP CDM. Le 2026-10-15,
il a reçu les quatre types de résultats qu’un intégrateur ePA demande en premier (ADR-059).

| Type de résultat                                            | Codage               | Dans l’application | Dans la base de données de test | Comment un intégrateur l’obtient                  |
| ----------------------------------------------------------- | -------------------- | ------------------ | ------------------------------- | ------------------------------------------------- |
| Laboratoire, sang et urine                                  | LOINC, UCUM          | oui                | oui                             | `/api/patient/observations`, Bundle FHIR          |
| ECG de repos, Holter                                        | LOINC 11524-6, EC    | oui                | **nouveau**                     | `include=all`, DiagnosticReport avec Observations |
| Spirométrie, CPET, épreuve d’effort, lactate                | LOINC, PF et EC      | oui                | prévu                           |                                                   |
| Composition corporelle par DXA                              | LOINC 38269-7, RAD   | oui                | prévu                           |                                                   |
| Mesure du glucose en continu                                | LOINC 107930-0       | oui                | prévu                           |                                                   |
| Pression artérielle sur 24 h, écrans d’appareils            | LOINC                | oui                | prévu                           |                                                   |
| Moyennes hebdomadaires des objets connectés                 | LOINC                | oui                | oui                             | écrites par l’application (ADR-057)               |
| Comptes rendus d’imagerie (radiographie, écho, échographie) | LOINC, RAD           | non (narratif)     | **nouveau**                     | `include=all`, DiagnosticReport avec conclusion   |
| Carnet de vaccination                                       | CVX                  | non                | **nouveau**                     | `include=all`, Immunization                       |
| Plan de médication (BMP)                                    | ATC, posologie 1-0-1 | non                | **nouveau**                     | `include=all`, MedicationStatement                |
| Affections, médicaments                                     | SNOMED CT, RxNorm    | via le hub         | oui                             | API de profil, `$everything`                      |

Candidats suivants, par catégorie de l’art. 14 de l’EEDS : microbiologie, panels
d’allergie, génétique (résultats de laboratoire) ; anatomopathologie, études du sommeil, comptes rendus
narratifs d’ECG (comptes rendus) ; résultats rapportés par les patients et lettres de sortie
(résumé du patient, comptes rendus de sortie). Chacun représente un fichier de seed et un module de mise en correspondance.

Répétition : `bruno/MVHDv2/01 Patient/06 My whole record` récupère le Bundle
avec les quatre catégories et échoue de manière explicite lorsqu’une catégorie manque.

## 6. Voies d’intégration

1. **Application en marque blanche.** L’application telle quelle, renommée et signée par l’assureur,
   avec l’assureur comme exploitant : notice d’information, AIPD, contrat de sous-traitance
   pour le service d’explication hébergé (Azure OpenAI, zone de données de l’UE, par
   défaut) et le compte Apple. Le code reste open source.
2. **Composants intégrés dans une application ePA ou de DSE existante.** Le paquet Swift `Shared`
   (numérisation, le dictionnaire de 1751 codages, provenance, modules d’écriture FHIR et OMOP,
   consentements) n’a aucune dépendance tierce et est couvert par 419
   tests ; il s’intègre dans une application iOS existante. Le même dictionnaire existe en
   TypeScript (`services/epa-ingest`) pour une voie côté serveur.
3. **Côté hub uniquement.** La plateforme d’un assureur lit le dossier au format FHIR R4
   depuis l’API du hub, ou exécute la CLI d’ingestion ePA sur des PDF qu’elle détient déjà,
   sans l’application.

Dans chaque voie, l’assureur assume les rôles en matière de protection des données ; le projet
fournit les modèles et les preuves.

## 7. Ce qui reste ouvert

| Point                                                                         | Qui le clôt                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------- |
| Test d’intrusion indépendant, liste des écarts TR-03161                       | un laboratoire reconnu par le BSI           |
| Exactitude du pilote sur des comptes rendus réels                             | le pilote de l’assureur, avec consentements |
| Qualification MDR écrite, avis externe                                        | un conseil en réglementation                |
| AIPD, registre des activités de traitement, rôle de responsable du traitement | l’exploitant                                |
| Sections de la page de profil pour les nouveaux types de résultats            | le projet                                   |
| Suite Swift dans la CI (nécessite des droits sur les workflows)               | le propriétaire du dépôt                    |

## 8. Vérifiez par vous-même

```bash
git clone https://github.com/ma3u/MinimumViableHealthDataspacev2 && cd MinimumViableHealthDataspacev2
cd clients/ios && swift test                                   # 419 tests, incl. the benchmark and the posture tests
cd ../.. && scripts/security/scan-repo.sh                      # SBOM check, grype, trivy, gitleaks, semgrep, hadolint, npm audit
scripts/security/check-hub-blackbox.sh                         # the live hub from outside, office hours Mon-Fri 05:17-18:13 UTC
./scripts/run-api-tests.sh Local "01 Patient"                  # the record as an integrator receives it
```

Documents : [`evidence.md`](evidence.md), [`self-assessment.md`](self-assessment.md),
[`run-on-mac.md`](run-on-mac.md), [`security-test-report-2026-10-15.md`](../security/security-test-report-2026-10-15.md),
[`threat-model-klarbefund.md`](../security/threat-model-klarbefund.md),
[ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md).
