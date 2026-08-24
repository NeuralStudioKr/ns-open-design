# 57-0 — Design Docker 배포 빌드 가속 (현황 · 2026-07-31)

**문서 번호:** 57-0  
**번호 이력:** 구 `52-0_Docker_…` → **57-0** (수동편집 위치이동 `52-0`/`52-1`/`52-2`와 충돌 해소, 2026-08-04)  
**상태:** ✅ Phase 0 구현·staging push 완료 (`cbb2a5d48`)  
**목적:** EC2에서 `deploy.sh`로 이미지를 **매번 cold 빌드**하던 경로를 줄여, 반복 배포 체감을 낮춘다.  
**관련:** [39_4 §10.12](./39_4_배포_Terraform_운영_Runbook.md#1012-docker-빌드-가속--디스크) · [07 VM 배포](./07_VM_배포_인프라.md) · [08 vendor·배포](./08_Teamver_SDK_vendor와_배포.md) · **다음 단계 설계:** [57-1 CI·ECR 이미지 배포](./57-1_Docker_이미지_CI_ECR_배포_설계.md)

---

## 0. 한 줄 요약

> **원인:** EC2 로컬에서 `pnpm install` + Next typecheck + Playwright Chromium을 거의 매 배포마다 다시 돌림.  
> **Phase 0:** BuildKit 캐시 마운트 + Playwright 핀 + 디스크 prune 가이드로 **같은 머신·캐시가 살아 있을 때** 재빌드를 줄인다.  
> **체감 상한:** apps 변경 시 Next 빌드는 여전히 EC2에서 돈다 → 근본 단축은 [57-1](./57-1_Docker_이미지_CI_ECR_배포_설계.md).

---

## 1. 배경 · 증상

| 증상 | 관측 |
|------|------|
| 배포 10분+ | staging EC2 `docker compose build` — Next compile ~45s + typecheck ~60s + install |
| `ERR_PNPM_ENOSPC` | root 디스크 ~49G, BuildKit/containerd 캐시·중간 레이어로 가득 → install 실패·재시도 |
| 매 커밋 Playwright 재다운로드 | `PLAYWRIGHT_INSTALL_TOKEN=$(git rev-parse --short HEAD)` 로 Chromium 레이어 강제 무효화 |
| HA 2노드 | 노드마다 각각 빌드하면 체감 ×2 ([39_4 rolling](./39_4_배포_Terraform_운영_Runbook.md)) |

기존 정책([08](./08_Teamver_SDK_vendor와_배포.md)): EC2에서 git pull + compose build (ECR 미사용). 품질·단순성은 유지하되 **빌드 비용이 반복 배포에 너무 큼**.

---

## 2. Phase 0 변경 목록 (코드)

| 파일 | 변경 |
|------|------|
| `deploy/Dockerfile` | `# syntax=docker/dockerfile:1.7` · `RUN --mount=type=cache` (pnpm store / pnpm cache / `.next/cache`) · 빌드 후 store wipe 제거 · **`OD_SKIP_NEXT_TYPECHECK=1`** |
| `apps/web/next.config.ts` | Docker에서만 Next post-compile typecheck 스킵 (`ignoreBuildErrors`) |
| `deploy/teamver/deploy.sh` | `DOCKER_BUILDKIT=1` · `COMPOSE_DOCKER_CLI_BUILD=1` · Playwright 토큰 기본값 `playwright-core@1.60.0` (git SHA 제거) · help/팁 |
| `deploy/teamver/docker-compose.yml` | `PLAYWRIGHT_INSTALL_TOKEN` 기본값·주석 정합 |
| `deploy/teamver/scripts/prune_docker_build_disk.sh` | BuildKit `until=168h` prune + dangling image (캐시 전면 삭제 아님) |
| `docs-teamver/39_4` §10.12 | 운영 요약 |
| `docs-teamver/00` | 누적 항목 |

### 2.1 Dockerfile 캐시 마운트

```text
pnpm install  →  mount id=od-pnpm-store, od-pnpm-cache
pnpm … build  →  위 + id=od-next-cache → /app/apps/web/.next/cache
```

- lockfile/`package.json`만 같으면 install 레이어·스토어 히트가 가능.
- `COPY apps` 이후에도 Next **webpack/turbopack cache**가 마운트에 남아 incremental에 유리.
- 이미지 레이어에는 store를 넣지 않음(마운트는 호스트 BuildKit 쪽).

### 2.2 Playwright 핀

| Before | After |
|--------|--------|
| 매 deploy `TOKEN=git SHA` → Chromium RUN 항상 miss | `TOKEN=playwright-core@1.60.0` (Dockerfile `npx` 핀과 동일) |
| 강제 재설치 | `PLAYWRIGHT_INSTALL_TOKEN=force-$(date +%s) ./deploy.sh --staging` |

핀 버전을 올릴 때: Dockerfile `playwright-core@X` **와** deploy.sh/compose 기본 TOKEN을 **같이** 올린다.

### 2.3 운영 규칙

| 규칙 | 이유 |
|------|------|
| 평소 **`--no-cache` 금지** | 캐시 전면 무효 → cold build |
| 배포 전 `df -h` | Use% 높으면 ENOSPC로 install 실패 |
| 디스크 압박 시 `prune_docker_build_disk.sh` | 최근 캐시 유지 |
| `docker builder prune -af` / `system prune -a` | **최후 수단** — 다음 빌드 cold |

---

## 3. 기대 효과 · 한계

### 3.1 기대 (캐시 warm, 같은 EC2)

| 구간 | cold (대략) | warm (목표) |
|------|-------------|-------------|
| `pnpm install` | 1–3분 + 네트워크 | 수 초~수십 초 (레이어/스토어 hit) |
| Playwright Chromium | 수 분 | **스킵** (핀 불변) |
| Next build+typecheck | 2–3분 | compile만 (~45s); **typecheck는 Docker에서 스킵** (`OD_SKIP_NEXT_TYPECHECK`) |
| design-api | 상대적 짧음 | 변화 적음 |

### 3.2 한계 (Phase 0로 안 없어지는 것)

1. **apps/ 소스 변경 → `COPY apps` 이후 RUN은 재실행** — Next typecheck 포함.
2. **노드마다 BuildKit 캐시가 따로** — rolling 시 node2는 첫 배포가 다시 cold에 가깝다.
3. **49G 루트 디스크** — 캐시를 쌓으면 다시 ENOSPC 위험 → prune 습관 필요.
4. **ns-open-design는 ns_cicd 미등록** — FE/BE처럼 “push만 하면 빌드 서버”가 아직 없음.

→ 근본 해결 설계: [57-1](./57-1_Docker_이미지_CI_ECR_배포_설계.md).

---

## 4. 검증 체크리스트

- [ ] staging EC2: `git pull` 후 `DOCKER_BUILDKIT=1` 로그에 cache mount 사용
- [ ] 동일 SHA 재배포: Playwright 레이어 `CACHED`
- [ ] apps만 바꾼 재배포: install `CACHED`, build 재실행, 이전 대비 wall time 감소
- [ ] `df -h` Use% 안정 / ENOSPC 없음
- [ ] PDF export smoke (Chromium 경로) — 핀 변경 없을 때 회귀 없음
- [ ] `--no-cache` **미사용**으로 일상 배포

---

## 5. 롤백

| 항목 | 방법 |
|------|------|
| Dockerfile/cache mount | 이전 commit revert (`cbb2a5d48` 이전) |
| Playwright 강제 재설치만 | `PLAYWRIGHT_INSTALL_TOKEN=force-…` (코드 롤백 불필요) |
| 캐시 오염 의 | `docker builder prune -af` 후 1회 cold build |

---

## 6. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-31 | Phase 0 문서화 · 구현 `cbb2a5d48` · 다음 단계 → 57-1 |
