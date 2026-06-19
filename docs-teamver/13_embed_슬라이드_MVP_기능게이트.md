# Teamver embed — 슬라이드 MVP 기능 게이트

Teamver Design embed(`design.teamver.com`) **1차 출시 범위는 슬라이드(덱) 생성·편집**이다.  
OD standalone의 풀 스펙(미디어·MCP·플러그인 마켓·자동화 등)은 embed에서 **비노출**한다.

**SSOT:** `isTeamverEmbedMode()` + `resolveTeamverBranding()` (`apps/web/src/teamver/branding/config.ts`)  
**정책 헬퍼:** `apps/web/src/teamver/branding/slideOnlyMvpPolicy.ts`

**관련:** [12_embed_로컬UX_제거](./12_embed_로컬UX_제거_체크리스트.md) · [04_구현_우선순위](./04_구현_우선순위.md) · [10_세션·OD패치](./10_세션·OD패치_보강.md)

---

## 1. 원칙

| 우선순위 | embed 1차 출시 |
|----------|----------------|
| **P0 노출** | Slide deck 생성·편집, 프로젝트 목록, Design System, 파일 첨부, Drive publish |
| **P0 비노출** | Image / Video / Audio / HyperFrames (모든 진입점) |
| **P1 비노출** | Prototype, Live artifact, MCP·Connectors (composer + settings), Tasks·Plugins·Integrations nav |
| **P2 유지·검토** | Template 탭, Figma import, Design Systems nav, Claude ZIP import |

standalone OD는 영향 없음 — **embed 모드에서만** 플래그가 켜진다.

---

## 2. 기능 인벤토리

### 2.1 P0 — 미디어·비덱 생성 경로 (비노출)

| ID | 위치 | 동작 | 게이트 |
|----|------|------|--------|
| S-1 | `HomeHero` create chips | Image / Video / Audio / HyperFrames 탭 | `slideOnlyMvp` → chip 필터 |
| S-2 | `HomeHero` shortcuts (⋯) | Create plugin, From Figma | 동일 |
| S-3 | `NewProjectPanel` tabs | Media (image/video/audio) | `hiddenNewProjectTabs` |
| S-4 | `NewProjectPanel` | Prototype, Live artifact, Other | 동일 |
| S-5 | `EntryShell` | New project 기본 탭 `prototype` | embed 시 `deck` 기본 |

### 2.2 P1 — 통합·확장 (비노출, 12 §2.2 일부 중복)

| ID | 위치 | 동작 | 게이트 |
|----|------|------|--------|
| S-6 | `EntryNavRail` | Tasks / Plugins / Integrations | `hideNavViews` (기존) |
| S-7 | `SettingsDialog` | API key, CLI, MCP, Composio | `allowedSettingsSections` (기존) |
| S-8 | `ChatComposer` / `HomeHero` + menu | MCP·Connectors 서브메뉴, `/mcp` slash | `hideComposerIntegrations` |
| S-9 | `HomeView` | `fetchMcpServers`, connector context | 동일 — fetch skip |
| S-10 | `ComposerPlusMenu` | Connectors / MCP 행 자체 | `showConnectors` / `showMcp` props |

### 2.3 P0 노출 — 유지

| 항목 | 이유 |
|------|------|
| Slide deck chip + Deck 탭 | 1차 제품 핵심 |
| Projects 목록 | 기존 덱 재개 |
| Design Systems | 덱 스타일·토큰 |
| 파일 첨부 (프로젝트 ingest) | 슬라이드 에셋 업로드 |
| Drive publish | Track A v1 |
| Template 탭 (P2) | 사용자 공유 덱 템플릿 — 1차 유지 |

### 2.4 이미 처리됨 (12, 10 참고)

- 로컬 working dir / folder import — `hideLocalWorkspaceControls`
- Execution switcher / Handoff / external links
- Onboarding skip — `lockExecutionConfig`
- Workspace tab strip — `hideWorkspaceTabsBar`
- AMR / Vela login — embed no-op (`daemon.ts`)

---

## 3. 브랜딩 플래그

| 플래그 | embed 기본 | 역할 |
|--------|------------|------|
| `slideOnlyMvp` | `true` | Home chips·New project 탭·기본 덱 탭 |
| `hideComposerIntegrations` | `true` | MCP·Connectors composer/UI·fetch |

헬퍼:

- `homeHeroChipsForGroup(group, branding)`
- `visibleNewProjectTabs(allTabs, branding)`
- `defaultNewProjectTab(branding)` → `'deck'`
- `defaultHomeHeroGuideChipId(branding)` → `'deck'`

---

## 4. 구현 파일

```
apps/web/src/teamver/branding/config.ts
apps/web/src/teamver/branding/slideOnlyMvpPolicy.ts
apps/web/src/components/HomeHero.tsx
apps/web/src/components/NewProjectPanel.tsx
apps/web/src/components/EntryShell.tsx
apps/web/src/components/HomeView.tsx
apps/web/src/components/ChatComposer.tsx
apps/web/src/components/ComposerPlusMenu.tsx
```

---

## 5. 검증

**단위**

```bash
cd ns-open-design
bash deploy/teamver/scripts/run_track_a_unit_tests.sh --skip-web
```

**staging browser**

- [ ] Home hero create 탭: **Slide deck**만 (또는 deck + template shortcut)
- [ ] New project: **Deck**, **Template** 탭만
- [ ] + 메뉴: Attach·Plugins만 (Connectors·MCP 없음)
- [ ] Settings: language / appearance만
- [ ] Nav: Home, Projects, Design systems만

---

## 6. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-18 | 초안 + `slideOnlyMvp` / `hideComposerIntegrations` 구현 |
