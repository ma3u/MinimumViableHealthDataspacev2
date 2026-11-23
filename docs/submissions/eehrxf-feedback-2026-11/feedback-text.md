I write as a patient using my own health data (primary use), as an open-source developer and as a contributor to Eclipse Dataspace Components. I keep years of lab reports from different labs, take part in medical studies and use my data for prevention (longevity, supplements). I build an EHDS demo hub (https://github.com/ma3u/MinimumViableHealthDataspacev2) and Klarbefund (https://klarbefund.mabu.red), an iPhone app that turns my paper reports and watch data into FHIR on my device. Eight points:

1. I cannot be the author of my own data. The author and attester elements allow only a health professional, an organisation or a device. Article 5 of Regulation (EU) 2025/327 lets me insert information into my record, clearly marked as mine. Please allow EHDSPatient and EHDSRelatedPerson as author, and a coded "information source" (issued by a provider, digitised by the person, measured by the person). My app needs custom extensions for this today.

2. I need my raw data, not only summaries. A download under Art. 3(2) should hold every registered result in full: value, unit, method, specimen and history. For imaging I need the DICOM images; Annex II allows a PDF for imaging studies. Results of study visits recorded in my EHR should be exchangeable as medical test results that name the study. When I donate my data to a study, I want the study's result and my own measured values back in the EEHRxF, as FHIR raw data I can discuss with my family doctor, not only a lay summary; today German law (§ 27(2) BDSG) lets research limit my access. EHDSMedicationUse covers only medicinal products, so the supplements I take cannot be recorded; please allow food supplements, with me as author.

3. I cannot compare my results over time. Labs use different reference ranges, and guideline targets change, so with "previousResults" an old value is read against today's range. Please add a source (lab or guideline) and a validity period to referenceRange.

4. I cannot check a copy I forward. When I send my downloaded record to a new doctor (Art. 7(4)), nothing shows it is unchanged. Please add hash and creation date to EHDSAttachment, as in FHIR.

5. PDF/A-1 is from 2005. Please allow PDF/A-2 and PDF/A-3, which can carry the structured FHIR data inside the PDF I read.

6. Units. Please make the UCUM code mandatory for lab values (Annex I only says "preferably") and keep the printed unit as text, like originalName. The unit decides the LOINC code (Lp(a) mg/dL 10835-7 vs nmol/L 43583-4; HbA1c % 4548-4 vs mmol/mol 59261-8). A Union mapping of printed units to UCUM in the Article 6(5) terminology service would prevent errors.

7. As a developer, I need named guides and versions. The first implementation guide is due on 31 October 2027, 17 months before patient summaries and prescriptions apply, and the HL7 Europe guides changed under me (laboratory 0.1.1 to 2.1.0; imaging R5 to an R4 ballot). Please state in Article 9 that the guide is a versioned FHIR package with fixed canonical URLs, an open validator, synthetic test data and a public test bed. My hub checks its resources against 16 HL7 Europe profiles: 148 of 192 pass, and codes are checked only for shape because no terminology service is open to test runs. National profiles (Art. 10) should be FHIR packages derived from the EU one, so conformance can be tested.

8. Editorial: Annex I points to "Annex IX" for the common data groups (Annex X); the BCP 47 footnote describes BCP 13; the title alternates between "European health record exchange format" and "European electronic health record exchange format"; recital 13 still starts with a drafting note on national profiles; Article 9(4) has a typo ("requirements o").

Details are in the attached file. My code and test setup are open source.
