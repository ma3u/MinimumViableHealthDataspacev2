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

ENTRYPOINT ["python", "-m", "src.main"]
