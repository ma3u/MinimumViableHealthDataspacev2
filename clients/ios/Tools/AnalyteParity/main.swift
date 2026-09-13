// Parity check — does the generated Swift table agree with the TypeScript one?
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
  Case(label: "Lp(a)", unit: "nmol/l", loinc: "43583-4", why: "by moles — a different measurement"),
  Case(label: "HbA1c", unit: "%", loinc: "4548-4", why: "HbA1c as a percentage"),
  Case(label: "HbA1c", unit: "mmol/mol", loinc: "59261-8", why: "HbA1c on the IFCC scale"),

  // Label folding: synonyms, case, spacing, German diacritics.
  Case(label: "LDL-Cholesterin", unit: "mg/dl", loinc: "2089-1", why: "canonical spelling"),
  Case(label: "ldl cholesterin", unit: "mg/dl", loinc: "2089-1", why: "case and punctuation fold"),
  Case(label: "LDL", unit: "mg/dl", loinc: "2089-1", why: "abbreviation is a known synonym"),
  Case(label: "Harnsäure", unit: "mg/dl", loinc: "3084-1", why: "umlaut folds to ae"),

  // Unit folding.
  Case(label: "Ferritin", unit: "µg/l", loinc: "2276-4", why: "micro sign normalises to u"),
  Case(label: "Ferritin", unit: "ng/ml", loinc: "2276-4", why: "equivalent printed unit"),

  // Distinct analytes that share a prefix.
  Case(label: "hs-CRP", unit: "mg/l", loinc: "30522-7", why: "high-sensitivity CRP"),
  Case(label: "CRP", unit: "mg/l", loinc: "1988-5", why: "ordinary CRP is a different code"),

  // Refusals — a wrong code is worse than no code.
  Case(label: "Omega-3-Index", unit: "%", loinc: nil, why: "not in the dictionary"),
  Case(label: "HbA1c", unit: "mg/dl", loinc: nil, why: "unit does not belong to this analyte"),
  Case(label: "Ferritin", unit: "Titer", loinc: nil, why: "unit has no UCUM mapping"),
]

let failures = cases.reduce(into: 0) { total, c in
  let got = Analytes.lookup(label: c.label, unit: c.unit)?.loinc
  if got == c.loinc {
    print("ok    \(c.label) [\(c.unit)] → \(got ?? "nil")")
  } else {
    print("FAIL  \(c.label) [\(c.unit)] → \(got ?? "nil"), expected \(c.loinc ?? "nil") — \(c.why)")
    total += 1
  }
}

print("")
if failures == 0 {
  print("parity ok — \(Analytes.codings.count) codings, \(Analytes.unitMap.count) units")
} else {
  print("\(failures) parity failure(s)")
  exit(1)
}
