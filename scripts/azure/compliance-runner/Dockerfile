FROM alpine:3.20
# hadolint ignore=DL3018
RUN apk add --no-cache bash curl jq coreutils
WORKDIR /work
COPY scripts/run-compliance.sh /work/scripts/
COPY scripts/run-dsp-tck.sh /work/scripts/
COPY scripts/run-dcp-tests.sh /work/scripts/
COPY scripts/run-ehds-tests.sh /work/scripts/
COPY scripts/azure/compliance-runner/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /work/scripts/*.sh /usr/local/bin/entrypoint.sh
ENV DEMO_MODE=azure \
    REPORT_DIR=/work/test-results \
    SUITES="dsp dcp ehds"

# Run unprivileged (Trivy DS-0002). entrypoint.sh does `mkdir -p $REPORT_DIR`
# and each suite writes its own subdirectory under it, so /work must be owned
# by the runner — it is an ephemeral ACA Job container with no other state.
RUN addgroup -g 10001 compliance \
    && adduser -D -H -u 10001 -G compliance compliance \
    && mkdir -p /work/test-results \
    && chown -R compliance:compliance /work
USER compliance

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
