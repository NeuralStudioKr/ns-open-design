# Teamver embed — 슬라이드 MVP 기능 게이트

Teamver Design embed(`design.teamver.com`) **1차 출시 범위는 슬라이드(덱) 생성·편집**이다.  
OD standalone의 풀 스펙(미디어·MCP·플러그인 마켓·커뮤니티·자동화 등)은 embed에서 **비노출**한다.

**SSOT:** `isTeamverEmbedMode()` + `resolveTeamverBranding()` (`apps/web/src/teamver/branding/config.ts`)  
**정책 헬퍼:** `apps/web/src/teamver/branding/slideOnlyMvpPolicy.ts`

**관련:** [12_embed_로컬UX_제거](./12_embed_로컬UX_제거_체크리스트.md) · [14_Design_Drive_연동_설계](./14_Design_Drive_연동_설계.md) · [04_구현_우선순위](./04_구현_우선순위.md) · [10_세션·OD패치](./10_세션·OD패치_보강.md)

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

---

## 2. 기능 인벤토리 (전수 검토)

### 2.1 P0 — Home / 프로젝트 생성 경로

| ID | 위치 | 동작 | 게이트 | 상태 |
|----|------|------|--------|------|
| S-1 | `HomeHero` create chips | Image / Video / Audio / HyperFrames / Prototype / Live artifact | `slideOnlyMvp` | ✅ Loop 143 |
| S-2 | `HomeHero` shortcuts (⋯) | Create plugin, From Figma | 동일 | ✅ |
| S-3 | `NewProjectPanel` tabs | Media (image/video/audio), Prototype, Live artifact, Other | `slideOnlyMvp` (`visibleNewProjectTabs`) | ✅ |
| S-4 | `EntryShell` openNewProject | 기본 탭 `prototype` → embed `deck` | `defaultNewProjectTab` | ✅ |
| S-5 | `HomeView` 하단 community gallery | `<HomeTemplatesReveal><PluginsHomeSection/>` — Prototype·Slides·Image·Video·HyperFrames·Audio 풀 카탈로그 | **`hideCommunityGallery`** | ✅ Loop 144 |

### 2.2 P0 — Composer / + 메뉴 / 슬래시 (전수)

| ID | 위치 | 동작 | 게이트 | 상태 |
|----|------|------|--------|------|
| C-1 | `HomeHero` `+` 메뉴 → Connectors | 모든 워크스페이스 connector 리스트, Add connector | `hideComposerIntegrations` | ✅ Loop 143 |
| C-2 | `HomeHero` `+` 메뉴 → MCP | enabled MCP server 리스트, Add MCP | 동일 | ✅ |
| C-3 | `HomeHero` `+` 메뉴 → Plugins → "Add plugin" | 플러그인 레지스트리(marketplace) 진입 | **`hidePluginRegistry`** | ✅ Loop 144 |
| C-4 | `ChatComposer` `+` 메뉴 동일 | 프로젝트 composer 동일 row | 동일 | ✅ |
| C-5 | `HomeHero` @멘션 picker | 탭: All · Files · Plugins · Skills · MCP · Connectors | `hideComposerIntegrations` (MCP·Connectors 탭 제거) | ✅ |
| C-6 | `ChatComposer` slash 팔레트 | `/mcp`, `/mcp <id>`, `/search` | `hideComposerIntegrations` (MCP 슬래시 제거) | ✅ |
| C-7 | `ChatComposer` slash 인라인 | `/pet`, `/hatch` 인라인 명령 (palette 노출 X) | embed 시 결과적으로 unreachable — Settings·Codex CLI 차단으로 무력화 | 🟡 문서화 |
| C-8 | `ChatComposer` `DesignToolboxPanel` actions | `image-gen`, `video-gen`, `motion`, `motion-polish` | **`slideOnlyMvp`** (`visibleDesignToolboxActions`) | ✅ Loop 144 |
| C-9 | `ChatComposer` `DesignToolboxPanel` resources | MCP servers·MCP templates·connectors | `hideComposerIntegrations` | ✅ Loop 143 |
| C-10 | `AssistantMessage` `NextStepActions` | "More" 메뉴의 미디어/모션 액션 | `slideOnlyMvp` (toolbox 필터 공유) | ✅ Loop 144 |

### 2.3 P0 — 좌측 nav / 설정 (이미 처리)

| 항목 | 메커니즘 | 상태 |
|------|----------|------|
| Nav: Tasks / Plugins / Integrations | `hideNavViews` | ✅ |
| Settings: API key / CLI / MCP / Composio / Pet | `allowedSettingsSections` (language, appearance만) | ✅ |
| Topbar 실행 스위처 / Agent picker | `hideTopbarExecutionSwitcher`, `hideStudioExecutionControls` | ✅ |
| Handoff (open-design.ai) | `hideHandoffButton` | ✅ |
| Use everywhere chip | `hideUseEverywhereChip` | ✅ |
| Updater popup | `EntryShell` embed 분기 | ✅ |
| Workspace tab strip | `hideWorkspaceTabsBar` | ✅ |

### 2.4 P0 — 파일 첨부 정책

| 항목 | 현재(daemon) | embed 권장 | 게이트 | 상태 |
|------|--------------|------------|--------|------|
| 단일 파일 사이즈 | 200 MB (`projectUpload` multer) | 50 MB (FE pre-check 경고) | `embedFileAttachPolicy` | 🟡 문서화 |
| 1 요청 파일 수 | 12 (`array('files', 12)`) | 12 유지 | — | — |
| MIME / 확장자 | 제한 없음 | 슬라이드 친화 확장자 화이트리스트 (이미지/PDF/PPTX/MD/CSV/JSON/HTML/SVG) | FE 경고 | 🟡 |
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

### 2.6 P3 — 인프라/저장 (09 게이트, 이 문서 범위 외)

[09_Design_저장소_격리](./09_Design_저장소_격리_출시게이트.md) · [12 §2.5](./12_embed_로컬UX_제거_체크리스트.md)

---

## 3. 브랜딩 플래그

| 플래그 | embed 기본 | 역할 |
|--------|------------|------|
| `slideOnlyMvp` | `true` | Hero chips·New project 탭·기본 deck 탭·toolbox 미디어 액션 필터 |
| `hideComposerIntegrations` | `true` | MCP·Connectors composer/UI/fetch/슬래시 |
| `hideCommunityGallery` | `true` | Home 하단 `PluginsHomeSection` + `HomeTemplatesReveal` 비노출 |
| `hidePluginRegistry` | `true` | `+` 메뉴 "Add plugin" 행 + plugin marketplace 진입 |

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
- [ ] Home 하단 — community gallery 미렌더 (`HomeTemplatesReveal` 부재)
- [ ] Project chat — Design toolbox `+` flyout: image-gen / video-gen / motion / motion-polish 미노출
- [ ] Assistant "More" 액션 — 미디어·모션 미노출
- [ ] Settings — language / appearance만

---

## 6. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-19 | Loop 144 — `hideCommunityGallery` / `hidePluginRegistry` / toolbox actions 필터, 14 Drive 설계 cross-link, 전수 인벤토리 |
| 2026-06-18 | Loop 143 — 초안 + `slideOnlyMvp` / `hideComposerIntegrations` 구현 |
