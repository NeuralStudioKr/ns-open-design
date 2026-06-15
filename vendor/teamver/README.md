# Teamver SDK vendor (`vendor/teamver`)

`ns-teamver-platform`에서 **빌드된 패키지 산출물**만 둡니다. 소스 `file:` 경로나 npm/PyPI registry install 은 사용하지 않습니다.

**설계·EC2 배포 정책:** [docs-teamver/08_Teamver_SDK_vendor와_배포.md](../../docs-teamver/08_Teamver_SDK_vendor와_배포.md)

| 파일 | 패키지 | 생성 |
|------|--------|------|
| `app-sdk.tgz` | `@teamver/app-sdk` | `build-ts-packages.sh` → `npm pack` |
| `python/teamver-app-sdk.whl` | `teamver-app-sdk` | `build-python-sdk.sh` |
| `manifest.json` | 버전·생성 시각 | sync 스크립트 |

## 갱신

```bash
# ns-open-design repo root
bash scripts/sync-teamver-vendor.sh
pnpm install
```

`TEAMVER_PLATFORM_ROOT`로 platform 레포 경로를 바꿀 수 있습니다.

## 소비

- **OD web:** `apps/web/package.json` → `"@teamver/app-sdk": "file:../../vendor/teamver/app-sdk.tgz"`
- **design-api BE:** Docker → `vendor/teamver/python/teamver-app-sdk.whl`

Production EC2: vendor 를 **git에 커밋**한 뒤 `git pull` + `run_docker.sh` (EC2에서 sync 불필요).
