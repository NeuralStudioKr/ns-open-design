# Teamver — API 키·저장소·Drive·DB 연동

open-design daemon의 **키·artifact·DB**가 어디에 있는지(배경)와, Teamver **Drive / 자체 DB**와 어떻게 맞출지 정리합니다.

**관련 문서 (integration)**

| 문서 | 내용 |
|------|------|
| [01_통합_아키텍처.md](./01_통합_아키텍처.md) | wrapper·sidecar 권장 |
| [02_design-app_daemon_연동.md](./02_design-app_daemon_연동.md) | job·worker·daemon 연동 |

**OD 참고**

| 문서 | 내용 |
|------|------|
| [open-design-index.md](./open-design-index.md) | upstream 링크, API·packages 요약 |

**근거 (ns-open-design — 상세는 [open-design-index](./open-design-index.md))**

| 주제 | 경로 |
|------|------|
| 설정 파일 개요 | `ns-open-design/docs/architecture.md` §6 |
| Docker·`OD_API_TOKEN` | `ns-open-design/docs/deployment/docker.md`, `deploy/docker-compose.yml` |
| SQLite·프로젝트 파일 | `ns-open-design/apps/daemon/src/db.ts`, `projects.ts` |

---

## 요약 (한눈에)

| # | 질문 | 한 줄 답 |
|---|------|----------|
| 1 | AI 연동 API key는 어떻게·어디서 설정? | **에이전트 CLI 모드**는 사용자 머신의 CLI 로그인·`agentCliEnv`(daemon `app-config.json`). **BYOK/API 모드**는 web Settings → daemon `app-config` + 브라우저 localStorage(Topology C). **미디어**는 Settings → `media-config.json` 또는 `OD_*_API_KEY` env. **원격 daemon**은 (비루프백 시) `OD_API_TOKEN` Bearer. |
| 2 | daemon 결과 artifacts는 어디? | **본문 파일**은 프로젝트 워크스페이스: 기본 `<OD_DATA_DIR>/projects/<id>/` (또는 import 시 `metadata.baseDir`). 레거시 문서의 `./.od/artifacts/<slug>/` 흐름은 스킬 CWD 관점; 제품 기본은 **project 디렉터리** 안 HTML/JSX/에셋. |
| 3 | daemon이 DB에도 저장하나? | **예.** 기본 **SQLite** `<dataDir>/app.sqlite` — 프로젝트·대화·메시지·코멘트·플러그인·미디어 태스크 등 **메타데이터**. **실제 디자인 파일 바이트**는 DB가 아니라 프로젝트 폴더. |
| 4 | Teamver Drive / Teamver DB? | **권장:** OD는 로컬/컨테이너에 그대로 두고, wrapper가 **export/finalize**로 바이트 확보 → **`teamver-app-sdk` Drive presigned** 업로드. Teamver DB에는 **job·workspace·user·asset_id·od_project_id** 등 **참조·과금·권한**만; OD SQLite **전체 미러는 비권장**. |

### 판단 요약

| 질문 | 답 |
|------|-----|
| Teamver가 OD API 키를 대신 보관해야 하나? | **아니요.** 사용자/테넌트별 BYOK·CLI 인증은 **OD daemon 데이터 디렉터리** 또는 런타임 env. Teamver는 wrapper **서비스 계정**과 Main BE JWT만. |
| 산출물 SSOT는 어디? | 생성 직후 **OD 프로젝트 디스크**; Teamver Drive는 **게시(publish) 복사본** + 메타데이터. |
| Teamver DB에 conversation 전체를 넣을까? | **기본 No** — 검색/감사 필요 시 **요약·asset 링크·run 상태**만. 전문은 OD 또는 Drive 파일. |

---

## 1. AI 연동 API key 설정 (상세)

open-design은 **여러 층**에서 키·자격 증명을 씁니다. Teamver wrapper는 **daemon HTTP**만 호출하므로, 키는 **daemon이 떠 있는 환경**에 맞춰 준비합니다.

### 1.1 실행 모드별 (채팅·에이전트)

| 모드 | 키·인증 | 설정 위치 |
|------|---------|-----------|
| **로컬 CLI 에이전트** (Claude Code, Codex, Cursor Agent 등) | 각 CLI 자체 로그인·config (`~/.claude`, `~/.codex` 등) | 사용자 OS; OD는 **감지**만 (`GET /api/agents`). daemon `app-config.json`의 **`agentCliEnv`** 로 프록시·베이스 URL·토큰 **오버라이드** 가능 (로컬 전용, `app-config.ts` 주석). |
| **BYOK / API direct** (Topology C 또는 daemon 경유 API 모드) | 프로토콜별 `apiKey`, `baseUrl`, `model` | Web **Settings** → `PUT /api/app-config` → `<dataDir>/app-config.json`. Topology C는 브라우저 **localStorage**에도 유지 (`architecture.md` Topology C). |
| **메모리 추출 LLM** 등 부가 | 채팅과 동일 provider 선택 로직 | `memory-llm.ts` — dataDir·app-config·미디어 config 조합. |

`architecture.md` §6의 `~/.open-design/config.toml`(전역 선호·BYOK·telemetry)은 **daemon-global** 보조 설정입니다.

### 1.2 미디어·리서치 provider 키 (이미지/영상/TTS/검색)

| 항목 | 내용 |
|------|------|
| UI | Settings → Media providers → daemon `PUT /api/media/config` |
| 파일 | `media-config.json` (우선순위: `OD_MEDIA_CONFIG_DIR` → `OD_DATA_DIR` → `<projectRoot>/.od/`) |
| env 오버라이드 | `OD_OPENAI_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `ELEVENLABS_API_KEY`, `TAVILY_API_KEY` 등 (`media-config.ts` `ENV_KEYS` 표) |
| 보안 | daemon은 기본 loopback; GET 시 키 **마스킹** |

### 1.3 daemon HTTP 접근 토큰 (인프라용)

| env | 용도 |
|-----|------|
| `OD_BIND_HOST` | 기본 `127.0.0.1`; `0.0.0.0` 바인딩 시 원격 노출 |
| `OD_API_TOKEN` | Docker/Helm self-host에서 **Bearer** (`Authorization: Bearer <token>`). 루프백이 아닌 클라이언트 보호. (`deploy/docker-compose.yml`, `plugins-spec.md` §15) |

이 토큰은 **LLM provider key가 아님** — Teamver→daemon **서비스 간** 또는 compose 배포용입니다.

### 1.4 커넥터·기타

- **Composio** 등: Settings → app-config / connector 라우트 (`/api/connectors/*`).
- **MCP OAuth**: `/api/mcp/oauth/*` — 서버별 토큰은 daemon 런타임 저장.

### 1.5 Teamver wrapper 운영 체크리스트

1. Design job 컨테이너/VM에 **OD_DATA_DIR** 볼륨 마운트.
2. 테넌트별 미디어/BYOK가 필요하면 **env 주입** 또는 초기화 스크립트로 `media-config.json` / `app-config.json` 시드 (비밀은 Teamver Secret → 컨테이너 env, **git 커밋 금지**).
3. wrapper → daemon 호출 시 네트워크가 loopback이 아니면 **`OD_API_TOKEN`** 정렬.
4. **Teamver 사용자 JWT를 OD에 넘기지 않음** — IAM은 wrapper에서만 ([01_통합_아키텍처](./01_통합_아키텍처.md)).

---

## 2. Artifacts(산출물) 저장 위치 (상세)

OD는 **“아티팩트 = 프로젝트 워크스페이스 안의 파일”** 모델이 중심입니다.

### 2.1 런타임 데이터 루트

| env / 경로 | 역할 |
|------------|------|
| `OD_DATA_DIR` | daemon **런타임 루트** (SQLite, projects, config, memory 등). 미설정 시 install/프로젝트 루트 기준 `.od` |
| `<dataDir>/projects/<projectId>/` | 기본 **프로젝트 파일 트리** — HTML, JSX, `assets/`, `DESIGN-MANIFEST.json`, 업로드 (`projects.ts`) |
| `metadata.baseDir` (import folder) | 사용자가 고른 **로컬 폴더가 곧 워크스페이스** — 복사 없이 직접 read/write (`architecture.md` Folder import) |

### 2.2 문서·레거시 레이아웃

`architecture.md` §3.6의 `./.od/artifacts/<timestamp-slug>/` + `artifact.json` + `history.jsonl`은 **설계 rationale**(git-friendly 로그) 설명이며, 현재 제품 경로는 **project-centric** + SQLite 메타가 주류입니다 (`plugins-spec.md`: `.od/projects/<id>/` + `app.sqlite`).

에이전트 **CWD**는 스킬 실행 시 프로젝트/아티팩트 하위로 잡히는 경우가 많습니다 (`skills-protocol.md`).

### 2.3 API로 artifact 다루기

| API | 용도 |
|-----|------|
| `POST /api/artifacts/save` | 메타·본문 저장 트리거 |
| `GET /api/projects/:id/files` | 파일 목록 |
| `GET/POST .../export/*`, `finalize` | HTML/PDF/ZIP 등 **보내기** (Teamver 업로드 전 단계) |
| Live artifacts | 별도 live-artifact 스토어 (DB+파일 연동) |

### 2.4 메모리·플러그인·기타 디스크

| 경로 | 내용 |
|------|------|
| `<dataDir>/memory/` | Markdown 메모리 트리 (`/api/memory/*`) |
| `<projectRoot>/.od/od-plugin-lock.json` 등 | 플러그인 lockfile (문서 `plugin-registry`) |
| `media-config.json`, `app-config.json` | §1 참고 |

---

## 3. daemon DB 저장 (상세)

### 3.1 엔진·파일 위치

| 항목 | 값 |
|------|-----|
| 기본 | **SQLite** `better-sqlite3`, 파일 `<dataDir>/app.sqlite`, WAL 모드 (`db.ts`) |
| 설정 | `OD_DAEMON_DB=sqlite` (기본) / `postgres`는 **스텁·미완** (`storage/daemon-db.ts`) |
| 원칙 | **파일 바이트는 DB 밖**; DB는 프로젝트 UI·채팅·플러그인 상태 등 |

### 3.2 핵심 테이블 (`db.ts` migrate)

| 테이블 | 저장 내용 |
|--------|-----------|
| `projects` | id, name, skill/design_system, `metadata_json`(baseDir 등), instructions |
| `conversations` | 대화 스레드, `session_mode` |
| `messages` | role, content, `events_json`, attachments, run 상태, plugin snapshot |
| `agent_sessions` | CLI 세션 resume용 session_id |
| `preview_comments` | 프리뷰 핀 코멘트 |
| `tabs` / `tabs_state` | 열린 파일 탭 |
| `templates` | 템플릿 메타 |
| `deployments` | 프리뷰 배포 URL 메타 |
| `routines` / `routine_runs` / `routine_schedule_claims` | 스케줄 루틴 |

### 3.3 추가 migrate 모듈

| 모듈 | 테이블 예 |
|------|-----------|
| `plugins/persistence.ts` | `installed_plugins`, `plugin_marketplaces`, `applied_plugin_snapshots`, `run_devloop_iterations`, `genui_surfaces`, `skill_plugin_candidates` |
| `media-tasks.ts` | `media_tasks` |
| `critique/persistence.ts` | `critique_runs` |

### 3.4 DB에 넣지 않는 것

- 생성된 **HTML/JSX/이미지/PPTX 중간 파일** 본문
- 사용자 **skills/**, **DESIGN.md** (파일 시스템 + 레지스트리 스캔)
- 대용량 export zip (export 시 스트리밍·임시 파일)

---

## 4. Teamver Drive·자체 DB 연동 검토 (상세)

전제: [01_통합_아키텍처](./01_통합_아키텍처.md) — **open-design fork 대량 수정 비권장**, **teamver-design-app wrapper**가 Teamver SDK 사용.

### 4.1 권장 데이터 흐름 (Publish 모델)

```text
User (Teamver) → Teamver AI Apps BE → teamver-design-app
  → OD daemon: POST /api/projects, POST /api/chat (SSE)
  → OD disk: <dataDir>/projects/<odProjectId>/...
  → wrapper: GET export / POST finalize → bytes + filename + mime
  → teamver-app-sdk: upload_bytes_to_personal_drive (또는 workspace drive 정책)
  → Teamver Main BE: asset_id, usage, audit
  → Teamver DB: job row 갱신 (status, drive_asset_ids, od_project_id)
```

| 단계 | SSOT |
|------|------|
| 편집·재생성·채팅 이력 | **OD** (`app.sqlite` + project folder) |
| 사용자에게 “Teamver에서 열기” 최종 파일 | **Teamver Drive** (버전은 Drive/앱 정책) |
| 과금·권한·워크스페이스 | **Teamver Main BE** |

### 4.2 Teamver Drive 연동 옵션

| 옵션 | 설명 | 장단점 |
|------|------|--------|
| **A. 완료 시 1회 업로드** (권장) | job `succeeded` 시 export manifest에서 primary file만 Drive | 단순, OD upstream과 분리 좋음 |
| **B. 다중 파일 zip** | `POST .../export` zip 전체 업로드 | 디자인 패키지·핸드오프용 |
| **C. 주기적 동기화** | project folder watch → incremental upload | 충돌·중복 관리 비용 큼, 특수 케이스만 |
| **D. Drive만 SSOT** | OD 경로를 Drive FUSE로 마운트 | **비권장** — OD 경로·샌드박스 가정 깨짐 |

Drive API는 **`teamver-app-sdk`** (`upload-request` → S3 PUT → `upload-confirm`) — [platform 02_2 설계](https://github.com/NeuralStudioKr/ns-teamver-platform) 및 `03` daemon 규격과 **별개 HTTP면**.

### 4.3 Teamver 자체 DB 연동 옵션

| 저장 대상 | 권장 | 비고 |
|-----------|------|------|
| `teamver_design_job` | id, user_id, workspace_id, status, od_project_id, od_conversation_id, created_at | wrapper가 OD id 보관 |
| `teamver_design_output` | job_id, drive_asset_id, kind(html/pdf/pptx), filename, size | Drive 메타 **캐시** |
| 채팅 전문·`events_json` | 기본 **미저장** | 필요 시 요약·해시만 |
| OD `app.sqlite` 복제 | **비권장** | 스키마 churn·용량·PII 이중화 |

**검색/감사**가 필요하면: Teamver DB에 **job 단위 메타 + Drive asset_id**만 두고, 본문은 Drive download-url 또는 OD export API로 **지연 조회**.

### 4.4 배포 토폴로지와 볼륨

| 구성 | artifact·DB |
|------|-------------|
| **Sidecar 2컨테이너** (01_1) | `open-design-daemon`에 **PVC/hostPath** = `OD_DATA_DIR`; wrapper는 HTTP만 |
| **단일 VM** | 동일 호스트 `127.0.0.1:7456` |
| **업스트림 pull** | OD 데이터 볼륨은 Teamver **영속 볼륨**; Drive는 **사용자별 장기 보관** |

### 4.5 하지 말 것 (01_1 정렬)

- open-design 내부에 Teamver 로그인·Drive 경로 **하드코딩**
- OD SQLite를 Teamver Postgres **1:1 미러**
- 사용자 Teamver JWT를 OD `/api/chat`에 **그대로 전달** (OD는 자체/CLI/BYOK 인증 모델)

---

## 5. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-12 | 초안 — 키·artifact·SQLite·Teamver Drive/DB 검토 |
