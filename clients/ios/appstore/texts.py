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
    "en-GB": "Read your lab report",
    "de-DE": "Laborwerte offline lesen",
}

PROMO = {
    "en-GB": (
        "Scan a lab report and see every value coded to LOINC, with the line it "
        "came from. The explanation runs on your iPhone, with no network and no "
        "account."
    ),
    "de-DE": (
        "Befund scannen und jeden Wert mit LOINC-Code und Fundstelle sehen. Die "
        "Erklärung läuft auf Ihrem iPhone, ohne Netz und ohne Konto."
    ),
}

KEYWORDS = {
    "en-GB": "lab,blood,laboratory,results,LOINC,FHIR,scan,OCR,offline,privacy,ePA,cholesterol",
    "de-DE": "Labor,Blutwerte,Befund,Laborwerte,LOINC,FHIR,scannen,OCR,offline,ePA,Cholesterin",
}

SUPPORT_URL = "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues"
MARKETING_URL = "https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html"
PRIVACY_URL = "https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html"

DESCRIPTION = {
"en-GB": """Klarbefund turns a paper lab report into something you can read.

Point the camera at an A4 result sheet. The app finds the page edges, reads the table, and shows every measurement with its unit, the reference range your laboratory printed, and the page and line it was read from, so you can check any value against the paper in front of you.

WHAT IT DOES

• Scans multi-page lab reports and doctor's letters
• Reads values, units and reference ranges out of the table
• Codes each analyte to LOINC, with UCUM units
• Shows the page and line behind every value, so nothing is unverifiable
• Lists the values it could not match and the lines it could not read, instead of quietly dropping them
• Exports a PDF and a FHIR R4 bundle to hand to your doctor or put into your electronic patient record

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

"de-DE": """Klarbefund macht aus einem Laborbefund auf Papier etwas Lesbares.

Halten Sie die Kamera auf ein A4-Befundblatt. Die App erkennt die Seitenränder, liest die Tabelle und zeigt jeden Messwert mit Einheit, dem Referenzbereich, den Ihr Labor gedruckt hat, und der Seite und Zeile, aus der er gelesen wurde. So können Sie jeden Wert mit dem Papier vor Ihnen abgleichen.

WAS DIE APP TUT

• Scannt mehrseitige Laborbefunde und Arztbriefe
• Liest Werte, Einheiten und Referenzbereiche aus der Tabelle
• Codiert jeden Analyten nach LOINC, mit UCUM-Einheiten
• Zeigt zu jedem Wert Seite und Zeile, damit nichts unüberprüfbar bleibt
• Listet auf, was sie nicht zuordnen und welche Zeilen sie nicht lesen konnte, statt es stillschweigend zu verwerfen
• Exportiert ein PDF und ein FHIR-R4-Bundle für Ihre Ärztin oder Ihren Arzt oder für Ihre elektronische Patientenakte

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

# App Store Connect field limits. Exceeding one is a rejected PATCH, so they
# are checked here rather than discovered in an HTTP 409.
LIMITS = {"subtitle": 30, "promotionalText": 170, "keywords": 100,
          "description": 4000, "whatsNew": 4000}

# Which dict each length-limited field comes from, so the limits above can be
# checked without the checker knowing the name of every constant.
FIELD_SOURCE = {
    "subtitle": "SUBTITLE",
    "promotionalText": "PROMO",
    "keywords": "KEYWORDS",
    "description": "DESCRIPTION",
    "whatsNew": "WHATS_NEW",
}
