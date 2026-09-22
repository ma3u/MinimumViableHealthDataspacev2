// Parity check, does the generated Swift table agree with the TypeScript one?
//
// `npm run generate:swift -- --check` proves the generated FILE is current.
// This proves the generated CODE behaves the same: same codings, same folding,
// same refusals. A table that is byte-identical to its source and still resolves
// Lp(a) differently would pass the first check and fail a patient.
//
//   cd clients/ios && swift run AnalyteParity
import Foundation
import Shared

struct Case {
  let label: String
  let unit: String
  let loinc: String?
  let why: String
}

let cases: [Case] = [
  // The unit selects the code, never the label.
  Case(label: "Lp(a)", unit: "mg/dl", loinc: "10835-7", why: "Lp(a) by mass"),
  Case(label: "Lp(a)", unit: "nmol/l", loinc: "43583-4", why: "by moles, a different measurement"),
  Case(label: "HbA1c", unit: "%", loinc: "4548-4", why: "HbA1c as a percentage"),
  Case(label: "HbA1c", unit: "mmol/mol", loinc: "59261-8", why: "HbA1c on the IFCC scale"),

  // Label folding: synonyms, case, spacing, German diacritics.
  Case(label: "LDL-Cholesterin", unit: "mg/dl", loinc: "2089-1", why: "canonical spelling"),
  Case(label: "ldl cholesterin", unit: "mg/dl", loinc: "2089-1", why: "case and punctuation fold"),
  Case(label: "LDL", unit: "mg/dl", loinc: "2089-1", why: "abbreviation is a known synonym"),
  Case(label: "Harnsäure", unit: "mg/dl", loinc: "3084-1", why: "umlaut folds to ae"),
  Case(label: "Kreatinin (Jaffé)", unit: "mg/dl", loinc: "2160-0", why: "a non-ASCII letter is dropped on both sides"),

  // Unit folding.
  Case(label: "Ferritin", unit: "µg/l", loinc: "2276-4", why: "micro sign normalises to u"),
  Case(label: "Ferritin", unit: "ng/ml", loinc: "2276-4", why: "equivalent printed unit"),

  // Distinct analytes that share a prefix.
  Case(label: "hs-CRP", unit: "mg/l", loinc: "30522-7", why: "high-sensitivity CRP"),
  Case(label: "CRP", unit: "mg/l", loinc: "1988-5", why: "ordinary CRP is a different code"),

  // The blood count, and the spellings OCR actually produces (#186).
  Case(label: "Hamoglobin", unit: "g/dl", loinc: "718-7", why: "umlaut dropped by OCR still matches"),
  Case(label: "Hämoglobin", unit: "g/l", loinc: "718-7", why: "lowercase g/l is a mass"),
  Case(label: "Leukozyten", unit: "G/l", loinc: "6690-2", why: "uppercase G/l is a giga count"),
  Case(label: "Erythrozyten", unit: "T/l", loinc: "789-8", why: "tera per litre"),
  Case(label: "Erythrozyten", unit: "/pl", loinc: "789-8", why: "per picolitre, the same count"),
  Case(label: "MCV", unit: "fl", loinc: "787-2", why: "femtolitre"),
  Case(label: "Neutrophile absolut", unit: "/nl", loinc: "751-8", why: "absolute count"),
  Case(label: "Neutrophile", unit: "%", loinc: "770-8", why: "share of leukocytes, a different code"),
  Case(label: "unreife Granulozyten absolut", unit: "/nl", loinc: "53115-2", why: "immature granulocytes"),
  Case(label: "RDW-SD", unit: "fl", loinc: nil, why: "both LOINC codes deprecated, refused"),

  // Two real Berlin sheets, 2026-09-19.
  Case(label: "Quick (TPZ)", unit: "%", loinc: "5894-1", why: "prothrombin time as a percentage"),
  Case(label: "Fibrinogen", unit: "g/l", loinc: "3255-7", why: "fibrinogen by mass"),
  Case(label: "Harnstoff", unit: "mg/dl", loinc: "3091-6", why: "urea by mass"),
  Case(label: "Transferrin-Sättigung", unit: "%", loinc: "2502-3", why: "iron saturation"),
  Case(label: "Kortisol", unit: "nmol/l", loinc: "14675-3", why: "cortisol by moles"),
  Case(label: "Lp(a)", unit: "g/l", loinc: "10835-7", why: "Lp(a) by mass in g/L, as printed"),

  // Glyphs a recogniser confuses, and the ones it must refuse to repair.
  Case(label: "GPT", unit: "U/I", loinc: "1742-6", why: "capital i read for a lower-case L"),
  Case(label: "GOT", unit: "UII", loinc: "1920-8", why: "the slash read as a letter too"),
  Case(label: "TSH", unit: "ulU/ml", loinc: "3016-3", why: "micro international units, mangled"),
  Case(label: "Hämatokrit", unit: "III", loinc: nil, why: "all-confusable token is refused, not read as l/l"),
  Case(label: "MCH", unit: "pg", loinc: "785-6", why: "a real unit is never rewritten"),

  // Homoglyphs: the same glyph from another alphabet.
  Case(label: "МСH", unit: "pg", loinc: "785-6", why: "Cyrillic M and C fold to Latin"),

  // An organism: NCBI Taxonomy names it, LOINC does not, and the table says so.
  Case(label: "Akkermansia muciniphila", unit: "%", loinc: nil, why: "an organism has no LOINC code; its NCBI Taxonomy id travels instead"),

  // Refusals, a wrong code is worse than no code.
  Case(label: "Omega-3-Index", unit: "%", loinc: nil, why: "not in the dictionary"),
  Case(label: "HbA1c", unit: "mg/dl", loinc: nil, why: "unit does not belong to this analyte"),
  Case(label: "Ferritin", unit: "Titer", loinc: nil, why: "unit has no UCUM mapping"),
]

let failures = cases.reduce(into: 0) { total, c in
  let got = Analytes.lookup(label: c.label, unit: c.unit)?.loinc
  if got == c.loinc {
    print("ok    \(c.label) [\(c.unit)] → \(got ?? "nil")")
  } else {
    print("FAIL  \(c.label) [\(c.unit)] → \(got ?? "nil"), expected \(c.loinc ?? "nil"): \(c.why)")
    total += 1
  }
}

print("")
if failures == 0 {
  print("parity ok: \(Analytes.codings.count) codings, \(Analytes.unitMap.count) units")
} else {
  print("\(failures) parity failure(s)")
  exit(1)
}
