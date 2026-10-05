# k6 inside the Azure Container Apps environment (#519), so a run against the
# live hub writes its metrics to mvhd-observability's Prometheus and shows on
# grafana.ehds.mabu.red. scripts/azure/run-load-test.sh builds and starts it.
#
#   docker build -f load-tests/azure/Dockerfile -t mvhd-k6 load-tests
FROM grafana/k6:2.3.0
COPY config.js platform.js signin.js /scripts/
COPY azure/entrypoint.sh /scripts/entrypoint.sh
ENTRYPOINT ["/bin/sh", "/scripts/entrypoint.sh"]
