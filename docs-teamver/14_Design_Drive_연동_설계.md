# Design ↔ Teamver Drive 연동 설계

Teamver Design embed의 **파일 IO를 Teamver Drive로 통합**하는 설계 SSOT. 1차 출시(슬라이드 MVP)는 **출력 publish 일방향**, 후속 단계로 **입력 import 양방향**을 단계적으로 도입한다.

**관련:** [11_Usage·Drive_Publish](./11_Usage·Drive_Publish_보강.md) · [13_embed_슬라이드_MVP_기능게이트](./13_embed_슬라이드_MVP_기능게이트.md) · [03_키_저장소_Drive_DB](./03_키_저장소_Drive_DB.md) · [09_Design_저장소_격리](./09_Design_저장소_격리_출시게이트.md)

**Main FE 참고 구현:** `ns-teamver-fe-v2/web/src/components/chat/DriveImportModal.tsx`, `services/drive.ts`, `services/sharedDrive.ts`, `services/apps.ts`(`runApp` `source_asset_id` 패턴)

---

## 1. 한 줄 결론

> **Phase 0 (현재): publish 단방향 ✅ — `POST /api/v1/projects/{id}/publish` → daemon export → SDK Drive 3-step → `design_outputs`.**
> **Phase 1 (진행): Drive picker UI 고도화** — 검색형 folder picker 1차 ✅, full Drive browser는 후속.
> **Phase 2 (진행): Drive import** — design-api ingest + composer 첨부 modal/full browser + Main Drive handoff ✅, 다중 handoff 후속.
> **Main Drive handoff (완료):** Main Drive 파일 상세/우클릭 → AI Design import picker 사전 선택 ✅.
> **Canvas → slide handoff (완료):** Main Web/Mobile Canvas를 이미지가 포함된 self-contained HTML Drive asset으로 저장한 뒤 AI Design import picker로 직접 전달 ✅.
> **Phase 3: Workspace 자산 라이브러리** — 공유 Drive를 design system / 템플릿 / 로고의 SSOT로 노출.

---

## 2. 현재 (Phase 0)

### 2.1 토폴로지

```text
[Design embed FE]
    │  POST /api/v1/projects/{id}/publish
    │  ↓ (Bearer + X-Workspace-Id)
[design-api BE]
    │  daemon export (HTML / ZIP)
    │  ↓ Bearer access_token (user JWT 위임)
[Teamver SDK · Drive]
    │  drive.create_upload_request → presigned PUT → confirm_upload
    │  ↓
[Main BE Drive] → design_outputs row 기록
```

**소스:**

- FE: `apps/web/src/teamver/components/TeamverPublishDriveMenuItem.tsx` · `teamver/publishToDrive.ts` · `teamver/drivePublishTargets.ts`
- BE: `deploy/teamver/be/app/services/publish_service.py` · `routers/projects.py`
- DDL: `design_outputs` (`drive_asset_id`, `drive_folder_id`, `drive_shared_drive_id`)

### 2.2 보유 기능

| 기능 | 상태 |
|------|------|
| HTML / ZIP publish | ✅ |
| 개인 Drive root (folder_id null) | ✅ |
| 워크스페이스 기본 publish folder (`TEAMVER_DRIVE_PUBLISH_FOLDER_ID`) | ✅ |
| Personal / 공유 Drive 1차 picker | ✅ `drivePublishTargets.ts` |
| 검색형 folder picker | ✅ Phase 1-1 (`TeamverDrivePickerModal`, flatten target 검색) |
| server-side folder search | ✅ Phase 1-2a (`searchTeamverDrivePublishTargets`) |
| folder browser (scope tab / breadcrumb / drill-down) | ✅ Phase 1-2b |
| full Drive browser (최근 파일 / asset grid) | ✅ Phase 1-2c (loop 420) |
| Main Drive 파일 → Design import handoff | ✅ `teamverDriveAsset*` query + 사전 선택 |
| PDF / PPTX | ❌ Phase 4+ (daemon 501) |

### 2.3 현재 한계

1. **Drive picker UX**: publish folder search/browse + 최근 파일/asset grid full browser ✅ loop 420.
2. **Drive import UI**: composer modal/full browser와 Main Drive handoff 완료. ~~다중 파일 handoff~~ ✅ loop 419 · import 원본 deep-link ✅ loop 194.
3. **Drive deep-link**: publish toast·history·project card chip에서 동일 asset URL·라벨 ✅ loop 174/187/421.
4. **워크스페이스 자산 라이브러리 부재**: `design_systems`는 OD 자체 모델, Drive 공유 자산과 분리.

---

## 3. Phase 1 — Drive picker 고도화 (P1, 출시 후 즉시)

### 3.1 목표

publish 시점에 사용자가 **검색·폴더 트리**로 Drive 위치를 선택. Main FE의 `DriveImportModal` 패턴을 모달 폼으로 차용.

### 3.2 설계

| 영역 | 선택 |
|------|------|
| 컴포넌트 | OD `apps/web/src/teamver/components/TeamverDrivePickerModal.tsx` (신규) |
| API | design-api BFF `/teamver-bff/drive/*` → Main BE `/api/drive/*`, `/api/v2/drive/*` (same-origin proxy) |
| 인증 | `credentials: 'include'` cookie + `X-Workspace-Id` — BFF가 Main BE로 JWT 위임 |
| Timeout | browse `TEAMVER_HTTP_TIMEOUT_SECONDS`(기본 5s); thumbnail batch `TEAMVER_DRIVE_PROXY_LONG_TIMEOUT_SECONDS`(기본 30s) |
| State | `selectedFolderId` / `selectedSharedDriveId` → `publishToDrive.ts` 인자 |
| Fallback | 네트워크 실패 시 기존 1차 picker로 graceful degrade |

### 3.2.1 구현됨 — Phase 1-1

- `TeamverPublishDriveMenuItem` — 기존 select 옆 `Browse` 버튼 추가.
- `TeamverDrivePickerModal` — `drivePublishTargets.ts` 의 personal/shared folder flatten 결과를 검색·선택.
- `listTeamverDrivePublishTargets(workspaceId, { limit })` — select 기본 28개, modal 200개 후보 지원.
- 선택한 target의 `folderId/sharedDriveId` 를 publish payload 로 전달.

**남음:** Main FE `DriveImportModal` 수준의 full browser(최근 파일, 자산 grid). Server-side folder search는 loop 167, folder browse/breadcrumb는 loop 168에서 완료.

### 3.3 Main Drive → Design handoff

Main FE `getDesignDriveAssetLaunchUrl()` / `getDesignDriveAssetsLaunchUrl()`은 `teamverDriveAssetId`, `teamverDriveAssetName`, `teamverDriveAssetMimeType`을 **반복 query param**으로 Design URL에 전달한다(최대 12개). 단일 asset은 기존과 동일하게 1세트 param. `teamverDriveIntent=create-slides`가 함께 오면 Design은 전체 Drive import browser 대신 **one-confirm modal**(`TeamverCanvasSlideLaunchModal`)을 연다 — **첫 asset만** slide intent에 사용한다. intent 없는 handoff는 import modal을 열고 asset들을 사전 선택한다.

진입 표면은 Main Drive 파일 상세 모달과 우클릭 메뉴 두 곳이다. 실제 bytes 이동은 새 API가 아니라 기존 design-api `POST /api/v1/projects/{projectRef}/import-drive`를 사용한다.

Main Mobile도 파일 상세 모달에서 동일 query 계약을 사용한다. import 성공 후 `ChatAttachment.source={type:"teamver-drive",assetId}`를 보존하며 composer 첨부 chip의 외부 링크로 원본 Main Drive asset 상세를 다시 열 수 있다.

### 3.4 구현 단계

1. **Picker 모달 1차**: flatten target 검색 + folder 선택 — ✅.
2. **TeamverPublishDriveMenuItem 통합**: 기존 select 드롭다운 옆 `Browse` 버튼 → modal open — ✅.
3. **테스트**: target limit + folder ID 반영 검증 — ✅.
4. **Server-side folder search**: import browser의 Main Drive search/list API를 재사용해 publish destination 검색 — ✅ loop 167.
5. **API 클라이언트 추출**: `teamver/drive/driveApi.ts` — Main Drive fetch/normalize 공통화 — ✅ loop 168.
6. **Folder browser**: personal/team scope tab + breadcrumb + folder drill-down — ✅ loop 168.
7. **Full browser**: 최근 파일 + 자산 그리드형 publish destination helper — ✅ loop 356 **최근 위치(localStorage)** · loop 359 **Drive 홈 최근 grid** (`/home/recent` → folder quick picks).

### 3.2.2 구현됨 — Phase 1-2a

- `searchTeamverDrivePublishTargets()` — `listTeamverDriveImportScopes()` + `searchTeamverDriveImportRows()` 재사용. 개인/팀 Drive folder search 결과만 publish target으로 변환.
- `TeamverDrivePickerModal` — 2글자 이상 query에서 debounce server search. 검색 결과로 선택한 folder가 local target 목록에 없어도 `TeamverPublishDriveMenuItem` 이 target을 보존해 publish payload에 `folderId/sharedDriveId` 를 전달.
- 검증: `teamver-drive-publish-targets.test.ts`, `teamver-publish-drive-menu-item.test.tsx`.

### 3.2.3 구현됨 — Phase 1-2b

- `driveApi.ts` — Main Drive API URL, credentials, workspace header, snake→camel, list extraction 공통화.
- `TeamverDrivePickerModal` — import browser의 scope/list API를 재사용해 personal/team Drive scope tab, breadcrumb, folder drill-down 제공.
- `Use this folder` footer action — folder row drill-down과 현재 위치 선택 완료를 분리. 선택 확정 시 `folderId/sharedDriveId` publish payload 보존.
- D-6a 운영 보조 — staging E2E에서 `TEAMVER_DRIVE_IMPORT_FILENAME` 으로 실제 asset filename을 넘겨 import allowlist와 happy path 검증을 더 현실화.

---

## 4. Phase 2 — Drive import (composer 첨부, P2)

### 4.1 동기

embed 사용자가 **브랜드 로고·데이터 CSV·참고 PPTX**를 Drive에 두고, Design composer에 한 번에 첨부할 수 있어야 한다. 현재는 "로컬 다운로드 → 재업로드" 필수 — 워크스페이스 거버넌스 / 권한이 끊어진다.

### 4.2 데이터 흐름

```text
[사용자] composer + 메뉴 → "Drive에서 첨부"
    ↓
[FE] TeamverDriveImportModal — 자산 선택 (kind=image|file|video|audio)
    ↓ assetId
[FE] POST /api/projects/{id}/import-drive  ← 신규 design-api 라우트
    {asset_id, dest_path?}
    ↓
[design-api BE] Teamver SDK → drive.download_asset(asset_id, access_token)
    ↓ bytes
[design-api BE] daemon import — 파일을 프로젝트 scratch + S3 prefix에 저장
    ↓ ProjectFile path
[FE] composer staged attachment 추가 (path = daemon-relative)
```

### 4.2.1 구현됨 — Phase 2-1

- BE `POST /api/v1/projects/{projectRef}/import-drive` — registry project access + Teamver user token 위임.
- `drive_import_service.py` — SDK `drive.download_bytes(access_token, asset_id, max_bytes=50MB)` → daemon multipart upload.
- `OdDaemonClient.upload_project_file()` — `/api/projects/:id/upload` 에 `dir` + `files` POST. daemon의 기존 scratch/S3 materialization 경로 사용.
- FE `teamver/importDriveAssets.ts` — workspace header, appEnabled gate, typed `imported[]/failed[]` 결과 helper.
- 안전장치 — batch 12개 제한, relative path 검증, path traversal/absolute path/실행 파일 확장자 차단, 전체 성공 201 · 부분 성공 207 · 전체 실패 502.

**남음:** D-6a 실 Drive asset staging 실증 (`TEAMVER_DRIVE_IMPORT_ASSET_ID`). D-6b policy probe 는 loop 163 에서 자동화.

### 4.2.3 구현됨 — Phase 2-3 (loop 160)

- **Asset grid** — 폴더 list + 파일 card grid (`teamver-drive-import-grid`).
- **File-type icon** — `driveFileVisual.ts` (image/slide/data/generic).
- **Image thumbnail** — `driveImportThumbnails.ts` → Main BE `POST /api/v2/asset/object-url/batch`.

### 4.2.4 구현됨 — Phase 2-4 (loop 161)

- **embed attach policy** — `embedFileAttachPolicy.ts` white-list + 50MB cap (`ChatComposer` upload/import + modal card block).
- **문서 입력** — Canvas Drive export와 일반 문서 업무를 위해 DOC/DOCX/ODT 확장자와 Word/OpenDocument MIME을 FE/BE 동시 허용한다.
- **Analytics** — `teamverDriveImportAnalytics.ts` (`drive_import_modal` surface_view, `drive_import_pick` ui_click) → loop 164 contracts 정식화.

### 4.2.5 구현됨 — Phase 2-5 (loop 162)

- **BE policy module** — `drive_import_policy.py` (`validate_drive_import_file_type`). FE `embedFileAttachPolicy.ts` 와 확장자/MIME allow·block 동기화.
- **Per-asset enforcement** — `drive_import_service.py` 가 미지원 타입을 `failed[]` (`unsupported_drive_import_file_type`) 로 반환, 허용 항목만 download/upload 진행 (207 partial success 유지).

### 4.2.7 구현됨 — Phase 2-7 (loop 164)

- **Analytics contracts** — `DriveImportModalSurfaceViewProps` / `DriveImportModalClickProps` in `@open-design/contracts/analytics`.
- **Typed emitters** — `trackDriveImportModalSurfaceView` / `trackDriveImportModalClick` in `apps/web/analytics/events.ts`.

### 4.2.6 구현됨 — Phase 2-6 (loop 163)

- **D-6b policy E2E** — `run_staging_track_a_e2e.sh` 가 `clip.mp4` 요청으로 502 + `unsupported_drive_import_file_type` 검증 (Drive download 없음).
- **D-6a happy path** — `TEAMVER_DRIVE_IMPORT_ASSET_ID` 설정 시 실제 import 201/207 검증.
- **Env helper** — `print_staging_track_a_e2e_env.sh` 로 EC2 cookie/RDS/project/asset env 템플릿 출력.

**남음:** D-6a 실 Drive asset id 로 staging end-to-end 실증.

### 4.2.2 구현됨 — Phase 2-2 (loop 158)

- Drive root **Recent** 섹션 — `listTeamverDriveImportRecent()` → `/api/v2/drive/home/recent`.
- **Server search** — `searchTeamverDriveImportRows()` v2 + list 병합, 2글자 이상·300ms debounce.
- **Breadcrumb stack** — 폴더 이름 유지, 다단계 탐색·상위 복귀.

### 4.2.1 구현됨 — Phase 2-1 (loop 157)

- `TeamverDriveImportModal` — personal/team Drive folder browse + multi-select (max 12).
- `ComposerPlusMenu` — `Attach from Drive` row (`onAttachFromDrive`).
- `ChatComposer` — embed mode에서 modal → `importTeamverDriveAssets` → staged attachment chips.
- `driveImportList.ts` — Main BE `/api/drive/list` + shared-drive scope helper.

### 4.3 API 계약 (신규)

```http
POST /api/v1/projects/{projectRef}/import-drive
Authorization: Bearer <user JWT>
X-Workspace-Id: <workspace_id>
Content-Type: application/json

{
  "assets": [
    {"assetId": "asset_xxx", "filename": "logo.svg"},
    {"assetId": "asset_yyy", "destPath": "refs/logo.svg", "mimeType": "image/svg+xml"}
  ]
}

→ 201 {
  "projectId": "DPRJ_xxx",
  "imported": [
    {"assetId": "asset_xxx", "path": "refs/logo.svg", "name": "logo.svg", "sizeBytes": 12345, "mimeType": "image/svg+xml"}
  ],
  "failed": [{"assetId": "asset_yyy", "errorCode": "drive_download_failed"}]
}
```

**검증:**

- 자산이 사용자 워크스페이스 권한 내인지 — Main BE Drive permissions 위임 (SDK error 그대로 surfacing).
- daemon scratch volume 가용 공간 (daemon upload 경로 + S3 materialization 사용).
- 위험 확장자 차단. embed slide-only 에서 MIME/확장자 allowlist — [13 §2.4](./13_embed_슬라이드_MVP_기능게이트.md#24-p0--파일-첨부-정책) (`embedFileAttachPolicy` FE + `drive_import_policy.py` BE, loop 161/162).
- 한 요청 자산 수 ≤ 12 (composer batch와 동일).

### 4.4 FE 변경

- `ComposerPlusMenu` — Drive 서브메뉴 추가 (embed-only, MCP/Connectors 자리). `showDrive` props.
- `TeamverDriveImportModal` — Phase 1 picker 컴포넌트 재사용, 단일·다중 선택 모드.
- `importTeamverDriveAssets(projectId, assets)` — 구현됨. modal 결과를 design-api `/import-drive` 로 전달.
- `chatAttachmentFromDriveImport(import)` — staged attachment 변환.
- analytics: `drive_import_modal` surface_view, `drive_import_pick` ui_click — ✅ loop 161/164 (contracts).

### 4.5 의존

- Main BE Drive download / asset detail SDK 메서드 (이미 보유 — `runApp source_asset_id` 패턴).
- daemon 측 import 라우트 (현재 폴더 import는 차단됨 — `embedLocalWorkspacePolicy`. 신규 `import-drive` 라우트는 별도 권한 화이트리스트).

### 4.6 Canvas 결과물 기반 slide 생성

- Main Web Canvas Drive 메뉴와 Mobile export 메뉴에 `AI Design으로 슬라이드 만들기`를 제공한다.
- 현재 Canvas draft를 export 직전 flush하고, 텍스트 구조·서식·인라인 이미지를 함께 보존하는 self-contained HTML로 변환한다.
- 생성된 HTML은 Main Drive presigned upload 3-step으로 저장되며, 반환된 `assetId/name/mimeType`을 기존 `teamverDriveAsset*` handoff 계약으로 AI Design에 전달한다.
- Canvas 출발은 `teamverDriveIntent=create-slides`를 함께 전달한다. Design은 import picker에 source를 사전 선택하고, 빈 composer에 슬라이드 생성 지시문을 준비해 파일 확인 후 바로 실행할 수 있게 한다.
- AI Design은 별도 Canvas 전용 권한을 받지 않고 기존 Drive import API에서 workspace 권한·50MB·파일 정책을 동일하게 검증한다.
- 중간 로컬 파일 저장은 필요 없다. Web은 Blob, Mobile은 memory data URI를 Drive upload에 바로 사용한다.

---

## 5. Phase 3 — Workspace 자산 라이브러리 (P3, 출시 후 1~2분기)

### 5.1 비전

워크스페이스 공유 Drive에 둔 **로고 / 컬러 토큰 / 폰트 / 템플릿 PPTX**를 Design embed가 직접 인식, 새 덱 생성 시 자동 적용.

### 5.2 후보 설계

| 옵션 | 설명 | trade-off |
|------|------|-----------|
| A | `design_systems` 테이블에 `drive_folder_id` foreign key — 폴더 내 자산을 DS 자원으로 인덱싱 | OD 모델 그대로 활용, indexer 신규 |
| B | Drive `design-system` 라벨 / 폴더 컨벤션 — 자동 발견 | 시각적, 팀 규약 의존 |
| C | Main BE `workspace_assets` 신규 테이블 + design-api M2M GET | 격리된 라이브러리, 전체 신규 |

**권장:** A + B 결합 — DS 본체는 OD `design_systems`, 자산은 Drive 폴더 ref. 신규 DS 생성 시 "워크스페이스 Drive 폴더 연결" 옵션 노출.

---

## 6. 호환성·리스크

| 영역 | 리스크 | 대응 |
|------|--------|------|
| OD upstream | DS 모델 fork 위험 | Phase 3는 별 store/router (additive), upstream patch 최소화 |
| Drive 권한 | 사용자 / 팀 / 외부 게스트 권한 매트릭스 | Main BE SDK가 SSOT, design-api는 위임 |
| 토큰 만료 | publish · import 중 user JWT 만료 | 401 → FE silent re-auth (10 §3) |
| Storage 격리 | Drive import 파일이 잘못된 tenant prefix로 | daemon `scratchPath` + S3 sync 게이트 (09 Phase 1) — `OD_PROJECT_STORAGE=s3` 강제 |

---

## 7. 마일스톤

| 시점 | 작업 | 상태 |
|------|------|------|
| 2026-Q2 (현재) | Phase 0 (publish, top-folder picker) | ✅ |
| 2026-Q3 | Phase 1-1 (검색형 folder picker) | ✅ |
| 2026-Q3 | Phase 1-2a (publish server-side folder search) | ✅ |
| 2026-Q3 | Phase 1-2b (publish folder browser) | ✅ |
| 2026-Q3 | Phase 1-2c (full Drive browser) | ✅ loop 420 |
| 2026-Q3~Q4 | Phase 2-1 (Drive import API/client foundation) | ✅ |
| 2026-Q3~Q4 | Phase 2-2 (Drive import composer modal) | ✅ |
| 2026-Q3~Q4 | Phase 2-3 (Canvas → Drive → AI Design slide handoff, Web/Mobile) | ✅ |
| 2026-Q4+ | Phase 3 (워크스페이스 자산 라이브러리) | ☐ |

**다음 핵심 작업:** DOCX/HTML/PDF 본문·이미지 추출 품질을 통합해 slide generation이 단순 파일 첨부가 아닌 구조화된 source 구성을 사용하게 한다. ~~one-click 실행~~ — ✅ loop 191 Canvas one-confirm modal.

---

## TODO (후속 작업)

**갱신:** 2026-06-25. 중앙 SSOT — [04 §TODO](./04_구현_우선순위.md#todo-후속-작업).

### Drive publish/import

| ☐ | 작업 |
|---|------|
| ☐ | D-5/D-6/D-7 staging E2E — publish `driveAssetId` + import happy path |
| ☐ | D-6a 실 Drive asset import (`TEAMVER_DRIVE_IMPORT_ASSET_ID`) |
| ✅ | Publish full Drive browser (Phase 1-2c) — import modal 수준 recent/grid (loop 420) |
| ✅ | Drive import **다중 파일 handoff** (loop 419) |
| ✅ | import 원본 → Main Drive deep-link (loop 194) |

### Usage·billing

| ☐ | 작업 | SSOT |
|---|------|------|
| ☐ | U-6 staging E2E — M2M + RDS row count | §3 |
| ☐ | `credit_meter.py` + unit tests | §4.9 #1 |
| ☐ | 전략 A/B/C 확정 (PM·Main BE) | §4.9 #2 |
| ☐ | daemon reserve amount → metered | §4.9 #3 |
| ☐ | embed BYOK billing (U-G6) | §4.7 |
| ☐ | staging E2E billing_status + registry_usage_id | §4.9 #6 |

---

## 8. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-22 | Canvas self-contained HTML → Drive asset → AI Design handoff (Main Web/Mobile), DOC/DOCX/ODT Drive import 정책 확장 |
| 2026-06-19 | loop 169 — publish picker `Use this folder` 액션, D-6a fixture filename body + empty imported[] negative guard |
| 2026-06-19 | loop 168 — Phase 1-2b Drive publish folder browser 구현: 공용 `driveApi.ts`, scope tab/breadcrumb/drill-down, D-6a filename env |
| 2026-06-19 | loop 167 — Phase 1-2a Drive publish server-side folder search 구현: Main Drive search/list API 재사용, picker debounce search, selected target payload 검증 |
| 2026-06-19 | loop 155 — Phase 2-1 Drive import design-api + FE client foundation 구현: SDK download → daemon upload, 201/207/502 계약, path/file guard |
| 2026-06-19 | loop 153 — Phase 1-1 검색형 folder picker 구현: `TeamverDrivePickerModal`, modal target limit 200, publish payload 검증 |
| 2026-06-19 | loop 152 — 초안: Phase 0 현황 + Phase 1~3 로드맵 |
