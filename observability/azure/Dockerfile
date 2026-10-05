# mvhd-observability: the one observability app ADR-045 plans for Azure (#418).
#
#   docker build -f observability/azure/Dockerfile -t mvhd-observability observability
#
# grafana/otel-lgtm runs the OpenTelemetry Collector, Loki, Tempo, Prometheus
# and Grafana in one container (monolithic mode). This image adds what the
# compose stack mounts from the repo: the MVHD dashboards and datasources, and
# a collector config with the redaction and sampling of
# observability/otel-collector.yaml. Sign-in is Keycloak (generic OAuth),
# configured by the environment the deploy script sets; see README.md.
FROM grafana/otel-lgtm:0.35.0

# Never anonymous: the base image defaults to anonymous Admin, which a
# public Grafana must not inherit, whatever the deployment forgets to set.
ENV GF_AUTH_ANONYMOUS_ENABLED=false \
    GF_USERS_ALLOW_SIGN_UP=false \
    GF_ANALYTICS_REPORTING_ENABLED=false \
    GF_ANALYTICS_CHECK_FOR_UPDATES=false \
    GF_PLUGINS_PREINSTALL=yesoreyeram-infinity-datasource@4.1.0

# Sign-in through Keycloak only (realm edcv, client mvhd-grafana). Who gets in
# is the realm role: EDC_ADMIN administers, HDAB_AUTHORITY and
# TRUST_CENTER_OPERATOR read; any other role gets no access at all (strict).
# The deployment sets the URLs, GF_SERVER_ROOT_URL and the client secret.
ENV GF_AUTH_GENERIC_OAUTH_ENABLED=true \
    GF_AUTH_GENERIC_OAUTH_NAME=Keycloak \
    GF_AUTH_GENERIC_OAUTH_CLIENT_ID=mvhd-grafana \
    GF_AUTH_GENERIC_OAUTH_SCOPES="openid profile email" \
    GF_AUTH_GENERIC_OAUTH_USE_PKCE=true \
    GF_AUTH_GENERIC_OAUTH_LOGIN_ATTRIBUTE_PATH=preferred_username \
    GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH="contains(roles[*], 'EDC_ADMIN') && 'Admin' || contains(roles[*], 'HDAB_AUTHORITY') && 'Viewer' || contains(roles[*], 'TRUST_CENTER_OPERATOR') && 'Viewer'" \
    GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_STRICT=true \
    GF_AUTH_GENERIC_OAUTH_ALLOW_ASSIGN_GRAFANA_ADMIN=false \
    GF_AUTH_DISABLE_LOGIN_FORM=true \
    GF_AUTH_OAUTH_AUTO_LOGIN=true

COPY azure/otelcol-config.yaml /otel-lgtm/otelcol-config.yaml
COPY grafana/provisioning/datasources/mvhd.yaml /otel-lgtm/grafana/conf/provisioning/datasources/mvhd.yaml
COPY grafana/provisioning/dashboards/mvhd.yaml /otel-lgtm/grafana/conf/provisioning/dashboards/mvhd.yaml
COPY grafana/dashboards /otel-lgtm/mvhd-dashboards
