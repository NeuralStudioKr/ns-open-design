# 57-1 — Docker 이미지 CI · ECR 배포 설계 (다음 단계)

**문서 번호:** 57-1  
**번호 이력:** 구 `52-1_Docker_…` → **57-1** (수동편집 위치이동 `52-x`와 충돌 해소, 2026-08-04)  
**상태:** 📝 설계만 (미구현)  
**선행:** [57-0 빌드 가속 현황](./57-0_Docker_배포_빌드_가속_현황.md) Phase 0  
**목적:** EC2에서 이미지를 **빌드하지 않고**, CI(또는 전용 빌더)에서 빌드·ECR push 후 EC2는 **pull + recreate**만 수행해 배포 wall time을 단축한다.  
**관련:** [08 vendor·배포 §3](./08_Teamver_SDK_vendor와_배포.md) · [39_4 rolling](./39_4_배포_Terraform_운영_Runbook.md) · [31 ALB·ChunkLoad](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md) · [07 인프라](./07_VM_배포_인프라.md)

---

## 0. 한 줄 결론

> **권장:** GitHub Actions(또는 기존 빌드 호스트)에서 `open-design-daemon`(+ 필요 시 design-api) 이미지를 빌드 → **AWS ECR** push → staging/prod EC2는 `OPEN_DESIGN_IMAGE=<ecr>@digest` pull 후 `compose up -d` (빌드 없음).  
> **ns-open-design는 ns_cicd 미등록** — Main FE/BE 파이프라인과 분리된 **Design 전용 이미지 파이프라인**으로 둔다.  
> Phase 0 캐시는 유지(로컬/비상 빌드용). ECR 경로가 SSOT가 되면 EC2 cold build는 예외 경로.

---

## 1. 문제 재정의 (Phase 0 이후에도 남는 것)

| 잔여 비용 | 설명 |
|-----------|------|
| Next build on EC2 | `COPY apps` 변경 시 typecheck+export가 EC2 CPU에서 반복 |
| 2노드 이중 빌드 | rolling 시 노드별 BuildKit 캐시 비공유 → 사실상 2× |
| 디스크 | 49G + BuildKit 캐시 누적 → ENOSPC 재발 |
| 재현성 | 노드 A/B 빌드 시각·캐시 상태로 미묘한 바이너리 차이 가능 ([31 ChunkLoad](./31_Design_Staging_vs_Production_네트워크_TLS_DNS.md#821-chunkloaderror--2노드-alb--빌드-revision-불일치-404)) |

**목표 SLA (초안):**

| 환경 | 목표 배포 wall time (코드 push → 트래픽 수신) |
|------|-----------------------------------------------|
| Staging | **≤ 3–5분** (이미지 pull+restart 중심; 빌드 제외) |
| Production | **≤ 5–8분** (rolling drain 포함) |

빌드 자체(CI)는 병렬·캐시로 5–12분 허용 — **사용자/운영자가 EC2에서 기다리지 않음**.

---

## 2. 현재 vs 목표 흐름

### 2.1 현재 (Phase 0)

```text
개발자 → git push staging
      → SSH EC2 × N
      → git pull + deploy.sh
      → docker compose build (BuildKit cache)   ← 병목
      → up -d
      → (rolling 시 노드 순차 반복)
```

### 2.2 목표 (Phase 1)

```text
개발자 → git push staging (또는 workflow_dispatch / tag)
      → CI: docker buildx (cache from ECR) → push :sha / :staging
      → 운영(또는 CD): rolling_deploy
            ALB drain → EC2: docker pull + compose up -d --no-build
            → health → register
```

`deploy.sh`는 **`--pull-only` / `DEPLOY_IMAGE_MODE=registry`** 분기 추가(설계). 로컬 emergency는 기존 build 경로 유지.

---

## 3. 이미지 · 레지스트리 계약

### 3.1 이미지 목록

| Compose service | Dockerfile | ECR 제안 리포지토리 | 비고 |
|-----------------|------------|---------------------|------|
| `open-design-daemon` | `deploy/Dockerfile` | `teamver/design-od` (가칭) | web out + daemon; Playwright 포함 |
| `teamver-design-api` | `deploy/teamver/be/Dockerfile` | `teamver/design-api` (가칭) | 가벼움 — 선택적으로 1단계에 포함 |
| `litestream` | upstream | 그대로 public/mirror | 빌드 대상 아님 |

`OPEN_DESIGN_IMAGE` env는 이미 compose에 존재 ([`.env.*.example`](../deploy/teamver/.env.staging.example)). Phase 1에서 기본값을 ECR URI로 전환.

### 3.2 태그 전략

| 태그 | 용도 |
|------|------|
| `sha-<full12>` | 불변 참조 · rollback · rolling 동일 revision 강제 |
| `staging` / `production` | 환경 최신 mutable (옵션; 운영은 **sha 고정 권장**) |
| `playwright-core@1.60.0` 레이어 | 이미지 안에 bake — 호스트 TOKEN과 무관 |

**ChunkLoad / HA:** 두 노드가 **동일 `sha-*` digest**를 쓰도록 rolling이 `IMAGE_DIGEST` 또는 `sha` 인자를 공유 ([39_4](./39_4_배포_Terraform_운영_Runbook.md)).

### 3.3 멀티 아키텍처

Staging/prod EC2는 **amd64**. CI는 `linux/amd64`만 빌드(초기). ARM 빌더는 범위 외.

### 3.4 Build cache in registry

```text
--cache-from type=registry,ref=…/design-od:buildcache
--cache-to   type=registry,ref=…/design-od:buildcache,mode=max
```

Phase 0의 로컬 cache mount와 병행 가능. CI가 SSOT가 되면 EC2 BuildKit 캐시 의존↓ → 디스크 압박↓.

---

## 4. CI / CD 배치 옵션 비교

| 방안 | 장점 | 단점 | 판정 |
|------|------|------|------|
| **A. GitHub Actions** (권장) | ns-open-design 리포와 근접 · buildx·ECR OIDC 표준 · ns_cicd 비의존 | Actions 분·시크릿·동시성 쿼터 | **1순위** |
| **B. 기존 ns_cicd 호스트 확장** | 사내 관례 | OD 미등록·정책·큐 혼선 · FE/BE와 블로킹 | 비권장(당분간) |
| **C. 전용 EC2 “builder” 1대** | 캐시 디스크 큼 · 네트워크 내부 | 운영  deb · SPOF · 이미지 배송은 여전히 필요 | A 보조(캐시 워머) |
| **D. 로컬 개발자 머신 push** | 간단 | 재현성·권한·실수 | 금지(prod) |

**권장 A 세부:**

- Trigger: `push` to `staging` (path filter: `apps/**`, `packages/**`, `deploy/Dockerfile`, lockfile) + `workflow_dispatch`
- Prod: `tag v*` 또는 `workflow_dispatch` + approval environment
- Permissions: `id-token: write` + ECR push (IAM role) — long-lived AWS key 지양
- Timeout: 30–40분 · fail on Playwright binary check (기존 Dockerfile FATAL 유지)

---

## 5. EC2 배포 모드 설계

### 5.1 env / 플래그 (초안)

| 변수 / 플래그 | 의미 |
|---------------|------|
| `OPEN_DESIGN_IMAGE` | ECR URI + tag 또는 digest |
| `DESIGN_API_IMAGE` | (추가 시) design-api ECR |
| `DEPLOY_IMAGE_MODE=build\|pull` | `build`=현행 · `pull`=registry |
| `deploy.sh --pull-only` | compose `pull` + `up -d --no-build` |
| `rolling_deploy.sh --image sha-…` | 전 노드 동일 이미지 |

### 5.2 pull 경로 의사코드

```bash
# EC2
export OPEN_DESIGN_IMAGE="123.dkr.ecr.ap-northeast-2.amazonaws.com/teamver/design-od:sha-abcd1234"
aws ecr get-login-password | docker login --username AWS --password-stdin …
docker compose --env-file .env.staging pull open-design-daemon
docker compose --env-file .env.staging up -d --no-build open-design-daemon teamver-design-api litestream
# health / smoke 기존과 동일
```

### 5.3 rolling과의 결합

1. CI가 `sha-X` push 완료 → 아티팩트/출력으로 digest 공개  
2. `rolling_deploy.sh --image sha-X`  
   - drain → pull(동일 digest) → up → health → register  
3. **git pull은 설정·nginx·env용으로 남을 수 있음** — 이미지 바이너리와 분리  
4. ChunkLoad: 두 노드 digest 불일치 시 중단(프리플라이트)

### 5.4 vendor (08)

ECR 경로에서도 **이미지 빌드 컨텍스트에 `vendor/teamver` COPY** (현 Dockerfile).  
EC2에서 `sync-teamver-vendor.sh` 런타임 실행 **불필요**. CI checkout에 vendor가 포함되거나 CI job이 sync 후 build.

---

## 6. IAM · 네트워크 · 시크릿

| 항목 | 설계 |
|------|------|
| CI → ECR | OIDC → role `teamver-design-ecr-push` (staging/prod 리포 분리 가능) |
| EC2 → ECR | Instance profile에 `ecr:GetAuthorizationToken` + `BatchGetImage` + `Pull` (기존 S3 프로필 확장) |
| Private subnet | ECR VPC endpoint 또는 NAT — pull 실패 시 배포 불가 → [18 IAM](./18_EC_IAM…) / TF에 endpoint 검토 |
| Bake args | `VITE_*` staging/prod는 **이미지 빌드 시 주입** → 환경별 이미지 또는 runtime config만 쓰는 필드 분리 필요 |

### 6.1 Bake-time vs runtime 설정

| 종류 | 예 | Phase 1 권장 |
|------|-----|--------------|
| Bake | `VITE_TEAMVER_EMBED`, site URL, draw flag | **환경별 이미지 태그** (`…:staging-sha` / `…:prod-sha`) 또는 build-arg matrix |
| Runtime | `OD_API_TOKEN`, S3, BFF secret, RDS | `.env` only — 이미지 공유 가능 |

잘못 bake하면 staging UI가 prod URL을 가리킴 → **matrix 2빌드** 또는 runtime-only로 이동 가능한 env는 점진 이전([runtime-config](./43_runtime_config_visibility_401.md) 계열).

---

## 7. Phase 쪼개기

| Phase | 내용 | 완료 조건 | 예상 공수 |
|-------|------|-----------|-----------|
| **0** | BuildKit·Playwright pin·prune ([57-0](./57-0_Docker_배포_빌드_가속_현황.md)) | ✅ | — |
| **1a** | ECR 리포 + TF/IAM + 수동 `docker buildx` push 1회 | staging EC2가 ECR pull로 기동 | 0.5–1d |
| **1b** | GHA workflow (staging push) + `deploy.sh --pull-only` | staging 일상 배포 = pull | 1–2d |
| **1c** | `rolling_deploy --image` + digest 프리플라이트 | 2노드 동일 digest | 0.5–1d |
| **1d** | design-api 이미지 ECR 동봉 | API도 EC2 build 제거 | 0.5d |
| **2** | Prod approval + tag 릴리스 · rollback runbook | prod SLA | 1d |
| **3** (옵션) | Daemon/web 이미지 분리 빌드 (daemon-only 변경 시 web 스킵) | CI 시간 추가 단축 | 1–2d |

**구현 착수 전 결정 포인트 (블로커):**

1. ECR 계정·리전·리포 이름 (devops TF 소유?)  
2. Staging bake URL (`stg-design` vs `design`) — matrix 여부  
3. CD 트리거: 자동(staging push) vs 수동 workflow_dispatch만  
4. ns_cicd와의 관계 — **명시적 비연동** 유지할지

---

## 8. 리스크 · 롤백

| 리스크 | 완화 |
|--------|------|
| ECR pull 실패 (권한·네트워크) | Instance profile 검증 스크립트 · 실패 시 `DEPLOY_IMAGE_MODE=build` fallback |
| 잘못된 bake (URL/flag) | 환경별 태그 · smoke ` /api/version` + embed smoke |
| Digest 불일치 (HA) | rolling 프리플라이트 실패로 중단 |
| CI 큐 적체 | path filter · concurrency group cancel-in-progress |
| 이미지 비대화 (Playwright) | 현 Dockerfile 유지 · 별도 export worker는 장기 |

**롤백:** 이전 `sha-*`로 `OPEN_DESIGN_IMAGE` 되돌린 뒤 pull+up. git revert와 독립적으로 **이미지 단위 롤백** 가능(장점).

---

## 9. 비범위 (이번 설계에서 하지 않음)

- ns_cicd에 `ns-open-design-staging` 등록  
- GHCR 단독 (ECR 권장 — AWS EC2·IAM과 정합)  
- Windows/ARM 이미지  
- Kaniko 등 비-buildx 런타임 (원하면 Phase 3 재검토)

---

## 10. 문서·코드 터치 예상 (구현 시)

| 영역 | 파일/위치 |
|------|-----------|
| CI | `.github/workflows/design-image-*.yml` (신규) |
| Deploy | `deploy.sh` pull 모드 · `rolling_deploy.sh --image` |
| Env example | `OPEN_DESIGN_IMAGE` ECR 주석 · `DEPLOY_IMAGE_MODE` |
| TF | ECR repo + CI role + EC2 pull policy (`ns-teamver-devops`) |
| Docs | 08 §3 “ECR 도입” 갱신 · 39_4 §10.12 → Phase 1 링크 · 본 문서 체크리스트 ✅ |

---

## 11. 구현 착수 체크리스트 (설계 승인 후)

- [ ] ECR 리포·IAM TF 초안 리뷰  
- [ ] Staging bake-arg matrix 결정  
- [ ] GHA workflow PR (dry-run push)  
- [ ] EC2 1대 pull-only 스모크  
- [ ] rolling + 2노드 digest 스모크  
- [ ] 08/39_4/00 문서 갱신 · Phase 0 fallback 유지 명시  

---

## 12. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-31 | 초안 — Phase 0 이후 CI/ECR 목표 흐름·태그·rolling·IAM·Phase 표 (구현 없음) |
