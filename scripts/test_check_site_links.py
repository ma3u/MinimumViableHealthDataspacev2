"""Tests for scripts/check-site-links.py: a broken link fails, a good one passes.

    python3 -m unittest scripts/test_check_site_links.py -v
"""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "check-site-links.py"
BASE = "/MinimumViableHealthDataspacev2"


def run(files: dict[str, str]) -> subprocess.CompletedProcess:
    with tempfile.TemporaryDirectory() as d:
        out = Path(d)
        for name, body in files.items():
            (out / name).parent.mkdir(parents=True, exist_ok=True)
            (out / name).write_text(body)
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(out), "--base", BASE],
            capture_output=True,
            text=True,
        )


class SiteLinks(unittest.TestCase):
    def test_links_under_the_base_path_pass(self):
        r = run({
            "index.html": f'<a href="{BASE}/docs/x#part">x</a><img src="{BASE}/logo.svg">',
            "docs/x.html": '<h2 id="part">Part</h2>',
            "logo.svg": "<svg/>",
        })
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_a_link_without_the_base_path_fails(self):
        # What every link between published docs looked like before #1277.
        r = run({"index.html": '<a href="/docs/ehds/x">x</a>', "docs/ehds/x.html": ""})
        self.assertEqual(r.returncode, 1)
        self.assertIn("lacks the base path", r.stdout)

    def test_a_missing_page_fails(self):
        r = run({"index.html": f'<a href="{BASE}/docs/gone">gone</a>'})
        self.assertEqual(r.returncode, 1)
        self.assertIn("is not in the export", r.stdout)

    def test_a_missing_anchor_fails(self):
        r = run({
            "index.html": f'<a href="{BASE}/docs/x#nope">x</a><a href="#here">h</a>',
            "docs/x.html": '<h2 id="part">Part</h2>',
        })
        self.assertEqual(r.returncode, 1)
        self.assertIn("has no anchor #nope", r.stdout)
        self.assertIn("anchor #here is not on the page", r.stdout)

    def test_relative_links_resolve_against_the_page(self):
        r = run({
            "talks/a/index.html": '<link href="../../favicon.svg"><img src="img/me.jpg">',
            "favicon.svg": "<svg/>",
            "talks/a/img/me.jpg": "x",
        })
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_scripts_external_and_slide_routes_are_skipped(self):
        r = run({
            "index.html": (
                '<a href="https://example.org/x">e</a><a href="mailto:a@b.c">m</a>'
                f'<a href="{BASE}/talk.html#/2">slide</a>'
                '<script>self.__next_f.push(["/docs/not-a-link"])</script>'
                '<script type="x">["<a href=\\"/docs/also-not\\">"]</script >'
            ),
            "talk.html": "",
        })
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
