FROM python:3.11-slim AS base

# System dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       libpango-1.0-0 \
       libpangocairo-1.0-0 \
       libgdk-pixbuf-2.0-0 \
       libffi-dev \
       libcairo2 \
       curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

WORKDIR /app

# Install dependencies (extract from pyproject.toml for layer caching)
COPY pyproject.toml .
RUN pip install --no-cache-dir $(python3 -c "\
import tomllib; \
data = tomllib.load(open('pyproject.toml','rb')); \
print(' '.join(data['project']['dependencies']))") gunicorn

# Copy application code
COPY . .

# Install the package itself (deps already cached above)
RUN pip install --no-cache-dir --no-deps "."

# Own the app directory
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
