---
source: docs/klarbefund/user-guide.md
sourceHash: 24429d590488e64628ed0a7526474932a5704fb0e947dee10cd5df5912d6ba82
language: nl
---

# Gebruikershandleiding van Klarbefund

Klarbefund maakt van een papieren laboratoriumrapport waarden die u kunt lezen, kunt vergelijken met
het papier en in de loop van de tijd kunt volgen. Alles draait op de telefoon: het scannen, het
uitlezen, het coderen, de opslag en de exports. Er is geen account nodig, en
niets verlaat het apparaat tenzij u het verstuurt.

Deze handleiding loopt de app door zoals iemand hem gebruikt, taak voor taak. De
ontwikkelkant (bouwen, testen, het gedeelde woordenboek, de indeling van de opslag) staat in de
[ontwikkelaarshandleiding](developer-guide.md). Het werk wordt bijgehouden in
[issue #186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186).

Elke schermafbeelding in deze handleiding toont verzonnen gegevens. Het laboratorium, de
praktijk, de patiënt en elk getal komen uit de eigen fictieve
ontwikkeldataset van de app, zodat een schermafbeelding kan worden gepubliceerd zonder dat er ooit een echt rapport
bij betrokken was. Hoe ze worden gemaakt, staat aan het
[einde van deze handleiding](#how-these-screenshots-are-made).

| Naam van de app  | Klarbefund, in het Engels en het Duits                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Draait op        | iPhone, iOS 26 of later                                                                                                       |
| Verkrijgbaar via | [Openbare TestFlight-bèta](https://testflight.apple.com/join/ssADSXX6), 200 plaatsen                                          |
| Talen            | Engels en Duits, volgens de taal van de telefoon                                                                              |
| Broncode         | [`clients/ios/`](../../../../clients/ios/)                                                                                    |
| Privacy          | [Privacybeleid](https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html)                                |
| Geen             | medisch hulpmiddel: de app legt uit wat een meting is en beoordeelt nooit een waarde ([zie hieronder](#not-a-medical-device)) |

## Aan de slag

1. Open op de iPhone de [TestFlight-link](https://testflight.apple.com/join/ssADSXX6).
   TestFlight installeert zichzelf eerst als het ontbreekt en biedt daarna Klarbefund aan.
2. Open Klarbefund. Er is geen registratie en geen account: de app is klaar voor
   de eerste scan.
3. Bij de eerste scan vraagt iOS om toegang tot de camera. De app gebruikt die alleen voor
   de pagina’s van een rapport en voor de QR-code die de app aan uw dossier koppelt;
   de foto’s blijven op de telefoon.

**De vergrendeling.** Standaard vraagt de app om Face ID, Touch ID of de toegangscode
telkens wanneer hij op de voorgrond komt, zodat uw resultaten niet zichtbaar zijn voor
wie de ontgrendelde telefoon vasthoudt. De schakelaar staat onder **Analyseaanbieder**
in het menu **⋯**, sectie **Bescherming**. Een telefoon zonder toegangscode heeft
niets om naar te vragen, en de vergrendeling opent dan vanzelf.

## Uw rapporten

<img src="../../../klarbefund/img/list.png" width="300" alt="De lijst met rapporten, één regel per rapport met laboratorium, datum, aantal waarden en een herkomstbadge">

Het startscherm toont elk rapport, het nieuwste eerst: de titel, het laboratorium,
de praktijk of het apparaat waar het vandaan komt, de datum van afname en hoeveel waarden
er zijn uitgelezen. **1 te controleren** markeert een rapport met een waarde die u nog niet
met het papier hebt vergeleken.

De gekleurde badge is de **herkomst** van het rapport, en die is belangrijker dan
hij lijkt. **Door het lab uitgegeven, definitief** betekent dat de waarden uit een pdf kwamen die
de eigen tekst van het laboratorium bevatte, zodat er niets is geraden. **Gescand, voorlopig**
betekent dat de waarden van een foto zijn gelezen, van een papieren blad of van
het scherm van een apparaat, en een foto kan verkeerd worden gelezen. Een waarde blijft voorlopig
totdat u deze met het origineel hebt vergeleken.

Bovenaan de lijst staat wat bij het bekijken van uw rapporten hoort: **Trends**,
**Mijn EHDS-dossier** met de status van uw verbinding, en **Mogelijke
duplicaten** wanneer twee rapporten op hetzelfde rapport lijken. De knop **+** start
een scan, een import of **Eerdere metingen** die met de hand worden ingevoerd. De knop **⋯**
bevat de instellingen en uw rechten op uw gegevens, in drie groepen: _Over
u_ (profiel, referentiewaarden), _Privacy en delen_ (toestemmingen, analyseaanbieder, privacy en veiligheid) en _Uw gegevens_ (exporteren, verwijderen en, onder
_Onderzoek en ondersteuning_, de OMOP-export en de diagnostiek).

## Een rapport toevoegen

Er zijn drie manieren, en het document bepaalt wat de waarden ervan waard zijn.

- **Rapport scannen** opent de camera voor een papieren rapport. De app vindt de randen van de
  pagina, leest de tabel op het apparaat uit en bewaart de pagina’s als pdf naast
  de waarden. Rapporten van meerdere pagina’s zijn geen probleem.
- **Een pdf of foto importeren** neemt een bestand over dat uw laboratorium of portaal u heeft gegeven. Als
  de pdf de eigen tekstlaag van het laboratorium bevat, worden de waarden als
  definitief gemarkeerd; een pdf die alleen een afbeelding is, gaat net als een scan door de tekstherkenning.
- **Importeren uit Foto’s** neemt foto’s over die al op de telefoon staan, tot twaalf
  tegelijk.

De app leest meer dan laboratoriumbladen. Een **24-uursbloeddrukmeting**,
een **rust- of inspannings-ecg**, een **Holterverslag**, een
**spirometrie**, een **lactaattest**, een **CGM-glucoseprofiel**, een **DXA-scan**
en een **analyse van het darmmicrobioom** hebben elk een eigen lezer, zodat de waarden die een
praktijk op die bladen afdrukt, met de juiste codes en eenheden binnenkomen.

Een **lichaamsanalyseweegschaal** die in een sportschool is gefotografeerd, wordt herkend als wat hij
is: een dashboard, geen rapport. De app leest de meetwaarde, de huidige waarde en
de datum die de weegschaal toont, en waar de weegschaal een geschiedenis weergeeft, meet hij de
punten in de grafiek op en markeert die waarden als schattingen. De eigen
oordelen van de weegschaal (“Normaal”, “Laag”) worden genegeerd; het zijn de bereiken van de fabrikant, niet
die van een richtlijn.

Voordat er iets wordt opgeslagen, toont de app wat hij heeft gelezen en vraagt u de
laboratoriumdatum te bevestigen die hij op het blad heeft gevonden. Een rapport dat lijkt op een rapport dat u
al hebt, wordt aangegeven; **Mogelijke duplicaten**, bovenaan de lijst,
verschijnt zodra twee opgeslagen rapporten op hetzelfde rapport lijken.

## Een rapport controleren, waarde voor waarde

<img src="../../../klarbefund/img/detail.png" width="300" alt="Een rapport: het laboratorium, de data en het rapportnummer gelezen van het blad, daarna elke waarde met haar LOINC-code, het afgedrukte bereik, pagina en regel, en het gepubliceerde bereik">

Bovenaan een rapport staat wat de app uit de kop van het blad heeft gelezen: het
laboratorium, de datum van afname, de datum waarop het rapport is uitgegeven, het
rapportnummer en een link naar de originele pagina’s.

Daarna volgt elke meting, en onder elke meting de vier dingen die haar
controleerbaar maken:

- **de LOINC-code** waaraan ze is gekoppeld, zodat de waarde in
  elk systeem waarnaar ze wordt geëxporteerd hetzelfde betekent. De eenheid bepaalt de code, nooit de naam:
  lipoproteïne(a) in mg/dL en in nmol/L zijn verschillende metingen met
  verschillende codes. Een grootheid die LOINC niet codeert, zegt dat ronduit in plaats van
  een code te tonen die ongeveer past, en een organisme uit een ontlastingsonderzoek toont in plaats daarvan zijn
  NCBI Taxonomy-id, omdat LOINC tests benoemt en geen organismen;
- **het referentiebereik dat uw laboratorium heeft afgedrukt**, precies zoals afgedrukt, nooit
  genormaliseerd;
- **de pagina en de regel** waarvan ze is gelezen, zodat elk getal kan worden vergeleken
  met het papier dat voor u ligt;
- **het gepubliceerde bereik**, waar een richtlijn of een genoemde studie er een vermeldt, met
  woorden en een symbool naast de kleur: “binnen het optimale bereik”, “buiten
  het optimale bereik”, “buiten het richtlijnbereik”. Dit is een vergelijking met een
  getal dat iemand heeft gepubliceerd. Het is geen bevinding.

**Vergelijken met het papier.** Tik op een waarde om de naam, het getal of de
eenheid te corrigeren; de correctie wordt bewaard naast wat de tekstherkenning heeft gelezen, zodat het papieren spoor
blijft bestaan. **Alle waarden als gecontroleerd markeren** zet de waarden van het rapport van
voorlopig naar gecontroleerd zodra u ze hebt vergeleken. Een rapport met waarden
die nog moeten worden gecontroleerd, draagt in de lijst **te controleren**.

Onder de herkende waarden staan twee lijsten die de app nooit verbergt: de regels die
op metingen leken maar met niets in het woordenboek overeenkwamen, en de regels
die helemaal niet konden worden gelezen. Een regel die stilletjes verdween, zou
niet te onderscheiden zijn van een regel die nooit is afgedrukt, dus verdwijnt er geen enkele regel.
**Ontbrekende waarden melden** in het menu van het rapport stuurt de ontwikkelaars de
labels van zulke regels, nooit de waarden, zodat het woordenboek kan groeien.

De deelknop biedt de exports aan die verderop worden beschreven. Via het menu kunt u
het rapport opnieuw laten lezen met de huidige versie van de lezer, het papier opnieuw scannen,
de naam en het laboratorium bewerken, de diagnostiek exporteren of het rapport verwijderen.

## De originele pagina’s

<img src="../../../klarbefund/img/scan.png" width="300" alt="De opgeslagen pagina’s van een rapport, weergegeven zoals gescand">

Elk rapport bewaart zijn pagina’s, als één pdf, versleuteld zoals de waarden. **Originele
scan** toont ze opnieuw, zodat de bron altijd maar één tik van het uitgelezen resultaat verwijderd is.

## Trends

<img src="../../../klarbefund/img/trends.png" width="300" alt="Het trendscherm: één grafiek per meting, gerangschikt naar hoe ver de laatste waarde van haar bereik af ligt">

**Trends** tekent één grafiek per meting over alle rapporten heen, gerangschikt naar
wat het verst van zijn bereik af ligt. De filters beperken het tot wat ertoe doet: alleen
analyten die meer dan eens zijn gemeten, of alleen die buiten een bereik.

Elke grafiek vermeldt wat ze toont. Elk soort bewijs heeft een eigen vorm:
een cirkel kwam uit het eigen bestand van een laboratorium, een ruit is van een
foto gelezen en is voorlopig, en een driehoek is door u ingevoerd of afkomstig van
een apparaat. Een legenda onder elke grafiek die ze combineert, benoemt elke vorm in
woorden, zodat niets afhangt van kleur of van het aantikken van een punt. De groene band is
het gepubliceerde optimale bereik waar dat bestaat; voor al het andere is de getekende band
het bereik dat uw eigen laboratorium heeft afgedrukt, in een eigen kleur en als
zodanig benoemd. Onder de grafiek staat elk punt vermeld met de datum, de herkomst
en het rapport waartoe het behoort, en tikken op een punt opent dat rapport.

Een zin onder elke grafiek zegt **wat de meting is**: een definitie van
de test, in het Engels of het Duits. Het is nooit een interpretatie van uw eigen waarde.

Onderaan leest **Trends uit Apple Health tonen** uw rusthartslag,
hartslagvariabiliteit, stappen en gewicht, nadat eenmaal om
toestemming is gevraagd. Ze verschijnen in een eigen sectie, **Van uw apparaten**, als grijze
stippellijnen van weekgemiddelden over dezelfde maanden als uw rapporten, met een dunne
blauwe lijn op de dag van elk rapport, zodat de twee naast elkaar kunnen worden gelezen.
Ze worden nooit als labwaarde getekend: geen bereik, geen vergelijking, geen kleur die
iets betekent, en ze gaan in geen enkele export mee. De app leest ze zolang het
scherm open is, schrijft niets naar Gezondheid en bewaart geen kopie.

## Referentiewaarden

<img src="../../../klarbefund/img/reference.png" width="300" alt="Referentiewaarden: één kaart per meting met de drempel uit de richtlijn en het optimale bereik per eenheid, elk met de bron">

**Referentiewaarden** is de tabel achter de bereiken. Eén kaart per meting,
één regel per eenheid, twee kolommen: **Richtlijn**, de drempel die een richtlijnorganisatie
voor volwassenen vaststelt, en **Optimaal**, het bereik met het laagste risico dat dezelfde bron
noemt. Elke kaart noemt haar bron en linkt ernaar; waar een bron
onderscheid maakt naar risicoklasse of leeftijd, vermeldt de kaart dat en laat de keuze van de
klasse over aan een clinicus.

Een meting zonder citeerbare bron ontbreekt gewoon. Dat is het verschil
met de longevity-tabellen waarop dit scherm is gebaseerd, die getallen noemen
die niemand kan controleren. Het categoriemenu beperkt de lijst tot één panel, en als u
uw geslacht in het profiel instelt, worden de bereiken toegevoegd die per geslacht verschillen.

## Profiel en eerdere metingen

<img src="../../../klarbefund/img/profile.png" width="300" alt="Het profiel: geslacht, geboortedatum en lengte, daarna tailleomtrek, gewicht en visceraal vet met de datum van elke meting"> <img src="../../../klarbefund/img/history.png" width="300" alt="Eerdere metingen: één datum per regel met de tailleomtrek en het gewicht die op die dag zijn gemeten">

Het **profiel** bevat geslacht, geboortedatum en lengte, die alleen worden gebruikt om de
gepubliceerde bereiken te kiezen die op u van toepassing zijn, en de lichaamsmaten: tailleomtrek, gewicht
en visceraal vet. Elke meting bewaart haar eigen datum en vermeldt waar ze vandaan
komt. Een waarde die van de foto van een weegschaal is gelezen, is als zodanig gelabeld; een waarde die u intypt,
is gelabeld als door u ingevoerd.

**Eerdere metingen**, in het menu **+**, dient om bij te werken: één datum per regel, met alles
wat u die dag hebt gemeten. Bij het opslaan wordt elke datum als een eigen rapport bewaard, gemarkeerd als
door u ingevoerd, en worden de BMI en de taille-lengteverhouding berekend op basis van de
lengte in het profiel. Ze komen in de trends en de exports terecht via dezelfde
weg als de waarden van een laboratorium.

## Vragen wat een waarde is

<img src="../../../klarbefund/img/consent.png" width="300" alt="Versturen voor analyse: de te versturen waarden, elk met haar code, een vermelding dat ze op deze iPhone blijven, en de vraag"> <img src="../../../klarbefund/img/settings.png" width="300" alt="Analyseaanbieder: de Face ID-vergrendeling, daarna op deze iPhone, de Klarbefund-dienst, uw eigen Azure OpenAI of uw eigen Anthropic-sleutel">

U kunt de app vragen een reeks waarden uit te leggen. Standaard antwoordt het model op de
iPhone, zodat de vraag helemaal geen netwerk bereikt.

Als u liever een dienst gebruikt, kiest u de waarden, ziet u ze vermeld met
hun codes en bevestigt u voordat er iets wordt verstuurd. Alleen die waarden en uw
vraag worden verzonden. Uw naam, geboortedatum en verzekeringsnummer worden nooit
verstuurd, omdat de app ze niet bewaart; ze kunnen op de gescande
pagina staan, die op de telefoon blijft. Welke aanbieder wordt gebruikt, wordt vóór het versturen op het
scherm vermeld.

**Analyseaanbieder** in het menu bepaalt waar een antwoord vandaan komt: van deze
iPhone, van de Klarbefund-dienst in de EU, of van uw eigen Azure OpenAI-resource of
Anthropic-sleutel. Met uw eigen dienst praat de telefoon er rechtstreeks mee, en
noch de sleutel noch de waarden bereiken de aanbieder van deze app. Hetzelfde
scherm bevat de schakelaar **Bescherming** voor de Face ID-vergrendeling.

## Toestemmingen

<img src="../../../klarbefund/img/consents.png" width="300" alt="Toestemmingen: deelname aan een studie, het bezwaar tegen de ePA en gebruik voor een register, elk met een eigen status, houder, datum en knop">

**Toestemmingen**, in het menu, houdt uw eigen registratie bij van drie beslissingen die
gemakkelijk te verwarren zijn en nooit één schakelaar mogen zijn:

- **Deelname aan een studie**, uw toestemming voor een studie, bewaard door het studiecentrum;
- **Elektronisch patiëntendossier (ePA)**, een _bezwaar_, omdat de ePA bestaat
  tenzij u bij uw zorgverzekeraar bezwaar maakt;
- **Gebruik voor registers en onderzoek**, uw toestemming dat een register of een onderzoeksdatabank
  uw waarden gebruikt.

Elk heeft een eigen status, datum, houder en knop, en het wijzigen van de ene
wijzigt nooit een andere. Bij intrekking blijft de eerdere toestemming in de geschiedenis staan, zodat u
nog steeds kunt laten zien wanneer u die gaf. De app licht niemand in: om er een te geven of in te trekken,
neemt u contact op met wie haar bewaart. Twee plaatsen gebruiken de registratie. **Exporteren voor onderzoek**
vraagt eenmaal vóór het exporteren als er geen toestemming voor een register is vastgelegd, en **Delen
voor mijn arts** herinnert u eraan, als u een bezwaar tegen de ePA hebt vastgelegd, dat er
geen ePA is om naar te uploaden zolang dat bezwaar geldt.

## Verbinden met EHDS

<img src="../../../klarbefund/img/connect.png" width="300" alt="Verbinden met EHDS: een account aanmaken, inloggen met een account of verbinden via een QR-code vanaf het patiëntenscherm">

**Mijn EHDS-dossier**, bovenaan de lijst, toont of de app verbonden is
en gegevens verstuurt, en opent **Verbinden met EHDS**, waarmee de app wordt gekoppeld aan uw dossier in de
demohub van de Europese ruimte voor gezondheidsgegevens, zodat hij het kan lezen en, als u daartoe besluit,
kan aanvullen. Er zijn drie manieren om toegang te krijgen, en op de telefoon wordt geen wachtwoord in een webpagina
getypt:

- **Een EHDS-account aanmaken** maakt een account met een eigen, leeg dossier aan op
  de demohub en koppelt de telefoon eraan. U krijgt een gebruikersnaam en wachtwoord
  om ook op de website in te loggen. Apple bevestigt aan de hub dat het verzoek
  afkomstig is van de echte app op een echt apparaat, en daarom
  kan een simulator dit niet.
- **Inloggen met een EHDS-account** dat u al hebt.
- **Verbinden via QR-code**, vanaf het patiëntenscherm op een computer:
  1. Open op de computer het patiëntenscherm (de app toont het adres, om te
     kopiëren, te delen of te openen) en log in als patiënt. Kies **QR-code tonen**.
  2. In de app **QR-code scannen**. Op de computer opent **Keur goed op deze
     computer** de toestemmingspagina van Keycloak; controleer of de code die daar wordt getoond,
     dezelfde is als die de app toont, en keur goed.
  3. De app vermeldt met welk account hij verbinding heeft gemaakt en vraagt **Is dit uw
     account?** Een code die iemand anders u heeft laten zien, zou de telefoon met
     diens account verbinden; als de naam dus niet de uwe is, kiest u **Ik niet,
     ontkoppelen**.

Na het verbinden toont **Mijn EHDS-dossier tonen** wat de hub over u bewaart:
metingen met hun afgedrukte bereiken en data, rapporten, vaccinaties en
het medicatieoverzicht. Op de demohub is elk dossier synthetisch, en het
scherm vermeldt dat. Het dossier wordt gelezen wanneer u het opent, nergens bewaard en nooit
vermengd met uw gescande rapporten.

Twee schakelaars bepalen wat de andere kant op gaat, en beide staan uit totdat u
ze inschakelt:

- **Mijn rapporten naar mijn EHDS-dossier sturen**: zolang deze aan staat, gaat elk rapport dat u
  scant of opnieuw laat lezen naar uw eigen dossier, als voorlopige waarden die gemarkeerd zijn als
  gelezen uit een scan. Waarden zonder LOINC-code blijven op de telefoon.
- **Mijn apparaattrends naar mijn EHDS-dossier sturen**: de weekgemiddelden uit Apple
  Health die het scherm Trends toont, nooit een enkele dag of een enkele
  meting; elke synchronisatie vervangt de vorige.

Als u een van beide uitschakelt, stopt het verdere versturen; wat is verstuurd, blijft in het dossier
totdat u het account verwijdert. **Ontkoppelen** staat in de app en op het patiëntenscherm,
waar elke gekoppelde telefoon wordt vermeld. Op een telefoon die zelf het patiëntenscherm
toont, doet **Openen in Klarbefund** hetzelfde als de QR-code, en ook de
camera-app van de iPhone opent Klarbefund via de code. De code werkt één keer,
gedurende twee minuten.

### Uw EUDI Wallet, als u er een wilt

Een EUDI Wallet is optioneel. Klarbefund en de hub werken met alleen een gebruikersnaam en
wachtwoord. Een wallet voegt een tweede manier toe om op de website in te loggen: d-you,
de Duitse EUDI Wallet, of elke andere gecertificeerde wallet, bewijst wie u bent met
uw PID (uw digitale identiteitskaart) in plaats van met een wachtwoord.

De hub bewaart nooit uw naam of geboortedatum. Hij bewaart er één beveiligde hash
van bij het account, die alleen zegt “deze PID hoort bij dit account”
([ADR-067](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-067-a-pid-links-to-an-account-by-a-keyed-fingerprint.md)).
Eén PID hoort bij één account, dus bepaal waar u begint.

**U hebt eerst Klarbefund en voegt de wallet later toe**

1. In de app geeft **Verbinden met EHDS › Een EHDS-account aanmaken** u een
   gebruikersnaam `kb-…` en een wachtwoord. **Wachtwoord tonen** of **Wachtwoord kopiëren**
   toont het opnieuw.
2. Open op een computer de website en kies **Inloggen met Keycloak**, met
   die gebruikersnaam en dat wachtwoord. Niet **Inloggen met d-you**: de wallet kan alleen
   een account openen waaraan hij al gekoppeld is, en dit account is dat nog niet.
3. Open **Gezondheidsprofiel › Uw EUDI-wallet koppelen**, kies **Uw EUDI-wallet
   koppelen** en scan de QR-code met d-you.
4. d-you noemt de dienst en vraagt om drie gegevens: voornamen, achternaam
   en geboortedatum. Keur ze goed met uw Digital ID-code.
5. De pagina meldt **d-you is gekoppeld**. Vanaf nu opent **Inloggen met d-you**
   dit account, en de app blijft verbonden zoals voorheen.

**U hebt eerst de wallet en voegt Klarbefund later toe**

1. Kies op de website **Inloggen met d-you (QR)** en scan de code.
   Keur dezelfde drie gegevens goed.
2. Er hoort nog geen account bij uw PID, dus biedt de pagina **Account aanmaken
   met deze PID** aan. Kies dit alleen als u geen Klarbefund-account hebt: als u
   er een hebt, koppelt u in plaats daarvan de wallet eraan zoals hierboven beschreven, omdat uw PID
   niet bij twee accounts kan horen.
3. De pagina toont eenmalig een gebruikersnaam `kb-…` en een wachtwoord. Bewaar beide en kies daarna
   **Opgeslagen, log me in**.
4. In de app **Verbinden met EHDS › Inloggen met een EHDS-account** met die
   gebruikersnaam en dat wachtwoord. De app en de wallet openen nu hetzelfde dossier.

**Wallet ontkoppelen**, op dezelfde pagina, verwijdert de hash; het account, het
dossier en de verbinding van de app blijven bestaan. Als u het account verwijdert, wordt de hash
mee verwijderd.

## Exports en uw rechten op uw gegevens

Alles wat de app bevat, kan hem verlaten, in de vorm die de ontvanger nodig heeft, en
alleen wanneer u dat zegt.

| Actie                            | Voor                   | Wat u krijgt                                                                                                                                                                               |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delen voor mijn arts             | een praktijk, de ePA   | een pdf-samenvatting met de originele pagina’s als bijlage, plus een FHIR R4-bundel                                                                                                        |
| Exporteren voor onderzoek (OMOP) | een analyseteam        | OMOP CDM v5.4 `measurement.csv`, `person.csv`, `observation_period.csv`                                                                                                                    |
| Al mijn gegevens exporteren      | u, op grond van de AVG | elk rapport, elke pagina, elke waarde, elk profielveld en elke toestemming, in één archief                                                                                                 |
| Al mijn gegevens verwijderen     | u                      | de opslag wordt definitief gewist; het account dat de app op de hub heeft aangemaakt, met het dossier, de waarden en de toestemmingen, verdwijnt ook; de app meldt dit voordat het gebeurt |
| Diagnostiek exporteren           | de ontwikkelaars       | de herkende tekst en beide doorgangen van de tekstherkenning, om een verkeerd gelezen regel te herstellen                                                                                  |

De FHIR-bundel bevat elke waarde met haar LOINC-code, haar UCUM-eenheid, het
bereik dat het laboratorium heeft afgedrukt (als getallen waar ze leesbaar zijn, en altijd als
de afgedrukte tekst in `referenceRange.text`), en de pagina en regel waarvan ze is gelezen.
Een waarde die van een foto is gelezen, is ook in de bundel als voorlopig gemarkeerd.
De export voor de arts blijft met de bijgevoegde pagina’s binnen de limiet van 25 MB van de ePA.

Alles gaat via het deelmenu van het systeem: naar de ePA-app, Bestanden,
AirDrop of e-mail. Er is bewust geen eigen upload, omdat er
geen API naar de ePA bestaat voor een app als deze, en de burger is het
integratiepunt.

## Privacy en veiligheid

<img src="../../../klarbefund/img/privacy.png" width="300" alt="Privacy en veiligheid: de rapporten blijven op deze telefoon, er wordt niets verstuurd tenzij u het verstuurt, waar een uitleg vandaan komt">

De foto’s verlaten het apparaat nooit. Waarden, pagina’s en diagnostiek worden
afzonderlijk versleuteld met een sleutel die niet beschikbaar is zolang de telefoon
vergrendeld is en nooit op een ander apparaat wordt teruggezet. De opslag is uitgesloten van
iCloud-reservekopie. Wanneer de app niet op de voorgrond staat, wordt de inhoud afgedekt, zodat de
appkiezer niets toont, en bij terugkeer wordt om Face ID of de toegangscode gevraagd.

Dit is gecontroleerd, niet aangenomen: met de telefoon aan een kabel mislukt het kopiëren van een opgeslagen
dossier, van een export die in de tijdelijke map is achtergebleven of van de eigen momentopname
die het systeem van de app maakt telkens met een toegangsfout, en zo ziet volledige bestandsbeveiliging
er van buitenaf uit. De volledige beoordeling, doelstelling voor
doelstelling, is de [zelfbeoordeling](../../../klarbefund/self-assessment.md); wat er is getest en
hoe, staat in [bewijs](../../../klarbefund/evidence.md).

## Geen medisch hulpmiddel

Klarbefund legt uit wat een meting is. De app stelt geen diagnose, beoordeelt
uw risico niet en beveelt geen behandeling aan. Geen enkel scherm zegt normaal of
afwijkend, geeft scores of adviseert. Een waarde die van een foto is gelezen, kan
verkeerd zijn gelezen en is gemarkeerd als voorlopig totdat u haar met het papier vergelijkt.
Referentiebereiken worden precies getoond zoals uw laboratorium ze heeft afgedrukt, en de
gepubliceerde bereiken ernaast zijn citaten met een bron, geen oordeel.

Raadpleeg altijd een arts voordat u een beslissing over uw gezondheid neemt.

## Wanneer iets verkeerd wordt gelezen

Een tekstherkenning leest een foto, en foto’s worden soms verkeerd gelezen. Drie dingen
helpen, in deze volgorde:

1. **Vergelijken met het papier.** De pagina en regel onder elke waarde staan er
   precies hiervoor. Tik op de waarde om haar te corrigeren; de correctie wordt bewaard naast het
   uitgelezen resultaat.
2. **Opnieuw lezen met deze versie**, in het menu van het rapport, na een update van de
   app: de pagina’s worden bewaard, zodat een betere lezer ze opnieuw kan lezen. Een
   nieuwe lezing die minder waarden vindt dan er zijn opgeslagen, wordt verworpen en nooit
   over de betere lezing heen opgeslagen.
3. **Ontbrekende waarden melden**, in het menu van het rapport, stuurt de labels van de
   regels die de app niet kon coderen, nooit uw getallen, zodat het woordenboek
   de spelling van het laboratorium kan leren. **Diagnostiek exporteren** geeft u een
   archief met de herkende tekst om bij een
   [issue](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186) te voegen;
   het verlaat de telefoon alleen via het deelmenu, wanneer u het verstuurt.

## Hoe deze schermafbeeldingen worden gemaakt

De afbeeldingen in deze handleiding worden in een simulator gemaakt door
[`clients/ios/Scripts/capture-screenshots.sh`](../../../../clients/ios/Scripts/capture-screenshots.sh),
dat de app met de fictieve ontwikkeldataset rechtstreeks in elk scherm
start:

```bash
cd clients/ios
SEED=-MBDevData OUT=/tmp/shots \
  SCREENS="list detail scan trends reference history profile consent settings privacy consents connect" \
  Scripts/capture-screenshots.sh
for f in /tmp/shots/*.png; do sips --resampleWidth 660 "$f" --out "../../docs/klarbefund/img/$(basename "$f")"; done
```

De dataset wordt in code opgebouwd, in het geheugen, en wordt uit een release-build
weggelaten. Elk laboratorium en elke praktijk erin is verzonnen en elke waarde
bedacht, en dat is de enige reden waarom een schermafbeelding überhaupt mag worden gecommit: de regel in de
[ontwikkelaarshandleiding](developer-guide.md#two-rules-that-are-not-negotiable) is
dat er geen echte gezondheidsgegevens in de repository terechtkomen, zelfs niet als afbeelding, zelfs
niet tijdelijk.
