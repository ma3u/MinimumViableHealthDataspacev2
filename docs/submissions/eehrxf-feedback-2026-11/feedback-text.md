We run an open-source EHDS demo and integration hub (FHIR R4, OMOP and the DSP dataspace protocol, https://github.com/ma3u/MinimumViableHealthDataspacev2) and a patient app that turns paper lab reports and wearable data into FHIR. Building against the HL7 Europe guides gives us seven points on the draft.

1. The person cannot be the author. author[x] and attester[x] allow only health professional, organisation or device. Article 5 of Regulation (EU) 2025/327 lets people insert information into their own record, and it must be clearly distinguishable as theirs. Please add EHDSPatient and EHDSRelatedPerson to author[x], and add a coded "information source" (e.g. issued by provider, digitised by the person, self-measured). Our app has to use custom extensions for this today.

2. Reference ranges need a source and a validity period. Ranges change with method, population and guideline edition, so a result compared with "previousResults" can be read against the wrong range. Please add referenceRange source (lab or guideline) and validity dates.

3. Units. Annex I says a Quantity unit is "preferably" coded, Annex X binds UCUM. Please make the UCUM code mandatory for laboratory quantities and keep the printed unit as text, like originalName. The unit also decides the LOINC code (Lp(a) mg/dL 10835-7 vs nmol/L 43583-4; HbA1c % 4548-4 vs mmol/mol 59261-8); the implementation guide should say so. A Union mapping of common printed units to UCUM in the terminology service of Article 6(5) would prevent many errors.

4. Name the guides and their versions. The act names no implementation guide, and the first one is due only 31 October 2027, 17 months before patient summaries and prescriptions apply. The HL7 Europe guides moved fast: our first pins went stale within months (laboratory 0.1.1, now 2.1.0 with 2.2.0-ci in the build; imaging was R5, now has an R4 ballot). Please state in Article 9 that the guide is published as a versioned FHIR package with fixed canonical URLs, together with an open validator, synthetic test data and a public test bed. We validate our own resources with the HL7 validator against 16 HL7 Europe profiles: 148 of 192 pass, 6 profiles have nothing we can test yet, and codes are checked only for shape because there is no openly usable terminology service to check them against. The service of Article 6(5) should be usable for such test runs.

5. PDF/A-1 is from 2005. Please allow PDF/A-2 and PDF/A-3. PDF/A-3 can carry the structured FHIR document inside the human-readable PDF.

6. Integrity of forwarded copies. EHDSAttachment has no hash and no creation date. When a person downloads a copy (Art. 3(2)) and forwards it to a provider (Art. 7(4)), the receiver cannot check it is unchanged. Please add hash and creation from the FHIR Attachment type.

7. Editorial: Annex I points to "Annex IX" for the common data groups (they are in Annex X); the BCP 47 footnote describes BCP 13; the title alternates between "European health record exchange format" and "European electronic health record exchange format"; recital 13 still contains "[Article: National profiles]"; Article 9(4) reads "requirements o".

We also suggest that national profiles under Article 10 be published as machine-readable FHIR packages derived from the EU package, so that conformance to the EEHRxF can be tested automatically.

Details and references are in the attached file. We are happy to share our test setup.
