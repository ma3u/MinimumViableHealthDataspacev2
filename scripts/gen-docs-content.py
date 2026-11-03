#!/usr/bin/env python3
"""Copy the published documents into the UI so the hub serves them at
/docs/<section>/<slug>: the security and data-protection reports under
/docs/security, the Klarbefund guides under /docs/klarbefund.

The UI image is built from ui/ alone, so a document under docs/ is not in the
build context. This script writes the published copy,
ui/src/content/published-docs.json, from the sources listed in DOCS, with
every relative link rewritten: a link to another published document becomes
its /docs/<section>/<slug> route, anything else becomes the file on GitHub.
Images, Markdown or HTML <img>, are copied next to the UI.

Translations (ADR-071): docs/i18n/<lang>/<the source's path below docs/>,
with a frontmatter naming the English source, the SHA-256 of its bytes at
translation time and the language. Each is written, with the same link and
image handling, to ui/public/published-docs/i18n/<lang>/<section>/<slug>.json
(fetched by the page when that language is picked, never bundled), and listed
in ui/src/content/published-docs-i18n.json as current (the hash matches the
English file now) or stale. An image x.png has its translated variant
x.<lang>.png next to it; a translation uses it when it exists.

    python3 scripts/gen-docs-content.py              # write the copy
    python3 scripts/gen-docs-content.py --check      # exit 1 when it is stale
    python3 scripts/gen-docs-content.py --report-i18n  # missing and stale translations
    python3 scripts/gen-docs-content.py --stamp docs/i18n/de/sbom/README.md
                                                     # (re)write a translation's frontmatter

The pre-commit hook `docs-content` runs the check, so a report edited under
docs/ without this script fails the commit. A stale translation never fails
it: the English edit regenerates the index, which then says "stale".
"""
import argparse
import glob
import hashlib
import json
import os
import posixpath
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # --root overrides it (tests)
OUT = "ui/src/content/published-docs.json"
IMG_DIR = "ui/public/published-docs"  # copies of the images the reports embed
BASE = "__BASE_PATH__"  # the page replaces it with Next's basePath
REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2"

# The languages the picker offers besides English (ui/src/lib/use-language.ts).
LANGS = ["de", "fr", "nl", "es"]
I18N_SRC = "docs/i18n"  # docs/i18n/<lang>/<source path below docs/>
I18N_OUT = "ui/public/published-docs/i18n"  # <lang>/<section>/<slug>.json
I18N_INDEX = "ui/src/content/published-docs-i18n.json"
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.S)

# section, slug, source, one-line summary for the index page. Order is the index order.
DOCS = [
    ("ehds", "regulation-implementation", "docs/ehds/regulation-implementation.md",
     "What the integration hub implements of Regulation (EU) 2025/327, article by article: the status, "
     "the page, route or file that does it, the test that shows it, and the gap with its issue."),
    ("ehds", "article-numbering", "docs/ehds-article-numbering.md",
     "The 2022 proposal's article numbers against the adopted ones, and the dates of Art. 105; read "
     "older material and the Regulation side by side."),
    ("klarbefund", "klarbefund-user-guide", "docs/klarbefund/user-guide.md",
     "The app as a person uses it, screen by screen with screenshots: getting a report in, checking a "
     "value against the paper, trends, consents, connecting to the EHDS, exports and your data rights."),
    ("klarbefund", "klarbefund-developer-guide", "docs/klarbefund/developer-guide.md",
     "Building, running and testing the app: the pipeline from camera to sealed store, the shared "
     "dictionary, the store layout, the dev dataset, the two test suites, diagnostics and TestFlight."),
    ("operations", "operational-guideline", "docs/security/operational-guideline.md",
     "How to host the hub and Klarbefund for real: which EHDS role (Regulation (EU) 2025/327) operates "
     "which part, what BSI C5, IT-Grundschutz, TR-02102 and TR-03161 ask of each part, the clocks for "
     "incidents, retention, and the go-live checklist by role."),
    ("operations", "dashboards", "docs/operations/dashboards.md",
     "The three Grafana dashboards of the live hub, with screenshots: EDC contracts and transfers, the EHDS "
     "audit trail, and the load and stress test; what each row shows, how to read it, and how to sign in."),
    ("operations", "load-tests", "docs/loadtest/README.md",
     "Every load, stress and spike run against the live hub and the compose stack, with the Grafana "
     "dashboard of each, what it found, what changed because of it, and the runs still to do."),
    ("operations", "production-readiness-2026-10", "docs/loadtest/2026-10-production-readiness.md",
     "The Well-Architected and Cloud Adoption assessment as of 2026-10-16: what is in place per pillar, "
     "with the evidence, what is open, the scores, and what stands between the demonstrator and an "
     "operable platform."),
    ("developer", "sdlc", "docs/SDLC.md",
     "How a change reaches the live hub: discussions and issues, branches and pull requests, every "
     "pre-commit and pre-push hook with its fix, the PR Gate and the other workflows, the deploys to "
     "Azure and GitHub Pages, releases, how to contribute from outside, and how to define an SDLC for a "
     "DevSecOps and AI project, with the tools for each stage."),
    ("developer", "api-integration-tests", "docs/developer/api-integration-tests.md",
     "The Bruno collection and the dataspace, identity and domain checks: what each covers, how to "
     "run it, and whether it is up to date, with measured numbers."),
    ("developer", "stack-and-environment", "docs/developer/stack-and-environment.md",
     "A glossary of the stack (EDC-V, JAD, CFM, DSP, DCP, IdentityHub, IssuerService, Vault, the "
     "proxy, the catalogue services) and how it fits together; prerequisites, the two local stacks, "
     "seed phases, ports, environment variables, the iPhone app and the day-one gotchas."),
    ("security", "security-test-report", "docs/security/security-test-report-2026-10-15.md",
     "CodeQL, Semgrep, grype, npm audit, trivy, gitleaks, hadolint, shellcheck, the app's posture "
     "tests and the anonymous black-box checks of the live hub; findings F1 to F10 with their "
     "status after the fixes, and what an independent test would add."),
    ("security", "threat-model-hub", "docs/security/threat-model.md",
     "STRIDE for the hub on Azure: the data flows and trust boundaries, the four attackers, one exchange with "
     "every threat at its step, and each mitigation naming the code, the test or the decision that shows it; "
     "what the demo accepts and what real data needs, and how to verify every row."),
    ("security", "threat-model-klarbefund", "docs/security/threat-model-klarbefund.md",
     "STRIDE analysis of the iPhone app; each mitigation names the code or test that shows it."),
    ("security", "klarbefund-self-assessment", "docs/klarbefund/self-assessment.md",
     "Data protection (GDPR), BSI TR-03161 objective by objective, the EU AI Act label and the "
     "MDR status of the app, each line pointing to the code or test that shows it."),
    ("security", "klarbefund-evidence", "docs/klarbefund/evidence.md",
     "The accuracy benchmark, the dictionary parity check, the run record, and what is still missing."),
    ("security", "report-for-health-insurers", "docs/klarbefund/report-for-health-insurers.md",
     "The three questions an insurer asks, is the extraction right, is the data safe, is it a "
     "medical device, answered with the evidence, plus the white-label and consulting offer."),
    ("security", "klarbefund-run-on-mac", "docs/klarbefund/run-on-mac.md",
     "How to reproduce every number in the evidence on a Mac with Xcode."),
    ("security", "bsi-c5-gap-analysis", "docs/security/bsi-c5-gap-analysis.md",
     "The hub against the BSI C5:2020 criteria catalogue, for EHDS Art. 50(6)."),
    ("security", "sbom", "docs/sbom/README.md",
     "One CycloneDX bill of materials per deployable part, byte-stable; the --check fails when a bill no longer matches its lockfile."),
]

# Files the hand-written docs pages embed or link to, copied like the images
# of a published document (globs relative to the repository): the diagrams of
# the architecture page, and the one-page report for health insurers.
PAGE_ASSETS = ["docs/architecture/img/*.svg", "docs/klarbefund/*.html"]

BY_SOURCE = {src: (section, slug) for section, slug, src, _ in DOCS}
LINK = re.compile(r"(?<!!)\]\(([^)\s]+)\)")
IMAGE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)")
HTML_IMG = re.compile(r'(<img\b[^>]*?\bsrc=")([^"]+)(")')


def rewrite_link(target, source_dir):
    if re.match(r"^(https?:|mailto:|#)", target) or target.startswith(BASE):
        return target
    path, _, anchor = target.partition("#")
    resolved = posixpath.normpath(posixpath.join(source_dir, path))
    if resolved in BY_SOURCE:
        section, slug = BY_SOURCE[resolved]
        return f"/docs/{section}/{slug}" + (f"#{anchor}" if anchor else "")
    kind = "tree" if os.path.isdir(os.path.join(ROOT, resolved)) else "blob"
    return f"{REPO}/{kind}/main/{resolved}" + (f"#{anchor}" if anchor else "")


def rewrite_image(target, source_dir, images, lang=None):
    """A relative image is copied next to the UI (the hub's CSP allows images
    from itself only) and referenced through the base-path placeholder. In a
    translation, x.png becomes x.<lang>.png when that file exists."""
    if re.match(r"^(https?:|data:)", target):
        return target
    resolved = posixpath.normpath(posixpath.join(source_dir, target))
    if lang:
        stem, ext = posixpath.splitext(resolved)
        localized = f"{stem}.{lang}{ext}"
        if os.path.isfile(os.path.join(ROOT, localized)):
            resolved = localized
    name = posixpath.basename(resolved)
    images[name] = resolved
    return f"{BASE}/published-docs/{name}"


def render(text, source_dir, images, lang=None):
    """The Markdown with its images copied and its links rewritten. A
    translation keeps the English file's relative paths, so they resolve
    against the English source's folder."""
    body = IMAGE.sub(lambda m: "![" + m.group(1) + "](" + rewrite_image(m.group(2), source_dir, images, lang) + ")", text)
    body = HTML_IMG.sub(lambda m: m.group(1) + rewrite_image(m.group(2), source_dir, images, lang) + m.group(3), body)
    return LINK.sub(lambda m: "](" + rewrite_link(m.group(1), source_dir) + ")", body)


def title_of(text, fallback):
    title = re.search(r"^#\s+(.+?)\s*$", text, re.M)
    return title.group(1) if title else fallback


def build():
    docs = []
    images = {}
    for section, slug, src, summary in DOCS:
        with open(os.path.join(ROOT, src), encoding="utf-8") as f:
            text = f.read()
        body = render(text, posixpath.dirname(src), images)
        docs.append({
            "section": section,
            "slug": slug,
            "title": title_of(text, slug),
            "summary": summary,
            "source": src,
            "markdown": body,
        })
    for pattern in PAGE_ASSETS:
        for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            name = posixpath.basename(rel)
            if name == "report-for-health-insurers.html":
                name = "klarbefund-insurer-report.html"
            images[name] = rel
    return {
        "_comment": "Generated by scripts/gen-docs-content.py from the files named in `source`. Do not edit by hand.",
        "docs": docs,
    }, images


def sync_images(images, check):
    """Copy each embedded image to IMG_DIR; in check mode report a copy that
    is missing or differs. Returns the list of problems."""
    problems = []
    for name, src in images.items():
        with open(os.path.join(ROOT, src), "rb") as f:
            want = f.read()
        dst = os.path.join(ROOT, IMG_DIR, name)
        try:
            with open(dst, "rb") as f:
                have = f.read()
        except OSError:
            have = None
        if have == want:
            continue
        if check:
            problems.append(f"{IMG_DIR}/{name} does not match {src}")
        else:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "wb") as f:
                f.write(want)
            print(f"gen-docs-content: copied {src} -> {IMG_DIR}/{name}")
    return problems


def dump(data):
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def sha256_of(rel):
    with open(os.path.join(ROOT, rel), "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def parse_frontmatter(text):
    """The `key: value` lines between the leading --- fences, and the body
    after them. Values may be quoted; nothing else of YAML is needed."""
    m = FRONTMATTER.match(text)
    if not m:
        return None, text
    meta = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, sep, value = line.partition(":")
        if not sep:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        meta[key.strip()] = value
    return meta, text[m.end():]


def translation_path(lang, source):
    """docs/ehds/x.md in German is docs/i18n/de/ehds/x.md."""
    return f"{I18N_SRC}/{lang}/{source[len('docs/'):]}"


def find_translations():
    """Every translation under docs/i18n, checked against its frontmatter.
    Returns (translations, errors); a translation is a dict with lang,
    section, slug, source, path, meta and body."""
    found, errors = [], []
    base = os.path.join(ROOT, I18N_SRC)
    for path in sorted(glob.glob(os.path.join(base, "**", "*.md"), recursive=True)):
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        lang = rel[len(I18N_SRC) + 1:].split("/", 1)[0]
        with open(path, encoding="utf-8") as f:
            meta, body = parse_frontmatter(f.read())
        if lang not in LANGS:
            errors.append(f"{rel}: {lang} is not one of {', '.join(LANGS)}")
            continue
        if meta is None:
            errors.append(f"{rel}: no frontmatter (source, sourceHash, language): run --stamp {rel}")
            continue
        source = meta.get("source", "")
        if source not in BY_SOURCE:
            errors.append(f"{rel}: source {source or '(none)'} is not a published document (DOCS)")
            continue
        if rel != translation_path(lang, source):
            errors.append(f"{rel}: a translation of {source} belongs at {translation_path(lang, source)}")
            continue
        if meta.get("language") != lang:
            errors.append(f"{rel}: language is {meta.get('language') or '(none)'}, the folder says {lang}")
            continue
        if not re.fullmatch(r"[0-9a-f]{64}", meta.get("sourceHash", "")):
            errors.append(f"{rel}: sourceHash is not a SHA-256 hex digest: run --stamp {rel}")
            continue
        section, slug = BY_SOURCE[source]
        found.append({"lang": lang, "section": section, "slug": slug, "source": source,
                      "path": rel, "meta": meta, "body": body})
    return found, errors


def broken_targets(text, source_dir):
    """The relative links and images of a translation that point at nothing
    from the English source's folder. The Markdown link checker skips
    docs/i18n, where these paths do not resolve, so this is its check."""
    targets = [m.group(1) for m in LINK.finditer(text)]
    targets += [m.group(2) for m in IMAGE.finditer(text)]
    targets += [m.group(2) for m in HTML_IMG.finditer(text)]
    broken = []
    for target in targets:
        if re.match(r"^(https?:|mailto:|data:|#)", target) or target.startswith(BASE):
            continue
        path = target.partition("#")[0]
        if not os.path.exists(os.path.join(ROOT, posixpath.normpath(posixpath.join(source_dir, path)))):
            broken.append(target)
    return broken


def build_i18n(images):
    """The per-language JSON files (path -> text) and the index. A
    translation is current while its sourceHash is the English file's hash."""
    translations, errors = find_translations()
    files = {}
    index = {}
    order = {(section, slug): i for i, (section, slug, _, _) in enumerate(DOCS)}
    for t in translations:
        for target in broken_targets(t["body"], posixpath.dirname(t["source"])):
            errors.append(f"{t['path']}: {target} does not exist next to {t['source']}; "
                          "keep relative paths as in the English file")
    for t in sorted(translations, key=lambda t: (order[(t["section"], t["slug"])], LANGS.index(t["lang"]))):
        body = render(t["body"].lstrip("\n"), posixpath.dirname(t["source"]), images, t["lang"])
        title = title_of(t["body"], t["slug"])
        files[f"{I18N_OUT}/{t['lang']}/{t['section']}/{t['slug']}.json"] = dump({
            "_comment": f"Generated by scripts/gen-docs-content.py from {t['path']}. Do not edit by hand.",
            "section": t["section"],
            "slug": t["slug"],
            "language": t["lang"],
            "title": title,
            "source": t["source"],
            "translation": t["path"],
            "sourceHash": t["meta"]["sourceHash"],
            "markdown": body,
        })
        entry = {
            "status": "current" if t["meta"]["sourceHash"] == sha256_of(t["source"]) else "stale",
            "title": title,
        }
        if t["meta"].get("summary"):
            entry["summary"] = t["meta"]["summary"]
        index.setdefault(f"{t['section']}/{t['slug']}", {})[t["lang"]] = entry
    data = {
        "_comment": "Generated by scripts/gen-docs-content.py from docs/i18n (ADR-071). Per document, "
                    "the languages it is translated into; current means the translation's sourceHash "
                    "is the English file's hash now. Do not edit by hand.",
        "languages": LANGS,
        "docs": index,
    }
    return files, data, translations, errors


def report_i18n(translations):
    """Per language, the published documents with no translation and those
    whose English original changed after it was translated."""
    have = {(t["lang"], t["source"]): t for t in translations}
    for lang in LANGS:
        missing, stale = [], []
        for _, _, src, _ in DOCS:
            t = have.get((lang, src))
            if not t:
                missing.append(src)
            elif t["meta"]["sourceHash"] != sha256_of(src):
                stale.append(src)
        print(f"{lang}: {len(DOCS) - len(missing)}/{len(DOCS)} translated, {len(stale)} stale, {len(missing)} missing")
        for src in stale:
            print(f"  stale    {translation_path(lang, src)} (English {src} changed)")
        for src in missing:
            print(f"  missing  {translation_path(lang, src)}")


def stamp(paths):
    """Write or refresh the frontmatter of translations: source and language
    from the path, sourceHash from the English file now. Run it when a
    translation is (re)done against the current English."""
    by_rel = {translation_path(lang, src): (lang, src) for lang in LANGS for src in BY_SOURCE}
    status = 0
    for p in paths:
        full = p if os.path.isabs(p) else os.path.join(ROOT, p)
        rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
        if rel not in by_rel or not os.path.isfile(full):
            print(f"gen-docs-content: {rel} is not docs/i18n/<lang>/<a published document's path below docs/>",
                  file=sys.stderr)
            status = 1
            continue
        lang, src = by_rel[rel]
        with open(full, encoding="utf-8") as f:
            meta, body = parse_frontmatter(f.read())
        extra = "".join(f"{k}: {v}\n" for k, v in (meta or {}).items()
                        if k not in ("source", "sourceHash", "language"))
        head = f"---\nsource: {src}\nsourceHash: {sha256_of(src)}\nlanguage: {lang}\n{extra}---\n\n"
        with open(full, "w", encoding="utf-8") as f:
            f.write(head + body.lstrip("\n"))
        print(f"gen-docs-content: stamped {rel} against {src}")
    return status


def read(rel):
    try:
        with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def main():
    global ROOT
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--report-i18n", action="store_true",
                    help="list missing and stale translations per language; writes nothing")
    ap.add_argument("--stamp", nargs="+", metavar="TRANSLATION",
                    help="write the frontmatter of these translations against the English now")
    ap.add_argument("--root", help=argparse.SUPPRESS)  # a copy of the repository, for the tests
    args = ap.parse_args()
    if args.root:
        ROOT = os.path.abspath(args.root)
    if args.stamp:
        return stamp(args.stamp)
    data, images = build()
    files, index, translations, errors = build_i18n(images)
    if args.report_i18n:
        report_i18n(translations)
        for e in errors:
            print(f"  error    {e}")
        return 0
    if errors:
        for e in errors:
            print(f"gen-docs-content: {e}", file=sys.stderr)
        return 1
    files[OUT] = dump(data)
    files[I18N_INDEX] = dump(index)
    problems = sync_images(images, args.check)
    for p in problems:
        print(f"gen-docs-content: {p}: run python3 scripts/gen-docs-content.py", file=sys.stderr)
    stale = [rel for rel, want in files.items() if read(rel) != want]
    wanted = set(files)
    extra = sorted(
        rel for rel in (
            os.path.relpath(p, ROOT).replace(os.sep, "/")
            for p in glob.glob(os.path.join(ROOT, I18N_OUT, "**", "*.json"), recursive=True)
        ) if rel not in wanted
    )
    if args.check:
        for rel in stale:
            print(f"gen-docs-content: {rel} is stale: run python3 scripts/gen-docs-content.py", file=sys.stderr)
        for rel in extra:
            print(f"gen-docs-content: {rel} has no translation behind it: run python3 scripts/gen-docs-content.py",
                  file=sys.stderr)
        return 1 if problems or stale or extra else 0
    for rel in stale:
        out = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            f.write(files[rel])
        print(f"gen-docs-content: wrote {rel}")
    for rel in extra:
        os.remove(os.path.join(ROOT, rel))
        print(f"gen-docs-content: removed {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
