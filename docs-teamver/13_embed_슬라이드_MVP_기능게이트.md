# Teamver embed — 슬라이드 MVP 기능 게이트

Teamver Design embed(`design.teamver.com`) **1차 출시 범위는 슬라이드(덱) 생성·편집**이다.  
OD standalone의 풀 스펙(미디어·MCP·플러그인 마켓·커뮤니티·자동화 등)은 embed에서 **비노출**한다.

**SSOT:** `isTeamverEmbedMode()` + `resolveTeamverBranding()` (`apps/web/src/teamver/branding/config.ts`)  
**정책 헬퍼:** `apps/web/src/teamver/branding/slideOnlyMvpPolicy.ts`

**관련:** [12_embed_로컬UX_제거](./12_embed_로컬UX_제거_체크리스트.md) · [14_Design_Drive_연동_설계](./14_Design_Drive_연동_설계.md) · [15_웹참조 BYOK FAQ](./15_웹참조_BYOK_web_fetch_FAQ.md) · [04_구현_우선순위](./04_구현_우선순위.md) · [10_세션·OD패치](./10_세션·OD패치_보강.md)

---

## 1. 원칙

| 우선순위 | embed 1차 출시 |
|----------|----------------|
| **P0 노출** | Slide deck 생성·편집, 프로젝트 목록, Design System, 파일 첨부, Drive publish, 슬라이드 관련 스킬 |
| **P0 비노출** | Image / Video / Audio / HyperFrames (모든 진입점) |
| **P0 비노출** | MCP / Connectors / Composio / Marketplace / Plugin registry / Community gallery |
| **P1 비노출** | Prototype, Live artifact, "Create plugin", Figma migration, Pet/Hatch, 미디어 toolbox 액션 |
| **P2 유지·검토** | Template 탭(사용자 saved), Claude ZIP import, Figma URL import, Skills(deck) |

standalone OD는 영향 없음 — **embed 모드에서만** 플래그가 켜진다.

> **Agent SSOT:** 1차 **제공/비노출/제외** 범위와 코드 루프 우선순위는 [04 §1차 제공 범위 SSOT](./04_구현_우선순위.md#1차-제공-범위-ssot-agent--코드-루프용-2026-06-19-확정) 를 따른다. MCP·외부 share·마켓 **Teamver 신규 개발은 MVP 제외**.

---

## 2. 기능 인벤토리 (전수 검토)

### 2.1 P0 — Home / 프로젝트 생성 경로

| ID | 위치 | 동작 | 게이트 | 상태 |
|----|------|------|--------|------|
| S-1 | `HomeHero` create chips | Image / Video / Audio / HyperFrames / Prototype / Live artifact | `slideOnlyMvp` | ✅ loop 152 |
| S-2 | `HomeHero` shortcuts (⋯) | Create plugin, From Figma | 동일 | ✅ |
| S-3 | `NewProjectPanel` tabs | Media (image/video/audio), Prototype, Live artifact, Other | `slideOnlyMvp` (`visibleNewProjectTabs`) | ✅ |
| S-4 | `EntryShell` openNewProject | 기본 탭 `prototype` → embed `deck` | `defaultNewProjectTab` | ✅ |
| S-4b | `EntryShell` `handlePluginLoopSubmit` 메타데이터 `kind` 정규화 | 자유 입력은 `payload.projectKind=other` / 미설정으로 들어와 daemon 시스템 프롬프트의 non-slide discovery 라디오를 깨움. embed `slideOnlyMvp` 시 payload 와 무관하게 `deck`로 고정(`resolvePluginLoopProjectKind` early-return), 그 외는 기존 `payload.projectKind ?? payload.projectMetadata?.kind ?? 'prototype'` 폴백 유지 | `slideOnlyMvp` (`resolvePluginLoopProjectKind` 헬퍼) + daemon `TEAMVER_SLIDE_ONLY_SCOPE` discovery override (이중 안전선) | ✅ loop 388 |
| S-5 | `HomeView` 하단 community gallery / Templates | embed: **「커뮤니티」** + deck 플러그인만 + **1차 필터(Prototype·Video…) 숨김** + deck **서브카테고리** 유지. Design templates는 Home/Settings 모두 FE 필터뿐 아니라 daemon listing도 `/api/design-templates?mode=deck`으로 축소; standalone: 풀 카탈로그 | `hideCommunityGallery` + `slideOnlyMvp` + `communityGalleryFacetUi` + daemon `mode=deck` | ✅ loop 152+ · loop 385 · loop 386 |

### 2.2 P0 — Composer / + 메뉴 / 슬래시 (전수)

| ID | 위치 | 동작 | 게이트 | 상태 |
|----|------|------|--------|------|
| C-1 | `HomeHero` `+` 메뉴 → Connectors | 모든 워크스페이스 connector 리스트, Add connector | `hideComposerIntegrations` | ✅ loop 152 |
| C-2 | `HomeHero` `+` 메뉴 → MCP | enabled MCP server 리스트, Add MCP | 동일 | ✅ |
| C-3 | `HomeHero` `+` 메뉴 → Plugins → "Add plugin" | 플러그인 레지스트리(marketplace) 진입 | **`hidePluginRegistry`** | ✅ loop 152 |
| C-4 | `ChatComposer` `+` 메뉴 동일 | 프로젝트 composer 동일 row | 동일 | ✅ |
| C-5 | `HomeHero` @멘션 picker | 탭: All · Files · Plugins · Skills · MCP · Connectors | `hideComposerIntegrations` (MCP·Connectors 탭 제거) | ✅ |
| C-6 | `ChatComposer` slash 팔레트 | `/mcp`, `/mcp <id>`, `/search` | `hideComposerIntegrations` (MCP 슬래시 제거) | ✅ |
| C-7 | `ChatComposer` slash 인라인 | `/pet`, `/hatch` 인라인 명령 (palette 노출 X) | embed `slideOnlyMvp` 시 `embedBlockedComposerSlashReason`으로 submit 차단 | ✅ |
| C-8 | `ChatComposer` `DesignToolboxPanel` actions | `image-gen`, `video-gen`, `motion`, `motion-polish` | **`slideOnlyMvp`** (`visibleDesignToolboxActions`) | ✅ loop 152 |
| C-9 | `ChatComposer` `DesignToolboxPanel` resources | MCP servers·MCP templates·connectors | `hideComposerIntegrations` | ✅ loop 152 |
| C-10 | `AssistantMessage` `NextStepActions` | "More" 메뉴의 미디어/모션 액션 | `slideOnlyMvp` (toolbox 필터 공유) | ✅ loop 152 |

### 2.3 P0 — 좌측 nav / 설정 (이미 처리)

| 항목 | 메커니즘 | 상태 |
|------|----------|------|
| Nav: Tasks / Plugins / Integrations | `hideNavViews` | ✅ |
| Settings: API key / CLI / MCP / Composio / Pet | `allowedSettingsSections` (language, appearance, designTemplates) | ✅ |
| Topbar 실행 스위처 / Agent picker | `hideTopbarExecutionSwitcher`, `hideStudioExecutionControls` | ✅ |
| Handoff (open-design.ai) | `hideHandoffButton` | ✅ |
| Use everywhere chip | `hideUseEverywhereChip` | ✅ |
| Updater popup | `EntryShell` embed 분기 | ✅ |
| Workspace tab strip | `hideWorkspaceTabsBar` | ✅ |
| Project workspace escape bar | `TeamverWorkspaceEscapeBar` — Design 홈(내부) + Teamver 앱(외부). embed `ProjectView`는 ChatPane `onBack`/`backLabel`을 숨겨 상위 네비를 escape bar 하나로 통일 | ✅ loop 183 · loop 389 |

### 2.4 P0 — 파일 첨부 정책 (검토)

| 항목 | 현재(daemon) | embed 권장 | 게이트 | 상태 |
|------|--------------|------------|--------|------|
| 단일 파일 사이즈 | 200 MB (`projectUpload` multer) | 50 MB (FE pre-check 경고) | `embedFileAttachPolicy` | ✅ loop 161 |
| 1 요청 파일 수 | 12 (`array('files', 12)`) | 12 유지 | — | — |
| MIME / 확장자 | 제한 없음 (daemon upload) | 슬라이드 친화 화이트리스트 | `embedFileAttachPolicy` (FE) · `drive_import_policy.py` (import-drive BE) | ✅ loop 161/162 |
| 클립보드 이미지 | 자동 업로드 | 유지 | — | — |
| 폴더 import | 차단됨 (`hideLocalWorkspaceControls`) | 유지 | — | ✅ |

**원칙:** daemon은 200 MB 한계로 백엔드 보호선 유지, FE는 embed에서 "큰 비디오 / 실행 파일은 슬라이드 워크플로 외부" 안내.

### 2.5 P1 — 펫·창의 도구 (이미 무력화)

| 항목 | 메커니즘 | 비고 |
|------|----------|------|
| `PetOverlay` floating sprite | `config.pet.enabled` 기본 `false`, embed Settings 차단으로 토글 불가 | OK |
| `/hatch <concept>` 슬래시 | Codex CLI 의존 → embed에서 실행 실패 | low risk, 문서 |
| `/pet wake` / `/pet adopt` | Settings 핀 차단 → no-op | 문서 |
| Library / Pets settings 섹션 | `allowedSettingsSections` 미포함 | OK |

### 2.5b P0 — daemon 시스템 프롬프트 / `<question-form>` 옵션 정제 (loop 388)

| ID | 위치 | OD 기본 동작 | embed 결정 | 게이트 |
|----|------|--------------|-----------|--------|
| Q-1 | `discovery.ts` `<question-form id="task-type">` (Default-router) | `taskType` 라디오에 `Prototype` / `Live artifact` / `Slide deck` / `Image` / `Video` / `HyperFrames` / `Audio` / `Other` 8지선다 | **task-type 폼 전체 미발행** — `mediaExecution.mode==='disabled'` 시 artifact kind는 항상 `Slide deck` | `TEAMVER_SLIDE_ONLY_SCOPE` (daemon `prompts/system.ts`) |
| Q-2 | `discovery.ts` `<question-form id="discovery">` (Quick brief — 30s) `output` 질문 | `Slide deck / pitch`·`Single web prototype / landing`·`Multi-screen app prototype`·`Dashboard / tool UI`·`Editorial / marketing page`·`Other — I'll describe` 6지선다 | **output 질문 전체 드롭** — kind는 이미 deck로 고정, 「무엇을 만들까요?」 라디오 자체를 제거 | 동일 |
| Q-3 | `discovery.ts` `<question-form id="discovery">` `platform` 질문 | `Responsive web`·`Desktop web`·`iOS app`·`Android app`·`Tablet app`·`Desktop app`·`Fixed canvas (1920×1080)` 7지선다 | **deck-friendly 캔버스로만 한정** — `Fixed canvas (16:9, 1920×1080)`·`Fixed canvas (4:3, 1440×1080)`·`Web viewer (responsive)` 3지선다. iOS/Android/Tablet/Desktop 앱 옵션은 명시 금지 | 동일 |
| Q-4 | `direction-cards` / `media-*` 보조 폼 | direction picker, media surface routing 폼 | **발행 금지** — 보조 폼이 비-deck artifact로 라우팅하면 정책 위반 | 동일 |
| Q-5 | 사용자 프롬프트에 "이미지/동영상/대시보드 만들어줘"가 섞여 있을 때 | discovery 통해 진행 | **거부 + 슬라이드 제안** — 프롬프트가 "slide"라는 단어를 함께 포함해도 비-deck artifact는 생성 금지 | 동일 + FE `embedSlideOnlyOutboundBlockReason` |

**원칙:**
1. **출처 단일화** — `TEAMVER_SLIDE_ONLY_SCOPE`가 `DISCOVERY_AND_PHILOSOPHY`보다 뒤(아래)에 합쳐지도록 composer 순서를 유지한다. locale override(`renderUiLocalePrompt`)보다도 뒤에 합쳐 zh-CN의 「单页网页原型 / 落地页」류 옵션도 함께 무력화한다.
2. **FE/BE 이중 안전선** — FE는 metadata.kind를 deck로 고정(S-4b)·outbound guard로 미디어 키워드 차단; daemon 시스템 프롬프트는 위의 Q-1~Q-5 override로 모델 응답에서 비-deck 옵션을 제거. 둘 중 하나가 우회되어도 다른 한쪽이 잡는다.
3. **테스트 SSOT** — `apps/daemon/tests/prompts/system.test.ts` ▶ describe `slide-only discovery / question-form override` 7케이스(precedence × 2, task-type/output drop, banned 옵션 enumeration, platform whitelist, 비-deck 거부, 비-embed 미주입) + `apps/web/tests/teamver-embed-slide-only.test.ts` ▶ `forces home free-form submit metadata.kind to deck` 1케이스.

### 2.6 P1 — OD tip·starter 비노출 (loop 350–351)

| ID | 위치 | OD 동작 | embed 결정 | 게이트 |
|----|------|---------|-----------|--------|
| T-1 | `DesignFilesPanel` footer | Discord/GitHub/Community rotating tip + drop hint | **hide** | `hideUsefulTips` |
| T-2 | `ChatPane` empty state | 「Start a conversation」+ starter prompt cards + GitHub connect-repo | **hide** | 동일 |
| T-3 | `FileViewer` preview | inspect/comment empty-hint overlay (`data-od-id` 안내) | **hide** | 동일 |

loop 351: embed empty chat은 composer만 노출(import folder artifacts 경로 제외). `InspectPanel` 라벨은 embed 한글(기능 유지).

### 2.7 P3 — 인프라/저장 (09 게이트, 이 문서 범위 외)

[09_Design_저장소_격리](./09_Design_저장소_격리_출시게이트.md) · [12 §2.5](./12_embed_로컬UX_제거_체크리스트.md)

### 2.8 P0 — Share / Publish 정책 (loop 171 + 173 + 174 + 175)

**원칙:** 워크스페이스 콘텐츠는 **Teamver tenant 경계 안에서만 공유**한다. Drive Publish + 로컬 export 외의 모든 외부 share 진입점을 embed에서 hide. 추가 share 기능 개발은 **MVP 범위에서 제외**한다 — 확장이 필요해지면 Drive 권한 모델(Main BE) 위에서 통합한다.

| ID | OD 표면 | 동작 | 위험 | embed 결정 | 게이트 |
|----|---------|------|------|-----------|--------|
| Sh-1 | `FileViewer` chrome share-menu — Copy share-link / Open share page | Vercel/Cloudflare deployment public URL | tenant 위반 (public 인터넷) | **hide** | `hideExternalShareSurfaces` (loop 171) |
| Sh-2 | `FileViewer` chrome share-menu — "Publish online" (Vercel / Cloudflare) | BYOK token 으로 외부 호스팅 배포 | BYOK 노출 + 외부 호스팅 | **hide** | 동일 |
| Sh-3 | `FileViewer` chrome share-menu — Project social share (`SocialShareGrid`) | X / Reddit / FB / LinkedIn / Instagram / Xiaohongshu intent | SNS 외부 송출 | **hide** | 동일 |
| Sh-4 | `PreviewModal` share popover — social platforms + copy share-link / share-text | 동일 social + URL 복사 | tenant 위반 | **hide** (export PDF/ZIP/HTML/image 는 유지) | 동일 |
| Sh-5 | `NextStepActions` "Share to Open Design" → `SHARE_TO_COMMUNITY_PROMPT` (community contribute) | OD 공개 카탈로그에 plugin scaffold + PR | tenant 위반 + agent 자동 packaging | **hide** | `ProjectView` `onShareToOpenDesign` callback gating |
| Sh-6 | `Handoff` (open-design.ai) | 외부 도메인 핸드오프 | tenant 위반 | **hide** | `hideHandoffButton` (기존) |
| Sh-7 | `PluginShareMenu` (plugin GitHub publish + 카탈로그 PR) | plugin 공개 마켓플레이스 | tenant 위반 | **hide** | `hidePluginRegistry` (기존) |
| Sh-8 | `FileViewer` chrome **download** menu — PDF / PPTX / Image / HTML / Markdown / ZIP / Save as template | 사용자 OS 다운로드 | 낮음 (로컬) | **유지** | — |
| Sh-9 | `TeamverPublishDriveMenuItem` / Drive Publish | Teamver workspace tenant (S3 + Drive 권한) | 낮음 — Teamver-native | **유지** (정식 channel) | — |
| Sh-10 | `ReactComponentViewer` Share menu — Export JSX / HTML / ZIP | 사용자 OS 다운로드 | 낮음 | **유지** | — |

**향후 확장 경로:** workspace 멤버 간 또는 외부 공유가 필요해지면 → Drive `link share with permission` (Main BE 차원) 으로 통합. OD 자체 share 표면은 영구 hide.

---

## 3. 브랜딩 플래그

| 플래그 | embed 기본 | 역할 |
|--------|------------|------|
| `slideOnlyMvp` | `true` | Hero chips·New project 탭·기본 deck 탭·toolbox 미디어 액션 필터 |
| `hideComposerIntegrations` | `true` | MCP·Connectors composer/UI/fetch/슬래시 |
| `hideCommunityGallery` | `true` | standalone 풀 카탈로그 숨김; `slideOnlyMvp`와 함께 slide-only **커뮤니티** 갤러리로 대체 (`shouldShowHomeCommunityGallery`) |
| `hidePluginRegistry` | `true` | `+` 메뉴 "Add plugin" 행 + plugin marketplace 진입 |
| `hideExternalShareSurfaces` | `true` | (loop 171) FileViewer chrome share-menu / PreviewModal social·copy_link / Share-to-OD community contribute. Drive Publish + 로컬 export 는 유지 |
| `hideUsefulTips` | `true` | (loop 350–351) Design Files footer tip, empty-chat starter/connect-repo, FileViewer inspect hint. OD onboarding copy 차단 |
| `hideAssistantThinkingDetails` | `true` | loop 437–439 — embed에서는 thinking block 자체를 비노출. prose leak은 `internalAgentMarkup`/contracts sanitizer + daemon `thinking_delta` 분리. `<todo>`뿐 아니라 변형 pseudo-tool/internal XML family도 sanitizer에서 제거하며, streaming 중 nested dynamic open tag도 차단 |

헬퍼 (`slideOnlyMvpPolicy.ts`):

- `homeHeroChipsForGroup(group, branding)`
- `visibleNewProjectTabs(branding)`
- `defaultNewProjectTab(branding)` → `'deck'`
- `defaultHomeHeroGuideChipId(branding)` → `'deck'`
- `visibleDesignToolboxActions(actions, branding)`
- `TEAMVER_EMBED_HIDDEN_DESIGN_TOOLBOX_ACTIONS`

---

## 4. 구현 파일

```
apps/web/src/teamver/branding/config.ts                  — flags
apps/web/src/teamver/branding/TeamverBrandingProvider.tsx — defaults
apps/web/src/teamver/branding/slideOnlyMvpPolicy.ts       — 정책 헬퍼
apps/web/src/teamver/branding/embedFileAttachPolicy.ts    — 첨부 화이트리스트 (loop 161, BE sync loop 162)
deploy/teamver/be/app/services/drive_import_policy.py     — import-drive BE allowlist (loop 162)
apps/web/src/components/HomeHero.tsx                     — chip rail · @멘션 · `+` 메뉴
apps/web/src/components/HomeView.tsx                     — community gallery wrap
apps/web/src/components/NewProjectPanel.tsx              — 탭 필터
apps/web/src/components/EntryShell.tsx                   — 기본 탭
apps/web/src/components/ChatComposer.tsx                 — 슬래시·toolbox·`+` 메뉴
apps/web/src/components/ComposerPlusMenu.tsx             — showConnectors / showMcp / showPluginAdd
apps/web/src/components/NextStepActions.tsx              — "More" 액션 필터
```

---

## 5. 검증

**단위**

```bash
cd ns-open-design
bash deploy/teamver/scripts/run_track_a_unit_tests.sh --skip-web
# 또는: cd apps/web && npx vitest run tests/teamver-embed-{branding,slide-only}.test.ts
```

**staging browser**

- [ ] Home hero create 탭 — Slide deck (+ template shortcut)만
- [ ] New project — Deck / Template 탭만
- [ ] `+` 메뉴 — Attach·Plugins(installed only, "Add plugin" 없음)만 (Connectors·MCP 없음)
- [ ] @멘션 picker — All / Files / Plugins / Skills 탭만
- [ ] Slash 팔레트 — `/search`만 (mcp 없음)
- [ ] Home 하단 — **커뮤니티** deck 갤러리: 1차 artifact 필터 **없음**, deck 서브카테고리 + 검색 + 카드 그리드 (`hidePrimaryCategoryFacets`)
- [ ] Project chat — Design toolbox `+` flyout: image-gen / video-gen / motion / motion-polish 미노출
- [ ] Assistant "More" 액션 — 미디어·모션 미노출
- [ ] **Share/Publish (loop 171 + 173 + 174 + 175)** — Slide artifact 헤더에서 chrome share-menu 미노출 (Copy share-link / Vercel / Cloudflare / Project social share **부재**), Download 메뉴는 PDF·PPTX·Image·HTML·Markdown·ZIP·Save as template + **Teamver 드라이브로 HTML 발행** + **Drive 발행 이력 panel** (loop 174 — `v{N}` 라벨 · 상대 시각 · Drive 딥 링크, 최근 5개) **유지**. ZIP 칩 제거 (loop 174 — HTML-only 발행). `Open in Teamver Drive` 항목은 loop 173 에서 제거. **PDF / PPTX Drive 발행은 별도 트랙으로 보류 (loop 175 docket)** — OD daemon PDF exporter 가 desktop runtime 전용이고, headless 서버에 chromium 도입 / 메인 BE internal endpoint 호출 / Lambda 분리 등 인프라 결정이 동반되므로 이번 출시 게이트와 분리. 로컬 `PDF로 내보내기` (Electron `webContents.printToPDF`) 는 데스크탑에서 그대로 동작. 옵션 비교·재검토 트리거는 [00 §loop 175](./00_구현_내역_누적.md) archive 참조
- [ ] **PreviewModal Share popover** — 모달의 share popover가 PDF/ZIP/HTML/image **export 만** 보여주고, X/Reddit/FB/LinkedIn/Instagram/Xiaohongshu + Copy link/Copy share text **부재**
- [ ] **AssistantMessage** — "Share to Open Design" 제출 버튼 미노출
- [ ] Settings — language / appearance / design templates
- [ ] **Deck 프로젝트 채팅** — API mode 고정, 프롬프트 전송 후 슬라이드 artifact 생성/수정
- [ ] **runtime-config** — `GET /api/v1/runtime-config` (cookie) → `configured=true` + model (E2E `S-8c`)

**staging automated (EC2)**

```bash
cd deploy/teamver
bash scripts/print_staging_track_a_e2e_env.sh --from-env .env.staging
# TEAMVER_COOKIE + TEAMVER_INTERNAL_API_KEY + MAIN_BE_DATABASE_URL 설정 후:
bash scripts/run_staging_track_a_e2e.sh --staging
# S-8a/b/c (session + projects + runtime-config) → U-6 usage → D-5/D-6
```

## 6. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-25 | loop 388 — §2.1 S-4b (`handlePluginLoopSubmit` 메타데이터 `kind` 정규화: `other` 포함 → `deck`) + §2.5b daemon 시스템 프롬프트 `<question-form>` 옵션 정제 표(Q-1~Q-5) 추가. 사용자가 "슬라이드 만들어줘"라고 요청해도 `<question-form>` 가 「단일 웹 프로토타입 / 랜딩」·「멀티스크린 앱」·「대시보드 / 툴 UI」·「에디토리얼 / 마케팅 페이지」·「iOS 앱」·「Android 앱」을 함께 제안하던 회귀를 차단. `TEAMVER_SLIDE_ONLY_SCOPE` 가 `DISCOVERY_AND_PHILOSOPHY` + `renderUiLocalePrompt` 보다 뒤에 합성되도록 precedence 보장 + 단위 테스트 추가 |
| 2026-06-24 | loop 350–351 — §2.6 `hideUsefulTips` tip/starter surface 표 + §3 플래그 행. empty chat 전면 hide, InspectPanel embed 한글 |
| 2026-06-22 | loop 175 (docket) — PDF / PPTX Drive 발행 **별도 트랙 보류 결정**. 사용자 리포트 ("프레젠테이션인데 PDF/PPTX 불가능은 말이 안 된다") 후 옵션 7종 (OD 내 Playwright / 메인 BE internal endpoint / ECS·Fargate worker / Lambda + chromium-layer / 외부 SaaS / 클라이언트 측 / WeasyPrint·wkhtmltopdf) + 응답 모델 (sync vs async) 비교를 [00 §loop 175](./00_구현_내역_누적.md) 에 archive. 현재 HTML-only 발행 + 로컬 PDF 다운로드 안내가 그대로 유효. 재검토 트리거: AI 어시스턴트가 Drive PDF 인덱싱 use-case 우선순위 / 사내 PDF 인프라 가용성 결정 / 사용자 리포트 누적 / PPTX 트랙 정식 착수 |
| 2026-06-22 | loop 174 — Drive 발행 이력 panel (`TeamverDrivePublishHistory`, `v{N}` 라벨 · 상대 시각 · Drive 딥 링크) 메뉴 상단 mount. ZIP 칩 제거 → HTML 단일 발행 (`formats: ["html"]` 정적). 마지막 발행 위치 `localStorage` 기억 (workspace+project 격리). PDF 발행은 daemon PDF exporter 가 desktop-only 라 별도 BE 트랙 (Playwright/Chromium) — MenuItem 에 안내 한 줄 |
| 2026-06-22 | loop 173 — Teamver 드라이브 발행 UI 한글화 + HTML/ZIP 포맷 선택 + custom listbox (`TeamverDriveTargetSelect`). `Open in Teamver Drive` 메뉴 항목 영구 제거 (toast 의 Drive 링크로 대체). PDF 는 BE headless renderer 도입 시 동일 UI 패턴으로 확장 — 별도 트랙 |
| 2026-06-19 | loop 171 — `hideExternalShareSurfaces` 게이트(§2.7), share/publish 정책 — 외부 share 전부 hide, Drive Publish + 로컬 export 만 유지 |
| 2026-06-19 | loop 170 — daemon S3 storage init fail-fast (별도 트랙) |
| 2026-06-19 | loop 167–169 — Drive publish search/browse/folder choose UX |
| 2026-06-19 | loop 166 — S-8c runtime-config E2E, deck chat staging checklist |
| 2026-06-19 | loop 165 — embed API-mode usage billing + execution config pin |
| 2026-06-19 | loop 162 — `drive_import_policy.py` BE allowlist, import-drive per-asset `failed[]`, FE policy sync |
| 2026-06-19 | loop 152 — `hideCommunityGallery` / `hidePluginRegistry` / toolbox actions 필터, 14 Drive 설계 cross-link, 전수 인벤토리 |
| 2026-06-18 | loop 152 (선행) — 초안 + `slideOnlyMvp` / `hideComposerIntegrations` 구현 |
