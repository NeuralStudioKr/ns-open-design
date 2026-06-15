# Open Design — 참고 인덱스

Teamver 연동 시 OD 코드/upstream을 **어디서 보면 되는지**만 정리합니다. 상세는 **`ns-open-design` upstream**이 정본입니다.

> 이 파일은 로컬 스냅샷을 대체합니다. OD 내부가 바뀌면 upstream을 우선 확인하세요.

---

## upstream 정본 (ns-open-design)

| 주제 | 경로 |
|------|------|
| 아키텍처·토폴로지 | [`docs/architecture.md`](../../../ns-open-design/docs/architecture.md) |
| 제품 스펙 | [`docs/spec.md`](../../../ns-open-design/docs/spec.md) |
| Docker·포트 7456 | [`docs/deployment/docker.md`](../../../ns-open-design/docs/deployment/docker.md) |
| 스킬 | [`docs/skills-protocol.md`](../../../ns-open-design/docs/skills-protocol.md) |
| 에이전트 CLI | [`docs/agent-adapters.md`](../../../ns-open-design/docs/agent-adapters.md) |
| API 타입 SSOT | [`packages/contracts/`](../../../ns-open-design/packages/contracts/) |

---

## Teamver 연동에 자주 쓰는 것만

### 앱 구조 (한 줄)

| 앱 | 경로 | 역할 |
|----|------|------|
| web | `apps/web` | 제품 UI (Next 셸 + React SPA) |
| **daemon** | `apps/daemon` | **HTTP `:7456`**, 에이전트 spawn, SQLite·파일 |
| desktop | `apps/desktop` | Electron main만 (UI는 web 임베드) |

Teamver wrapper는 **daemon HTTP만** 호출합니다. OD web UI·desktop 셸을 Teamver에 흡수하지 않습니다.

### daemon API (요약)

| 항목 | 값 |
|------|-----|
| Base URL | `http://127.0.0.1:7456` |
| 프로토콜 | REST + **SSE** (`/api/*`) |
| 타입 | `@open-design/contracts` |
| run (권장) | `POST /api/runs` → 202 → `GET /api/runs/:id` 또는 `…/events` |
| export | `GET /api/projects/:id/export/manifest` |
| 헬스 | `GET /api/health`, `GET /api/ready` |

상세 시퀀스·queue·Drive는 [02_design-app_daemon_연동.md](./02_design-app_daemon_연동.md).

### packages — wrapper가 가져갈 것

| 패키지 | Teamver에서 |
|--------|-------------|
| `@open-design/contracts` | **필수** — `/api/*` DTO·SSE |
| `@open-design/teamver-integration` | **권장** — `OdDaemonClient` (`ns-open-design/packages/teamver-integration`) |
| `sidecar`, `host`, `components` … | **불필요** (OD 런타임·UI 내부용) |

### 데이터·키 (배경)

| 저장 | 위치 |
|------|------|
| 프로젝트 파일 | `<OD_DATA_DIR>/projects/<id>/` |
| 메타 DB | `<OD_DATA_DIR>/app.sqlite` |
| API 키·BYOK | daemon `app-config.json`, `media-config.json`, CLI 로그인 |
| 인프라 토큰 | `OD_API_TOKEN` (non-loopback 시) |

Teamver Drive·앱 DB 매핑은 [03_키_저장소_Drive_DB.md](./03_키_저장소_Drive_DB.md).

### 로컬 실행

```sh
cd ns-open-design
pnpm install
pnpm tools-dev run web    # daemon :7456 + web :3000
```

Teamver sidecar 배포: `deploy/teamver/` (daemon + **be/** + nginx).

| Teamver 구현 | `ns-open-design` 경로 |
|--------------|----------------------|
| design-api BE | `deploy/teamver/be/` |
| 연동 SSOT | `deploy/teamver/docs/TEAMVER_APPS_INTEGRATION.md` |
| headless client | `packages/teamver-integration/` |

**출시 경로:** [05_OD_UI_재사용_빠른출시.md](./05_OD_UI_재사용_빠른출시.md)

---

## 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-15 | `open-design/01~03` 3편 스냅샷을 본 인덱스로 통합, upstream 링크 SSOT |
