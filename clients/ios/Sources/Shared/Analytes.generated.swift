// GENERATED FILE, DO NOT EDIT.
//
// Source: services/epa-ingest/src/analytes.ts
// Regenerate: cd services/epa-ingest && npm run generate:swift
//
// The iPhone app and the epa-ingest CLI must code an analyte identically; a
// hand-maintained copy of this table is the divergence the shared repository
// exists to prevent. CI fails when this file is out of date with its source.
//
// The unit selects the LOINC code, never the label: Lp(a) in mg/dL and in
// nmol/L are different measurements with different codes.

import Foundation

public struct AnalyteCoding: Sendable, Equatable, Codable {
  /// Normalised analyte label, see `normaliseLabel`.
  public let labelKey: String
  /// UCUM unit code this coding applies to.
  public let ucum: String
  public let loinc: String
  public let display: String
  /// Canonical key of the analyte definition, stable across units.
  public let analyteKey: String
}

public enum Analytes {
  /// Printed unit spelling → UCUM code. Mirrors `normaliseUnit`.
  public static let unitMap: [String: String] = [
    "/nl": "10*9/L",
    "/ul": "/uL",
    "%": "%",
    "10^3/ul": "10*3/uL",
    "10^9/l": "10*9/L",
    "g/dl": "g/dL",
    "g/l": "g/L",
    "g/nl": "10*9/L",
    "iu/l": "[IU]/L",
    "mg/dl": "mg/dL",
    "mg/l": "mg/L",
    "miu/l": "m[IU]/L",
    "ml/min": "mL/min",
    "ml/min/1,73m2": "mL/min/{1.73_m2}",
    "ml/min/1.73m2": "mL/min/{1.73_m2}",
    "mmol/l": "mmol/L",
    "mmol/mol": "mmol/mol",
    "mu/l": "m[IU]/L",
    "ng/l": "ng/L",
    "ng/ml": "ng/mL",
    "nmol/l": "nmol/L",
    "pg/ml": "pg/mL",
    "pmol/l": "pmol/L",
    "u/l": "U/L",
    "ug/dl": "ug/dL",
    "ug/l": "ug/L",
    "umol/l": "umol/L",
  ]

  public static let codings: [AnalyteCoding] = [
    AnalyteCoding(labelKey: "25ohvitamind", ucum: "ng/mL", loinc: "1989-3", display: "25-hydroxyvitamin D3 [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-d"),
    AnalyteCoding(labelKey: "25ohvitamind", ucum: "nmol/L", loinc: "14635-7", display: "25-hydroxyvitamin D3 [Moles/volume] in Serum or Plasma", analyteKey: "vitamin-d"),
    AnalyteCoding(labelKey: "25ohvitamind3", ucum: "ng/mL", loinc: "1989-3", display: "25-hydroxyvitamin D3 [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-d"),
    AnalyteCoding(labelKey: "25ohvitamind3", ucum: "nmol/L", loinc: "14635-7", display: "25-hydroxyvitamin D3 [Moles/volume] in Serum or Plasma", analyteKey: "vitamin-d"),
    AnalyteCoding(labelKey: "alat", ucum: "U/L", loinc: "1742-6", display: "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "alt"),
    AnalyteCoding(labelKey: "alt", ucum: "U/L", loinc: "1742-6", display: "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "alt"),
    AnalyteCoding(labelKey: "apoa1", ucum: "g/L", loinc: "1869-7", display: "Apolipoprotein A-I [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-a1"),
    AnalyteCoding(labelKey: "apoa1", ucum: "mg/dL", loinc: "1869-7", display: "Apolipoprotein A-I [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-a1"),
    AnalyteCoding(labelKey: "apoai", ucum: "g/L", loinc: "1869-7", display: "Apolipoprotein A-I [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-a1"),
    AnalyteCoding(labelKey: "apoai", ucum: "mg/dL", loinc: "1869-7", display: "Apolipoprotein A-I [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-a1"),
    AnalyteCoding(labelKey: "apob", ucum: "g/L", loinc: "1884-6", display: "Apolipoprotein B [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-b"),
    AnalyteCoding(labelKey: "apob", ucum: "mg/dL", loinc: "1884-6", display: "Apolipoprotein B [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-b"),
    AnalyteCoding(labelKey: "apolipoproteina1", ucum: "g/L", loinc: "1869-7", display: "Apolipoprotein A-I [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-a1"),
    AnalyteCoding(labelKey: "apolipoproteina1", ucum: "mg/dL", loinc: "1869-7", display: "Apolipoprotein A-I [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-a1"),
    AnalyteCoding(labelKey: "apolipoproteinai", ucum: "g/L", loinc: "1869-7", display: "Apolipoprotein A-I [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-a1"),
    AnalyteCoding(labelKey: "apolipoproteinai", ucum: "mg/dL", loinc: "1869-7", display: "Apolipoprotein A-I [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-a1"),
    AnalyteCoding(labelKey: "apolipoproteinb", ucum: "g/L", loinc: "1884-6", display: "Apolipoprotein B [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-b"),
    AnalyteCoding(labelKey: "apolipoproteinb", ucum: "mg/dL", loinc: "1884-6", display: "Apolipoprotein B [Mass/volume] in Serum or Plasma", analyteKey: "apolipoprotein-b"),
    AnalyteCoding(labelKey: "asat", ucum: "U/L", loinc: "1920-8", display: "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "ast"),
    AnalyteCoding(labelKey: "ast", ucum: "U/L", loinc: "1920-8", display: "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "ast"),
    AnalyteCoding(labelKey: "b12", ucum: "ng/L", loinc: "2132-9", display: "Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-b12"),
    AnalyteCoding(labelKey: "b12", ucum: "pg/mL", loinc: "2132-9", display: "Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-b12"),
    AnalyteCoding(labelKey: "b12", ucum: "pmol/L", loinc: "16695-9", display: "Cobalamin (Vitamin B12) [Moles/volume] in Serum or Plasma", analyteKey: "vitamin-b12"),
    AnalyteCoding(labelKey: "blutzucker", ucum: "mg/dL", loinc: "2345-7", display: "Glucose [Mass/volume] in Serum or Plasma", analyteKey: "glucose"),
    AnalyteCoding(labelKey: "blutzucker", ucum: "mmol/L", loinc: "14749-6", display: "Glucose [Moles/volume] in Serum or Plasma", analyteKey: "glucose"),
    AnalyteCoding(labelKey: "calcidiol", ucum: "ng/mL", loinc: "1989-3", display: "25-hydroxyvitamin D3 [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-d"),
    AnalyteCoding(labelKey: "calcidiol", ucum: "nmol/L", loinc: "14635-7", display: "25-hydroxyvitamin D3 [Moles/volume] in Serum or Plasma", analyteKey: "vitamin-d"),
    AnalyteCoding(labelKey: "cholesterin", ucum: "mg/dL", loinc: "2093-3", display: "Cholesterol [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-total"),
    AnalyteCoding(labelKey: "cholesterin", ucum: "mmol/L", loinc: "14647-2", display: "Cholesterol [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-total"),
    AnalyteCoding(labelKey: "cholesteringesamt", ucum: "mg/dL", loinc: "2093-3", display: "Cholesterol [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-total"),
    AnalyteCoding(labelKey: "cholesteringesamt", ucum: "mmol/L", loinc: "14647-2", display: "Cholesterol [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-total"),
    AnalyteCoding(labelKey: "cholesteroltotal", ucum: "mg/dL", loinc: "2093-3", display: "Cholesterol [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-total"),
    AnalyteCoding(labelKey: "cholesteroltotal", ucum: "mmol/L", loinc: "14647-2", display: "Cholesterol [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-total"),
    AnalyteCoding(labelKey: "cobalamin", ucum: "ng/L", loinc: "2132-9", display: "Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-b12"),
    AnalyteCoding(labelKey: "cobalamin", ucum: "pg/mL", loinc: "2132-9", display: "Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-b12"),
    AnalyteCoding(labelKey: "cobalamin", ucum: "pmol/L", loinc: "16695-9", display: "Cobalamin (Vitamin B12) [Moles/volume] in Serum or Plasma", analyteKey: "vitamin-b12"),
    AnalyteCoding(labelKey: "creaktivesprotein", ucum: "mg/dL", loinc: "1988-5", display: "C reactive protein [Mass/volume] in Serum or Plasma", analyteKey: "crp"),
    AnalyteCoding(labelKey: "creaktivesprotein", ucum: "mg/L", loinc: "1988-5", display: "C reactive protein [Mass/volume] in Serum or Plasma", analyteKey: "crp"),
    AnalyteCoding(labelKey: "creatinin", ucum: "mg/dL", loinc: "2160-0", display: "Creatinine [Mass/volume] in Serum or Plasma", analyteKey: "creatinine"),
    AnalyteCoding(labelKey: "creatinin", ucum: "umol/L", loinc: "14682-9", display: "Creatinine [Moles/volume] in Serum or Plasma", analyteKey: "creatinine"),
    AnalyteCoding(labelKey: "crp", ucum: "mg/dL", loinc: "1988-5", display: "C reactive protein [Mass/volume] in Serum or Plasma", analyteKey: "crp"),
    AnalyteCoding(labelKey: "crp", ucum: "mg/L", loinc: "1988-5", display: "C reactive protein [Mass/volume] in Serum or Plasma", analyteKey: "crp"),
    AnalyteCoding(labelKey: "crphighsensitive", ucum: "mg/L", loinc: "30522-7", display: "C reactive protein [Mass/volume] in Serum or Plasma by High sensitivity method", analyteKey: "crp-hs"),
    AnalyteCoding(labelKey: "crphochsensitiv", ucum: "mg/L", loinc: "30522-7", display: "C reactive protein [Mass/volume] in Serum or Plasma by High sensitivity method", analyteKey: "crp-hs"),
    AnalyteCoding(labelKey: "egfr", ucum: "mL/min/{1.73_m2}", loinc: "62238-1", display: "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] ... by Creatinine-based formula (CKD-EPI)", analyteKey: "egfr"),
    AnalyteCoding(labelKey: "egfrckdepi", ucum: "mL/min/{1.73_m2}", loinc: "62238-1", display: "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] ... by Creatinine-based formula (CKD-EPI)", analyteKey: "egfr"),
    AnalyteCoding(labelKey: "ferritin", ucum: "ng/mL", loinc: "2276-4", display: "Ferritin [Mass/volume] in Serum or Plasma", analyteKey: "ferritin"),
    AnalyteCoding(labelKey: "ferritin", ucum: "ug/L", loinc: "2276-4", display: "Ferritin [Mass/volume] in Serum or Plasma", analyteKey: "ferritin"),
    AnalyteCoding(labelKey: "gammagt", ucum: "U/L", loinc: "2324-2", display: "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "ggt"),
    AnalyteCoding(labelKey: "gesamtcholesterin", ucum: "mg/dL", loinc: "2093-3", display: "Cholesterol [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-total"),
    AnalyteCoding(labelKey: "gesamtcholesterin", ucum: "mmol/L", loinc: "14647-2", display: "Cholesterol [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-total"),
    AnalyteCoding(labelKey: "gfr", ucum: "mL/min/{1.73_m2}", loinc: "62238-1", display: "Glomerular filtration rate/1.73 sq M.predicted [Volume Rate/Area] ... by Creatinine-based formula (CKD-EPI)", analyteKey: "egfr"),
    AnalyteCoding(labelKey: "ggt", ucum: "U/L", loinc: "2324-2", display: "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "ggt"),
    AnalyteCoding(labelKey: "glucose", ucum: "mg/dL", loinc: "2345-7", display: "Glucose [Mass/volume] in Serum or Plasma", analyteKey: "glucose"),
    AnalyteCoding(labelKey: "glucose", ucum: "mmol/L", loinc: "14749-6", display: "Glucose [Moles/volume] in Serum or Plasma", analyteKey: "glucose"),
    AnalyteCoding(labelKey: "glukose", ucum: "mg/dL", loinc: "2345-7", display: "Glucose [Mass/volume] in Serum or Plasma", analyteKey: "glucose"),
    AnalyteCoding(labelKey: "glukose", ucum: "mmol/L", loinc: "14749-6", display: "Glucose [Moles/volume] in Serum or Plasma", analyteKey: "glucose"),
    AnalyteCoding(labelKey: "glykohaemoglobin", ucum: "%", loinc: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood", analyteKey: "hba1c"),
    AnalyteCoding(labelKey: "glykohaemoglobin", ucum: "mmol/mol", loinc: "59261-8", display: "Hemoglobin A1c/Hemoglobin.total in Blood by IFCC protocol", analyteKey: "hba1c"),
    AnalyteCoding(labelKey: "got", ucum: "U/L", loinc: "1920-8", display: "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "ast"),
    AnalyteCoding(labelKey: "gotast", ucum: "U/L", loinc: "1920-8", display: "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "ast"),
    AnalyteCoding(labelKey: "gpt", ucum: "U/L", loinc: "1742-6", display: "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "alt"),
    AnalyteCoding(labelKey: "gptalt", ucum: "U/L", loinc: "1742-6", display: "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "alt"),
    AnalyteCoding(labelKey: "gt", ucum: "U/L", loinc: "2324-2", display: "Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma", analyteKey: "ggt"),
    AnalyteCoding(labelKey: "haemoglobin", ucum: "g/dL", loinc: "718-7", display: "Hemoglobin [Mass/volume] in Blood", analyteKey: "haemoglobin"),
    AnalyteCoding(labelKey: "haemoglobin", ucum: "g/L", loinc: "718-7", display: "Hemoglobin [Mass/volume] in Blood", analyteKey: "haemoglobin"),
    AnalyteCoding(labelKey: "haemoglobina1c", ucum: "%", loinc: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood", analyteKey: "hba1c"),
    AnalyteCoding(labelKey: "haemoglobina1c", ucum: "mmol/mol", loinc: "59261-8", display: "Hemoglobin A1c/Hemoglobin.total in Blood by IFCC protocol", analyteKey: "hba1c"),
    AnalyteCoding(labelKey: "harnsaeure", ucum: "mg/dL", loinc: "3084-1", display: "Urate [Mass/volume] in Serum or Plasma", analyteKey: "urate"),
    AnalyteCoding(labelKey: "harnsaeure", ucum: "umol/L", loinc: "14933-6", display: "Urate [Moles/volume] in Serum or Plasma", analyteKey: "urate"),
    AnalyteCoding(labelKey: "hb", ucum: "g/dL", loinc: "718-7", display: "Hemoglobin [Mass/volume] in Blood", analyteKey: "haemoglobin"),
    AnalyteCoding(labelKey: "hb", ucum: "g/L", loinc: "718-7", display: "Hemoglobin [Mass/volume] in Blood", analyteKey: "haemoglobin"),
    AnalyteCoding(labelKey: "hba1c", ucum: "%", loinc: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood", analyteKey: "hba1c"),
    AnalyteCoding(labelKey: "hba1c", ucum: "mmol/mol", loinc: "59261-8", display: "Hemoglobin A1c/Hemoglobin.total in Blood by IFCC protocol", analyteKey: "hba1c"),
    AnalyteCoding(labelKey: "hdl", ucum: "mg/dL", loinc: "2085-9", display: "Cholesterol in HDL [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-hdl"),
    AnalyteCoding(labelKey: "hdl", ucum: "mmol/L", loinc: "14646-4", display: "Cholesterol in HDL [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-hdl"),
    AnalyteCoding(labelKey: "hdlc", ucum: "mg/dL", loinc: "2085-9", display: "Cholesterol in HDL [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-hdl"),
    AnalyteCoding(labelKey: "hdlc", ucum: "mmol/L", loinc: "14646-4", display: "Cholesterol in HDL [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-hdl"),
    AnalyteCoding(labelKey: "hdlcholesterin", ucum: "mg/dL", loinc: "2085-9", display: "Cholesterol in HDL [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-hdl"),
    AnalyteCoding(labelKey: "hdlcholesterin", ucum: "mmol/L", loinc: "14646-4", display: "Cholesterol in HDL [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-hdl"),
    AnalyteCoding(labelKey: "hochsensitivescrp", ucum: "mg/L", loinc: "30522-7", display: "C reactive protein [Mass/volume] in Serum or Plasma by High sensitivity method", analyteKey: "crp-hs"),
    AnalyteCoding(labelKey: "homocystein", ucum: "umol/L", loinc: "13965-9", display: "Homocysteine [Moles/volume] in Serum or Plasma", analyteKey: "homocysteine"),
    AnalyteCoding(labelKey: "homozystein", ucum: "umol/L", loinc: "13965-9", display: "Homocysteine [Moles/volume] in Serum or Plasma", analyteKey: "homocysteine"),
    AnalyteCoding(labelKey: "hscrp", ucum: "mg/L", loinc: "30522-7", display: "C reactive protein [Mass/volume] in Serum or Plasma by High sensitivity method", analyteKey: "crp-hs"),
    AnalyteCoding(labelKey: "k", ucum: "mmol/L", loinc: "2823-3", display: "Potassium [Moles/volume] in Serum or Plasma", analyteKey: "potassium"),
    AnalyteCoding(labelKey: "kalium", ucum: "mmol/L", loinc: "2823-3", display: "Potassium [Moles/volume] in Serum or Plasma", analyteKey: "potassium"),
    AnalyteCoding(labelKey: "kreatinin", ucum: "mg/dL", loinc: "2160-0", display: "Creatinine [Mass/volume] in Serum or Plasma", analyteKey: "creatinine"),
    AnalyteCoding(labelKey: "kreatinin", ucum: "umol/L", loinc: "14682-9", display: "Creatinine [Moles/volume] in Serum or Plasma", analyteKey: "creatinine"),
    AnalyteCoding(labelKey: "ldl", ucum: "mg/dL", loinc: "2089-1", display: "Cholesterol in LDL [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-ldl"),
    AnalyteCoding(labelKey: "ldl", ucum: "mmol/L", loinc: "22748-8", display: "Cholesterol in LDL [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-ldl"),
    AnalyteCoding(labelKey: "ldlc", ucum: "mg/dL", loinc: "2089-1", display: "Cholesterol in LDL [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-ldl"),
    AnalyteCoding(labelKey: "ldlc", ucum: "mmol/L", loinc: "22748-8", display: "Cholesterol in LDL [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-ldl"),
    AnalyteCoding(labelKey: "ldlcholesterin", ucum: "mg/dL", loinc: "2089-1", display: "Cholesterol in LDL [Mass/volume] in Serum or Plasma", analyteKey: "cholesterol-ldl"),
    AnalyteCoding(labelKey: "ldlcholesterin", ucum: "mmol/L", loinc: "22748-8", display: "Cholesterol in LDL [Moles/volume] in Serum or Plasma", analyteKey: "cholesterol-ldl"),
    AnalyteCoding(labelKey: "leukos", ucum: "10*9/L", loinc: "6690-2", display: "Leukocytes [#/volume] in Blood by Automated count", analyteKey: "leukocytes"),
    AnalyteCoding(labelKey: "leukozyten", ucum: "10*9/L", loinc: "6690-2", display: "Leukocytes [#/volume] in Blood by Automated count", analyteKey: "leukocytes"),
    AnalyteCoding(labelKey: "lipoproteina", ucum: "mg/dL", loinc: "10835-7", display: "Lipoprotein a [Mass/volume] in Serum or Plasma", analyteKey: "lipoprotein-a"),
    AnalyteCoding(labelKey: "lipoproteina", ucum: "mg/L", loinc: "10835-7", display: "Lipoprotein a [Mass/volume] in Serum or Plasma", analyteKey: "lipoprotein-a"),
    AnalyteCoding(labelKey: "lipoproteina", ucum: "nmol/L", loinc: "43583-4", display: "Lipoprotein a [Moles/volume] in Serum or Plasma", analyteKey: "lipoprotein-a"),
    AnalyteCoding(labelKey: "lpa", ucum: "mg/dL", loinc: "10835-7", display: "Lipoprotein a [Mass/volume] in Serum or Plasma", analyteKey: "lipoprotein-a"),
    AnalyteCoding(labelKey: "lpa", ucum: "mg/L", loinc: "10835-7", display: "Lipoprotein a [Mass/volume] in Serum or Plasma", analyteKey: "lipoprotein-a"),
    AnalyteCoding(labelKey: "lpa", ucum: "nmol/L", loinc: "43583-4", display: "Lipoprotein a [Moles/volume] in Serum or Plasma", analyteKey: "lipoprotein-a"),
    AnalyteCoding(labelKey: "na", ucum: "mmol/L", loinc: "2951-2", display: "Sodium [Moles/volume] in Serum or Plasma", analyteKey: "sodium"),
    AnalyteCoding(labelKey: "natrium", ucum: "mmol/L", loinc: "2951-2", display: "Sodium [Moles/volume] in Serum or Plasma", analyteKey: "sodium"),
    AnalyteCoding(labelKey: "ntprobnp", ucum: "ng/L", loinc: "33762-6", display: "Natriuretic peptide.B prohormone N-Terminal [Mass/volume] in Serum or Plasma", analyteKey: "nt-probnp"),
    AnalyteCoding(labelKey: "ntprobnp", ucum: "pg/mL", loinc: "33762-6", display: "Natriuretic peptide.B prohormone N-Terminal [Mass/volume] in Serum or Plasma", analyteKey: "nt-probnp"),
    AnalyteCoding(labelKey: "nuechternglucose", ucum: "mg/dL", loinc: "2345-7", display: "Glucose [Mass/volume] in Serum or Plasma", analyteKey: "glucose"),
    AnalyteCoding(labelKey: "nuechternglucose", ucum: "mmol/L", loinc: "14749-6", display: "Glucose [Moles/volume] in Serum or Plasma", analyteKey: "glucose"),
    AnalyteCoding(labelKey: "plt", ucum: "10*9/L", loinc: "777-3", display: "Platelets [#/volume] in Blood by Automated count", analyteKey: "platelets"),
    AnalyteCoding(labelKey: "tg", ucum: "mg/dL", loinc: "2571-8", display: "Triglyceride [Mass/volume] in Serum or Plasma", analyteKey: "triglycerides"),
    AnalyteCoding(labelKey: "tg", ucum: "mmol/L", loinc: "14927-8", display: "Triglyceride [Moles/volume] in Serum or Plasma", analyteKey: "triglycerides"),
    AnalyteCoding(labelKey: "thrombos", ucum: "10*9/L", loinc: "777-3", display: "Platelets [#/volume] in Blood by Automated count", analyteKey: "platelets"),
    AnalyteCoding(labelKey: "thrombozyten", ucum: "10*9/L", loinc: "777-3", display: "Platelets [#/volume] in Blood by Automated count", analyteKey: "platelets"),
    AnalyteCoding(labelKey: "thyreotropin", ucum: "m[IU]/L", loinc: "3016-3", display: "Thyrotropin [Units/volume] in Serum or Plasma", analyteKey: "tsh"),
    AnalyteCoding(labelKey: "triglyceride", ucum: "mg/dL", loinc: "2571-8", display: "Triglyceride [Mass/volume] in Serum or Plasma", analyteKey: "triglycerides"),
    AnalyteCoding(labelKey: "triglyceride", ucum: "mmol/L", loinc: "14927-8", display: "Triglyceride [Moles/volume] in Serum or Plasma", analyteKey: "triglycerides"),
    AnalyteCoding(labelKey: "triglyzeride", ucum: "mg/dL", loinc: "2571-8", display: "Triglyceride [Mass/volume] in Serum or Plasma", analyteKey: "triglycerides"),
    AnalyteCoding(labelKey: "triglyzeride", ucum: "mmol/L", loinc: "14927-8", display: "Triglyceride [Moles/volume] in Serum or Plasma", analyteKey: "triglycerides"),
    AnalyteCoding(labelKey: "tsh", ucum: "m[IU]/L", loinc: "3016-3", display: "Thyrotropin [Units/volume] in Serum or Plasma", analyteKey: "tsh"),
    AnalyteCoding(labelKey: "tshbasal", ucum: "m[IU]/L", loinc: "3016-3", display: "Thyrotropin [Units/volume] in Serum or Plasma", analyteKey: "tsh"),
    AnalyteCoding(labelKey: "urat", ucum: "mg/dL", loinc: "3084-1", display: "Urate [Mass/volume] in Serum or Plasma", analyteKey: "urate"),
    AnalyteCoding(labelKey: "urat", ucum: "umol/L", loinc: "14933-6", display: "Urate [Moles/volume] in Serum or Plasma", analyteKey: "urate"),
    AnalyteCoding(labelKey: "vitaminb12", ucum: "ng/L", loinc: "2132-9", display: "Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-b12"),
    AnalyteCoding(labelKey: "vitaminb12", ucum: "pg/mL", loinc: "2132-9", display: "Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-b12"),
    AnalyteCoding(labelKey: "vitaminb12", ucum: "pmol/L", loinc: "16695-9", display: "Cobalamin (Vitamin B12) [Moles/volume] in Serum or Plasma", analyteKey: "vitamin-b12"),
    AnalyteCoding(labelKey: "vitamind", ucum: "ng/mL", loinc: "1989-3", display: "25-hydroxyvitamin D3 [Mass/volume] in Serum or Plasma", analyteKey: "vitamin-d"),
    AnalyteCoding(labelKey: "vitamind", ucum: "nmol/L", loinc: "14635-7", display: "25-hydroxyvitamin D3 [Moles/volume] in Serum or Plasma", analyteKey: "vitamin-d"),
    AnalyteCoding(labelKey: "wbc", ucum: "10*9/L", loinc: "6690-2", display: "Leukocytes [#/volume] in Blood by Automated count", analyteKey: "leukocytes"),
  ]

  /// Folds case, spacing, punctuation and German diacritics. Mirrors `normaliseLabel`.
  public static func normaliseLabel(_ raw: String) -> String {
    let folded = raw.lowercased()
      .replacingOccurrences(of: "ä", with: "ae")
      .replacingOccurrences(of: "ö", with: "oe")
      .replacingOccurrences(of: "ü", with: "ue")
      .replacingOccurrences(of: "ß", with: "ss")
    return String(folded.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) })
  }

  public static func normaliseUnit(_ raw: String) -> String? {
    let key = raw.replacingOccurrences(of: "µ", with: "u")
      .replacingOccurrences(of: "μ", with: "u")
      .components(separatedBy: .whitespaces).joined()
      .lowercased()
    return unitMap[key]
  }

  /// Resolves a printed label and unit to a coding, or nil, never a guess.
  public static func lookup(label: String, unit: String) -> AnalyteCoding? {
    guard let ucum = normaliseUnit(unit) else { return nil }
    let key = normaliseLabel(label)
    return codings.first { $0.labelKey == key && $0.ucum == ucum }
  }

  /// True when the dictionary knows this analyte in *some* unit.
  ///
  /// Separates "we have never heard of this analyte" from "we know it, but not
  /// in the unit printed", a distinction that decides whether a row is a gap
  /// in the dictionary or a unit the lab reported unusually.
  public static func knowsLabel(_ label: String) -> Bool {
    let key = normaliseLabel(label)
    return codings.contains { $0.labelKey == key }
  }

  /// The units this analyte is defined for, for an actionable error message.
  public static func expectedUnits(forLabel label: String) -> [String] {
    let key = normaliseLabel(label)
    return codings.filter { $0.labelKey == key }.map { $0.ucum }
  }
}
