FROM python:3.12-slim
WORKDIR /app

# Install the runtime dependencies pyproject.toml pins, and nothing else:
# tests are not shipped in the image. The image used to carry its own list,
# which no one updated: it stayed at 2024 versions while pyproject.toml and
# the tests moved on, and pydantic 2.8.2 has no wheel for a newer Python, so
# the base image could not be bumped (#810, #811).
COPY pyproject.toml /app/pyproject.toml
RUN python -c 'import tomllib; print("\n".join(tomllib.load(open("pyproject.toml", "rb"))["project"]["dependencies"]))' > /tmp/requirements.txt \
 && pip install --no-cache-dir -r /tmp/requirements.txt \
 && rm /tmp/requirements.txt

COPY src /app/src

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

EXPOSE 9465
# Container Apps takes its probes from the app definition, not the image; this
# check (the Prometheus endpoint; python:slim has neither curl nor wget) is for compose and for anyone who runs the image by hand (security
# test report 2026-10-15, F6).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/metrics'%os.environ.get('METRICS_PORT','9465'),timeout=3)"]

# Run unprivileged (Trivy DS-0002). The Prometheus port is >1024, so dropping
# root costs no capability. Nothing is written inside the image at run time.
RUN useradd --system --no-create-home --uid 10001 crawler
USER 10001

ENTRYPOINT ["python", "-m", "src.main"]
