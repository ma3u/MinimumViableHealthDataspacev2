---
source: docs/klarbefund/user-guide.md
sourceHash: 3278a2f8f333e765cf1f68b22430ff3027cb9b6dc36789f2ecf94d4457a48188
language: de
summary: "Die App, wie eine Person sie nutzt, Bildschirm für Bildschirm mit Screenshots: einen Befund erfassen, einen Wert mit dem Papier abgleichen, Verläufe, Einwilligungen, die Verbindung zum EHDS, Exporte und Ihre Rechte an Ihren Daten."
---

# Benutzerhandbuch für Klarbefund

Klarbefund macht aus einem Laborbefund auf Papier Werte, die Sie lesen, mit
dem Papier abgleichen und über die Zeit verfolgen können. Alles läuft auf dem Telefon: der Scan, das
Auslesen, die Codierung, die Speicherung und die Exporte. Nichts erfordert ein Konto, und
nichts verlässt das Gerät, es sei denn, Sie senden es.

Dieses Handbuch geht die App so durch, wie eine Person sie nutzt, Aufgabe für Aufgabe. Die
Entwicklerseite (Bauen, Testen, das gemeinsame Wörterbuch, der Aufbau des Speichers) beschreibt das
[Entwicklerhandbuch](developer-guide.md). Die Arbeit wird in
[Issue #186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186) verfolgt.

Jeder Screenshot in diesem Handbuch zeigt erfundene Daten. Das Labor, die
Praxis, die Patientin oder der Patient und jede Zahl stammen aus dem eigenen fiktiven
Entwicklungsdatensatz der App, sodass ein Screenshot veröffentlicht werden kann, ohne dass je ein realer Befund
beteiligt war. Wie sie entstehen, steht am
[Ende dieses Handbuchs](#how-these-screenshots-are-made).

| App-Name     | Klarbefund, auf Englisch und Deutsch                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Läuft auf    | iPhone, iOS 26 oder neuer                                                                                                  |
| Bezugsquelle | [Öffentliche TestFlight-Beta](https://testflight.apple.com/join/ssADSXX6), 200 Plätze                                      |
| Sprachen     | Englisch und Deutsch, entsprechend der Sprache des Telefons                                                                |
| Quellcode    | [`clients/ios/`](../../clients/ios/)                                                                                       |
| Datenschutz  | [Datenschutzerklärung](https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html)                      |
| Kein         | Medizinprodukt: Die App erklärt, was ein Messwert ist, und beurteilt nie einen Wert ([siehe unten](#not-a-medical-device)) |

## Erste Schritte

1. Öffnen Sie auf dem iPhone den [TestFlight-Link](https://testflight.apple.com/join/ssADSXX6).
   [TestFlight](https://developer.apple.com/testflight/) installiert sich zuerst selbst, falls es fehlt, und bietet dann Klarbefund an.
2. Öffnen Sie Klarbefund. Es gibt keine Registrierung und kein Konto: Die App ist bereit für
   den ersten Scan.
3. Beim ersten Scan fragt iOS nach der Kamera. Die App nutzt sie nur für
   die Seiten eines Befunds und für den QR-Code, der sie mit Ihrer Akte verbindet;
   die Fotos bleiben auf dem Telefon.

**Die Sperre.** Standardmäßig verlangt die App [Face ID](https://developer.apple.com/documentation/localauthentication), Touch ID oder den Code
jedes Mal, wenn sie in den Vordergrund kommt, damit Ihre Ergebnisse nicht für
jeden sichtbar sind, der das entsperrte Telefon in der Hand hält. Der Schalter befindet sich unter **Analyse-Anbieter**
im Menü **⋯**, Abschnitt **Schutz**. Ein Telefon ohne Code hat
nichts, wonach es fragen könnte, und die Sperre öffnet sich dann von selbst ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)).

## Ihre Befunde

<img src="img/list.png" width="300" alt="Die Liste der Befunde, eine Zeile je Befund mit Labor, Datum, Anzahl der Werte und einem Herkunftsabzeichen">

Der Startbildschirm listet jeden Befund auf, den neuesten zuerst: den Titel, das Labor,
die Praxis oder das Gerät, von dem er stammt, das Datum der Probenahme und wie viele Werte
ausgelesen wurden. **1 zu prüfen** kennzeichnet einen Befund mit einem Wert, den Sie noch nicht
mit dem Papier abgeglichen haben.

Das farbige Abzeichen ist die **Herkunft** des Befunds, und sie ist wichtiger, als sie
aussieht. **Vom Labor, endgültig** bedeutet, dass die Werte aus einem PDF stammen, das
den eigenen Text des Labors enthielt, sodass nichts erraten wurde. **Gescannt, vorläufig**
bedeutet, dass die Werte von einem Foto gelesen wurden, eines Papierblatts oder des
Bildschirms eines Geräts, und ein Foto kann falsch gelesen werden. Ein Wert bleibt vorläufig,
bis Sie ihn mit dem Original abgeglichen haben.

Oben in der Liste steht, was zum Betrachten Ihrer Befunde gehört: **Verlauf**,
**Meine EHDS-Akte** mit dem Stand Ihrer Verbindung und **Mögliche
Doppelungen**, wenn zwei Befunde wie derselbe aussehen. Die Schaltfläche **+** startet
einen Scan, einen Import oder **Frühere Messwerte**, die von Hand eingegeben werden. Die Schaltfläche **⋯**
enthält die Einstellungen und Ihre Rechte an Ihren Daten, in drei Gruppen: _Über
Sie_ (Profil, Referenzwerte), _Datenschutz und Weitergabe_ (Einwilligungen, Analyse-Anbieter, Datenschutz und Sicherheit) und _Ihre Daten_ (Export, Löschen und unter
_Forschung und Support_ der OMOP-Export und die Diagnosedaten).

## Einen Befund hinzufügen

Es gibt drei Wege, und das Dokument entscheidet, was seine Werte wert sind.

- **Befund scannen** öffnet die Kamera für einen Befund auf Papier. Die App erkennt die Seitenränder,
  liest die Tabelle auf dem Gerät aus und bewahrt die Seiten als PDF neben
  den Werten auf. Mehrseitige Befunde sind kein Problem.
- **PDF oder Foto importieren** übernimmt eine Datei, die Ihnen Ihr Labor oder Portal gegeben hat. Wenn
  das PDF die eigene Textebene des Labors enthält, werden die Werte als
  endgültig gekennzeichnet; ein PDF, das nur ein Bild ist, durchläuft die Texterkennung wie ein Scan.
- **Aus Fotos importieren** übernimmt Fotos, die bereits auf dem Telefon sind, bis zu zwölf
  auf einmal.

Die App liest mehr als Laborblätter. Eine **24-h-Blutdruckmessung**,
ein **Ruhe- oder Belastungs-EKG**, ein **Langzeit-EKG**, eine
**Spirometrie**, eine **Laktat-Leistungsdiagnostik**, ein **CGM-Glukoseprofil**, eine **DXA-Messung**
und eine **Darmmikrobiom-Analyse** haben jeweils einen eigenen Leser, sodass die Werte, die eine
Praxis auf diese Blätter druckt, mit den richtigen Codes und Einheiten ankommen.

Eine **Körperanalysewaage**, die in einem Fitnessstudio fotografiert wurde, wird als das erkannt, was sie
ist: eine Anzeige, kein Befund. Die App liest die Messgröße, ihren aktuellen Wert und
das Datum, das die Waage anzeigt, und wo die Waage einen Verlauf darstellt, vermisst sie die
Punkte im Diagramm und kennzeichnet diese Werte als Schätzungen. Die eigenen
Urteile der Waage („Normal“, „Niedrig“) werden ignoriert; es sind die Bereiche des Herstellers, nicht
die einer Leitlinie.

Bevor etwas gespeichert wird, zeigt die App, was sie gelesen hat, und bittet Sie, das
Labordatum zu bestätigen, das sie auf dem Blatt gefunden hat. Ein Befund, der wie einer aussieht, den Sie
bereits haben, wird angezeigt; **Mögliche Doppelungen** oben in der Liste
erscheint, sobald zwei gespeicherte Befunde wie derselbe aussehen.

## Einen Befund Wert für Wert prüfen

<img src="img/detail.png" width="300" alt="Ein Befund: Labor, Daten und Befundnummer vom Blatt gelesen, dann jeder Wert mit seinem LOINC-Code, dem gedruckten Bereich, Seite und Zeile sowie dem veröffentlichten Bereich">

Oben in einem Befund steht, was die App aus dem Kopf des Blatts gelesen hat: das
Labor, das Datum der Probenahme, das Ausstellungsdatum des Befunds, die
Befundnummer und ein Link zu den Originalseiten.

Dann folgt jeder Messwert und unter jedem die vier Dinge, die ihn
überprüfbar machen:

- **der LOINC-Code**, dem er zugeordnet wurde, damit der Wert in
  jedem System, in das er exportiert wird, dasselbe bedeutet. Die Einheit bestimmt den Code, nie der Name:
  Lipoprotein(a) in mg/dL und in nmol/L sind verschiedene Messungen mit
  verschiedenen Codes. Eine Größe, die LOINC nicht codiert, sagt das offen, statt
  einen ungefähr passenden Code zu zeigen, und ein Organismus aus einem Stuhlbefund zeigt stattdessen seine
  [NCBI-Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy)-ID, weil LOINC Tests benennt und keine Organismen;
- **der Referenzbereich, den Ihr Labor gedruckt hat**, genau so, wie er gedruckt ist, nie
  normalisiert;
- **Seite und Zeile**, aus der er gelesen wurde, sodass jede Zahl
  mit dem Papier vor Ihnen abgeglichen werden kann;
- **der veröffentlichte Bereich**, wo eine Leitlinie oder eine benannte Studie einen angibt ([ADR-039](../ADRs/ADR-039-published-reference-ranges.md)), mit
  Worten und einem Symbol neben der Farbe: „im optimalen Bereich“, „außerhalb
  des optimalen Bereichs“, „außerhalb des Leitlinienbereichs“. Das ist ein Vergleich mit einer
  Zahl, die jemand veröffentlicht hat. Es ist kein Befund.

**Mit dem Papier abgleichen.** Tippen Sie auf einen Wert, um seinen Namen, seine Zahl oder seine
Einheit zu korrigieren; die Korrektur wird neben dem gespeichert, was die Texterkennung gelesen hat, sodass die Papierspur
erhalten bleibt. **Alle Werte als geprüft markieren** macht die Werte des Befunds von
vorläufig zu geprüft, sobald Sie sie verglichen haben. Ein Befund mit Werten,
die noch zu prüfen sind, trägt in der Liste **zu prüfen**.

Unter den erkannten Werten folgen zwei Listen, die die App nie verbirgt: die Zeilen, die
wie Messwerte aussahen, aber zu nichts im Wörterbuch passten, und die Zeilen,
die überhaupt nicht gelesen werden konnten. Eine Zeile, die stillschweigend verschwände, wäre
nicht von einer Zeile zu unterscheiden, die nie gedruckt wurde, also verschwindet keine Zeile.
**Fehlende Werte melden** im Menü des Befunds sendet den Entwicklern die
Bezeichnungen solcher Zeilen, nie die Werte, damit das Wörterbuch wachsen kann.

Die Teilen-Schaltfläche bietet die weiter unten beschriebenen Exporte an. Über das Menü können Sie
den Befund mit der aktuellen Version des Lesers erneut auswerten, das Papier erneut
scannen, seinen Namen und sein Labor bearbeiten, seine Diagnosedaten exportieren oder ihn löschen.

## Die Originalseiten

<img src="img/scan.png" width="300" alt="Die gespeicherten Seiten eines Befunds, wie gescannt dargestellt">

Jeder Befund behält seine Seiten, als ein PDF, verschlüsselt wie die Werte. **Original-Scan**
zeigt sie wieder an, sodass die Quelle immer nur einen Tipp vom Ausgelesenen entfernt ist.

## Verlauf

<img src="img/trends.png" width="300" alt="Der Verlaufsbildschirm: ein Diagramm je Messwert, geordnet danach, wie weit der letzte Wert von seinem Bereich entfernt ist">

**Verlauf** zeichnet ein Diagramm je Messwert über alle Befunde hinweg, geordnet danach,
was am weitesten von seinem Bereich entfernt ist. Die Filter schränken es auf das Wesentliche ein: nur
Parameter, die mehr als einmal gemessen wurden, oder nur solche außerhalb eines Bereichs.

Jedes Diagramm sagt, was es zeigt. Jede Art von Nachweis hat ihre eigene Form:
Ein Kreis stammt aus der eigenen Datei eines Labors, eine Raute wurde von einem
Foto gelesen und ist vorläufig, und ein Dreieck wurde von Ihnen eingegeben oder von
einem Gerät übernommen. Eine Legende unter jedem Diagramm, das diese mischt, benennt jede Form in
Worten, sodass nichts von der Farbe oder vom Antippen eines Punkts abhängt. Das grüne Band ist
der veröffentlichte optimale Bereich, wo es einen gibt; für alles andere ist das gezeichnete Band
der Bereich, den Ihr eigenes Labor gedruckt hat, in einer eigenen Farbe und als
solcher benannt. Unter dem Diagramm ist jeder Punkt mit seinem Datum, seiner Herkunft
und dem Befund, zu dem er gehört, aufgeführt, und das Antippen eines Punkts öffnet diesen Befund.

Ein Satz unter jedem Diagramm sagt, **was der Messwert ist**: eine Definition
des Tests, auf Englisch oder Deutsch. Es ist nie eine Bewertung Ihres eigenen Werts.

Ganz unten liest **Verläufe aus [Apple Health](https://developer.apple.com/documentation/healthkit) zeigen** Ihre Ruheherzfrequenz,
Herzfrequenzvariabilität, Schritte und Ihr Gewicht, nachdem einmal um
Erlaubnis gefragt wurde. Sie erscheinen in einem eigenen Abschnitt, **Von Ihren Geräten**, als graue
gestrichelte Linien aus Wochenmitteln über dieselben Monate wie Ihre Befunde, mit einer dünnen
blauen Linie am Tag jedes Befunds, damit sich beides gegeneinander lesen lässt.
Sie werden nie als Laborwert gezeichnet: kein Bereich, kein Vergleich, keine Farbe, die
etwas bedeutet, und sie gehen in keinen Export ein. Die App liest sie, während der
Bildschirm geöffnet ist, schreibt nichts in Health und behält keine Kopie.

## Referenzwerte

<img src="img/reference.png" width="300" alt="Referenzwerte: eine Karte je Messwert mit dem Leitlinienschwellenwert und dem optimalen Bereich je Einheit, jeweils mit Quelle">

**Referenzwerte** ist die Tabelle hinter den Bereichen. Eine Karte je Messwert,
eine Zeile je Einheit, zwei Spalten: **Leitlinie**, der Schwellenwert, den eine Leitlinienorganisation
für Erwachsene angibt, und **Optimal**, der Bereich mit dem geringsten Risiko, den dieselbe Quelle
nennt. Jede Karte nennt ihre Quelle und verlinkt sie; wo eine Quelle
nach Risikostufe oder nach Alter unterteilt, sagt die Karte das und überlässt die Wahl der
Stufe einer Ärztin oder einem Arzt.

Ein Messwert ohne zitierbare Quelle fehlt einfach. Das ist der Unterschied
zu den Longevity-Tabellen, nach deren Vorbild dieser Bildschirm gestaltet wurde und die Zahlen zitieren,
die niemand überprüfen kann. Das Kategorienmenü schränkt die Liste auf ein Panel ein, und wenn Sie
im Profil Ihr Geschlecht angeben, kommen die Bereiche hinzu, die sich nach Geschlecht unterscheiden.

## Profil und frühere Messwerte

<img src="img/profile.png" width="300" alt="Das Profil: Geschlecht, Geburtsdatum und Größe, dann Taillenumfang, Gewicht und viszerales Fett mit dem jeweiligen Messdatum"> <img src="img/history.png" width="300" alt="Frühere Messwerte: ein Datum je Zeile mit dem an diesem Tag gemessenen Taillenumfang und Gewicht">

Das **Profil** enthält Geschlecht, Geburtsdatum und Größe, die nur dazu dienen, die
veröffentlichten Bereiche auszuwählen, die für Sie gelten, sowie die Körpermaße: Taillenumfang, Gewicht
und viszerales Fett. Jeder Messwert behält sein eigenes Datum und sagt, woher er
stammt. Ein Wert, der vom Foto einer Waage gelesen wurde, ist als solcher gekennzeichnet; einer, den Sie eintippen,
ist als von Ihnen eingegeben gekennzeichnet.

**Frühere Messwerte** im Menü **+** dient zum Nachtragen: ein Datum je Zeile, mit allem,
was Sie an diesem Tag gemessen haben. Beim Speichern wird jedes Datum als eigener Befund abgelegt, gekennzeichnet als
von Ihnen eingegeben, und BMI sowie Taille-Größe-Verhältnis werden aus der
Größe im Profil berechnet. Sie fließen auf demselben Weg in den Verlauf und die Exporte ein
wie die Werte eines Labors.

## Fragen, was ein Wert ist

<img src="img/consent.png" width="300" alt="Zur Analyse senden: die zu sendenden Werte, jeweils mit Code, ein Hinweis, dass sie auf diesem iPhone bleiben, und die Frage"> <img src="img/settings.png" width="300" alt="Analyse-Anbieter: die Face-ID-Sperre, dann Auf diesem iPhone, der Klarbefund-Dienst, Ihr eigenes Azure OpenAI oder Ihr eigener Anthropic-Schlüssel">

Sie können die App bitten, eine Reihe von Werten zu erklären. Standardmäßig antwortet das Modell auf dem
iPhone, sodass die Frage überhaupt kein Netzwerk erreicht.

Wenn Sie lieber einen Dienst nutzen möchten, wählen Sie die Werte aus, sehen sie mit
ihren Codes aufgelistet und bestätigen, bevor etwas gesendet wird. Nur diese Werte und Ihre
Frage werden übertragen. Ihr Name, Ihr Geburtsdatum und Ihre Versichertennummer werden nie
gesendet, weil die App sie nicht speichert; sie stehen möglicherweise auf der gescannten
Seite, die auf dem Telefon bleibt. Welcher Anbieter verwendet wird, steht vor dem Senden auf dem
Bildschirm.

**Analyse-Anbieter** im Menü legt fest, woher eine Antwort kommt: von diesem
iPhone, vom Klarbefund-Dienst in der EU (standardmäßig [Azure OpenAI in der EU-Datenzone](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types#data-zone-standard)) oder von Ihrer eigenen Azure-OpenAI-Ressource bzw. Ihrem
Anthropic-Schlüssel. Bei Ihrem eigenen Dienst spricht das Telefon direkt mit ihm, und
weder der Schlüssel noch die Werte erreichen den Anbieter dieser App ([ADR-034](../ADRs/ADR-034-claude-workload-identity-federation.md), [ADR-035](../ADRs/ADR-035-inference-provider-residency-and-quota.md)). Derselbe
Bildschirm enthält den Schalter **Schutz** für die Face-ID-Sperre.

## Einwilligungen

<img src="img/consents.png" width="300" alt="Einwilligungen: Studienteilnahme, der Widerspruch gegen die ePA und die Nutzung für Register, jeweils mit eigenem Status, eigener verwahrender Stelle, eigenem Datum und eigener Schaltfläche">

**Einwilligungen** im Menü führt Ihre eigene Aufzeichnung über drei Entscheidungen, die
leicht zu verwechseln sind und nie ein einziger Schalter sein dürfen:

- **Studienteilnahme**, Ihre Einwilligung in eine Studie, verwahrt vom Studienzentrum;
- **Elektronische Patientenakte (ePA)**, ein [_Widerspruch_](https://www.gesetze-im-internet.de/sgb_5/__342.html), weil die ePA existiert,
  sofern Sie nicht gegenüber Ihrer Krankenkasse widersprechen;
- **Register und Forschung**, Ihre Einwilligung, dass ein Register oder eine Forschungsdatenbank
  Ihre Werte nutzt.

Jede hat ihren eigenen Status, ihr eigenes Datum, ihre eigene verwahrende Stelle und ihre eigene Schaltfläche, und das Ändern der einen
ändert nie eine andere. Ein Widerruf behält die frühere Erteilung im Verlauf, sodass Sie
weiterhin zeigen können, wann Sie sie erteilt haben. Die App informiert niemanden: Um eine zu erteilen oder zu widerrufen,
wenden Sie sich an diejenige Stelle, die sie verwahrt. Zwei Stellen nutzen die Aufzeichnung. **Für die Forschung exportieren**
fragt vor dem Export einmal nach, wenn keine Einwilligung für ein Register erfasst ist, und **Für meine Praxis
teilen** erinnert Sie, wenn Sie einen Widerspruch gegen die ePA erfasst haben, daran, dass
es keine ePA zum Hochladen gibt, solange er besteht.

## Mit EHDS verbinden

<img src="img/connect.png" width="300" alt="Mit EHDS verbinden: ein Konto anlegen, sich mit einem Konto anmelden oder per QR-Code vom Patientenbildschirm verbinden">

**Meine EHDS-Akte** oben in der Liste zeigt, ob die App verbunden ist
und sendet, und öffnet **Mit EHDS verbinden**, womit die App mit Ihrer Akte im
Demo-Hub des [Europäischen Gesundheitsdatenraums](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng) verbunden wird, damit sie sie lesen und, wenn Sie das möchten,
ergänzen kann. Es gibt drei Wege hinein, und auf dem Telefon wird kein Passwort in eine Webseite
eingegeben:

- **EHDS-Konto anlegen** legt ein Konto mit einer eigenen, leeren Akte auf
  dem Demo-Hub an und verbindet das Telefon damit. Sie erhalten einen Benutzernamen und ein Passwort,
  um sich auch auf der Website anzumelden. [Apple bestätigt](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) dem Hub, dass die Anfrage
  von der echten App auf einem echten Gerät kommt, weshalb ein Simulator
  das nicht kann ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)).
- **Mit einem EHDS-Konto anmelden**, das Sie bereits haben.
- **Per QR-Code verbinden** ([OAuth Device Grant](https://www.rfc-editor.org/rfc/rfc8628), [ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)), vom Patientenbildschirm auf einem Computer aus:
  1. Öffnen Sie auf dem Computer den Patientenbildschirm (die App zeigt die Adresse an, zum
     Kopieren, Teilen oder Öffnen) und melden Sie sich als Patientin oder Patient an. Wählen Sie **QR-Code anzeigen**.
  2. In der App **QR-Code scannen**. Auf dem Computer öffnet **Auf diesem
     Computer bestätigen** die Einwilligungsseite von [Keycloak](https://www.keycloak.org/docs/latest/server_admin/#device-authorization-grant); prüfen Sie, dass der dort angezeigte Code
     derjenige ist, den die App anzeigt, und bestätigen Sie.
  3. Die App zeigt, mit welchem Konto sie sich verbunden hat, und fragt **Ist das Ihr
     Konto?** Ein Code, den Ihnen jemand anderes gezeigt hat, würde das Telefon mit
     dessen Konto verbinden; wenn der Name also nicht Ihrer ist, wählen Sie **Nicht ich,
     trennen**.

Nach dem Verbinden listet **Meine EHDS-Akte zeigen** auf, was der Hub für Sie verwahrt:
Messwerte mit ihren gedruckten Bereichen und Daten, Befundberichte, Impfungen und
den Medikationsplan ([ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)). Auf dem Demo-Hub ist jede Akte synthetisch, und der
Bildschirm sagt das. Die Akte wird gelesen, wenn Sie sie öffnen, nirgends gespeichert und nie
mit Ihren gescannten Befunden vermischt.

Zwei Schalter entscheiden, was in die andere Richtung geht, und beide sind aus, bis Sie
sie einschalten:

- **Meine Befunde an meine EHDS-Akte senden**: Solange er eingeschaltet ist, geht jeder Befund, den Sie
  scannen oder erneut auswerten, in Ihre eigene Akte, als vorläufige Werte, die als
  aus einem Scan gelesen gekennzeichnet sind. Werte ohne LOINC-Code bleiben auf dem Telefon.
- **Meine Geräte-Trends an meine EHDS-Akte senden**: die Wochenmittel aus Apple
  Health, die der Bildschirm Verlauf zeigt, nie ein einzelner Tag oder ein einzelner
  Messwert; jede Synchronisierung ersetzt die vorherige ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)).

Das Ausschalten eines der beiden beendet weiteres Senden; was gesendet wurde, bleibt in der Akte,
bis Sie das Konto löschen. **Trennen** gibt es in der App und auf dem Patientenbildschirm,
auf dem jedes verbundene Telefon aufgeführt ist. Auf einem Telefon, das den Patientenbildschirm
selbst anzeigt, bewirkt **In Klarbefund öffnen** dasselbe wie der QR-Code, und auch die
Kamera-App des iPhones öffnet Klarbefund über den Code. Der Code funktioniert einmal,
zwei Minuten lang.

### Ihre EUDI Wallet, wenn Sie eine möchten

Eine EUDI Wallet ist optional. Klarbefund und der Hub funktionieren allein mit Benutzername und
Passwort. Eine Wallet fügt eine zweite Möglichkeit hinzu, sich auf der Website anzumelden: d-you,
die deutsche EUDI Wallet, oder jede andere zertifizierte Wallet weist mit
Ihrer [PID](https://eu-digital-identity-wallet.github.io/eudi-doc-architecture-and-reference-framework/latest/) (Ihrem digitalen Personalausweis) statt mit einem Passwort nach, wer Sie sind.
d-you wird [Anfang Januar 2027 für alle eingeführt](https://www.bundesregierung.de/breg-de/aktuelles/digital-wallet-2452384). Bis dahin ist der
Hub als vertrauende Partei in der Sandbox der SPRIND registriert; die folgenden
Schritte funktionieren daher mit der Test-Wallet-App von d-you aus dieser Sandbox,
noch nicht mit dem öffentlichen d-you ([ADR-065](../ADRs/ADR-065-the-eudi-wallet-sign-in-identifies-the-person.md), [ADR-066](../ADRs/ADR-066-the-hub-runs-its-own-eudi-verifier-behind-a-wallet-only-gate.md)).

Der Hub speichert nie Ihren Namen oder Ihr Geburtsdatum. Er speichert einen sicheren Hash
davon am Konto, der nur aussagt: „Diese PID gehört zu diesem Konto“
([ADR-067](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-067-a-pid-links-to-an-account-by-a-keyed-fingerprint.md)).
Eine PID gehört zu einem Konto, also entscheiden Sie, wo Sie beginnen.

**Sie haben zuerst Klarbefund und fügen die Wallet später hinzu**

1. In der App erhalten Sie über **Mit EHDS verbinden › EHDS-Konto anlegen** einen
   Benutzernamen `kb-…` und ein Passwort. **Passwort zeigen** oder **Passwort kopieren**
   zeigt es erneut.
2. Öffnen Sie auf einem Computer die Website und wählen Sie **Mit Keycloak anmelden**, mit
   diesem Benutzernamen und Passwort. Nicht **Mit d-you anmelden**: Die Wallet kann nur
   ein Konto öffnen, mit dem sie bereits verbunden ist, und dieses ist es noch nicht.
3. Öffnen Sie **Gesundheitsprofil › EUDI-Wallet verbinden**, wählen Sie **EUDI-Wallet
   verbinden** und scannen Sie den QR-Code mit d-you.
4. d-you nennt den Dienst und fragt nach drei Angaben: Vornamen, Familienname
   und Geburtsdatum. Bestätigen Sie sie mit Ihrem Digital-ID-Code.
5. Die Seite zeigt **d-you ist verbunden**. Ab jetzt öffnet **Mit d-you anmelden**
   dieses Konto, und die App bleibt wie zuvor verbunden.

**Sie haben zuerst die Wallet und fügen Klarbefund später hinzu**

1. Wählen Sie auf der Website **Mit d-you anmelden (QR)** und scannen Sie den Code.
   Bestätigen Sie dieselben drei Angaben.
2. Zu Ihrer PID gehört noch kein Konto, daher bietet die Seite **Konto mit dieser PID
   anlegen** an. Wählen Sie das nur, wenn Sie kein Klarbefund-Konto haben: Wenn Sie
   eines haben, verbinden Sie stattdessen die Wallet wie oben beschrieben damit, denn Ihre PID
   kann nicht zu zwei Konten gehören.
3. Die Seite zeigt einmalig einen Benutzernamen `kb-…` und ein Passwort. Speichern Sie beides, dann
   **Gespeichert, jetzt anmelden**.
4. In der App **Mit EHDS verbinden › Mit einem EHDS-Konto anmelden** mit diesem
   Benutzernamen und Passwort. Die App und die Wallet öffnen jetzt dieselbe Akte.

**Wallet trennen** auf derselben Seite entfernt den Hash; das Konto, seine
Akte und die Verbindung der App bleiben bestehen. Das Löschen des Kontos entfernt den Hash
mit.

## Exporte und Ihre Rechte an Ihren Daten

Alles, was die App enthält, kann sie verlassen, in der Form, die die empfangende Stelle braucht, und
nur, wenn Sie es sagen.

| Aktion                               | Für                                                                                                                                                    | Was Sie erhalten                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Für meine Praxis teilen              | eine Praxis, die ePA                                                                                                                                   | eine PDF-Zusammenfassung mit den angehängten Originalseiten sowie ein [FHIR R4](https://hl7.org/fhir/R4/bundle.html) Bundle                                                                                                                                                     |
| Für die Forschung exportieren (OMOP) | ein Analyseteam                                                                                                                                        | OMOP CDM v5.4 [`measurement.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#measurement), [`person.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#person), [`observation_period.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#observation_period) |
| Alle meine Daten exportieren         | Sie, nach [Art. 15](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_15) und [20](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_20) DSGVO | jeden Befund, jede Seite, jeden Wert, jedes Profilfeld und jede Einwilligung, in einem Archiv                                                                                                                                                                                   |
| Alle meine Daten löschen             | Sie, [Art. 17 DSGVO](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_17)                                                                         | der Speicher wird endgültig gelöscht; das Konto, das die App auf dem Hub angelegt hat, mit seiner Akte, seinen Werten und Einwilligungen, wird ebenfalls gelöscht; die App sagt das, bevor sie es tut                                                                           |
| Diagnosedaten exportieren            | die Entwickler                                                                                                                                         | den erkannten Text und beide Durchläufe der Texterkennung, um eine falsch gelesene Zeile zu beheben                                                                                                                                                                             |

Das FHIR Bundle enthält jeden Wert mit seinem LOINC-Code, seiner [UCUM](https://ucum.org/ucum)-Einheit, dem
Bereich, den das Labor gedruckt hat (als Zahlen, wo sie sich lesen lassen, und immer als
gedruckter Text in [`referenceRange.text`](https://hl7.org/fhir/R4/observation-definitions.html#Observation.referenceRange.text)), sowie Seite und Zeile, aus der er gelesen
wurde. Ein Wert, der von einem Foto gelesen wurde, ist auch im Bundle als vorläufig gekennzeichnet.
Der Export für die Praxis passt mit den angehängten Seiten in die [25-MB-Grenze](https://www.kbv.de/praxis/tools-und-services/praxisnachrichten/2025/10-09/alles-nur-eine-frage-muessen-befundberichte-arztbriefe-etc-sofort-eingestellt-werden) der ePA.

Alles läuft über das Teilen-Menü des Systems: an die ePA-App, Dateien,
AirDrop oder Mail. Es gibt bewusst keinen eigenen Upload, weil es
keine API in die ePA für eine App wie diese gibt, und die Bürgerin oder der Bürger ist der
Integrationspunkt.

## Datenschutz und Sicherheit

<img src="img/privacy.png" width="300" alt="Datenschutz und Sicherheit: Die Befunde bleiben auf diesem Telefon, nichts wird gesendet, es sei denn, Sie senden es, und woher eine Erklärung kommt">

Die Fotos verlassen das Gerät nie. Werte, Seiten und Diagnosedaten sind
[einzeln mit einem Schlüssel verschlüsselt, der bei gesperrtem Telefon nicht verfügbar ist](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly)
und nie auf einem anderen Gerät wiederhergestellt wird. Der Speicher ist vom
[iCloud-Backup](https://developer.apple.com/documentation/foundation/urlresourcevalues/isexcludedfrombackup) ausgeschlossen. Wenn die App nicht im Vordergrund ist, wird ihr Inhalt abgedeckt, sodass der
App-Umschalter nichts zeigt, und bei der Rückkehr werden Face ID oder der Code verlangt.

Das wurde geprüft, nicht angenommen: Mit dem Telefon am Kabel schlagen das Kopieren einer gespeicherten
Akte, eines im temporären Ordner liegengebliebenen Exports oder des systemeigenen Schnappschusses
der App jeweils mit einem Berechtigungsfehler fehl, und genau so sieht [vollständiger Dateischutz](https://developer.apple.com/documentation/foundation/nsfileprotectioncomplete)
von außen aus. Die vollständige Bewertung, Ziel für
Ziel, ist die [Selbstbewertung](self-assessment.md); was wie getestet wurde,
steht unter [Nachweise](evidence.md).

## Kein Medizinprodukt

Klarbefund erklärt, was ein Messwert ist. Die App stellt keine Diagnose,
bewertet nicht Ihr Risiko und empfiehlt keine Behandlung. Kein Bildschirm sagt normal oder
auffällig, vergibt Punkte oder gibt Ratschläge. Ein Wert, der von einem Foto gelesen wurde, kann
falsch gelesen sein und ist als vorläufig gekennzeichnet, bis Sie ihn mit dem Papier abgleichen.
Referenzbereiche werden genau so angezeigt, wie Ihr Labor sie gedruckt hat, und die
veröffentlichten Bereiche daneben sind Zitate mit Quelle, kein Urteil.

Warum die App kein Medizinprodukt im Sinne der [MDR](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng) und der Leitlinie
[MDCG 2019-11](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en) ist, steht in der [Selbstbewertung](self-assessment.md#regulation).

Fragen Sie immer eine Ärztin oder einen Arzt, bevor Sie eine Entscheidung über Ihre Gesundheit treffen.

## Wenn etwas falsch gelesen wird

Eine Texterkennung liest ein Foto, und Fotos werden falsch gelesen. Drei Dinge
helfen, in dieser Reihenfolge:

1. **Mit dem Papier vergleichen.** Seite und Zeile unter jedem Wert sind genau
   dafür da. Tippen Sie auf den Wert, um ihn zu korrigieren; die Korrektur wird neben dem
   Ausgelesenen gespeichert.
2. **Mit dieser Version neu auswerten** im Menü des Befunds, nach einem App-Update:
   Die Seiten werden aufbewahrt, sodass ein besserer Leser sie erneut lesen kann. Eine
   erneute Auswertung, die weniger Werte findet als gespeichert sind, wird verworfen und nie
   über die bessere Auswertung gespeichert.
3. **Fehlende Werte melden** im Menü des Befunds sendet die Bezeichnungen der
   Zeilen, die die App nicht codieren konnte, nie Ihre Zahlen, damit das Wörterbuch
   die Schreibweise des Labors lernen kann. **Diagnosedaten exportieren** gibt Ihnen ein
   Archiv mit dem erkannten Text, das Sie an ein
   [Issue](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186) anhängen können;
   es verlässt das Telefon nur über das Teilen-Menü, wenn Sie es senden.

## Wie diese Screenshots entstehen

Die Bilder in diesem Handbuch werden in einem Simulator aufgenommen, von
[`clients/ios/Scripts/capture-screenshots.sh`](../../clients/ios/Scripts/capture-screenshots.sh),
das die App mit dem fiktiven Entwicklungsdatensatz direkt in jeden Bildschirm
startet:

```bash
cd clients/ios
SEED=-MBDevData OUT=/tmp/shots \
  SCREENS="list detail scan trends reference history profile consent settings privacy consents connect" \
  Scripts/capture-screenshots.sh
for f in /tmp/shots/*.png; do sips --resampleWidth 660 "$f" --out "../../docs/klarbefund/img/$(basename "$f")"; done
```

Der Datensatz wird im Code erzeugt, im Arbeitsspeicher, und ist in einem Release-Build
nicht enthalten. Jedes Labor und jede Praxis darin ist erfunden und jeder Wert
ausgedacht, und das ist der einzige Grund, warum ein Screenshot überhaupt committet werden darf: Die Regel im
[Entwicklerhandbuch](developer-guide.md#two-rules-that-are-not-negotiable) lautet,
dass keine realen Gesundheitsdaten in das Repository gelangen, nicht einmal als Bild, nicht
einmal vorübergehend.
