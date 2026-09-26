FROM alpine:3.24
# cypher-shell is here because Neo4j on ACA answers on Bolt only: mvhd-neo4j
# has TCP ingress with targetPort and exposedPort 7687 and no
# additionalPortMappings, so the transactional HTTP API on 7474 that
# run-ehds-tests.sh used to call is not routable from this job either
# (issue #205). It is a JVM tool, hence the headless JRE.
# hadolint ignore=DL3018
RUN apk add --no-cache bash curl jq coreutils openjdk21-jre-headless unzip
ARG CYPHER_SHELL_VERSION=5.26.0
RUN curl -fsSL -o /tmp/cypher-shell.zip \
      "https://dist.neo4j.org/cypher-shell/cypher-shell-${CYPHER_SHELL_VERSION}.zip" \
    && unzip -q /tmp/cypher-shell.zip -d /opt \
    && ln -sf "/opt/cypher-shell-${CYPHER_SHELL_VERSION}/bin/cypher-shell" /usr/local/bin/cypher-shell \
    && rm /tmp/cypher-shell.zip
WORKDIR /work
COPY scripts/lib/edc-mgmt-api.sh /work/scripts/lib/
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
# Numeric, because hadolint DL3066 is right that a host cannot resolve a name
# from the image's own /etc/passwd. Same uid:gid as the account created above.
USER 10001:10001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
