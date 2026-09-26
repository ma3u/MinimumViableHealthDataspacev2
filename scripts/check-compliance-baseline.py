#!/usr/bin/env python3
"""Fail the Protocol Compliance workflow when a suite regresses.

Phase 0 of #338 (discussion #110). Every suite step in compliance.yml carries
`continue-on-error: true`, so a green run has only ever meant the workflow
finished. This is the step that can say no.

It is a baseline gate, not a 100% gate. The suites do not pass today: gating
on green would block every merge until an unbounded remediation project
finishes, and gating on nothing is where we came in. So each suite records
what it scored, and the build fails when it scores worse.

  passed < min_passed   -> a check that used to pass no longer does
  failed > max_failed   -> a new failure

A suite with no recorded baseline is BOOTSTRAPPED: reported loudly, not
failed, with the line to paste into the baseline. That is deliberate. Writing
guessed numbers into the baseline would either block main on a wrong floor or
enshrine a bad run as "correct", and both are worse than one advisory run.

`review_by` is the answer to the objection in discussion #110 that "a ratchet
nobody raises is just a slower way of not fixing it". Past that date the check
fails until someone either tightens the numbers or moves the date on purpose.

Usage:
    python3 scripts/check-compliance-baseline.py --results test-results
    python3 scripts/check-compliance-baseline.py --results test-results --update
"""

import argparse
import datetime as dt
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "compliance-baseline.json")

# artifact directory -> human name
SUITES = {
    "dsp-tck-results": "EHDS dataspace checks",
    "dcp-compliance-results": "EHDS identity checks",
    "ehds-compliance-results": "EHDS domain checks",
}


def latest_report(results_dir, artifact):
    files = sorted(
        glob.glob(os.path.join(results_dir, artifact, "*.json")),
        key=os.path.getmtime,
        reverse=True,
    )
    if not files:
        # The workflow also writes straight into test-results/<suite>/ locally.
        files = sorted(
            glob.glob(os.path.join(results_dir, "**", "*.json"), recursive=True),
            key=os.path.getmtime,
            reverse=True,
        )
        files = [f for f in files if artifact.split("-")[0] in f]
    if not files:
        return None
    try:
        with open(files[0], encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"  could not read {files[0]}: {exc}")
        return None


def load_baseline():
    if not os.path.exists(BASELINE):
        return {"review_by": None, "suites": {}}
    with open(BASELINE, encoding="utf-8") as fh:
        return json.load(fh)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", default="test-results")
    ap.add_argument("--update", action="store_true")
    args = ap.parse_args()

    baseline = load_baseline()
    recorded = baseline.get("suites", {})
    failed = False
    bootstrapped = {}

    print("Compliance baseline\n")

    for artifact, name in SUITES.items():
        report = latest_report(args.results, artifact)
        if report is None:
            print(f"{name}: no report produced")
            # A suite that did not run cannot regress, but it also cannot
            # reassure. Say so; do not fail, because the target may be azure.
            continue

        summary = report.get("summary", {})
        passed = int(summary.get("passed", 0))
        fails = int(summary.get("failed", 0))
        skipped = int(summary.get("skipped", 0))
        base = recorded.get(artifact)

        if base is None:
            bootstrapped[artifact] = {
                "min_passed": passed,
                "max_failed": fails,
                "note": f"recorded from an actual run on {dt.date.today()}",
            }
            print(
                f"{name}: {passed} passed, {fails} failed, {skipped} skipped"
                "   NO BASELINE, recorded below"
            )
            continue

        ok = passed >= base["min_passed"] and fails <= base["max_failed"]
        mark = "ok" if ok else "REGRESSION"
        print(
            f"{name}: {passed} passed, {fails} failed, {skipped} skipped"
            f"   (floor {base['min_passed']} passed / {base['max_failed']} failed)   {mark}"
        )
        if not ok:
            failed = True
            if passed < base["min_passed"]:
                print(
                    f"    passed fell from {base['min_passed']} to {passed}:"
                    " a check that used to pass no longer does"
                )
            if fails > base["max_failed"]:
                print(
                    f"    failed rose from {base['max_failed']} to {fails}:"
                    " something that used to hold no longer does"
                )

    if args.update or bootstrapped:
        recorded.update(bootstrapped)
        if args.update:
            baseline["suites"] = recorded
            with open(BASELINE, "w", encoding="utf-8") as fh:
                json.dump(baseline, fh, indent=2)
                fh.write("\n")
            print(f"\nbaseline written to {os.path.relpath(BASELINE, ROOT)}")
        else:
            print("\nAdd these to scripts/compliance-baseline.json under \"suites\":")
            print(json.dumps(bootstrapped, indent=2))

    review_by = baseline.get("review_by")
    if review_by:
        try:
            due = dt.date.fromisoformat(review_by)
        except ValueError:
            print(f"\nreview_by is not a date: {review_by!r}")
            failed = True
        else:
            if dt.date.today() > due:
                failed = True
                print(
                    f"\nFAIL: the baseline was due for review on {due}."
                    "\n      Tighten the numbers to what the suites now score, or move"
                    "\n      review_by on purpose. A ratchet nobody raises is just a"
                    "\n      slower way of not fixing it."
                )

    print("\nREGRESSION" if failed else "\nno regression against the recorded baseline")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
