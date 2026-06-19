# Teamver embed — 로컬/standalone UX 제거 체크리스트

Teamver Design(`design.teamver.com`)은 **브라우저 + design-api BFF + tenant S3** 모델이다.  
사용자 PC 폴더·로컬 daemon 데이터 디렉터리·BYOK Settings를 전제로 한 OD standalone UX는 **embed에서 숨기거나 비활성화**해야 한다.

**SSOT 게이트:** `isTeamverEmbedMode()` + `useTeamverBranding()` (`apps/web/src/teamver/branding/config.ts`)

---

## 1. 원칙

| standalone (로컬 OD) | Teamver embed |
|----------------------|---------------|
| 사용자가 **로컬 폴더**를 working directory / linked dir로 선택 | 프로젝트 파일은 **daemon scratch + S3 prefix** (`design/ws_*/user_*/proj_*/`) |
| Settings에서 API key·Local CLI·MCP·connectors | **design-api `runtime-config`** (서버 env), Settings는 language/appearance만 |
| GitHub/Discord/Handoff/Use everywhere | Teamver 브랜딩·Main FE 링크 |
| Onboarding (BYOK vs CLI) | `applyEmbedConfigLock` — onboarding skip, `mode: api` 고정 |
| `import/folder` — 로컬 디렉터리를 프로젝트 루트로 | **금지** — tenant 격리·브라우저 FS API 한계 |

**유지 (embed에서도 OK):**

- Design Files 패널 (daemon이 materialize한 프로젝트 트리)
- 파일 업로드·드래그앤드롭 (프로젝트 내부로 ingest)
- Drive publish / Open in Drive (Track A)
- Figma URL import, template, Claude Design ZIP import (바이트 업로드 — 로컬 폴더 아님)

---

## 2. UI 인벤토리

### 2.1 P0 — embed에서 제거 (Loop 73)

| ID | 위치 | 문자열/동작 | 상태 |
|----|------|-------------|------|
| L-1 | `HomeView` → `HomeHero` | `WorkingDirPicker` — "Select working directory" | ✅ `hideLocalWorkspaceControls` |
| L-2 | `ChatComposer` | composer 하단 `WorkingDirPicker` | ✅ 동일 |
| L-3 | `ChatComposer` tools | "Link code folder" (`chat.importFolder`) | ✅ 동일 |
| L-4 | `NewProjectPanel` | "Local storage" / working dir row | ✅ 동일 |
| L-5 | `NewProjectPanel` | "Open folder" (`useOpenFolderImport`) | ✅ 동일 |
| L-6 | `App.tsx` | `onImportFolder` / `onImportFolderResponse` 핸드오프 | ✅ embed 시 미전달 |
| L-7 | `App.tsx` create | `userWorkingDir` / `replaceProjectWorkingDir` | ✅ embed 시 무시 |

**브랜딩 플래그:** `hideLocalWorkspaceControls: true` (embed 기본)

### 2.2 P1 — 이미 처리됨 (10 §4.3)

| 항목 | 메커니즘 |
|------|----------|
| GitHub / Discord / releases | `hideExternalLinks` |
| Settings (API key, CLI, MCP, …) | `allowedSettingsSections` = language, appearance |
| Execution switcher / agent picker | `hideTopbarExecutionSwitcher`, `hideStudioExecutionControls` |
| Handoff (open-design.ai) | `hideHandoffButton` |
| Use everywhere chip | `hideUseEverywhereChip` |
| Onboarding | `lockExecutionConfig` → `onboardingCompleted: true` |
| Nav: tasks / plugins / integrations | `hideNavViews` |
| Workspace tab strip (Home + project tabs) | `hideWorkspaceTabsBar` |
| Updater popup | `EntryShell` embed 분기 |

### 2.3 P2 — 완료 (Loop 74–77)

| ID | Loop | 내용 |
|----|------|------|
| L-8 | 74 | `DesignSystemCreationFlow` — "Link local code" DropZone 숨김, metadata `linkedDirs` 미병합 |
| L-13 | 75 | `embedLocalWorkspacePolicy` — Composer `linkedDirs` PATCH 차단 |
| L-13 | 76 | `EntryShell` home create — `workingDir` → `linkedDirs` 미설정 |
| L-13 | 78 | `patchProject` / `replaceProjectWorkingDir` — embed에서 linkedDirs·working-dir API 차단 |
| L-10 | 77 | daemon `formatDesignFilesWorkspaceHint` — Teamver-managed wording |
| L-15 | 78–79 | `TeamverWorkspaceSwitcher` — `app_enabled=false` WS 선택 불가 |
| L-13 | 80–81 | FE `sanitizeProjectForEmbed` + daemon `linkedDirs`/folder import/working-dir API 거부 |

### 2.4 P0 — 슬라이드 MVP 기능 게이트 (loop 152–153)

| ID | 위치 | 동작 | 게이트 |
|----|------|------|--------|
| S-1 | `HomeHero` create chips | Image / Video / Audio / HyperFrames / Prototype 등 | `slideOnlyMvp` |
| S-2 | `NewProjectPanel` | Media·Prototype·Live artifact·Other 탭 | 동일 |
| S-3 | `EntryShell` | New project 기본 탭 | embed → `deck` |
| S-4 | `ChatComposer` / `HomeHero` + menu | MCP·Connectors | `hideComposerIntegrations` |
| S-5 | `HomeView` 하단 community gallery | `HomeTemplatesReveal` + `PluginsHomeSection` | `hideCommunityGallery` |
| S-6 | `+` 메뉴 "Add plugin" 행 (HomeHero·ChatComposer) | 플러그인 레지스트리 진입 | `hidePluginRegistry` |
| S-7 | `DesignToolboxPanel` actions (composer + NextStepActions "More") | image-gen · video-gen · motion · motion-polish | `slideOnlyMvp` |
| S-8 | Drive publish destination | 개인/팀 Drive folder 검색 선택 | `TeamverDrivePickerModal` |

**문서:** [13_embed_슬라이드_MVP_기능게이트](./13_embed_슬라이드_MVP_기능게이트.md) · [14_Design_Drive_연동_설계](./14_Design_Drive_연동_설계.md)

### 2.5 P3 — 인프라/저장 (09, VM)

| 항목 | embed 기대 |
|------|------------|
| `OD_PROJECT_STORAGE` | staging/prod `s3` (로컬 laptop `local`은 개발용) |
| 프로젝트 SSOT | `design_projects` + S3, not 사용자 Downloads 폴더 |
| SQLite | EC2 volume + Litestream — 사용자 로컬 아님 |

---

## 3. 구현 파일

```
apps/web/src/teamver/branding/config.ts          — hideLocalWorkspaceControls, slideOnlyMvp
apps/web/src/teamver/branding/slideOnlyMvpPolicy.ts
apps/web/src/components/HomeHero.tsx
apps/web/src/components/ChatComposer.tsx
apps/web/src/components/NewProjectPanel.tsx
apps/web/src/teamver/embedLocalWorkspacePolicy.ts
apps/web/src/components/DesignSystemFlow.tsx
apps/web/src/state/projects.ts              — patchProject linkedDirs strip
apps/web/src/providers/registry.ts          — replaceProjectWorkingDir gate
apps/web/src/teamver/components/TeamverWorkspaceSwitcher.tsx
```

---

## 4. 검증

**단위**

```bash
bash deploy/teamver/scripts/run_track_a_unit_tests.sh
```

**staging browser (사용자 VM)**

- [ ] Home hero에 working directory picker 없음
- [ ] 프로젝트 composer에 "Select working directory" / "Link code folder" 없음
- [ ] New project에 "Local storage" / "Open folder" 없음
- [ ] 새 프로젝트 생성 → Design Files는 daemon 관리 경로만
- [ ] Design system create에 "Link local code" 없음
- [ ] Home hero create 탭 — Slide deck (+ template shortcut)만
- [ ] New project — Deck / Template 탭만
- [ ] + 메뉴 — Attach·Plugins(installed only, "Add plugin" 없음)만 (Connectors·MCP 없음)
- [ ] Home 하단 — community gallery 미렌더
- [ ] Project chat → Design toolbox `+` flyout — image-gen / video-gen / motion / motion-polish 미노출
- [ ] Assistant "More" 액션 — 미디어·모션 미노출
- [ ] Publish to Drive → Browse — 개인/팀 Drive folder 검색·선택 가능
- [ ] Settings → language/appearance만

---

## 5. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-19 | loop 153 — HomeHero `hidePluginRegistry` 보강, Drive publish 검색형 folder picker 1차 |
| 2026-06-19 | loop 152 — hideCommunityGallery / hidePluginRegistry / toolbox actions 필터, 14 Drive 설계 문서 |
| 2026-06-18 | loop 152 (선행) — slideOnlyMvp / hideComposerIntegrations (13 문서) |
| 2026-06-17 | Loop 78 — patchProject/working-dir gate, disabled WS switch block |
| 2026-06-17 | Loop 79–82 — disabled WS guard, project sanitize, daemon linkedDirs gate, E2E checklist |
| 2026-06-17 | Loop 74–77 P2 — DS local code UI, linkedDirs policy, daemon hint |
| 2026-06-17 | 초안 + Loop 73 P0 구현 (`hideLocalWorkspaceControls`) |
