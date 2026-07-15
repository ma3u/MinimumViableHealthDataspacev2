"""
Unit tests for the Layer 6 loader's parse + chunk + category-mapping logic.

These tests run without a Neo4j connection — they cover the deterministic
preprocessing that happens before any database write. Cypher / DB integration
is a separate test pass that requires docker-compose Neo4j.

Run:
  uv run --group dev pytest test_layer6_unit.py -v
"""
from __future__ import annotations

import json

import pytest

from category_mapper import map_to_categories, explain, categories_for_records
from load_layer6 import (
    chunk_section_body,
    chunk_id_for,
    parse_markdown_sections,
    section_id_for,
    CHUNK_TARGET_WORDS,
    CHUNK_MIN_WORDS,
    load_index,
    load_one,
    GuidelineRecord,
    _DryRunSession,
)


# ── parse_markdown_sections ─────────────────────────────────────────────────

def test_parse_sections_no_h2_returns_single_preamble():
    md = "Just one paragraph of text without any heading."
    out = parse_markdown_sections(md)
    assert out == [("Preamble", md)]


def test_parse_sections_empty_input_returns_empty():
    assert parse_markdown_sections("") == []
    assert parse_markdown_sections("   \n\n   ") == []


def test_parse_sections_extracts_preamble_then_h2():
    md = "Author info on top.\n\n## Erste Sektion\n\nContent.\n\n## Zweite Sektion\n\nMore."
    out = parse_markdown_sections(md)
    assert [h for h, _ in out] == ["Preamble", "Erste Sektion", "Zweite Sektion"]
    assert "Author info" in out[0][1]
    assert "Content." in out[1][1]
    assert "More." in out[2][1]


def test_parse_sections_no_preamble_when_doc_starts_with_h2():
    md = "## Direkt erste Sektion\n\nBody."
    out = parse_markdown_sections(md)
    assert out == [("Direkt erste Sektion", "Body.")]


def test_parse_sections_handles_german_umlauts_in_heading():
    md = "## Maßnahmen zur Qualitätsprüfung\n\nÜberblick über..."
    out = parse_markdown_sections(md)
    assert out[0][0] == "Maßnahmen zur Qualitätsprüfung"


def test_parse_sections_heading_without_body_keeps_empty_body():
    md = "## Nur Überschrift"
    out = parse_markdown_sections(md)
    assert out == [("Nur Überschrift", "")]


# ── chunk_section_body ─────────────────────────────────────────────────────

def test_chunk_short_body_is_one_chunk():
    body = "A single short paragraph of perhaps thirty words " * 5
    chunks = chunk_section_body(body)
    assert len(chunks) == 1


def test_chunk_long_body_splits_at_target_size():
    # 6 paragraphs of ~200 words each → ~1200 words total → ≥2 chunks at 500 target
    para = ("wort " * 200).strip()
    body = "\n\n".join([para] * 6)
    chunks = chunk_section_body(body)
    assert len(chunks) >= 2
    for c in chunks[:-1]:
        # Non-tail chunks should be near or above target
        assert len(c.split()) >= CHUNK_TARGET_WORDS - 200


def test_chunk_tail_merges_when_below_min_words():
    # Three medium paragraphs followed by a tiny tail — tail must merge into prior chunk
    big = ("wort " * 400).strip()
    tiny = ("wort " * 30).strip()
    body = f"{big}\n\n{big}\n\n{tiny}"
    chunks = chunk_section_body(body)
    final_words = len(chunks[-1].split())
    # Final chunk must not be a stand-alone tiny chunk
    assert final_words >= CHUNK_MIN_WORDS, f"final chunk only {final_words} words"


def test_chunk_empty_body_returns_empty_list():
    assert chunk_section_body("") == []
    assert chunk_section_body("   \n\n   ") == []


# ── id generators ──────────────────────────────────────────────────────────

def test_section_id_includes_awmf_id_and_index():
    sid = section_id_for("001-018", 5, "Indikation")
    assert sid.startswith("001-018::s005")


def test_section_id_strips_special_chars_from_heading():
    sid = section_id_for("001-018", 0, "A.1.1 — Thermoregulation des Menschen!")
    # No special chars in the slug portion
    slug = sid.split("::s000-")[1]
    assert all(c.isalnum() or c == "-" for c in slug)


def test_section_id_handles_empty_heading():
    sid = section_id_for("001-018", 7, "")
    assert sid == "001-018::s007"


def test_chunk_id_extends_section_id():
    sid = "001-018::s005-indikation"
    cid = chunk_id_for(sid, 3)
    assert cid.startswith(sid)
    assert cid.endswith("::c003")


# ── category_mapper ────────────────────────────────────────────────────────

@pytest.mark.parametrize("name,keywords,desc,expected", [
    (
        "Diagnostik und Therapie der Gicht",
        "Hyperurikämie, Arthritis",
        "Empfehlungen zur Labordiagnostik und Pharmakotherapie",
        ["laboratory-results", "eprescription"],
    ),
    (
        "Stationäre Aufnahme im Krankenhaus",
        "Klinik, Entlassungsmanagement",
        "Hospital discharge planning",
        ["hospital-discharge"],
    ),
    (
        "Bildgebung bei Schlaganfall",
        "MRT, CT",
        "Empfehlungen zur radiologischen Bildgebung",
        ["medical-imaging"],
    ),
    (
        "Mukoviszidose im Kindesalter",
        "Cystische Fibrose",
        "Seltene Erkrankung, Diagnostik und Therapie",
        ["rare-disease"],
    ),
])
def test_map_to_categories_picks_dominant_category_first(name, keywords, desc, expected):
    out = map_to_categories(name, keywords, desc)
    assert out, "should never return empty"
    assert out[0] == expected[0], f"expected {expected[0]} as top match for '{name}', got {out}"
    for cat in expected:
        assert cat in out, f"expected {cat} in {out}"


def test_map_to_categories_falls_back_to_patient_summary_on_empty_input():
    assert map_to_categories(None) == ["patient-summary"]
    assert map_to_categories("", "", "") == ["patient-summary"]


def test_map_to_categories_falls_back_when_no_keyword_matches():
    out = map_to_categories(
        "Random text without any clinical keywords",
        "lorem ipsum dolor",
        "completely unrelated content here",
    )
    assert out == ["patient-summary"]


def test_explain_returns_per_category_matched_keywords():
    out = explain("Bildgebung in der Notaufnahme", "MRT, CT, Röntgen", None)
    assert "medical-imaging" in out
    assert any(kw in ("bildgebung", "mrt", "ct", "röntgen") for kw in out["medical-imaging"])


def test_explain_strips_html_from_description():
    # HTML-stripped before matching, so a wrapped keyword still matches
    out = explain(None, None, "<p>Wir empfehlen <b>Pharmakotherapie</b> mit ...</p>")
    assert "eprescription" in out


def test_categories_for_records_maps_known_id_and_skips_missing_id():
    records = [
        {
            "AWMFGuidelineID": "001-018",
            "name": "Bildgebung bei Schlaganfall",
            "titleKeywords": "MRT, CT",
            "description": "Empfehlungen zur radiologischen Diagnostik",
        },
        {
            "name": "Kein Identifier",
            "titleKeywords": "lorem ipsum",
            "description": "soll übersprungen werden",
        },
    ]
    out = categories_for_records(records)
    assert "001-018" in out
    assert out["001-018"][0] == "medical-imaging"
    assert len(out) == 1


def test_load_index_defaults_missing_optional_fields(tmp_path):
    payload = {
        "records": [
            {
                "AWMFGuidelineID": "001-999",
                "name": "Testleitlinie",
            }
        ]
    }
    (tmp_path / "awmf-index.json").write_text(json.dumps(payload), encoding="utf-8")

    out = load_index(tmp_path)
    rec = out["001-999"]
    assert rec.name == "Testleitlinie"
    assert rec.guideline_class == ""
    assert rec.leading_orgs == []
    assert rec.participating_orgs == []


# ── load_one (dry-run integration) ─────────────────────────────────────────

def _record(**overrides) -> GuidelineRecord:
    base = dict(
        awmf_id="001-018",
        name="Testleitlinie",
        guideline_class="S3",
        description="",
        title_keywords="",
        detail_page="",
        release_date=None,
        last_edit=None,
        valid_until=None,
        version_major=None,
        version_minor=None,
        association_number=None,
        leading_orgs=[],
        participating_orgs=[],
    )
    base.update(overrides)
    return GuidelineRecord(**base)


def test_load_one_dry_run_counts_sections_and_chunks(tmp_path):
    para = ("wort " * 250).strip()
    md = (
        "Vorwort der Leitlinie.\n\n"
        "## Indikation\n\n"
        + f"{para}\n\n{para}\n\n{para}\n\n{para}"  # 4×250 ≈ 1000 words → ≥2 chunks
        + "\n\n## Therapie\n\nKurzer Abschnitt."
    )
    md_path = tmp_path / "001-018.md"
    md_path.write_text(md, encoding="utf-8")

    rec = _record()
    result = load_one(_DryRunSession(), rec, md_path, dry_run=True)

    assert result["awmf_id"] == "001-018"
    assert result["dry_run"] is True
    # Preamble + Indikation + Therapie = 3 sections
    assert result["sections"] == 3
    # Indikation (~1000 words across 4 paragraphs) splits into ≥2 chunks
    assert result["chunks"] >= 4


def test_load_one_dry_run_skips_empty_markdown(tmp_path):
    md_path = tmp_path / "001-018.md"
    md_path.write_text("   \n\n   ", encoding="utf-8")

    rec = _record()
    result = load_one(_DryRunSession(), rec, md_path, dry_run=True)

    assert result["sections"] == 0
    assert result["chunks"] == 0
