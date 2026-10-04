#!/usr/bin/env python3
"""Write ui/src/app/docs/docs-facts.json: what the documentation pages show
that the repository already knows, and the date each page last changed.

The /docs pages carried hand-typed facts (16 pages, 36 API routes, 8 databases,
15 hooks, 1,613 tests, 18 of 51 ADRs) that drifted for months because nothing
compared them with the code. They now read those facts from this file, and
this script derives it from the code:

  apiRoutes        ui/src/app/api/**/route.ts, with the methods each exports
  uiPages          ui/src/app/**/page.tsx
  preCommitHooks   .pre-commit-config.yaml
  composeServices  docker-compose.yml + docker-compose.jad.yml
  postgresDbs      jad/init-postgres.sql + POSTGRES_DB
  adrs             docs/ADRs/ADR-*.md (id, title, status)
  testFiles        Vitest files (UI + proxy) and Playwright spec files
  complianceFloors scripts/compliance-baseline.json
  openapi          ui/public/openapi.yaml (version, paths, operations)
  workflowJobs     the job names of the main CI workflows
  coverageThresholds  ui/vitest.config.ts
  toolVersions     ui/package.json and the pinned CI tools in test.yml
  lastUpdated      per docs page, the date of its last content change

A page's date moves to today when one of its sources is staged, or when a fact
it shows changes. Commits whose subject starts with chore( or style( do not
count when the dates are rebuilt from history (--from-git): a Tailwind upgrade
touches every page and says nothing new.

Usage:
    python3 scripts/gen-docs-facts.py                   # refresh (pre-commit)
    python3 scripts/gen-docs-facts.py --from-git        # rebuild every date
    python3 scripts/gen-docs-facts.py --check [--base origin/main]
        exit 1 when the file is stale, or when a page changed since BASE
        without its date changing too
"""

import argparse
import datetime
import glob
import json
import os
import re
import subprocess
import sys

try:
    import yaml
except ImportError:  # pragma: no cover
    sys.exit("gen-docs-facts: needs PyYAML (pip install pyyaml)")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = "ui/src/app/docs/docs-facts.json"

# Each docs page: the files whose change is a change of the page, and the
# facts it shows. A changed fact moves the page's date like an edited file.
PAGES = {
    "/docs": {"sources": ["ui/src/app/docs/page.tsx"], "facts": []},
    "/docs/user-guide": {
        "sources": ["ui/src/app/docs/user-guide/page.tsx", "ui/src/components/Navigation.tsx"],
        "facts": [],
    },
    "/docs/developer": {
        "sources": ["ui/src/app/docs/developer/page.tsx"],
        "facts": ["apiRoutes", "uiPages", "preCommitHooks", "composeServices", "postgresDbs", "testFiles",
                  "workflowJobs"],
    },
    "/docs/developer/quality-gates": {
        "sources": ["ui/src/app/docs/developer/quality-gates/page.tsx"],
        "facts": ["preCommitHooks", "testFiles", "complianceFloors", "apiRoutes", "workflowJobs",
                  "coverageThresholds", "toolVersions", "openapi"],
    },
    "/docs/developer/api": {
        "sources": ["ui/src/app/docs/developer/api/page.tsx", "ui/public/openapi.yaml"],
        "facts": ["openapi", "apiRoutes"],
    },
    "/docs/developer/reference": {
        "sources": ["ui/src/app/docs/developer/reference/page.tsx", "ui/public/openapi.yaml"],
        "facts": [],
    },
    "/docs/architecture": {
        "sources": ["ui/src/app/docs/architecture/page.tsx"],
        "facts": ["adrs", "apiRoutes", "uiPages", "composeServices", "postgresDbs"],
    },
}

METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def api_routes():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, "ui/src/app/api/**/route.ts"), recursive=True)):
        src = open(f, encoding="utf-8").read()
        methods = [
            m for m in METHODS
            if re.search(rf"export\s+(async\s+)?function\s+{m}\b|export\s+const\s+{m}\b", src)
            or re.search(rf"export\s*\{{[^}}]*\bas\s+{m}\b", src)
        ]
        path = "/api/" + os.path.dirname(rel(f))[len("ui/src/app/api/"):]
        out.append({"path": path.rstrip("/"), "methods": methods})
    return out


def ui_pages():
    pages = []
    for f in glob.glob(os.path.join(ROOT, "ui/src/app/**/page.tsx"), recursive=True):
        d = os.path.dirname(rel(f))[len("ui/src/app"):]
        pages.append(d or "/")
    return sorted(pages)


def pre_commit_hooks():
    cfg = yaml.safe_load(read(".pre-commit-config.yaml"))
    hooks = []
    for repo in cfg.get("repos", []):
        source = "local" if repo.get("repo") == "local" else repo["repo"].rsplit("/", 1)[-1]
        for h in repo.get("hooks", []):
            hooks.append({
                "id": h["id"],
                "name": h.get("name", h["id"]),
                "source": source,
                "stage": ",".join(h.get("stages", ["pre-commit"])),
            })
    return hooks


def compose_services():
    out = {}
    for f in ("docker-compose.yml", "docker-compose.jad.yml"):
        svcs = yaml.safe_load(read(f)).get("services", {})
        out[f] = [
            {"name": n, "profiles": s.get("profiles", []), "ports": [str(p) for p in s.get("ports", [])]}
            for n, s in svcs.items()
        ]
    return out


def postgres_dbs():
    dbs = set(re.findall(r"CREATE DATABASE\s+\"?([A-Za-z0-9_]+)", read("jad/init-postgres.sql"), re.I))
    jad = yaml.safe_load(read("docker-compose.jad.yml")).get("services", {})
    main_db = jad.get("postgres", {}).get("environment", {}).get("POSTGRES_DB")
    if main_db:
        dbs.add(main_db)
    return sorted(dbs)


def adrs():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, "docs/ADRs/ADR-[0-9]*.md"))):
        head = open(f, encoding="utf-8").read(3000)
        title = re.search(r"^#\s*ADR-\d+\s*[:—-]\s*(.+)$", head, re.M)
        status = re.search(r"^\*\*Status:?\*\*:?\s*(.+)$", head, re.M)
        out.append({
            "id": re.match(r"(ADR-\d+)", os.path.basename(f)).group(1),
            "file": os.path.basename(f),
            "title": title.group(1).strip() if title else os.path.basename(f),
            "status": re.split(r"[\s(,;]", status.group(1).strip())[0] if status else "",
        })
    return out


def test_files():
    def count(pattern, prune=()):
        return len([
            f for f in glob.glob(os.path.join(ROOT, pattern), recursive=True)
            if not any(p in f for p in prune)
        ])
    specs = glob.glob(os.path.join(ROOT, "ui/__tests__/e2e/**/*.spec.ts"), recursive=True)
    e2e_tests = sum(
        len(re.findall(r"^\s*test(?:\.(?:only|skip|fixme))?\(", open(f, encoding="utf-8").read(), re.M))
        for f in specs
    )
    return {
        "uiUnitFiles": count("ui/__tests__/**/*.test.ts*", prune=("/e2e/",)),
        "proxyUnitFiles": count("services/neo4j-proxy/**/*.test.ts", prune=("node_modules",)),
        "e2eSpecFiles": len(specs),
        "e2eTests": e2e_tests,
    }


def openapi():
    spec = yaml.safe_load(read("ui/public/openapi.yaml"))
    ops = sum(
        1 for item in (spec.get("paths") or {}).values() for m in item if m.upper() in METHODS
    )
    return {"version": str(spec.get("openapi", "")), "paths": len(spec.get("paths") or {}), "operations": ops}


def coverage_thresholds():
    block = re.search(r"thresholds:\s*\{([^}]*)\}", read("ui/vitest.config.ts"))
    return {k: int(v) for k, v in re.findall(r"(\w+):\s*(\d+)", block.group(1))} if block else {}


def tool_versions():
    pkg = json.loads(read("ui/package.json"))
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    test_yml = read(".github/workflows/test.yml")

    def wf(var):
        m = re.search(rf'{var}="([^"]+)"', test_yml)
        return m.group(1) if m else ""

    return {
        "vitest": deps.get("vitest", "").lstrip("^~"),
        "playwright": deps.get("@playwright/test", "").lstrip("^~"),
        "next": deps.get("next", "").lstrip("^~"),
        "gitleaks": wf("GITLEAKS_VERSION"),
        "trivy": wf("TRIVY_VERSION"),
    }


WORKFLOWS = ("test.yml", "compliance.yml", "security-scan.yml", "pr-gate.yml", "deploy-azure.yml")


def workflow_jobs():
    out = {}
    for wf in WORKFLOWS:
        jobs = yaml.safe_load(read(f".github/workflows/{wf}")).get("jobs", {})
        out[wf] = [j.get("name", jid) if isinstance(j.get("name"), str) and "${{" not in j.get("name") else jid
                   for jid, j in jobs.items()]
    return out


def compliance_floors():
    suites = json.loads(read("scripts/compliance-baseline.json"))["suites"]
    return {k: {"min_passed": v["min_passed"], "max_failed": v["max_failed"]} for k, v in suites.items()}


def collect():
    return {
        "apiRoutes": api_routes(),
        "uiPages": ui_pages(),
        "preCommitHooks": pre_commit_hooks(),
        "composeServices": compose_services(),
        "postgresDbs": postgres_dbs(),
        "adrs": adrs(),
        "testFiles": test_files(),
        "complianceFloors": compliance_floors(),
        "openapi": openapi(),
        "workflowJobs": workflow_jobs(),
        "coverageThresholds": coverage_thresholds(),
        "toolVersions": tool_versions(),
    }


def git(*args):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""


def date_from_git(sources):
    """The newest content commit touching any source, as YYYY-MM-DD."""
    log = git("log", "--format=%ad\t%s", "--date=short", "--", *sources)
    for line in log.splitlines():
        day, _, subject = line.partition("\t")
        if not re.match(r"(chore|style)(\(|:|!)", subject):
            return day
    return ""


def load_existing():
    try:
        return json.loads(read(OUT))
    except (OSError, ValueError):
        return {}


def dump(data):
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-git", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--base", default="")
    args = ap.parse_args()

    facts = collect()
    existing = load_existing()
    old_dates = existing.get("lastUpdated", {})

    if args.check:
        problems = []
        stale = [k for k in facts if existing.get(k) != facts[k]]
        if stale:
            problems.append(f"{OUT} is stale ({', '.join(stale)}): run python3 scripts/gen-docs-facts.py")
        for page in PAGES:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", old_dates.get(page, "")):
                problems.append(f"no last-updated date for {page}")
        if args.base:
            changed = set(git("diff", "--name-only", f"{args.base}...HEAD").splitlines())
            old = git("show", f"{args.base}:{OUT}")
            base_dates = json.loads(old).get("lastUpdated", {}) if old else {}
            for page, spec in PAGES.items():
                if changed & set(spec["sources"]) and base_dates.get(page) == old_dates.get(page):
                    problems.append(
                        f"{page} changed but its last-updated date did not: run python3 scripts/gen-docs-facts.py"
                    )
        for p in problems:
            print(f"gen-docs-facts: {p}", file=sys.stderr)
        return 1 if problems else 0

    today = datetime.date.today().isoformat()
    staged = set(git("diff", "--cached", "--name-only").splitlines())
    dates = {}
    for page, spec in PAGES.items():
        if args.from_git or page not in old_dates:
            dates[page] = date_from_git(spec["sources"]) or today
            continue
        moved = staged & set(spec["sources"]) or any(existing.get(f) != facts[f] for f in spec["facts"])
        dates[page] = today if moved else old_dates[page]

    out = {"_comment": "Generated by scripts/gen-docs-facts.py. Do not edit by hand.", **facts, "lastUpdated": dates}
    if dump(out) != dump(existing):
        with open(os.path.join(ROOT, OUT), "w", encoding="utf-8") as f:
            f.write(dump(out))
        print(f"gen-docs-facts: wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
