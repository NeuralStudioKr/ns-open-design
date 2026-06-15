> **보관 문서 (2026-06-15)** — 수정하지 마세요. 현행: [README.md](../README.md)

# Open Design — 데몬 통신 규격 (HTTP / SSE / IPC)

Teamver Design wrapper가 **open-design local daemon**과 통신할 때 쓰는 전송 방식·엔드포인트·타입 정본을 정리합니다.

## 요약 (한눈에)

- **HTTP + SSE**가 web ↔ daemon **정식 경로** (`architecture.md` §7 기준; WS는 구 문서 예시).
- **바인딩:** `127.0.0.1:7456` — env `OD_BIND_HOST` / `OD_PORT`.
- **타입 정본:** `@open-design/contracts` (`open-design/packages/contracts`).
- **REST 그룹:** health, projects, chat, export, memory, MCP, media, … (본문 §4).
- **`POST /api/chat` SSE:** `ChatRequest` + `ChatSseEvent` (`start` / `agent` / `end` …) — 본문 §5.
- **Sidecar IPC:** desktop / `tools-dev`용 (`sidecar-proto` 메시지·스냅샷) — **Teamver BE는 보통 불필요** (본문 §7).
- **Teamver 연동 시퀀스:** health → project → chat SSE → export → Drive (본문 §9).
- **upstream 참고:** `open-design/docs` — `spec`, `skills-protocol`, `plugins-spec`, `deployment/docker`, … (본문 §10).

### 판단 요약

| 질문 | 답 |
|------|-----|
| Teamver가 OD와 어떻게 말해야 하나? | 같은 호스트(또는 컨테이너)의 daemon **HTTP** `http://127.0.0.1:7456/api/*`, 스트리밍은 **SSE** |
| API 규격 문서는 어디? | 코드 정본은 **`open-design/packages/contracts`**; 서술은 upstream **`architecture.md` §7** |
| `packages`는 왜 나뉘나? | **`contracts`** = 경계 타입 · **`plugin-runtime` / `registry-protocol`** = 플러그인 · **`sidecar` / `host`** = desktop IPC · **`platform` / `download` / `diagnostics`** = daemon 런타임 유틸 ([02 패키지 개요](./02_open-design_packages_개요.md)) |

**관련 문서 (본 레포)**

| 문서 | 내용 |
|------|------|
| [02_open-design_packages_개요.md](./02_open-design_packages_개요.md) | `@open-design/contracts` 등 패키지 역할 |
| [04_open-design_키_저장소_Teamver연동_검토.md](./04_open-design_키_저장소_Teamver연동_검토.md) | API 키·artifact·SQLite·Drive/DB |
| [05_teamver-design-app_open-design_daemon_연동_구조.md](./05_teamver-design-app_open-design_daemon_연동_구조.md) | design-app·queue·비동기·헬스 |
| [01_2_open-design_웹_데스크톱_구현구조.md](./01_2_open-design_웹_데스크톱_구현구조.md) | web/daemon/desktop 물리 구조 |

**근거 (open-design 업스트림)**

| 문서 | 경로 |
|------|------|
| Web ↔ daemon 프로토콜 | `open-design/docs/architecture.md` §7 |
| 제품 모듈·자동화 API 언급 | `open-design/docs/spec.md` §5 |
| Docker·포트 | `open-design/docs/deployment/docker.md` |
| Daemon HTTP 어댑터 (내부) | `open-design/specs/current/daemon-http-adapter.md` |
| 타입 SSOT | `open-design/packages/contracts` |
| Sidecar IPC 메시지 | `open-design/packages/sidecar-proto` |

---

## 1. 통신 경로 요약

Open Design은 **브라우저/외부 오케스트레이터 → daemon** 을 주로 **HTTP + Server-Sent Events(SSE)** 로 처리합니다. (과거 문서 일부에 WebSocket 예시가 있으나, **현재 shipped daemon은 `/api/*` + SSE** 가 정식입니다 — `architecture.md` §7.)

```text
┌──────────────── Client (Web / Teamver wrapper / curl) ────────────────┐
│  REST JSON  ─────────────────────────►  od daemon (Express)          │
│  SSE stream ◄────────────────────────  text/event-stream             │
└──────────────────────────────────────────────────────────────────────┘
         │ spawn / stdio
         ▼
   claude · codex · cursor-agent · …  (agent adapters)

┌──────────────── Desktop / tools-dev only ─────────────────────────────┐
│  Sidecar IPC (Unix socket / Windows pipe)  ◄──►  web + daemon orchestration │
└──────────────────────────────────────────────────────────────────────┘
```

| 경로 | 용도 | Teamver Design BE |
|------|------|-------------------|
| **HTTP `/api/*`** | 프로젝트·채팅·파일·export·미디어·MCP 등 | **주 통신면** |
| **SSE** | 채팅 스트림, 프로젝트 이벤트 | 채팅·장시간 생성 |
| **Sidecar IPC** | desktop 상태·스크린샷·shutdown·업데이트 | 일반적으로 **불필요** |
| **`od` CLI** | daemon 기동·미디어 등 서브커맨드 | HTTP 대신 thin client (이미 떠 있는 daemon 가정) |

---

## 2. 엔드포인트·바인딩

| 항목 | 기본값 | 비고 |
|------|--------|------|
| Host | `127.0.0.1` | `OD_BIND_HOST` |
| Port | `7456` | `OD_PORT`, sidecar env `OD_SIDECAR_*`와 연동 |
| Base URL | `http://127.0.0.1:7456` | 모든 REST/SSE는 **path `/api/...`** (루트 정적 서빙 별도) |
| Topology B | 사용자 터널 URL | `od daemon --expose` 후 web에 URL 입력 |

daemon은 **로컬 신뢰 경계**입니다. 비밀·파일시스템·CLI spawn은 daemon에만 있습니다 (`architecture.md` Topology A/B).

---

## 3. 타입 정본 — `@open-design/contracts`

요청/응답/SSE 이벤트 이름·payload는 **`open-design/packages/contracts`** 가 단일 정본입니다. 별도 OpenAPI 파일보다 **이 패키지 export**를 우선합니다.

- REST DTO: `contracts/src/api/*.ts`
- 채팅 SSE: `contracts/src/sse/chat.ts` (`CHAT_SSE_PROTOCOL_VERSION = 1`)
- 공통 SSE 래퍼: `contracts/src/sse/common.ts` — `SseTransportEvent<Name, Payload>`

Teamver에서 TypeScript를 쓰지 않으면, 동일 필드를 JSON 스키마로 문서화할 때도 **contracts 소스**를 옮겨 적는 것을 권장합니다.

---

## 4. 대표 REST API (그룹별)

전체 라우트는 `apps/daemon/src/server.ts` 및 `*-routes.ts`에 등록됩니다. 아래는 **통합·자동화 시 자주 쓰는 그룹**입니다 (`architecture.md` §7 + 코드 기준).

### 4.1 헬스·설정·에이전트

| Method | Path | 용도 |
|--------|------|------|
| GET | `/api/health` | 생존 확인 |
| GET | `/api/version` | 빌드·채널 (`AppVersionResponse`) |
| GET | `/api/app-config` | 기능 플래그·클라이언트 설정 |
| GET | `/api/agents` | 감지된 로컬 에이전트 CLI 목록 |

### 4.2 프로젝트·대화·파일

| Method | Path | 용도 |
|--------|------|------|
| GET/POST | `/api/projects` | 목록·생성 |
| GET/PATCH/DELETE | `/api/projects/:id` | 메타 |
| GET | `/api/projects/:id/events` | **SSE** — 대화 생성 등 프로젝트 이벤트 |
| GET/POST | `/api/projects/:id/conversations` | 대화 스레드 |
| GET/POST | `/api/projects/:id/conversations/:cid/comments` | 프리뷰 코멘트 |
| GET | `/api/projects/:id/files` | 워크스페이스 파일 트리 |
| GET | `/api/projects/:id/files/:name/preview` | 프리뷰 URL/콘텐츠 |
| POST | `/api/import/folder` | 기존 로컬 폴더를 프로젝트 루트로 import |
| POST | `/api/projects/:id/upload` | 업로드 (별도 upload 라우트) |

### 4.3 채팅 (에이전트 실행)

| Method | Path | 용도 |
|--------|------|------|
| POST | `/api/chat` | **SSE** — 한 턴 에이전트 실행 (`ChatRequest` body) |

### 4.4 아티팩트·export

| Method | Path | 용도 |
|--------|------|------|
| POST | `/api/artifacts/save` | 아티팩트 저장 |
| GET/POST | `/api/projects/:id/export/*` | HTML/PDF/ZIP 등 export |
| POST | `/api/projects/:id/finalize/:provider` | 외부 CLI 핸드오프용 패키지 |

### 4.5 리소스 카탈로그

| Method | Path | 용도 |
|--------|------|------|
| GET | `/api/skills` | 스킬 레지스트리 |
| GET | `/api/design-systems` | 디자인 시스템 목록 |
| GET | `/api/templates` | 템플릿 갤러리 |

### 4.6 메모리·자동화·커넥터 (확장)

| Prefix | 용도 |
|--------|------|
| `/api/memory/*` | 메모리 트리·extract (`spec.md` Automations 루프) |
| `/api/automation-*` | ingest/proposal (자동화 self-evolution) |
| `/api/connectors/*` | GitHub/Notion 등 커넥터 |
| `/api/mcp/*` | MCP 서버 설정·OAuth |
| `/api/media/*`, `/api/projects/:id/media/*` | 이미지/오디오 생성 |
| `/api/projects/:id/terminals/*` | 임베디드 터미널 |

정확한 필드는 각각 `contracts/src/api/<domain>.ts` 를 참조합니다.

---

## 5. `POST /api/chat` — SSE 규격

### 5.1 요청

Content-Type: `application/json`  
Body: `ChatRequest` (`contracts/src/api/chat.ts`)

핵심 필드:

| 필드 | 설명 |
|------|------|
| `agentId` | 사용할 로컬 에이전트 |
| `message` | 사용자 메시지 |
| `projectId` / `conversationId` | 프로젝트·대화 컨텍스트 |
| `skillId` / `skillIds` | 스킬 (단일 vs 턴 한정 멀티) |
| `designSystemId` | `DESIGN.md` 계열 시스템 |
| `sessionMode` | `design` \| `chat` |
| `attachments` | 파일 참조 |
| `commentAttachments` | 프리뷰 요소 코멘트 |
| `mediaExecution` | 미디어 실행 정책 |
| `toolBundle` | 런 스코프 MCP 번들 |

### 5.2 응답 스트림

Content-Type: `text/event-stream`  
이벤트 유니온: `ChatSseEvent` (`contracts/src/sse/chat.ts`)

| `event` | payload 요약 |
|---------|----------------|
| `start` | `runId`, `agentId`, `bin`, `protocolVersion`, `projectId`, `model` … |
| `agent` | `DaemonAgentPayload` — `text_delta`, `tool_use`, `tool_result`, `thinking_*`, `usage`, `live_artifact`, … |
| `stdout` / `stderr` | CLI 원시 출력 chunk |
| `error` | `SseErrorPayload` |
| `end` | 종료 코드, `status`: `succeeded` \| `failed` \| `canceled`, `resumable` |

`agent` 이벤트의 `type: 'text_delta'` 등은 UI 스트리밍·툴 피드에 사용됩니다. **프로토콜 버전**은 `start` payload의 `protocolVersion` (현재 **1**).

### 5.3 프로젝트 SSE

`GET /api/projects/:id/events` — 예: `conversation-created` (`ProjectConversationCreatedSsePayload`). daemon이 web이 모르는 경로로 대화를 추가했을 때 동기화용.

---

## 6. 데이터·세션 (HTTP와 함께 이해할 것)

| 저장 | 위치 | 비고 |
|------|------|------|
| 아티팩트 | `./.od/artifacts/…` (프로젝트별) | 파일 기반, git 친화 (`architecture.md` §3.6) |
| 프로젝트 DB | daemon `RUNTIME_DATA_DIR` (SQLite 등) | 메타·대화·설정 — Docker 볼륨으로 보존 |
| 세션 | `sessions/<id>.json` | ephemeral (~24h GC) |

Teamver wrapper는 **export/finalize API로 산출물 바이트**를 받은 뒤 Teamver Drive 등에 올리는 패턴이 자연스럽습니다 ([01_1](./01_1_open-design_teamver통합방안_chatgpt.md)).

---

## 7. Sidecar IPC (desktop / tools-dev)

웹 앱이 아닌 **Electron main ↔ sidecar ↔ daemon/web 프로세스** 조율용입니다. Teamver 서버가 직접 쓸 일은 거의 없습니다.

| 항목 | 내용 |
|------|------|
| 프로토 타입 | `@open-design/sidecar-proto` |
| 구현 | `@open-design/sidecar` |
| IPC 경로 | 기본 `OD_SIDECAR_IPC_BASE` → `/tmp/open-design/ipc` (Windows: named pipe) |
| 메시지 예 | `status`, `shutdown`, `screenshot`, `eval`, `export-pdf`, `register-desktop-auth`, `update`, … (`SIDECAR_MESSAGES`) |
| 상태 스냅샷 | `DaemonStatusSnapshot`, `WebStatusSnapshot`, `DesktopStatusSnapshot` — URL·pid·`desktopAuthGateActive` 등 |

`DaemonStatusSnapshot.desktopAuthGateActive`는 desktop 연동 시 `POST /api/import/folder` 등에 **desktop auth gate**가 켜져 있는지 나타냅니다 (`architecture.md` Folder import · PR #974).

---

## 8. 보안·신뢰 (통합 시)

| 주제 | 규칙 |
|------|------|
| 네트워크 | 기본 **loopback only** — Teamver BE는 같은 호스트/사이드카 컨테이너에서 daemon에 접근하는 구성이 일반적 |
| Topology B | 터널 URL은 사용자가 제공 — Teamver 중앙에 daemon 비밀 저장하지 않음 |
| Desktop auth | HMAC gate로 renderer가 임의 로컬 경로를 여는 것 방지 (`architecture.md` §7) |
| Same-origin | 일부 라우트는 `requireLocalDaemonRequest` 등 daemon-local 제한 |

Teamver **사용자 JWT**는 open-design daemon API에 그대로 실리지 않습니다. Teamver IAM은 **wrapper 레이어**에서 처리합니다.

---

## 9. Teamver 연동 시퀀스 (참고)

```text
1. teamver-design-app (wrapper) 기동
2. open-design daemon 기동 (또는 sidecar가 기동) → :7456 대기
3. wrapper: GET /api/health, GET /api/agents
4. wrapper: POST /api/projects → projectId
5. wrapper: POST /api/chat (SSE) 로 디자인 생성
6. wrapper: GET export 또는 POST finalize → 산출물 bytes
7. @teamver/app-sdk 등으로 Teamver Drive / usage / audit
```

CLI만 사용할 때: `od` 는 **이미 실행 중인 daemon**에 HTTP로 요청합니다 (daemon startup은 sidecar/CLI daemon 모드 — `docs/adr/0001-centralize-daemon-startup.md`).

---

## 10. 참고 링크 모음 (`open-design/docs`)

| 주제 | 문서 |
|------|------|
| 모드·시나리오 | `modes.md`, `spec.md` §4 |
| 스킬 파일 형식 | `skills-protocol.md` |
| 플러그인 manifest | `plugins-spec.md`, `schemas/open-design.plugin.v1.json` |
| 디자인 시스템 | `design-systems.md` |
| 에이전트 어댑터 | `agent-adapters.md` |
| 셀프호스트 | `deployment/docker.md`, `self-hosting-a-registry.md` |
| E2E·inspect | `e2e/AGENTS.md`, `docs/testing/e2e-coverage/` |

---

## 11. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-12 | 서두 «요약 (한눈에)»·판단 표 추가 |
| 2026-06-12 | 초안 — HTTP/SSE/contracts/sidecar, Teamver 시퀀스 |
