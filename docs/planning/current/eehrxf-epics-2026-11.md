# EEHRxF epics from the xShare procurement guidance (2026-11)

- **Discussion:** [#1143](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/1143), should the roadmap get EHRxF epics, and which ones
- **Source:** xShare D7.4, [Guidance for Using EHRxF in Procurements in the Digital Health Ecosystem](https://xshare-project.eu/wp-content/uploads/2026/11/Guidance-for-Using-EHRxF-in-Procurements-in-the-Digital-Health-Ecosystem.pdf) (dated October 2026, published November 2026)
- **Status:** E1 (#1144) in progress since 2026-11-17; E7 is #1145; E2 to E6 wait on the discussion

## What the guidance asks, in one paragraph

For each EHDS priority category (Art. 14(1)), a system should export and import structured FHIR data per the HL7 Europe guides, publish a `CapabilityStatement`, offer a FHIR REST API (ideally the EURIDICE EU Health Data API) with Bulk `$export` and SMART or IUA authorisation, and show test evidence. Test evidence comes in three kinds: against the guides, with Gazelle or a national tool, and formal conformity (Art. 39 to 41); only the last is conformity (§3.4.7, p. 76). The hub's `/eehrxf` page today counts nodes and validates nothing.

## Epics

Order: E1 first, every other epic needs its validator.

| Epic | What                                                                                                                                                                                                                          | Issue                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| E1   | Validate what `/eehrxf` claims, on the current HL7 Europe guides                                                                                                                                                              | [#1144](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1144) (P2) |
| E2   | EU Health Data API facade: `CapabilityStatement`, search, `$export`, SMART scopes                                                                                                                                             | after the discussion                                                             |
| E3   | Patient Summary both ways (IPS and EPS); the export part is [#718](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/718)                                                                                         | after the discussion                                                             |
| E4   | Lab report and discharge report as documents; HDR is in [#1120](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1120), lab content in [#413](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/413) | after the discussion                                                             |
| E5   | ePrescription and eDispensation (MPD)                                                                                                                                                                                         | after the discussion                                                             |
| E6   | Readiness evidence and labelling: ADR on what the hub claims, Gazelle, xShare Label, Art. 47 for Klarbefund                                                                                                                   | after the discussion                                                             |
| E7   | A cancer journey on the HL7 Europe Common Cancer Model, in FHIR and OMOP                                                                                                                                                      | [#1145](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/1145) (P3) |

## Guide versions to track (checked 2026-11-17)

From each guide's `package-list.json` on [hl7.eu/fhir](https://hl7.eu/fhir/): Base and Core 2.0.1, Laboratory Report 2.1.0, Hospital Discharge Report 1.0.0 (first STU, 2026-10-16), Medication Prescription and Dispense 1.0.0, European Patient Summary 1.0.0-ballot, Imaging Report 1.0.0-ballot (R4 and R5), EU-MADO 1.0.0-ballot, EU Health Data API 1.0.0-ballot, Common Cancer Model 1.0.0-ballot. The guidance predates the October releases for Laboratory and HDR.

Moved to `current/` when #1144 started; to `done/` when the discussion has settled E2 to E6 into issues or dropped them.
