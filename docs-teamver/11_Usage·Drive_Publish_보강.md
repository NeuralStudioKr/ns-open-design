# Design — Usage·Billing · Drive Publish 보강

**Track A usage 집계(Phase 1)와 Drive Publish(Phase 4) 설계 SSOT.** usage wiring과 Drive Publish v1 코드는 들어갔고, Drive 대상 선택 1차 UX까지 연결됐다. 남은 출시 전 검증은 staging E2E 및 전체 폴더 브라우저 수준의 Drive picker 고도화이다.

**개발 SSOT:** 본 문서 · [04 구현 우선순위](./04_구현_우선순위.md) · **진행 갱신:** [00 구현 내역](./00_구현_내역_누적.md)

**관련:** [03 키·Drive·DB](./03_키_저장소_Drive_DB.md) · [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md) · [10 세션·OD패치](./10_세션·OD패치_보강.md) · [22 Drive·인증·Usage 연동 검토](./22_Drive_인증_Usage_연동_검토.md) · [06 Docs/Slides형 연동](./06_Docs슬라이드형_연동.md)

---

## 한 줄 결론

> **Usage Phase 1은 FE-first(saveMessage 종료 hook)로 wiring하고, Drive Publish v1은 HTML+ZIP만 지원한다.**  
> Registry reserve/commit **골격**은 daemon run-path에 연결됨(Phase 2a). **실측 토큰 → 크레딧(T) 환산·정확 차감**은 미구현 — 후속 SSOT는 **§4**. production은 registry credentials가 없으면 기동/배포를 차단하고, staging은 `TEAMVER_BILLING_DISABLED=1`을 명시한 경우만 임시 비활성을 허용한다.

---

## 1. As-Is vs To-Be

| # | 영역 | As-Is | To-Be | 우선 | 상태 |
|---|------|-------|-------|------|------|
| U1 | usage 이벤트 생산 | BE ✅, 호출 주체 없음 | FE `saveMessage` hook | **P0** | ✅ |
| U2 | 멱등성 | 중복 INSERT | `(workspace_id, run_id)` unique | **P0** | ✅ |
| U3 | token attribution | daemon만 | message.events `usage` | **P0** | ✅ |
| U4 | 에러 가시성 | 항상 204 | 202 + request id | **P1** | ✅ |
| U5 | Main BE design M2M | slides/meetings/startup만 | `app=design` by-model | **P0** | ✅ |
| U6 | Registry billing | reserve/commit **골격** (flat `TEAMVER_BILLING_RESERVE_AMOUNT`) | 실측 토큰 → 크레딧(T) 환산 후 reserve/commit | **P0** | 🟡 골격 ✅ · metered ☐ — **§4** |
| U7 | usage 5xx 알람 | 없음 | CW `teamver_usage_5xx` log metric + alarm | **P1** | ✅ |
| D1 | Drive Publish | `POST /projects/{id}/publish` ✅ | HTML/ZIP publish + history | **G7** | ✅ |
| D2 | design_outputs DDL | `design_projects` FK + Drive ids ✅ | `drive_shared_drive_id` 포함 | **G7** | ✅ |
| D3 | export formats v1 | daemon HTML/ZIP ready, PDF 501 | HTML + ZIP only | **G7** | ✅ |
| D4 | Drive auth | user JWT → SDK presigned 3-step ✅ | design-api가 user token 위임 | **G7** | ✅ |
| D5 | Drive target UX | personal/team folder select 1차 ✅ | searchable Drive browser | **G7** | 🟡 |

**범례:** ✅ 완료 · 🟡 부분 · ☐ 미착수

---

## 2. 현재 상태 (근거 코드)

### 2.1 design-api BE (Phase 1 준비됨)

| 구성 | 경로 | 상태 |
|------|------|------|
| `POST /api/v1/usage/events` | `deploy/teamver/be/app/routers/usage_report.py` | ✅ 202 + `requestId` |
| `GET /api/token-usage/by-model` | `routers/token_usage.py` L17–33 | ✅ M2M |
| async log | `services/token_usage_log.py` L45–72 | ✅ fire-and-forget |
| DB | `ai_model_token_usages` | ✅ |
| FE helper | `maybeReportTeamverUsageAfterSave.ts` + `reportUsage.ts` | ✅ |
| FE in-memory 멱등 | `reportedRunIds` Set | ✅ |
| Phase 2 wrapper | `services/teamver_billing.py` L24–49 | 🟡 import 0 |
| Run lifecycle | `services/run_lifecycle.py` reserve/commit/refund | ✅ orchestrator + daemon bridge wiring + production registry credential 필수 |
| Internal billing M2M | `routers/internal_billing.py` `/api/internal/billing/{reserve,commit,refund}` | ✅ M2M endpoints + amount=0 skip + smoke probe (reserve/commit/refund 모두) |
| Daemon billing bridge | `apps/daemon/src/teamver-billing-bridge.ts` reserve→commit/refund | ✅ best-effort + amount=0/no-fallback skip + 구조화 `teamver_usage_5xx` JSON 마커 + `TEAMVER_BILLING_RESERVE_AMOUNT` / `TEAMVER_BILLING_TIMEOUT_MS` / `TEAMVER_BILLING_DISABLED` env knobs |
| CW usage 5xx marker | `token_usage_log.py` + `print_cloudwatch_alarm_commands.sh` | ✅ |

**UsageEventBody** (`usage_report.py`):

```python
class UsageEventBody(BaseModel):
    workspace_id: str
    model_name: str
    input_tokens: int = 0
    output_tokens: int = 0
    operation: str = "design_run"
    project_id: Optional[str] = None
    run_id: Optional[str] = None
```

**Accepted response (U4):**

```json
{ "accepted": true, "requestId": "UREQ-..." }
```

인증: user JWT + `X-Workspace-Id` + workspace 일치 검증.

### 2.1.1 Provider 토큰 vs Teamver 크레딧 (구분 필수)

| 저장 위치 | `input_tokens` / `output_tokens` | `registry_usage_id` · `billing_status` · `credits_committed` |
|-----------|----------------------------------|--------------------------------------------------------------|
| **의미** | **모델 API 제공사** usage (Claude `input_tokens`·`output_tokens`, OpenAI `prompt_tokens`·`completion_tokens` 등) | **Teamver Registry** 예약·확정·환불 스냅샷 (플랫폼 과금 단위, Main BE `credit_balance`와 연동) |
| **수집** | daemon `scanRunEventsForUsageAnalytics` · BYOK proxy SSE `event: usage` · FE `message.events` | run 시작 `reserve` → 종료 `commit`/`refund` (daemon `teamver-billing-bridge`) |
| **같은 숫자?** | **아님** — ledger의 토큰 열은 upstream LLM 토큰. 크레딧(T)은 `amount`·단가표·마진으로 별도 산정 (Main BE `104_사용량_단가_과금_테이블_및_차감_구조.md` §1). |

`token_count_source`: `provider_usage` = 제공사가 emit한 non-zero counts · `unknown` = plain stdout 등 usage 미수집.

### 2.2 daemon run-end (Teamver usage + billing bridge)

| 훅 | 경로 | Teamver |
|----|------|---------|
| `reportTeamverUsageFromDaemon` | `apps/daemon/src/server.ts` (finalize reporter) | ✅ M2M `/api/internal/usage/events` |
| Registry billing commit/refund | `server.ts` + `teamver-billing-bridge.ts` | ✅ `teamverBillingUsageId` lifecycle |
| FE-first usage (authoritative workspace) | `maybeReportTeamverUsageAfterSave.ts` | ✅ user JWT `/usage/events` + active `X-Workspace-Id` |
| Daemon run identity | `readTeamverIdentityFromRequest` + nginx `$teamver_daemon_workspace_id` | ✅ FE `X-Workspace-Id` → run `teamverIdentity.workspaceId` (loop 354) |

**트리거 조건:** `saved.runStatus` ∈ `{succeeded, failed, canceled}` + `body.telemetryFinalized === true`

**loop 373 (0-token 수정):** FE는 `message.events`의 non-zero `usage` + `telemetryFinalized`가 모두 필요. gap — (1) BYOK top-level `event: usage` SSE 미적재, (2) daemon top-level usage 미-persist, (3) Claude `result.stats`만 있을 때 null usage, (4) trailing 0-token usage가 scan/report 덮어씀, (5) auto-open 중복 시 `telemetryFinalized` 미저장.

**loop 374 (audit 컬럼):** `ai_model_token_usages`에 `created_at`·`updated_at` 추가. `used_at`≠audit — upsert·billing finalize는 `updated_at` 갱신. `design_outputs`에 `updated_at` 추가.

**loop 375 (BYOK run_id):** embed BYOK(`mode=api`)는 daemon `runId` 없음 → FE usage report 시 `assistantMessage.id`를 `run_id`로 사용해 `(workspace_id, run_id)` upsert 멱등. 후속 과금 SSOT는 **§4**.

**loop 380 (ledger 정합성 + 관측 보강 — 실측 과금 전 P0):**

| 영역 | 변경 |
|------|------|
| BE `_apply_billing_fields` | `_BILLING_STATUS_PRIORITY` precedence — `committed=5 > refunded=4 > commit_failed/refund_failed=3 > reserved=2 > disabled/not_configured/not_metered=1 > not_attempted=0`. 한 번 `committed`인 row는 frozen — FE 기본값 replay로 `not_attempted`·`credits_committed=False`·`registry_usage_id=None` 다운그레이드 차단. |
| BE `aupdate_usage_billing_by_run` | usage payload보다 finalize가 먼저 도착하면 0-token stub row insert(workspace/run/model/usage_id/status 보존) → 이후 provider usage가 토큰만 병합. |
| BE `aupsert_usage` | `uq_token_usage_workspace_run` race 시 `IntegrityError` catch → rollback → refetch → `_merge_into_existing`. `teamver_usage_5xx aupsert_usage integrity race` 마커. |
| BE `_apply_usage_fields` | replace path에서 `total_tokens=None` 입력이 들어와도 `input+output` 또는 기존 richer total 유지(credit_meter flat fallback 방지). |
| daemon `server.ts` finalize | `void reportTeamverUsageFromDaemon` + `void commit/refund/finalize` **병렬** fire를 제거하고 **usage report → commit/refund → billing-finalize** 직렬화. BE stub fallback과 이중 안전(§4.8). |
| web `reportUsage.ts` | usage POST 실패(non-retryable 또는 retry 실패) 시 `teamver_usage_5xx` 구조화 마커(`stage=usage.events_client_drop` / `usage.events_client_retry_drop`) — design-api fronting 로그·CW alarm filter가 FE drop을 인지. |
| web `maybeReportTeamverUsageAfterSave` | `reportedRunIds` Set 1024 cap + FIFO eviction. evict된 run은 한 번 더 보고되지만 BE `(workspace_id, run_id)` upsert가 권위 dedupe. |

**테스트:** BE `test_token_usage_crud` 9 case(downgrade 방지, finalize-before-usage stub, IntegrityError merge, total preserve/derive) · web `teamver-usage-report` 5 case(failed/canceled 보고, 1024 cap eviction) · web `teamver-report-usage` 2 case(drop marker) — 모두 통과.

**Workspace 정렬:** embed workspace switch 후 daemon run·usage·publish가 동일 workspace를 쓰려면 FE가 `/api/runs`에 `X-Workspace-Id`(active store)를 보내고, nginx가 session-check default보다 우선 적용한다.

### 2.4 보장되는 ledger 불변식 (loop 380)

후속 실측 과금(§4) 구현 시 아래 불변식을 전제할 수 있다.

1. **단일 row**: `(workspace_id, run_id)`별 정확히 1행. 두 writer가 동시에 insert하면 `IntegrityError` 후 병합(§2.2 loop 380).
2. **No-downgrade**: `billing_status` precedence는 단조증가만 허용. 한 번 `committed`인 row의 `credits_committed`/`registry_usage_id`는 frozen.
3. **No-finalize-drop**: Registry commit/refund가 먼저 도착해도 stub row를 만들어 finalize 결과를 보존 → 후속 usage payload가 토큰만 추가로 병합.
4. **총 토큰 보존**: replace path에서도 기존 richer `total_tokens`(Anthropic cache 포함)는 `derived = input+output`이 더 클 때만 갱신. 입력 누락(`total_tokens=None`)으로 nullify되지 않음.
5. **FE drop 관측**: FE usage POST 실패는 `teamver_usage_5xx` JSON 마커로 console에 남아 design-api fronting 로그/CW alarm filter가 인지 가능(BE 5xx 마커와 동일 스키마).
6. **순서 안전**: daemon은 `usage report → commit/refund → billing-finalize` 순서를 직렬화. 단, BE는 어떤 순서로 와도 정합성을 보장(2~3번 불변식이 우선).

### 2.3 Drive (Phase 4 — v1 코드 ✅, staging E2E ☐)

| 항목 | 상태 |
|------|------|
| design-api drive/publish 코드 | **0건** |
| daemon export (HTML inline) | `import-export-routes.ts` L572–713 ✅ |
| daemon export (ZIP archive) | `import-export-routes.ts` L413–474 ✅ |
| daemon export (manifest) | `import-export-routes.ts` L487–509 ✅ |
| daemon PDF | **501** hosted (`server.ts` L4742) |
| PPTX HTTP export | **없음** |
| SDK `upload_bytes_to_personal_drive` | Python `drive.py` L85–106, TS `drive.ts` L239–299 ✅ |
| Main BE Drive | user JWT only (`router/drive.py` L1877–1916) |

---

## 3. Usage Phase 1 — wiring

### 3.1 권장: FE-first (P0)

**이유:** `/usage/events`는 user JWT + `X-Workspace-Id` 필수. daemon은 workspace context 없음 → FE embed가 자연스러운 호출 주체.

**삽입 위치:** `apps/web/src/state/projects.ts` — `saveMessage()` 또는 `persistMessage` wrapper

```typescript
// pseudo — after successful PUT with telemetryFinalized
async function onMessageSaved(message: SavedMessage, opts: { telemetryFinalized?: boolean }) {
  if (!opts.telemetryFinalized) return;
  if (!TERMINAL_RUN_STATUSES.has(message.runStatus)) return;
  if (!isTeamverEmbedMode()) return;

  const usage = extractLatestUsageFromEvents(message.events);
  const modelName = extractModelNameFromEvents(message.events) ?? activeComposerModel;

  await reportTeamverDesignUsage({
    workspaceId: workspaceStore.activeWorkspaceId,
    modelName,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    projectId: message.projectId,
    runId: message.runId,
  });
}
```

**대안 삽입점:** `ProjectView.tsx` `persistMessage` wrapper (호출부 `:3898`, `:3564` 등) — `projects.ts` centralize가 유지보수에 유리.

### 3.2 token attribution (P0)

**daemon CLI runs (이미 구현):** `run-analytics-observability.ts` L116–275

- `event === 'agent' && data.type === 'usage'` → input/output tokens
- cache tokens (Anthropic/OpenAI) 분기
- `agent_reported_model`: status event `label === 'model'`

**embed API mode (loop 165):** managed BYOK 는 daemon `/api/proxy/*/stream` 경유. upstream usage 를 proxy SSE `usage` 로 전달 → `api-proxy.ts` `onUsage` → `ProjectView` `kind: 'usage'` events.

**FE 측:** `usageAttribution.ts`

- `extractLatestUsageFromEvents` — `kind === 'usage'`
- `extractModelNameFromEvents` — status `label` in `model` / `requesting` / `initializing`
- `resolveTeamverUsageModelName` — events → `pinnedExecutionConfig` (design-api `/runtime-config`) → `unknown`

**한계:** provider가 usage 미emit 시 0 tokens 허용 + `operation: design_run`. staging E2E: `S-8c` runtime-config + `U-6` usage row (loop 166).

### 3.3 멱등성 (P0)

**DB — `deploy/teamver/be/scripts/create_schema.sql` 추가:**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_token_usage_workspace_run
  ON ai_model_token_usages (workspace_id, run_id)
  WHERE run_id IS NOT NULL;
```

**CRUD — `services/token_usage_log.py`:**

```python
# INSERT ... ON CONFLICT (workspace_id, run_id) DO NOTHING
# 또는 conflict 시 UPDATE (last-write-wins)
```

**FE — in-memory dedup:**

```typescript
const reportedRuns = new Set<string>();  // module scope

export async function reportTeamverDesignUsage(params: UsageParams) {
  if (params.runId && reportedRuns.has(params.runId)) return;
  ...
  if (params.runId) reportedRuns.add(params.runId);
}
```

**선택:** localStorage persist (페이지 reload 후 중복 방지).

### 3.4 daemon dispatcher (대안 — Phase 2 게이트)

v1은 FE-first만. daemon 직결은 **M2M endpoint** 필요.

**신규 (Phase 2):** `apps/daemon/src/teamver-usage-bridge.ts`

```typescript
// mirror langfuse-bridge.ts pattern
export async function reportTeamverUsageFromDaemon({ db, run, workspaceId, userId }) {
  const { inputTokens, outputTokens, modelName } = scanRunEventsForUsageAnalytics(run.events);
  await fetch(`${DESIGN_API_INTERNAL}/usage/events`, {
    method: "POST",
    headers: {
      "X-Teamver-Internal-Api-Key": process.env.TEAMVER_INTERNAL_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workspace_id: workspaceId, user_id: userId, ... }),
  });
}
```

**삽입:** `createFinalizedMessageTelemetryReporter` (`server.ts` L3129) 인접 — Langfuse delivery 후 void call.

**전제:** design-api `POST /api/internal/usage/events` (M2M, user_id in body) + run create 시 workspace/user 헤더 전달.

### 3.5 에러 가시성 (P1)

| 현재 | 목표 |
|------|------|
| 항상 204 | 202 Accepted + `X-Request-Id` |
| async INSERT 실패 → logger만 | Phase 2: `dead_letter_token_usages` 테이블 |

**FE retry:** 5xx 시 1회 exponential backoff (500ms). 실패는 `console.warn` + 다음 session에서 piggy-back 불가 — ops alert.

### 3.6 reportUsage.ts 수정

`apps/web/src/teamver/reportUsage.ts`:

```typescript
export async function reportTeamverDesignUsage(params: UsageParams): Promise<void> {
  const client = getDesignBffClient();
  if (!client) return;

  await client.http.post("/usage/events", {
    workspace_id: params.workspaceId,
    model_name: params.modelName,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    operation: "design_run",
    project_id: params.projectId,
    run_id: params.runId,
  }, {
    headers: { "X-Workspace-Id": params.workspaceId },
    // skipAuthRecovery: false  — 10번 SSOT
  });
}
```

---

## 4. Phase 2 — Registry billing · 후속 실측 과금 SSOT

> **이 섹션은 후속 구현(토큰 → 크레딧 환산 · 정확 차감) 시 SSOT.**  
> Phase 1 usage ledger는 §3 · §2.1.1. Main BE Registry 계약은 `ns-teamver-be` `120_14` · `116_2` §0.3.

### 4.0 한 줄 결론

| 시점 | 상태 |
|------|------|
| **지금 (As-Is)** | Registry **reserve → commit/refund 골격** 동작. `amount`는 **앱이 정한 고정 크레딧(T)** (`TEAMVER_BILLING_RESERVE_AMOUNT` 폴백). fallback 미설정/비양수면 reserve는 **skip**되고 ledger `input_tokens`/`output_tokens`는 과금 계산에 미사용. |
| **목표 (To-Be)** | provider 실측 토큰 + 모델 단가 → **크레딧 T 환산** 후 reserve/commit. ledger·`registry_usage_id`·`billing_status`로 감사·정산 추적. |

---

### 4.1 As-Is — 지금 코드가 하는 일

#### 4.1.1 lifecycle (daemon CLI run)

```text
[run create — apps/daemon/src/server.ts ~L11844]
  reserveTeamverBillingFromDaemon({ amount: 0 })
    → TEAMVER_BILLING_RESERVE_AMOUNT 양수면 POST design-api /api/internal/billing/reserve
    → fallback 미설정/비양수면 billing_amount_not_configured skip
    → Main BE POST /api/billing/reserve { workspace_id, amount }
    → ai_app_billing_reservations (status=reserved) + usage_id
    → run.teamverBillingUsageId = usage_id

[agent 실행 … provider usage → run.events / message.events]

[run terminal — server.ts finalize reporter]
  1. reportTeamverUsageFromDaemon → POST /api/internal/usage/events
       → ai_model_token_usages upsert (provider tokens + billing snapshot)
  2. commitTeamverBillingFromDaemon | refundTeamverBillingFromDaemon
       → POST /api/internal/billing/{commit|refund}
  3. finalizeTeamverUsageBillingFromDaemon → POST /api/internal/usage/billing-finalize
       → ledger billing_status / credits_committed / registry_usage_id 갱신
```

#### 4.1.2 amount 산정 (현재)

| 입력 | 실제 동작 |
|------|-----------|
| daemon `reserve` body `amount` | 호출부가 **`0` 고정** (`server.ts` L11853) |
| `TEAMVER_BILLING_RESERVE_AMOUNT` | caller `amount==0` 일 때만 env 양수 정수 폴백. 미설정/비양수면 Registry 호출 없이 `billing_amount_not_configured` skip |
| provider `input_tokens`/`output_tokens` | **reserve/commit에 미반영** — ledger 기록만 |

#### 4.1.3 구현 파일 맵

| 레이어 | 경로 |
|--------|------|
| Registry 호출 (design-api) | `deploy/teamver/be/app/services/teamver_billing.py` → SDK `BillingClient` |
| orchestrator | `deploy/teamver/be/app/services/run_lifecycle.py` |
| M2M API | `deploy/teamver/be/app/routers/internal_billing.py` |
| daemon bridge | `apps/daemon/src/teamver-billing-bridge.ts` |
| usage ledger + billing snapshot | `deploy/teamver/be/app/db/crud/token_usage_crud.py` · `token_usage_log.py` |
| usage M2M | `deploy/teamver/be/app/routers/internal_usage.py` · `usage_report.py` |
| FE usage (ledger만) | `apps/web/src/teamver/maybeReportTeamverUsageAfterSave.ts` — **billing lifecycle 없음** |

#### 4.1.4 env · kill switch

```bash
TEAMVER_REGISTRY_APP_ID=...
TEAMVER_REGISTRY_KEY_ID=...
TEAMVER_REGISTRY_ACCESS_KEY=...
TEAMVER_BILLING_RESERVE_AMOUNT=100    # flat 크레딧 T (amount=0 폴백)
TEAMVER_BILLING_TIMEOUT_MS=5000
TEAMVER_BILLING_DISABLED=1            # staging 임시 OFF (production은 creds 필수)
```

---

### 4.2 To-Be — 실측 기반 크레딧 차감 목표

**원칙**

1. **ledger** (`ai_model_token_usages`) — provider upstream 토큰·모델명·`token_count_source` **감사·집계 SSOT** (§2.1.1).
2. **Registry** (`ai_app_billing_reservations`) — 워크스페이스 **크레딧(T) 잔액 차감** SSOT. `amount`는 **앱(Design)이 산출한 정수 크레딧**.
3. 두 숫자는 **자동 동일하지 않음**. 환산 모듈이 ledger 입력 → `amount_t`를 만든다.

**목표 공식 (후속)**

```text
amount_t = ceil(
  price_input_per_1k(model) * input_tokens_effective / 1000
+ price_output_per_1k(model) * output_tokens / 1000
+ optional_cache_surcharge(...)
)
```

- `input_tokens_effective`: Anthropic cache read/creation 포함 여부는 `run-analytics-observability`와 동일 정책으로 SSOT 통일.
- `token_count_source === 'unknown'` 또는 tokens==0: §4.5.1 정책 적용 (skip / flat minimum / refuse commit).

---

### 4.3 Main BE Registry API 제약 (후속 설계 필독)

근거: `ns-teamver-be/src/service/registry_billing_service.py` · `116_2` §0.3.

| API | body | 잔액 변화 | Design에 대한 함의 |
|-----|------|-----------|-------------------|
| `POST /api/billing/reserve` | `workspace_id`, **`amount`** (int > 0) | **없음** (가용 잔액만 검사) | **차감액은 reserve 시점에 확정** |
| `POST /api/billing/commit` | **`usage_id`만** | **−reserved amount** | commit 시 실측 토큰·단가 **전달 불가** |
| `POST /api/billing/refund` | `usage_id`, `reason` | **없음** | 예약 취소 |

**따라서** 문서에만 있던 “commit 시 실측 반영”은 **현 Registry API만으로는 불가**. 후속은 아래 전략 A/B/C 중 선택하거나 Main BE에 **metered commit / partial refund** API 협의(전략 C).

---

### 4.4 reserve 시점 전략 (후속 구현 시 택 1)

#### 전략 A — run 전 상한 예약 → commit 전액 (구현 단순, 과다 차감 위험)

```text
run start:
  estimate_t = credit_meter.estimate_upper_bound(model, context_hint)
  reserve(amount=estimate_t) → usage_id
run end (succeeded):
  scan provider tokens → ledger upsert
  commit(usage_id)   # estimate_t 전액 차감
```

- 상한: `DESIGN_BILLING_MAX_RESERVE_T` cap, 또는 `max(prompt_budget, TEAMVER_BILLING_RESERVE_AMOUNT)`.
- 실측 << 상한이면 **과다 차감** → 운영 정책 또는 전략 C 필요.

#### 전략 B — run 후 실측 산출 → reserve + 즉시 commit (실측에 가깝)

```text
run end (succeeded):
  scan provider tokens → amount_t = credit_meter.meter(...)
  if amount_t <= 0: refund 기존 예약 or skip
  else:
    reserve(amount=amount_t) → usage_id   # 사후 예약
    commit(usage_id)
    ledger upsert (+ registry_usage_id)
```

- run **중** 잔액 부족은 막을 수 없음 (사후 검사).
- 기존 run-start reserve 제거 또는 failed run용 최소 예약만 유지.

#### 전략 C — Main BE API 확장 (가장 정확, 플랫폼 작업)

- 예: `commit { usage_id, amount_t }` (amount_t ≤ reserved), 초과분 `refund` 또는 추가 `reserve`.
- Design은 ledger·환산 모듈만 구현하고 commit payload 확장에 맞춤.

**권장 (Track A 단계적):** staging은 **A + cap**으로 파이프 검증 → production 전 **B 또는 C**로 실측 정합.

---

### 4.5 `credit_meter` 모듈 (loop 405 구현)

**구현 파일:** `deploy/teamver/be/app/services/credit_meter.py` · env `DESIGN_MODEL_PRICES_JSON` · ledger `credits_amount_t` (audit only until U-G6 commit).

```python
@dataclass(frozen=True)
class MeteredCredits:
    amount_t: int
    input_tokens: int
    output_tokens: int
    model_name: str
    token_count_source: str  # provider_usage | unknown
    policy: str              # metered | flat_fallback | skipped

def meter_design_run(
    *,
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    token_count_source: str,
    cache_read_input_tokens: int | None = None,
    cache_creation_input_tokens: int | None = None,
) -> MeteredCredits: ...
```

**단가 소스 (우선순위 제안)**

1. design-api env `DESIGN_MODEL_PRICES_JSON` (모델별 input/output per-1k **크레딧 T**)
2. Main BE M2M `ai_model_pricing` 조회 (후속 — 캐시·환율·마진 SSOT는 Main BE `TokenService`와 정합)
3. 폴백: `TEAMVER_BILLING_RESERVE_AMOUNT` 또는 `token_cost_setting`의 `aiapp_design` 키

**`DESIGN_MODEL_PRICES_JSON` 예시**

```json
{
  "claude-sonnet-4-5": { "input_per_1k_t": 3, "output_per_1k_t": 15 },
  "gpt-4o": { "input_per_1k_t": 5, "output_per_1k_t": 20 }
}
```

#### 4.5.1 `token_count_source`별 과금 정책 (제안)

| `token_count_source` | tokens | 제안 |
|----------------------|--------|------|
| `provider_usage` | > 0 | `credit_meter.meter` → reserve/commit |
| `provider_usage` | 0 | flat minimum 또는 refund (운영 선택) |
| `unknown` | 0 | **commit skip** + ledger만 `billing_status=not_metered` |
| `unknown` | — | flat `TEAMVER_BILLING_RESERVE_AMOUNT` (현행에 가까움) |

---

### 4.6 ledger 스키마 — 과금 연동 필드

`ai_model_token_usages` (design-api RDS):

| 컬럼 | 과금 연동 역할 |
|------|----------------|
| `input_tokens` / `output_tokens` / `total_tokens` | **환산 입력** (provider upstream, §2.1.1) |
| `model_name` | 단가 테이블 키 |
| `token_count_source` | 실측 vs flat/skip 정책 분기 |
| `run_id` | `(workspace_id, run_id)` 멱등 · Registry row와 1:1 맞춤 |
| `registry_usage_id` | `ai_app_billing_reservations.usage_id` FK 논리 링크 |
| `billing_status` | `not_attempted` · `reserved` · `committed` · `refunded` · `commit_failed` · `not_metered` … |
| `credits_committed` | commit 성공 bool 스냅샷 |
| `used_at` | LLM 호출·집계 시각 (M2M by-model 필터) |
| `created_at` / `updated_at` | row·billing 갱신 감사 (loop 374) |

**upsert 규칙** (`token_usage_crud.aupsert_usage`):

- incoming non-zero tokens가 기존 0 row를 갱신. incoming 0은 기존 실측을 **덮어쓰지 않음**.
- billing snapshot은 precedence 기반으로만 전진한다: `not_attempted` < `reserved` < `commit_failed`/`refund_failed` < `refunded` < `committed`.
- `committed` row는 frozen: FE replay·daemon retry의 기본 `not_attempted` payload가 `registry_usage_id`·`credits_committed`를 지우지 못한다.
- billing-finalize가 usage upsert보다 먼저 오면 0-token stub row를 insert하고, 후속 provider usage가 토큰·모델명·`total_tokens`를 병합한다.

---

### 4.7 경로별 gap (후속 작업)

| 경로 | usage ledger | Registry billing | 후속 |
|------|--------------|------------------|------|
| **daemon CLI** (embed) | ✅ scan + M2M / FE-first (race-safe, §2.4) | ✅ reserve@start (flat), commit/refund@end (직렬화, §4.8) | amount를 `credit_meter`로 교체 (§4.4) |
| **embed BYOK** (`mode=api`) | ✅ daemon `reportByokTeamverUsageAndBillingFromDaemon` (message PUT, M2M) | ✅ `POST /api/internal/billing/finalize-byok-run` | **U-G11** ✅ — FE hook no-op, BFF deprecate 예정 (§4.11) |
| **standalone OD** | — | skip (no `TEAMVER_DESIGN_API_URL`) | — |
| **plain stdout agent** | `unknown` / 0 | flat reserve만 | usage 없으면 §4.5.1 정책 |

---

### 4.11 embed BYOK billing — FE 호출 vs daemon/BE (아키텍처 · 리스크 · 이전)

> **한 줄:** loop 430은 **동작하는 임시 wiring**이지만, embed 기본(`mode=api`)에서 과금·usage ledger가 **브라우저 `saveMessage` hook**에 묶여 있어 **페이지 이탈·탭 종료** 시 누락·지연 위험이 있다. **권장 종착점은 daemon `PUT …/messages/:id` + design-api M2M** (CLI run과 동일 계열).

#### 4.11.0 BYOK billing lifecycle (2026-06-29 보강)

`finalize_byok_run_billing()`가 강제하는 race-safe 상태 머신:

```
not_attempted → reserved → committed                (happy)
not_attempted → reserve_failed                      (Registry rejected)
not_attempted → reserved → commit_failed            (commit fail + refund OK)
not_attempted → reserved → refund_failed            (commit fail + refund fail → ops alert)
```

**멱등 / crash-resume 규약:**

| existing.billing_status | 재시도 동작 |
|-------------------------|------------|
| `committed` | 즉시 `idempotent=True` return (Registry 호출 없음) |
| `reserved` + `registry_usage_id` | **commit만 재시도** — reserve는 절대 다시 호출하지 않음 |
| `commit_failed` / `refund_failed` / `reserve_failed` | terminal, `idempotent=True` return (ops 수동 reconcile) |
| 없음 / `not_attempted` 등 | 정상 lifecycle 진입 |

**핵심 안전 장치:**

1. **reserve 성공 직후 `reserved` ledger stub persist** — crash 직후 재시도가 새로운 reserve를 발사하지 않도록 (이중 reserve = 이중 차감 방지).
2. **refund 실패는 `refund_failed`로 ledger 기록** — Registry stuck 상태(credits stuck reserved)를 CW alarm filter `metric:"teamver_usage_5xx"`로 감지.
3. **terminal failure는 절대 재시도하지 않음** — 같은 `(workspace_id, run_id)` 페어로 두 번 reserve가 가지 않음.

테스트: `tests/test_byok_billing.py` (BE 11건), `tests/test_token_usage_crud.py` (precedence 2건), `tests/teamver-byok-usage-bridge.test.ts` (daemon 9건).

#### 4.11.1 현재 구조 (loop 430)

| 단계 | 주체 | API / 저장소 |
|------|------|----------------|
| 1. LLM 호출 | FE → daemon proxy 또는 브라우저 SDK | `/api/proxy/*/stream`, `anthropic.ts` 직접 SDK 등 |
| 2. usage 수집 | FE `ProjectView` | `message.events`에 `kind:'usage'` push ([24](./24_AI_API_usage_capture_경로별_분석.md)) |
| 3. 메시지 저장 | FE `saveMessage` | daemon `PUT /api/projects/…/messages/:id` (`telemetryFinalized`) |
| 4. billing finalize | **FE** `maybeReportTeamverUsageAfterSave` | BFF `POST /api/v1/billing/finalize-byok-run` (cookie-auth) |
| 5. usage ledger | **FE** `reportTeamverDesignUsage` | BFF `POST /api/v1/usage/events` |
| 6. BE meter→commit | design-api `finalize_byok_run_billing` | Registry reserve → commit, ledger `committed` 멱등 |

**run_id SSOT:** embed BYOK는 daemon `runId`가 없으므로 **`run_id = assistant message.id`** (UUID). CLI embed run은 **`run_id = daemon run.id`** — FE hook은 `message.runId`가 있으면 **즉시 return** (이중 과금 방지).

**관련 코드**

| 역할 | 경로 |
|------|------|
| FE hook | `apps/web/src/teamver/maybeReportTeamverUsageAfterSave.ts` |
| FE billing client | `apps/web/src/teamver/teamverByokBilling.ts` |
| FE save 트리거 | `apps/web/src/state/projects.ts` → `saveMessage` |
| BE finalize SSOT | `deploy/teamver/be/app/services/byok_billing.py` |
| BFF endpoint | `deploy/teamver/be/app/routers/billing_report.py` → `/billing/finalize-byok-run` |
| CLI run 대비 | `apps/daemon/src/teamver-usage-bridge.ts` + `server.ts` finalize (M2M) |

#### 4.11.2 왜 FE에서 호출하도록 만들었는가 (역사)

loop 430(U-G6) 시점 제약:

1. **토큰 실측값**이 provider SSE / SDK `finalMessage.usage`에서 FE `message.events`로만 모였고, BYOK embed에 **daemon run lifecycle(`reserve@start`)이 없었음**.
2. **Strategy B** (post-run `meter → reserve → commit`)를 빠르게 붙이려면, 이미 있는 **`saveMessage` + cookie-auth BFF**가 가장 짧은 경로였음.
3. BE `finalize_byok_run_billing()` 로직 자체는 **서버 SSOT** — FE는 thin client.

즉 “과금 로직을 FE에 둔 것”이 아니라 **“과금 API를 브라우저가 호출하는 트리거”**만 FE에 있는 상태.

#### 4.11.3 페이지 이탈 · 백그라운드 run — **맞는 지적 (Gap)**

경로를 나눠야 한다.

| 실행 모드 | 페이지 이탈 시 작업 | 과금 트리거 | 페이지 이탈 후 과금 |
|-----------|---------------------|-------------|---------------------|
| **daemon CLI run** (`mode=daemon`, `runId` 있음) | SSE consumer만 detach, **daemon run은 계속** ([05 §백그라운드](./05_OD_UI_재사용_빠른출시.md)) | **daemon** M2M `internal/usage/events` + billing | ✅ 서버가 처리 |
| **embed BYOK** (`mode=api`, Teamver embed 기본 pin) | in-flight는 **브라우저 `fetch`/SDK stream** — `ProjectView` unmount 시 **abort로 proxy 요청 종료** | **FE** `maybeReportTeamverUsageAfterSave` | ⚠️ **취약** |

embed BYOK에서 FE 과금 hook이 **문제가 되는 경우**:

1. **탭 종료 / 크래시** — `telemetryFinalized` PUT 또는 BFF billing POST가 네트워크 완료 전에 끊기면 ledger·Registry commit 누락 가능.
2. **BFF 호출만 실패** — `saveMessage` PUT은 성공했는데 `finalize-byok-run` / `usage/events`만 drop → 메시지는 SQLite에 있으나 `billing_status=not_attempted` 잔존 ([26 §1.1](./26_Usage·DB·S3_동작_점검.md)).
3. **백그라운드 배너와의 혼동** — `App.tsx` run poll · `TeamverBackgroundRunsBanner`는 **`listProjectRuns()`(daemon run)** 기준. embed BYOK turn은 **`runId` 없음** → 배너에 “백그라운드 실행 중”으로 보이는 것과 BYOK in-flight는 **동일 개념이 아님**.

**현재 완화(부분):**

- `saveMessage`는 PUT 실패와 **usage/billing POST를 분리** (`void maybeReport…` — BYOK는 daemon fallback 없음).
- `pagehide` / `keepalive` PUT으로 **마지막 텍스트 chunk**는 daemon SQLite에 남기기 쉬움.
- BE `(workspace_id, run_id)` upsert + `committed` frozen — **재시도 시 이중 commit 방지**.

**완화로 부족한 것:** billing 트리거가 여전히 **브라우저 JS 실행**에 의존. **“작업은 서버/데몬에서 끝났는데 과금만 FE가 안 불렀다”** 는 ops·매출 gap.

#### 4.11.4 권장 종착: daemon-side finalize (BE 처리)

**가능하며, embed BYOK에 맞는 hook은 proxy stream 종료가 아니라 message PUT이다.**

```text
FE saveMessage
  → PUT /api/projects/:pid/conversations/:cid/messages/:mid  (telemetryFinalized, events, runStatus, runId 없음)
  → daemon server.ts (신규 BYOK finalize hook)
       1. readTeamverIdentityFromRequest (nginx X-Teamver-User-Id + X-Workspace-Id)
       2. message.events → usage 추출 (FE `extractLatestUsageFromEvents`와 동치 adapter)
       3. POST /api/internal/billing/finalize-byok-run  (신규 M2M, byok_billing 재사용)
       4. POST /api/internal/usage/events
  → FE maybeReportTeamverUsageAfterSave 제거 (feature flag 후)
```

**proxy `/api/proxy/*/stream` 종료 시점 finalize는 비권장**

- assistant `message.id`를 stream 시점에 모름.
- BYOK tool loop는 **한 turn에 stream 다회** — run 종료 ≠ stream `end`.
- `runStatus`(실패/취소)는 FE lifecycle에 있음.

**message PUT hook이 안전한 이유**

- CLI run finalize(`shouldReportRunCompletedFromMessage`)와 **동일한 “persisted terminal message”** 트리거.
- `keepalive` PUT 포함 — **탭이 닫혀도 daemon이 SQLite에 받은 뒤** server-side finalize 가능.
- nginx가 주입한 identity + M2M key — **cookie BFF 불필요**.

#### 4.11.5 이전 시 체크리스트 (문제 없이 가려면)

| # | 항목 | 비고 |
|---|------|------|
| 1 | `POST /api/internal/billing/finalize-byok-run` | ✅ `finalize_byok_run_billing()` 재사용 |
| 2 | daemon message events adapter | ✅ `chatMessageEventsToRunAnalyticsEvents` |
| 3 | feature flag | FE hook off — BYOK no-op (daemon authoritative) |
| 3b | **ledger committed stub before return** | Registry commit 성공 직후 `aupdate_usage_billing_by_run(committed)` — usage/events 실패·daemon 재시도 시 **이중 reserve/commit 방지** |
| 4 | design app disabled gate | FE snapshot 대신 BE/daemon workspace check |
| 5 | 0-token 경로 | capture fix([24](./24_AI_API_usage_capture_경로별_분석.md))와 독립 — daemon 이전만으로 0-token 해결 안 됨 |
| 6 | 관측 | `teamver_usage_5xx` stage를 daemon BYOK finalize로 통일 |

**롤아웃 순서 (§4.9에 추가 예정)**

```text
[x] 9. internal M2M finalize-byok-run endpoint (byok_billing SSOT 재사용)
[x] 10. daemon PUT message BYOK hook + unit tests
[ ] 11. staging: FE billing off → ledger committed 일치 E2E
[ ] 12. BFF /billing/finalize-byok-run deprecate (또는 admin-only)
```

#### 4.11.6 FAQ

**Q. BE에서 알아서 하면 되는 거 아닌가?**  
A. **맞다 — 종착은 BE+demon.** 다만 BYOK는 LLM 호출이 브라우zer/proxy에 있어 **“언제·몇 토큰·성공 여부”가 message row에 모인 뒤** BE가 meter해야 한다. 그 시점을 daemon PUT이 가장 정확히 잡는다.

**Q. 페이지 이탈해도 백그라운드 실행인데 FE 과금이면 깨지지 않나?**  
A. **daemon run**은 깨지지 않는다(이미 daemon billing). **embed BYOK(`mode=api`)** 는 in-flight가 브라우저에 묶여 있으나, **과금·usage는 daemon message PUT hook**이 authoritative — U-G11 구현 완료 (§4.11).

**Q. BFF `finalize-byok-run`을 당장 지워도 되나?**  
A. **아니오.** daemon hook이 authoritative이나, 레거시 클라이언트·staging E2E(§4.11.5 #11) 검증 전까지 BFF endpoint는 유지. deprecate는 후속.

**스트리밍 중간 PUT 빈도·아키텍처 SSOT:** [27_메시지_Persist_PUT_아키텍처.md](./27_메시지_Persist_PUT_아키텍처.md) — embed 기본 throttle 5s, terminal/pagehide 즉시 persist.

---

### 4.8 terminal hook 순서 · race

**현재(loop 380 이후):** `server.ts` finalize는 다음 순서로 **직렬화**됨.

```text
void (async () => {
  await reportTeamverUsageFromDaemon(...);           // 1) /api/internal/usage/events
  if (!usageId) return;
  if (succeeded) {
    const ok = await commitTeamverBillingFromDaemon(...);    // 2) Registry commit
    await finalizeTeamverUsageBillingFromDaemon(...);        // 3) /api/internal/usage/billing-finalize
  } else if (failed || canceled) {
    const ok = await refundTeamverBillingFromDaemon(...);
    await finalizeTeamverUsageBillingFromDaemon(...);
  }
})();
```

**BE-side 이중 안전 (loop 380):** 외부 호출자가 다른 순서로 보내거나 FE-first + daemon이 동시에 보내도 §2.4 불변식이 정합성을 보장한다 — finalize가 먼저 도착하면 stub row 생성, committed snapshot은 downgrade되지 않음, IntegrityError race는 merge.

**후속 metered 권장 순서 (succeeded)**

```text
1. scanRunEventsForUsageAnalytics(run.events)
2. amount_t = credit_meter.meter(...)
3. POST /api/internal/usage/events (tokens + registry_usage_id + billing_status=reserved)
4. POST /api/internal/billing/commit
5. POST /api/internal/usage/billing-finalize (committed)
```

실패 시: `commit_failed` / `refund` + ledger `billing_status` 반영. 단계별 `teamver_usage_5xx` stage 유지.

---

### 4.9 후속 구현 체크리스트 (권장 순서)

> **⏸ 2026-06-26 — 실제 크레딧 차감·Registry commit amount는 CTO 회의 후 착수.**  
> infra probe(loop 425–426)는 merge 가능 — `TEAMVER_BILLING_DISABLED=1` 기본 유지.

```text
[x] 0a. ledger race-safe merge: billing-finalize stub + no committed downgrade (loop 380)
[x] 0b. aupsert_usage IntegrityError → merge into surviving row (loop 380)
[x] 0c. _apply_usage_fields total_tokens 보존(replace path 미입력 시 derive/preserve, loop 380)
[x] 0d. daemon terminal hook 직렬화(usage → commit/refund → finalize, loop 380)
[x] 0e. FE drop 관측 — teamver_usage_5xx JSON 마커 + reportedRunIds 1024 cap (loop 380)
[x] 0f. amount=0/no-fallback reserve skip — Registry 0 amount 호출 차단 (loop 382)
[x] 1. credit_meter.py + DESIGN_MODEL_PRICES_JSON + unit tests (loop 405)
[ ] 2. §4.4 전략 확정 (A/B/C) — PM·Main BE 합의
[x] 3. daemon reserve: estimate-reserve endpoint + run-start lookup (loop 423 · Strategy A partial)
[x] 4. embed BYOK billing (U-G6) — message.id run 키 + post-run reserve/commit (FE-only hook + BFF finalize, loop 430)
[x] 4b. embed BYOK billing **daemon-side finalize** (U-G11) — message PUT hook + internal M2M, FE hook no-op (§4.11)
[ ] 5. billing_status=not_metered / flat_fallback 관측 + CW 대시보드
[ ] 6. staging E2E: reserve amount == metered (또는 cap) + commit + ledger row 일치
[ ] 7. (선택) Main BE metered commit API — 전략 C
[ ] 8. CW alarm filter — `metric:"teamver_usage_5xx" stage:usage.events_client_drop` (FE drop 누적)
```

**테스트 파일 (추가 제안)**

- `deploy/teamver/be/tests/test_credit_meter.py`
- `apps/daemon/tests/teamver-billing-metered.test.ts` (reserve amount assert)
- `apps/daemon/tests/teamver-byok-usage-bridge.test.ts` (BYOK message PUT finalize)
- E2E: `run_staging_track_a_e2e.sh` U-6 확장 — `billing_status`, `registry_usage_id` non-null

---

### 4.10 Admin · Registry key

Main BE Admin → Registry app `design` key 발급:

```bash
TEAMVER_REGISTRY_APP_ID=...
TEAMVER_REGISTRY_KEY_ID=...
TEAMVER_REGISTRY_ACCESS_KEY=...
```

Hosted guard: `deploy/teamver/be/app/config.py` — production은 registry creds 또는 `TEAMVER_BILLING_DISABLED` 명시 필수.

---

### 4.11 관련 문서 (Main BE · 플랫폼)

| 문서 | 내용 |
|------|------|
| `ns-teamver-be/docs/104_사용량_단가_과금_테이블_및_차감_구조.md` | upstream 토큰 vs 플랫폼 T vs USD |
| `ns-teamver-be/docs/116_2_AI_App_Registry_구현_점검.md` | Registry reserve amount = **앱이 정한 크레딧** |
| `ns-teamver-be/docs/120_14_I15_registry_billing_mvp.md` | reserve/commit/refund MVP |
| `ns-teamver-be/docs/118_워크스페이스_과금_크레딧_구현현황.md` | 잔액·차감 파이프라인 |

**주의:** Main BE 내장 앱(`POST /api/aiapps/{id}/run`)은 **성공 후 고정 단가** 차감. Design Registry 갈래는 **앱이 amount를 책임** — 토큰 자동 환산 없음 (`116_2` §0.1 #5).

---

### 4.12 (레거시) run_lifecycle pseudo — orchestrator는 이미 존재

`services/run_lifecycle.py`에 아래가 **이미 구현됨**. 후속은 caller가 `amount`를 `credit_meter` 결과로 넘기도록 변경.

```python
# reserve_run(workspace_id, amount, reason) → ReservationResult
# commit_run(usage_id) / refund_run(usage_id, reason)
```

---

## 5. Main BE design M2M (P0)

**문제:** Main BE `fetch_token_usage_by_model`에 `design` 앱 미등록.

**수정 — `ns-teamver-be` (Docs/Slides 패턴 복제):**

1. app config에 `TEAMVER_DESIGN_API_BASE_URL=https://design-api.teamver.com`
2. internal fetch registry에 `AppKey.DESIGN` 추가
3. M2M: `GET design-api/api/token-usage/by-model?user_id=&workspace_id=&from=&to=`
   - Header: `X-Teamver-Internal-Api-Key`

**검증:**

```bash
curl -H "X-Teamver-Internal-Api-Key: $KEY" \
  "https://design-api.teamver.com/api/token-usage/by-model?user_id=U&workspace_id=W&from=2026-06-01T00:00:00Z&to=2026-06-15T23:59:59Z"
```

---

## 6. Drive Publish (Phase 4 / G7)

**의존:** [09 Phase 3](./09_Design_저장소_격리_출시게이트.md) `design_projects` registry + access API.

### 6.1 v1 scope

| Format | v1 | 이유 |
|--------|-----|------|
| **HTML** | ✅ | daemon `GET .../export/{path}?inline=1` → bytes |
| **ZIP** | ✅ | daemon `GET .../archive` → buffer |
| PDF | ❌ Phase 4+ | hosted daemon **501** |
| PPTX | ❌ Phase 4+ | HTTP export route 없음 |

**권장:** manifest `entryFile` 또는 `artifacts[0].file` primary 1회 업로드 ([03 §4.2](./03_키_저장소_Drive_DB.md) 옵션 A).

### 6.2 daemon export 진입점

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/projects/:id/export/manifest` | JSON (entryFile, artifacts, files) |
| GET | `/api/projects/:id/export/*?inline=1` | `text/html` body |
| GET | `/api/projects/:id/archive` | `application/zip` buffer |

**design-api → daemon:** `OD_API_TOKEN` Bearer + nginx proxy (user JWT는 daemon에 전달하지 않음).

### 6.3 design_outputs DDL

Phase 3 `design_projects` 선행. **신규 migration:**

```sql
CREATE TABLE design_outputs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES design_projects(id),
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  od_project_id TEXT NOT NULL,

  drive_asset_id TEXT NOT NULL,
  drive_folder_id TEXT,
  drive_shared_drive_id TEXT,

  kind TEXT NOT NULL,           -- 'html' | 'zip' | 'pdf' | 'pptx'
  mime_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,

  source_path TEXT,
  manifest_entry_file TEXT,
  artifact_file TEXT,
  publish_status TEXT NOT NULL DEFAULT 'ready',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_design_outputs_project ON design_outputs (project_id, published_at DESC);
CREATE INDEX idx_design_outputs_drive_asset ON design_outputs (drive_asset_id);
CREATE INDEX idx_design_outputs_shared_drive ON design_outputs (drive_shared_drive_id, published_at DESC);
```

### 6.4 API 계약 — `POST /api/v1/projects/{id}/publish`

**Request:**

```http
POST /api/v1/projects/{id}/publish
Authorization: Bearer <user JWT>  (or session cookie)
X-Workspace-Id: <workspace_id>
Content-Type: application/json

{
  "formats": ["html"],
  "artifact_file": "deck/index.html",
  "folder_id": null,
  "shared_drive_id": null
}
```

`folderId`/`sharedDriveId` camelCase도 허용한다. `sharedDriveId=null`이면 개인 드라이브 또는 Main BE 기본 folder 정책을 사용하고, 값이 있으면 Main BE Drive 권한 검증을 거쳐 해당 팀/공유 드라이브 폴더에 업로드한다.

**Response 201:**

```json
{
  "project_id": "proj_abc",
  "outputs": [
    {
      "id": "out_xyz",
      "kind": "html",
      "drive_asset_id": "AST-123",
      "drive_folder_id": "FLD-123",
      "drive_shared_drive_id": "SD-123",
      "filename": "My Design.html",
      "size_bytes": 123456,
      "mime_type": "text/html"
    }
  ]
}
```

**인증:** `create_teamver_context_dependency` + `design_projects` access (09 P3-4).

### 6.5 PublishService orchestration

**신규:** `deploy/teamver/be/app/services/publish_service.py`

```python
async def publish_project(
    *,
    ctx: AppContext,
    project_id: str,
    formats: list[str],
    artifact_file: str | None,
    folder_id: str | None,
    shared_drive_id: str | None,
    access_token: str,
) -> list[DesignOutput]:
    # 1. registry lookup + access
    project = await get_design_project(project_id, ctx.workspace.workspace_id)

    # 2. daemon manifest
    manifest = await od_daemon.get_export_manifest(project.od_project_id)

    # 3. per format
    outputs = []
    for fmt in formats:
        if fmt == "html":
            path = artifact_file or manifest["entryFile"]
            content = await od_daemon.get_export_inline(project.od_project_id, path)
            mime, filename = "text/html", f"{project.title or 'design'}.html"
        elif fmt == "zip":
            content = await od_daemon.get_archive(project.od_project_id)
            mime, filename = "application/zip", f"{project.title or 'design'}.zip"
        else:
            continue

        # 4. Drive upload (user JWT 위임)
        ticket = await client.drive.create_upload_request(
            access_token=access_token,
            filename=filename,
            file_size=len(content),
            content_type=mime,
            folder_id=folder_id,
            shared_drive_id=shared_drive_id,
        )
        # loop 177 — wrapped in `_drive_presigned_put` so the SDK private call
        # is a single, swappable call site once Main BE exposes a public method.
        await _drive_presigned_put(client, presigned_url=ticket.presigned_url, content=content, content_type=mime)
        asset = await client.drive.confirm_upload(access_token=access_token, asset_id=ticket.asset_id)

        # 5. INSERT design_outputs
        row = await create_design_output(project, asset, fmt, ...)
        outputs.append(row)

    return outputs
```

**신규:** `deploy/teamver/be/app/services/od_daemon_client.py` — httpx wrapper for manifest/export/archive.

### 6.6 file handoff diagram

```text
Browser
  → POST design-api /api/v1/projects/{id}/publish (user JWT)
    → ① design_projects access check
    → ② GET daemon /api/projects/{od_id}/export/manifest (OD_API_TOKEN)
    → ③ GET daemon .../export/{path}?inline=1  OR  .../archive
    → ④ SDK client.drive.create_upload_request(access_token=user_jwt, folder_id, shared_drive_id)
         → POST Main BE /api/drive/upload-request
         → PUT  S3 presigned_url
         → POST Main BE /api/drive/upload-confirm
    → ⑤ INSERT design_outputs
    → ⑥ (Phase 2) commit_usage if reserved
  → User sees asset in Teamver Drive (personal or team/shared drive)
```

**인증 2계층:**

| hop | auth |
|-----|------|
| design-api → daemon | `OD_API_TOKEN` (service) |
| design-api → Main BE Drive | **user JWT** (asset owner = user) |

### 6.7 에러·refund

| 이벤트 | HTTP | error_code (loop 177) | Phase 2 |
|--------|------|----------------------|---------|
| daemon manifest/export 실패 | 502 (전부 실패) / 207 (부분) | `od_daemon_export_failed` | — |
| Drive upload-request 실패 | 207/502 | `drive_upload_failed_<status>` *or* SDK code | `refund_usage` if reserved |
| Drive presigned PUT 실패 | 207/502 | `drive_presigned_put_failed_<status>` | `refund_usage` if reserved |
| Drive confirm 실패 | 207/502 | `drive_confirm_failed_<base>` *or* SDK code (`drive.confirm_*`) | `refund_usage` if reserved |
| partial (html OK, zip fail) | **207** + per-output status | per-output `errorCode` | refund partial |
| access denied | 403 | — | — |
| project not found | 404 | — | — |

> **loop 177 운영 가이드.** staging 에서 publish 가 실패하면 `outputs[].errorCode` prefix 로 phase 를 즉시 식별:
> - `drive_upload_failed_*` → Main BE Drive `upload-request` 거절 (토큰 만료 403, 쿼터 429, 5xx 등).
> - `drive_presigned_put_failed_*` → S3 presigned URL PUT 실패 (만료 403, 사이즈 초과 4xx, S3 5xx).
> - `drive_confirm_failed_*` / `drive.confirm_*` → Main BE confirm 단계 (DB unique 충돌, 권한 변경 등).
> 동일 코드는 design-api `WARNING publish drive upload failed phase=... code=... project=... format=... status=...` 로그 라인에서 한 번에 검색 가능.

> **loop 178 회귀 안전망.** `D-7 publish body outputs[].driveAssetId 채워짐` E2E 가 staging 에서 실제 Drive 업로드 누락(201 + 빈 `driveAssetId`)을 자동으로 검출. fixture 회귀 시나리오 *3b — empty driveAssetId* 가 mock-curl 단계에서도 동일 가드를 유지.

> **loop 181 D-8.** 207 partial 응답에서도 ready output 의 `driveAssetId` 가 non-empty 여야 통과. zip/html 중 하나만 실패해도 성공한 format 은 Drive asset ID 를 반환해야 한다.

> **loop 180 FE UX.** embed publish 실패 toast 는 `formatPublishErrorCodeForUser()` 를 통해 phase code 를 짧은 조치 힌트로 변환한다 (예: `drive_upload_failed_403` → "Drive session expired — sign in…").

### 6.8 Main FE Drive UX (P4-3)

- Design embed publish toast → `https://{main}/drive?asset={drive_asset_id}`
- Main FE (`ns-teamver-fe-v2` `staging`): `useDriveAssetDeepLink` — URL `?asset=` 수신 시 asset detail 모달 오픈, folder navigation, query strip
- `fetchDriveAsset` + `mapDriveAssetDetailToItem` + unit test `driveAssetDeepLink.test.ts`
- embed 측: `resolveTeamverDriveAssetUrl`, FileViewer Download 메뉴 (`TeamverPublishDriveMenuItem`)
- embed 메뉴에서 Main Teamver Drive API를 읽어 개인 드라이브 루트/폴더와 팀 드라이브 루트를 선택하고, 선택된 `folderId` + `sharedDriveId`를 publish request로 전달.
- 운영 기본값: `VITE_TEAMVER_DRIVE_PUBLISH_FOLDER_ID`, `VITE_TEAMVER_DRIVE_PUBLISH_SHARED_DRIVE_ID`.
- 남음: Main Drive와 동일한 전체 폴더 브라우저/검색 UX.

### 6.9 향후

| 항목 | 시점 |
|------|------|
| hosted PDF (Playwright sidecar) | Phase 4+ |
| PPTX export HTTP route | upstream OD 또는 sidecar |
| M2M Drive (server-only publish) | Main BE internal API 미설계 — **비권장** |

---

## 7. 작업 우선순위 · 진행 상황

### Phase U — Usage (약 1~1.5주)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| U-1 | FE `saveMessage` → `reportTeamverDesignUsage` | `apps/web` | ✅ |
| U-2 | token attribution helper | `apps/web/src/teamver` | ✅ |
| U-3 | DB unique `(workspace_id, run_id)` | `deploy/teamver/be` | ✅ |
| U-4 | `reportUsage.ts` + auth recovery (10 연동) | `apps/web` | ✅ |
| U-5 | Main BE design M2M by-model | `ns-teamver-be` | ✅ |
| U-6 | Staging E2E — run → usage row | — | ☐ |
| U-7 | usage/events 멱등 테스트 | `deploy/teamver/be/tests` | ✅ |
| U-8 | Daemon M2M `POST /api/internal/usage/events` | `deploy/teamver/be` + `apps/daemon` | ✅ |

### Phase B — Registry billing (출시 후)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| B-1 | `run_lifecycle.py` reserve/commit/refund + daemon bridge | `deploy/teamver/be` + `apps/daemon` | ✅ orchestrator + `teamver-billing-bridge.ts` + run-path wiring + tests |
| B-2 | Admin registry `design` key | Main BE Admin | 🟡 `seed_main_be_design_app.sql` (전역 비활성화 시) |
| B-3 | amount 산정 정책 | design-api | ☐ |

### Phase D — Drive Publish v1 (약 1.5~2주, G7)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| D-1 | `design_outputs` DDL + CRUD | `deploy/teamver/be` | ✅ |
| D-2 | `OdDaemonClient` | `deploy/teamver/be` | ✅ |
| D-3 | `PublishService` + router | `deploy/teamver/be` | ✅ |
| D-4 | `POST /api/v1/projects/{id}/publish` | `deploy/teamver/be` | ✅ |
| D-5 | Staging E2E — HTML → personal/team Drive | — | ☐ |
| D-6 | Main FE Drive UX | `ns-teamver-fe-v2` | ✅ `?asset=` 딥링크 (`staging`) · embed publish 메뉴 ✅ |
| D-7 | `GET /projects/{id}/outputs` + Open in Drive | `deploy/teamver/be` + embed | ✅ |
| D-8 | Publish 207/502 structured JSON (camelCase) | `deploy/teamver/be` + embed | ✅ |
| D-9 | workspace Drive target picker (`folderId` + `sharedDriveId`) | embed + Main Drive API/UI | 🟡 personal/team folder select 1차 ✅ · searchable browser ☐ |

**의존:** Phase D는 [09 Phase 3](./09_Design_저장소_격리_출시게이트.md) `design_projects` 완료 후.

---

## 8. 검증 체크리스트

### Usage E2E

```text
[ ] embed run 완료 → POST /usage/events 202 + requestId
[ ] ai_model_token_usages row — workspace_id, run_id, model_name, tokens
[ ] duplicate run_id → no double count (unique index)
[ ] Main BE fetch_token_usage_by_model(app=design) returns items
[ ] expired session → 401, no orphan usage row
[ ] 5xx retry — at most 2 POSTs for same run
```

### Drive Publish E2E

```text
[ ] POST /publish formats=["html"] → drive_asset_id
[ ] POST /publish with `folderId` + `sharedDriveId` → team/shared Drive asset
[ ] design_outputs row with mime, filename, size
[ ] design_outputs row stores drive_folder_id and drive_shared_drive_id
[ ] User JWT asset owner = publishing user
[ ] GET Drive download-url works
[ ] formats=["pdf"] → 501 or skipped with clear error
[ ] user B cannot publish user A project → 403
[ ] partial zip fail → 207 with per-output status
```

---

## 9. Track A/B · 09 Phase 4 정렬

| 문서 | 범위 |
|------|------|
| **09 Phase 4 P4-1~P4-3** | Drive upload, design_outputs, Main FE |
| **본 문서 §3** | Usage Phase 1 (Track A 출시 전) |
| **본 문서 §4** | Registry billing (Track A 출시 후) |
| **본 문서 §6** | Drive Publish v1 (= 09 G7) |

**출시 전 필수:** §3 Phase U + §4 Phase B + §5 Main BE M2M
**출시 직후 권장 (G7):** §6 Phase D  
**출시 이후:** §4 Phase B

---

## TODO (후속 작업)

**갱신:** 2026-06-25. 중앙 SSOT — [04 §TODO](./04_구현_우선순위.md#todo-후속-작업).

### Phase U (usage wiring)

| ☐ | 작업 |
|---|------|
| ☐ | U-6 staging E2E — internal usage M2M + RDS `ai_model_token_usages` row |
| ☐ | Main BE design M2M `fetch_token_usage_by_model` staging 실증 |

### Phase D (Drive publish)

| ☐ | 작업 |
|---|------|
| ☐ | D-5/D-6/D-7 staging E2E full run |
| ☐ | D-6a 실 Drive asset import |
| ✅ | loop 410 publish deploy menu + last target focus (409 one-click superseded) |
| ✅ | loop 412 usage/DB/S3 로컬 점검 — 71 usage + storage tests green · [26](./26_Usage·DB·S3_동작_점검.md) · EC2 strict ☐ |

### Phase B (metered billing — §4.9)

§4.9 체크리스트 항목 `[ ] 1`~`[ ] 8` 참고. 핵심:

| ☐ | 작업 |
|---|------|
| ☐ | `credit_meter.py` + `DESIGN_MODEL_PRICES_JSON` |
| ☐ | 전략 A/B/C 확정 |
| ☐ | embed BYOK billing (U-G6) — loop 430 FE hook ✅ · **daemon-side finalize (U-G11)** ✅ [11 §4.11](./11_Usage·Drive_Publish_보강.md) |
| ☐ | staging E2E reserve/commit ledger 일치 |

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-29 | **U-G11** embed BYOK billing daemon-side finalize — internal M2M endpoint, `teamver-byok-usage-bridge`, message PUT hook, FE no-op |
| 2026-06-26 | **§4.11** embed BYOK billing FE vs daemon/BE — 페이지 이탈·백그라운드 run gap, daemon message PUT 이전 권장 (U-G11) |
| 2026-06-23 | hosted runtime/billing fail-fast — staging/production `TEAMVER_INTERNAL_API_KEY` + `TEAMVER_OD_API_KEY` 필수, production `TEAMVER_REGISTRY_*` 필수, staging은 registry 미설정 시 `TEAMVER_BILLING_DISABLED=1` 명시 |
| 2026-06-19 | Track A E2E S3 tenant object probe — D-5/D-6 전후 프로젝트 파일이 S3 tenant prefix 에 실제 존재하는지 `TEAMVER_S3_BUCKET` + `/access` prefix header + `aws s3 ls` 로 검증 가능 |
| 2026-06-18 | Drive Publish 팀 드라이브 하위 폴더 선택 — shared drive folder-tree를 flatten해 팀 드라이브 내부 폴더도 `folderId/sharedDriveId` target으로 publish 가능. 남음: 검색형 브라우저 UX + staging E2E |
| 2026-06-18 | Drive Publish 대상 선택 UX 1차 — embed 메뉴에서 개인 드라이브 루트/폴더 + 팀 드라이브 루트를 선택해 `folderId/sharedDriveId`로 publish. `VITE_TEAMVER_DRIVE_PUBLISH_SHARED_DRIVE_ID` 추가. 남음: 전체 폴더 브라우저/검색 + staging E2E |
| 2026-06-18 | Drive Publish target 확장 — `folderId` + `sharedDriveId`, `design_outputs.drive_shared_drive_id`, Main BE presigned 3-step 업로드 전환. 남음: workspace Drive picker + staging E2E |
| 2026-06-15 | 초안 — Usage FE-first wiring, 멱등, Main BE M2M, Drive Publish v1 SSOT |
