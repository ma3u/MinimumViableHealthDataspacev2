"""DSP dcat:Catalog JSON-LD → HealthDCAT-AP DatasetUpsert.

Pure function: no Neo4j, no NATS, no I/O. Easy to unit-test.
HealthDCAT-AP Release 8 (ADR-063, #700). Per ADR-020: themes that map to a known
:SnomedConcept / :LoincCode / :ICD10Code are linked; unknown themes are
preserved on the node and counted via enricher_unknown_theme_total.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from .models import CrawlEnvelope, DatasetUpsert

SNOMED_SYSTEM = "http://snomed.info/sct"
LOINC_SYSTEM = "http://loinc.org"
ICD10_SYSTEM = "http://hl7.org/fhir/sid/icd-10"


def _coerce_theme_code(theme: Any) -> str | None:
    """Extract an ontology-qualified code from a dcat:theme entry."""
    if isinstance(theme, str):
        return theme
    if isinstance(theme, dict):
        system = theme.get("system") or theme.get("@type") or ""
        code = theme.get("code") or theme.get("@id") or ""
        if system and code:
            return f"{system}|{code}"
        return code or None
    return None


def _values(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _iri(value: Any) -> str | None:
    """The IRI of a JSON-LD node or value: {"@id": ...} or a bare string."""
    if isinstance(value, dict):
        value = value.get("@id")
    return str(value) if value else None


def _codes(value: Any) -> list[str]:
    """Vocabulary codes from IRIs: .../healthcategories/EHRS -> EHRS."""
    return [iri.rstrip("/").rsplit("/", 1)[-1] for iri in map(_iri, _values(value)) if iri]


def _bool(value: Any) -> bool | None:
    if isinstance(value, dict):
        value = value.get("@value")
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.lower() in ("true", "false"):
        return value.lower() == "true"
    return None


def extract_datasets(env: CrawlEnvelope) -> list[DatasetUpsert]:
    """Return one DatasetUpsert per dcat:Dataset entry in the envelope catalog."""
    catalog = env.catalog or {}
    datasets_raw = catalog.get("dcat:dataset") or catalog.get("datasets") or []
    if not isinstance(datasets_raw, list):
        datasets_raw = [datasets_raw]

    out: list[DatasetUpsert] = []
    for raw in datasets_raw:
        if not isinstance(raw, dict):
            continue
        dataset_id = (
            raw.get("@id")
            or raw.get("datasetId")
            or raw.get("dct:identifier")
            or raw.get("id")
        )
        if not dataset_id:
            continue

        themes_raw = raw.get("dcat:theme") or raw.get("theme") or []
        if not isinstance(themes_raw, list):
            themes_raw = [themes_raw]
        themes = [t for t in (_coerce_theme_code(t) for t in themes_raw) if t]

        distributions_raw = raw.get("dcat:distribution") or raw.get("distributions") or []
        if not isinstance(distributions_raw, list):
            distributions_raw = [distributions_raw]
        # Release 8 writes the access URL, media type and format as IRIs.
        distributions = [
            {
                "format": _iri(d.get("dcat:mediaType"))
                or _iri(d.get("dct:format"))
                or _iri(d.get("format"))
                or "",
                "accessUrl": _iri(d.get("dcat:accessURL")) or _iri(d.get("accessUrl")) or "",
            }
            for d in distributions_raw
            if isinstance(d, dict)
        ]

        out.append(
            DatasetUpsert(
                dataset_id=str(dataset_id),
                title=str(raw.get("dct:title") or raw.get("title") or dataset_id),
                description=raw.get("dct:description") or raw.get("description"),
                publisher_did=env.participant_did,
                country=raw.get("dct:spatial")
                or (raw.get("publisher") or {}).get("country"),
                # A Release 8 licence is a dct:LicenseDocument node, older
                # catalogues give the IRI or a code as a string.
                license=_iri(raw.get("dct:license") or raw.get("license")),
                themes=themes,
                distributions=distributions,
                odrl_policy=raw.get("odrl:hasPolicy") or raw.get("policy"),
                last_seen_at=env.fetched_at,
                # HealthDCAT-AP Release 8 (#700): carried through federation
                # instead of dropped, as codes of the EU vocabularies.
                access_rights=next(iter(_codes(raw.get("dct:accessRights"))), None),
                applicable_legislation=[
                    i for i in map(_iri, _values(raw.get("dcatap:applicableLegislation"))) if i
                ],
                health_categories=_codes(raw.get("healthdcatap:healthCategory")),
                health_themes=_codes(raw.get("healthdcatap:healthTheme")),
                coding_systems=_codes(raw.get("healthdcatap:hasCodingSystem")),
                has_structured_data=_bool(raw.get("healthdcatap:hasStructuredData")),
                hdab_did=_iri(raw.get("healthdcatap:hdab")),
                keywords=[str(k) for k in _values(raw.get("dcat:keyword")) if k],
            )
        )
    return out


def known_theme_system(theme: str) -> str | None:
    """Return the ontology label if a theme string is one we can link to."""
    if theme.startswith(SNOMED_SYSTEM + "|"):
        return "SnomedConcept"
    if theme.startswith(LOINC_SYSTEM + "|"):
        return "LoincCode"
    if theme.startswith(ICD10_SYSTEM + "|"):
        return "ICD10Code"
    return None


def split_theme(theme: str) -> tuple[str, str]:
    """Return (system, code) for a '<system>|<code>' string."""
    if "|" not in theme:
        return "", theme
    system, code = theme.split("|", 1)
    return system, code


def now_iso(dt: datetime | None = None) -> str:
    """ISO 8601 with zulu tail, for audit nodes."""
    return (dt or datetime.utcnow()).strftime("%Y-%m-%dT%H:%M:%SZ")
