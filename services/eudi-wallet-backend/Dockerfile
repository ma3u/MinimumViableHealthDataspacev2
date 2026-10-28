# The German national wallet backend (Apache-2.0), built from its published
# mirror plus this project's overlay. See scripts/eudi/build-backend.sh for why
# an overlay is needed: the mirror ships src/main/kotlin and a version catalogue
# and no build files at all.
#
# Two stages so the image is reproducible from the mirror alone — the build does
# not depend on a jar someone built by hand.

# --- build ------------------------------------------------------------------
FROM eclipse-temurin:25-jdk AS build

ARG GRADLE_VERSION=9.7.1
ARG WALLET_BACKEND_REF=main

# Build tools from the base image's Ubuntu release; pinning their patch versions
# breaks the build at every security update of the base, and the image is dev only.
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl unzip git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/gradle.zip \
      "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" \
 && unzip -q /tmp/gradle.zip -d /opt \
 && rm /tmp/gradle.zip
ENV PATH="/opt/gradle-${GRADLE_VERSION}/bin:${PATH}"

WORKDIR /workspace

# The mirror, verbatim.
ARG WALLET_BACKEND_REPO=https://github.com/german-national-wallet/de-eudi-wallet-backend.git
RUN git clone --depth 1 --branch "${WALLET_BACKEND_REF}" "${WALLET_BACKEND_REPO}" upstream

# This project's overlay: the two Gradle files, the OpenAPI doc stubs the
# mirror references but does not ship, application.yaml and the Flyway schema.
COPY overlay /workspace/overlay
RUN cp /workspace/overlay/settings.gradle.kts /workspace/overlay/build.gradle.kts /workspace/upstream/

WORKDIR /workspace/upstream
RUN gradle --no-daemon --console=plain \
      -PwalletBackendOverlay=/workspace/overlay \
      bootJar \
 && cp build/libs/*.jar /workspace/wallet-backend.jar

# --- runtime ----------------------------------------------------------------
FROM eclipse-temurin:25-jre

# SoftHSM2 is the dev/test HSM. Under the build-docs profile no key lineage is
# ever built and the module is never dlopen'd, but hsm.module-library is still
# bound, so the path has to exist either way. opensc supplies pkcs11-tool, which
# provision-hsm.sh uses to create the key objects for a signing-capable run.
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends softhsm2 opensc \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --system --uid 10001 --create-home wallet

# Create the mount points before the volumes are attached. Docker seeds an empty
# named volume from the image directory, ownership included; without this they
# arrive owned by root and provision-hsm.sh fails with "mkdir: Permission denied".
RUN mkdir -p /home/wallet/softhsm/tokens /home/wallet/chains /home/wallet/certs \
 && chown -R wallet:wallet /home/wallet

USER wallet
WORKDIR /home/wallet

COPY --from=build --chown=wallet:wallet /workspace/wallet-backend.jar /home/wallet/wallet-backend.jar
COPY --chown=wallet:wallet provision-hsm.sh /usr/local/bin/provision-hsm.sh

ENV WALLET_PORT=8080 \
    WALLET_CERT_DIR=file:/home/wallet/certs \
    HSM_MODULE_LIBRARY=/usr/lib/softhsm/libsofthsm2.so \
    SOFTHSM2_CONF=/home/wallet/softhsm/softhsm2.conf \
    HSM_TOKEN_DIR=/home/wallet/softhsm/tokens \
    JAVA_OPTS=""

EXPOSE 8080

# build-docs replaces every HSM-backed key lineage with a stub, which is the
# only way to boot without a provisioned HSM. It must not be used with real
# wallet instances: nothing it signs is verifiable.
ENV SPRING_PROFILES_ACTIVE=build-docs

# Readiness, not the aggregate: under build-docs the two HSM health indicators
# are DOWN by design ("HSM is not available in the build-docs profile"), so the
# aggregate is DOWN while the service is serving.
#
# bash, not sh: /bin/sh here is dash, which has no /dev/tcp, and the image
# carries no curl or wget. Probing with sh fails with
# "cannot create /dev/tcp/127.0.0.1/8080: Directory nonexistent".
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD ["/bin/bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${WALLET_PORT} && printf 'GET /actuator/health/readiness HTTP/1.0\\r\\n\\r\\n' >&3 && grep -q UP <&3"]

ENTRYPOINT ["/bin/sh", "-c", "exec java $JAVA_OPTS -jar /home/wallet/wallet-backend.jar"]
