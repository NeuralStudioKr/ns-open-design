# Design ↔ Teamver Drive 연동 설계

Teamver Design embed의 **파일 IO를 Teamver Drive로 통합**하는 설계 SSOT. 1차 출시(슬라이드 MVP)는 **출력 publish 일방향**, 후속 단계로 **입력 import 양방향**을 단계적으로 도입한다.

**관련:** [11_Usage·Drive_Publish](./11_Usage·Drive_Publish_보강.md) · [13_embed_슬라이드_MVP_기능게이트](./13_embed_슬라이드_MVP_기능게이트.md) · [03_키_저장소_Drive_DB](./03_키_저장소_Drive_DB.md) · [09_Design_저장소_격리](./09_Design_저장소_격리_출시게이트.md)

**Main FE 참고 구현:** `ns-teamver-fe-v2/web/src/components/chat/DriveImportModal.tsx`, `services/drive.ts`, `services/sharedDrive.ts`, `services/apps.ts`(`runApp` `source_asset_id` 패턴)

---

## 1. 한 줄 결론

> **Phase 0 (현재): publish 단방향 ✅ — `POST /api/v1/projects/{id}/publish` → daemon export → SDK Drive 3-step → `design_outputs`.**  
> **Phase 1 (다음): Drive picker UI 고도화** — 검색·폴더 트리 (Main FE `DriveImportModal` 패턴 차용).  
> **Phase 2: Drive import** — 사용자/팀 Drive에서 파일을 Design 프로젝트로 ingest (composer 첨부, 브랜드 에셋 라이브러리).  
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
| Personal / 공유 Drive 1차 picker (top-folder 28개) | ✅ `drivePublishTargets.ts` |
| 검색·폴더 트리 picker | ☐ Phase 1 |
| PDF / PPTX | ❌ Phase 4+ (daemon 501) |

### 2.3 현재 한계

1. **Drive picker UX**: 28개 top-folder만 셀렉트. 깊은 폴더 / 검색 / 최근 사용 없음.
2. **Drive import 부재**: 사용자가 Drive 자산(브랜드 로고, 데이터 CSV, 기존 PPTX)을 composer에 첨부하려면 **로컬 다운로드 → 재업로드** 필요.
3. **Drive deep-link 부재**: publish 결과 카드에서 Drive 자산 페이지 직접 이동 미지원.
4. **워크스페이스 자산 라이브러리 부재**: `design_systems`는 OD 자체 모델, Drive 공유 자산과 분리.

---

## 3. Phase 1 — Drive picker 고도화 (P1, 출시 후 즉시)

### 3.1 목표

publish 시점에 사용자가 **검색·폴더 트리**로 Drive 위치를 선택. Main FE의 `DriveImportModal` 패턴을 모달 폼으로 차용.

### 3.2 설계

| 영역 | 선택 |
|------|------|
| 컴포넌트 | OD `apps/web/src/teamver/components/TeamverDrivePickerModal.tsx` (신규) |
| API | Main BE 기존 `/api/drive/folder-tree`, `/api/drive/list`, `/api/drive/home/recent`, `/api/drive/home/search` 직접 호출 (FE → Main BE, design-api 우회) |
| 인증 | `credentials: 'include'` cookie + `X-Workspace-Id` (Main FE와 동일) |
| State | `selectedFolderId` / `selectedSharedDriveId` → `publishToDrive.ts` 인자 |
| Fallback | 네트워크 실패 시 기존 1차 picker로 graceful degrade |

### 3.3 구현 단계

1. **API 클라이언트 추출**: `teamver/drive/driveApi.ts` — Main FE `services/drive.ts`의 핵심 함수만 포팅 (`fetchFolderTree`, `fetchDriveList`, `fetchHomeRecent`, `fetchHomeSearch`).
2. **Picker 모달**: 좌측 폴더 트리 + 우측 자산 그리드 + 상단 검색 필드. Main FE `DriveImportModal` 레이아웃 차용.
3. **TeamverPublishDriveMenuItem 통합**: 기존 select 드롭다운 옆에 "다른 폴더 선택…" 버튼 → 모달 open.
4. **테스트**: API 응답 mocking + 폴더 ID 반영 검증.

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

### 4.3 API 계약 (신규)

```http
POST /api/v1/projects/{projectId}/import-drive
Authorization: Bearer <user JWT>
X-Workspace-Id: <workspace_id>
Content-Type: application/json

{
  "assets": [
    {"asset_id": "asset_xxx"},
    {"asset_id": "asset_yyy", "dest_path": "refs/logo.svg"}
  ]
}

→ 201 {
  "imported": [
    {"asset_id": "asset_xxx", "path": "refs/logo.svg", "size_bytes": 12345, "mime_type": "image/svg+xml"}
  ],
  "failed": [...]
}
```

**검증:**

- 자산이 사용자 워크스페이스 권한 내인지 — Main BE Drive permissions 위임 (SDK error 그대로 surfacing).
- daemon scratch volume 가용 공간 (S3 sync 비동기).
- MIME / 확장자 화이트리스트 (슬라이드 워크플로 친화 — [13 §2.4](./13_embed_슬라이드_MVP_기능게이트.md#24-p0--파일-첨부-정책)).
- 한 요청 자산 수 ≤ 12 (composer batch와 동일).

### 4.4 FE 변경

- `ComposerPlusMenu` — Drive 서브메뉴 추가 (embed-only, MCP/Connectors 자리). `showDrive` props.
- `TeamverDriveImportModal` — Phase 1 picker 컴포넌트 재사용, 단일·다중 선택 모드.
- `chatAttachmentFromDriveImport(import)` — staged attachment 변환.
- analytics: `drive_import_modal` surface_view, `drive_import_pick` ui_click.

### 4.5 의존

- Main BE Drive download / asset detail SDK 메서드 (이미 보유 — `runApp source_asset_id` 패턴).
- daemon 측 import 라우트 (현재 폴더 import는 차단됨 — `embedLocalWorkspacePolicy`. 신규 `import-drive` 라우트는 별도 권한 화이트리스트).

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
| 2026-Q3 | Phase 1 (검색·트리 picker) | ☐ — 출시 후 즉시 |
| 2026-Q3~Q4 | Phase 2 (Drive import composer) | ☐ |
| 2026-Q4+ | Phase 3 (워크스페이스 자산 라이브러리) | ☐ |

---

## 8. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-19 | Loop 144 — 초안: Phase 0 현황 + Phase 1~3 로드맵 |
