"""Unit tests for study_status.py. PubMed is replaced by a function; nothing is sent."""
import json

import pytest

import study_status as ss

RETRACTED = {"uid": "32450107", "title": "RETRACTED: Hydroxychloroquine", "source": "Lancet", "pubdate": "2020 May 22",
             "pubtype": ["Journal Article", "Retracted Publication"],
             "references": [{"reftype": "Erratum in", "pmid": 32485145},
                            {"reftype": "Expression of concern in", "pmid": 32504543},
                            {"reftype": "Retraction in", "pmid": 32511943},
                            {"reftype": "Comment in", "pmid": 32607690}]}
TRIAL = {"uid": "36876740", "title": "Bempedoic Acid", "source": "N Engl J Med", "pubdate": "2023 Apr 13",
         "pubtype": ["Randomized Controlled Trial", "Journal Article"],
         "references": [{"reftype": "Comment in", "pmid": 36944785}]}
REPUBLISHED = {"uid": "29897866", "title": "Primary Prevention", "source": "N Engl J Med", "pubdate": "2018 Jun 21",
               "pubtype": ["Journal Article", "Corrected and Republished Article"], "references": []}
ERRATUM = {"uid": "34458905", "title": "2021 ESC Guidelines", "source": "Eur Heart J", "pubdate": "2021 Sep 7",
           "pubtype": ["Journal Article", "Practice Guideline"], "references": [{"reftype": "Erratum in", "pmid": 36083202}]}


def answer(*records):
    return {"result": {"uids": [r["uid"] for r in records], **{r["uid"]: r for r in records}}}


def pubmed(*records, calls=None):
    def ask(url, data=None):
        if calls is not None:
            calls.append((url, data))
        wanted = data.decode().split("id=")[1].split(",")
        return json.dumps(answer(*[r for r in records if r["uid"] in wanted]))
    return ask


def test_type_is_the_strongest_design_named():
    assert ss.study_type(["Journal Article", "Randomized Controlled Trial", "Multicenter Study"]) == "randomised trial"
    assert ss.study_type(["Meta-Analysis", "Systematic Review", "Review"]) == "meta-analysis"
    assert ss.study_type(["Practice Guideline", "Review"]) == "guideline"
    assert ss.study_type(["Journal Article", "Comparative Study"]) == "journal article"
    assert ss.study_type([]) == "journal article"


def test_flags_most_serious_first_and_comments_ignored():
    rec = ss.parse_summary(answer(RETRACTED))["32450107"]
    assert rec["flags"] == ["retracted", "expression of concern", "erratum"]
    assert {n["type"] for n in rec["notices"]} == {"Erratum in", "Expression of concern in", "Retraction in"}
    assert ss.parse_summary(answer(TRIAL))["36876740"]["flags"] == []
    assert ss.parse_summary(answer(REPUBLISHED))["29897866"]["flags"] == ["corrected and republished"]


def test_year_and_type_from_the_record():
    rec = ss.parse_summary(answer(TRIAL))["36876740"]
    assert (rec["year"], rec["type"], rec["journal"]) == (2023, "randomised trial", "N Engl J Med")


def test_a_run_without_the_positive_control_fails():
    with pytest.raises(RuntimeError, match="positive control failed"):
        ss.fetch(["36876740"], ask=pubmed(TRIAL), pause=0)


def test_a_control_that_is_not_retracted_fails():
    clean = {**RETRACTED, "pubtype": ["Journal Article"], "references": []}
    with pytest.raises(RuntimeError, match="positive control failed"):
        ss.fetch(["36876740"], ask=pubmed(TRIAL, clean), pause=0)


def test_the_control_is_asked_but_not_reported_as_a_cited_study():
    calls = []
    found = ss.fetch(["36876740"], ask=pubmed(TRIAL, RETRACTED, calls=calls), pause=0)
    assert set(found) == {"36876740"}
    assert ss.POSITIVE_CONTROL in calls[0][1].decode()


MANIFEST = {"generated": "2026-11-19", "guidelines": [
    {"id": "a-v1", "awmfId": "nvl-004", "supersededBy": None, "references": [
        {"pmid": "36876740"}, {"pmid": "29897866"}, {"pmid": "34458905"}, {"pmid": None}, {"pmid": "99999999"}]},
    {"id": "b-v1", "awmfId": "053-024", "supersededBy": None, "references": [{"pmid": "29897866"}]},
    {"id": "a-v0", "awmfId": "nvl-004", "supersededBy": "a-v1", "references": [{"pmid": "11111111"}]},
]}


def test_flags_file_lists_flagged_studies_with_who_cites_them():
    status = ss.fetch(sorted(ss.cited_by(MANIFEST)), ask=pubmed(TRIAL, REPUBLISHED, ERRATUM, RETRACTED), pause=0)
    flags = ss.build_flags(MANIFEST, status)
    assert flags["studies"] == 4
    assert [(f["pmid"], f["flags"], f["citedBy"]) for f in flags["flagged"]] == [
        ("29897866", ["corrected and republished"], ["053-024", "nvl-004"]),
        ("34458905", ["erratum"], ["nvl-004"]),
    ]
    assert flags["countsByFlag"] == {"retracted": 0, "expression of concern": 0,
                                     "corrected and republished": 1, "erratum": 1}


def test_a_study_pubmed_does_not_return_is_not_found_never_clean():
    status = ss.fetch(sorted(ss.cited_by(MANIFEST)), ask=pubmed(TRIAL, REPUBLISHED, ERRATUM, RETRACTED), pause=0)
    flags = ss.build_flags(MANIFEST, status)
    assert flags["notFound"] == ["99999999"]
    assert flags["typesByGuideline"]["nvl-004"] == {
        "guideline": 1, "journal article": 1, "not found": 1, "randomised trial": 1}


def test_superseded_versions_are_not_asked():
    assert "11111111" not in ss.cited_by(MANIFEST)


def test_only_ids_leave():
    calls = []
    ss.fetch(["36876740"], ask=pubmed(TRIAL, RETRACTED, calls=calls), pause=0)
    sent = calls[0][1].decode()
    assert sent.startswith("db=pubmed&retmode=json&tool=") and "email" not in sent
