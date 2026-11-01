# =============================================================================
# kbs-client with the SEV-SNP attester, for ACI confidential containers
# (ADR-068, ADR-069, #774)
# =============================================================================
# The published kbs-client images carry the sample attester only, so an SPE
# workspace in an ACI confidential container group could not show its
# evidence to the access body's Trustee with them. This builds kbs-client from
# Trustee v0.22.0 (the release CoCo v0.23.0 ships) with `snp-attester`, which
# asks the SEV-SNP guest device for a report whose REPORT_DATA binds Trustee's
# nonce and the TEE key. On ACI that report's HOST_DATA is the SHA-256 of the
# group's ccePolicy: the permit's policy hash, checked by hardware.
#
# Built in Azure, not on a laptop (amd64 only, a long Rust build):
#   az acr build -r acrmvhdehds -t kbs-client-aci:v0.22.0 \
#     -f services/spe-loader/kbs-client.aci.Dockerfile services/spe-loader
# scripts/azure/21-aci-confidential-spe.sh --extracts does this and pins the
# digest; the spe-loader image then copies the binary (KBS_CLIENT_IMAGE).
# Built and run on 2026-10-31 under amd64 emulation (both attesters below):
# it compiles, links, and every library resolves. Run inside ACI on
# 2026-11-01: the unpatched attester could not get the report (see below).
#
# ATTESTER is kbs/Makefile's: `snp-attester` for ACI; `az-snp-vtpm-attester`
# (an Azure confidential VM's vTPM) also builds, and needs the libtss2
# runtime (TSS_RUNTIME=true in the spe-loader build).
# Debian bookworm on both sides, so the libraries the binary links at build
# time are the ones node:22-bookworm-slim has. Source pinned by tag and commit.
# =============================================================================

# rust:1.95.0-bookworm, the toolchain Trustee v0.22.0 pins (rust-toolchain.toml)
FROM rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1 AS build

ARG TRUSTEE_REF=v0.22.0
ARG TRUSTEE_COMMIT=512fed65642015b849f38fb13bfdec7806639987
# The guest-components commit Trustee v0.22.0 pins (Cargo.toml, Cargo.lock).
ARG GUEST_COMPONENTS_COMMIT=da8d93f2797088a5f0636c8c1eeb31da73784fe8
ARG ATTESTER=snp-attester

# From the pinned base image's Debian release; patch pins break at every security update.
# hadolint ignore=DL3008
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      clang libclang-dev libssl-dev libtss2-dev pkg-config protobuf-compiler git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch "${TRUSTEE_REF}" https://github.com/confidential-containers/trustee.git . && \
    test "$(git rev-parse HEAD)" = "${TRUSTEE_COMMIT}"

# The SNP attester asks /dev/sev-guest for the extended report only, which
# carries the host's certificate table. Azure Container Instances serve none,
# so inside ACI it failed with "Failed to get attestation report" and Trustee
# never saw evidence (#774, 2026-11-01). patches/snp-attester-plain-report.patch
# falls back to the plain report, as Microsoft's get-snp-report does there;
# Trustee's SNP verifier then fetches the VCEK from AMD KDS. Every
# guest-components crate Trustee uses is taken from the patched checkout of
# the same commit, so none comes twice.
COPY patches/snp-attester-plain-report.patch /patches/
RUN git clone https://github.com/confidential-containers/guest-components.git /guest-components && \
    git -C /guest-components checkout --quiet "${GUEST_COMPONENTS_COMMIT}" && \
    git -C /guest-components apply /patches/snp-attester-plain-report.patch && \
    printf '%s\n' \
      '' \
      '[patch."https://github.com/confidential-containers/guest-components.git"]' \
      'attestation-agent = { path = "/guest-components/attestation-agent/attestation-agent" }' \
      'attester = { path = "/guest-components/attestation-agent/attester" }' \
      'crypto = { path = "/guest-components/attestation-agent/deps/crypto" }' \
      'kbs_protocol = { path = "/guest-components/attestation-agent/kbs_protocol" }' \
      'kms = { path = "/guest-components/confidential-data-hub/kms" }' \
      'protos = { path = "/guest-components/protos" }' \
      'resource_uri = { path = "/guest-components/attestation-agent/deps/resource_uri" }' \
      >> Cargo.toml

# As kbs/Makefile's `cli` target with ATTESTER=<attester>: the sample attester
# stays compiled in (kbs_protocol's fallback when no TEE device is found), and
# the resource policy on Azure refuses sample evidence
# (trustee/policies/resource-azure.rego.tmpl). Not --locked: the patch moves
# the guest-components crates from git to a path, which rewrites their lock
# entries; every other crate keeps the version Cargo.lock pins.
RUN cargo build -p kbs-client --release --features "${ATTESTER}" && \
    install -D -m0755 target/release/kbs-client /out/kbs-client

# debian:bookworm-slim
FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3
# From the pinned base image's Debian release; patch pins break at every security update.
# hadolint ignore=DL3008
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates libssl3 && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /out/kbs-client /usr/local/bin/kbs-client
# Only a source for the binary (services/spe-loader/Dockerfile copies it and
# runs as 1000); /dev/sev-guest is world-readable in ACI, so no root needed.
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/kbs-client"]
