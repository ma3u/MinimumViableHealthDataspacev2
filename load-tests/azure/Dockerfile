# k6 inside the Azure Container Apps environment (#519), so a run against the
# live hub writes its metrics to mvhd-observability's Prometheus and shows on
# grafana.ehds.mabu.red. scripts/azure/run-load-test.sh builds and starts it.
#
#   docker build -f load-tests/azure/Dockerfile -t mvhd-k6 load-tests
FROM grafana/k6:2.3.0
COPY config.js platform.js signin.js /scripts/
COPY azure/entrypoint.sh /scripts/entrypoint.sh
# The k6 image already runs as this user; stating it keeps the scanner honest (trivy DS-0002).
USER 12345
# A one-shot job: k6 runs one scenario and exits, there is nothing to probe
# (security test report 2026-10-15, F6).
HEALTHCHECK NONE
ENTRYPOINT ["/bin/sh", "/scripts/entrypoint.sh"]
