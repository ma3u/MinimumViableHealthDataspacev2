"""Unit tests for nvl_pipeline.py and load_guideline_citations.py. No network, no database, no PDF."""
import datetime as dt

import load_guideline_citations as loader
import nvl_pipeline as nvl

TODAY = dt.date(2026, 11, 19)


# ── finding the documents ────────────────────────────────────────────────────

TOPIC_PAGE = """
<a href="https://www.leitlinien.de/themen/khk/archiv/pdf/khk-2aufl-vers1-lang.pdf">alt</a>
<a href="https://www.leitlinien.de/themen/khk/archiv/pdf/khk-vers7-lang-konsultation.pdf">Konsultation</a>
<a href="https://www.leitlinien.de/themen/khk/leitlinienreport/khk-vers7-0-llr.pdf">Report</a>
<a href="https://www.leitlinien.de/themen/khk/patientenblaetter/statin-mittlere-hohe-dosis-nehmen.pdf">Blatt</a>
<a href="https://www.leitlinien.de/themen/khk/pdf/khk-vers7-0.pdf">Langfassung</a>
<a href="https://www.leitlinien.de/themen/diabetes/langfassung/diabetes-vers3-0.pdf">other topic</a>
"""


def test_only_the_current_long_version_is_the_guideline():
    assert nvl.find_pdf_links(TOPIC_PAGE, "khk") == {
        "long": "https://www.leitlinien.de/themen/khk/pdf/khk-vers7-0.pdf"
    }


def test_short_version_is_found_beside_the_long_one():
    html = (
        '<a href="https://www.leitlinien.de/themen/hypertonie/kurzfassung/hypertonie-vers-1-0-kurz.pdf">k</a>'
        '<a href="https://www.leitlinien.de/themen/hypertonie/langfassung/hypertonie-vers1-0.pdf">l</a>'
    )
    links = nvl.find_pdf_links(html, "hypertonie")
    assert links["short"].endswith("hypertonie-vers-1-0-kurz.pdf")
    assert links["long"].endswith("hypertonie-vers1-0.pdf")


def test_version_from_both_file_name_forms():
    assert nvl.parse_version("khk-vers7-0.pdf") == "7.0"
    assert nvl.parse_version("hypertonie-vers-1-0-kurz.pdf") == "1.0"
    assert nvl.parse_version("flyer.pdf") is None


# ── dates and validity ───────────────────────────────────────────────────────


def test_german_date():
    assert nvl.parse_german_date("15. Mai 2028") == "2028-05-15"
    assert nvl.parse_german_date("12. Dezember 2023") == "2023-12-12"
    assert nvl.parse_german_date("im Sommer 2023") is None


def test_validity_with_one_end_date():
    md = ("GÜLTIGKEITSDAUER UND FORTSCHREIBUNG\nDiese Leitlinie wurde am 29. Juni 2023 durch die Träger "
          "verabschiedet und ist bis zur nächsten Überarbeitung bzw. spätestens bis 29. Juni 2028 gültig. "
          "DOI: 10.6101/AZQ/000502")
    v = nvl.find_validity(md)
    assert v == {"adoptedDate": "2023-06-29", "validUntilDate": "2028-06-29",
                 "earliestValidUntilDate": "2028-06-29", "doi": "10.6101/AZQ/000502"}


def test_a_confirmed_chapter_keeps_its_earlier_end_date():
    # NVL Chronische Herzinsuffizienz, version 4: one chapter revised, the rest from 2019.
    md = ("GÜLTIGKEITSDAUER UND FORTSCHREIBUNG Version 4 dieser Leitlinie wurde am 12. Dezember 2023 durch die "
          "Träger des NVL-Programms verabschiedet. Dafür wurde ausschließlich das Kapitel aktualisiert, dieses "
          "ist bis 12. Dezember 2028 gültig. Sie wurden als 3. Auflage am 22. Oktober 2019 veröffentlicht und "
          "sind bis 22. Oktober 2024 gültig.")
    v = nvl.find_validity(md)
    assert v["adoptedDate"] == "2023-12-12"
    assert v["validUntilDate"] == "2028-12-12"
    assert v["earliestValidUntilDate"] == "2024-10-22"


# ── status: what "outdated" means ────────────────────────────────────────────


def test_status():
    base = {"offered": True, "supersededBy": None, "validUntilDate": "2028-06-29",
            "earliestValidUntilDate": "2028-06-29"}
    assert nvl.status_of(base, TODAY) == (True, "active")
    assert nvl.status_of({**base, "validUntilDate": "2026-11-18"}, TODAY) == (False, "expired")
    assert nvl.status_of({**base, "earliestValidUntilDate": "2024-10-22"}, TODAY) == (True, "partly-expired")
    assert nvl.status_of({**base, "supersededBy": "nvl-khk-v8.0"}, TODAY) == (False, "superseded")
    assert nvl.status_of({**base, "offered": False}, TODAY) == (False, "withdrawn")


def test_valid_on_its_last_day():
    g = {"offered": True, "supersededBy": None, "validUntilDate": TODAY.isoformat()}
    assert nvl.status_of(g, TODAY) == (True, "active")


# ── reference lists ──────────────────────────────────────────────────────────

REFERENCES = """Text der Leitlinie [1,2].

Literatur
1.

Bundesärztekammer (BÄK). Beurteilungskriterien für Leitlinien. Dtsch Arztebl 1997; 94(33):A-2154-5.

2.

Porst M, Lippe Ev, Leddin J, et al. The Burden of Disease in Germany. Dtsch Arztebl Int 2022; 119(46):785-792. DOI:
10.3238/arztebl.m2022.0314. http://www.ncbi.nlm.nih.gov/pubmed/36350160.

## Seite 163

NVL Chronische KHK
Langfassung – Version 7.0
© NVL-Programm 2024  Seite 163
3. Cosmi B, Rubboli A, et al. Ticlopidine versus oral anticoagulation for coronary stenting. Cochrane Database
Syst Rev 2001(4):CD002133. DOI: 10.1002/14651858.CD002133. http://www.ncbi.nlm.nih.gov/pubmed/11687144.
4. Robert Koch-Institut (RKI). Ergebnisdatensatz. 2022
[cited: 2023-10-02]. https://www.daly.rki.de/map.
12. This number is out of sequence and belongs to the text of entry 4.
"""


def test_references_are_split_by_their_running_number():
    refs = nvl.extract_references(REFERENCES)
    assert [r["number"] for r in refs] == [1, 2, 3, 4]
    assert "out of sequence" in refs[3]["citation"]


def test_reference_fields():
    refs = nvl.extract_references(REFERENCES)
    assert refs[0]["pmid"] is None and refs[0]["year"] == 1997
    assert refs[1] == {
        "number": 2,
        "citation": "Porst M, Lippe Ev, Leddin J, et al. The Burden of Disease in Germany. Dtsch Arztebl Int 2022; "
                    "119(46):785-792. DOI: 10.3238/arztebl.m2022.0314. http://www.ncbi.nlm.nih.gov/pubmed/36350160.",
        "pmid": "36350160", "doi": "10.3238/arztebl.m2022.0314", "year": 2022,
    }
    assert refs[2]["pmid"] == "11687144" and refs[2]["doi"] == "10.1002/14651858.CD002133"


def test_page_furniture_is_not_part_of_a_citation():
    refs = nvl.extract_references(REFERENCES)
    assert "Seite 163" not in refs[1]["citation"]
    assert "NVL Chronische KHK" not in refs[1]["citation"]


def test_no_reference_list_gives_no_references():
    assert nvl.extract_references("Nur Text, keine Liste.") == []


# ── what may be committed ────────────────────────────────────────────────────

MANIFEST = {
    "source": "https://www.leitlinien.de", "generated": "2026-11-19",
    "guidelines": [
        {"id": "nvl-khk-v6.0", "topic": "khk", "title": "NVL Chronische KHK", "version": "6.0", "awmfId": "nvl-004",
         "sourcePage": "https://www.leitlinien.de/themen/khk", "active": False, "status": "superseded",
         "supersededBy": "nvl-khk-v7.0", "references": []},
        {"id": "nvl-khk-v7.0", "topic": "khk", "title": "NVL Chronische KHK", "version": "7.0", "awmfId": "nvl-004",
         "publisher": "ÄZQ", "adoptedDate": "2024-08-15", "validUntilDate": "2029-08-14",
         "earliestValidUntilDate": "2029-08-14", "doi": "10.6101/AZQ/000514",
         "sourcePage": "https://www.leitlinien.de/themen/khk", "active": True, "status": "active",
         "supersededBy": None,
         "references": [
             {"number": 1, "citation": "AWMF-Regelwerk. 2023.", "pmid": None, "doi": None, "year": 2023},
             {"number": 2, "citation": "Porst M. Burden. 2022.", "pmid": "36350160", "doi": "10.3238/x", "year": 2022},
             {"number": 9, "citation": "Porst M. Burden, again. 2022.", "pmid": "36350160", "doi": None, "year": 2022},
         ]},
    ],
}


def test_state_file_carries_counts_and_no_guideline_text():
    state = nvl.state_of(MANIFEST)
    row = state["guidelines"][1]
    assert row["references"] == 3 and row["referencesWithPmid"] == 2
    assert "citation" not in str(state)


# ── loader ───────────────────────────────────────────────────────────────────


def test_a_superseded_version_gets_no_node_of_its_own():
    assert [g["id"] for g in loader.current_guidelines(MANIFEST)] == ["nvl-khk-v7.0"]


def test_study_id_matches_the_health_graph_and_duplicates_collapse():
    rows = loader.citation_rows(MANIFEST["guidelines"][1])
    assert rows == [{"id": "pmid-36350160", "pmid": "36350160", "number": 2,
                     "citation": "Porst M. Burden. 2022.", "year": 2022, "doi": "10.3238/x"}]


def test_guideline_params_count_what_cannot_be_linked():
    params = loader.guideline_params(MANIFEST["guidelines"][1], "2026-11-19")
    assert params["referenceCount"] == 3
    assert params["referencesWithoutPmid"] == 1
    assert params["active"] is True and params["status"] == "active"


def test_cypher_never_deletes():
    for q in (loader.CYPHER_GUIDELINE, loader.CYPHER_CITES, loader.CYPHER_MARK_DROPPED):
        assert "DELETE" not in q.upper()
        assert "CREATE (" not in q.upper()
