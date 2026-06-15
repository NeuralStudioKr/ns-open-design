> **보관 문서 (2026-06-15)** — 수정하지 마세요. 현행: [README.md](../README.md)

# Open Design — `packages/` 개요

Teamver Design 연동 시 **open-design 모노레포의 공유 패키지**가 무엇인지, 어디까지 의존하면 되는지 정리합니다.

**관련 문서 (본 레포)**

| 문서 | 내용 |
|------|------|
| [01_1_open-design_teamver통합방안_chatgpt.md](./01_1_open-design_teamver통합방안_chatgpt.md) | Teamver ↔ OD 경계, wrapper 권장 |
| [01_2_open-design_웹_데스크톱_구현구조.md](./01_2_open-design_웹_데스크톱_구현구조.md) | apps/web·daemon·desktop 폴더 구조 |
| [03_open-design_데몬_통신_규격.md](./03_open-design_데몬_통신_규격.md) | HTTP/SSE·contracts·sidecar IPC |

**근거 (open-design 업스트림)**

| 문서 | 경로 |
|------|------|
| 제품·모듈 | `open-design/docs/spec.md` |
| 토폴로지·데이터 흐름 | `open-design/docs/architecture.md` |
| 플러그인 | `open-design/docs/plugins-spec.md` |
| 스킬 | `open-design/docs/skills-protocol.md` |
| 에이전트 CLI | `open-design/docs/agent-adapters.md` |

---

## 1. 패키지가 있는 이유

`open-design/packages`는 **앱(`apps/web`, `apps/daemon`, `apps/desktop`)과 도구(`tools-dev`)가 공유하는 순수/반순수 라이브러리**입니다.

- **웹 ↔ 데몬 경계 타입**은 `@open-design/contracts` 한곳에 모읍니다.
- **데스크톱·런처·sidecar**는 IPC/경로 규약 패키지로 분리합니다.
- **플러그인·레지스트리**는 Node `fs` 없이 파싱/검증 가능한 `plugin-runtime` + `registry-protocol`로 둡니다.

Teamver wrapper는 보통 **HTTP로 daemon만 호출**하고, 타입이 필요하면 **`@open-design/contracts`만** 가져오는 편이 안전합니다. daemon 내부 패키지(`platform`, `sidecar` 등)까지 끌어오지 않는 것을 권장합니다 ([01_1](./01_1_open-design_teamver통합방안_chatgpt.md)).

---

## 2. 레이어 (의존 방향)

```text
apps/web, apps/daemon, apps/desktop, e2e
        │
        ├─ @open-design/components      (React UI)
        ├─ @open-design/agui-adapter    (AG-UI 이벤트 변환)
        │
        ├─ @open-design/contracts ◄──── SSOT (요청/응답/SSE/프롬프트 계약)
        │
        ├─ @open-design/plugin-runtime
        ├─ @open-design/registry-protocol
        │
        ├─ @open-design/host            (Electron preload ↔ renderer 브리지)
        ├─ @open-design/sidecar-proto   (IPC 메시지·상태 스냅샷 타입)
        ├─ @open-design/sidecar         (IPC 서버/클라이언트 구현)
        ├─ @open-design/launcher-proto  (채널·버전·설치 경로)
        │
        ├─ @open-design/platform        (프로세스 spawn, 경로, HTTP wait)
        ├─ @open-design/download        (관리형 다운로드 스토어)
        ├─ @open-design/diagnostics     (로그 수집·redaction·zip)
        └─ @open-design/metatool        (빌드 산출물 freshness, 내부)
```

---

## 3. 패키지별 용도

| 패키지 | npm 이름 | 한 줄 용도 | Teamver 연동 시 |
|--------|----------|------------|-----------------|
| **contracts** | `@open-design/contracts` | Web/daemon **공유 TypeScript 계약**: `/api/*` DTO, SSE 이벤트, 플러그인·디자인시스템·프롬프트 스키마 | **가장 자주 참조** — OpenAPI 대신 이 패키지가 사실상 API 스펙 |
| **components** | `@open-design/components` | OD 제품 UI용 **공유 React 프리미티브** | Teamver FE에 OD UI를 임베드할 때만 |
| **agui-adapter** | `@open-design/agui-adapter` | OD 에이전트 이벤트 ↔ **AG-UI(CopilotKit)** 프로토콜 양방향 변환 | CopilotKit 연동 제품면에서만 |
| **plugin-runtime** | `@open-design/plugin-runtime` | 플러그인 manifest/marketplace **파싱·병합·검증·digest** (fs 없음) | Registry/CI 검증, daemon과 동일 규칙 재사용 시 |
| **registry-protocol** | `@open-design/registry-protocol` | 플러그인 **레지스트리 백엔드** 프로토콜 (Zod 스키마) | 셀프호스트 registry 연동 시 (`self-hosting-a-registry.md`) |
| **host** | `@open-design/host` | **Desktop renderer**가 main/preload와 주고받는 **호스트 브리지** 타입·계약 (`__od__`) | Electron 셸 통합 시 |
| **sidecar-proto** | `@open-design/sidecar-proto` | **Sidecar IPC** 메시지명·스냅샷 타입·env 키·desktop 업데이트 상태 | `tools-dev` / desktop 상태 조회·자동화 |
| **sidecar** | `@open-design/sidecar` | sidecar-proto 기반 **Unix socket / named pipe IPC** 구현 | OD 런타임 오케스트레이션 (Teamver BE 직접 사용 드묾) |
| **launcher-proto** | `@open-design/launcher-proto` | Desktop **채널(stable/beta/…)·버전·설치 경로** 디스크립터 | 패키지 런처/업데이트 도구 |
| **platform** | `@open-design/platform` | **자식 프로세스 spawn/stop**, stamped 프로세스 매칭, atomic copy, HTTP 대기 | daemon/desktop 빌드·런타임 공통 (앱 외부에서 직접 쓸 일 적음) |
| **download** | `@open-design/download` | **재시도·체크섬·락**이 있는 관리형 다운로드 루트 | 런타임/업데이트 payload |
| **diagnostics** | `@open-design/diagnostics` | **진단 번들**: 에이전트 로그·redaction·zip | 지원/장애 대응 도구 |
| **metatool** | `@open-design/metatool` | 빌드된 tool dist **신선도 검사** (내부 메타) | OD 개발자 CI용 |

---

## 4. `contracts` 내부 맵 (API 모듈)

daemon HTTP 경로와 1:1로 맞추려면 `packages/contracts/src/api/`를 본다.

| 모듈 파일 | 대표 daemon 관심사 |
|-----------|-------------------|
| `chat.ts` | `POST /api/chat` 요청 본문 (`ChatRequest`) |
| `projects.ts`, `files.ts`, `artifacts.ts` | 프로젝트·파일·아티팩트 |
| `memory.ts` | `/api/memory/*` 메모리 트리 |
| `automations.ts` | 자동화 ingest/proposal |
| `connectors.ts` | 외부 커넥터 |
| `media.ts`, `mcp.ts` | 미디어 생성·MCP 설정 |
| `live-artifacts.ts` | 라이브 아티팩트 refresh |
| `handoff.ts`, `finalize.ts` | 핸드오프·패키지 finalize |
| `registry.ts` | 앱 레지스트리 |
| `terminals.ts` | 프로젝트 터미널 |
| `app-config.ts`, `version.ts` | 헬스·버전·앱 설정 |

SSE: `packages/contracts/src/sse/chat.ts`, `sse/common.ts`.

---

## 5. apps와 packages 관계

| 앱 | 주로 쓰는 packages |
|----|-------------------|
| `apps/web` | `contracts`, `components`, `agui-adapter` |
| `apps/daemon` | `contracts`, `plugin-runtime`, `platform`, `diagnostics`, `download` |
| `apps/desktop` | `host`, `sidecar`, `sidecar-proto`, `launcher-proto`, `contracts` |

실행 진입점·라우트 구현은 **패키지가 아니라 `apps/daemon`** 에 있다. Teamver가 “OD API”를 호출한다는 것은 **daemon 프로세스의 HTTP**를 의미하며, 규격 타입은 **`contracts`** 를 참조한다 ([03](./03_open-design_데몬_통신_규격.md)).

---

## 6. Teamver에서의 선택 가이드

| 목표 | 권장 |
|------|------|
| Design App BE가 생성·프로젝트·채팅 오케스트레이션 | daemon `http://127.0.0.1:7456` + `contracts` 타입 |
| 산출물만 Drive에 저장 | wrapper가 daemon export/finalize API 호출 후 바이트 처리 |
| OD UI를 Teamver 안에 넣지 않음 | `components` / `host` 불필요 |
| OD upstream 업데이트 추적 | `contracts` 버전·changelog + `architecture.md` §7 |

---

## 7. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-06-12 | 초안 — `open-design/packages` 인벤토리 및 Teamver 선택 가이드 |
