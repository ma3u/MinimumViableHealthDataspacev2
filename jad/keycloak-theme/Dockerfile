# Keycloak with the EHDS Integration Hub login theme, for Azure, where nothing
# mounts the repo. The compose stack mounts jad/keycloak-theme/ehds-hub instead.
#
#   docker build -f jad/keycloak-theme/Dockerfile --build-arg KEYCLOAK_VERSION=26.8.0 jad/keycloak-theme
#
# Built ahead for `kc.sh start --optimized` (#577): the build-time options are
# fixed here, so the container starts without re-augmenting. One replica, so
# the cache is local; a second replica would need the default ispn cache.
ARG KEYCLOAK_VERSION=26.8.0
FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION} AS builder
ENV KC_DB=postgres KC_CACHE=local KC_HEALTH_ENABLED=true
COPY --chown=1000:0 ehds-hub /opt/keycloak/themes/ehds-hub
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
