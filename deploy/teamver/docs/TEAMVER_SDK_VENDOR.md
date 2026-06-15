# Teamver SDK vendor — runbook

설계·결정 배경: **[docs-teamver/08_Teamver_SDK_vendor와_배포.md](../../../docs-teamver/08_Teamver_SDK_vendor와_배포.md)**

---

## Quick reference

| 산출물 | 경로 | 소비 |
|--------|------|------|
| `@teamver/app-sdk` | `vendor/teamver/app-sdk.tgz` | `apps/web` pnpm → Next build |
| `teamver-app-sdk` | `vendor/teamver/python/teamver-app-sdk.whl` | design-api Dockerfile |

## 갱신

```bash
cd ns-open-design
bash scripts/sync-teamver-vendor.sh
pnpm install
```

## EC2 배포 (ECR 없음)

```bash
git pull   # vendor 커밋 포함 권장
cd deploy/teamver
bash scripts/run_docker.sh --production   # 또는 --staging
```

**Production:** EC2에서 `sync-teamver-vendor.sh` / platform clone 에 의존하지 말 것.

## 스크립트

| 스크립트 | 위치 |
|----------|------|
| `sync-teamver-vendor.sh` | `ns-open-design/scripts/` |
| `check-teamver-vendor.mjs` | `ns-open-design/scripts/` (apps/web preinstall) |
| `build-ts-packages.sh` | `ns-teamver-platform/scripts/` |
| `build-python-sdk.sh` | `ns-teamver-platform/scripts/` |
