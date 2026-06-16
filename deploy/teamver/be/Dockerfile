FROM python:3.12-slim

WORKDIR /app

# teamver-app-sdk — vendored wheel (scripts/sync-teamver-vendor.sh)
# pip 25+ requires PEP 427 wheel filenames (teamver_app_sdk-{version}-py3-none-any.whl).
COPY ns-open-design/vendor/teamver/python/teamver_app_sdk-*.whl /tmp/vendor-wheels/
RUN sh -c 'whl=$(ls /tmp/vendor-wheels/teamver_app_sdk-*.whl | head -1); pip install --no-cache-dir "${whl}[fastapi]"'

COPY ns-open-design/deploy/teamver/be/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ns-open-design/deploy/teamver/be/app ./app
COPY ns-open-design/deploy/teamver/be/scripts ./scripts

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
