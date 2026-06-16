# Design — Usage·Billing · Drive Publish 보강

**Track A usage 집계(Phase 1)와 Drive Publish(Phase 4) 설계 SSOT.** design-api BE 파이프라인은 Docs/Slides 동형으로 준비됐으나 **이벤트 생산자·멱등·Main BE M2M·Publish orchestration**이 미완이다.

**개발 SSOT:** 본 문서 · [04 구현 우선순위](./04_구현_우선순위.md) · **진행 갱신:** [00 구현 내역](./00_구현_내역_누적.md)

**관련:** [03 키·Drive·DB](./03_키_저장소_Drive_DB.md) · [09 저장소·격리](./09_Design_저장소_격리_출시게이트.md) · [10 세션·OD패치](./10_세션·OD패치_보강.md) · [06 Docs/Slides형 연동](./06_Docs슬라이드형_연동.md)

---

## 한 줄 결론

> **Usage Phase 1은 FE-first(saveMessage 종료 hook)로 wiring하고, Drive Publish v1은 HTML+ZIP만 지원한다.**  
> Registry reserve/commit(Phase 2)은 출시 후; Main BE design M2M 등록은 Phase 1 완료 조건.

---

## 1. As-Is vs To-Be

| # | 영역 | As-Is | To-Be | 우선 | 상태 |
|---|------|-------|-------|------|------|
| U1 | usage 이벤트 생산 | BE ✅, 호출 주체 없음 | FE `saveMessage` hook | **P0** | ✅ |
| U2 | 멱등성 | 중복 INSERT | `(workspace_id, run_id)` unique | **P0** | ✅ |
| U3 | token attribution | daemon만 | message.events `usage` | **P0** | ✅ |
| U4 | 에러 가시성 | 항상 204 | 202 + request id (Phase 2) | **P1** | ☐ |
| U5 | Main BE design M2M | slides/meetings/startup만 | `app=design` by-model | **P0** | ✅ |
| U6 | Registry billing | `teamver_billing.py` wrapper만 | run lifecycle reserve/commit | **출시 후** |
| D1 | Drive Publish | design-api 코드 **0건** | `POST /projects/{id}/publish` | **G7** |
| D2 | design_outputs DDL | 없음 | Phase 3 `design_projects` FK | **G7** |
| D3 | export formats v1 | daemon HTML/ZIP ready, PDF 501 | HTML + ZIP only | **G7** |
| D4 | Drive auth | user JWT → SDK presigned 3-step | design-api가 user token 위임 | **G7** |

**범례:** ✅ 완료 · 🟡 부분 · ☐ 미착수

---

## 2. 현재 상태 (근거 코드)

### 2.1 design-api BE (Phase 1 준비됨)

| 구성 | 경로 | 상태 |
|------|------|------|
| `POST /api/v1/usage/events` | `deploy/teamver/be/app/routers/usage_report.py` L48–72 | ✅ |
| `GET /api/token-usage/by-model` | `routers/token_usage.py` L17–33 | ✅ M2M |
| async log | `services/token_usage_log.py` L45–72 | ✅ fire-and-forget |
| DB | `ai_model_token_usages` | ✅ |
| FE helper | `maybeReportTeamverUsageAfterSave.ts` + `reportUsage.ts` | ✅ |
| FE in-memory 멱등 | `reportedRunIds` Set | ✅ |
| Phase 2 wrapper | `services/teamver_billing.py` L24–49 | 🟡 import 0 |

**UsageEventBody** (`usage_report.py` L36–45):

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

인증: user JWT + `X-Workspace-Id` + workspace 일치 검증.

### 2.2 daemon run-end (Langfuse만 연결)

| 훅 | 경로 | Teamver |
|----|------|---------|
| `createFinalizedMessageTelemetryReporter` | `apps/daemon/src/server.ts` L3017–3161 | ❌ |
| Message PUT 트리거 | `server.ts` L6597–6601 | ❌ |
| Terminal fallback | `server.ts` L5981–6014 | ❌ |
| `run_finished` PostHog | `server.ts` L15091–15216 | ❌ |
| Token scan SSOT | `run-analytics-observability.ts` L116–275 | 재사용 가능 |

**트리거 조건:** `saved.runStatus` ∈ `{succeeded, failed, canceled}` + `body.telemetryFinalized === true`

### 2.3 Drive (Phase 4 미착수)

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

**daemon 측 (이미 구현):** `run-analytics-observability.ts` L116–275

- `event === 'agent' && data.type === 'usage'` → input/output tokens
- cache tokens (Anthropic/OpenAI) 분기
- `agent_reported_model`: status event `label === 'model'`

**FE 측:** `message.events` (SSE persist)에서 추출

```typescript
function extractLatestUsageFromEvents(events: PersistedAgentEvent[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "usage") {
      return { inputTokens: e.inputTokens ?? 0, outputTokens: e.outputTokens ?? 0 };
    }
  }
  return null;
}

function extractModelNameFromEvents(events: PersistedAgentEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "status" && e.label === "model" && e.detail) return e.detail;
  }
  return null;
}
```

**한계:** provider가 usage 미emit 시 `token_count_source: unknown`. v1은 0 tokens 허용 + `operation: design_run`.

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

## 4. Phase 2 — Registry reserve/commit (출시 후)

### 4.1 lifecycle

```text
run create (FE 또는 design-api pre-check)
  → reserve_credits(workspace_id, estimated_amount) → usage_id
  → store usage_id on run metadata (optional)

run succeeded + usage logged
  → commit_usage(usage_id)

run failed/canceled before commit
  → refund_usage(usage_id, reason="design_run_failed")
```

### 4.2 amount 산정

```text
estimated_amount = (input_tokens + output_tokens) × model_unit_price
```

- v1 price table: design-api env `DESIGN_MODEL_PRICES_JSON` 또는 Main BE 조회 (후속)
- reserve는 **상한 추정** (run 시작 전), commit은 **실측** (Phase 2 정책 결정)

### 4.3 Admin registry key

Main BE Admin → Registry app `design` key 발급:

```bash
TEAMVER_REGISTRY_APP_ID=...
TEAMVER_REGISTRY_KEY_ID=...
TEAMVER_REGISTRY_ACCESS_KEY=...
```

### 4.4 호출부 — `services/run_lifecycle.py` (신규)

```python
async def on_run_start(workspace_id: str, estimated_tokens: int) -> str:
    result = await reserve_credits(workspace_id=workspace_id, amount=estimated_tokens)
    return result["usage_id"]

async def on_run_success(usage_id: str) -> None:
    await commit_usage(usage_id=usage_id)

async def on_run_failure(usage_id: str) -> None:
    await refund_usage(usage_id=usage_id)
```

**연동 시점:** Track B job queue 또는 FE pre-check (출시 후).

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

  kind TEXT NOT NULL,           -- 'html' | 'zip' | 'pdf' | 'pptx'
  mime_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,

  source_path TEXT,
  manifest_entry_file TEXT,
  artifact_file TEXT,
  publish_status TEXT NOT NULL DEFAULT 'ready',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_design_outputs_project ON design_outputs (project_id, published_at DESC);
CREATE INDEX idx_design_outputs_drive_asset ON design_outputs (drive_asset_id);
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
  "folder_id": null
}
```

**Response 201:**

```json
{
  "project_id": "proj_abc",
  "outputs": [
    {
      "id": "out_xyz",
      "kind": "html",
      "drive_asset_id": "AST-123",
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
        asset = await client.drive.upload_bytes_to_personal_drive(
            access_token=access_token,
            filename=filename,
            content=content,
            content_type=mime,
            folder_id=folder_id,
        )

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
    → ④ SDK client.drive.upload_bytes_to_personal_drive(access_token=user_jwt)
         → POST Main BE /api/drive/upload-request
         → PUT  S3 presigned_url
         → POST Main BE /api/drive/upload-confirm
    → ⑤ INSERT design_outputs
    → ⑥ (Phase 2) commit_usage if reserved
  → User sees asset in Teamver Drive (personal)
```

**인증 2계층:**

| hop | auth |
|-----|------|
| design-api → daemon | `OD_API_TOKEN` (service) |
| design-api → Main BE Drive | **user JWT** (asset owner = user) |

### 6.7 에러·refund

| 이벤트 | HTTP | Phase 2 |
|--------|------|---------|
| daemon manifest/export 실패 | 502 | — |
| Drive upload 실패 | 502 | `refund_usage` if reserved |
| partial (html OK, zip fail) | **207** + per-output status | refund partial |
| access denied | 403 | — |
| project not found | 404 | — |

### 6.8 Main FE Drive UX (P4-3)

- Design 앱 또는 workspace Drive에서 `design_outputs.drive_asset_id` 조회
- `GET /api/drive/asset/{id}/download-url` → download
- (선택) Publish 완료 toast + "Drive에서 보기" 링크

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
| U-7 | usage/events 테스트 | `deploy/teamver/be/tests` | ☐ |

### Phase B — Registry billing (출시 후)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| B-1 | `run_lifecycle.py` reserve/commit/refund | `deploy/teamver/be` | ☐ |
| B-2 | Admin registry `design` key | Main BE Admin | ☐ |
| B-3 | amount 산정 정책 | design-api | ☐ |

### Phase D — Drive Publish v1 (약 1.5~2주, G7)

| # | 작업 | 레포 | 상태 |
|---|------|------|------|
| D-1 | `design_outputs` DDL + CRUD | `deploy/teamver/be` | ☐ |
| D-2 | `OdDaemonClient` | `deploy/teamver/be` | ☐ |
| D-3 | `PublishService` + router | `deploy/teamver/be` | ☐ |
| D-4 | `POST /api/v1/projects/{id}/publish` | `deploy/teamver/be` | ☐ |
| D-5 | Staging E2E — HTML → Drive | — | ☐ |
| D-6 | Main FE Drive UX | `ns-teamver-fe-v2` | ☐ |

**의존:** Phase D는 [09 Phase 3](./09_Design_저장소_격리_출시게이트.md) `design_projects` 완료 후.

---

## 8. 검증 체크리스트

### Usage E2E

```text
[ ] embed run 완료 → POST /usage/events 201/204
[ ] ai_model_token_usages row — workspace_id, run_id, model_name, tokens
[ ] duplicate run_id → no double count (unique index)
[ ] Main BE fetch_token_usage_by_model(app=design) returns items
[ ] expired session → 401, no orphan usage row
[ ] 5xx retry — at most 2 POSTs for same run
```

### Drive Publish E2E

```text
[ ] POST /publish formats=["html"] → drive_asset_id
[ ] design_outputs row with mime, filename, size
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

**출시 전 필수:** §3 Phase U + §5 Main BE M2M  
**출시 직후 권장 (G7):** §6 Phase D  
**출시 이후:** §4 Phase B

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-15 | 초안 — Usage FE-first wiring, 멱등, Main BE M2M, Drive Publish v1 SSOT |
