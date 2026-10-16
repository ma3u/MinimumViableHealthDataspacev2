# Klarbefund: the documentation

Klarbefund is the iPhone app of this project
([#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186)).
It scans a paper lab report, reads the values on the device, codes them with
LOINC, keeps them encrypted on the phone, and exports them as FHIR and OMOP or
sends them to the person's own record on the hub when they say so.

The guides are published on the hub at
[ehds.mabu.red/docs/klarbefund](https://ehds.mabu.red/docs/klarbefund) and
on [GitHub Pages](https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/klarbefund);
these are their sources.

| Document                                                    | For                    | What it covers                                                                                                                 |
| ----------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [User guide](user-guide.md)                                 | a person using the app | Every screen with a screenshot: getting a report in, checking a value, trends, consents, the EHDS connection, exports, privacy |
| [Developer guide](developer-guide.md)                       | a developer            | Building, running and testing; the pipeline from camera to sealed store; the generated dictionary; demo data; diagnostics; CI  |
| [Self-assessment](self-assessment.md)                       | a reviewer             | GDPR, BSI TR-03161 objective by objective, the EU AI Act label and the MDR status, each line pointing to code or a test        |
| [Evidence](evidence.md)                                     | a reviewer             | The accuracy benchmark, the dictionary parity check, the run record, and what is still missing                                 |
| [Report for health insurers](report-for-health-insurers.md) | a steering meeting     | The three questions an insurer asks, answered with the evidence, plus the white-label and consulting offer                     |
| [Run the evidence on a Mac](run-on-mac.md)                  | anyone with Xcode      | How to reproduce every number in the evidence                                                                                  |
| [Threat model](../security/threat-model-klarbefund.md)      | a security reviewer    | STRIDE analysis of the app; each mitigation names the code or test that shows it                                               |

The source is in [`clients/ios/`](../../clients/ios/), with its own
[README](../../clients/ios/README.md) as the command card. The beta is joined
by the [public TestFlight link](https://testflight.apple.com/join/ssADSXX6)
on an iPhone with iOS 26 or later.

Every screenshot under `img/` shows invented data from the app's own
development dataset; `diagrams/` holds the PlantUML sources of the figures in
the developer guide, rendered by `scripts/render-plantuml.sh`.
