# 메시지 Persist PUT 아키텍처 (스트리밍 checkpoint)

**SSOT:** embed BYOK 스트리밍 중 `PUT /api/projects/…/conversations/…/messages/:id` 빈도·역할·개선 방향.  
**관련:** [11 §4.11](./11_Usage·Drive_Publish_보강.md) (BYOK billing) · [02 design-app ↔ daemon](./02_design-app_daemon_연동.md) · [24 usage capture](./24_AI_API_usage_capture_경로별_분석.md)

---

## 1. 한 줄 요약

| 질문 | 답 |
|------|-----|
| design-api(Postgres)로 채팅을 보내나? | **아니오.** daemon **SQLite** checkpoint. |
| 왜 브라우저가 PUT? | OD **local-first** + embed BYOK는 **FE가 LLM 스트림 소유** → daemon runId 없음. |
| BE가 중간 chunk를 알아서 저장? | **아니오 (현재).** terminal·pagehide 시점만 daemon PUT으로 authoritative. |
| 과금은? | **U-G11 이후** terminal PUT → daemon M2M (`finalize-byok-run`, `usage/events`). 중간 PUT과 무관. |

---

## 2. 저장소·API 구분

```text
┌─────────────────────────────────────────────────────────────────┐
│  브라우저 (ProjectView)                                          │
│    UI state: 매 프레임 갱신 (rAF ~250ms flush)                    │
│    persistSoon → throttle → PUT …/messages/:id  (checkpoint만)   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ nginx → daemon :7456
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  daemon SQLite (app.sqlite)                                      │
│    upsertMessage · updateProject(updatedAt bump)                 │
│    terminal BYOK → reportByokTeamverUsageAndBillingFromDaemon   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ M2M (terminal only)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  design-api (Postgres) — usage ledger · billing · registry      │
│    채팅 본문 row 없음                                             │
└─────────────────────────────────────────────────────────────────┘
```

**혼동 금지:** staging 부하 이슈의 대상은 **design-api HTTP가 아니라 daemon message PUT** (동일 origin nginx 경유).

---

## 3. 실행 모드별 persist 주체

| 모드 | LLM 스트림 | daemon `runId` | 스트리밍 중 persist | 턴 종료 persist |
|------|------------|----------------|---------------------|-----------------|
| **daemon CLI run** | daemon (`POST /api/runs`) | ✅ | daemon `run.events` | run finalize → message 반영 |
| **embed BYOK (`mode=api`)** | FE → proxy/SDK | ❌ | **FE PUT** (throttle) | **FE PUT** `telemetryFinalized` + daemon billing hook |
| **standalone OD desktop** | 위와 동일 | 경우에 따라 | FE PUT (throttle, 짧은 간격) | 동일 |

embed Teamver 기본 pin은 **`mode=api` (BYOK)** 이므로 CLI run과 persist 경로가 다르다.

---

## 4. 왜 OD는 “BE가 알아서”가 아닌가 (역사·구조)

### 4.1 Open Design 원형

- 제품 = **Electron/Web UI + localhost daemon + SQLite**
- 멀티탭·재시작 일관성 → **모든 write는 daemon HTTP round-trip**
- 스트리밍 UI는 FE; **crash/reload 복구**를 위해 FE가 주기적으로 message row를 daemon에 push

### 4.2 embed BYOK 추가 시

1. LLM 호출이 **브라우저 ↔ daemon proxy** (또는 SDK)에 있음.
2. daemon **`POST /api/runs` lifecycle 없음** → `run.events` SSOT 불가.
3. **assistant `message.id`** 가 turn SSOT (`run_id = message.id` for billing).
4. loop 430: 과금 트리거를 빠르게 붙이려 **기존 `saveMessage` PUT** 경로 재사용 ([11 §4.11](./11_Usage·Drive_Publish_보강.md)).

### 4.3 Teamver가 이미 옮긴 것 (U-G11)

- **과금·usage ledger:** FE BFF 호출 → **daemon message PUT hook + M2M** (authoritative).
- FE `maybeReportTeamverUsageAfterSave` — BYOK **no-op**.

### 4.4 아직 FE PUT인 것

- **스트리밍 중간 텍스트·events checkpoint** (새로고침·reattach·`project.updatedAt`).
- proxy stream 종료 시 daemon persist는 **비권장** (message id 모름, tool loop 다회 stream, `runStatus`는 FE lifecycle).

---

## 5. PUT 한 번당 daemon 부하

`server.ts` `PUT …/messages/:mid` handler:

1. `upsertMessage` (SQLite write)
2. `updateProject` — **`updatedAt` bump** (프로젝트 목록 reorder)
3. `reportFinalizedMessage` (analytics)
4. **terminal BYOK만** `reportByokTeamverUsageAndBillingFromDaemon` + S3 sync-up hook

→ 스트리밍 **중간 PUT**은 1–3만 실행. throttle 없으면 SSE token마다 rAF flush(~4/s) × PUT 폭주 가능.

---

## 6. 현재 완화 (Teamver fork)

### 6.1 Throttle scheduler

| 파일 | 역할 |
|------|------|
| `apps/web/src/state/messagePersistSchedule.ts` | `persistSoon` trailing-edge throttle |
| `apps/web/src/components/ProjectView.tsx` | send stream + reattach에 scheduler 적용 |

| 호출 | throttle |
|------|----------|
| `persistSoon` | ✅ (스트리밍 delta·tool event) |
| `persistNow` | ❌ bypass — terminal, canceled, `pagehide` keepalive |

UI state(`createBufferedTextUpdates`)는 **매 프레임** 갱신; throttle은 **daemon PUT만** 제한.

### 6.2 기본 간격 — env SSOT

**운영·staging:** `VITE_MESSAGE_PERSIST_THROTTLE_MS` (deploy `.env` → Docker build → static export).

| 파일 | 역할 |
|------|------|
| `deploy/teamver/.env.staging.example` | staging 기본 **5000** |
| `deploy/teamver/.env.production.example` | production 기본 **5000** |
| `deploy/Dockerfile` | `ARG`/`ENV` fallback 5000 |
| `deploy/teamver/docker-compose.yml` | build arg passthrough |

```bash
# .env.staging — 변경 후 open-design-daemon 이미지 재빌드 필수
VITE_MESSAGE_PERSIST_THROTTLE_MS=5000   # 부하 ↑ → 10000 · reload UX ↑ → 3000 (min 1000)
```

**로컬 OD dev** (env 미설정): embed 5000 · standalone 2500 (`resolveMessagePersistThrottleMs` fallback).

| 간격 | 2분 스트림 ~PUT | reload 유실 window |
|------|-----------------|-------------------|
| 5000 (hosted 기본) | ~24 | 5 s |
| 10000 | ~12 | 10 s |
| 3000 | ~40 | 3 s |

**5초 선택 근거:** staging multi-tenant daemon 부하와 SaaS reload UX 균형. terminal·pagehide는 즉시 PUT.

### 6.4 pagehide keepalive 64 KiB cap (2026-07-03)

브라우저는 `fetch({ keepalive: true })` **요청 본문 합계를 ~64 KiB**로 제한한다. 긴 assistant 답변(events·producedFiles 포함)은 pagehide checkpoint PUT이 **조용히 drop**될 수 있었다.

| 단계 | 동작 |
|------|------|
| 1 | JSON 직렬화 크기 > **56 KiB** (여유 cap) 이면 `events`/`producedFiles`/`toolInput`/`renderedHtml` 제거한 essentials projection 재시도 |
| 2 | essentials도 cap 초과 → keepalive PUT **skip** + `console.warn` |
| 3 | non-ok 응답·throw → `console.warn` (다음 정상 세션 refresh PUT이 authoritative) |

**코드:** `apps/web/src/state/projects.ts` (`KEEPALIVE_PAYLOAD_MAX_BYTES`, `projectKeepaliveEssentials`).  
**테스트:** `apps/web/tests/save-message-keepalive-guard.test.ts`.

> **Note:** 계획상 `sendBeacon` 분할 폴백은 미구현 — essentials strip + warn/skip으로 P1 목표(무음 실패 제거) 충족. 분할 beacon은 후속.

### 6.3 env 튜닝 예

```bash
# deploy/teamver/.env.staging
VITE_MESSAGE_PERSIST_THROTTLE_MS=10000
```

배포: `bash deploy.sh --staging --rds` (daemon `--build` 포함).

---

## 7. 후속 개선 (미구현 · 우선순위)

| # | 방안 | 부하 효과 | trade-off |
|---|------|-----------|-----------|
| P1 | throttle env·embed 5s | ✅ 즉시 | 중간 reload 시 최대 5s 텍스트 유실 |
| P2 | embed **중간 PUT 생략** (terminal + pagehide만) | ✅✅ | reload 중 스트림 복구 불가 |
| P3 | daemon **proxy stream handler**에서 chunk append | 근본 해결 | OD 코어 변경·유지보수 |
| P4 | embed 기본 **managed daemon run** | CLI와 동일 persist | BYOK/proxy 아키텍처 변경 |

---

## 8. 코드 위치

| 역할 | 경로 |
|------|------|
| throttle SSOT | `apps/web/src/state/messagePersistSchedule.ts` |
| send / reattach wiring | `apps/web/src/components/ProjectView.tsx` |
| `saveMessage` → PUT | `apps/web/src/state/projects.ts` |
| daemon PUT + BYOK billing | `apps/daemon/src/server.ts`, `teamver-byok-usage-bridge.ts` |
| FE billing (BYOK no-op) | `apps/web/src/teamver/maybeReportTeamverUsageAfterSave.ts` |
| tests | `apps/web/tests/state/messagePersistSchedule.test.ts` |

---

## 9. FAQ

**Q. design-api BE에서 message API 만들면 해결되나?**  
A. 채팅 SSOT를 Postgres로 옮기는 **대규모 아키텍처 변경**. 단기 부하 이슈에는 daemon PUT throttle이 맞다.

**Q. pagehide keepalive면 중간 PUT 없어도 되지 않나?**  
A. keepalive는 **탭 닫기/이탈**만 커버. 스트리밍 중 F5·크래시는 중간 checkpoint에 의존.

**Q. reattach는?**  
A. daemon run SSE reattach도 동일 scheduler 사용. throttle이 길수록 reattach 시점 message snapshot이 덜 fresh할 수 있음.

**Q. billing이 중간 PUT마다 도나?**  
A. **아니오.** `shouldReportByokUsageFromMessage`는 terminal 조건만.

---

## 10. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-29 | 문서 신규. throttle 2.5s 도입 (standalone+embed 공통). |
| 2026-06-29 | embed 기본 5s. **env SSOT:** `VITE_MESSAGE_PERSIST_THROTTLE_MS` in deploy `.env` + Dockerfile + compose build arg. |
