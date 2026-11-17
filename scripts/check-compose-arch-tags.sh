#!/usr/bin/env bash
# Fail when a compose image is pinned to a single-architecture tag.
#
# Why: Dependabot reads an architecture suffix as part of the version. In #976
# it moved otel/opentelemetry-collector-contrib from 0.161.0 to 0.164.0-386,
# and in #1053 on to 0.165.0-386: a tag that only has a linux/386 image, so the
# collector cannot run natively on amd64 or Apple Silicon (#380 has the same
# shape). Its ignore rules take version ranges, not tag patterns, so the PR
# Gate catches it here instead: offline, from the tags alone.
# scripts/check-image-platforms.py asks the registries and finds the same
# thing, but only annotates.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ARCH='386|amd64|arm64|arm64v8|armv5|armv6|armv7|arm32v6|arm32v7|arm|ppc64le|s390x|riscv64|mips64le|i386|x86_64|windows-amd64'

bad=0
for f in docker-compose*.yml; do
  [[ -f "$f" ]] || continue
  while IFS= read -r line; do
    num="${line%%:*}"
    ref="${line#*image:}"
    ref="${ref//[\"\' ]/}"
    ref="${ref%%#*}"
    ref="${ref%%@*}"        # a digest pin does not change what the tag says
    tag="${ref##*:}"
    # No tag at all, or only a registry port (host:5000/image).
    [[ "$tag" == "$ref" || "$tag" == */* ]] && continue
    if [[ "$tag" =~ -(${ARCH})$ ]]; then
      echo "ARCH TAG: ${f}:${num}: ${ref}"
      echo "   -> pin the multi-arch tag (${tag%-*}); a -${BASH_REMATCH[1]} tag runs on that architecture only"
      bad=$((bad + 1))
    fi
  done < <(grep -nE '^[[:space:]]*image:[[:space:]]*' "$f" || true)
done

if [[ "$bad" -gt 0 ]]; then
  echo ""
  echo "${bad} compose image(s) pinned to a single-architecture tag."
  exit 1
fi
echo "No compose image is pinned to a single-architecture tag."
