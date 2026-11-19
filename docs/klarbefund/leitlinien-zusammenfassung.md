# Deutsche Leitlinien: was für Klarbefund auf dem Mac zählt

Stand 19.11.2026. Sechs deutsche Leitlinien, deren Messwerte im Gesundheitsgraph von Klarbefund vorkommen: Blutdruck, Lipide, Glukose und HbA1c, Nierenwerte, Herzmarker, Bewegung. Die Texte liegen lokal als Markdown vor und sind nicht Teil des Repositories, weil sie urheberrechtlich geschützt sind. Dieses Dokument gibt Zahlen und Fundstellen in eigenen Worten wieder.

Keine medizinische Beratung. Eine Leitlinie beschreibt, was Ärztinnen und Ärzte im Regelfall tun sollen; sie ersetzt das Gespräch nicht, und sie ist rechtlich nicht bindend.

## 1. Was gelesen wurde

| Leitlinie                                                             | Register | Fassung                   | Beschlossen            | Gültig bis                                         | Literatur | davon mit PubMed-Nummer     |
| --------------------------------------------------------------------- | -------- | ------------------------- | ---------------------- | -------------------------------------------------- | --------- | --------------------------- |
| NVL Hypertonie                                                        | nvl-009  | 1.0                       | 29.06.2023             | 29.06.2028                                         | 201       | 161                         |
| NVL Typ-2-Diabetes                                                    | nvl-001  | 3.0                       | 15.05.2023             | 15.05.2028                                         | 238       | 123                         |
| NVL Chronische KHK                                                    | nvl-004  | 7.0                       | 15.08.2024             | 14.08.2029                                         | 408       | 331                         |
| NVL Chronische Herzinsuffizienz                                       | nvl-006  | 4.0                       | 12.12.2023             | 12.12.2028, die meisten Kapitel nur bis 22.10.2024 | 648       | 534                         |
| DEGAM S3 Hausärztliche Risikoberatung zur kardiovaskulären Prävention | 053-024  | 2.3 (Stand November 2024) | veröffentlicht 08/2025 | 11/2029                                            | 301       | 189, nachträglich aufgelöst |
| DEGAM S3 Chronische Nierenkrankheit in der Hausarztpraxis             | 053-048  | 2.0 (Stand Juni 2024)     | veröffentlicht 11/2024 | 06/2029                                            | 277       | 197, nachträglich aufgelöst |

Quellen: [leitlinien.de](https://www.leitlinien.de/themen) für die Nationalen VersorgungsLeitlinien (NVL), [degam.de](https://www.degam.de/leitlinien/fuer-aerzte/leitlinienuebersicht) für die beiden DEGAM-Leitlinien. Beide Seiten erlauben den automatischen Abruf.

**Wie gelesen wurde.** Je ein getrennter Modelllauf hat eine Leitlinie gelesen und Zahlen mit Seitenangabe herausgezogen; 77 dieser Zahlen wurden danach per Skript als Zeichenkette im Text gesucht, 74 wurden gefunden (die drei übrigen stehen in anderer Schreibweise oder nur in der Langfassung). Vollständig gelesen: die Kurzfassungen der NVL Hypertonie, Typ-2-Diabetes und Herzinsuffizienz sowie die Langversion der Nieren-Leitlinie bis zum Literaturverzeichnis. Nur in Teilen gelesen: NVL KHK (Einleitung, Kapitel 1, 4, 6 und 7.1 bis 7.5) und die Risikoberatung (bis Kapitel 8.4 und Kapitel 9). Seitenangaben beziehen sich auf die PDF-Seite der genannten Fassung.

**Nicht enthalten.** Das AWMF-Register untersagt automatische Abrufe; Leitlinien, die nur dort liegen, fehlen. Für Klarbefund betrifft das vor allem Fettleber (DGVS), Osteoporose (DVO), Adipositas und Lipidstoffwechsel. Die Bundesärztekammer veröffentlicht Richtlinien, keine Leitlinien; für Laborwerte ist dort die Richtlinie zur Qualitätssicherung laboratoriumsmedizinischer Untersuchungen einschlägig, sie ist hier nicht ausgewertet.

## 2. Wie aktuell sind die Leitlinien gegenüber den Studien?

Alter jeder zitierten Arbeit mit PubMed-Nummer im Jahr des Beschlusses, bei den DEGAM-Leitlinien im Jahr des Redaktionsstands (unsere Rechnung aus den Literaturverzeichnissen). Die NVL drucken die PubMed-Nummer hinter den Eintrag; für die DEGAM-Leitlinien hat `resolve_pmids.py` sie über DOI oder Zeitschrift, Jahr, Band und Seite bei PubMed nachgeschlagen und nur eindeutige Treffer übernommen.

| Leitlinie             | Beschluss  | Arbeiten | Alter im Median | mittlere Hälfte | höchstens 2 Jahre alt | älter als 10 Jahre | jüngste Arbeit |
| --------------------- | ---------- | -------- | --------------- | --------------- | --------------------- | ------------------ | -------------- |
| NVL Typ-2-Diabetes    | 2023       | 123      | 5 Jahre         | 3 bis 13        | 16 %                  | 27 %               | 2022           |
| NVL Hypertonie        | 2023       | 160      | 6,5 Jahre       | 4 bis 9         | 12 %                  | 21 %               | 2022           |
| NVL Herzinsuffizienz  | 2023       | 532      | 9 Jahre         | 7 bis 17        | 8 %                   | 42 %               | 2023           |
| NVL Chronische KHK    | 2024       | 330      | 11 Jahre        | 8 bis 16        | 7 %                   | 57 %               | 2023           |
| DEGAM Risikoberatung  | Stand 2024 | 189      | 6 Jahre         | 3 bis 11        | 24 %                  | 28 %               | 2024           |
| DEGAM Nierenkrankheit | Stand 2024 | 197      | 7 Jahre         | 3 bis 11,5      | 15 %                  | 28 %               | 2024           |

Lesart: Am Tag des Beschlusses ist die Hälfte der Belege fünf bis elf Jahre alt, und die jüngste zitierte Studie liegt bei den NVL ein Jahr zurück. Bei den DEGAM-Leitlinien vergehen zwischen Redaktionsstand und Veröffentlichung noch einmal fünf beziehungsweise neun Monate. Danach gilt die Leitlinie bis zu fünf Jahre. Eine Studie von heute kann also ein bis sechs Jahre brauchen, bis sie in einer dieser Leitlinien steht. Neue Fassungen überarbeiten oft nur einzelne Kapitel: Bei der Herzinsuffizienz ist allein das Kapitel zur medikamentösen Therapie von 2023, alle anderen stammen von 2019 und sind seit dem 22.10.2024 abgelaufen. Nur 35 der 1.496 Arbeiten werden von zwei oder mehr der sechs Leitlinien zitiert, und die am häufigsten geteilten sind Methodenarbeiten (GRADE, Entscheidungshilfen), keine klinischen Studien.

Überschneidung mit dem Klarbefund-Graph heute: Der Graph führt 21 Studien und 21 Quellen von Referenzbereichen mit PubMed-Nummer; die sechs Leitlinien zitieren davon sechs (PMID 28444290, 36272764, 37247330 bei den Studien; 31504418, 34447992, 36036785 bei den Referenzbereichen). Die SCORE2-Arbeit (PMID 34120177) zitieren beide DEGAM-Leitlinien. Der Graph stützt sich auf internationale Leitlinien und Metaanalysen, die NVL auf Therapiestudien.

## 3. Herz-Kreislauf-Risiko insgesamt

Quelle: DEGAM-Risikoberatung, gilt für Erwachsene ohne bekannte Herz-Kreislauf-Erkrankung (S. 11).

| Thema                | Was die Leitlinie sagt                                                                                                                                                                                                | Grad    | Seite      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- |
| Wann beraten         | Ab 35 Jahren bei erhöhtem Risikoprofil, ab 50 ohne Anlass; bei hohem familiärem Risiko einmal zwischen 18 und 35                                                                                                      | Konsens | 14, 32, 33 |
| Grundlage            | Das absolute Gesamtrisiko über zehn Jahre, nicht der einzelne Laborwert                                                                                                                                               | –       | 20, 41     |
| Rechner              | Kein bestimmter Rechner vorgeschrieben; genannt werden arriba, die ESC-Tabellen (SCORE2) und PROCAM. Für das Beratungsgespräch sollte arriba genutzt werden                                                           | B       | 30, 41     |
| Rauchen im Rechner   | Geht nur als ja oder nein ein, eine Menge kennt keiner der Rechner                                                                                                                                                    | –       | 42, 43     |
| Schwellen            | 10 % und 20 % in zehn Jahren. arriba selbst nennt bewusst keine Risikoklassen                                                                                                                                         | –       | 30, 129    |
| Zusatzuntersuchungen | Kalkscore, Halsschlagader-Ultraschall, hsCRP, Lp(a), eGFR und Albuminurie, Gen-Scores: nicht routinemäßig. Liegt ein Kalkscore vor, darf er einfließen (über 100 erhöht, 0 senkt), ohne dass sich das beziffern lässt | B       | 47, 49, 51 |
| Wiederholung         | Keine begründete Empfehlung zum Abstand; wiederholte Lipidmessung gilt als wenig sinnvoll                                                                                                                             | –       | 39         |

**Uneinigkeit.** Sechs Fachgesellschaften (unter anderem DGK, DGIM, DDG) tragen vier Empfehlungen nicht mit. Sie halten eine einmalige Lp(a)-Messung, eGFR und Albuminurie, den Ultraschall der Halsschlagader und die Kalkmessung für wertvoll (S. 48 bis 50).

Für Klarbefund: Der Graph rechnet SCORE2. Die Leitlinie für die Hausarztpraxis bevorzugt im Gespräch arriba, und beide kennen Rauchen nur als ja oder nein.

## 4. Lipide und Statine

| Thema                       | Was die Leitlinie sagt                                                                                                                                                                                                         | Grad    | Quelle, Seite            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------ |
| Ohne Vorerkrankung, bis 75  | Statin soll angeboten werden ab 20 % Zehnjahresrisiko; sollte bei 10 bis unter 20 %, wenn das Risiko für das Alter deutlich erhöht ist                                                                                         | A, B    | Risikoberatung, 129      |
| Ohne Vorerkrankung, über 75 | Keine Empfehlung dafür oder dagegen                                                                                                                                                                                            | –       | Risikoberatung, 129, 130 |
| Dosis ohne Vorerkrankung    | Feste, mittlere Dosis; kein LDL-Zielwert                                                                                                                                                                                       | B       | Risikoberatung, 143      |
| Einzelner LDL-Wert          | Löst für sich keine Empfehlung aus. Erst die Kriterien für familiäre Hypercholesterinämie tun das: LDL über 190 mg/dl mit Familienkriterien, oder mehr als 5 Punkte im niederländischen Score (155 bis 190 mg/dl gibt 1 Punkt) | Konsens | Risikoberatung, 165, 166 |
| Mit koronarer Herzkrankheit | Statin für alle, dauerhaft, unabhängig vom Ausgangswert                                                                                                                                                                        | A       | NVL KHK, 86              |
| Strategie bei KHK           | Zwei Empfehlungen nebeneinander: feste Dosis ohne weitere Lipidmessung (DEGAM, AkdÄ) oder Zielwert LDL unter 55 mg/dl beziehungsweise mindestens 50 % Senkung (DGIM, DGK, DGPR, DGRW)                                          | A, A    | NVL KHK, 92, 94          |
| Beschwerden unter Statin    | Dosis senken oder Präparat wechseln; eine Pause von 4 bis 6 Wochen kann klären, ob das Statin die Ursache ist                                                                                                                  | A       | NVL KHK, 88              |
| Muskelbeschwerden           | Ohne Vorerkrankung: Auslassversuch, Wechsel oder geringere Dosis, mindestens zwei Statine versuchen                                                                                                                            | Konsens | Risikoberatung, 151, 152 |
| Ersatz für ein Statin       | Ohne Vorerkrankung ab 20 % Risiko: Ezetimib, Bempedoinsäure oder Fibrate können angeboten werden. Zu PCSK9-Hemmern keine Aussage                                                                                               | 0       | Risikoberatung, 154      |
| Lipidstatus                 | Bei Diagnose eines Bluthochdrucks bestimmen                                                                                                                                                                                    | A       | NVL Hypertonie, 11       |

**Zahlen zu Muskelbeschwerden.** Die NVL KHK nennt 27,0 % unter Statin gegen 26,4 % unter Placebo (S. 87). Das sind dieselben Größenordnungen wie in der Metaanalyse der Cholesterol Treatment Trialists von 2022.

**Uneinigkeit.** Der Streit „feste Dosis oder Zielwert" zieht sich durch drei Leitlinien: NVL KHK (S. 92, 94), NVL Typ-2-Diabetes (S. 43) und die Risikoberatung (S. 144, 145). Die sechs Gesellschaften im Dissens wollen ein Statin schon ab 10 % Risiko empfehlen und ab 7,5 % erwägen (S. 131 bis 134). In der NVL KHK steht zudem neben der Empfehlung „unter 55 mg/dl" im Hintergrundtext noch „unter 70 mg/dl" (S. 92, 95).

Nicht angegeben in den gelesenen Teilen: ApoB, Non-HDL als Zielgröße, ein Triglyzeridziel, ketogene oder kohlenhydratarme Ernährung, gelegentliches Rauchen.

Für Klarbefund: Die Referenzbereiche für LDL-C zitieren ESC/EAS. Die deutsche hausärztliche Leitlinie kennt für Menschen ohne Vorerkrankung keinen LDL-Zielwert. Beides nebeneinander zu zeigen, mit Quelle, ist ehrlicher als ein einzelner Bereich.

## 5. Blutdruck

Quelle: NVL Hypertonie, Kurzfassung.

| Thema              | Zahl                                                                                                              | Grad | Seite  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | ---- | ------ |
| Diagnose, Praxis   | ab 140/90 mmHg, dann bestätigen                                                                                   | A    | 7, 8   |
| Bestätigung        | 24-Stunden-Messung bevorzugt: Tag ab 135/85, 24 Stunden ab 130/80, Nacht ab 120/70 mmHg                           | A    | 8, 10  |
| Heimmessung        | Alternative: 7 Tage, morgens und abends je zweimal; Grenze 135/85 mmHg                                            | B    | 8, 10  |
| Schweregrade       | Grad 1: 140 bis 159 / 90 bis 99; Grad 2: 160 bis 179 / 100 bis 109; Grad 3: ab 180 / 110 mmHg                     | –    | 5      |
| Ziel               | Individuell vereinbaren; in der Regel unter 140/90 mmHg, Korridor 120/70 bis 160/90 mmHg                          | A    | 16, 17 |
| Umrechnung         | Für Heimmessung und Tagesmittel 5 mmHg abziehen, für das 24-Stunden-Mittel 10 mmHg                                | –    | 16     |
| Alter              | Keine festen Altersgrenzen                                                                                        | –    | 16     |
| Kontrollen         | 4 bis 6 Wochen nach einer Therapieänderung, dann jährlich, mit Begleiterkrankungen alle 3 Monate                  | B    | 14, 15 |
| Notfall            | Über 180/110 mmHg mit akuten Beschwerden: sofort ins Krankenhaus                                                  | A    | 33     |
| Labor bei Diagnose | Natrium, Kalium, eGFR, Lipidstatus, Nüchternglukose, gegebenenfalls HbA1c, Urinstatus, Albumin-Kreatinin-Quotient | A    | 11     |
| Salz               | Weniger als 6 g Kochsalz am Tag                                                                                   | A    | 20     |
| Bewegung           | Mindestens zwei Stunden pro Woche, mäßig                                                                          | A    | 21     |

Die Nieren-Leitlinie lehnt das strengere internationale Ziel (systolisch unter 120 mmHg) ausdrücklich ab (S. 92).

Für Klarbefund: Werte aus der Heimmessung und von der Uhr brauchen die Grenze 135/85, nicht 140/90. Die Messart gehört an jeden Blutdruckwert.

## 6. Glukose und HbA1c

Quelle: NVL Typ-2-Diabetes, Kurzfassung.

| Messwert                             | Kein Diabetes   | Erhöhtes Risiko     | Diabetes                           | Seite     |
| ------------------------------------ | --------------- | ------------------- | ---------------------------------- | --------- |
| Nüchternglukose im Plasma            | unter 100 mg/dl | 100 bis 125 mg/dl   | ab 126 mg/dl                       | 18, 22    |
| HbA1c                                | unter 5,7 %     | 5,7 bis unter 6,5 % | ab 6,5 %                           | 18, 22    |
| Gelegenheitsglukose                  | –               | –                   | ab 200 mg/dl, nur zur Bestätigung  | 21 bis 23 |
| Zuckerbelastungstest, 2-Stunden-Wert | –               | 140 bis 199 mg/dl   | in der Kurzfassung nicht angegeben | 18, 22    |

- **Diagnose:** mindestens zwei auffällige Werte, aus venösem Plasma (S. 18, 20, 21).
- **Zielkorridor HbA1c:** 6,5 bis 8,5 %, individuell vereinbart. Lebenserwartung, Begleiterkrankungen, Unterzuckerungsrisiko und der Wunsch der Person verschieben ihn (S. 43, 44).
- **Was den HbA1c verfälscht:** falsch hoch unter anderem bei Eisenmangel und höherem Alter, falsch niedrig bei Blutverlust, Hämolyse und Nierenfunktionsstörung (S. 24). Ab 60 Jahren liegt der Referenzbereich ohne Diabetes höher (S. 24).
- **Jährliche Kontrollen:** eGFR und Albumin-Kreatinin-Quotient; Augen bei geringem Risiko alle zwei Jahre; Füße mindestens jährlich (S. 28, 30).
- **Blutdruck bei Diabetes:** Orientierungswert 140/90 mmHg (S. 43).

**Uneinigkeit.** DEGAM, AkdÄ und zwei weitere Gesellschaften folgen der WHO: kein Diabetes unter 110 mg/dl, erhöhtes Risiko erst von 110 bis 125 mg/dl (S. 18, 22). Der Zuckerbelastungstest hat für sie in der Hausarztpraxis keinen Stellenwert; DDG und DGIM sehen ihn als Referenztest (S. 22, 23).

Für Klarbefund: Für Nüchternglukose zwischen 100 und 109 mg/dl gibt es in derselben Leitlinie zwei Antworten. Der Graph sollte beide Bereiche mit ihrer Quelle führen.

## 7. Niere

Quelle: DEGAM Chronische Nierenkrankheit.

| Thema                    | Zahl                                                                                                                                                | Seite        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Definition               | eGFR unter 60 ml/min/1,73 m² oder Albumin-Kreatinin-Quotient über 30 mg/g, über mindestens drei Monate                                              | 35           |
| eGFR-Stadien             | G1 ab 90, G2 60 bis 89, G3a 45 bis 59, G3b 30 bis 44, G4 15 bis 29, G5 unter 15                                                                     | 36           |
| Albuminurie              | A1 unter 30, A2 30 bis 300, A3 über 300 mg/g (unter 3, 3 bis 30, über 30 mg/mmol)                                                                   | 36           |
| Alter                    | Nach dem 40. Lebensjahr sinkt die eGFR um 1 bis 2 ml/min/1,73 m² pro Jahr                                                                           | 40           |
| Rascher Abfall           | Mehr als 15 ml/min/1,73 m² pro Jahr oder 25 %, anhaltend                                                                                            | 37           |
| Formel                   | CKD-EPI, abgedruckt ist die Formel von 2021. Cystatin C nur im Einzelfall                                                                           | 56 bis 58    |
| Bestätigung              | Zweite eGFR nach drei Monaten (Grad A); bei Erstdiagnose Albumin-Kreatinin-Quotient aus Spontanurin (Grad A)                                        | 56, 62       |
| Screening                | Keines ohne Risikofaktoren (Grad B). Bei Diabetes eGFR jährlich                                                                                     | 43, 45       |
| Kontrollen der eGFR      | Je nach Stadium einmal bis viermal im Jahr; Albuminurie bei Nachweis alle ein bis zwei Jahre                                                        | 116, 119     |
| Überweisung              | eGFR unter 30 bei Erstfeststellung; oder 30 bis 60 mit Albuminurie ab A2, Blut im Urin, schwer einstellbarem Blutdruck oder auffälligem Ultraschall | 73, 74       |
| Metformin, Schmerzmittel | Metformin unter eGFR 30 meiden; Schmerzmittel vom Typ NSAR unter eGFR 30 kontraindiziert                                                            | 51, 100, 108 |
| Vitamin D                | Nicht routinemäßig bestimmen                                                                                                                        | 107          |
| Eiweiß                   | Wie in der Allgemeinbevölkerung, 0,8 bis 1,0 g je kg Körpergewicht                                                                                  | 89           |

**Uneinigkeit.** Die Leitlinie weicht mehrfach von der internationalen KDIGO-Leitlinie ab: selteneres Monitoring (S. 116), kein systolisches Ziel unter 120 mmHg (S. 92), und die KDIGO-Farbmatrix hält sie für die Prognose einer einzelnen Person für ungeeignet (S. 76). Die Annahme „eGFR unter 60 bedeutet hohes Herz-Kreislauf-Risiko" lehnt sie ab (S. 112).

Für Klarbefund: Der Graph zitiert KDIGO für eGFR und Albuminurie. Die Stadien stimmen überein; bei Kontrollabständen und der Deutung im Alter sagt die deutsche hausärztliche Leitlinie anderes. Eine einzelne eGFR unter 60 ist nach beiden Quellen noch keine Diagnose.

## 8. Herzinsuffizienz

Quelle: NVL Chronische Herzinsuffizienz, Kurzfassung. Bis auf das Kapitel zur medikamentösen Therapie sind alle Kapitel seit dem 22.10.2024 abgelaufen und in Überarbeitung (S. 6, 59).

| Messwert            | Zahl                                                                                                                         | Seite  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| Pumpleistung (LVEF) | unter 40 % vermindert, 40 bis 49 % leicht vermindert, ab 50 % erhalten                                                       | 7      |
| BNP, NT-proBNP      | Als erhöht gilt BNP über 35 pg/ml oder NT-proBNP über 125 pg/ml                                                              | 7      |
| Labor bei Verdacht  | Natriuretische Peptide, Blutbild, Natrium, Kalium, eGFR, Glukose, HbA1c, Leberenzyme, TSH, Lipide, Urinstatus                | 10     |
| Verlauf             | Elektrolyte und Nierenfunktion regelmäßig (Grad A); in der Dauertherapie höchstens sechs Monate Abstand                      | 14, 34 |
| Eisen               | Eisen über die Vene kann erwogen werden bei Ferritin unter 100 oder Ferritin 100 bis 299 mit Transferrinsättigung unter 20 % | 46     |
| Gewicht             | Täglich wiegen, bei ungewohnt schnellem Anstieg melden (Grad A)                                                              | 21     |
| Salz                | Eine Beschränkung unter 6 g am Tag soll nicht empfohlen werden (Grad B)                                                      | 20     |
| Training            | Ausdauertraining (Grad A), gesteuert nach Belastungstest                                                                     | 19     |

Für Klarbefund: Beim Salz widersprechen sich zwei NVL je nach Erkrankung. Unter 6 g bei Bluthochdruck, keine Beschränkung bei Herzinsuffizienz.

## 9. Lebensstil, quer durch die Leitlinien

| Thema     | Zahl                                                                                                                                      | Quelle, Seite                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Bewegung  | Mindestens 150 Minuten mäßig oder 75 Minuten intensiv pro Woche (Grad A)                                                                  | Risikoberatung, 72                  |
| Bewegung  | Mindestens zwei Stunden pro Woche                                                                                                         | NVL Hypertonie, 21; NVL KHK, 59     |
| Sitzen    | So wenig wie möglich, ohne Grenzwert                                                                                                      | Risikoberatung, 80                  |
| Rauchen   | Vollständig aufhören (Grad A); ganz aufzuhören wirkt besser als weniger zu rauchen. Gelegentliches Rauchen wird nirgends eigens behandelt | Risikoberatung, 82, 87; NVL KHK, 66 |
| Alkohol   | Keinen oder möglichst wenig (Grad A). Die NVL KHK nennt als Grenze risikoarmen Konsums 20 g am Tag für Männer und 10 g für Frauen         | Risikoberatung, 89; NVL KHK, 65     |
| Ernährung | Mediterran orientiert (Grad B)                                                                                                            | Risikoberatung, 63                  |
| Aspirin   | Ohne Vorerkrankung nicht bei einem Risiko unter 10 % (Grad A)                                                                             | Risikoberatung, 175                 |

## 10. Wo sich die Leitlinien widersprechen

Für einen Laien ist das die wichtigste Liste, weil hier „die Leitlinie" keine einzelne Antwort gibt.

1. **LDL-Zielwert oder feste Statindosis.** Hausärztliche und kardiologische Gesellschaften geben in derselben Leitlinie zwei Empfehlungen.
2. **Ab welchem Risiko ein Statin.** 20 % (DEGAM) oder 10 % (DGK, DGIM und andere).
3. **Zusatzmarker.** Lp(a), Kalkscore, eGFR und Albuminurie zur Risikoschätzung: nicht routinemäßig (DEGAM) oder wertvoll (DGK und andere).
4. **Nüchternglukose 100 bis 109 mg/dl.** Erhöhtes Risiko (DDG) oder unauffällig (DEGAM, nach WHO).
5. **Blutdruckziel bei Nierenkrankheit.** Unter 140/90 (DEGAM) oder systolisch unter 120 (KDIGO).
6. **Salz.** Unter 6 g bei Bluthochdruck, keine Beschränkung bei Herzinsuffizienz.

## 11. Was daraus für den Graph folgt

- **Leitlinien als eigene Knoten.** `(:Guideline {awmfId, version, releaseDate, validUntilDate, earliestValidUntilDate, active, status})`. Eine abgelaufene Leitlinie bleibt mit `active: false` im Graph.
- **Zitierte Studien.** `(:Guideline)-[:CITES {referenceNumber}]->(:Study {id: 'pmid-…'})`, dieselbe Kennung, die der Klarbefund-Graph für die Quellen seiner Referenzbereiche nutzt. Aus den sechs Leitlinien sind das 1.539 Verweise auf 1.496 Arbeiten. `CITES.pmidSource` hält fest, ob die PubMed-Nummer in der Leitlinie gedruckt steht oder nachgeschlagen wurde. 534 der 2.073 Literaturangaben bleiben ohne Nummer: Bücher, Berichte, Webseiten und Zeitschriftenartikel ohne eindeutigen Treffer.
- **Zwei Bereiche statt einem.** Wo deutsche und internationale Leitlinie abweichen (LDL ohne Vorerkrankung, Nüchternglukose, Blutdruck aus Heimmessung), sollten beide als `ReferenceRange` mit Quelle stehen.
- **Gültigkeit je Kapitel.** `earliestValidUntilDate` hält fest, wenn Teile einer gültigen Leitlinie schon abgelaufen sind.

## 12. Rechte

Die Texte der NVL und der DEGAM-Leitlinien sind urheberrechtlich geschützt. Beide Impressen nennen ausdrücklich auch die Einspeicherung in elektronische Systeme als zustimmungspflichtig; bei den NVL dürfen Abbildungen und Tabellen von Dritten frei genutzt werden. Deshalb liegen PDF und Markdown nur lokal unter `scripts/leitlinien/data/` (git-ignoriert). Wer die Volltexte in einen Graph laden will, den andere nutzen, braucht die Zustimmung des ÄZQ beziehungsweise der DEGAM. Zahlen, Fundstellen und Literaturangaben sind Tatsachen und hier wiedergegeben.

## 13. Die zitierten Studien: Status und Art

Für alle 1.496 Studien mit PubMed-Nummer hat `study_status.py` am 19.11.2026 bei PubMed nachgefragt. Jeder Lauf fragt zusätzlich eine bekannt zurückgezogene Arbeit ab und bricht ab, wenn PubMed sie nicht als zurückgezogen zeigt; ein „nichts gefunden" ist damit belegt. PubMed kannte alle 1.496.

**Status.**

| Vermerk bei PubMed                | Studien |
| --------------------------------- | ------- |
| Zurückgezogen                     | 0       |
| Expression of Concern             | 1       |
| Korrigiert und neu veröffentlicht | 1       |
| Erratum                           | 111     |
| Kein Vermerk                      | 1.383   |

- **Expression of Concern:** die Hygia-Chronotherapie-Studie zur abendlichen Einnahme von Blutdruckmitteln (Eur Heart J 2020, [PMID 31641769](https://pubmed.ncbi.nlm.nih.gov/31641769/)). Die NVL Hypertonie führt sie als eine von 14 Arbeiten ihrer Recherche zu Einnahmezeitpunkten (Literatur Nr. 134, S. 59). Sie leitet daraus keine Empfehlung ab und nennt als Grund unter anderem Grenzen im Studiendesign (S. 69). Den Vermerk selbst erwähnt die Leitlinie nicht.
- **Korrigiert und neu veröffentlicht:** die PREDIMED-Studie zur Mittelmeerkost ([PMID 29897866](https://pubmed.ncbi.nlm.nih.gov/29897866/)). Drei Leitlinien zitieren die neu veröffentlichte Fassung von 2018, nicht die zurückgezogene von 2013.
- Ein unauffälliger Status heißt, dass die Arbeit nicht zurückgezogen wurde. Er sagt nichts über ihre Qualität.

**Art der Studien**, nach den Publikationstypen von PubMed; je Arbeit zählt der stärkste genannte Typ.

| Leitlinie             | Studien | Randomisierte Studien | Metaanalysen und systematische Übersichten | zusammen | Leitlinien | Übersichten | Sonstige Artikel |
| --------------------- | ------- | --------------------- | ------------------------------------------ | -------- | ---------- | ----------- | ---------------- |
| NVL Hypertonie        | 163     | 33                    | 84                                         | 72 %     | 0          | 9           | 33               |
| NVL Chronische KHK    | 332     | 97                    | 120                                        | 65 %     | 27         | 24          | 54               |
| NVL Herzinsuffizienz  | 534     | 195                   | 107                                        | 57 %     | 21         | 40          | 146              |
| DEGAM Risikoberatung  | 189     | 9                     | 80                                         | 47 %     | 2          | 17          | 74               |
| NVL Typ-2-Diabetes    | 124     | 22                    | 32                                         | 44 %     | 3          | 10          | 51               |
| DEGAM Nierenkrankheit | 197     | 14                    | 31                                         | 23 %     | 12         | 34          | 93               |

Lesart: Die Hypertonie-Leitlinie stützt sich zu fast drei Vierteln auf randomisierte Studien und deren Zusammenfassungen, die Nieren-Leitlinie zu knapp einem Viertel. „Sonstige Artikel" sind Arbeiten, denen PubMed keinen Studientyp zuweist, meist Kohorten- und Registerauswertungen; PubMed vergibt die Typen nicht lückenlos, die Anteile sind deshalb Untergrenzen. Die Zahlen sagen, was im Literaturverzeichnis steht, nicht, worauf eine einzelne Empfehlung beruht.

Im Graph trägt jede Studie `publicationStatus`, `statusFlags`, `studyType` und das Prüfdatum. Der wöchentliche Lauf meldet eine Studie, die einen neuen Vermerk bekommt.
