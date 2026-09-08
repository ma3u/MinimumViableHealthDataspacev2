FROM python:3.12-slim
WORKDIR /app

# Install runtime deps only — tests stay in source, not in the image.
RUN pip install --no-cache-dir \
      nats-py==2.7.0 \
      neo4j==5.23.0 \
      httpx==0.27.2 \
      pydantic==2.8.2 \
      prometheus-client==0.21.0

COPY src /app/src

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

EXPOSE 9465

# Run unprivileged (Trivy DS-0002). The Prometheus port is >1024, so dropping
# root costs no capability. Nothing is written inside the image at run time.
RUN useradd --system --no-create-home --uid 10001 crawler
USER crawler

ENTRYPOINT ["python", "-m", "src.main"]
