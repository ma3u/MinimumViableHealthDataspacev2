"""
Heuristic mapper from AWMF guideline metadata to EEHRxF priority categories.

The EHDS regulation defines 6 priority categories that EHRs must support
(Patient Summary, ePrescription, Laboratory Results, Hospital Discharge,
Medical Imaging, Rare Disease). This module produces a multi-label assignment
of AWMF guidelines to those categories using keyword matching against the
guideline name + titleKeywords + description.

Heuristic only — Phase 2 MVP. A follow-up will use NER + structured
extraction over guideline content for higher precision.
"""
from __future__ import annotations

import re
from typing import Iterable

# EEHRxFCategory ids registered in neo4j/register-eehrxf-profiles.cypher
EEHRXF_CATEGORY_IDS = (
    "patient-summary",
    "eprescription",
    "laboratory-results",
    "hospital-discharge",
    "medical-imaging",
    "rare-disease",
)

# German + English keywords per category. Lowercased; matched as
# whole-word-ish via regex word-boundary.
KEYWORDS: dict[str, tuple[str, ...]] = {
    "eprescription": (
        "verordnung", "rezept", "verschreibung", "arzneimittel", "medikament",
        "pharmakotherapie", "dosierung", "wechselwirkung",
        "prescription", "drug", "medication", "pharmacotherapy",
    ),
    "laboratory-results": (
        "labor", "laboratory", "labordiagnostik", "diagnostik",
        "blutwert", "biomarker", "ivd",
        "in-vitro", "blood test",
    ),
    "hospital-discharge": (
        "entlassung", "entlassungs", "krankenhaus", "klinik", "stationär",
        "aufnahme", "intensiv", "hospitalisierung",
        "discharge", "hospital", "inpatient", "intensive care",
    ),
    "medical-imaging": (
        "bildgebung", "radiologie", "röntgen", "ct", "mrt", "sonographie",
        "ultraschall", "szintigraphie", "pet",
        "imaging", "radiology", "ultrasound", "x-ray",
    ),
    "rare-disease": (
        "selten", "seltene erkrank", "rare", "orphan",
        "achondroplasie", "phenylketonurie", "mukoviszidose",
    ),
    # patient-summary is the catch-all — assigned when nothing else matches,
    # or when the guideline is broad / cross-cutting (multiple categories).
    "patient-summary": (
        "leitlinie", "diagnostik und therapie", "versorgung",
        "guideline", "diagnosis and treatment",
    ),
}


def _normalize(s: str | None) -> str:
    if not s:
        return ""
    # Strip HTML tags and collapse whitespace; keep umlauts.
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.lower()


def map_to_categories(
    name: str | None,
    title_keywords: str | None = None,
    description: str | None = None,
) -> list[str]:
    """
    Return the list of EEHRxFCategory ids this guideline matches, ranked by
    keyword density (highest first). Always returns at least one entry —
    falls back to 'patient-summary' if nothing else matches.
    """
    haystack = " ".join(
        _normalize(s) for s in (name, title_keywords, description) if s
    )
    if not haystack:
        return ["patient-summary"]

    scored: dict[str, int] = {}
    for cat_id, keywords in KEYWORDS.items():
        if cat_id == "patient-summary":
            continue  # handled as fallback
        hits = sum(
            1 for kw in keywords
            if re.search(rf"\b{re.escape(kw)}", haystack)
        )
        if hits:
            scored[cat_id] = hits

    if not scored:
        return ["patient-summary"]

    return sorted(scored, key=lambda k: -scored[k])


def explain(
    name: str | None,
    title_keywords: str | None = None,
    description: str | None = None,
) -> dict:
    """Diagnostic helper — returns the per-category hit counts for inspection."""
    haystack = " ".join(
        _normalize(s) for s in (name, title_keywords, description) if s
    )
    out = {}
    for cat_id, keywords in KEYWORDS.items():
        matched = [kw for kw in keywords if re.search(rf"\b{re.escape(kw)}", haystack)]
        if matched:
            out[cat_id] = matched
    return out


def categories_for_records(records: Iterable[dict]) -> dict[str, list[str]]:
    """Bulk variant: returns {awmfId: [categoryId, ...]} for all records."""
    result: dict[str, list[str]] = {}
    for r in records:
        awmf_id = r.get("AWMFGuidelineID")
        if not awmf_id:
            continue
        result[awmf_id] = map_to_categories(
            r.get("name"),
            r.get("titleKeywords"),
            r.get("description"),
        )
    return result
