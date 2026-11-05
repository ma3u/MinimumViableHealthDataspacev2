# Builds one EDC launcher image (ADR-076):
#   docker build --build-arg RUNTIME=controlplane -t edc-controlplane runtimes/edc
# RUNTIME is controlplane, identity-hub or issuerservice.
FROM gradle:9.8.2-jdk21-alpine AS build
ARG RUNTIME
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/home/gradle/.gradle/caches \
    gradle --no-daemon -q ":${RUNTIME}:shadowJar"

FROM eclipse-temurin:21.0.13_9-jre-alpine
ARG RUNTIME
ARG EDC_VERSION
ARG SOURCE_REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/ma3u/MinimumViableHealthDataspacev2" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.version="${EDC_VERSION}" \
      org.opencontainers.image.title="edc-${RUNTIME}"
# curl for the compose healthchecks; the base image is pinned, and so is its package index
# hadolint ignore=DL3018
RUN apk --no-cache add curl
WORKDIR /app
COPY --from=build /src/${RUNTIME}/build/libs/${RUNTIME}.jar edc-runtime.jar
CMD ["sh", "-c", "exec java -Djava.security.egd=file:/dev/urandom ${JAVA_OPTS:-} -jar edc-runtime.jar"]
