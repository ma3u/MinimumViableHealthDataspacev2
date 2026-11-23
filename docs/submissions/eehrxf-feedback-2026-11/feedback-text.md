I write as a patient using my own health data, as an open-source developer and as a contributor to Eclipse Dataspace Components. I keep years of lab reports, take part in medical studies and use my data for prevention (longevity, supplements). I build an EHDS demo hub (https://github.com/ma3u/MinimumViableHealthDataspacev2) and Klarbefund (https://klarbefund.mabu.red), an iPhone app that turns my paper reports and watch data into FHIR on my device. Ten points:

1. I cannot add or export single values. My ePA takes my own documents, not a single value, has no API for my app, and gives me no export for trend analysis. The GDPR gives me a copy in a common electronic form (Art. 15(3)) and completion of my data (Art. 16), but portability (Art. 20) covers only data I provided on consent or contract, not my doctors' records. Annex II names the FHIR REST API for transmission; please open it to the person's own app, to write single values (Art. 5) and read everything (Art. 3).

2. I cannot be the author of my own data. Author and attester allow only a health professional, an organisation or a device. Please allow EHDSPatient and EHDSRelatedPerson as author, with a coded information source (issued by a provider, digitised or measured by the person). Article 5 of Regulation (EU) 2025/327 lets me insert information, clearly marked as mine; my app needs custom extensions for this today.

3. I need raw data, not summaries. A download should hold every result in full: value, unit, method, specimen, history, and for imaging the DICOM images (Annex II allows a PDF). When I donate data to a study, I want its result and my values back as FHIR to discuss with my family doctor, not only a lay summary; § 27(2) BDSG lets research limit my access. Please allow food supplements in EHDSMedicationUse, with me as author.

4. I cannot compare results over time. Labs use different reference ranges and guideline targets change, so with previousResults an old value is read against today's range. Please add a source and a validity period to referenceRange.

5. I cannot check a copy I forward (Art. 7(4)). Please add hash and creation date to EHDSAttachment, as in FHIR.

6. Please allow PDF/A-2 and PDF/A-3, not only PDF/A-1 from 2005; PDF/A-3 can carry the FHIR data inside the PDF.

7. Units: make UCUM mandatory for lab values and keep the printed unit as text. The unit decides the LOINC code (Lp(a) mg/dL 10835-7 vs nmol/L 43583-4; HbA1c % 4548-4 vs mmol/mol 59261-8). A Union mapping of printed units to UCUM in the Art. 6(5) terminology service would prevent errors.

8. As a developer, I need named guides and versions. The first implementation guide is due 31 October 2027; the HL7 Europe guides changed under me (laboratory 0.1.1 to 2.1.0, imaging R5 to R4). Please publish it as a versioned FHIR package with an open validator, synthetic test data and a test bed, and national profiles (Art. 10) as packages derived from it. My hub: 148 of 192 resources pass 16 profiles; codes are checked only for shape, as no terminology service is open to test runs.

9. Terminology. The annex binds SNOMED GPS, a free subset, not SNOMED CT, and ICD-10, not ICD-11. A Member State that licenses full SNOMED CT, as Germany does, loses codes outside the subset or must map them. Please allow full SNOMED CT where licensed, with GPS as the minimum, and ICD-11 next to ICD-10.

10. Editorial: Annex I points to Annex IX for the common data groups (Annex X); the BCP 47 footnote describes BCP 13; the title varies ("electronic" missing); recital 13 starts with a drafting note; Art. 9(4) has a typo ("requirements o").

Details, sources and screenshots of a working solution are in the attachment.
