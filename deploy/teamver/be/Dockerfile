ARG PYTHON_IMAGE=docker.io/library/python:3.12-slim
FROM ${PYTHON_IMAGE}

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy
ARG NO_PROXY

ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    http_proxy=${http_proxy} \
    https_proxy=${https_proxy} \
    no_proxy=${no_proxy} \
    NO_PROXY=${NO_PROXY}

WORKDIR /app

# teamver-app-sdk — vendored wheel (scripts/sync-teamver-vendor.sh)
# pip 25+ requires PEP 427 wheel filenames (teamver_app_sdk-{version}-py3-none-any.whl).
COPY ns-open-design/vendor/teamver/python/teamver_app_sdk-*.whl /tmp/vendor-wheels/
RUN sh -c 'whl=$(ls /tmp/vendor-wheels/teamver_app_sdk-*.whl | head -1); pip install --no-cache-dir "${whl}[fastapi]"'

COPY ns-open-design/deploy/teamver/be/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ns-open-design/deploy/teamver/be/app ./app
COPY ns-open-design/deploy/teamver/be/scripts ./scripts

# Multi-worker uvicorn — Dockerfile default 3/200/30 은 로컬·compose fallback.
# Production 상용 SSOT: t3.2xlarge + UVICORN_WORKERS=5 (deploy/teamver/.env.production).
# Staging: t3.large + UVICORN_WORKERS=2 (.env.staging). 워크로드는 asyncpg + httpx
# I/O-bound 이지만 OD daemon(Chromium export) 과 vCPU·RAM 공유 → workers 는 env 로
# EC2 스펙에 맞게 override (재빌드 불필요).
#
# --proxy-headers + --forwarded-allow-ips '*': nginx / ALB 뒤 실 IP 반영.
# --limit-concurrency: 워커당 in-flight 상한 초과 시 503 (백프레셔).
# --timeout-keep-alive: nginx `keepalive_timeout` 보다 크게.
ENV PYTHONUNBUFFERED=1 \
    UVICORN_WORKERS=3 \
    UVICORN_LIMIT_CONCURRENCY=200 \
    UVICORN_TIMEOUT_KEEP_ALIVE=30
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS} --proxy-headers --forwarded-allow-ips '*' --limit-concurrency ${UVICORN_LIMIT_CONCURRENCY} --timeout-keep-alive ${UVICORN_TIMEOUT_KEEP_ALIVE}"]
