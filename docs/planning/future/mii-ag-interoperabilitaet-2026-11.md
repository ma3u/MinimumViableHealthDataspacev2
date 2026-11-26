# MII Arbeitsgruppe Interoperabilität: analysis for the EHDS hub (2026-11-25)

Sources read on 2026-11-25:
[AG page](https://www.medizininformatik-initiative.de/de/zusammenarbeit/arbeitsgruppe-interoperabilitaet),
[KDS modules](https://www.medizininformatik-initiative.de/de/module-des-kerndatensatzes-der-mii),
[KDS governance v4.0 PDF](https://www.medizininformatik-initiative.de/sites/default/files/2026-07/KDS-Governance-v4.pdf),
[GitHub org](https://github.com/medizininformatik-initiative),
[Simplifier org](https://simplifier.net/organization/koordinationsstellemii),
[ART-DECOR API](https://art-decor.org/exist/apps/api/project/mide-),
[MII and EHDS press release, June 2024](https://www.medizininformatik-initiative.de/en/medical-informatics-initiative-lays-foundations-ehds).
Not reachable: forschen-fuer-gesundheit.de (403).

## 1. The working group

- Leads: Prof. Thomas Ganslandt (FAU) and Prof. Sylvia Thun (BIH).
- Task forces: DIZ concepts, Kerndatensatz, consent, process models, metadata.
- Decisions: the AG votes per module, one vote per consortium, and no vote may be against.
  The Nationales Steuerungsgremium (NSG) then gives the final approval.
- Public comment: six weeks, announced two weeks ahead, under HL7 Deutschland rules.
  Comments go to the HL7 Deutschland ballot portal or a GitHub issue on the module's repo.
  Every comment gets a written answer, and both are published.

## 2. Governance v4.0 says the KDS is meant to reach the EHDS

The governance (section 3) names two module roles:

- **Innovation modules** model data that care does not yet record in a structured way.
- **Translation modules** move mature specifications into ISiK, MIO and the EHDS.

So the MII sees itself as a feeder for the EHDS, not only as a research data set.
FHIR R4 (4.0.1) is mandatory.

**Versioning** is CalVer `YYYY.MINOR.PATCH`, released once a year:

| Step                       | Deadline              |
| -------------------------- | --------------------- |
| Comment phase announced    | end of September      |
| Comment phase run          | until end of November |
| NSG approval               | end of the year       |
| New year version delivered | end of January        |
| DIZ sites switched over    | end of May            |

The 2027 ballot (`2027.0.0-ballot`) is in its comment window now.

## 3. Core data set (KDS): 24 packages, `de.medizininformatikinitiative.kerndatensatz.*`

The modules are base (Person, Fall, Diagnose, Prozedur), consent, laborbefund, medikation,
mikrobiologie, onkologie, mtb, molgen, patho, bildgebung, dokument, icu, pros, seltene,
studie, biobank, kardiologie, lungenfunktion, symptom, soziodemographie, meta, and the new
ophthalmologie.

- `kerndatensatz-complete` pins them all at `2027.0.0-ballot*` as a bill of materials.
- Stable versions: base 2026.0.1, laborbefund 2026.0.3.
- Dependencies of base:
  - `de.basisprofil.r4` 1.6.0 (HL7 Deutschland)
  - `hl7.terminology.r4` 7.1.0
  - `hl7.fhir.uv.extensions.r4` 5.2.0
  - `hl7.fhir.uv.crmi` 2.0.0
  - `hl7.fhir.uv.xver-r5.r4`
- No dependency on HL7 Europe base or EEHRxF profiles.

## 4. Tooling chain: what is really used

| Tool                                        | Role today                                                                                                                                                                                                           | Evidence                                                                                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub + FSH/SUSHI + HL7 IG Publisher**   | The working tool chain. Each module is one repo with `sushi-config.yaml`, built to GitHub Pages (`/branches/dev/`, `/2027.0.0-ballot/`).                                                                             | [kerndatensatz-basis](https://github.com/medizininformatik-initiative/kerndatensatz-basis), [mii-kds-module-template](https://github.com/medizininformatik-initiative/mii-kds-module-template) |
| **Simplifier.net**                          | Package registry and mirror. The meta README says packages stay there "while package releases are still provided".                                                                                                   | [Simplifier package](https://simplifier.net/packages/de.medizininformatikinitiative.kerndatensatz.meta)                                                                                        |
| **Forge** (Firely's desktop profile editor) | Named in the 2019 tooling access paper. No repository shows it. FSH has replaced it.                                                                                                                                 | no FSH-less module repo found                                                                                                                                                                  |
| **ART-DECOR**                               | Legacy. Project `mide-` holds only two draft datasets from 2018-06-05. The information model now lives as tables and UML in the module IG.                                                                           | `art-decor.org/exist/apps/api/dataset?prefix=mide-`                                                                                                                                            |
| **Terminology**                             | MII Ontoserver (`ontoserver.mii-termserv.de`), with a local Blaze in the validator. [mii-terminology-watch](https://github.com/medizininformatik-initiative/mii-terminology-watch) tracks SNOMED and LOINC releases. | [mii-fhir-validator](https://github.com/medizininformatik-initiative/mii-fhir-validator)                                                                                                       |
| **Validation**                              | `mii-fhir-validator`: Docker, with the MII IGs preloaded.                                                                                                                                                            | same                                                                                                                                                                                           |

### Data access and extraction (FDPG)

| Component                | What it does                      |
| ------------------------ | --------------------------------- |
| CCDL                     | Cohort definition language        |
| CRTDL                    | Data extraction request           |
| FLARE                    | Runs feasibility queries          |
| TORCH                    | Extracts data with consent checks |
| fts-next                 | Transfers data (SMITH)            |
| DSF plugins              | The process engine between sites  |
| dataportal / fdpg-\*     | The research portal               |
| synthiFHIR, mii-testdata | Synthetic test data               |

### New tools

- [AskMIIAnything](https://github.com/medizininformatik-initiative/AskMIIAnything): an MCP server over every KDS module.
- `AGENTS.md` in the module repos: coding agents are now part of their workflow.

## 5. What MII has and does not have for the EHDS

| EHDS topic                   | MII                                                                                                               | Our hub                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Secondary use infrastructure | Strong: FDPG, the DIZ sites, broad consent, TORCH/CRTDL                                                           | Simulated: DSP + EDC, HDAB permit flow, SPE            |
| HealthDCAT-AP                | A [README-only repo](https://github.com/medizininformatik-initiative/healthdcat-ap) pointing to SEMIC Release 6/7 | Implemented in Neo4j, crawler and enricher             |
| EEHRxF / HL7 Europe          | Not referenced in KDS dependencies                                                                                | `register-eehrxf-profiles.cypher` (38 HL7 EU profiles) |
| German profiles              | KDS on `de.basisprofil.r4`                                                                                        | None: no KDS, ISiK or basisprofil reference in code    |
| Primary use / patient        | Out of scope (ISiK and ePA belong to gematik)                                                                     | Patient portal, Klarbefund, EUDI wallet                |

The gap runs both ways:

- MII has the national semantics and does not cover the European formats.
- We have the European formats and do not cover the German semantics.

The EHDS secondary-use path in Germany will run through FDPG and the DIZ sites, and their
data is in KDS.

## 6. Options for us

1. **KDS profiles next to EU core.**
   - Register the KDS base, laborbefund and medikation profiles in Layer 2/3 next to the
     EEHRxF ones.
   - Give each FHIR node both `meta.profile` canonicals.
   - Add a KDS ↔ EU-core crosswalk view.
   - This is our strongest "EHDS-ready for Germany" demo.
2. **Validate our synthetic bundles with `mii-fhir-validator` in CI.** It is a Docker image,
   so it fits the PR Gate. SNOMED release files are needed.
3. **Klarbefund lab export as `kerndatensatz.laborbefund` ObservationLab**, with LOINC as
   today. MII's [loincsnomed-lab-concepts](https://github.com/medizininformatik-initiative/loincsnomed-lab-concepts)
   value sets could check our analyte table.
4. **A CRTDL adapter on the DSP transfer.** A data user's permit scope expressed as CRTDL
   would let a German DIZ running TORCH answer our negotiation. This is the bridge between
   EDC/DSP and FDPG.
5. **Contribute HealthDCAT-AP back.**
   - Offer the MII healthdcat-ap repo our KDS-dataset → HealthDCAT-AP mapping as an example.
   - Low effort, and visible to the AG metadata task force.
6. **Comment on the 2027 ballot** through the module repos' GitHub issues while the window
   runs (until end of November by the governance timetable).
   - Candidate comment: an EEHRxF/HL7 Europe mapping or dependency for the translation
     modules, which governance section 3 itself asks for.
   - Only Matthias posts it.
