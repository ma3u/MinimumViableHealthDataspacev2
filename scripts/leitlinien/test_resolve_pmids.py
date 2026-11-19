"""Unit tests for resolve_pmids.py. PubMed is replaced by a function; nothing is sent."""
import json

import resolve_pmids as rp


def test_locator_from_both_citation_styles():
    assert rp.parse_locator("Privett N, Guerrier S. Estimation of the Time Needed. Am J Public Health. Januar 2021;111(1):145–9.") == {
        "journal": "Am J Public Health", "year": "2021", "volume": "111", "page": "145", "author": "Privett"}
    assert rp.parse_locator("Fraser SDS, Roderick PJ. Where now for proteinuria testing? Br J Gen Pract 2016; 66(645):215–7.") == {
        "journal": "Br J Gen Pract", "year": "2016", "volume": "66", "page": "215", "author": "Fraser"}


def test_a_book_or_a_web_page_has_no_locator():
    assert rp.parse_locator("Gemeinsamer Bundesausschuss. Richtlinie; 2022 [Stand: 28.03.2023]. Verfügbar unter: https://example.org.") is None
    assert rp.parse_locator("Siegrist J, Broer M. PLC. Profil der Lebensqualität. Göttingen: Beltz; 1995.") is None


def test_only_a_plain_number_is_a_match():
    answer = "Am J Public Health|2021|111|145|Privett|k1|33211588\nX|2020|1|1|A|k2|NOT_FOUND\nY|2019|2|3|B|k3|AMBIGUOUS (2 citations)\n"
    assert rp.parse_ecitmatch(answer) == {"k1": "33211588"}


def manifest():
    return {"guidelines": [{"id": "g", "references": [
        {"number": 1, "citation": "Has Id. J 2020;1:1.", "pmid": "111", "doi": None},
        {"number": 2, "citation": "Mancia G. ESH Guidelines. J Hypertens 2023; 41(12):1874–2071.", "pmid": None,
         "doi": "10.1097/HJH.0000000000003480"},
        {"number": 3, "citation": "Privett N. Time Needed. Am J Public Health. Januar 2021;111(1):145–9.", "pmid": None, "doi": None},
        {"number": 4, "citation": "Two Hits. Some J 2019;5:10.", "pmid": None, "doi": "10.1/ambiguous"},
        {"number": 5, "citation": "Bundesausschuss. Richtlinie; 2022. Verfügbar unter: https://example.org.", "pmid": None, "doi": None},
    ]}]}


def fake_pubmed(calls):
    def ask(url, data=None):
        calls.append((url, data))
        if "esearch" in url:
            ids = ["38000001"] if "HJH" in url else ["1", "2"]
            return json.dumps({"esearchresult": {"idlist": ids}})
        lines = data.decode().split("bdata=")[1]
        import urllib.parse
        out = []
        for line in urllib.parse.unquote_plus(lines).split("\r"):
            key = line.split("|")[5]
            out.append(line + ("33211588" if "Privett" in line else "NOT_FOUND"))
        return "\n".join(out)
    return ask


def test_resolve_takes_one_hit_and_leaves_the_rest():
    m, cache, calls = manifest(), {}, []
    rp.resolve(m, cache, ask=fake_pubmed(calls), pause=0)
    refs = m["guidelines"][0]["references"]
    assert refs[0]["pmid"] == "111" and "pmidSource" not in refs[0]
    assert (refs[1]["pmid"], refs[1]["pmidSource"]) == ("38000001", "doi")
    assert (refs[2]["pmid"], refs[2]["pmidSource"]) == ("33211588", "citation match")
    assert refs[3]["pmid"] is None      # two records for one DOI, and no match by citation
    assert refs[4]["pmid"] is None      # not a journal citation: never asked
    assert sum("ecitmatch" in u for u, _ in calls) == 1


def test_second_run_asks_nothing():
    m, cache, calls = manifest(), {}, []
    rp.resolve(m, cache, ask=fake_pubmed(calls), pause=0)
    m2, calls2 = manifest(), []
    rp.resolve(m2, cache, ask=fake_pubmed(calls2), pause=0)
    assert calls2 == []
    assert m2["guidelines"][0]["references"][2]["pmid"] == "33211588"


def test_only_bibliographic_data_leaves():
    m, calls = manifest(), []
    rp.resolve(m, {}, ask=fake_pubmed(calls), pause=0)
    sent = " ".join(u + (d.decode() if d else "") for u, d in calls)
    assert "eutils.ncbi.nlm.nih.gov" in sent and "email" not in sent
