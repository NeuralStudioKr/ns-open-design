# Usage · DB · S3 동작 점검 (loop 412)

**일자:** 2026-06-26  
**범위:** Drive Publish 제외 — 사용량 기록(FE→daemon→design-api→DB), 프로젝트/메타 DB 저장, S3 sync·격리·Litestream  
**SSOT:** [11 Usage·Drive Publish](./11_Usage·Drive_Publish_보강.md) · [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md) · [24 usage capture 경로](./24_AI_API_usage_capture_경로별_분석.md)

---

## 한 줄 결론

> **코드·단위·fixture 경로는 usage / DB / S3 모두 green.**  
> staging EC2 **`--e2e-strict` 전체 E2E**와 **Litestream restore drill**만 ops blocker로 남음 (09 §14와 동일).

---

## 1. 사용량 기록 (Usage)

### 1.1 경로 요약

| 구간 | 진입점 | 수신 | 멱등 |
|------|--------|------|------|
| FE (embed BYOK) | `maybeReportTeamverUsageAfterSave` → `reportUsage.ts` | design BFF `POST /usage/events` → design-api | FE `reportedRunIds` + BE `(workspace_id, run_id)` upsert |
| daemon (hosted run) | `reportTeamverUsageFromDaemon` (`teamver-usage-bridge.ts`) | `POST /api/internal/usage/events` | daemon `reportedRuns` Set + BE upsert |
| billing finalize | `finalizeTeamverUsageBillingFromDaemon` | `POST /api/internal/usage/billing-finalize` | run 단위 patch |

관측 마커: `teamver_usage_5xx` (drop/retry), `teamver_usage_zero_tokens` (0-token 회귀 조기 경보).

### 1.2 테스트 (2026-06-26 로컬)

| Suite | 결과 |
|-------|------|
| `apps/web/tests/teamver-usage-report.test.ts` | **19 passed** |
| `apps/web/tests/teamver-report-usage.test.ts` | **5 passed** |
| `apps/web/tests/providers/anthropic-usage-capture.test.ts` | **9 passed** |
| `apps/daemon/tests/teamver-usage-bridge.test.ts` | **9 passed** |
| `apps/daemon/tests/proxy-routes.test.ts` (`-t usage`) | **9 passed** |
| `deploy/teamver/be/tests/test_internal_usage.py` | **included** |
| `test_token_usage_crud.py` · `test_token_usage_log.py` · `test_usage_report.py` | **16 passed** |
| `test_credit_meter.py` | **4 passed** |

**합계 (usage 관련):** web 33 · daemon 18 · design-api pytest 20 — **71 passed, 0 failed**

### 1.3 발견·조치

| 이슈 | 심각도 | 상태 |
|------|--------|------|
| `proxy-routes` usage SSE — `sanitizeLeakedAgentProse is not a function` | P1 (테스트 환경) | ✅ **원인:** `@open-design/contracts` `dist/` 미빌드. `pnpm --filter @open-design/contracts build` 후 green. `scripts/postinstall.mjs`가 `packages/contracts`를 기본 빌드 대상에 포함 — 정상 `pnpm install` 후 재현 안 됨. |
| design-api pytest — `fastapi` 미설치 | 환경 | ✅ `pip3 install --user -r requirements.txt` 후 20 passed. CI/EC2는 compose 이미지 사용. |
| EC2 U-6 usage row E2E | ops | ☐ `run_staging_track_a_e2e.sh` / `--e2e-strict` (09 §14, 04 O-3) |

---

## 2. DB 저장

### 2.1 저장 대상

| 데이터 | 위치 | 내구성 |
|--------|------|--------|
| 채팅·OD 로컬 메타 | `<OD_DATA_DIR>/app.sqlite` | Litestream → S3 `litestream/` |
| design-api registry | RDS Postgres | managed |
| usage ledger | `ai_model_token_usages` (RDS) | async insert via `token_usage_log.py` |
| 프로젝트 registry 메타 | design-api + daemon project row | hybrid |

### 2.2 테스트

| Suite | 결과 |
|-------|------|
| `apps/daemon/tests/storage-db-verify.test.ts` | **passed** |
| `apps/daemon/tests/storage-db-inspect.test.ts` | **passed** |
| `apps/daemon/tests/project-storage-startup.test.ts` | **passed** (batch) |
| `apps/daemon/tests/materializing-project-storage.test.ts` | **passed** (batch) |
| `apps/daemon/tests/scratch-idle-eviction.test.ts` | **passed** (batch) |

storage/startup batch (5 files): **48 passed**

### 2.3 ops fixture

| Script | 결과 |
|--------|------|
| `test_verify_litestream_replica.sh` | ✅ bucket mismatch · SKIP_S3_PROBE co-location |
| `test_backup_sqlite_to_s3.sh` | ✅ (이전 loop에서 fixture green 유지) |

**미실행 (ops):** `restore_app_sqlite_from_s3.sh` **live restore drill** — runbook·dry-run fixture만 ✅ (09 P2-2).

---

## 3. S3 업로드·격리

### 3.1 경로

| 유형 | 메커니즘 | 검증 |
|------|----------|------|
| 프로젝트 파일 SSOT | `OD_PROJECT_STORAGE=s3` + daemon S3 backend | `teamver-project-storage-meta` · health `checks.od_storage` |
| sync-up (run 후) | daemon project storage sync | `od_s3_sync_up` marker · `/api/health/storage` |
| sync-down (run 전) | lazy materialize | `od_s3_sync_down` marker |
| tenant 격리 | workspace/user/project prefix | `check_storage_isolation.sh` |

### 3.2 테스트

| Suite | 결과 |
|-------|------|
| `apps/daemon/tests/teamver-project-storage-meta.test.ts` | **14 passed** |
| `deploy/teamver/scripts/test_check_storage_isolation.sh` | ✅ 6 fixture cases |
| `test_smoke_design_storage_default.sh` | ✅ default-on SMOKE_REQUIRE_OD_STORAGE |
| `test_run_s3_integration_test.sh` | ✅ |

### 3.3 EC2 실증 (문서 09 기준, 이번 점검에서 재실행 안 함)

| 항목 | staging EC2 (2026-06-25) | 이번 로컬 |
|------|--------------------------|-----------|
| `checks.od_storage=ok` | ✅ | fixture only |
| Litestream snapshot/WAL 로그 | ✅ | fixture only |
| `--e2e-strict` Phase 9 | ☐ | N/A (ops) |
| strict `aws s3 ls` tenant probe | ☐ | N/A (ops) |

---

## 4. 무관 회귀 (참고)

전체 daemon suite (`pnpm --filter @open-design/daemon test`) 실행 시 `project-watchers.test.ts` chokidar 3건 `waitFor timeout` — usage/DB/S3와 무관한 기존 flaky. **집중 실행은 모두 green.**

---

## 5. 다음 ops 액션 (코드 변경 불필요)

1. staging EC2: `git pull` → `run_post_deploy_track_a.sh --staging --rds --smoke --e2e-strict`
2. Litestream: `restore_app_sqlite_from_s3.sh` live drill (09 §14 #2)
3. CloudWatch: `teamver_usage_5xx` · Litestream error alarm apply (미적용 시)

---

## 7. loop 413 코드 수정 (리뷰 후속)

| 이슈 | 수정 |
|------|------|
| FE dedupe on failed POST | `requestId` 수신 후에만 `rememberReportedRunId` |
| daemon dedupe before POST | 성공 후 `reportedRuns.add`; 5xx/timeout 1회 재시도 |
| billing commit without ledger | `usagePosted === false` 시 commit 스킵 |
| hosted double-post | FE skip when `message.runId` present |
| BYOK save failure drops usage | `saveMessage` usage 보고를 PUT 성공과 분리 |
| concurrent S3 sync-up data loss | `projectSyncFloorMs` + shared tenant remote |
| BE fire-and-forget write loss | `token_usage_log` background 1회 재시도 |
| zero-token false 5xx alarm | `teamver_usage_zero_tokens` 마커 분리 |

---

## 6. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-26 | loop 427 — billing estimate fail-fast + `TEAMVER_BILLING_RESERVE_AMOUNT` fallback |
| 2026-06-26 | loop 426 — scratch fallback health `reason=scratch_fallback` |
| 2026-06-26 | loop 425 — embed workspace session/store reconciliation (A-G3) |
| 2026-06-26 | loop 424 — billing reserve fail-fast, registry create/delete S3 strict 502, full sync remote orphan delete |
| 2026-06-26 | loop 419 — 2차 코드 리뷰 P1 (billing refund, lazy sync lock, access cache TTL, BYOK 401 recovery) |
| 2026-06-26 | loop 413 — 코드 리뷰 기반 P1 수정 (dedupe-on-success, billing gate, concurrent S3 sync floor) |
| 2026-06-26 | loop 412 — 로컬 usage/DB/S3 코드·테스트·fixture 점검 리포트 (Drive 제외) |
