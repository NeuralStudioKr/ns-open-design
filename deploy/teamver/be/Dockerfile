FROM python:3.12-slim

WORKDIR /app

# teamver-app-sdk — vendored wheel (scripts/sync-teamver-vendor.sh)
# pip 25+ requires PEP 427 wheel filenames (teamver_app_sdk-{version}-py3-none-any.whl).
COPY ns-open-design/vendor/teamver/python/ /tmp/vendor-wheels/
RUN set -eux; \
    whl="$(ls /tmp/vendor-wheels/teamver_app_sdk-*.whl 2>/dev/null | head -1 || true)"; \
    if [ -z "$whl" ] && [ -f /tmp/vendor-wheels/teamver-app-sdk.whl ]; then \
      ver="$(python3 -c "import re, zipfile; z=zipfile.ZipFile('/tmp/vendor-wheels/teamver-app-sdk.whl'); m=[n for n in z.namelist() if n.endswith('METADATA')][0]; print(re.search(r'^Version: (.+)$', z.read(m).decode(), re.M).group(1))"); \
      whl="/tmp/vendor-wheels/teamver_app_sdk-${ver}-py3-none-any.whl"; \
      cp /tmp/vendor-wheels/teamver-app-sdk.whl "$whl"; \
    fi; \
    test -n "$whl"; \
    pip install --no-cache-dir "${whl}[fastapi]"

COPY ns-open-design/deploy/teamver/be/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ns-open-design/deploy/teamver/be/app ./app
COPY ns-open-design/deploy/teamver/be/scripts ./scripts

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
