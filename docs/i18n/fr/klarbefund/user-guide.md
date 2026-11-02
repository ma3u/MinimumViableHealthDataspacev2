---
source: docs/klarbefund/user-guide.md
sourceHash: 24429d590488e64628ed0a7526474932a5704fb0e947dee10cd5df5912d6ba82
language: fr
summary: "L’app telle qu’une personne l’utilise, écran par écran avec captures : saisir un compte rendu, vérifier une valeur avec le papier, tendances, consentements, connexion à l’EEDS, exports et vos droits sur vos données."
---

# Guide d’utilisation de Klarbefund

Klarbefund transforme un compte rendu de laboratoire sur papier en valeurs que vous pouvez lire, comparer avec
le papier et suivre dans le temps. Tout se déroule sur le téléphone : la numérisation, la
lecture, le codage, le stockage et les exports. Rien ne nécessite de compte, et
rien ne quitte l’appareil, sauf si vous l’envoyez.

Ce guide parcourt l’application comme une personne l’utilise, tâche par tâche. Le
côté développement (compilation, tests, dictionnaire partagé, organisation du stockage) fait l’objet du
[guide du développeur](developer-guide.md). Le travail est suivi dans le
[ticket #186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186).

Chaque capture d’écran de ce guide montre des données inventées. Le laboratoire, le
cabinet, le patient et chaque nombre proviennent du jeu de données de développement fictif
de l’application, de sorte qu’une capture d’écran peut être publiée sans qu’un compte rendu réel
ait jamais été impliqué. La manière dont elles sont réalisées est expliquée à la
[fin de ce guide](#how-these-screenshots-are-made).

| Nom de l’application  | Klarbefund, en anglais et en allemand                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Fonctionne sur        | iPhone, iOS 26 ou ultérieur                                                                                                        |
| Obtenir l’application | [Bêta publique TestFlight](https://testflight.apple.com/join/ssADSXX6), 200 places                                                 |
| Langues               | Anglais et allemand, selon la langue du téléphone                                                                                  |
| Code source           | [`clients/ios/`](../../clients/ios/)                                                                                               |
| Confidentialité       | [Politique de confidentialité](https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html)                      |
| Pas                   | un dispositif médical : elle explique ce qu’est une mesure et ne juge jamais une valeur ([voir ci-dessous](#not-a-medical-device)) |

## Premiers pas

1. Sur l’iPhone, ouvrez le [lien TestFlight](https://testflight.apple.com/join/ssADSXX6).
   TestFlight s’installe d’abord s’il est absent, puis propose Klarbefund.
2. Ouvrez Klarbefund. Il n’y a ni inscription ni compte : l’application est prête pour
   la première numérisation.
3. Lors de la première numérisation, iOS demande l’accès à l’appareil photo. L’application ne l’utilise que pour
   les pages d’un compte rendu et pour le code QR qui la relie à votre dossier ;
   les photographies restent sur le téléphone.

**Le verrouillage.** Par défaut, l’application demande Face ID, Touch ID ou le code
chaque fois qu’elle passe au premier plan, afin que vos résultats ne soient pas visibles par
quiconque tient le téléphone déverrouillé. L’interrupteur se trouve sous **Fournisseur d’analyse**
dans le menu **⋯**, section **Protection**. Un téléphone sans code n’a
rien à demander, et le verrouillage s’ouvre alors de lui-même.

## Vos comptes rendus

<img src="img/list.png" width="300" alt="La liste des comptes rendus, une ligne par compte rendu avec le laboratoire, la date, le nombre de valeurs et un badge de provenance">

L’écran d’accueil liste chaque compte rendu, le plus récent en premier : le titre, le laboratoire,
le cabinet ou l’appareil dont il provient, la date du prélèvement et le nombre de valeurs
lues. **1 à vérifier** signale un compte rendu comportant une valeur que vous n’avez pas encore
comparée avec le papier.

Le badge coloré indique la **provenance** du compte rendu, et elle compte plus qu’il n’y
paraît. **Émis par le laboratoire, définitif** signifie que les valeurs proviennent d’un PDF qui contenait
le texte propre du laboratoire, de sorte que rien n’a été deviné. **Numérisé, préliminaire**
signifie que les valeurs ont été lues sur une photographie, d’une feuille de papier ou de
l’écran d’un appareil, et qu’une photographie peut être mal lue. Une valeur reste préliminaire
jusqu’à ce que vous l’ayez comparée avec l’original.

Le haut de la liste regroupe ce qui sert à consulter vos comptes rendus : **Tendances**,
**Mon dossier EEDS** avec l’état de votre connexion, et **Doublons
possibles** lorsque deux comptes rendus semblent identiques. Le bouton **+** lance
une numérisation, une importation ou des **Mesures antérieures** saisies à la main. Le bouton **⋯**
contient les réglages et vos droits sur vos données, en trois groupes : _À propos
de vous_ (profil, valeurs de référence), _Confidentialité et partage_ (consentements, fournisseur d’analyse, confidentialité et sécurité) et _Vos données_ (export, suppression et, sous
_Recherche et assistance_, l’export OMOP et les diagnostics).

## Ajouter un compte rendu

Il existe trois manières, et c’est le document qui détermine ce que valent ses valeurs.

- **Numériser un compte rendu** ouvre l’appareil photo pour un compte rendu sur papier. L’application détecte les bords
  de la page, lit le tableau sur l’appareil et conserve les pages sous forme de PDF à côté des
  valeurs. Les comptes rendus de plusieurs pages ne posent aucun problème.
- **Importer un PDF ou une photo** reprend un fichier que votre laboratoire ou votre portail vous a remis. Si
  le PDF contient la couche de texte propre du laboratoire, les valeurs sont marquées comme
  définitives ; un PDF qui n’est qu’une image passe par la reconnaissance de texte comme une numérisation.
- **Importer depuis Photos** reprend des photographies déjà présentes sur le téléphone, jusqu’à douze
  à la fois.

L’application lit plus que des feuilles de laboratoire. Une **mesure ambulatoire de la pression
artérielle sur 24 heures**, un **ECG de repos ou d’effort**, un **compte rendu de Holter**, une
**spirométrie**, un **test de lactate**, un **profil glycémique CGM**, une **ostéodensitométrie DXA**
et une **analyse du microbiote intestinal** disposent chacun de leur propre lecteur, de sorte que les valeurs qu’un
cabinet imprime sur ces feuilles arrivent avec les bons codes et les bonnes unités.

Une **balance à impédancemétrie** photographiée dans une salle de sport est reconnue pour ce qu’elle
est : un tableau de bord, pas un compte rendu. L’application lit l’indicateur, sa valeur actuelle et
la date affichée par la balance, et lorsque la balance trace un historique, elle mesure les
points sur le graphique et marque ces valeurs comme des estimations. Les propres
verdicts de la balance (« Normal », « Bas ») sont ignorés ; ce sont les plages du fabricant, pas
celles d’une recommandation.

Avant tout enregistrement, l’application montre ce qu’elle a lu et vous demande de confirmer
la date de laboratoire qu’elle a trouvée sur la feuille. Un compte rendu qui ressemble à un compte rendu que vous
avez déjà est signalé ; **Doublons possibles**, en haut de la liste,
apparaît dès que deux comptes rendus enregistrés semblent identiques.

## Vérifier un compte rendu, valeur par valeur

<img src="img/detail.png" width="300" alt="Un compte rendu : le laboratoire, les dates et le numéro du compte rendu lus sur la feuille, puis chaque valeur avec son code LOINC, la plage imprimée, la page et la ligne, et la plage publiée">

Le haut d’un compte rendu reprend ce que l’application a lu dans l’en-tête de la feuille : le
laboratoire, la date du prélèvement, la date d’émission du compte rendu, le
numéro du compte rendu et un lien vers les pages originales.

Viennent ensuite toutes les mesures et, sous chacune, les quatre éléments qui la rendent
vérifiable :

- **le code LOINC** auquel elle a été associée, afin que la valeur ait la même signification dans
  tous les systèmes vers lesquels elle est exportée. C’est l’unité qui choisit le code, jamais le nom :
  la lipoprotéine(a) en mg/dL et en nmol/L sont des mesures différentes avec
  des codes différents. Une grandeur que LOINC ne code pas l’indique clairement au lieu
  d’afficher un code approchant, et un organisme issu d’une analyse de selles affiche à la place son
  identifiant NCBI Taxonomy, car LOINC nomme des tests et non des organismes ;
- **la plage de référence imprimée par votre laboratoire**, exactement telle qu’imprimée, jamais
  normalisée ;
- **la page et la ligne** d’où elle a été lue, afin que chaque nombre puisse être comparé
  avec le papier que vous avez sous les yeux ;
- **la plage publiée**, lorsqu’une recommandation ou une étude nommée en indique une, avec
  des mots et un symbole à côté de la couleur : « dans la plage optimale », « hors de
  la plage optimale », « hors de la plage de la recommandation ». Il s’agit d’une comparaison avec un
  nombre que quelqu’un a publié. Ce n’est pas un constat médical.

**Comparer avec le papier.** Touchez une valeur pour corriger son nom, son nombre ou son
unité ; la correction est conservée à côté de ce que la reconnaissance de texte a lu, de sorte que la trace papier
demeure. **Marquer toutes les valeurs comme vérifiées** fait passer les valeurs du compte rendu de
préliminaires à vérifiées une fois que vous les avez comparées. Un compte rendu dont des valeurs
restent à vérifier porte la mention **à vérifier** dans la liste.

Sous les valeurs reconnues figurent deux listes que l’application ne masque jamais : les lignes qui
ressemblaient à des mesures mais ne correspondaient à rien dans le dictionnaire, et les lignes
qui n’ont pas pu être lues du tout. Une ligne qui disparaîtrait silencieusement serait
impossible à distinguer d’une ligne qui n’a jamais été imprimée ; aucune ligne ne disparaît donc.
**Signaler des valeurs manquantes**, dans le menu du compte rendu, envoie aux développeurs les
libellés de ces lignes, jamais les valeurs, afin que le dictionnaire puisse s’enrichir.

Le bouton de partage propose les exports décrits plus bas. Le menu vous permet de
relire le compte rendu avec la version actuelle du lecteur, de numériser à nouveau le papier,
de modifier son nom et son laboratoire, d’exporter ses diagnostics ou de le supprimer.

## Les pages originales

<img src="img/scan.png" width="300" alt="Les pages enregistrées d’un compte rendu, affichées telles que numérisées">

Chaque compte rendu conserve ses pages, sous la forme d’un seul PDF, chiffré comme les valeurs. **Numérisation
originale** les affiche à nouveau, de sorte que la source est toujours à un toucher de la lecture.

## Tendances

<img src="img/trends.png" width="300" alt="L’écran des tendances : un graphique par mesure, classé selon l’écart entre la dernière valeur et sa plage">

**Tendances** trace un graphique par mesure sur l’ensemble des comptes rendus, classé selon
ce qui s’écarte le plus de sa plage. Les filtres le restreignent à l’essentiel : uniquement
les analytes mesurés plus d’une fois, ou uniquement ceux situés hors d’une plage.

Chaque graphique indique ce qu’il montre. Chaque type de preuve a sa propre forme :
un cercle provient du fichier propre d’un laboratoire, un losange a été lu sur une
photographie et est préliminaire, et un triangle a été saisi par vous ou repris
d’un appareil. Une légende sous chaque graphique qui les mélange nomme chaque forme en
toutes lettres, de sorte que rien ne dépend de la couleur ni du fait de toucher un point. La bande verte est
la plage optimale publiée lorsqu’elle existe ; pour tout le reste, la bande
tracée est la plage imprimée par votre propre laboratoire, dans sa propre couleur et désignée comme
telle. Sous le graphique, chaque point est listé avec sa date, sa provenance
et le compte rendu auquel il appartient, et toucher un point ouvre ce compte rendu.

Une phrase sous chaque graphique indique **ce qu’est la mesure** : une définition
du test, en anglais ou en allemand. Ce n’est jamais une interprétation de votre propre valeur.

En bas, **Afficher les tendances d’Apple Health** lit votre fréquence cardiaque
au repos, votre variabilité de la fréquence cardiaque, vos pas et votre poids, après avoir demandé une seule fois
l’autorisation. Elles apparaissent dans leur propre section, **De vos appareils**, sous forme de lignes grises
en pointillés de moyennes hebdomadaires sur les mêmes mois que vos comptes rendus, avec une fine
ligne bleue le jour de chaque compte rendu afin de pouvoir lire les deux l’un par rapport à l’autre.
Elles ne sont jamais tracées comme une valeur de laboratoire : pas de plage, pas de comparaison, aucune couleur qui
signifie quelque chose, et elles n’entrent dans aucun export. L’application les lit tant que
l’écran est ouvert, n’écrit rien dans Santé et n’en conserve aucune copie.

## Valeurs de référence

<img src="img/reference.png" width="300" alt="Valeurs de référence : une fiche par mesure avec le seuil de la recommandation et la plage optimale par unité, chacun avec sa source">

**Valeurs de référence** est le tableau qui se trouve derrière les plages. Une fiche par mesure,
une ligne par unité, deux colonnes : **Recommandation**, le seuil qu’un organisme émettant des recommandations
fixe pour les adultes, et **Optimal**, la plage de moindre risque que la même source
indique. Chaque fiche nomme sa source et renvoie vers celle-ci ; lorsqu’une source
distingue par niveau de risque ou par âge, la fiche l’indique et laisse le choix du
niveau à un clinicien.

Une mesure sans source citable est tout simplement absente. C’est la différence
avec les tableaux de longévité dont cet écran s’est inspiré, qui citent des nombres
que personne ne peut vérifier. Le menu des catégories restreint la liste à un panel, et indiquer
votre sexe dans le profil ajoute les plages qui diffèrent selon le sexe.

## Profil et mesures antérieures

<img src="img/profile.png" width="300" alt="Le profil : sexe, date de naissance et taille, puis tour de taille, poids et graisse viscérale avec la date de chaque mesure"> <img src="img/history.png" width="300" alt="Mesures antérieures : une date par ligne avec le tour de taille et le poids mesurés ce jour-là">

Le **profil** contient le sexe, la date de naissance et la taille, utilisés uniquement pour choisir les
plages publiées qui vous concernent, ainsi que les mesures corporelles : tour de taille, poids
et graisse viscérale. Chaque mesure conserve sa propre date et indique sa
provenance. Une valeur lue sur la photographie d’une balance est signalée comme telle ; une valeur que vous saisissez
est signalée comme saisie par vous.

**Mesures antérieures**, dans le menu **+**, sert à rattraper le passé : une date par ligne, avec tout
ce que vous avez mesuré ce jour-là. L’enregistrement stocke chaque date comme un compte rendu distinct, marqué comme
saisi par vous, et calcule l’IMC et le rapport tour de taille/taille à partir de la
taille indiquée dans le profil. Ces mesures rejoignent les tendances et les exports par le même
chemin que les valeurs d’un laboratoire.

## Demander ce qu’est une valeur

<img src="img/consent.png" width="300" alt="Envoyer pour analyse : les valeurs à envoyer, chacune avec son code, une mention indiquant qu’elles restent sur cet iPhone, et la question"> <img src="img/settings.png" width="300" alt="Fournisseur d’analyse : le verrouillage Face ID, puis sur cet iPhone, le service Klarbefund, votre propre Azure OpenAI ou votre propre clé Anthropic">

Vous pouvez demander à l’application d’expliquer un ensemble de valeurs. Par défaut, c’est le modèle présent sur
l’iPhone qui répond, de sorte que la question n’atteint jamais aucun réseau.

Si vous préférez utiliser un service, vous choisissez les valeurs, les voyez listées avec
leurs codes et confirmez avant tout envoi. Seules ces valeurs et votre
question sont transmises. Votre nom, votre date de naissance et votre numéro d’assurance ne sont jamais
envoyés, car l’application ne les détient pas ; ils peuvent figurer sur la page
numérisée, qui reste sur le téléphone. Le fournisseur utilisé est nommé à
l’écran avant l’envoi.

**Fournisseur d’analyse**, dans le menu, détermine d’où provient une réponse : de cet
iPhone, du service Klarbefund dans l’UE, ou de votre propre ressource Azure OpenAI ou
clé Anthropic. Avec votre propre service, le téléphone communique directement avec lui, et
ni la clé ni les valeurs n’atteignent le fournisseur de cette application. Le même
écran contient l’interrupteur **Protection** pour le verrouillage Face ID.

## Consentements

<img src="img/consents.png" width="300" alt="Consentements : participation à une étude, opposition à l’ePA et utilisation pour un registre, chacun avec son propre état, son détenteur, sa date et son bouton">

**Consentements**, dans le menu, tient votre propre registre de trois décisions qui sont
faciles à confondre et ne doivent jamais être un seul interrupteur :

- **Participation à une étude**, votre consentement à une étude, détenu par le centre d’étude ;
- **Dossier patient électronique (ePA)**, une _opposition_, car l’ePA existe
  à moins que vous ne vous y opposiez auprès de votre assurance maladie ;
- **Utilisation pour un registre et la recherche**, votre consentement à ce qu’un registre ou une base de données
  de recherche utilise vos valeurs.

Chacun a son propre état, sa date, son détenteur et son bouton, et modifier l’un ne
modifie jamais un autre. Un retrait conserve l’octroi antérieur dans l’historique, de sorte que vous pouvez
toujours montrer quand vous l’aviez donné. L’application ne prévient personne : pour en donner ou en retirer un,
contactez celui qui le détient. Deux endroits utilisent ce registre. **Exporter pour la recherche**
demande une fois avant l’export lorsqu’aucun consentement pour un registre n’est enregistré, et **Partager
pour mon médecin** vous rappelle, si vous avez enregistré une opposition à l’ePA, qu’il
n’existe pas d’ePA vers laquelle téléverser tant qu’elle est maintenue.

## Se connecter à l’EEDS

<img src="img/connect.png" width="300" alt="Se connecter à l’EEDS : créer un compte, se connecter avec un compte ou se connecter par code QR depuis l’écran patient">

**Mon dossier EEDS**, en haut de la liste, indique si l’application est connectée
et envoie des données, et ouvre **Se connecter à l’EEDS**, qui relie l’application à votre dossier dans le
hub de démonstration de l’espace européen des données de santé, afin qu’elle puisse le lire et, si vous le décidez,
le compléter. Il existe trois manières d’y accéder, et aucun mot de passe n’est saisi dans une page web
sur le téléphone :

- **Créer un compte EEDS** crée un compte doté de son propre dossier, vide, sur
  le hub de démonstration et y connecte le téléphone. Vous recevez un nom d’utilisateur et un mot de passe
  pour vous connecter également sur le site web. Apple confirme au hub que la demande
  provient de l’application authentique sur un appareil réel, c’est pourquoi un simulateur
  ne peut pas le faire.
- **Se connecter avec un compte EEDS** que vous possédez déjà.
- **Se connecter par code QR**, depuis l’écran patient sur un ordinateur :
  1. Sur l’ordinateur, ouvrez l’écran patient (l’application affiche l’adresse, à
     copier, partager ou ouvrir) et connectez-vous en tant que patient. Choisissez **Afficher le code QR**.
  2. Dans l’application, **Scanner le code QR**. Sur l’ordinateur, **Approuvez sur cet
     ordinateur** ouvre la page de consentement de Keycloak ; vérifiez que le code qui y est affiché
     est celui que montre l’application, puis approuvez.
  3. L’application indique à quel compte elle s’est connectée et demande **Est-ce votre
     compte ?** Un code que quelqu’un d’autre vous aurait montré connecterait le téléphone à
     son compte ; si le nom n’est pas le vôtre, choisissez donc **Ce n’est pas moi,
     déconnecter**.

Une fois connecté, **Afficher mon dossier EEDS** liste ce que le hub détient à votre sujet :
les mesures avec leurs plages imprimées et leurs dates, les comptes rendus, les vaccinations et
le plan de médication. Sur le hub de démonstration, chaque dossier est synthétique, et
l’écran l’indique. Le dossier est lu lorsque vous l’ouvrez, n’est conservé nulle part et n’est jamais
mélangé à vos comptes rendus numérisés.

Deux interrupteurs décident de ce qui part dans l’autre sens, et tous deux sont désactivés jusqu’à ce que vous
les activiez :

- **Envoyer mes comptes rendus vers mon dossier EEDS** : tant qu’il est activé, chaque compte rendu que vous
  numérisez ou relisez est envoyé vers votre propre dossier, sous forme de valeurs préliminaires marquées comme
  lues à partir d’une numérisation. Les valeurs sans code LOINC restent sur le téléphone.
- **Envoyer les tendances de mes appareils vers mon dossier EEDS** : les moyennes hebdomadaires d’Apple
  Health que montre l’écran Tendances, jamais un seul jour ni une seule
  mesure ; chaque synchronisation remplace la précédente.

Désactiver l’un ou l’autre arrête les envois ultérieurs ; ce qui a été envoyé reste dans le dossier
jusqu’à ce que vous supprimiez le compte. **Déconnecter** se trouve dans l’application et sur l’écran
patient, où chaque téléphone connecté est listé. Sur un téléphone qui affiche lui-même l’écran
patient, **Ouvrir dans Klarbefund** a le même effet que le code QR, et l’application
Appareil photo de l’iPhone ouvre également Klarbefund à partir du code. Le code fonctionne une seule fois,
pendant deux minutes.

### Votre EUDI Wallet, si vous en voulez une

Une EUDI Wallet est facultative. Klarbefund et le hub fonctionnent avec un nom d’utilisateur et un
mot de passe seuls. Une wallet ajoute une seconde manière de se connecter sur le site web : d-you,
l’EUDI Wallet allemande, ou toute autre wallet certifiée, prouve votre identité avec
votre PID (votre carte d’identité numérique) au lieu d’un mot de passe.

Le hub ne conserve jamais votre nom ni votre date de naissance. Il en conserve une empreinte
sécurisée (hash) sur le compte, qui indique seulement « ce PID appartient à ce compte »
([ADR-067](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-067-a-pid-links-to-an-account-by-a-keyed-fingerprint.md)).
Un PID appartient à un seul compte ; décidez donc par où vous commencez.

**Vous avez d’abord Klarbefund et ajoutez la wallet plus tard**

1. Dans l’application, **Se connecter à l’EEDS › Créer un compte EEDS** vous donne un
   nom d’utilisateur `kb-…` et un mot de passe. **Afficher le mot de passe** ou **Copier le mot de passe**
   l’affiche à nouveau.
2. Sur un ordinateur, ouvrez le site web et choisissez **Se connecter avec Keycloak**, avec
   ce nom d’utilisateur et ce mot de passe. Pas **Se connecter avec d-you** : la wallet ne peut
   ouvrir qu’un compte auquel elle est déjà connectée, et celui-ci ne l’est pas encore.
3. Ouvrez **Profil de santé › Connecter votre portefeuille EUDI**, choisissez **Connecter votre
   portefeuille EUDI** et scannez le code QR avec d-you.
4. d-you nomme le service et demande trois éléments : les prénoms, le nom de
   famille et la date de naissance. Approuvez-les avec votre code Digital ID.
5. La page indique **d-you est connecté**. Désormais, **Se connecter avec d-you**
   ouvre ce compte, et l’application reste connectée comme auparavant.

**Vous avez d’abord la wallet et ajoutez Klarbefund plus tard**

1. Sur le site web, choisissez **Se connecter avec d-you (QR)** et scannez le code.
   Approuvez les trois mêmes éléments.
2. Aucun compte n’appartient encore à votre PID ; la page propose donc **Créer un compte
   avec ce PID**. Ne le choisissez que si vous n’avez pas de compte Klarbefund : si vous
   en avez un, connectez plutôt la wallet à celui-ci comme indiqué ci-dessus, car votre PID
   ne peut pas appartenir à deux comptes.
3. La page affiche un nom d’utilisateur `kb-…` et un mot de passe, une seule fois. Enregistrez les deux, puis
   **Je les ai enregistrés, me connecter**.
4. Dans l’application, **Se connecter à l’EEDS › Se connecter avec un compte EEDS** avec ce
   nom d’utilisateur et ce mot de passe. L’application et la wallet ouvrent désormais le même dossier.

**Déconnecter le portefeuille**, sur la même page, supprime l’empreinte ; le compte, son
dossier et la connexion de l’application sont conservés. La suppression du compte supprime l’empreinte
avec lui.

## Exports et vos droits sur vos données

Tout ce que contient l’application peut en sortir, sous la forme dont le destinataire a besoin, et
uniquement lorsque vous le décidez.

| Action                            | Pour                   | Ce que vous obtenez                                                                                                                                                                                           |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Partager pour mon médecin         | un cabinet, l’ePA      | un résumé PDF avec les pages originales en annexe, plus un bundle FHIR R4                                                                                                                                     |
| Exporter pour la recherche (OMOP) | une équipe d’analyse   | OMOP CDM v5.4 `measurement.csv`, `person.csv`, `observation_period.csv`                                                                                                                                       |
| Exporter toutes mes données       | vous, au titre du RGPD | chaque compte rendu, page, valeur, champ du profil et consentement, dans une seule archive                                                                                                                    |
| Supprimer toutes mes données      | vous                   | le stockage est effacé définitivement ; le compte que l’application a créé sur le hub, avec son dossier, ses valeurs et ses consentements, est également supprimé ; l’application l’indique avant de le faire |
| Exporter les diagnostics          | les développeurs       | le texte reconnu et les deux passes de la reconnaissance de texte, pour corriger une ligne mal lue                                                                                                            |

Le bundle FHIR contient chaque valeur avec son code LOINC, son unité UCUM, la
plage imprimée par le laboratoire (sous forme de nombres lorsqu’ils sont lisibles, et toujours sous forme
de texte imprimé dans `referenceRange.text`), ainsi que la page et la ligne d’où elle a été
lue. Une valeur lue sur une photographie est également marquée comme préliminaire dans le bundle.
L’export pour le médecin respecte la limite de 25 Mo de l’ePA avec les pages jointes.

Tout passe par la feuille de partage du système : vers l’application ePA, Fichiers,
AirDrop ou la messagerie. Il n’y a délibérément pas de téléversement propre, car il n’existe
pas d’API vers l’ePA pour une application comme celle-ci, et c’est le citoyen qui constitue le point
d’intégration.

## Confidentialité et sécurité

<img src="img/privacy.png" width="300" alt="Confidentialité et sécurité : les comptes rendus restent sur ce téléphone, rien n’est envoyé sauf si vous l’envoyez, d’où provient une explication">

Les photographies ne quittent jamais l’appareil. Les valeurs, les pages et les diagnostics sont
chiffrés individuellement avec une clé qui n’est pas disponible tant que le téléphone est
verrouillé et qui n’est jamais restaurée sur un autre appareil. Le stockage est exclu de la
sauvegarde iCloud. Lorsque l’application n’est pas au premier plan, son contenu est masqué, de sorte que le
sélecteur d’applications n’affiche rien, et le retour dans l’application demande Face ID ou le code.

Cela a été vérifié, pas supposé : le téléphone branché par câble, la copie d’un dossier
enregistré, d’un export resté dans le dossier temporaire ou de l’instantané que le système prend
de l’application échoue à chaque fois avec une erreur d’autorisation, ce qui correspond à l’aspect d’une protection
complète des fichiers vue de l’extérieur. L’évaluation complète, objectif par
objectif, est l’[auto-évaluation](self-assessment.md) ; ce qui a été testé et
comment figure dans les [preuves](evidence.md).

## Pas un dispositif médical

Klarbefund explique ce qu’est une mesure. L’application ne pose pas de diagnostic, n’évalue
pas votre risque et ne recommande aucun traitement. Aucun écran n’indique normal ou
anormal, n’attribue de score ni ne donne de conseil. Une valeur lue sur une photographie peut être
mal lue et est marquée comme préliminaire jusqu’à ce que vous la compariez avec le papier.
Les plages de référence sont affichées exactement telles que votre laboratoire les a imprimées, et les
plages publiées à côté sont des citations avec une source, pas un verdict.

Consultez toujours un médecin avant de prendre toute décision concernant votre santé.

## Lorsque quelque chose est mal lu

Une reconnaissance de texte lit une photographie, et les photographies sont parfois mal lues. Trois choses
aident, dans cet ordre :

1. **Comparer avec le papier.** La page et la ligne sous chaque valeur sont là
   pour cela. Touchez la valeur pour la corriger ; la correction est conservée à côté de
   la lecture.
2. **Relire avec cette version**, dans le menu du compte rendu, après une mise à jour de
   l’application : les pages sont conservées, de sorte qu’un meilleur lecteur peut les relire. Une
   relecture qui trouve moins de valeurs que celles enregistrées est écartée, et n’écrase jamais
   la meilleure lecture.
3. **Signaler des valeurs manquantes**, dans le menu du compte rendu, envoie les libellés des
   lignes que l’application n’a pas pu coder, jamais vos nombres, afin que le dictionnaire puisse
   apprendre l’orthographe du laboratoire. **Exporter les diagnostics** vous remet une
   archive contenant le texte reconnu, à joindre à un
   [ticket](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186) ;
   elle ne quitte le téléphone que par la feuille de partage, lorsque vous l’envoyez.

## Comment ces captures d’écran sont réalisées

Les images de ce guide sont prises dans un simulateur par
[`clients/ios/Scripts/capture-screenshots.sh`](../../clients/ios/Scripts/capture-screenshots.sh),
qui lance l’application directement sur chaque écran avec le jeu de données de développement
fictif :

```bash
cd clients/ios
SEED=-MBDevData OUT=/tmp/shots \
  SCREENS="list detail scan trends reference history profile consent settings privacy consents connect" \
  Scripts/capture-screenshots.sh
for f in /tmp/shots/*.png; do sips --resampleWidth 660 "$f" --out "../../docs/klarbefund/img/$(basename "$f")"; done
```

Le jeu de données est construit dans le code, en mémoire, et est exclu de la compilation
de la version de production. Chaque laboratoire et chaque cabinet qu’il contient sont inventés et chaque valeur est
fictive, ce qui est la seule raison pour laquelle une capture d’écran peut être commitée : la règle du
[guide du développeur](developer-guide.md#two-rules-that-are-not-negotiable) veut
qu’aucune donnée de santé réelle n’entre dans le dépôt, pas même sous forme d’image, pas
même temporairement.
