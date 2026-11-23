I write as a patient who uses my own health data (primary use) and as an open-source developer. I keep years of laboratory reports from different labs, mostly on paper, and I build an open-source EHDS demo hub (https://github.com/ma3u/MinimumViableHealthDataspacev2) and an iPhone app that turns my paper reports and watch data into FHIR on my own device. Seven points on the draft:

1. I cannot be the author of my own data. author[x] and attester[x] allow only a health professional, an organisation or a device. Article 5 of Regulation (EU) 2025/327 lets me insert information into my record, clearly marked as mine. Please add EHDSPatient and EHDSRelatedPerson to author[x], and a coded "information source" (issued by a provider, digitised by the person, measured by the person). My app needs custom extensions for this today, which no receiver will understand.

2. I cannot compare my results over time. My labs use different reference ranges, and guideline targets change. With "previousResults", an old value is read against today's range. Please add a source (lab or guideline) and a validity period to referenceRange.

3. I cannot check a copy I forward. When I download my record (Art. 3(2)) and send it to a new doctor (Art. 7(4)), nothing shows it is unchanged. EHDSAttachment has no hash and no creation date; please add both from the FHIR Attachment type.

4. PDF/A-1 is from 2005. Please allow PDF/A-2 and PDF/A-3. PDF/A-3 can carry the structured FHIR data inside the PDF I can read, so one file serves me and my doctor's system.

5. Units. Annex I says a unit is "preferably" coded, Annex X binds UCUM. Please make the UCUM code mandatory for lab values and keep the printed unit as text, like originalName. Printed reports use units that are not UCUM, and the unit decides the LOINC code (Lp(a) mg/dL 10835-7 vs nmol/L 43583-4; HbA1c % 4548-4 vs mmol/mol 59261-8). A Union mapping of common printed units to UCUM in the terminology service of Article 6(5) would prevent many errors.

6. As a developer, I need named guides and versions. The act names no guide, and the first implementation guide is due only on 31 October 2027, 17 months before patient summaries and prescriptions apply. The HL7 Europe guides changed under me within months (laboratory 0.1.1 to 2.1.0; imaging from R5 to an R4 ballot). Please state in Article 9 that the guide is a versioned FHIR package with fixed canonical URLs, with an open validator, synthetic test data and a public test bed. My hub validates its resources with the HL7 validator against 16 HL7 Europe profiles: 148 of 192 pass, 6 profiles have nothing to test yet, and codes are checked only for shape because no terminology service is open to such test runs. The service of Article 6(5) should be. National profiles under Article 10 should also be published as FHIR packages derived from the EU one, so conformance can be tested, not just claimed.

7. Editorial: Annex I points to "Annex IX" for the common data groups (they are in Annex X); the BCP 47 footnote describes BCP 13; the title alternates between "European health record exchange format" and "European electronic health record exchange format"; recital 13 still contains "[Article: National profiles]"; Article 9(4) reads "requirements o".

Details and references are in the attached file. My code and test setup are open source; I am happy to share them.
