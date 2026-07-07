# Teamver Design — 동시 접속·용량·확장 가이드

**목적:** `UVICORN_WORKERS=5`·동시 AI 이용·export cap·multi-daemon 확장을 **한 문서에서** SSOT로 정리한다.  
**AI 동시성 핵심:** [§5](#5-ai-동시-이용--한-명이-쓰면-나머지는-대기-ssot) — embed BYOK proxy는 **전역 1명 직렬이 아님**.

**관련 SSOT**

| 문서 | 내용 |
|------|------|
| [07 EC2·배포·인프라](./07_VM_배포_인프라.md) §4 | Staging/Production 리소스·ENV 표 |
| [34 Export 성능 개선](./34_Export_성능_개선_로드맵.md) §6·§13 | export concurrent·Chromium pool·메모리 산식 |
| [02 design-app ↔ daemon](./02_design-app_daemon_연동.md) | multi-daemon·queue·circuit breaker (Track B) |
| [29 BYOK api mode vs runs](./29_BYOK_api_mode_vs_runs_아키텍처.md) | embed 부하 축 (SSE·proxy·polling) |
| [04 구현 우선순위](./04_구현_우선순위.md) Track B | 출시 후 scale 작업 목록 |
| [39 이중화·HA 로드맵](./39_0_Design_이중화_로드맵_개요.md) | Phase 0~5 · ALB sticky · scratch·SQLite 제약 |

**코드·설정 SSOT:** `deploy/teamver/.env.{staging,production}`, `deploy/teamver/docker-compose.yml`, `deploy/teamver/be/Dockerfile`

---

## 1. 한 줄 결론

> **`UVICORN_WORKERS=5`는 “동시 접속 5명”이 아니다.**  
> design-api **프로세스 5개**이며, worker당 **최대 150개**의 동시 HTTP 연결을 받을 수 있다 (production 기준 이론 상한 **750 연결**).  
> **일반 브라우징·편집**은 수십~수백 동시 사용자까지 API 레이어에서 막히지 않는다.  
> **슬라이드 AI 생성** — Teamver embed는 **전역 1명 직렬이 아니다.** workspace당 기본 **8**개 동시 BYOK 스트림; 다른 workspace·다른 사용자는 **동시에** AI 이용 가능 ([§5](#5-ai-동시-이용--한-명이-쓰면-나머지는-대기-ssot)).  
> **PDF export**처럼 CPU/RAM을 많이 쓰는 작업은 **단일 OD daemon**이 병목이며, export만 별도 cap(`OD_EXPORT_MAX_CONCURRENT`)이 있다.  
> **OD daemon 다중 노드**는 현재 아키텍처(SQLite 단일 writer·로컬 scratch·SSE sticky)상 **바로 ALB 뒤 replica 2+로 늘리면 안 된다.** 단기에는 **EC2 스펙 업(t3.2xlarge)** + export ENV 튜닝, 중기에는 **export worker 분리**, 장기에는 **Track B (Postgres DaemonDb + 라우팅/큐)** 가 정석이다.

---

## 2. 왜 “5”가 헷갈리는가

Teamver Design 인프라 문서·`.env.production`에 같이 등장하는 숫자들은 **서로 다른 축**을 가리킨다.

| 숫자 | 무엇을 의미하나 | 동시 “사용자”와의 관계 |
|------|----------------|------------------------|
| **`UVICORN_WORKERS=5`** | teamver-design-api **OS 프로세스 수** (production) | ≠ 사용자 수. 프로세스 1개가 **수백 개의 async HTTP 요청**을 동시에 처리 |
| **`UVICORN_LIMIT_CONCURRENCY=150`** | **worker 1개당** 동시 in-flight HTTP 연결 상한 | prod: 5 × 150 = **750** (이론 ceiling) |
| **`OD_EXPORT_MAX_CONCURRENT=6`** | daemon 안에서 **동시 Chromium PDF/이미지 render** 슬롯 | export **버튼을 동시에 누른 사람**만 해당 (6명까지 병렬, 나머지는 큐 대기) |
| **`DB_POOL_SIZE=8`** (× worker 5) | design-api → **RDS Postgres** 연결 풀 | API가 DB에 동시에 붙는 연결 수 (최대 약 80) |
| **workspace `max_members` (요금제)** | 조직 **좌석(seat)** 수 (예: Plus 6명) | 동시 접속 제한이 **아님** — 멤버십 상한 |
| **`OD_BYOK_PROXY_MAX_PER_WORKSPACE`** | **workspace당** 동시 BYOK AI 스트림 (embed) | 미설정 시 **8**; `0` = cap 비활성. **전역 1명 제한 아님** — [§5](./38_Design_동시성_용량_확장_가이드.md#5-ai-동시-이용--한-명이-쓰면-나머지는-대기-ssot) |

**흔한 오해:** “production에 worker 5 → 5명만 접속 가능”  
**실제:** worker 5는 **API 처리량·CPU 활용**을 위한 설정이고, embed 사용자 수와 1:1로 대응하지 않는다.

---

## 3. 요청이 지나가는 경로

```text
[브라우저]
   │
   ├─ stg-design / design (nginx :443)
   │     └─ :7456 open-design-daemon  ← UI 정적 + /api/* (에이전트·파일·export·SSE)
   │
   └─ stg-design-api / design-api (nginx :443)
         └─ :16000 teamver-design-api  ← SSO·bootstrap·registry·runtime-config·usage BFF
                │
                └─ (간접) Main BE stg-api / api.teamver.com
                      bootstrap · session-check · Drive · billing
```

**역할 분리**

| 컴포넌트 | 하는 일 | LLM 호출 |
|----------|---------|----------|
| **design-api** (FastAPI, uvicorn) | 세션·프로젝트 registry·runtime-config·usage 중계 | **없음** — 가벼운 REST |
| **open-design-daemon** (Node) | 프로젝트 파일·채팅 run·agent spawn·export·SSE | **BYOK/관리형 API로 외부 호출** — EC2 CPU는 오케스트레이션·I/O·Chromium |
| **Main BE** | Teamver 플랫폼 SSO·Drive·과금 | AI Apps 공통 |

OD EC2는 **LLM 추론 서버가 아니다** ([07 §4](./07_VM_배포_인프라.md)). 모델 연산은 Anthropic 등 **외부 API**에서 일어난다.

---

## 4. “동시 접속”을 시나리오별로 나누기

동시 사용자 수는 **무엇을 하느냐**에 따라 체감 한계가 완전히 다르다.

### 4.1 홈·목록·설정 (가벼움)

- 예: `/` 접속, recent projects, auth/session, runtime-config
- **병목:** design-api worker + RDS pool + nginx
- **대략적 여유 (production, t3.2xlarge):** 수십~**100+** 동시 “페이지 머무름” 가능 (대부분 I/O wait, LLM 없음)
- staging `t3.large` + worker 2도 **데모·QA 수준**의 동시 접속에는 보통 충분

### 4.2 슬라이드 AI 생성 (무거움)

- Teamver embed: **`POST /api/proxy/…/stream`** (BYOK) — **전역 1명 직렬 아님** ([§5](#5-ai-동시-이용--한-명이-쓰면-나머지는-대기-ssot))
- workspace당 기본 **8** 동시 stream; 초과 시 **429** (다른 workspace는 독립)
- run마다 scratch 디스크·S3 sync·장시간 SSE 연결 유지
- **동시 run 상한:** 코드에 “전역 N명만” ENV는 없으나, **CPU·RAM·디스크 I/O**가 사실상 cap
  - staging `t3.large` (2 vCPU): **동시 2~3 run**부터 latency·export queue 체감 가능 ([34 §6.2.1](./34_Export_성능_개선_로드맵.md))
  - production `t3.2xlarge` (8 vCPU): **동시 5~10 run**도 가능하나, peak 시 응답 지연 증가

### 4.3 PDF / ZIP / Image export (Chromium, 매우 무거움)

- `OD_EXPORT_MAX_CONCURRENT` + browser pool + queue ([34 §13.1](./34_Export_성능_개선_로드맵.md))
- staging: **4** 슬롯 병렬 / production: **6** (피크 **8**)
- 10명이 **동시에** PDF 다운로드 → 4~6명은 바로 처리, 나머지는 **큐에서 20~40초+ 대기** (deck 크기에 비례)
- **이 숫자만** “동시 N명”에 가깝지만, **export 클릭**에만 해당

### 4.4 멀티탭·백그라운드 run

- 같은 사용자가 탭 2개 → SSE·polling·PUT persist가 추가 ([27 메시지 Persist PUT](./27_메시지_Persist_PUT_아키텍처.md))
- “사용자 5명”이 “HTTP 연결 15~30개”처럼 보일 수 있음 — **정상**

---

## 5. AI 동시 이용 — “한 명이 쓰면 나머지는 대기?” (SSOT)

**관련:** [29 BYOK api mode vs runs](./29_BYOK_api_mode_vs_runs_아키텍처.md) §10 · 코드 `apps/daemon/src/byok-proxy-workspace-limit.ts` · `chat-routes.ts` · `runs.ts`

### 5.0 한 줄 결론

> **아니다.** 현재 Teamver Design embed에는 **“한 명이 AI를 쓰면 다른 모든 사용자가 줄 서야 한다”** 는 **전역 직렬 잠금이 없다.**  
> 여러 사용자·여러 workspace가 **동시에** 슬라이드 생성(BYOK proxy stream)을 시작할 수 있다.  
> 제한은 (1) **workspace당 동시 스트림 cap** (기본 8), (2) **EC2 CPU/RAM**에 의한 **체감 지연**, (3) **export 전용 큐** — 이 세 가지이며, (1)만 **429로 명시 거절**하고 (2)(3)는 느려지거나 export만 대기한다.

### 5.1 두 가지 AI 실행 경로 (daemon vs api)

Open Design 웹 UI는 `config.mode` 에 따라 LLM 호출 경로가 **완전히 다르다** ([29 §1](./29_BYOK_api_mode_vs_runs_아키텍처.md)).

```text
                    ┌─────────────────────────────────────────┐
                    │           open-design-daemon             │
                    │  (단일 Node 프로세스, 다중 요청 동시 처리)   │
                    └─────────────────────────────────────────┘
         ▲                                    ▲
         │                                    │
  mode=daemon                          mode=api (Teamver embed)
         │                                    │
  POST /api/runs                       POST /api/proxy/{provider}/stream
  → subprocess (CLI agent)             → upstream LLM fetch + BYOK tools
  → GET /api/runs/:id/events (SSE)     → 장시간 SSE (proxy 응답)
  → daemon run row 생성                 → daemon run row 없음 (proxy 중심)
```

| 항목 | `mode=daemon` (로컬 OD) | `mode=api` (Teamver embed **강제**) |
|------|-------------------------|-------------------------------------|
| 브라우저 진입 API | `POST /api/runs` | `POST /api/proxy/anthropic/stream` 등 |
| 동시 실행 단위 | **run** (Map에 N개) | **proxy stream** (연결 N개) |
| 전역 “1 run만” 잠금 | **없음** | **없음** |
| Teamver EC2에서 사용 | ❌ (로컬 CLI 필요) | ✅ |

**Teamver 상용 embed는 항상 `mode=api`.** 따라서 “`POST /api/runs` 가 1개라서 1명만?” 같은 추론은 **해당 없음**.

코드: `apps/web/src/teamver/` — `applyTeamverRuntimeConfig` → `mode: "api"`.  
`ProjectView.tsx` — `streamMessage()` → proxy endpoint.

### 5.2 동시에 여러 명이 AI를 쓰면 daemon 내부에서 무슨 일이 일어나나

#### 5.2.1 BYOK proxy stream (embed 기본)

1. 사용자 A가 메시지 전송 → `POST /api/proxy/anthropic/stream` (body에 `conversationId`, `projectId`, …)
2. `chat-routes.ts` 가 materialization(필요 시 scratch sync-down) 후 **`tryAcquireWorkspaceProxySlot(workspaceId)`** 호출
3. 슬롯 확보 시 upstream Anthropic/OpenAI 로 **장시간 streaming `fetch`**
4. tool call 시 daemon BYOK tools (file write, image, …) — **같은 daemon 프로세스**에서 interleaved
5. 턴 종료 시 message PUT → S3 sync-up hook ([29](./29_BYOK_api_mode_vs_runs_아키텍처.md))

**사용자 B, C도 동일 경로로 동시에 (2)~(5) 진행 가능** — Node.js event loop + async I/O.  
LLM 추론 자체는 **외부 API**에서 수행; daemon CPU는 파싱·tool·파일 I/O·SSE 전달.

#### 5.2.2 `POST /api/runs` (embed 아님, 참고)

- `createChatRunService()` — `runs` Map에 run id별로 상태 보관 (`apps/daemon/src/runs.ts`)
- `POST /api/runs` 마다 **새 run** 생성; 기존 run과 **직렬화되지 않음**
- run마다 agent subprocess spawn — **동시 N run = N subprocess** (로컬 데스크톱·headless CLI 환경)

Teamver embed는 이 경로를 **쓰지 않지만**, “daemon이 run을 1개만 허용한다”는 설계가 **아님**을 보여 준다.

### 5.3 하드 cap — 코드에 정의된 상한

#### 5.3.1 workspace당 BYOK proxy 스트림 (`OD_BYOK_PROXY_MAX_PER_WORKSPACE`)

**파일:** `apps/daemon/src/byok-proxy-workspace-limit.ts`

| ENV | 동작 |
|-----|------|
| **미설정** | **기본 8** — workspace당 동시 active proxy stream 최대 8 |
| **양의 정수 N** | workspace당 최대 N |
| **`0`** | cap **비활성** (무제한; abuse·OOM 위험 — 상용 비권장) |

**스코프:** `readTeamverIdentityFromRequest(req).workspaceId` 기준.  
→ **workspace A 8명이 동시 생성 중**이어도 **workspace B는 독립** (각각 자기 cap까지).

**초과 시:** `chat-routes.ts` → HTTP **429** `TOO_MANY_REQUESTS`  
메시지: `too many concurrent BYOK proxy streams for this workspace`

```text
workspace-A: [stream1][stream2]…[stream8]  ← 9번째는 429
workspace-B: [stream1][stream2]              ← A와 무관하게 진행
```

**테스트 SSOT:** `apps/daemon/tests/byok-proxy-workspace-limit.test.ts` — default 8, cap 2 시 3번째 reject.

**배포 ENV:** `deploy/teamver/.env.{staging,production}.example` — [38 §5.8](#58-env-튜닝-ai-동시성)

#### 5.3.2 daemon 전역 active proxy registry 상한

**파일:** `apps/daemon/src/byok-proxy-abort.ts` — `MAX_ACTIVE_PROXY_STREAMS = 4096`

- 전체 daemon에 등록된 active proxy handler 상한 (메모리 leak 방지)
- 상용 1호기(수십~수백 동시 사용자)에서는 **사실상 도달 안 함**
- 도달 시 신규 stream 거절 — 극단적 abuse/버그 시나리오

#### 5.3.3 export 전용 semaphore (AI와 분리)

**파일:** `apps/daemon/src/export-runtime.ts` — `OD_EXPORT_MAX_CONCURRENT`

- PDF/ZIP/image headless render만 직렬화·병렬 cap
- **AI 채팅 proxy와 별도 큐** — 한 명이 PDF export 중이어도 다른 사람 AI 채팅은 **원칙적으로 가능** (단, 같은 EC2 CPU/RAM 경쟁)

#### 5.3.4 명시적으로 **없는** 것

| 가정 | 실제 |
|------|------|
| 전역 mutex “AI 1명” | **코드 없음** |
| `POST /api/runs` 전역 큐 | **없음** (embed는 POST 자체 안 함) |
| design-api `UVICORN_WORKERS` = 동시 AI 사용자 수 | **무관** — AI는 daemon proxy |

### 5.4 소프트 cap — EC2 리소스 (거절 없이 느려짐)

하드 429 없이 **모두 동시에 시작**해도, vCPU·RAM·디스크 I/O가 포화되면:

| 증상 | 원인 |
|------|------|
| 스트리밍 토큰 간격 ↑ | CPU 스케줄링·tool I/O |
| tool write·S3 sync 지연 | scratch disk·네트워크 |
| export + AI 동시 시 전체 체감 ↓ | Chromium + proxy + Node heap 경쟁 |

**staging `t3.large` (2 vCPU):** 동시 **3~5** AI stream부터 체감 지연 흔함.  
**production `t3.2xlarge` (8 vCPU):** 동시 **5~10+** stream까지 “완료는 되나 느림” 구간.

→ **대기열 UI 없이** “느려진다”는 형태의 혼잡 — ops에서 EC2·ENV로 완화.

### 5.5 같은 프로젝트·같은 workspace — 동시 편집

**다른 사용자 / 다른 프로젝트:** 일반적으로 **독립** — 서로 AI 대기 강제 없음.

**같은 `projectId`에 동시 run/proxy (드묾):**

- `project-materialization-runtime.ts` — concurrent run 시 sync-down 일부 **skip** (로그: `concurrent run on ${projectId} — v1 allows one materialized run`)
- **새 AI 시작을 막지는 않음** — S3 materialization 경쟁·일시적 502/지연 가능
- **권장:** 동일 프로젝트 동시 편집은 제품상 비권장; workspace 단위 동시 **서로 다른 프로젝트** 생성은 정상 use case

### 5.6 턴당 daemon HTTP 부하 (동시 N명일 때)

BYOK embed 1턴 (1사용자) 대략 ([29 §7.2](./29_BYOK_api_mode_vs_runs_아키텍처.md)):

| 요청 | 빈도 | 동시 5명 × |
|------|------|------------|
| `POST /api/proxy/…/stream` | 1×/턴 (수분 SSE) | 5 장기 연결 |
| `PUT …/messages/:id` | throttle ~5s | 최대 ~1 PUT/s/턴 (스트리밍 중) |
| `GET /api/files`, `/raw` | tool 시 | burst |
| `GET /api/runs` | adaptive poll | 가벼운 `[]` (BYOK에 run 없음) |

**5명 동시 ≠ 5배 “막힘”.** 지배 비용은 **외부 LLM API** + daemon **장기 SSE** + **scratch I/O**.

### 5.7 사용자·운영자에게 보이는 증상 매트릭스

| 상황 | 사용자 A | 사용자 B (다른 workspace) | 사용자 C (같은 workspace, 9번째 stream) |
|------|----------|---------------------------|----------------------------------------|
| A만 슬라이드 생성 | 정상 | 정상 (동시 가능) | — |
| A~H 동시 생성 (같은 ws) | 정상 | — | 정상 (8까지) |
| 9명 동시 생성 (같은 ws) | 정상 (8 슬롯 중 1) | 다른 ws 정상 | **429** 또는 재시도 필요 |
| 5명 동시 + staging 2 vCPU | 느림 | 느림 | 느림 (429 아님) |
| 5명 동시 PDF 클릭 | AI 가능 | AI 가능 | export만 **큐 대기** (4~6 parallel) |

### 5.8 ENV 튜닝 (AI 동시성)

| ENV | 권장 (상용) | 설명 |
|-----|-------------|------|
| `OD_BYOK_PROXY_MAX_PER_WORKSPACE` | **8** (default) 또는 플랜별 조정 | Plus 6 seat → default 8이면 seat 내 동시 생성 OK |
| `OD_MEM_LIMIT` | prod **8g** | proxy + tools + export heap 여유 |
| `OD_EXPORT_MAX_CONCURRENT` | prod **6** | AI와 CPU 경쟁 완화 — export 분리 효과 |
| EC2 | prod **t3.2xlarge** | soft cap 완화 |

**cap 올리기:** `OD_BYOK_PROXY_MAX_PER_WORKSPACE=16` — 429는 줄지만 **OOM·CPU** 위험 ↑. **EC2 스펙과 함께** 조정.

**cap 끄기 (`0`):** 테스트 전용; prod **금지**.

### 5.9 검증 체크리스트 (staging/prod)

```bash
# 1) 동시 proxy 허용 확인 — workspace 2개에서 각각 생성 시작 (브라우저 2 시크릿 + workspace switch)

# 2) 429 재현 (테스트 ENV만)
# .env에 OD_BYOK_PROXY_MAX_PER_WORKSPACE=2 로 낮춘 뒤 같은 workspace에서 3탭 동시 전송
# → 3번째 Network 429 TOO_MANY_REQUESTS

# 3) daemon 로그 — workspace limit
docker logs teamver-open-design-daemon 2>&1 | grep od_byok_proxy_workspace_limit

# 4) 동시 run/proxy 중에도 다른 사용자 health
curl -sf http://127.0.0.1:7456/api/health

# 5) export는 별도 — AI 중 PDF 6+ 동시 → export 503/Retry-After (OD_EXPORT_QUEUE_MAX)
```

**부하 시나리오 (상용 전):**

1. workspace **3명** 동시 슬라이드 생성 → 모두 **완료** (staging은 느려도 OK)
2. workspace **1개**에서 **8명** 동시 → 8 성공 / 9번째 429 (default cap)
3. **2 workspace × 5명** → 10 stream 동시 (workspace cap은 **독립**)

### 5.10 FAQ (AI 동시성)

#### Q1. 한 명이 생성 중이면 다른 사람 버튼이 비활성화되나?

**아니다** (다른 사용자·다른 프로젝트). FE에 전역 lock 없음. 같은 브라우저 탭 내 composer lock은 **그 대화만**.

#### Q2. `GET /api/runs` 가 비어 있는데 동시에 여러 명이 쓰는 거 맞나?

**맞다.** BYOK는 daemon run row 없음 ([29 §1.2](./29_BYOK_api_mode_vs_runs_아키텍처.md)). polling은 empty `[]` — **동시 이용과 모순 아님**.

#### Q3. managed API / BYOK 키 rate limit은?

Anthropic 등 **업스트림 429** — daemon workspace cap과 별개. 고객 키 quota 소진 시 **그 사용자만** 실패.

#### Q4. 429 말고 “무한 로딩”만 보이면?

workspace cap이 아니라 **Main BE 502**, **S3 materialization**, **scratch disk**, **daemon OOM restart** 의심 — [36 BFF 401](./36_BFF_auth_refresh_401_정리.md), [20 Hybrid](./20_Design_Hybrid_저장소_로컬_S3_가이드.md).

#### Q5. 상용에서 workspace cap을 요금제 seat와 맞출까?

| 플랜 | seat | default cap 8 |
|------|------|----------------|
| Plus | 6 | seat ≤ cap → **동시 6명 생성 OK** |
| Pro | 12 | cap 8이면 **이론상 9~12번째 동시 생성은 429** — 필요 시 cap=12~16 + EC2 |

제품 정책: seat = **멤버십**, cap = **동시 AI stream** — 별도 knob.

---

## 6. UVICORN worker 상세 (design-api)

### 6.1 worker가 하는 일

```dockerfile
# deploy/teamver/be/Dockerfile
uvicorn app.main:app --workers ${UVICORN_WORKERS} \
  --limit-concurrency ${UVICORN_LIMIT_CONCURRENCY} ...
```

- **worker = 별도 Python 프로세스** (fork). GIL 회피·멀티코어 활용.
- FastAPI + **asyncpg/httpx** 기반이라 worker 1개가 **수백 개의 idle/wait 중인 요청**을 동시에 들고 있을 수 있다.
- `--limit-concurrency`는 worker **하나**에 붙는 동시 연결 **안전장치** (무한 accept 방지).

### 6.2 production SSOT

| ENV | Staging | Production |
|-----|---------|------------|
| EC2 | `t3.large` (2 vCPU, 8 GiB) | `t3.2xlarge` (8 vCPU, 32 GiB) |
| `UVICORN_WORKERS` | **2** | **5** |
| `UVICORN_LIMIT_CONCURRENCY` | 200 (worker당) | **150** (worker당) |
| 이론 HTTP 동시 연결 상한 | 2 × 200 = **400** | 5 × 150 = **750** |
| `DB_POOL_SIZE` / `MAX_OVERFLOW` | 10 / 10 | 8 / 8 (worker당 → 최대 ~80 conn) |

**staging에서 worker=2인 이유:** 2 vCPU EC2에서 design-api와 **OD daemon·Chromium이 CPU를 나눠 쓰므로**, API worker를 5로 올리면 daemon/export 쪽이 굶주릴 수 있다 (`.env.staging.example` 주석).

### 6.3 worker 5 → 10으로 올리면?

- **효과:** design-api REST 처리량 ↑ (세션·registry burst)
- **한계:** daemon·export·동시 AI run 병목은 **그대로**
- **부작용:** RDS 연결 수 ↑ (pool × worker), EC2 RAM 분할
- **권장:** daemon/export 병목이 아닌 **BFF 503·latency**가 design-api에서만 보일 때 검토

---

## 7. OD daemon 단일 노드 용량 (현재 아키텍처)

MVP·상용 1호기는 **EC2 1대 + daemon 컨테이너 1개** ([07 §7](./07_VM_배포_인프라.md)).

### 7.1 ENV 기반 export cap

| ENV | Staging | Production | 의미 |
|-----|---------|------------|------|
| `OD_MEM_LIMIT` | 1536m~2g | **6g~8g** | daemon+cgroup — Chromium 전제 |
| `NODE_OPTIONS` | `--max-old-space-size=1024` | `--max-old-space-size=4096` | Node heap |
| `OD_EXPORT_MAX_CONCURRENT` | **4** | **6** (피크 8) | 동시 headless render |
| `OD_EXPORT_BROWSER_POOL_SIZE` | **2** | **3** | warm browser |
| `OD_EXPORT_QUEUE_MAX` | 32 | 64 | 초과 시 **503 + Retry-After** |

**메모리 산식 (rough, [34 §17](./34_Export_성능_개선_로드맵.md)):**

- Chromium headless 1 job: **~400–900 MiB** (deck·inline 리소스)
- Node daemon baseline: **~300–500 MiB**
- concurrent 6 + pool 3 + 여유 → production **`OD_MEM_LIMIT` 8g** 권장

### 7.2 vCPU 가이드

- export 슬롯 1개 ≈ **0.5~1 vCPU**
- `t3.2xlarge` + concurrent **6~8** = 상용 **단일 daemon** 현실적 상한 ([34 §6.2.1](./34_Export_성능_개선_로드맵.md))
- **동시 사용자 ≠ export concurrent** — 대부분은 편집·대기·SSE idle

---

## 8. OD daemon을 여러 노드로 늘릴 수 있나?

### 8.1 짧은 답

| 질문 | 답 |
|------|-----|
| 지금 compose/nginx만 바꿔서 **daemon replica 2+** 가능? | **아니오 (위험)** |
| **EC2 1대 스펙 업**으로 개선? | **예 — 현재 1순위** |
| **export만 별도 worker**로 분리? | **예 — 중기 로드맵** ([34 Phase 3](./34_Export_성능_개선_로드맵.md)) |
| **daemon 다중 + 로드밸런싱**? | **Track B** — Postgres DaemonDb·프로젝트 affinity·큐 필요 ([02](./02_design-app_daemon_연동.md), [04 Track B](./04_구현_우선순위.md)) |

### 8.2 왜 바로 multi-daemon이 안 되는가

**1) SQLite 단일 writer**

- daemon 메타(`app.sqlite`)는 **로컬 파일 + EBS** ([03 키·Drive·DB](./03_키_저장소_Drive_DB.md))
- `OD_DAEMON_DB=postgres`는 **스텁·미완** — Helm/AWS template도 **replica 1 고정** 명시
- replica 2+ → 동시 write 시 **DB corruption** 또는 split-brain

**2) 로컬 scratch + materialization**

- 프로젝트 파일은 S3 SSOT이지만, run 중 **scratch는 daemon 로컬** ([20 Hybrid 저장소](./20_Design_Hybrid_저장소_로컬_S3_가이드.md))
- 같은 `projectId` 요청이 **다른 daemon**으로 가면 materialization·sync-up 경쟁 ([daemon `project-materialization-runtime`](../../apps/daemon/src/storage/project-materialization-runtime.ts) — concurrent run guard)
- **sticky session (projectId → daemon)** 없이 LB round-robin 불가

**3) SSE / 장기 연결**

- 채팅 run은 **SSE** — nginx `proxy_buffering off`, 긴 timeout ([07 §6](./07_VM_배포_인프라.md))
- run 시작한 daemon과 **같은 인스턴스**에 SSE가 붙어야 함 → **L7 sticky** 또는 **project affinity 라우팅** 필수

**4) Litestream·백업**

- SQLite → S3 replica (Litestream). 다중 writer와 양립 어려움

**5) Teamver embed 가정**

- 현재: **1 EC2 = 1 daemon = 1 od-data EBS**
- registry·nginx auth·`OD_API_TOKEN` 모두 single-host 전제

### 8.3 “여러 OD node”가 가능해지려면 (Track B)

[02 design-app ↔ daemon](./02_design-app_daemon_연동.md) · [04 Track B](./04_구현_우선순위.md):

```text
[ALB / nginx]
   ├─ design-api (replica N)     ← stateless, scale-out OK
   └─ daemon pool (replica M)    ← 아래 전제 필요
         ├─ OD DaemonDb → Postgres (단일 SSOT, multi-writer)
         ├─ 프로젝트/run → daemon 라우팅 (hash or registry)
         ├─ design-api BE: run 발행 슬롯·circuit breaker·queue
         └─ scratch: S3-first 또는 node-local + affinity
```

| Track B 항목 | 상태 | 역할 |
|--------------|------|------|
| B1 job/run API (wrapper) | ☐ | OD 호출 전 큐·슬롯 |
| B4 circuit breaker·슬롯 | ☐ | 과부하 daemon skip |
| B5 OD `DaemonDb` Postgres | ☐ upstream | SQLite 탈출 |

**출시 전 MVP:** Track B **미구현** — **단일 daemon** 전제로 운영.

### 8.4 multi-daemon 없이 할 수 있는 개선 (현실적 순서)

#### Phase A — 지금 (vertical scale, ENV) ✅ 권장

1. Production EC2 **`t3.2xlarge`** (8 vCPU, 32 GiB)
2. `UVICORN_WORKERS=5`, `OD_MEM_LIMIT=8g`, `OD_EXPORT_MAX_CONCURRENT=6`
3. od-data EBS bind (`OD_DATA_HOST_PATH`) — root 디스크와 분리
4. export cache (`OD_EXPORT_CACHE_ENABLED=1`) — 재다운로드 부하 ↓

**기대:** 동시 **브라우징** 수십 명 + 동시 **AI run** 수 명 + export **6 parallel** + queue

#### Phase B — export worker 분리 (중기)

[34 §9 Phase 3](./34_Export_성능_개선_로드맵.md) · [00 loop 175 archive](./00_구현_내역_누적.md):

- Chromium render만 **별도 프로세스/컨테이너/ECS task**
- 메인 daemon/API는 export queue publish → worker가 S3 `exports/`에 적재
- **async job** (202 + poll) — 30s+ deck PDF

**효과:** export spike가 **전체 daemon restart(OOM)** 로 이어지는 것 방지

#### Phase C — daemon horizontal (장기)

- Postgres DaemonDb + project affinity LB
- design-api wrapper queue ([02](./02_design-app_daemon_연동.md))
- (선택) Redis/SQS export job store

---

## 9. Staging vs Production — “몇 명까지?” 요약표

**법적/요금제 seat가 아닌, 기술적 체감 한도 (rough).**

| 시나리오 | Staging (`t3.large`, worker 2) | Production (`t3.2xlarge`, worker 5) |
|----------|-------------------------------|-------------------------------------|
| 로그인·홈·목록만 | ~20–50명 동시 | ~50–100+명 동시 |
| 슬라이드 생성 (AI, embed) | **8**/workspace parallel (default), 다른 ws 독립 | **8**/ws + EC2 여유로 **5~10+** parallel (soft) |
| 슬라이드 생성 (`POST /api/runs`, 비-embed) | 다중 subprocess run | 동일 daemon, CPU bound |
| PDF export 동시 클릭 | **4** parallel, 나머지 queue | **6** parallel, 나머지 queue |
| design-api HTTP 연결 (이론) | ~400 | ~750 |

**시연·QA (staging):** 동시 **5명**이 각자 슬라이드 생성 + 가끔 PDF → **가능하나**, 5명이 **동시에 PDF**만 누르면 1명은 큐 대기.

**상용 오픈 (production, Phase A 적용 후):** 동시 접속 “5명 제한” **없음**. 병목은 **AI run·export burst** 구간.

---

## 10. FAQ

### Q1. `UVICORN_WORKERS=5`면 6번째 사용자는 503?

**아니다.** 6번째 **브라우저 탭**도 대부분 정상. worker는 **HTTP 연결** 단위이며 async로 multiplexing 한다.  
503은 `OD_EXPORT_QUEUE_MAX` 초과·daemon OOM restart·Main BE down 등 **다른 원인**에서 발생.

### Q2. staging에서 동시 5명 시연이 불안하면?

1. **EC2 타입** — demo peak면 `t3.large` → `t3.xlarge` 검토  
2. **동시 export** — 5명에게 PDF 동시 클릭 말고 순차 안내  
3. **full stack 기동** — daemon+design-api+litestream 모두 up ([07](./07_VM_배포_인프라.md))  
4. **Main BE** (`stg-api`) healthy — design-api bootstrap 502면 전체 embed 불능

### Q3. design-api만 replica 3으로 늘리면?

**가능 (stateless).** 다만 현재 compose는 **EC2 1대 1 compose** — ALB 뒤 **EC2 여러 대** 또는 **design-api container scale** 필요.  
**daemon 1대** 병목은 그대로. BFF latency만 완화.

### Q4. OD node 2대 behind ALB?

**현재 코드로는 비권장.** SQLite·scratch·SSE sticky 미해결.  
**차선:** Active-Passive (장애 시 수동/자동 failover, **항상 writer 1**) — AWS ECS template 주석과 동일 패턴.

### Q5. LLM API rate limit은?

Anthropic 등 **외부 quota** — EC2 worker 수와 무관. BYOK면 고객 키 한도, managed면 Teamver 키 풀 정책.

### Q6. 요금제 `max_members` 6명과 혼동?

Plus **6명** = workspace **멤버십** 상한 ([teamver_plan_billing_ui.md](../../../0.%20docs/teamver_plan_billing_ui.md)).  
6명이 **동시에** 접속 못 한다는 뜻이 **아님**.

### Q7. 한 명이 AI 작업 중이면 다른 사람은 AI를 못 쓰고 대기해야 하나?

**아니다** — 전역 직렬 잠금 없음. embed는 BYOK proxy **다중 stream**.  
같은 workspace **9번째** 동시 stream만 **429** (default cap 8).  
다른 workspace·느려짐(soft cap)은 [§5](#5-ai-동시-이용--한-명이-쓰면-나머지는-대기-ssot) SSOT.

---

## 11. 운영 체크리스트

### 용량 의심 시

```bash
# EC2
df -h / /opt/teamver-design/od-data
docker stats --no-stream

# export queue (daemon log)
# od_export_done / od_export_failed / queue_wait_ms — [34 §6.3]

# design-api
curl -sf http://127.0.0.1:16000/health

# daemon
curl -sf http://127.0.0.1:7456/api/health
curl -sf http://127.0.0.1:7456/api/runs?status=running
```

### tuning knob (재배포 필요)

| 증상 | 먼저 볼 것 |
|------|------------|
| export 대기 길음 | `OD_EXPORT_MAX_CONCURRENT`, cache, deck size |
| daemon OOM restart | `OD_MEM_LIMIT`, concurrent ↓ |
| AI proxy 429 (workspace) | `OD_BYOK_PROXY_MAX_PER_WORKSPACE`, `od_byok_proxy_workspace_limit` 로그 |
| BFF 503/latency | `UVICORN_WORKERS`, RDS pool, Main BE |
| scratch disk full | od-data EBS, evict — [21](./21_OD_SCRATCH_DISK_METRICS_가이드.md) |

---

## 12. 상용화 — 무엇을 언제 해결할까

**핵심 판단:** 상용 오픈 **전에 OD multi-node를 완성할 필요는 없다.**  
문서·코드 SSOT의 오픈 가정은 **단일 EC2 `t3.2xlarge` + daemon 1 + ENV·캐시·모니터링** ([34 §19.1](./34_Export_성능_개선_로드맵.md), [17 출시 순서](./17_Production_출시_작업_순서.md)).  
**해결해야 할 “문제”**는 “5명 접속 제한”이 아니라 **(1) 피크 burst 시 AI run·export 지연/OOM**, **(2) 장애·격리·복구**, **(3) 지표 없이 용량을 추측하는 것**이다.

### 12.1 오픈 전 필수 (P0) — 인프라·게이트

| # | 작업 | 왜 | 검증 |
|---|------|-----|------|
| P0-1 | Production **terraform** `t3.2xlarge` + root/od-data **100GiB** | 단일 daemon 상한 확보 | `lsblk`, `df -h` |
| P0-2 | `.env.production` **§13.1 SSOT** 적용 | concurrent·메모리 정합 | `OD_MEM_LIMIT=8g`, `UVICORN_WORKERS=5`, `OD_EXPORT_MAX_CONCURRENT=6` |
| P0-3 | **출시 게이트 G1~G6** | 데이터 격리·복구 | [09](./09_Design_저장소_격리_출시게이트.md), [17 Step 5](./17_Production_출시_작업_순서.md) |
| P0-4 | `OD_DATA_HOST_PATH` bind | scratch가 root를 채우지 않게 | mount inspect |
| P0-5 | CloudWatch **OOM·export·scratch** 알람 | 피크 전 조기 감지 | [21](./21_OD_SCRATCH_DISK_METRICS_가이드.md), [34 §6.3](./34_Export_성능_개선_로드맵.md) |

**multi-daemon은 P0에 넣지 않는다.**

### 12.2 오픈 전 권장 (P1) — 체감 성능

| # | 작업 | 효과 | 상태 |
|---|------|------|------|
| P1-1 | **Export cache** (`OD_EXPORT_CACHE_ENABLED=1`, memo+EBS local) | HTML→ZIP→PDF 연속 클릭·재다운로드 시 Chromium **N→1** | 코드 ✅, prod 배포·튜닝 ⏳ |
| P1-2 | **503 + Retry-After** queue UX | export 폭주 시 daemon OOM 대신 **대기 안내** | 코드 ✅ |
| P1-3 | **부하 스크립트** — 3~5명 동시 PDF + 5~10 run | queue_wait·p95 실측 | [34 §17 #3](./34_Export_성능_개선_로드맵.md) ⏳ |
| P1-4 | staging에서 **동일 ENV 패턴** dry-run | prod 전 regression | staging `t3.large`는 peak 약함 — **prod 스펙에서** 최종 측정 |

**성공 기준 (오픈 1호기):**

- 동시 **브라우징** 50+ — API 5xx 없음
- 동시 **AI run** ~5–10 — 완료 가능 (latency 증가는 허용, fail은 금지)
- 동시 **export** 6 parallel + queue — **OOM restart 0**, 503은 Retry-After와 함께

### 12.3 오픈 후 2~4주 (P2) — 운영 데이터 기반

| 트리거 (지표) | 조치 |
|---------------|------|
| `od_export_queue_wait_ms` p95 > 60s | `OD_EXPORT_MAX_CONCURRENT` 6→8 **또는** async export job ([34 §9](./34_Export_성능_개선_로드맵.md)) |
| daemon OOM / restart | `OD_MEM_LIMIT`·concurrent 재조정, export cache hit rate 확인 |
| 동시 run > 10 지속 | design-api **run 발행 슬롯** (Track B4) 또는 EC2 **한 단계 업** |
| export가 전체 CPU의 80%+ | **export worker 분리** (Chromium isolate) — [34 Phase 3](./34_Export_성능_개선_로드맵.md) |

### 12.4 상용 scale-up (P3) — multi-node는 여기

**상세 로드맵:** [39_0 이중화 개요](./39_0_Design_이중화_로드맵_개요.md) · [39_1 Phase 0~5](./39_1_이중화_Phase_로드맵.md)

**시작 조건 (하나 이상):**

- 단일 `t3.2xlarge`에서 **SLO 미달**이 ENV 튜닝·cache·async로도 해소 안 됨
- workspace 수·DAU가 **단일 daemon SQLite·scratch** 운영 리스크를 넘김
- **99.9% HA** 요구 (Active-Passive 이상)

**구현 순서 (Track B, [04](./04_구현_우선순위.md)):**

```text
1. design-api wrapper: job/run API + 발행 슬롯 + circuit breaker (B1, B4)
2. export async job + (선택) dedicated export worker — daemon 전체와 분리
3. OD DaemonDb → Postgres (B5, upstream)
4. ALB sticky / projectId → daemon 라우팅
5. (선택) S3 export cache — multi-instance warm share
```

**예상 공수:** P0~P1은 **배포·검증 중심 (1~2주)**. P3 Track B는 **엔지니어링 프로젝트 (분기 단위)**.

### 12.5 제품·운영으로 보완 (코드 없이도 가능)

| 수단 | 용도 |
|------|------|
| **소프트 런치** — 내부→초대→공개 | 피크 예측 가능 |
| export 대기 UI copy | “N명 대기 중” — 이미 503 path 존재 |
| workspace별 **abuse rate limit** (Main BE) | 악의적 동시 run 폭주 |
| 요금제·크레딧 | 동시 run보다 **총 사용량** 상한 (이미 billing 축) |
| 대형 deck | async export 안내 (Phase 3) |

### 12.6 의사결정 트리 (한 장)

```text
상용 오픈 가능한가?
  ├─ G1~G6 통과? ─ NO → [09][17] storage/registry 먼저
  └─ YES
       ├─ prod t3.2xlarge + §13.1 ENV? ─ NO → terraform + .env.production
       └─ YES
            ├─ 부하 테스트 (export 3~5 concurrent) 통과? ─ NO → cache·concurrent·MEM_LIMIT
            └─ YES → 오픈 (single daemon OK)
                 └─ 오픈 후 지표 악화?
                      ├─ export만 병목 → export worker / async
                      ├─ run만 병목 → 슬롯·vertical scale
                      └─ 둘 다 + HA → Track B multi-daemon
```

---

## 13. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-07 | [39 이중화 시리즈](./39_0_Design_이중화_로드맵_개요.md) cross-link |
| 2026-07-06 | **§5 AI 동시 이용 SSOT** — BYOK proxy 다중 stream, workspace cap 8, 전역 직렬 없음, 429/soft cap, 검증·FAQ |
| 2026-07-06 | §12 상용화 P0~P3 로드맵·의사결정 트리 추가 |
| 2026-07-06 | 초안 — UVICORN worker vs 동시 사용자, export cap, multi-daemon 제약·로드맵 |
