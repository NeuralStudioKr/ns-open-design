FROM python:3.12-slim

WORKDIR /app

# teamver-app-sdk — vendored wheel (scripts/sync-teamver-vendor.sh)
COPY ns-open-design/vendor/teamver/python/teamver-app-sdk.whl /tmp/teamver-app-sdk.whl
RUN pip install --no-cache-dir "/tmp/teamver-app-sdk.whl[fastapi]"

COPY ns-open-design/deploy/teamver/be/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ns-open-design/deploy/teamver/be/app ./app
COPY ns-open-design/deploy/teamver/be/scripts ./scripts

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
