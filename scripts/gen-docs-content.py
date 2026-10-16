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

    python3 scripts/gen-docs-content.py          # write the copy
    python3 scripts/gen-docs-content.py --check  # exit 1 when it is stale

The pre-commit hook `docs-content` runs the check, so a report edited under
docs/ without this script fails the commit.
"""
import argparse
import glob
import json
import os
import posixpath
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = "ui/src/content/published-docs.json"
IMG_DIR = "ui/public/published-docs"  # copies of the images the reports embed
BASE = "__BASE_PATH__"  # the page replaces it with Next's basePath
REPO = "https://github.com/ma3u/MinimumViableHealthDataspacev2"

# section, slug, source, one-line summary for the index page. Order is the index order.
DOCS = [
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


def rewrite_image(target, source_dir, images):
    """A relative image is copied next to the UI (the hub's CSP allows images
    from itself only) and referenced through the base-path placeholder."""
    if re.match(r"^(https?:|data:)", target):
        return target
    resolved = posixpath.normpath(posixpath.join(source_dir, target))
    name = posixpath.basename(resolved)
    images[name] = resolved
    return f"{BASE}/published-docs/{name}"


def build():
    docs = []
    images = {}
    for section, slug, src, summary in DOCS:
        with open(os.path.join(ROOT, src), encoding="utf-8") as f:
            text = f.read()
        title = re.search(r"^#\s+(.+?)\s*$", text, re.M)
        source_dir = posixpath.dirname(src)
        body = IMAGE.sub(lambda m: "![" + m.group(1) + "](" + rewrite_image(m.group(2), source_dir, images) + ")", text)
        body = HTML_IMG.sub(lambda m: m.group(1) + rewrite_image(m.group(2), source_dir, images) + m.group(3), body)
        body = LINK.sub(lambda m: "](" + rewrite_link(m.group(1), source_dir) + ")", body)
        docs.append({
            "section": section,
            "slug": slug,
            "title": title.group(1) if title else slug,
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    data, images = build()
    want = dump(data)
    problems = sync_images(images, args.check)
    for p in problems:
        print(f"gen-docs-content: {p}: run python3 scripts/gen-docs-content.py", file=sys.stderr)
    out = os.path.join(ROOT, OUT)
    try:
        with open(out, encoding="utf-8") as f:
            have = f.read()
    except OSError:
        have = ""
    if want == have:
        return 1 if problems else 0
    if args.check:
        print(f"gen-docs-content: {OUT} is stale: run python3 scripts/gen-docs-content.py", file=sys.stderr)
        return 1
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(want)
    print(f"gen-docs-content: wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
