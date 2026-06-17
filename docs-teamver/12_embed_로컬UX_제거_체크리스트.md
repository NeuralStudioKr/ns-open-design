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
| Updater popup | `EntryShell` embed 분기 |

### 2.3 P2 — 후속 (문서화만 / 별도 루프)

| ID | 위치 | 비고 |
|----|------|------|
| L-8 | `DesignSystemFlow.tsx` | DS 생성 시 로컬 code folder picker |
| L-9 | `SettingsDialog` onboarding copy | "Upload local files" 등 — embed에서 섹션 자체가 숨겨짐 |
| L-10 | Daemon agent system prompt | "working directory: \`cwd\`" — scratch 경로 설명을 tenant 문맥으로 완화 (daemon 패치) |
| L-11 | `DesignFilesPanel` Discord 팁 | `hideUsefulTips` ✅ |
| L-12 | Desktop host bridge | embed web에서는 `isOpenDesignHostAvailable()` = false — 별도 처리 불필요 |
| L-13 | `linkedDirs` 기존 프로젝트 | 마이그레이션 전 프로젝트에 metadata 잔존 시 composer에 picker 노출 가능 → embed에서 PATCH 차단 검토 |
| L-14 | i18n | `workingDirPicker.*`, `homeWorkingDir.*` — UI 숨김으로 충분; 필요 시 `teamverEmbedOverrides` |

### 2.4 P3 — 인프라/저장 (09, VM)

| 항목 | embed 기대 |
|------|------------|
| `OD_PROJECT_STORAGE` | staging/prod `s3` (로컬 laptop `local`은 개발용) |
| 프로젝트 SSOT | `design_projects` + S3, not 사용자 Downloads 폴더 |
| SQLite | EC2 volume + Litestream — 사용자 로컬 아님 |

---

## 3. 구현 파일

```
apps/web/src/teamver/branding/config.ts          — hideLocalWorkspaceControls
apps/web/src/components/HomeView.tsx
apps/web/src/components/ChatComposer.tsx
apps/web/src/components/NewProjectPanel.tsx
apps/web/src/App.tsx
apps/web/tests/teamver-embed-local-ui.test.tsx
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
- [ ] Settings → language/appearance만

---

## 5. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-17 | 초안 + Loop 73 P0 구현 (`hideLocalWorkspaceControls`) |
