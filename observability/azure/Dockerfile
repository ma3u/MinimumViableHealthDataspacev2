# mvhd-observability: the one observability app ADR-045 plans for Azure (#418).
#
#   docker build -f observability/azure/Dockerfile -t mvhd-observability observability
#
# grafana/otel-lgtm runs the OpenTelemetry Collector, Loki, Tempo, Prometheus
# and Grafana in one container (monolithic mode). This image adds what the
# compose stack mounts from the repo: the MVHD dashboards and datasources, and
# a collector config with the redaction and sampling of
# observability/otel-collector.yaml. Sign-in is Keycloak only, set in
# grafana-custom.ini; the deploy script adds the URLs and the client secret.
FROM grafana/otel-lgtm:0.35.0

ENV GF_PLUGINS_PREINSTALL=yesoreyeram-infinity-datasource@4.1.0

COPY azure/otelcol-config.yaml /otel-lgtm/otelcol-config.yaml
COPY azure/grafana-custom.ini /otel-lgtm/grafana/conf/custom.ini
COPY grafana/provisioning/datasources/mvhd.yaml /otel-lgtm/grafana/conf/provisioning/datasources/mvhd.yaml
COPY azure/datasource-azure-monitor.yaml /otel-lgtm/grafana/conf/provisioning/datasources/azure-monitor.yaml
COPY grafana/provisioning/dashboards/mvhd.yaml /otel-lgtm/grafana/conf/provisioning/dashboards/mvhd.yaml
COPY grafana/dashboards /otel-lgtm/mvhd-dashboards

# The base image's start script turns anonymous access on (as Admin) unless
# the environment says otherwise, and the environment beats custom.ini. Make
# its default "off", and fail the build if the script changed under us.
# Then run as an unprivileged user: the components write to /data, and
# Tempo its shutdown marker to /var/tempo.
RUN sed -i 's/GF_AUTH_ANONYMOUS_ENABLED:-true/GF_AUTH_ANONYMOUS_ENABLED:-false/' /otel-lgtm/run-grafana.sh \
 && grep -q 'GF_AUTH_ANONYMOUS_ENABLED:-false' /otel-lgtm/run-grafana.sh \
 && mkdir -p /data /var/tempo \
 && chown -R 1000:1000 /data /var/tempo /otel-lgtm

USER 1000:1000
