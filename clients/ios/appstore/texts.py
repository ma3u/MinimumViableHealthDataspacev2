# App Store metadata for Klarbefund, English base and German.
#
# Every claim here is one the app actually makes good on: no "AI-powered
# insights", no "take control of your health". Apple rejects copy it cannot
# verify, and a medical app that oversells is the one that gets asked for a
# CE mark.

# The App Store name is reserved per locale across every developer account, so
# a name has to be free in every locale the app lists in. "Klarbefund" was
# free for en-GB and held by someone else for de-DE, which would have left one
# app under two names, the German one being the name most of its users would
# see. "Klarbefund" is free in both, so both listings carry it.
#
# Probe a replacement rather than guessing: there is no availability endpoint,
# but creating an appInfoLocalization with the candidate name returns
# ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE.DIFFERENT_ACCOUNT when it is taken,
# and deleting the row again straight away reserves nothing.
APP_NAME = {
    "en-GB": "Klarbefund",
    "de-DE": "Klarbefund",
}

SUBTITLE = {
    "en-GB": "Read and track lab results",
    "de-DE": "Befunde lesen und verfolgen",
}

PROMO = {
    "en-GB": (
        "Scan a lab report and see every value coded to LOINC, with the line it "
        "came from and how it has moved since. Runs on your iPhone, with no "
        "network and no account."
    ),
    "de-DE": (
        "Befund scannen und jeden Wert mit LOINC-Code, Fundstelle und Verlauf "
        "sehen. Läuft auf Ihrem iPhone, ohne Netz und ohne Konto."
    ),
}

KEYWORDS = {
    "en-GB": "lab,blood,laboratory,results,LOINC,FHIR,OMOP,scan,offline,privacy,trends,cholesterol",
    "de-DE": "Labor,Blutwerte,Befund,Laborwerte,LOINC,FHIR,OMOP,scannen,offline,Verlauf,Cholesterin",
}

SUPPORT_URL = "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues"
MARKETING_URL = "https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html"
PRIVACY_URL = "https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html"

DESCRIPTION = {
"en-GB": """Klarbefund turns a paper lab report into something you can read, and keeps it so you can see how a value has moved.

Point the camera at an A4 result sheet, or import a PDF your laboratory sent you. The app finds the page edges, reads the table, and shows every measurement with its unit, the reference range your laboratory printed, and the page and line it was read from, so you can check any value against the paper in front of you.

WHAT IT DOES

• Scans multi-page lab reports and doctor's letters, and imports PDFs and photographs
• Reads values, units and reference ranges out of the table
• Codes each analyte to LOINC, with UCUM units
• Shows the page and line behind every value, so nothing is unverifiable
• Lists the values it could not match and the lines it could not read, instead of quietly dropping them
• Plots a trend for anything measured more than once, marking which points came from a laboratory's own document and which were read from a photograph
• Explains in a sentence what each measurement is, which is a definition of the test and never a reading of your result
• Quotes published reference ranges with the guideline or study behind them and a link to it, beside the range your own laboratory printed
• Reads a body-composition scale's screen from a photograph, so a measurement from the gym joins the same timeline
• Exports a PDF for your doctor, a FHIR R4 bundle for your electronic patient record, and OMOP CDM tables for research

WHAT STAYS ON YOUR PHONE

The photographs never leave the device. The values read from them are encrypted individually, with a key that is unavailable while the phone is locked and is never restored onto another device. The store is excluded from iCloud Backup.

WHERE AN EXPLANATION COMES FROM

By default the model on your iPhone answers, so your question never reaches a network at all. If you would rather use a service, you pick the values, see them listed, and confirm before anything is sent. Your name and date of birth are never sent, because the app does not hold them. The scanned image is never sent either.

You can also point the app at your own Azure OpenAI resource or your own Anthropic key. Your phone then talks to your service directly, and neither the key nor the values reach the provider of this app.

WORKS OFFLINE

Scanning, reading, coding, storing, explaining and exporting all run on the device. None of it needs an account.

NOT A MEDICAL DEVICE

Klarbefund explains what a measurement is. It does not diagnose, does not assess your risk and does not recommend treatment. Values read from a photograph can be misread and are marked preliminary until you check them against the paper. Reference ranges are shown exactly as your laboratory printed them.

Always consult a doctor before making any decision about your health.

Available in English and German.""",

"de-DE": """Klarbefund macht aus einem Laborbefund auf Papier etwas Lesbares und behält ihn, damit Sie sehen, wie sich ein Wert verändert hat.

Halten Sie die Kamera auf ein A4-Befundblatt oder importieren Sie ein PDF, das Ihr Labor Ihnen geschickt hat. Die App erkennt die Seitenränder, liest die Tabelle und zeigt jeden Messwert mit Einheit, dem Referenzbereich, den Ihr Labor gedruckt hat, und der Seite und Zeile, aus der er gelesen wurde. So können Sie jeden Wert mit dem Papier vor Ihnen abgleichen.

WAS DIE APP TUT

• Scannt mehrseitige Laborbefunde und Arztbriefe und importiert PDFs und Fotos
• Liest Werte, Einheiten und Referenzbereiche aus der Tabelle
• Codiert jeden Analyten nach LOINC, mit UCUM-Einheiten
• Zeigt zu jedem Wert Seite und Zeile, damit nichts unüberprüfbar bleibt
• Listet auf, was sie nicht zuordnen und welche Zeilen sie nicht lesen konnte, statt es stillschweigend zu verwerfen
• Zeichnet einen Verlauf für alles, was mehr als einmal gemessen wurde, und kennzeichnet, welche Punkte aus einem Originaldokument des Labors stammen und welche aus einem Foto gelesen wurden
• Erklärt in einem Satz, was ein Messwert ist: eine Definition des Tests, nie eine Deutung Ihres Ergebnisses
• Zitiert veröffentlichte Referenzbereiche mit der Leitlinie oder Studie dahinter und einem Link darauf, neben dem Bereich, den Ihr eigenes Labor gedruckt hat
• Liest das Display einer Körperanalysewaage vom Foto, damit eine Messung aus dem Fitnessstudio in denselben Verlauf einfließt
• Exportiert ein PDF für Ihre Ärztin oder Ihren Arzt, ein FHIR-R4-Bundle für Ihre elektronische Patientenakte und OMOP-CDM-Tabellen für die Forschung

WAS AUF DEM IPHONE BLEIBT

Die Fotos verlassen das Gerät nie. Die daraus gelesenen Werte werden einzeln verschlüsselt, mit einem Schlüssel, der bei gesperrtem iPhone nicht verfügbar ist und nie auf ein anderes Gerät übertragen wird. Der Speicher ist vom iCloud-Backup ausgenommen.

WOHER DIE ERKLÄRUNG KOMMT

Standardmäßig antwortet das Modell auf Ihrem iPhone, Ihre Frage erreicht also gar kein Netz. Wenn Sie lieber einen Dienst nutzen, wählen Sie die Werte aus, sehen sie aufgelistet und bestätigen, bevor etwas gesendet wird. Name und Geburtsdatum werden nie gesendet, weil die App sie gar nicht speichert. Das gescannte Bild wird ebenfalls nie gesendet.

Sie können die App auch auf Ihre eigene Azure-OpenAI-Ressource oder Ihren eigenen Anthropic-Schlüssel richten. Dann spricht Ihr iPhone direkt mit Ihrem Dienst, und weder der Schlüssel noch die Werte erreichen den Anbieter dieser App.

FUNKTIONIERT OFFLINE

Scannen, Lesen, Codieren, Speichern, Erklären und Exportieren laufen auf dem Gerät. Nichts davon braucht ein Konto.

KEIN MEDIZINPRODUKT

Klarbefund erklärt, was ein Messwert ist. Die App stellt keine Diagnose, bewertet kein Risiko und empfiehlt keine Behandlung. Aus einem Foto gelesene Werte können falsch erkannt werden und gelten als vorläufig, bis Sie sie mit dem Papier abgleichen. Referenzbereiche werden genau so angezeigt, wie Ihr Labor sie gedruckt hat.

Fragen Sie immer eine Ärztin oder einen Arzt, bevor Sie eine Entscheidung über Ihre Gesundheit treffen.

Verfügbar auf Englisch und Deutsch."""
}

WHATS_NEW = {
    "en-GB": "First release.",
    "de-DE": "Erste Version.",
}


# ---------------------------------------------------------------------------
# TestFlight
#
# A tester opening TestFlight sees the app's icon, its name, a description and
# "What to Test". The icon comes from the uploaded build, so it is blank until
# one exists. The two texts are their own resources in App Store Connect,
# separate from the App Store listing above, and nothing was writing them.

# Shown on the app's page in TestFlight, above the build list.
BETA_DESCRIPTION = {
    "en-GB": (
        "Klarbefund reads a paper lab report with the camera and keeps the "
        "values so you can see how one has moved.\n\n"
        "Everything runs on the iPhone: the photographs never leave it, and "
        "the values read from them are encrypted individually with a key that "
        "is unavailable while the phone is locked.\n\n"
        "It explains what a measurement is. It does not diagnose, assess risk "
        "or recommend treatment. Values read from a photograph are marked "
        "preliminary until you check them against the paper."
    ),
    "de-DE": (
        "Klarbefund liest einen Laborbefund auf Papier mit der Kamera und "
        "behält die Werte, damit Sie sehen, wie sich einer verändert hat.\n\n"
        "Alles läuft auf dem iPhone: Die Fotos verlassen es nie, und die "
        "daraus gelesenen Werte werden einzeln verschlüsselt, mit einem "
        "Schlüssel, der bei gesperrtem Gerät nicht verfügbar ist.\n\n"
        "Die App erklärt, was ein Messwert ist. Sie stellt keine Diagnose, "
        "bewertet kein Risiko und empfiehlt keine Behandlung. Aus einem Foto "
        "gelesene Werte gelten als vorläufig, bis Sie sie mit dem Papier "
        "abgleichen."
    ),
}

# Shown beside one build. Rewrite this for each upload: it is what a tester is
# being asked to look at, not a changelog.
WHAT_TO_TEST = {
    "en-GB": (
        "First build. Worth trying, in this order:\n\n"
        "1. Scan a real lab report, or import one as a PDF. Check every value "
        "against the paper; each one names the page and line it came from.\n"
        "2. Look at what it could not read. Unmatched values and unread lines "
        "are listed rather than dropped, and that list is the useful bug "
        "report.\n"
        "3. Fill in the profile. Sex and date of birth pick the published "
        "ranges that apply to you; height makes the waist figure mean "
        "something.\n"
        "4. Scan a second report from another date and open Trends.\n"
        "5. Photograph a body-composition scale's screen, if you pass one.\n"
        "6. Export the PDF, the FHIR bundle and the OMOP tables.\n\n"
        "A misread value is the most useful thing you can find. The app can "
        "produce a diagnostics archive of what it saw."
    ),
    "de-DE": (
        "Erster Build. Lohnt sich in dieser Reihenfolge:\n\n"
        "1. Einen echten Laborbefund scannen oder als PDF importieren. Jeden "
        "Wert mit dem Papier abgleichen; zu jedem stehen Seite und Zeile.\n"
        "2. Ansehen, was nicht gelesen werden konnte. Nicht zugeordnete Werte "
        "und ungelesene Zeilen werden aufgelistet statt verworfen, und genau "
        "diese Liste ist die nützliche Fehlermeldung.\n"
        "3. Das Profil ausfüllen. Geschlecht und Geburtsdatum wählen die "
        "veröffentlichten Bereiche aus, die für Sie gelten; die Körpergröße "
        "macht den Taillenwert aussagekräftig.\n"
        "4. Einen zweiten Befund von einem anderen Datum scannen und den "
        "Verlauf öffnen.\n"
        "5. Das Display einer Körperanalysewaage fotografieren, falls Sie an "
        "einer vorbeikommen.\n"
        "6. PDF, FHIR-Bundle und OMOP-Tabellen exportieren.\n\n"
        "Ein falsch gelesener Wert ist der nützlichste Fund. Die App kann ein "
        "Diagnose-Archiv dessen erzeugen, was sie gesehen hat."
    ),
}

# Optional, and deliberately not hard-coded: App Store Connect shows this
# address to every tester, and whose address it is, is not a decision for a
# file in a repository. Unset means the field is left alone.
import os as _os

FEEDBACK_EMAIL = _os.environ.get("ASC_FEEDBACK_EMAIL")

# App Store Connect field limits. Exceeding one is a rejected PATCH, so they
# are checked here rather than discovered in an HTTP 409.
LIMITS = {"subtitle": 30, "promotionalText": 170, "keywords": 100,
          "description": 4000, "whatsNew": 4000,
          "betaDescription": 4000, "whatToTest": 4000}

# Which dict each length-limited field comes from, so the limits above can be
# checked without the checker knowing the name of every constant.
FIELD_SOURCE = {
    "subtitle": "SUBTITLE",
    "promotionalText": "PROMO",
    "keywords": "KEYWORDS",
    "description": "DESCRIPTION",
    "whatsNew": "WHATS_NEW",
    "betaDescription": "BETA_DESCRIPTION",
    "whatToTest": "WHAT_TO_TEST",
}
