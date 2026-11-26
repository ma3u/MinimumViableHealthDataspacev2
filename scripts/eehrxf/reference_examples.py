#!/usr/bin/env python3
"""Write reference examples for the EEHRxF profiles the hub produces nothing for.

The hub makes no Practitioner, PractitionerRole, MedicationDispense,
ImagingStudy or hospital discharge report, so its own data leaves these
profiles untested. These examples show what a conforming resource looks like.
validate.py validates them as the source `reference` and the viewer on
/eehrxf shows them, but they never count in a profile's tested and passed
figures: coverage stays a statement about the hub's own data.

All data is fictional: the persona P1 (Maria Schmidt) and AlphaKlinik Berlin,
as in the hub's seeds. Deterministic, so a rerun writes the same files.

    python3 scripts/eehrxf/reference_examples.py          # write
    python3 scripts/eehrxf/reference_examples.py --check  # exit 1 if out of date
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "samples" / "reference"
SID = "https://ehds.mabu.red/fhir/sid"
SNOMED = "http://snomed.info/sct"
LOINC = "http://loinc.org"
FICTIONAL = {"system": "http://terminology.hl7.org/CodeSystem/v3-ActReason", "code": "HTEST", "display": "test health data"}


def meta() -> dict:
    # Tagged as test data, so no reader takes it for a real record.
    return {"tag": [FICTIONAL]}


PATIENT_REF = {"reference": "Patient/P1", "display": "Maria Schmidt (fictional)"}
ORG_REF = {"reference": "Organization/alpha-klinik", "display": "AlphaKlinik Berlin (fictional)"}
PRACTITIONER_REF = {"reference": "Practitioner/ref-practitioner-1", "display": "Dr. Lena Vogt (fictional)"}


def practitioner() -> dict:
    return {
        "resourceType": "Practitioner",
        "id": "ref-practitioner-1",
        "meta": meta(),
        "identifier": [{"system": f"{SID}/practitioner", "value": "PRAC-0001"}],
        "active": True,
        "name": [{"family": "Vogt", "given": ["Lena"], "prefix": ["Dr."]}],
        "gender": "female",
    }


def practitioner_role() -> dict:
    return {
        "resourceType": "PractitionerRole",
        "id": "ref-practitioner-role-1",
        "meta": meta(),
        "identifier": [{"system": f"{SID}/practitioner-role", "value": "ROLE-0001"}],
        "active": True,
        "practitioner": PRACTITIONER_REF,
        "organization": ORG_REF,
        "specialty": [
            {"coding": [{"system": SNOMED, "code": "394802001", "display": "General medicine"}]}
        ],
    }


def medication_dispense() -> dict:
    return {
        "resourceType": "MedicationDispense",
        "id": "ref-medication-dispense-1",
        "meta": meta(),
        # When the dispense was recorded: R5's MedicationDispense.recorded, which
        # the HL7 Europe guide requires as an extension on R4.
        "extension": [
            {
                "url": "http://hl7.org/fhir/5.0/StructureDefinition/extension-MedicationDispense.recorded",
                "valueDateTime": "2026-03-12T10:35:00+01:00",
            }
        ],
        "identifier": [{"system": f"{SID}/medication-dispense", "value": "DISP-0001"}],
        "status": "completed",
        "medicationCodeableConcept": {
            "coding": [
                {"system": "http://www.whocc.no/atc", "code": "C10AA05", "display": "atorvastatin"}
            ],
            "text": "Atorvastatin 20 mg film-coated tablets",
        },
        "subject": PATIENT_REF,
        "performer": [
            {
                "actor": {
                    "reference": "Organization/alpha-klinik-pharmacy",
                    "display": "AlphaKlinik Berlin pharmacy (fictional)",
                }
            }
        ],
        "authorizingPrescription": [
            {"reference": "MedicationRequest/ref-medication-request-1", "display": "Atorvastatin 20 mg daily"}
        ],
        "quantity": {"value": 30, "unit": "tablet", "system": "http://standardterms.edqm.eu", "code": "10219000"},
        "whenHandedOver": "2026-03-12T10:30:00+01:00",
        "dosageInstruction": [{"text": "One tablet daily in the evening"}],
    }


def imaging_study() -> dict:
    return {
        "resourceType": "ImagingStudy",
        "id": "ref-imaging-study-1",
        "meta": meta(),
        "identifier": [
            {
                "type": {
                    "coding": [
                        {
                            "system": "http://dicom.nema.org/resources/ontology/DCM",
                            "code": "110180",
                            "display": "Study Instance UID",
                        }
                    ]
                },
                "system": "urn:dicom:uid",
                "value": "urn:oid:2.25.330437398409231012473906447282386390000",
            }
        ],
        "status": "available",
        "modality": [
            {"system": "http://dicom.nema.org/resources/ontology/DCM", "code": "CR", "display": "Computed Radiography"}
        ],
        "subject": PATIENT_REF,
        "started": "2026-02-20T09:15:00+01:00",
        "numberOfSeries": 1,
        "numberOfInstances": 1,
        "procedureCode": [
            {"coding": [{"system": LOINC, "code": "36643-5", "display": "XR Chest 2 Views"}]}
        ],
        "series": [
            {
                "uid": "2.25.330437398409231012473906447282386390001",
                "number": 1,
                "modality": {
                    "system": "http://dicom.nema.org/resources/ontology/DCM",
                    "code": "CR",
                    "display": "Computed Radiography",
                },
                "numberOfInstances": 1,
                "bodySite": {"system": SNOMED, "code": "51185008", "display": "Thoracic structure"},
                "instance": [
                    {
                        "uid": "2.25.330437398409231012473906447282386390002",
                        "sopClass": {"system": "urn:ietf:rfc:3986", "code": "urn:oid:1.2.840.10008.5.1.4.1.1.1"},
                        "number": 1,
                    }
                ],
            }
        ],
    }


def urn(name: str) -> str:
    """A stable urn:uuid for an entry of the discharge document."""
    return f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, 'https://ehds.mabu.red/fhir/reference/hdr/' + name)}"


def discharge_report() -> dict:
    """A hospital discharge report as a document: Composition, Patient, Encounter, the diagnosis and the author."""
    u = {k: urn(k) for k in ("composition", "patient", "encounter", "condition", "practitioner", "organization")}
    patient = {
        "resourceType": "Patient",
        "id": "P1",
        "meta": meta(),
        "identifier": [{"system": f"{SID}/patient", "value": "P1"}],
        "name": [{"family": "Schmidt", "given": ["Maria"]}],
        "gender": "female",
        "birthDate": "1968-04-02",
    }
    organization = {
        "resourceType": "Organization",
        "id": "alpha-klinik",
        "meta": meta(),
        "identifier": [{"system": f"{SID}/organization", "value": "ALPHA-KLINIK"}],
        "name": "AlphaKlinik Berlin (fictional)",
    }
    practitioner_ = {**practitioner()}
    encounter = {
        "resourceType": "Encounter",
        "id": "ref-encounter-1",
        "meta": meta(),
        "status": "finished",
        "class": {
            "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            "code": "IMP",
            "display": "inpatient encounter",
        },
        "subject": {"reference": u["patient"]},
        "period": {"start": "2026-03-02T08:00:00+01:00", "end": "2026-03-09T11:00:00+01:00"},
        "serviceProvider": {"reference": u["organization"]},
        "hospitalization": {
            "admitSource": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/admit-source",
                        "code": "emd",
                        "display": "From accident/emergency department",
                    }
                ]
            },
            "dischargeDisposition": {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/discharge-disposition",
                        "code": "home",
                        "display": "Home",
                    }
                ]
            },
        },
    }
    condition = {
        "resourceType": "Condition",
        "id": "ref-condition-1",
        "meta": meta(),
        "clinicalStatus": {
            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]
        },
        "verificationStatus": {
            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed"}]
        },
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/condition-category",
                        "code": "encounter-diagnosis",
                        "display": "Encounter Diagnosis",
                    }
                ]
            }
        ],
        "code": {"coding": [{"system": SNOMED, "code": "233604007", "display": "Pneumonia"}]},
        "subject": {"reference": u["patient"]},
        "encounter": {"reference": u["encounter"]},
        "onsetDateTime": "2026-03-01",
        "recordedDate": "2026-03-02",
    }

    def narrative(text: str) -> dict:
        return {"status": "generated", "div": f'<div xmlns="http://www.w3.org/1999/xhtml"><p>{text}</p></div>'}

    composition = {
        "resourceType": "Composition",
        "id": "ref-composition-hdr-1",
        "meta": meta(),
        "identifier": {"system": f"{SID}/discharge-report", "value": "HDR-0001"},
        "status": "final",
        "type": {"coding": [{"system": LOINC, "code": "34105-7", "display": "Hospital Discharge summary"}]},
        "subject": {"reference": u["patient"]},
        "encounter": {"reference": u["encounter"]},
        "date": "2026-03-09T12:00:00+01:00",
        "author": [{"reference": u["practitioner"]}],
        "title": "Hospital discharge report (fictional)",
        "custodian": {"reference": u["organization"]},
        "section": [
            {
                "title": "Problem list",
                "code": {"coding": [{"system": LOINC, "code": "11450-4", "display": "Problem list - Reported"}]},
                "text": narrative("Pneumonia, confirmed, treated in hospital."),
                "entry": [{"reference": u["condition"]}],
            },
            {
                "title": "Hospital course",
                "code": {"coding": [{"system": LOINC, "code": "8648-8", "display": "Hospital course Narrative"}]},
                "text": narrative("Admitted with fever and cough; seven days of antibiotics; discharged home in good condition."),
            },
        ],
    }
    entries = [
        (u["composition"], composition),
        (u["patient"], patient),
        (u["encounter"], encounter),
        (u["condition"], condition),
        (u["practitioner"], practitioner_),
        (u["organization"], organization),
    ]
    return {
        "resourceType": "Bundle",
        "id": "ref-hdr-document-1",
        "meta": meta(),
        "identifier": {"system": f"{SID}/document", "value": "HDR-DOC-0001"},
        "type": "document",
        "timestamp": "2026-03-09T12:00:00+01:00",
        "entry": [{"fullUrl": url, "resource": r} for url, r in entries],
    }


EXAMPLES = {
    "hospital-discharge-report.json": discharge_report,
    "practitioner-eu-core.json": practitioner,
    "practitioner-role-eu-core.json": practitioner_role,
    "medication-dispense-eu.json": medication_dispense,
    "imaging-study-eu.json": imaging_study,
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="fail if the files are out of date")
    args = ap.parse_args()
    want = {OUT / name: json.dumps(make(), indent=2, ensure_ascii=False) + "\n" for name, make in EXAMPLES.items()}
    stale = [p for p, text in want.items() if not p.exists() or json.loads(p.read_text()) != json.loads(text)]
    stale += [p for p in OUT.glob("*.json") if p not in want] if OUT.exists() else []
    if args.check:
        for p in stale:
            print(f"out of date: {p} (run python3 scripts/eehrxf/reference_examples.py)", file=sys.stderr)
        return 1 if stale else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for p in OUT.glob("*.json"):
        if p not in want:
            p.unlink()
    for p, text in want.items():
        p.write_text(text, encoding="utf-8")
        print(f"wrote {p.relative_to(HERE.parents[1])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
