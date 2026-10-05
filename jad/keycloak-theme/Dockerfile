# Keycloak with the EHDS Integration Hub login theme, for Azure, where nothing
# mounts the repo. The compose stack mounts jad/keycloak-theme/ehds-hub instead.
#
#   docker build -f jad/keycloak-theme/Dockerfile --build-arg KEYCLOAK_VERSION=26.6.4 jad/keycloak-theme
ARG KEYCLOAK_VERSION=26.6.4
FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
COPY --chown=1000:0 ehds-hub /opt/keycloak/themes/ehds-hub
