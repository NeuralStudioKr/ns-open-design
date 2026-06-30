# embed 숨김 UI · 불필요 API 호출 점검

**SSOT:** Teamver embed에서 UI는 `resolveTeamverBranding()` (`apps/web/src/teamver/branding/config.ts`)로 숨기지만, **React hook / App bootstrap**이 먼저 daemon HTTP를 치는 잔재를 막는다.

**정책 코드:** `apps/web/src/teamver/embedDaemonFetchPolicy.ts`

---

## 1. marketplaces 란?

| 항목 | 설명 |
|------|------|
| **역할** | Open Design **플러그인 카탈로그 URL** 등록소 (공식·서드파티 manifest). daemon SQLite `plugin_marketplaces` |
| **API** | `GET/POST /api/marketplaces`, `…/refresh`, `…/trust` |
| **UI** | standalone `PluginsView` · `MarketplaceView` — 카탈로그 브라우즈·설치 |
| **embed** | `hidePluginRegistry` + route clamp → **화면 미마운트** → boot 시 **호출 없음** (Home은 `listPlugins`만, marketplaces 아님) |

`listPlugins` (`GET /api/plugins`)는 **이미 설치된** 번들/공식 플러그인 목록. embed slide deck 칩·예시에 deck 모드 플러그인이 필요해 **유지**.

**관련:** [30 embed home boot API 최적화](./30_embed_home_boot_API_최적화.md) — 전체 분석·Before/After·검증 SSOT.

---

| API | 이전 원인 | embed 조치 |
|-----|-----------|------------|
| `/api/automation-*`, `/api/routines` | **TasksView 항상 mount** (display:none) | nav `tasks` 숨김 → **unmount** |
| `/api/plugins` ×3, `/api/marketplaces` | **PluginsView 항상 mount** | nav `plugins` 숨김 → **unmount** |
| `/api/connectors*` | EntryView boot prefetch | `hideComposerIntegrations` → skip |
| `/api/recent-dirs` | HomeView + ChatComposer | `hideLocalWorkspaceControls` → skip |
| `/api/memory/events` | MemoryToast SSE | embed skip |
| `/api/media/providers/aihubmix/models` | HomeView media picker | slide-only skip |
| `/api/agents?stream=1` | App bootstrap | embed skip |
| `/api/prompt-templates`, `/api/media/config` | App bootstrap | slide-only skip |
| `/api/community/discord`, `/api/github/*` | marketing hooks | embed skip |
| `/api/version` (2회) | App + analytics | About 패널 skip (analytics 1회만) |
| `/api/runs` (연속) | poll + boot race | **in-flight coalesce** |

**유지 (필수):** `app-config`, `skills`, `design-templates?mode=deck`, `design-systems`, `projects/recent`, `plugins` (1회·deck 칩), BFF `auth/session`, `runtime-config`, `teamver-bff/projects` (registry).

**중복 (남을 수 있음):** `projects/recent`·`runtime-config`·`auth/session` — workspace boot + embed session hook (캐시 60s). `/api/runs` poll — idle 30s (활성 run 없을 때).

---

## 3. marketing / community API

| API | 용도 | standalone | embed (수정 후) |
|-----|------|------------|-----------------|
| `GET /api/community/discord` | Discord 온라인 수 (topbar 배지) | ✅ | ❌ `useDiscordPresence` |
| `GET /api/github/open-design` | GitHub star 수 (topbar) | ✅ | ❌ `useGithubStars` |
| `POST /api/social-share` | OD 마케팅 공유 URL 생성 | settings / FileViewer | ❌ `hideExternalLinks` / `hideExternalShareSurfaces` |

**원인 패턴:** UI `if (embed) return` **보다 먼저** hook `useEffect`가 fetch.

---

## 4. desktop-only boot (embed BYOK)

embed는 `lockExecutionConfig` → `mode=api`, `agentId=null`. 아래는 **CLI/AMR 데스크탑** 전용.

| API | 용도 | embed |
|-----|------|-------|
| `GET /api/agents?stream=1` | 로컬 CLI 에이전트 목록 SSE | ❌ boot skip |
| `GET /api/integrations/vela/status` | AMR 로그인 상태 | ❌ |
| `GET /api/amr/models` | AMR 모델 프리셋 | ❌ |
| `GET /api/connectors/composio/config` | Composio (이미 skip) | ❌ |

---

## 5. slide-only MVP에서 제외

| API | 용도 | embed slide-only |
|-----|------|------------------|
| `GET /api/prompt-templates` | 이미지/비디오 프롬프트 갤러리 | ❌ boot skip |
| `GET /api/media/config` | 미디어 provider 키 (image/video 칩) | ❌ boot skip |

---

## 5b. daemon API 인증 — `fetchTeamverDaemon`

embed 에서 daemon `/api/*` 는 nginx **`auth_request` → Main BE session-check** 를 탄다. BFF (`/teamver-bff/*`) 와 달리 실패 시 **302 signin** 이 될 수 있다.

| 경로 | nginx auth | FE wrapper | credentials (embed) |
|------|------------|------------|---------------------|
| `/teamver-bff/auth/session` | ❌ | `designBffClient` | `include` |
| `/api/runs` (poll·events·cancel) | ✅ | `fetchTeamverDaemon` | **`include`** (`36f51072a`) |
| `/api/projects/*` 등 | ✅ | `fetchTeamverDaemon` | `include` + `X-Workspace-Id` |

**코드 SSOT:** `apps/web/src/teamver/teamverDaemonHeaders.ts` · `apps/web/src/providers/daemon.ts`

**배포·검증 대기:** staging web 재배포 후 Network 에서 `GET /api/runs` 가 signin 302 없이 **200** 인지 확인. [00 §2026-06-30 runs 302](./00_구현_내역_누적.md)

**2순위 (미구현):** nginx `/api/*` 도 BFF 처럼 401 JSON — background poll 이 HTML redirect 를 받지 않도록.

---

## 6. embed에서 **유지**하는 daemon API (대표)

| API | 이유 |
|-----|------|
| `GET/PUT /api/app-config` | 실행 설정·테마 |
| `GET /api/projects`, messages PUT | 프로젝트·채팅 SSOT |
| `GET /api/skills`, `/api/design-templates?mode=deck` | 슬라이드 생성 |
| `GET /api/design-systems` | 홈 DS 피커 |
| `GET /api/plugins` | deck 플러그인 칩 (marketplaces 아님) |
| runtime-config BFF | managed BYOK |
| `GET /api/version` | analytics 버전 태그 (경량) |
| `GET /api/runs` | background poll (BYOK 에서 보통 `[]`) — **cookie SSO** (`fetchTeamverDaemon`) |

---

## 7. 체크리스트 (staging Network — `/` only)

embed 로그인 후 **정상 (있어야 함):**

- [ ] `GET /api/runs` → **200** `{"runs":[]}` (302 signin 없음 — web `36f51072a` 배포 후)

embed 로그인 후 **없어야 함**:

- [ ] `/api/community/discord`
- [ ] `/api/github/open-design`
- [ ] `/api/social-share`
- [ ] `/api/agents?stream=1`
- [ ] `/api/integrations/vela/status`
- [ ] `/api/amr/models`
- [ ] `/api/prompt-templates`
- [ ] `/api/media/config`
- [ ] `/api/automation-templates`, `/api/routines`, `/api/marketplaces`
- [ ] `/api/connectors`, `/api/connectors/status`, `/api/connectors/discovery`
- [ ] `/api/recent-dirs`
- [ ] `/api/memory/events`

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-30 | §5b `fetchTeamverDaemon` embed credentials · `/api/runs` 302 triage · 배포 검증 대기 |
| 2026-06-29 | Hidden tab unmount + boot policy 확장 + runs coalesce |
| 2026-06-29 | `embedDaemonFetchPolicy` · Discord/GitHub/social-share · agents/AMR/media/prompt-templates boot gate |
