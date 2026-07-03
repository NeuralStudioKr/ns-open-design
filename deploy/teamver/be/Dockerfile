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

# Multi-worker uvicorn — production EC2 t3.xlarge (4 vCPU) sweet spot: 3 workers.
# 워크로드는 asyncpg + httpx (Main BE) + JWKS 로 I/O-bound → 각 워커의 event
# loop 가 수백 동시 요청 처리. workers>3 은 OD daemon(Chromium export burst)
# 과 vCPU 경쟁 → context switch latency 편차 커짐. workers 는 UVICORN_WORKERS
# env 로 재빌드 없이 오버라이드 (compose environment). staging 은 t3.large
# (2 vCPU) 이므로 UVICORN_WORKERS=2 권장 (.env.staging).
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
