FROM python:3.12-slim
WORKDIR /app

# Install runtime deps only — tests are not shipped in the image.
COPY pyproject.toml /app/pyproject.toml
RUN pip install --no-cache-dir \
      nats-py==2.7.0 \
      neo4j==5.23.0 \
      pydantic==2.8.2 \
      prometheus-client==0.21.0

COPY src /app/src

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

EXPOSE 9464
# Container Apps takes its probes from the app definition, not the image; this
# check (the Prometheus endpoint; python:slim has neither curl nor wget) is for compose and for anyone who runs the image by hand (security
# test report 2026-10-15, F6).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/metrics'%os.environ.get('METRICS_PORT','9464'),timeout=3)"]

# Run unprivileged (Trivy DS-0002). The Prometheus port is >1024, so dropping
# root costs no capability. Nothing is written inside the image at run time.
RUN useradd --system --no-create-home --uid 10001 enricher
USER 10001

ENTRYPOINT ["python", "-m", "src.main"]
