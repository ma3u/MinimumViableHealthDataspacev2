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
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
