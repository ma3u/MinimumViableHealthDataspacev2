#!/usr/bin/env python3
"""Fail when a compose image cannot run on the platform that will run it.

Issue #380. The CI stack brought `tenant-manager` up from an image with a
single `linux/arm64` manifest. Docker said so and started it anyway:

    The requested image's platform (linux/arm64) does not match the detected
    host platform (linux/amd64/v4) and no specific platform was requested
    Container health-dataspace-tenant-manager  Started

"Started" is not "running". The container never served, every call to it
failed with `TypeError: fetch failed` after five seconds, and the suite stayed
green because `/api/admin/tenants` backfills from Neo4j when CFM is
unreachable. CFM has therefore never run in continuous integration, and
nothing said so for as long as that has been true.

This asks each registry what platforms an image actually has, before anything
tries to run it. No Docker daemon, no pull: the manifest and, for a
single-platform image, its config blob are a few kilobytes over HTTPS.

    scripts/check-image-platforms.py                    # every compose file
    scripts/check-image-platforms.py --platform linux/arm64
    scripts/check-image-platforms.py docker-compose.jad.yml --json

Exit 0 when every image offers the required platform, 1 when one does not, and
2 when a registry could not be asked (unknown is not the same as absent, and
an unreachable registry must not read as a pass).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Both the OCI and the older Docker spellings, index first: a registry returns
# the first type it can serve, and asking only for a manifest list makes a
# multi-platform image look single-platform.
ACCEPT = ", ".join(
    [
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
    ]
)

# Anonymous pull tokens. Every registry here speaks the same token dance with a
# different issuer, so the only per-registry knowledge needed is this table.
REGISTRIES = {
    "ghcr.io": ("https://ghcr.io/token?scope=repository:{repo}:pull&service=ghcr.io", "ghcr.io"),
    "docker.io": (
        "https://auth.docker.io/token?scope=repository:{repo}:pull&service=registry.docker.io",
        "registry-1.docker.io",
    ),
    "quay.io": ("https://quay.io/v2/auth?scope=repository:{repo}:pull&service=quay.io", "quay.io"),
    "mcr.microsoft.com": (None, "mcr.microsoft.com"),
}

IMAGE_RE = re.compile(r"^\s*image:\s*[\"']?([^\"'\s#]+)", re.MULTILINE)


class Unknown(Exception):
    """The registry could not be asked. Not the same as 'the platform is absent'."""


def _get(url: str, token: str | None = None, accept: str | None = None) -> dict:
    req = urllib.request.Request(url)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if accept:
        req.add_header("Accept", accept)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
        raise Unknown(str(exc)) from exc


def split_ref(ref: str) -> tuple[str, str, str]:
    """Split an image reference into (registry, repository, tag-or-digest).

    A digest wins over a tag when both are present, because that is what the
    runtime resolves. `cfm-tmanager:latest@sha256:...` runs the digest, and
    reading the tag instead is exactly how #380 stayed hidden: the tag is
    amd64, the pinned digest is not.
    """
    remainder = ref
    digest = None
    if "@" in remainder:
        remainder, digest = remainder.split("@", 1)

    # A first segment is a registry when it looks like a host: it has a dot, is
    # localhost, or carries a numeric port. Testing for a bare colon instead
    # reads `nginx:1.29-alpine` as the host `nginx` on port `1.29-alpine`.
    first = remainder.split("/")[0]
    host_port = ":" in first and first.split(":", 1)[1].isdigit()
    if "/" in remainder and ("." in first or first == "localhost" or host_port):
        registry, path = first, remainder.split("/", 1)[1]
    else:
        registry, path = "docker.io", remainder

    tag = "latest"
    if ":" in path.split("/")[-1]:
        path, tag = path.rsplit(":", 1)

    if registry == "docker.io" and "/" not in path:
        path = "library/" + path

    return registry, path, digest or tag


def platforms_of(ref: str) -> list[str]:
    registry, repo, reference = split_ref(ref)
    if registry not in REGISTRIES:
        raise Unknown("no anonymous token flow known for %s" % registry)

    token_url, host = REGISTRIES[registry]
    token = None
    if token_url:
        token = _get(token_url.format(repo=repo)).get("token")

    manifest = _get("https://%s/v2/%s/manifests/%s" % (host, repo, reference), token, ACCEPT)

    if "manifests" in manifest:
        found = set()
        for entry in manifest["manifests"]:
            platform = entry.get("platform") or {}
            arch = platform.get("architecture")
            # Attestation manifests carry architecture "unknown" and are not
            # something anything can run.
            if arch and arch != "unknown":
                found.add("%s/%s" % (platform.get("os", "?"), arch))
        if not found:
            raise Unknown("index listed no runnable platform")
        return sorted(found)

    config_digest = (manifest.get("config") or {}).get("digest")
    if not config_digest:
        raise Unknown("manifest carries neither a platform list nor a config blob")
    config = _get("https://%s/v2/%s/blobs/%s" % (host, repo, config_digest), token)
    return ["%s/%s" % (config.get("os", "?"), config.get("architecture", "?"))]


def images_in(paths: list[Path]) -> dict[str, list[str]]:
    """Map each image reference to the compose files that use it."""
    found: dict[str, list[str]] = {}
    for path in paths:
        text = path.read_text(encoding="utf-8")
        for ref in IMAGE_RE.findall(text):
            # A ${VAR} in an image line is resolved at runtime, not here.
            if "${" in ref:
                continue
            found.setdefault(ref, []).append(path.name)
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", help="compose files (default: docker-compose*.yml)")
    parser.add_argument(
        "--ref",
        action="append",
        default=[],
        help="check one image reference instead of a compose file; repeatable",
    )
    parser.add_argument(
        "--platform",
        default="linux/amd64",
        help="the platform that must be available (default: linux/amd64, what CI runners are)",
    )
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args()

    if args.ref:
        targets = {ref: ["--ref"] for ref in args.ref}
    else:
        paths = [Path(f) for f in args.files] or sorted(REPO_ROOT.glob("docker-compose*.yml"))
        paths = [p if p.is_absolute() else REPO_ROOT / p for p in paths]
        missing = [p for p in paths if not p.exists()]
        if missing:
            print("no such file: %s" % ", ".join(str(p) for p in missing), file=sys.stderr)
            return 2
        targets = images_in(paths)

    results = []
    for ref, used_by in sorted(targets.items()):
        try:
            found = platforms_of(ref)
            status = "ok" if args.platform in found else "wrong-platform"
        except Unknown as exc:
            found, status = [], "unknown"
            results.append(
                {"image": ref, "used_by": used_by, "platforms": found, "status": status,
                 "reason": str(exc)}
            )
            continue
        results.append({"image": ref, "used_by": used_by, "platforms": found, "status": status})

    if args.json:
        print(json.dumps({"required": args.platform, "images": results}, indent=2))
    else:
        width = max((len(r["image"].split("/")[-1]) for r in results), default=10)
        for r in results:
            name = r["image"].split("/")[-1]
            mark = {"ok": "  ok  ", "wrong-platform": " FAIL ", "unknown": "  ??  "}[r["status"]]
            detail = ", ".join(r["platforms"]) or r.get("reason", "")
            print("%s %-*s %s" % (mark, width, name, detail))

    # The table is the report; the detail below it is the diagnosis. Flush so
    # the two do not interleave when stdout is a pipe and stderr is not.
    sys.stdout.flush()

    bad = [r for r in results if r["status"] == "wrong-platform"]
    unknown = [r for r in results if r["status"] == "unknown"]

    if bad:
        print("", file=sys.stderr)
        print(
            "%d image(s) have no %s manifest. Compose will start them anyway and they"
            % (len(bad), args.platform),
            file=sys.stderr,
        )
        print("will not serve, which is issue #380. Affected:", file=sys.stderr)
        for r in bad:
            print(
                "  %s\n      has %s, used by %s"
                % (r["image"], ", ".join(r["platforms"]), ", ".join(r["used_by"])),
                file=sys.stderr,
            )
    if unknown:
        print("", file=sys.stderr)
        print("%d image(s) could not be checked:" % len(unknown), file=sys.stderr)
        for r in unknown:
            print("  %s: %s" % (r["image"], r.get("reason", "")), file=sys.stderr)

    if bad:
        return 1
    if unknown:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
