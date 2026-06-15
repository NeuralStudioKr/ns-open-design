> **보관 문서 (2026-06-15)** — 수정하지 마세요. 현행: [README.md](../README.md)

# Open Design — Web / Daemon / Desktop 구현 구조

## 개요

Open Design(OD)은 **Web UI**(`apps/web`) · **로컬 daemon**(`apps/daemon`) · **(선택) Desktop 셸**(`apps/desktop`) 세 층으로 나뉩니다. 브라우저(또는 Electron 안의 같은 web)는 HTTP/SSE로 daemon의 `/api/*`에 붙고, daemon이 **프로젝트·대화 메타·플러그인·미디어·터미널**과 **에이전트 CLI 어댑터 풀**을 로컬에서 실행합니다.

- **Web** — Next.js 셸 + React SPA; Topology A/B/C에서 **동일 번들**.
- **Daemon** — Node(Express) 프로세스, 기본 **`127.0.0.1:7456`**; 비밀·파일·CLI spawn의 **신뢰 경계**.
- **Desktop** — Electron **main/preload만**; UI는 web 임베드, daemon/desktop auth는 **sidecar IPC**.

배치는 `architecture.md` 토폴로지 A(로컬) / B(Vercel web + PC daemon) / C(BYOK, daemon 없음)로 달라지지만, **제품 로직의 중심은 web + daemon**입니다.

본 문서는 `open-design` 모노레포 기준으로 다음을 정리합니다.

- Web / **Daemon** / Desktop 각각 **구현 폴더**와 **내부 디렉터리 역할**
- **기술 스택** (`package.json` 및 `docs/architecture.md` 정합)
- daemon **HTTP·SSE·sidecar**와 on-disk / SQLite **데이터 경계**
- **Docker 셀프호스트**·`tools-dev`와의 관계
- Teamver에서 OD를 참조할 때의 **경계선**(landing vs product, 포트 7456, IAM 별도 설계)

**관련 문서 (`docs-teamver`)**

| 문서 | 내용 |
|------|------|
| [02_open-design_packages_개요.md](./02_open-design_packages_개요.md) | `open-design/packages` 패키지 용도 |
| [03_open-design_데몬_통신_규격.md](./03_open-design_데몬_통신_규격.md) | daemon HTTP/SSE·contracts·sidecar IPC |
| [04_open-design_키_저장소_Teamver연동_검토.md](./04_open-design_키_저장소_Teamver연동_검토.md) | API 키·artifact·DB·Teamver Drive |
| [05_teamver-design-app_open-design_daemon_연동_구조.md](./05_teamver-design-app_open-design_daemon_연동_구조.md) | Teamver design-app ↔ daemon |

**근거 문서 (open-design 레포 내)**

| 문서 | 경로 |
|------|------|
| 아키텍처 | `open-design/docs/architecture.md` |
| Docker 배포 | `open-design/docs/deployment/docker.md` |
| Web 패키지 | `open-design/apps/web/package.json` |
| Daemon 패키지 | `open-design/apps/daemon/package.json` |
| Desktop 패키지 | `open-design/apps/desktop/package.json` |

---

## 1. 논리 아키텍처 (세 가지 토폴로지)

`architecture.md` §1 기준 요약.

### Topology A — 완전 로컬 (기본)

```
browser ──► Next.js (localhost:3000, dev)
                │
                │ http://localhost:7456
                ▼
         od daemon (Node, 상시 프로세스)
                │
                ▼
         agent CLI (claude, codex, cursor-agent, …)
```

- `pnpm tools-dev run web` → daemon + web을 함께 기동.
- `pnpm tools-dev`(desktop 포함) → Topology A + **Electron 셸**.

### Topology B — Vercel Web + 사용자 PC daemon

- 배포된 web이 사용자가 `--expose` 등으로 받은 daemon URL(터널)에 연결.
- 비밀키·파일시스템은 daemon 쪽에만 존재.

### Topology C — Vercel + Direct API (daemon 없음)

- BYOK를 브라우저에 두고 Anthropic 등에 직접 호출.
- CLI·스킬·PPTX 등 **daemon 의존 기능은 축소/제한**.

세 토폴로지는 **동일 web 번들**; 활성화되는 transport(daemon SSE / api-direct / browser-only)만 다릅니다.

---

## 2. Web UI 구현 폴더

### 2.1 앱 루트

| 구분 | 경로 |
|------|------|
| **제품 Web UI (본 문서의 “web UI”)** | `open-design/apps/web` |
| 마케팅 랜딩 (별도 앱) | `open-design/apps/landing-page` |
| 로컬 API·에이전트·아티팩트 | `open-design/apps/daemon` |
| 패키징·headless 런타임 | `open-design/apps/packaged` |

Teamver 관점에서 “OD 제품 화면”을 볼 때는 **`apps/web`** 이 정답입니다. `landing-page`는 프로모션·에이전트 소개 등 **마케팅 전용**입니다.

### 2.2 `apps/web` 디렉터리 역할

```
apps/web/
├── app/                    # Next.js App Router — 얇은 셸
│   ├── layout.tsx
│   ├── [[...slug]]/        # catch-all → 클라이언트 SPA 진입
│   │   ├── page.tsx
│   │   └── client-app.tsx  # dynamic import of src/App (ssr: false)
│   └── desktop-pet/        # 데스크톱 펫 서브 라우트
├── src/                    # 실제 제품 UI·비즈니스 로직 (대부분)
│   ├── App.tsx             # 루트 React 트리 (Entry, Project, Marketplace, …)
│   ├── router.ts           # 클라이언트 라우팅 (Next 파일 라우팅 아님)
│   ├── components/         # 화면·워크스페이스·플러그인·Theater 등 (200+ 파일)
│   ├── styles/             # CSS 모듈/글로벌 (Tailwind + 대량 커스텀 CSS)
│   ├── state/              # config, projects, appearance, API protocols …
│   ├── providers/          # daemon SSE, OpenAI 호환, Anthropic, registry …
│   ├── runtime/            # preview srcdoc, markdown, exports, file-ops …
│   ├── i18n/               # 다국어 locale + content
│   ├── observability/      # white-screen, long-task, PostHog 연동 훅
│   ├── analytics/
│   ├── lib/
│   └── sidecar/            # web 측 sidecar proxy (빌드: build:sidecar)
├── public/
├── tests/                  # Vitest (components, runtime, i18n, styles …)
├── next.config.ts
└── package.json
```

**렌더링 모델**

- 제품은 **클라이언트 주도 SPA**입니다.
- `app/[[...slug]]/client-app.tsx`에서 `src/App`을 `next/dynamic`으로 로드하고 **`ssr: false`** 로 전체 트리를 정적 export 시 브라우저 전용 코드 평가 문제를 피합니다.
- URL 경로는 Next의 `app/` 파일 트리가 아니라 **`src/router.ts`** 기반 클라이언트 라우터가 담당합니다.
- `architecture.md` §3.1: Next.js를 쓰는 이유 — 랜딩 SSR, Topology C serverless, Vercel 1급 배포. 순수 Vite SPA만으로는 위 요구를 한 번에 맞추기 어렵다는 설계 rationale.

**주요 UI 영역 (코드 기준)**

- `src/components/EntryView`, `ProjectView`, `WorkspaceTabsBar` — 홈·프로젝트·탭 워크스페이스
- `src/components/workspace/` — 터미널, 사이드 채트, 탭 런처
- `src/components/plugins-home/`, `PluginDetailView`, `MarketplaceView` — 플러그인·마켓
- `src/components/Theater/` — critique theater 스트리밍 UI
- `src/components/pet/` — 데스크톱 펫 오버레이
- `src/runtime/srcdoc.ts` 등 — iframe preview (React 18 + Babel standalone 등, architecture §5)

### 2.3 공용 UI 패키지

| 패키지 | 경로 | 역할 |
|--------|------|------|
| `@open-design/components` | `open-design/packages/components` | web에서 import하는 공유 컴포넌트 |
| `@open-design/contracts` | `open-design/packages/contracts` | web ↔ daemon API 타입 |
| `@open-design/host` | `open-design/packages/host` | 호스트(데스크톱/임베드) 액션 경계 |
| `@open-design/platform` | `open-design/packages/platform` | 플랫폼·런타임 경로 등 |
| `@open-design/sidecar` | `open-design/packages/sidecar` | sidecar IPC 런타임 |

Web UI는 monolith 한 폴더에만 있지 않고, **contracts/components/host** 와 워크스페이스로 묶입니다.

---

## 3. Web 기술 스택

`apps/web/package.json` 및 `architecture.md` §3.1 정리.

### 3.1 코어

| 영역 | 기술 | 버전(패키지 기준) |
|------|------|-------------------|
| 프레임워크 | **Next.js** (App Router) | 16.x |
| UI | **React** / React DOM | 18.3.x |
| 언어 | **TypeScript** | 5.9.x (dev) |
| 스타일 | **Tailwind CSS** + PostCSS | Tailwind 4.x |
| Node 엔진 | | ~24 |
| dev 서버 | `next dev --turbopack` | |

### 3.2 주요 라이브러리

| 용도 | 라이브러리 |
|------|------------|
| Composer / 멘션 | Lexical (`@lexical/react`, `lexical`) |
| 애니메이션 | Motion (`motion`) |
| 아이콘 | lucide-react |
| 터미널 뷰 | xterm + addon-fit |
| 코드 하이라이트 | shiki |
| 분석 | posthog-js |
| LLM SDK (Topology C 등) | `@anthropic-ai/sdk`, `openai` |

### 3.3 빌드·테스트·산출물

| 스크립트 | 의미 |
|----------|------|
| `pnpm dev` | Next dev (Turbopack) |
| `pnpm build` | `next build` (export/배포 설정은 `next.config.ts`) |
| `pnpm build:sidecar` | web sidecar TypeScript 빌드 |
| `pnpm test` | Vitest |

### 3.4 백엔드 연동 (Web 관점)

- 기본 daemon URL: **`http://localhost:7456`**
- REST/SSE: `/api/*` (세션, 프로젝트, 채팅, import 등 — `packages/contracts`)
- Web state: UI 설정은 React/localStorage 등; **프로젝트·대화·파일은 daemon API에서 hydrate** (`architecture.md` §3.1)

### 3.5 Next.js를 “SPA처럼” 쓰는 이유 (한 줄)

마케팅/서버less 경로와 **동일 repo·동일 컴포넌트**로 Vercel 배포를 유지하면서, 메인 제품 트리는 브라우저 API에 의존하므로 App Router 셸 + `src/App` SPA 패턴을 택했습니다.

---

## 4. Local daemon (`apps/daemon`) 구현 구조

### 4.1 역할 요약

`architecture.md` §3.2 기준, daemon(`od`)은 로컬에서 다음을 담당합니다.

| 책임 | 설명 |
|------|------|
| HTTP API | 기본 `http://127.0.0.1:7456`, REST + **SSE** (`/api/*`) |
| 세션·런 | 탭/대화 단위 세션, 채팅 생성·스트리밍·도구 호출 |
| Agent adapter pool | PATH/설정 기반 CLI 탐지 → spawn·stdout 파싱·재사용 (`runtimes/`) |
| Skills | `~/.claude/skills`, `./skills`, `./.claude/skills` 스캔·watch (`skills.ts`) |
| Design system | `DESIGN.md` 등 resolve·주입 (`design-systems*.ts`) |
| 아티팩트 | 로컬 디스크의 프로젝트/파일; preview·export 파이프라인 |
| Desktop 연동 | sidecar IPC, folder import HMAC (`desktop-auth.ts`, `sidecar/`) |
| 부가 | 플러그인 마켓·MCP·미디어·터미널(PTY)·루틴·커넥터 등 |

Web은 transport만 바꿉니다(daemon SSE vs direct API). **도메인 상태·에이전트 실행은 daemon 쪽**이 기본입니다.

### 4.2 앱 루트·진입점

**경로:** `open-design/apps/daemon`

| 진입 | 파일 | 설명 |
|------|------|------|
| CLI 바이너리 | `bin/od.mjs` → `dist/cli.js` | npm/pnpm `od` 명령 |
| CLI 라우터 | `src/cli.ts` | 기본: daemon 기동; 서브커맨드 `media`, `mcp`, `research`, artifacts, handoff 등 |
| HTTP 기동 | `src/daemon-startup.ts` | `--port` / `OD_PORT`(기본 **7456**), `--host` / `OD_BIND_HOST`, `--no-open` |
| HTTP 서버 | `src/server.ts` | **Express 5** 앱 조립, 대형 `startServer()`, 라우트 등록·채팅/run 코어 |
| Sidecar | `src/sidecar/server.ts` | `tools-dev` / desktop / packaged와 JSON IPC (상태, desktop auth 등) |
| 패키지 export | `"./sidecar"` | 오케스트레이터가 daemon sidecar 모듈 import |

로컬 개발: `pnpm --filter @open-design/daemon dev` → build 후 `node dist/cli.js --no-open`. 실무에서는 **`pnpm tools-dev run web`** 이 web + daemon을 함께 띄웁니다.

### 4.3 `src/` 디렉터리 맵

daemon은 **단일 Node 패키지**이며, `server.ts`가 허브이고 도메인은 파일·하위 폴더로 분리됩니다.

```
apps/daemon/
├── bin/od.mjs
├── src/
│   ├── cli.ts                    # od CLI (daemon + 서브커맨드)
│   ├── daemon-startup.ts         # parse argv → startServer
│   ├── server.ts                 # Express, register*Routes, chat/run/SSE
│   ├── server-context.ts         # 요청·런타임 컨텍스트
│   ├── db.ts                     # SQLite 메타 (projects, conversations, tabs, …)
│   ├── storage/                  # project-storage, daemon-db 설정 스텁
│   ├── project-routes.ts         # /api/projects, conversations, templates, events …
│   ├── import-export-routes.ts   # import/folder, finalize, export
│   ├── chat-routes.ts            # POST /api/chat → text/event-stream
│   ├── media-routes.ts           # 미디어 생성 API
│   ├── mcp-routes.ts             # MCP 연동 HTTP
│   ├── terminal-routes.ts        # 웹 터미널 (node-pty)
│   ├── social-share-routes.ts
│   ├── routes/                   # 분리된 route 모듈
│   │   ├── active-context.ts
│   │   ├── deploy.ts
│   │   ├── design-system-tool.ts
│   │   ├── handoff.ts
│   │   ├── host-tools.ts
│   │   ├── live-artifact.ts
│   │   ├── memory.ts
│   │   ├── routine.ts
│   │   ├── static-resource.ts
│   │   └── xai.ts
│   ├── runtimes/                 # agent adapter pool
│   │   ├── registry.ts           # claude, codex, cursor-agent, aider, amr, …
│   │   ├── defs/*.ts             # CLI별 spawn 인자·capability
│   │   ├── detection.ts, launch.ts, invocation.ts, mcp.ts …
│   ├── runs.ts, run-*.ts         # run lifecycle, retry, diagnostics, artifacts
│   ├── plugins/                  # 마켓·install·pipeline·atoms·snapshots …
│   ├── skills.ts                 # skill registry
│   ├── design-systems*.ts        # import, preview, generation jobs …
│   ├── connectors/               # 커넥터 + routes
│   ├── registry/                 # 플러그인/레지스트리 백엔드 (github, static, db)
│   ├── research/                 # research CLI·Tavily 등
│   ├── critique/                 # theater/critique persistence
│   ├── live-artifacts/           # live artifact 스트림
│   ├── media-adapters/           # 이미지·오디오 등 실행 어댑터
│   ├── genui/                    # GenUI 관련 서버 로직
│   ├── http/                     # SSE/CORS 등 HTTP 유틸
│   ├── integrations/             # 외부 연동
│   ├── logging/, metrics/        # observability
│   ├── sidecar/                  # daemon sidecar IPC server
│   ├── tools/                    # od tools (connectors, design-systems, live-artifacts CLI)
│   ├── prompts/                  # system/discovery/deck 프롬프트 조립
│   ├── desktop-auth.ts           # desktop folder-import HMAC gate
│   ├── projects.ts, project-watchers.ts, project-locations.ts …
│   └── (기타) memory*, automation*, artifact*, mcp-*, xai-*, analytics …
├── tests/                        # Vitest (routes, runtimes, plugins, SSE …)
└── package.json
```

**라우트 등록 패턴:** `server.ts`의 `startServer()` 안에서 `registerProjectRoutes`, `registerChatRoutes`, `registerImportRoutes`, `registerMediaRoutes`, `registerMcpRoutes`, `registerTerminalRoutes`, `registerRoutineRoutes`, `registerConnectorRoutes` 등을 순서대로 호출합니다. 신규 API는 보통 `*-routes.ts` 또는 `routes/*.ts` + `register*` 함수로 추가합니다.

### 4.4 데이터·저장 경계

설계 문서(`architecture.md` §3.6)와 **현재 코드**를 함께 보면:

| 계층 | 저장 | 용도 |
|------|------|------|
| 프로젝트 파일 | `.od/projects/<id>/` 또는 `metadata.baseDir`(folder import) | HTML/JSX, 업로드, 스킬 산출물 — **파일이 SSOT** |
| SQLite | `.od/app.sqlite` (`db.ts`, **better-sqlite3**) | 프로젝트·대화·메시지·탭 등 **메타** (구 localStorage 대체) |
| 아티팩트 메타 | `artifact.json`, `history.jsonl` 등 (프로젝트 트리) | git-friendly 이력·메타 (`architecture.md` rationale) |
| 설정 | `config.toml` / JSON, plain text | BYOK·경로; daemon `config` (mode 0600 권장) |

플러그인·미디어·루틴·critique 등은 `plugins/persistence.ts`, `media-tasks.ts`, `critique/persistence.js` 등에서 **SQLite 마이그레이션**으로 `db.ts`에 붙습니다. `storage/daemon-db.ts`는 향후 Postgres(`OD_DAEMON_DB=postgres`) 스텁만 정의하고, v1 기본은 **sqlite**입니다.

**정적 web 번들:** packaged/self-host 시 daemon이 built web SPA를 서빙하는 fallback (`registerStaticSpaFallback`, `isStaticSpaFallbackRequest`) — Docker **7456 단일 포트** 경로와 맞물립니다.

### 4.5 Web ↔ Daemon 프로토콜 (요약)

`architecture.md` §7 — **HTTP + SSE** (브라우저는 dev/prod 동일 `/api/*`).

대표 surface:

```
GET  /api/health
GET  /api/agents
GET  /api/skills
GET  /api/design-systems
GET  /api/projects
POST /api/projects
POST /api/import/folder          # desktop HMAC optional (X-OD-Desktop-Import-Token)
GET  /api/projects/:id/files
POST /api/projects/:id/upload
POST /api/chat                   → text/event-stream
POST /api/artifacts/save
… (plugins, media, mcp, terminals, routines, memory, …)
```

요청/응답 타입: **`@open-design/contracts`**. SSE는 nginx 등 프록시에서 **버퍼링·gzip 비활성** 필요 (`architecture.md` §8).

### 4.6 Daemon 기술 스택

`apps/daemon/package.json` 정리.

#### 4.6.1 코어

| 영역 | 기술 | 비고 |
|------|------|------|
| 런타임 | **Node.js** | engines ~24 |
| HTTP | **Express** | 5.x |
| 언어 | **TypeScript** | `tsc` → `dist/` |
| DB | **better-sqlite3** | WAL, `.od/app.sqlite` |
| 파일 watch | **chokidar** | skills·프로젝트 등 |
| 업로드 | **multer** | multipart |
| 터미널 | **node-pty** | 웹 터미널 |
| HTTP 클라이언트 | **undici** | 아웃바운드 |
| 테스트 | **Vitest** | `tests/` 대량 |

#### 4.6.2 OD 워크스페이스·기타

| 패키지/라이브러리 | 용도 |
|-------------------|------|
| `@open-design/contracts` | API·이벤트 타입 |
| `@open-design/plugin-runtime` | 플러그인 실행 |
| `@open-design/registry-protocol` | 레지스트리 프로토콜 |
| `@open-design/agui-adapter` | AG-UI 어댑터 |
| `@open-design/sidecar`, `sidecar-proto` | IPC with desktop/tools-dev |
| `@open-design/platform`, `diagnostics` | 경로·진단 |
| `@modelcontextprotocol/sdk` | MCP |
| `posthog-node`, `@opentelemetry/api`, `prom-client` | telemetry/metrics |
| `cheerio`, `jszip`, `tar`, `blake3-wasm` | HTML/ZIP/해시 등 |

배포 형태: npm **`od`** CLI + 소스 빌드; `architecture.md`는 `pkg`/thin script 언급 — **실체는 이 repo의 TypeScript daemon**입니다.

### 4.7 Agent adapter pool (`runtimes/`)

`architecture.md` §3.3 · `agent-adapters.md`와 대응:

1. **Detect** — CLI on PATH, config dir probe (`detection.ts`)
2. **Spawn** — skill + design-system + cwd를 artifact/project root에 맞춤 (`launch.ts`, `defs/*.ts`)
3. **Stream** — JSONL 또는 line parser → run 이벤트 (`runs.ts`, `json-event-stream.ts`, CLI별 `*-stream.ts`)
4. **Capabilities** — multi-turn, surgical edit, native skills 등 (`capabilities.ts`)

`runtimes/registry.ts`에 **claude, codex, cursor-agent, gemini, opencode, aider, amr, qwen, copilot, …** 등 다수 `defs`가 등록됩니다. 로컬 프로필은 `local-profiles.ts`로 확장됩니다.

### 4.8 Sidecar·Desktop·orchestrator

- Daemon sidecar: desktop main / `tools-dev` / packaged가 **JSON IPC**로 STATUS, **REGISTER_DESKTOP_AUTH**, import token mint 등 교환 (`packages/sidecar`, `sidecar-proto`).
- `OD_REQUIRE_DESKTOP_AUTH=1`: desktop 번들 flow에서 folder import **HMAC gate** 강제 (`architecture.md` Desktop folder-import auth).
- Web·Desktop sidecar는 **`apps/web`의 `src/sidecar`**, daemon은 **`apps/daemon/src/sidecar`** — 역할이 다르며 orchestrator가 프로세스별로 기동합니다.

### 4.9 Web / Daemon / Desktop 대비

| | Web | Daemon | Desktop |
|--|-----|--------|---------|
| 프로세스 | 브라우저 / Next dev | **장기 Node** | Electron main |
| UI | React SPA | 없음 | 없음 (web 로드) |
| API 제공 | 소비자 | **제공자** (`/api/*`) | IPC + web과 동일 HTTP |
| CLI spawn | ❌ | ✅ | ❌ (daemon 경유) |
| 로컬 파일 SSOT | preview만 | **read/write** | picker·openPath |

---

## 5. Desktop 구현 폴더

### 5.1 앱 루트

**경로:** `open-design/apps/desktop`

```
apps/desktop/
├── src/main/               # Electron main process 전부
│   ├── index.ts            # 앱 진입, 메뉴, sidecar bootstrap, IPC 등록
│   ├── runtime.ts          # BrowserWindow, URL 정책, import picker, splash
│   ├── preload.cts         # renderer ↔ main 브릿지
│   ├── updater.ts          # 자동 업데이트
│   ├── pdf-export.ts       # PDF/인쇄 내보내기
│   ├── open-path.ts        # shell.openPath 검증
│   ├── diagnostics.ts      # 진단 덤프 IPC
│   ├── splash-video.ts
│   ├── uncaught-exception.ts
│   └── installer-observations.ts
├── tests/main/             # main 로직 Vitest (Electron 부트 없이 pin)
├── dist/main/              # tsc 출력 (package.json `"main"`)
└── package.json
```

**중요:** `apps/desktop` 아래에 **React renderer 소스나 별도 FE 폴더가 없습니다.** 화면은 web 번들을 로드합니다.

### 5.2 Desktop main이 담당하는 것 (요약)

| 영역 | 설명 |
|------|------|
| 창·네비게이션 | `BrowserWindow`, 자식 창 URL allowlist (`runtime.ts`) |
| Sidecar / daemon | `@open-design/sidecar`로 daemon과 IPC; desktop auth secret 등록 |
| OS 권한 | 폴더 picker, `shell.openPath`, PDF export |
| 보안 | folder import HMAC (`architecture.md` “Desktop folder-import auth”) |
| 업데이트 | `@open-design/host` + desktop updater 채널 |
| 펫·AMR 등 | env/메뉴/IPC로 web과 협업 |

`index.ts`는 `@open-design/sidecar-proto`, `@open-design/sidecar`, `@open-design/platform`, 로컬 `runtime.js` 등을 묶어 **main 프로세스 오케스트레이션**을 합니다.

---

## 6. Desktop 기술 스택

`apps/desktop/package.json` 정리.

### 6.1 코어

| 영역 | 기술 | 버전(패키지 기준) |
|------|------|-------------------|
| 데스크톱 셸 | **Electron** | 41.x (devDependency; 런타임) |
| 언어 | **TypeScript** | 6.x |
| Node 엔진 | | ~24 |
| 빌드 | `tsc -p tsconfig.json` → `dist/main/` |
| 테스트 | Vitest (`tests/main/*.test.ts`) |

### 6.2 의존 워크스페이스 패키지

| 패키지 | 용도 |
|--------|------|
| `@open-design/sidecar` | JSON IPC 서버, sidecar runtime bootstrap |
| `@open-design/sidecar-proto` | 메시지·env·desktop update 채널 계약 |
| `@open-design/host` | 호스트 캡처·업dater 액션 등 |
| `@open-design/platform` | process stamp, 경로 |
| `@open-design/launcher-proto` | 런처/패키징 연동 |
| `@open-design/diagnostics` | 진단 export |
| `@open-design/download` | 다운로드 관련 main 지원 |

### 6.3 Web / Daemon / Desktop 스택 대비

| | Web (`apps/web`) | Daemon (`apps/daemon`) | Desktop (`apps/desktop`) |
|--|------------------|-------------------------|---------------------------|
| UI | Next.js + React 18 | 없음 | 없음 (web 임베드) |
| HTTP API | 클라이언트 | **Express 서버** | IPC → daemon |
| 스타일 | Tailwind 4 + CSS | N/A | N/A |
| 프로세스 | 브라우저 / Next dev | Node `:7456` | Electron main (+ preload) |
| 배포 | static/Vercel | `od` CLI / Docker / packaged | Electron 앱 |

---

## 7. Web ↔ Daemon ↔ Desktop 실행 관계

1. **개발 (Topology A)**  
   - `pnpm tools-dev run web` — **daemon `:7456`** + Next `:3000`  
   - desktop 추가 시 orchestrator가 web URL을 Electron에 로드 (`architecture.md` §8 Local)

2. **기능 변경 위치**  
   - 화면·클라이언트 transport → **`apps/web/src`** (및 `packages/components`)  
   - API·에이전트·파일·플러그인 → **`apps/daemon/src`**  
   - OS/보안/창/업데이트 → **`apps/desktop/src/main`**

3. **Desktop-only UI 조각**  
   - 예: `apps/web/app/desktop-pet/`, `src/components/pet/` — 여전히 **web repo**; desktop은 창·IPC만

4. **Packaged**  
   - `apps/packaged`: Electron vs headless(daemon+web only) — `OD_REQUIRE_DESKTOP_AUTH` / import gate (`architecture.md`)

---

## 8. 배포·Docker

### 8.1 Docker (beginner path)

문서: `open-design/docs/deployment/docker.md`

- 폴더: `open-design/deploy` (`docker-compose.yml`)
- 기본 접속: **`http://127.0.0.1:7456/`** (호스트 포트 매핑 `7456:7456`)
- 헬스: `docker-compose ps` → `healthy`
- `architecture.md` §8 예시 compose는 daemon + web 이미지 분리(`3000` web, `OD_DAEMON_URL`)도 설명 — **단일 7456 이미지 경로**와 **compose 분리**는 배포 패키징 버전에 따라 README/deploy 쪽을 우선 확인

### 8.2 로컬 (개발자)

```sh
cd open-design
pnpm install
pnpm tools-dev run web    # daemon + web
```

SSE/nginx 주의: `/api/*` 스트림은 버퍼링·gzip 끄기 (`architecture.md` §8).

---

## 9. Monorepo 내 OD 앱 한눈에

| 앱 | 경로 | 한 줄 설명 |
|----|------|------------|
| web | `apps/web` | **제품 UI** (Next 셸 + React SPA) |
| daemon | `apps/daemon` | **Express API·SSE·CLI spawn·SQLite·sidecar** |
| desktop | `apps/desktop` | **Electron main** (UI 없음) |
| packaged | `apps/packaged` | 배포용 번들 entry |
| landing-page | `apps/landing-page` | 마케팅 사이트 |
| telemetry-worker | `apps/telemetry-worker` | 텔레메트리 워커 |

---

## 10. Teamver 연동·참고 시 체크리스트

OD를 Teamver AI App으로 붙이거나 FE/BE를 나눌 때 아래를 구분하면 혼선이 줄어듭니다.

1. **제품 FE** → `open-design/apps/web` (Teamver `ns-teamver-fe-v2`와 별 레포·별 스택)
2. **제품 BE(로컬)** → `open-design/apps/daemon` — Teamver Main BE와 **별 프로세스**; IAM·조직은 `개발설계/03_teamverBE_AppsBE_연동방안.md` 등 **별 설계**
3. **데스크톱** → OD Electron(`apps/desktop`) vs Teamver desktop — 구조 상이
4. **포트·헬스** → daemon **7456**; Docker self-host 동일
5. **계약** → HTTP/SSE 타입은 `@open-design/contracts`; 상세 보안·import gate는 `architecture.md` 원문
6. **문서 동기화** → 본 문서는 폴더·스택·역할 **스냅샷**

---

## 11. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-10 | 초안 — `apps/web` / `apps/desktop` 실사 및 `architecture.md`, `docker.md` 반영 |
| 2026-06-10 | `apps/daemon` 구현 구조·스택·데이터·sidecar 절(§4) 추가; 개요·절 번호 정리 |
