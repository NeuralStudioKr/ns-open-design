# Teamver SDK vendor · VM/EC2 배포

**Track A 필수 읽기.** `@teamver/app-sdk` / `teamver-app-sdk-python` 을 **npm·PyPI registry 없이** 쓰는 방법과, **ECR/사설 컨테이너 레지스트리 없이** Staging/Production EC2에 올리는 절차.

**관련:** [05 OD UI 재사용](./05_OD_UI_재사용_빠른출시.md) · [07 EC2·배포·인프라](./07_VM_배포_인프라.md) · [06 Docs/Slides형 연동](./06_Docs슬라이드형_연동.md)

**코드:** `vendor/teamver/` · `scripts/sync-teamver-vendor.sh` · `deploy/teamver/scripts/run_docker.sh`

---

## 한 줄 결론

> **SDK는 `vendor/` tarball·wheel로 repo에 실어 두고**, EC2에서는 **Docs/Slides처럼 `git pull` → `docker compose build`** 한다.  
> **런타임(nginx·컨테이너 기동)에는 sync·pnpm·npm install 이 필요 없다.**

---

## 1. 왜 이렇게 하나

### 1.1 하지 않는 것

| 방식 | 이유 |
|------|------|
| `"@teamver/app-sdk": "file:../../../../ns-teamver-platform/..."` | 소스 경로 의존 — EC2에 platform clone·빌드 toolchain 강제, 배포 재현성 ↓ |
| EC2에서 `npm install @teamver/app-sdk` | private registry 미구축 (`publish-npm.sh` TODO) |
| prod EC2에서 `sync-teamver-vendor.sh` 매 배포 | node·python·platform 빌드 — 느리고 VM 사양·결과 비결정적 |
| ECR/GHCR 전용 이미지 pull (현재) | **아직 미사용** — Docs/Slides와 동일하게 **EC2 로컬 build** |

### 1.2 하는 것

```text
ns-teamver-platform (형제 레포)
  build-ts-packages.sh  → @teamver/app-sdk dist
  build-python-sdk.sh   → teamver-app-sdk wheel
        ↓
sync-teamver-vendor.sh (ns-open-design)
  vendor/teamver/app-sdk.tgz
  vendor/teamver/python/teamver_app_sdk-*.whl
  vendor/teamver/manifest.json
        ↓
pnpm install / docker build  ← tarball·wheel 을 “패키지처럼” install
        ↓
Next build / Python image    ← 런타임에는 번들·wheel만 남음
```

`apps/web/package.json`:

```json
"@teamver/app-sdk": "file:../../vendor/teamver/app-sdk.tgz"
```

이것은 **npm/pnpm이 공식 지원하는 local tarball install** 이다. registry install 과 달리 **빌드 산출물**만 참조한다.

---

## 2. 빌드 시점 vs 런타임

| 단계 | `@teamver/app-sdk` | `teamver-app-sdk` | EC2에서 실행? |
|------|-------------------|-------------------|---------------|
| vendor sync | tgz 생성 | whl 생성 | ❌ (개발 PC 또는 CI) |
| `pnpm install` | node_modules에 unpack | — | build 시만 |
| `pnpm build` (OD web) | JS 번들에 포함 | — | build 시만 |
| `docker build` (design-api) | — | wheel pip install | build 시만 |
| **컨테이너 기동** | 정적 `apps/web/out` | 이미지内 Python | ✅ **sync 없음** |

브라우저·design-api는 **이미 만들어진 아티팩트**만 serving 한다.

---

## 3. ECR 없이 EC2 배포 (Docs/Slides 동형)

Design compose 는 기본적으로 **EC2에서 이미지를 build** 한다 (`deploy/teamver/docker-compose.yml`).

```text
[권장 — Production]
  개발/CI: sync-teamver-vendor.sh → vendor 커밋 → push
  EC2:     git pull
           bash deploy/teamver/scripts/run_docker.sh --production --vendor-check-only
           bash deploy/teamver/scripts/run_docker.sh --production [--rds]
           (docker compose build + up)

[Staging — platform clone 가능할 때]
  git pull (ns-open-design + ns-teamver-platform)
  bash scripts/sync-teamver-vendor.sh   # vendor 미커밋 시
  bash deploy/teamver/scripts/run_docker.sh --staging
```

`run_docker.sh` 는 vendor manifest/tarball/wheel 중 하나라도 없을 때 sync 를 **시도**하고, sync 후에도 누락이면 compose build 전에 실패한다. **Production 에서 platform 빌드에 의존하지 말 것** — vendor 를 repo 에 포함하는 쪽이 안전하다.

### 3.1 배포 옵션 비교

| 옵션 | EC2 준비 | prod 적합 | Teamver web 패치 |
|------|----------|-----------|------------------|
| **A. vendor git commit (권장)** | `ns-open-design` clone 만 | ✅ | ✅ |
| B. EC2에서 sync + build | platform + node + python | △ Staging | ✅ |
| C. `OPEN_DESIGN_IMAGE=vanjayak/open-design:latest` | compose pull | ✅ | ❌ upstream only |

---

## 4. vendor 갱신 (개발·릴리스)

```bash
# ns-open-design repo root
# 선행: ns-teamver-platform 형제 clone
bash scripts/sync-teamver-vendor.sh
pnpm install          # apps/web — preinstall 이 vendor 존재 확인
pnpm check:teamver-vendor
```

platform 스크립트 (직접 호출하지 않아도 sync 가 위임):

| 스크립트 | 역할 |
|----------|------|
| `ns-teamver-platform/scripts/build-ts-packages.sh` | `@teamver/app-sdk`, `@teamver/drive-ui` dist |
| `ns-teamver-platform/scripts/build-python-sdk.sh` | `teamver-app-sdk` wheel |
| `ns-teamver-platform/scripts/build-all.sh` | TS workspace 전체 + 안내 |

SDK 버전을 올릴 때: **sync → vendor·manifest 커밋 → EC2 git pull → run_docker.sh**.

EC2에서 build 전에 vendor만 확인:

```bash
bash deploy/teamver/scripts/run_docker.sh --production --vendor-check-only
```

---

## 5. git · .gitignore 정책

**현재 정책:** `.gitignore` 는 `vendor/teamver` 바이너리를 ignore 하지 않는다.
**정합 SSOT:** [10 §4.6](./10_세션·OD패치_보강.md) — **Option A (ignore 해제, 권장)** 채택 완료.

**Production EC2 (ECR 없음) 권장:**

- vendor 산출물을 **git에 커밋** → EC2는 clone/pull 만으로 build 가능
- `.gitignore`에서 `vendor/teamver/app-sdk.tgz`, `python/`, `manifest.json` ignore **제거 완료**
- 또는 **Option B:** `vendor/teamver/dist/` 서브트리만 commit, src는 ignore 유지

**커밋 대상 (Option A):**

```text
vendor/teamver/README.md      # 항상
vendor/teamver/manifest.json
vendor/teamver/app-sdk.tgz
vendor/teamver/python/teamver_app_sdk-*.whl
```

**개발 PC / CI:** `sync-teamver-vendor.sh` → commit → push. **EC2 런타임 sync 불필요.**

---

## 6. Docker · compose

Track A custom OD 이미지(Teamver embed UI) 빌드 시:

| 항목 | 상태 |
|------|------|
| `deploy/Dockerfile` 에 `COPY vendor/teamver` (pnpm install 전) | ✅ |
| `teamver-design-api` Dockerfile — vendored wheel | ✓ |
| `run_docker.sh` manifest/tgz/wheel preflight | ✅ |
| upstream `vanjayak/open-design` only | Teamver session/embed **미포함** |

design-api 만 custom build 해도 wheel 은 `vendor/teamver/python/` 에 있어야 한다.

---

## 7. 자동화 — 어디까지?

| 위치 | 자동화 | 판단 |
|------|--------|------|
| **개발 PC / CI** | `sync-teamver-vendor.sh` | ✅ 해야 함 (SDK 변경 누락 방지) |
| **EC2 런타임** | sync·pnpm | ❌ 하지 않음 |
| **EC2 배포** | `git pull` + `run_docker.sh` | ✅ Docs 동형 |
| **private registry** | ECR/GHCR image push | 중기 — 지금 필수 아님 |
| **npm registry** | `publish-npm.sh` | 중기 |

---

## 8. 체크리스트

### 개발자 (최초)

```text
[ ] ns-teamver-platform 형제 clone
[ ] bash scripts/sync-teamver-vendor.sh
[ ] pnpm install
[ ] apps/web dev — Teamver embed 동작
```

### 릴리스 (ECR 없음)

```text
[x] SDK vendor commit + Docker build context 정합
[ ] EC2: run_docker.sh --production --vendor-check-only
[ ] SDK 변경 시 sync + vendor 커밋
[ ] deploy/teamver/.env.* 서버 값 갱신
[ ] EC2: git pull
[ ] bash deploy/teamver/scripts/run_docker.sh --production [--rds]
[ ] curl https://design.teamver.com/_nginx/health
[ ] curl https://design-api.teamver.com/api/healthz (nginx 경유)
```

---

## 9. FAQ

**Q. `file:...tgz` 가 이상하지 않나?**  
A. private tarball install 은 pnpm/npm 표준이다. registry 대신 **빌드된 패키지 파일**을 가리킬 뿐이다.

**Q. EC2마다 sync 스크립트를 돌려야 하나?**  
A. **아니요.** vendor 를 git에 포함하거나, CI에서 sync 후 코드만 배포한다. 런타임 sync 는 Staging 임시용.

**Q. ECR 도입하면?**  
A. CI에서 image build·push → EC2는 `docker compose pull` 만. vendor 는 **이미지 build 시** Dockerfile COPY 로 처리.

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-18 | `run_docker.sh` vendor preflight 강화 — manifest/tgz/wheel 전체 확인, `--vendor-check-only` 운영 옵션 추가 |
| 2026-06-18 | vendor commit/Docker COPY 완료 상태 반영 — `vendor/teamver` 산출물 추적, `deploy/Dockerfile` pnpm install 전 COPY, design-api wheel install 정합 |
| 2026-06-15 | `.gitignore` vs git commit 정합 — [10 §4.6](./10_세션·OD패치_보강.md) cross-link |
| 2026-06-15 | 초안 — vendor·ECR 없는 EC2 배포·자동화 정책 |
