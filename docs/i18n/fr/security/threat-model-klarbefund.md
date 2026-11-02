---
source: docs/security/threat-model-klarbefund.md
sourceHash: 1ceeaff87c54101e16f2d380ce062cdedff21add41e30c2256406c9c72351e5a
language: fr
summary: "Analyse STRIDE de l’app iPhone ; chaque mesure cite le code ou le test qui la prouve."
---

# Modèle de menaces : Klarbefund, l’application iPhone

Le modèle de menaces du hub est [`threat-model.md`](threat-model.md). Celui-ci
concerne l’application dans `clients/ios`, qui s’exécute sur le téléphone
d’une personne, contient ses valeurs de laboratoire et n’envoie rien nulle
part sans que cette personne le demande. Rédigé le 2026-10-15 sur la base du
commit `64737039` ; chaque mesure d’atténuation cite le code ou le test qui la
démontre, et `clients/ios/Tests/SharedTests/SecurityPostureTests.swift`
verrouille celles qui relèvent des paramètres de build. STRIDE, comme dans le
modèle du hub.

## Contexte système

```
   compte rendu papier ──appareil photo───▶ ┌─────────────────────────────────┐
   PDF du laboratoire ──fichiers/partage──▶ │ Klarbefund (iOS 26, Swift 6)    │
   Apple Health ──lecture─────────────────▶ │ OCR · codage · stockage AES-GCM │
                                            └──────┬──────────┬───────────────┘
                           facultatif, consentement│          │facultatif, consentement
                                                   ▼          ▼
                                 ┌───────────────────┐   ┌──────────────────────────────┐
                                 │ hub EEDS          │   │ service d’explication        │
                                 │ (ADR-049/054/057) │   │ sur l’appareil par défaut ;  │
                                 │ OIDC+PKCE, App    │   │ hébergé : Azure OpenAI, zone │
                                 │ Attest, Bearer    │   │ de données UE, ou clé propre │
                                 └───────────────────┘   └──────────────────────────────┘
```

Frontières de confiance : l’appareil (Secure Enclave, Data Protection, bac à
sable de l’application) est considéré comme fiable tel qu’Apple le fournit.
Tout ce qui quitte l’appareil franchit une frontière, et ne le fait qu’après
un consentement que la personne a donné pour cette finalité.

## Actifs

| Actif                                                    | Emplacement                                              | Pourquoi c’est important                                                                |
| -------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Valeurs de laboratoire, comptes rendus, images des pages | le stockage, `ReportStore.swift`                         | Données de santé au sens de l’art. 9 du RGPD                                            |
| La clé du stockage                                       | Trousseau (Keychain), `WhenUnlockedThisDeviceOnly`       | déchiffre tout ce qui précède                                                           |
| Jetons du hub (device grant, jeton de l’application)     | Trousseau (Keychain), `ThisDeviceOnly`, `EHDSConnection` | accès en écriture au propre dossier de la personne dans le hub                          |
| Clé App Attest                                           | Secure Enclave, `DeviceCheck`                            | prouve au hub qu’il s’agit d’une application authentique lors de la création de comptes |
| Consentements et leur historique                         | `Consents.swift`                                         | la base juridique de chaque transfert                                                   |
| Export de diagnostic                                     | écrit uniquement sur demande, ADR-038                    | contient des valeurs ; ne doit jamais entrer dans le dépôt                              |

## STRIDE

### Spoofing (usurpation d’identité)

| Menace                                                                                                           | Atténuation                                                                                                                                               | Statut    |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Une fausse application crée des comptes sur le hub ou envoie des données en se faisant passer pour l’application | La création de compte exige une attestation Apple App Attest que le hub vérifie (ADR-054) ; chaque appel ultérieur porte le jeton de l’application        | satisfait |
| Un faux hub collecte des jetons                                                                                  | Découverte OIDC uniquement auprès de l’émetteur configuré, PKCE S256, `ASWebAuthenticationSession` ; ATS interdit le texte en clair (`OIDCSession.swift`) | satisfait |
| Un faux service d’explication lit des valeurs                                                                    | Le fournisseur est nommé dans la demande que la personne approuve (`CloudConsentSheet.swift`) ; HTTPS imposé par ATS                                      | satisfait |
| Une autre personne devant le téléphone déverrouillé                                                              | Verrouillage de l’application : Face ID, Touch ID ou le code avant que le cache ne se lève, activé par défaut (`AppLock.swift`, ADR-060)                  | satisfait |

### Tampering (falsification)

| Menace                                                         | Atténuation                                                                                                                                                    | Statut    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Enregistrements stockés modifiés sur le disque ou via un câble | Chaque enregistrement scellé par AES-GCM (authentifié), clé dans le trousseau ; un test par câble n’a pu copier aucune donnée stockée                          | satisfait |
| Une valeur mal lue traitée comme un résultat de laboratoire    | La provenance maintient les valeurs OCR à `preliminary` ; seule la couche texte d’un PDF émis par le laboratoire lui-même produit `final` (`Provenance.swift`) | satisfait |
| Un build altéré                                                | App Attest prouve l’application au hub, pas à elle-même ; détection de jailbreak et de débogueur refusée avec justification (ADR-060)                          | accepté   |
| Une dépendance avec une porte dérobée                          | Aucun paquet tiers (`Package.swift`, `project.yml`, `docs/sbom/klarbefund-ios.cdx.json`)                                                                       | satisfait |

### Repudiation (répudiation)

| Menace                                           | Atténuation                                                                                                                                  | Statut    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| « Je n’ai jamais consenti à ce transfert »       | Événements de consentement avec l’heure, le détenteur de données de santé et la date d’effet, révocables, avec historique (`Consents.swift`) | satisfait |
| Ce qui a été envoyé ne peut pas être reconstitué | Une synchronisation est un Bundle FHIR avec une empreinte SHA-256 que l’application enregistre (`EHDSConnection.swift`, ADR-057)             | satisfait |

### Information disclosure (divulgation d’informations)

| Menace                                                             | Atténuation                                                                                                                                                                                              | Statut    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Des valeurs quittent l’appareil sans l’intervention de la personne | OCR, codage, analyse et export sur l’appareil ; les seuls appels réseau sont les deux appels facultatifs ci-dessus, chacun soumis à son propre consentement                                              | satisfait |
| Les sauvegardes ou iCloud emportent le stockage                    | Stockage exclu de la sauvegarde ; `NSFileProtectionComplete` par défaut ; exports et diagnostics écrits avec la protection complète                                                                      | satisfait |
| Le sélecteur d’applications affiche des valeurs                    | `PrivacyCover.swift` masque la fenêtre lorsque l’application n’est pas active                                                                                                                            | satisfait |
| Les journaux contiennent des valeurs                               | Les lignes de journal ne contiennent que des comptages et des codes (`Logging.swift`)                                                                                                                    | satisfait |
| Une question envoyée au cloud identifie la personne                | Au plus 40 valeurs, ni nom, ni date de naissance, ni numéro d’assurance ; le service applique les mêmes règles (`CloudAnalysis.swift`, ADR-034)                                                          | satisfait |
| Transfert vers un pays tiers                                       | Par défaut sur l’appareil ; par défaut en mode hébergé, Azure OpenAI dans la zone de données de l’UE ; l’option Anthropic est à activer explicitement (opt-in) et indique « United States » (États-Unis) | partiel   |
| Captures d’écran ou enregistrement de l’écran                      | Non empêchés (iOS ne permet aucun blocage fiable)                                                                                                                                                        | accepté   |

### Denial of service (déni de service)

| Menace                                   | Atténuation                                                                                                                                                                | Statut    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Le hub est hors service                  | L’application fonctionne sans le hub ; le dossier est sur l’appareil                                                                                                       | satisfait |
| Un scan malveillant submerge l’analyseur | Vision et l’analyseur travaillent sur des images de taille bornée ; un scan dégradé perd des lignes, il ne bloque jamais (`ScanningTests.swift`, `AccuracyBenchmarkTests`) | satisfait |
| Téléphone perdu                          | Export en quatre formats que la personne conserve ; aucune restauration depuis le hub, par conception                                                                      | accepté   |

### Elevation of privilege (élévation de privilèges)

| Menace                                               | Atténuation                                                                                                              | Statut    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| Points d’entrée de débogage dans un build de release | `-MBSelfTest`, `-MBDemoSeed`, `-MBShot` sont exclus à la compilation (`#if DEBUG`)                                       | satisfait |
| L’application écrit dans Apple Health                | Autorisation en lecture seule (`WearableSource.swift`) ; verrouillée par `SecurityPostureTests`                          | satisfait |
| Le jeton de l’application permet plus que le dossier | Le hub limite la portée du jeton au dossier sandbox de ce compte ; `isSandboxUsername` sur chaque route de l’application | satisfait |

## Risques résiduels et ce qui les clôt

1. **Verrouillage de l’application** : décidé et implémenté le 2026-10-15 (ADR-060). (TR-03161 O.Auth)
2. **Aucune détection d’altération ou de jailbreak** : refusée avec justification dans l’ADR-060 ; le stockage scellé et App Attest sont les contrôles. (O.Resi)
3. **Aucun épinglage de certificat** : refusé avec justification dans l’ADR-060 ; ATS sans domaine d’exception, rotation gérée. (O.Ntwk)
4. **Option Anthropic hébergée.** À activer explicitement, nommée à l’écran,
   mais il s’agit d’un transfert vers les États-Unis ; l’opérateur a besoin
   d’une base juridique pour ce transfert ou doit la désactiver.
5. **Test indépendant.** Ce modèle et les tests sont ceux du projet lui-même.
   Un test d’intrusion indépendant sur un build de release sur un appareil, et
   la liste des écarts de la TR-03161 au niveau des exigences, restent en
   attente ; voir
   [`security-test-report-2026-10-15.md`](security-test-report-2026-10-15.md).
