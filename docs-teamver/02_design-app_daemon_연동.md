# teamver-design-app ↔ open-design daemon 연동

> **범위:** **Track B (출시 후)** — wrapper BE가 OD를 headless로 오케스트레이션할 때.  
> **Track A (현재 출시):** OD web UI가 브라우저에서 daemon에 직접 붙는 것이 정상 토폴로지 → [05_OD_UI_재사용_빠른출시](./05_OD_UI_재사용_빠른출시.md).

**teamver-design-app**(AI Apps의 한 종류)과 **open-design daemon** 사이의 연동 — 구조, 비동기, **그 경계에서의 queue·부하·헬스** — 를 정리합니다.

**본 문서의 전제 (용어)**

| 용어 | 정의 |
|------|------|
| **teamver-design-app** | 유저 UI를 제공하는 **FE + BE를 하나로 부르는 이름**. 제품·배포 단위의 AI App. |
| **분석 경계** | 이 문서의 핵심 질문은 **design-app(BE) ↔ open-design daemon** 이다. Teamver Main/플랫폼 job 인프라는 **앱 바깥** concern으로만 언급한다. |

**관련 문서 (integration)**

| 문서 | 내용 |
|------|------|
| [01_통합_아키텍처.md](./01_통합_아키텍처.md) | wrapper·sidecar, adapter |
| [03_키_저장소_Drive_DB.md](./03_키_저장소_Drive_DB.md) | 키·artifact·Drive |
| [04_구현_우선순위.md](./04_구현_우선순위.md) | 구현 Phase·필수/선택 |

**OD 참고:** [open-design-index.md](./open-design-index.md) — HTTP/SSE, `/api/runs`

**근거 (open-design)**

| 주제 | 경로 |
|------|------|
| Run 모델 | `apps/daemon/src/runs.ts`, `POST /api/runs` · `POST /api/chat` (`server.ts`) |
| 헬스·ready | `GET /api/health`, `/api/ready`, `/api/daemon/status` |
| contracts | `packages/contracts/src/api/chat.ts` (`ChatRunStatus`, `ChatRunCreateResponse`) |
| 제품 비목표 (단일 사용자 MVP) | `open-design/docs/spec.md` §6 |

---

## Why (간략)

| 이유 | 설명 |
|------|------|
| **엔진 분리** | open-design은 **디자인 실행 엔진**; teamver-design-app은 **사용자 경험·Teamver 연동** 을 갖는 앱. 코드 fork 없이 **HTTP** 로 붙인다 ([01_통합_아키텍처](./01_통합_아키텍처.md)). |
| **시간·연결** | 한 번의 생성은 **수 분~수십 분**. 브라우저·앱 BE가 OD까지 **동기 블로킹** 하면 타임아웃·끊김에 취약하다. |
| **자원** | daemon은 **agent 프로세스·디스크·SQLite** 를 쓴다. design-app BE가 **얼마나 OD에 run을 넣을지** 를 제어하지 않으면 과부하·먹통이 난다. |
| **OD 한계** | OD는 multi-tenant job 플랫폼이 아니다 (`spec.md` §6). **대기·공정성·사용자별 상한** 은 design-app 쪽 책임이다. |

---

## Summary

- **teamver-design-app** = **FE**(화면·진행 상태) + **BE**(API, persistence, Teamver SDK, OD 클라이언트).
- **사용자 비동기**: Track B에서 FE는 design-app BE의 **run/job API** 만 호출. **Track A(OD UI 재사용)에서는 OD web이 daemon에 직접 연결.**
- **앱 BE ↔ OD 비동기(권장)**: `POST /api/runs` → **202 + `runId`** → … ([open-design-index](./open-design-index.md))
- **design-app ↔ OD 사이에 별도 메시지 큐(Redis 등)는 필수 아님.** 기본은 **앱 BE DB의 pending run + 동시 `POST /api/runs` 상한**. 스케일·버스트가 커지면 **앱 내부 또는 OD 앞단 게이트웨이** 에 큐를 **선택**적으로 둔다.
- **OD만의 `queued` run** 은 인메모리·접수 후 수준 — **backpressure 대체 불가**.
- **과부하·먹통**: `health` / `ready` / `daemon/status` / `runs?status=running` + 앱 BE **circuit breaker** 로 **새 run 발행 중단**.

---

## What (무엇이 무엇과 맞닿는가)

### 경계 다이어그램 (본 문서 초점)

```text
[사용자 브라우저]
        │  HTTPS (앱 API만)
        ▼
┌───────────────────────────────────────┐
│  teamver-design-app                    │
│  ├─ FE   UI, 진행률, 결과 미리보기      │
│  └─ BE   run/job CRUD, OD 오케스트레이션 │
│          Teamver SDK (권한·Drive·usage) │
└───────────────────────────────────────┘
        │  HTTP  http://127.0.0.1:7456/api/*
        │  (동일 Pod sidecar 또는 내부 DNS)
        ▼
[open-design daemon]
  projects, runs, agent spawn, OD_DATA_DIR, app.sqlite
```

Teamver **Main BE**·플랫폼 **AI Apps Registry** 는 앱이 **SDK/M2M** 으로 Drive·과금·workspace를 확인할 때만 관여한다. **“OD run을 언제 시작할지”** 는 **design-app BE** 가 결정한다.

### 책임 표

| 레이어 | 책임 | OD 호출 |
|--------|------|---------|
| **design-app FE** | 요청 UX, run 상태 표시, 결과 링크 | **없음** (BE만) |
| **design-app BE** | run 영속화, OD project/run/export, Drive 업로드, 동시성·헬스 | **전부** |
| **open-design daemon** | skill/DS/agent 실행, 산출물·메타 on disk/DB | — |

### 배포 (권장)

[01_통합_아키텍처](./01_통합_아키텍처.md) **sidecar**: 앱 컨테이너(FE+BE) + daemon + `OD_DATA_DIR` 볼륨.

```text
Pod / VM
  ├─ teamver-design-app   (FE 정적/SSR + BE 프로세스 — 한 이미지 또는 한 차트)
  ├─ open-design-daemon   (보통 1; CPU 기준 인스턴스 추가)
  └─ PVC: OD_DATA_DIR
```

초기에는 **앱 1 ↔ daemon 1** 이 가장 단순하다. 앱 BE replica를 늘리면 **같은 daemon으로 fan-in** 되므로 **동시 run 상한·(선택) 내부 큐** 가 더 중요해진다.

---

## How (어떻게 연동하는가)

### 1) 표준 플로우 (design-app 관점)

```text
1. User → design-app FE: "생성" (prompt, template, …)
2. design-app FE → design-app BE: POST /…/runs  (또는 /jobs)  → 202 { appRunId }
3. design-app BE (백그라운드 또는 워커 루프):
     a. 앱 DB: status = pending | waiting_od_slot
     b. 슬롯 확보 + GET /api/ready (503 → 대기·재시도)
     c. GET /api/agents (없으면 failed)
     d. POST /api/projects (또는 od_project_id 재사용)
     e. POST /api/runs  → 202 { runId, … }  ; 앱 DB에 od_run_id 저장
     f. GET /api/runs/{runId}/events (SSE) → FE에 중계(선택) 또는 앱 DB에 이벤트 요약
     g. terminal → export → teamver-app-sdk → Drive
     h. 앱 DB: succeeded + drive_asset_ids
4. User: FE가 appRunId로 상태·결과 조회
```

타입 정본: `@open-design/contracts` — `ChatRunCreateResponse`, `ChatRunStatus` (`queued` | `running` | `succeeded` | `failed` | `canceled`).

### 2) OD API 패턴 (앱 BE가 선택)

| 패턴 | OD API | 비고 |
|------|--------|------|
| **A. run + SSE** (권장) | `POST /api/runs` → `GET …/events` | MCP/headless와 동일; 연결 끊겨도 `runId`로 재구독 |
| **B. run + 폴링** | `POST /api/runs` → `GET /api/runs/:id` | SSE 불가 환경 |
| **C. chat 단일 SSE** | `POST /api/chat` | OD web UI와 동일; **앱 BE가 장시간 한 HTTP를 붙잡기** 비권장 |

`POST /api/runs` 는 **202** 로 접수만 하고 실행은 비동기 (`server.ts`). 앱 BE는 **OD용 SSE를 별도 연결**로 열어 프록시 idle timeout을 피한다.

### 3) design-app BE 내부 모듈 (제안)

| 모듈 | 역할 |
|------|------|
| `AppRunStore` | 앱 run/job 테이블 (pending → running → done) |
| `OdSlotLimiter` | daemon당 max in-flight `POST /api/runs` |
| `OdDaemonClient` | health, projects, runs, export ([open-design-index.md](./open-design-index.md)) |
| `OdRunWorker` | SSE consume, timeout, cancel |
| `ArtifactPublisher` | export → Drive ([03_키_저장소_Drive_DB](./03_키_저장소_Drive_DB.md)) |
| `TeamverContext` | SDK bootstrap |

공개 도메인 API는 [01_통합_아키텍처](./01_통합_아키텍처.md) 의 `generateDesignArtifact(...)` / 앱 REST로 노출해도 된다.

### 4) 식별자 (앱 DB ↔ OD)

| design-app (앱 DB) | open-design |
|--------------------|-------------|
| `app_run.id` | — |
| `app_run.od_project_id` | `projects.id` |
| `app_run.od_run_id` | `runs.id` |
| `app_run.od_conversation_id` | (선택) |
| `drive_asset_id` | export 결과 |

---

## 심화: design-app과 open-design **사이**에 queue가 필요한가?

**결론: 별도 “중간 메시지 큐”는 필수가 아니다. 다만 “대기열” 개념은 design-app BE에 반드시 있다.**

OD는 큐에서 job을 **pull** 하지 않는다. **HTTP로 run을 push** 받는 서버다. 따라서 “design-app ↔ OD 사이에 Redis를 깐다”는 보통 **앱 BE 프로세스(들)가 소비하는 내부 큐** 이지, OD와 직접 연결된 브로커가 아니다.

### 세 가지 “대기”가 헷갈리기 쉬움

| 대기 | 위치 | 역할 |
|------|------|------|
| **① 앱 run 대기열** | design-app BE DB (`pending`, `waiting_od_slot`) | 사용자 요청은 이미 접수; **OD에 아직 안 넣음** |
| **② 앱 → OD 발행 제한** | design-app BE (`OdSlotLimiter`, 세마포어) | 슬롯 있을 때만 `POST /api/runs` |
| **③ OD run 상태 `queued`** | daemon 인메모리 (`runs.ts`) | 이미 **접수된** run의 내부 스케줄; **다테넌트·영속 backpressure 아님** |

**① + ②** 가 “design-app과 OD 사이에 queue가 필요한가?”에 대한 실질적 답이다. **③만으로는 부족**하다.

### 패턴별 권장

| 상황 | design-app ↔ OD | 권장 |
|------|-----------------|------|
| **sidecar 1:1**, 트래픽 중소 | 앱 BE DB + in-process limiter | **별도 브로커 큐 없음** |
| **앱 BE replica N → daemon 1** | fan-in | 앱 DB **행 잠금/lease** 또는 **단일 dispatcher** + ② 상한 필수 |
| **버스트·OD 재시작 격리** | 앱과 daemon 스케일 분리 | 앱 BE **내부** Redis/SQS 등 **선택** (consumer = 앱 BE 워커) |
| **OD만 믿기** | 무제한 `POST /api/runs` | **비권장** |

플랫폼(Teamver Main)에 **전역 job queue** 가 있어도, 그것은 **앱 밖** 이다. OD 과부하를 막는 마지막 문은 여전히 **design-app BE가 OD 호출 전에 ①②를 적용하는지** 이다.

### 운영 파라미터 (예시)

| 정책 | 값 (튜닝) |
|------|-----------|
| 사용자당·workspace당 동시 **앱 run** `running` | 1~2 |
| **daemon 인스턴스당** 동시 OD run (`POST /api/runs` 후 terminal 전) | 1~3 |
| `waiting_od_slot` 최대 대기 | TTL 후 failed 또는 사용자 취소 |
| run 전체 타임아웃 | SSE idle + export 상한 (예: 30~90분) |

---

## 심화: 비동기 연동으로 충분한가?

**예 — 두 겹의 비동기가 맞다.**

| 구간 | 방식 |
|------|------|
| **FE ↔ design-app BE** | 생성 요청은 **즉시 202 + appRunId**; FE는 상태 API/SSE로 추적 |
| **design-app BE ↔ OD** | **`POST /api/runs` 202 + `runId`**; 완료까지 SSE/폴링; OD → 앱 callback **없음** |

동기로 남겨도 되는 OD 호출: `GET /api/health`, `GET /api/ready`, 짧은 project/export 메타 — **초 단위**.

동기로 **하면 안 되는** 것: 사용자 HTTP 하나에 OD chat/run 끝까지 붙잡기 (`POST /api/chat` 장시간 hold를 FE→OD 직결로 쓰는 것).

---

## 심화: 요청이 너무 많으면?

OD에 **문서화된 전역 rate limit** 이 없다. 병목은 **agent spawn·미디어·플러그인** 이다.

| 계층 (design-app 중심) | 대응 |
|------------------------|------|
| **design-app BE API** | 사용자/workspace rate limit; `pending` 초과 시 429 |
| **① 앱 run 대기열** | FIFO·우선순위; 오래된 `pending` TTL |
| **② OD 슬롯** | 만수면 `waiting_od_slot` — **새 `POST /api/runs` 안 함** |
| **FE** | OD 직접 호출 금지; 중복 클릭 idempotency |
| **daemon scale-out** | 인스턴스별 `OD_DATA_DIR`; 앱 BE가 **healthy daemon** 에만 발행 (라우팅 테이블) |
| **OD 내부 실패** | provider 429 등 → run `failed` / `resumable` — 앱 run 정책으로 재시도 |

---

## 심화: daemon 먹통·과부하 — 어떻게 아는가, 어떻게 막는가?

판단·조치 주체는 **design-app BE** (OD를 모니터링하고 **발행을 멈출 수 있어야** 함).

### 신호 (open-design)

| probe | 의미 | 앱 BE 동작 |
|-------|------|------------|
| `GET /api/health` | liveness | 실패 → daemon **down**, ② circuit open, `waiting_od_slot` 유지 |
| `GET /api/ready` | shutting down 시 **503** | 새 `POST /api/runs` 중단, 재시도 backoff |
| `GET /api/daemon/status` | ops 스냅샷 | 메트릭·알림 |
| `GET /api/runs?status=running` | 현재 부하 | count ≥ 상한 → **과부하**, ②만으로도 새 발행 금지 |
| `GET /api/runs/:id` | stuck run | timeout 시 `POST …/cancel` |
| latency / SSE idle | 느린 degenerate | circuit · 사용자 메시지 |

**health OK + running 만수 + 지연** → “살아 있지만 받으면 안 됨” — liveness만 믿지 않는다.

### 예방

| 항목 | 방안 |
|------|------|
| 발행 전 | `ready` + agents + ② 슬롯 |
| circuit breaker | 연속 실패 N회 → 일정 시간 OD 호출 중단 |
| 타임아웃 | SSE idle → cancel → 앱 run `failed` |
| 배포 | rolling 시 `ready` 503 → 앱은 발행만 멈추고 **pending은 DB에 유지** |
| 프로세스 | OD 재시작은 orchestrator; 앱 BE가 OD를 직접 kill 하지 않음 |

---

## 참고: open-design 측 한계

- Multi-tenant auth/billing·공정 큐는 OD 비목표 ([03_키_저장소_Drive_DB](./03_키_저장소_Drive_DB.md)).
- `OD_DAEMON_DB=postgres` 등은 운영 모델과 별도; sidecar에서는 **SQLite + 볼륨** 이 일반적.

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-12 | 초안 |
| 2026-06-12 | **teamver-design-app = FE+BE**, queue·부하 논의를 **앱 ↔ OD 경계** 로 재작성 |
