FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# CA certs are required for pymongo's TLS handshake to Atlas (mongodb+srv://).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py all_queries.py ./
COPY templates ./templates
COPY static ./static

ENV PORT=8080
EXPOSE 8080

# 1 worker is fine — Mongo aggregations are I/O bound and Cloud Run autoscales by request.
CMD exec gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 120 app:app
