# Hosted AI provider 비노출 기획·설계

**작성일:** 2026-10-13  
**상태:** Phase 1 shadow API 구현, 기본 OFF, web 미연결
**대상:** Teamver Design hosted/embed 실행 경로  
**관련 문서:** [29 BYOK API mode](./29_BYOK_api_mode_vs_runs_아키텍처.md) · [54 MiniMax 전환](./54_MiniMax_전환_기획_설계.md) · [54-1 개발설계](./54-1_MiniMax_전환_개발설계.md)

> 이 문서는 기획·설계 SSOT이며, 하단 단계 중 실제 구현된 범위는 별도 상태 문구로 추적한다.

> **2026-10-13 구현 상태:** 기존 API와 web 호출은 변경하지 않고, 별도 daemon 모듈 및 `/api/proxy/chat/stream`을 추가했다. `TEAMVER_HOSTED_CHAT_API_ENABLED`의 기본값은 `0`이며, OFF이면 route 자체가 등록되지 않는다. runtime-config v2, web transport 전환, 기존 endpoint 폐쇄는 아직 구현하지 않았다.

**2026-10-13 재검토 결론:** 최초안의 방향은 맞지만, (1) hosted에서 provider별 endpoint를 계속 허용하는 문제, (2) 단일 프로필인데도 browser가 `executionProfile`을 보내는 불필요한 계약, (3) design-api와 daemon의 provider 설정 중복을 제거해야 한다. 아래 설계는 이 세 항목을 반영한 최종 권고안이다.

---

## 0. 결론

현재 hosted/embed 브라우저는 API key만 받지 않을 뿐, 활성 AI 공급자와 모델을 명시적으로 알 수 있다.

- 스트림 URL: `POST /api/proxy/minimax/stream`
- 스트림 body: `apiProtocol`, `model`, `baseUrl`, `apiVersion`
- runtime config: 실제 `apiProtocol`, `model`, `baseUrl`
- local AppConfig/localStorage: runtime config를 병합한 실제 실행 설정
- 메시지 metadata와 진단: `minimax-api`, `MiniMax API · MiniMax-M3`
- memory extraction body: 실제 `chatProvider`
- usage SSE 및 usage event: 실제 model과 protocol
- 오류 응답: 공급자명과 provider 원문 payload

따라서 URL alias 하나만 추가해서는 요구사항을 충족하지 못한다. 권장안은 **브라우저가 공급자를 선택하는 구조를 제거하고, hosted 실행을 서버 측 논리 프로필 하나로 추상화**하는 것이다.

권장 공개 계약:

```text
Browser
  POST /api/proxy/chat/stream
  provider/profile/model/baseUrl/apiKey = 전송하지 않음

Daemon private runtime
  workspace policy/default -> provider adapter -> upstream
  provider/model/baseUrl/apiKey = 서버 env 및 registry에서만 해석
```

기존 provider별 endpoint는 standalone/BYOK 코드에서 유지한다. 그러나 **hosted 배포에서는 호환 전환 기간이 끝난 뒤 provider별 endpoint를 404로 닫아야 한다.** 새 embed 번들이 호출하지 않는 것만으로는 직접 probe를 막을 수 없다.

---

## 1. 목표와 비목표

### 1.1 목표

1. 로그인 사용자가 DevTools Network, 저장소, UI, 일반 오류 진단을 보아도 현재 hosted 공급자와 실제 모델을 명시적으로 확인할 수 없게 한다.
2. 공급자 교체가 web 재배포나 공개 API 계약 변경 없이 daemon 설정 변경으로 가능하게 한다.
3. 실제 provider/model 정보는 서버 로그, 운영 metric, billing ledger에서 계속 정확히 보존한다.
4. standalone 사용자의 BYOK 공급자 선택과 기존 provider endpoint 호환성을 유지한다.
5. 오류 복구, deck atomic completion, web fetch, usage 정산의 현재 동작을 훼손하지 않는다.

### 1.2 비목표

- 모델 출력 문체, latency, tokenization 특성으로 공급자를 **추정**하는 행위까지 방지하지 않는다.
- 브라우저 번들에서 `MiniMax` 문자열을 무조건 0개로 만드는 것을 P0 목표로 삼지 않는다. 같은 번들이 standalone BYOK 공급자 목록을 제공한다면 “지원 가능한 공급자” 문자열은 남을 수 있다.
- API key 은닉을 provider 비노출과 혼동하지 않는다. key는 현재도 서버에만 있어야 하며, 본 설계는 그 위의 제품/계약 추상화다.
- 내부 운영자, 서버 로그, DB 관리자에게 provider를 숨기지 않는다.

### 1.3 보장 수준

| 수준 | 의미 | 본 설계 |
|---|---|---|
| L0 | API key 비노출 | 기존 보장 유지 |
| L1 | 활성 provider/model의 명시적 브라우저 노출 제거 | **P0 목표** |
| L2 | production JS 번들에서 provider 문자열 자체 제거 | 선택적 branded build |
| L3 | 행동 기반 fingerprinting 방지 | 보장하지 않음 |

---

## 2. 현재 노출면 감사

### 2.1 직접 노출

| 표면 | 현재 위치 | DevTools에서 보이는 값 | 위험 |
|---|---|---|---|
| 스트림 URL | `apps/web/src/providers/minimax-compatible.ts` | `/api/proxy/minimax/stream` | 활성 provider 확정 |
| 스트림 body | `apps/web/src/providers/api-proxy.ts` | `model`, `baseUrl`, `apiProtocol` | provider, 모델, upstream origin 확정 |
| runtime config | `deploy/teamver/be/app/services/od_runtime_config.py` | `apiProtocol`, `baseUrl`, `model` | 실행 전에도 provider 확정 |
| config merge | `apps/web/src/teamver/applyTeamverRuntimeConfig.ts` | 실제 실행값을 AppConfig에 저장 | React state/localStorage 검사로 노출 |
| pinned config | `apps/web/src/teamver/branding/pinnedExecutionConfig.ts` | protocol/baseUrl/model | 메모리·디버거로 노출 |
| assistant metadata | `ProjectView.tsx`, `utils/apiProtocol.ts` | `minimax-api`, 모델 label | 대화 API/진단에 노출 |
| memory extract | `ProjectView.tsx` | `chatProvider.provider/baseUrl` | 별도 Network 요청으로 노출 |
| usage SSE | `chat-routes.ts` | usage `model` | 스트림 frame에서 노출 |
| usage report | `reportUsage.ts`, `usageAttribution.ts` | `modelName`, `providerReportedModel`, `apiProtocol` | BFF 요청에서 노출 |
| 오류 | `chat-routes.ts`, managed-key error | `MiniMax ...`, upstream details | 실패할 때 더 강하게 노출 |

### 2.2 간접 노출

- production bundle에 provider route와 label이 포함될 수 있다.
- 정적 source map 또는 lazy chunk 이름/본문이 공개되면 hosted에서 사용하지 않는 provider adapter도 검색될 수 있다.
- persisted assistant row의 `agentId`/`agentName`이 프로젝트 대화 조회 응답에 포함될 수 있다.
- server가 upstream 오류 body를 `details`로 그대로 SSE에 전달하면 provider 고유 code/schema가 보인다.
- token usage 화면/API가 실제 모델명을 사용자에게 반환하면 실행 요청을 중립화해도 다시 노출된다.
- 오래된 localStorage와 service worker/cache에 과거 runtime config가 남을 수 있다.
- analytics/session replay/crash reporting이 URL, 오류 message, request metadata를 수집하면 제3의 관측면이 생긴다.
- CSP `connect-src`, preload manifest, nginx rewrite 목록에 provider origin/path가 들어가도 간접 신호가 된다.

### 2.3 현재 구조의 근본 원인

현재 managed mode는 “브라우저가 provider를 선택하되 key만 daemon이 주입”하는 BYOK proxy의 연장선이다. provider 전환 초기에 구현 비용은 낮았지만, hosted 제품에서 공급자 추상화 경계가 브라우저가 아니라 daemon 뒤에 있어야 한다는 요구와 충돌한다.

---

## 3. 권장 아키텍처

### 3.1 공개 plane과 private plane 분리

```text
Public browser plane
  endpoint: /api/proxy/chat/stream
  capabilities: complete-deck, web-context, media-tool 여부
  usage: token counts + logical product SKU
  error: stable Teamver error code

Private server plane
  provider adapter id
  upstream base URL
  actual model
  API key
  provider-native request/response
  actual model billing and operations telemetry
```

provider/model/baseUrl은 private plane에서만 존재한다. 현재 hosted 실행 프로필은 하나이므로 endpoint와 인증이 실행 의미를 충분히 결정하며, browser가 profile id를 보낼 필요도 없다. 향후 여러 프로필이 필요해지면 provider와 무관한 opaque policy id만 BFF가 발급한다.

### 3.2 서버 provider registry

daemon에 hosted 전용 adapter registry를 둔다.

```ts
type ManagedChatAdapter = {
  id: string; // server-only
  resolveModel(): string;
  stream(input: ManagedChatInput, context: ManagedRequestContext): Promise<void>;
  capabilities: ManagedChatCapabilities;
};
```

`POST /api/proxy/chat/stream`은 다음 순서로 동작한다.

1. Teamver managed deployment인지 확인한다.
2. `X-Teamver-*` identity, workspace entitlement, project 접근 권한을 확인한다.
3. body의 `apiKey`, `provider`, `apiProtocol`, `model`, `baseUrl`, `apiVersion`을 **허용하지 않는다**.
4. daemon의 private registry에서 workspace policy 또는 server default에 맞는 adapter를 선택한다.
5. adapter가 실제 model/base URL/key를 결정한다.
6. 기존 materialization, abort, tool loop, complete-artifact gate를 공통 lifecycle 안에서 실행한다.
7. 브라우저에는 provider-neutral SSE만 반환한다.

단순히 generic URL이 내부 provider별 endpoint를 HTTP로 재호출하는 방식은 권장하지 않는다. 인증·usage·abort/materialization lifecycle이 이중화되며, 내부 provider 이름이 오류나 header를 통해 다시 샐 수 있다. 공통 handler/adapter를 직접 호출해야 한다.

provider 선택의 SSOT는 daemon 하나여야 한다. design-api가 현재처럼 `TEAMVER_DESIGN_DEFAULT_PROVIDER`, 실제 model/base URL을 다시 해석하면 두 프로세스의 설정 drift가 재발한다. design-api는 제품 entitlement와 generic chat 가용성만 공개하고, 실제 upstream readiness는 daemon 내부 health/운영 probe로 확인한다.

### 3.3 요청 계약

권장 request:

```json
{
  "systemPrompt": "...",
  "messages": [],
  "maxOutputTokens": 32000,
  "projectId": "...",
  "conversationId": "...",
  "assistantMessageId": "...",
  "expectCompleteDeckArtifact": true
}
```

금지 필드:

```json
{
  "apiKey": "...",
  "useManagedApiKey": true,
  "apiProtocol": "...",
  "provider": "...",
  "model": "...",
  "baseUrl": "...",
  "apiVersion": "..."
}
```

`executionProfile`과 `useManagedApiKey`조차 현재 hosted 전용 endpoint에서는 불필요하다. endpoint와 인증 자체가 managed 실행을 뜻한다. 금지 필드가 들어오면 무시하지 말고 `400 INVALID_MANAGED_CHAT_REQUEST`로 거부해 routing override와 SSRF 우회를 막는다. `maxOutputTokens`는 client hint일 뿐이며 server의 profile별 상한/하한으로 clamp한다.

### 3.4 runtime config 계약

현재 응답:

```json
{
  "configured": true,
  "apiKeyConfigured": true,
  "apiProtocol": "minimax",
  "baseUrl": "https://api.minimax.io/v1",
  "model": "MiniMax-M3"
}
```

권장 v2 응답:

```json
{
  "configured": true,
  "transport": "managed-chat-v2",
  "capabilities": {
    "chat": true,
    "deckArtifact": true,
    "webContext": true
  }
}
```

`transport`는 공개 API contract version이지 provider profile이 아니다. `apiKeyConfigured`도 내부 key 존재를 직접 설명하는 이름이므로 v2에서는 `configured`로 합친다. capability는 실제 provider명이 아니라 제품 기능만 나타낸다.

전환 기간에는 **별도 `/runtime-config/v2` endpoint**를 사용한다. 같은 endpoint에서 User-Agent나 header에 따라 v1/v2를 섞으면 cache와 장애 분석이 모호해진다. 새 web은 v2만 사용하고, v1은 구버전 bundle의 최대 cache 수명 이후 제거한다.

design-api는 v2 payload를 만들기 위해 실제 provider env를 읽지 않는다. `configured`는 workspace entitlement와 generic daemon readiness에서 얻고, provider/model/base URL은 daemon 밖으로 복제하지 않는다.

### 3.5 web 실행 모델

hosted/embed에서는 `ApiProtocol`을 provider routing SSOT로 사용하지 않는다. 별도 실행 transport를 둔다.

```ts
type ExecutionTransport =
  | { kind: 'daemon-agent'; agentId: string }
  | { kind: 'byok'; apiProtocol: ApiProtocol }
  | { kind: 'teamver-managed'; contractVersion: 2 };
```

hosted config의 공개 값:

- `apiProtocol`: 설정하지 않음
- `baseUrl`: 빈 값 또는 config에서 제거
- `model`: 실제 모델 대신 논리명 `Teamver AI`
- `agentId`: `teamver-managed`
- `agentName`: `Teamver AI`

`streamMessage()`는 `kind === 'teamver-managed'`를 먼저 분기해 generic endpoint를 호출한다. 공급자별 web provider module은 BYOK에서만 사용한다. embed state persistence는 실제 `apiProtocol`, model, base URL을 저장하지 않아야 하며, 기존 저장값은 hosted boot에서 선택적으로 scrub한다.

### 3.6 SSE 응답 계약

허용:

```text
event: delta
event: thinking_delta
event: usage       // token counts only
event: error       // stable public error envelope
event: end
```

usage 예시:

```json
{
  "input_tokens": 1234,
  "output_tokens": 5678,
  "billing_sku": "teamver-design-ai"
}
```

브라우저에 보내지 않는 값:

- actual model
- provider/API protocol
- upstream request id 중 provider를 식별하는 형태
- provider-native stop reason
- provider 원문 error payload

public error 예시:

```json
{
  "message": "AI 서비스 응답이 완료되기 전에 연결이 종료되었습니다.",
  "error": {
    "code": "UPSTREAM_UNAVAILABLE",
    "retryable": true
  }
}
```

서버 로그에는 동일 correlation id와 함께 실제 provider error를 구조화해 남긴다. 사용자 오류의 `details`에는 원문을 싣지 않는다.

### 3.7 대안 비교와 최종 선택

| 방안 | 장점 | 문제 | 판단 |
|---|---|---|---|
| nginx에서 URL만 rewrite | 가장 작고 빠름 | body/runtime config/error/usage 노출이 그대로이고 provider route 직접 probe 가능 | 기각 |
| design-api가 upstream streaming까지 대행 | browser 계약을 숨기기 쉬움 | daemon의 tool loop, materialization, abort, usage lifecycle을 중복 구현하거나 스트림 hop을 하나 더 추가 | 기각 |
| generic daemon route가 기존 handler를 adapter화 | lifecycle 재사용, provider SSOT 단일화, 교체 용이 | 초기 공통 handler 추출 비용 | **채택** |
| hosted 전용 AI gateway 서비스 신설 | 장기적으로 여러 앱이 공유 가능 | 현재 범위에 비해 운영 복잡도와 migration 비용이 큼 | 후속 검토 |

현재 시스템에서는 generic daemon route + private adapter registry가 가장 작은 변경은 아니지만, 노출면 전체와 품질 회귀 위험을 함께 줄이는 최선의 구조다. 별도 AI gateway는 Design 외 제품까지 동일 요구가 생길 때 승격한다.

---

## 4. Usage·billing·memory 설계

### 4.1 billing은 서버 권위로 전환

실제 모델 가격을 정확히 계산하려면 provider/model은 서버에 남아야 한다. 따라서 daemon의 usage stager가 adapter에서 실제 provider/model을 받아 server-to-server billing payload에 기록한다.

브라우저 usage event는 다음만 전송한다.

- logical SKU: `teamver-design-ai`
- input/output token count
- project/conversation/assistant correlation id
- latency와 public stop category

BFF는 server-authoritative usage가 있으면 browser의 모델 필드를 정산 근거로 사용하지 않는다. 중복 보고는 기존 idempotency key로 합친다.

### 4.2 사용자 usage API

사용자에게 반환하는 사용량 집계는 실제 model별이 아니라 제품 SKU 또는 기능별로 집계한다. 운영자 전용 endpoint/대시보드는 실제 provider/model을 유지하되 일반 workspace 권한에서 접근할 수 없게 한다.

### 4.3 memory extraction

현재 browser가 `/api/memory/extract`에 `chatProvider`를 보낸다. hosted 경로에서는 이를 제거하고 다음 중 하나로 바꾼다.

1. provider 정보 없이 `transport: managed-chat-v2`만 전송해 memory service가 서버 registry를 사용한다. **단기 권장**
2. memory extraction을 chat daemon 내부 후처리로 이동해 browser 요청 자체를 없앤다. 중기 권장

BYOK 사용자는 기존 `chatProvider` 계약을 유지한다.

---

## 5. 오류·진단·저장 데이터 정책

### 5.1 공개 진단

hosted 실행의 공개 진단은 다음으로 고정한다.

```text
agent_id: teamver-managed
model: 미표시
provider: 미표시
error_code: Teamver stable code
```

기존 `minimax-api`, `MiniMax API · MiniMax-M3`, `MINIMAX_API_KEY_MISSING`, `MiniMax stream ended ...`는 hosted 응답과 persisted message에 사용하지 않는다.

### 5.2 내부 진단

운영 로그/metric에는 아래를 유지한다.

- provider adapter id
- actual model
- upstream status/code/request id
- retry/continuation 횟수
- token usage
- project/workspace correlation id

내부 로그는 브라우저 SSE `details`로 복사하지 않는다.

### 5.3 저장 데이터 migration

새 실행부터 assistant message의 agent metadata를 중립화한다. 기존 대화의 과거 metadata는 다음 정책 중 선택한다.

- API serialization 시 일반 사용자에게 중립 alias로 projection한다. **권장**
- DB backfill로 과거 값을 변경한다.

원본 운영 감사 정보가 필요하므로 DB 파괴적 backfill보다 role-aware projection을 권장한다.

### 5.4 localStorage/cache

embed boot 시 과거 managed config의 `apiProtocol`, 실제 `model`, `baseUrl`, `teamverManagedProvider`를 scrub한다. service worker와 정적 asset cache는 배포 version bump로 갱신한다. standalone BYOK 설정은 지우지 않는다.

---

## 6. 보안 요구사항

1. generic endpoint는 authenticated Teamver embed 요청만 허용한다.
2. client API key와 routing override 필드를 거부한다.
3. identity의 workspace와 server-side execution policy가 일치하지 않으면 거부한다.
4. upstream base URL은 서버 고정 allowlist 및 DNS/IP 검증을 계속 적용한다.
5. provider 원문 오류는 서버에서 redact 후 로깅하고 browser에는 stable envelope만 전송한다.
6. response header, CORS header, request id prefix에도 provider명이 들어가지 않게 한다.
7. nginx access log를 일반 사용자에게 노출하지 않는다.
8. runtime config는 인증되어도 provider/model을 반환하지 않는다.
9. hosted 배포에서는 migration 종료 후 provider별 chat endpoint를 등록하지 않거나 동일한 404로 응답한다.
10. source map, analytics, session replay, crash report, CSP 및 preload manifest를 disclosure scan 범위에 포함한다.

이 작업은 “보안 은닉”만으로 취급하지 않는다. 공급자명은 영업·운영 구성 정보이고, API key/권한 경계는 별도로 강제한다.

또한 기술적 비노출이 법적·계약상 고지를 대체하지 않는다. 개인정보 처리방침, subprocessor 목록 또는 고객 계약에서 공급자 고지가 필요하면 해당 채널에서는 정확히 고지하되, 일반 실행 API와 DevTools에 불필요하게 활성 구성을 노출하지 않는 것이 본 설계의 목적이다.

---

## 7. 단계별 구현 계획

### Phase 0 — 계약·회귀 fixture

- 현재 Network 노출 snapshot 작성: runtime config, stream, memory, usage, conversation payload, 오류.
- `hostedProviderDisclosureScan` 테스트 helper 작성 계획 확정.
- public response/body에서 금지할 문자열과 필드 목록 확정.
- rollout flag: `TEAMVER_HOSTED_PROVIDER_ABSTRACTION_ENABLED` 정의.
- v1 bundle 최대 cache 수명과 service worker eviction 정책 확정.
- provider별 endpoint 직접 probe baseline을 추가.

완료 조건: 코드 변경 전 baseline fixture가 실제 노출을 재현한다.

### Phase 1 — generic server endpoint

- daemon에 `ManagedChatAdapter`와 registry 도입.
- `/api/proxy/chat/stream` 추가.
- provider 선택 SSOT를 daemon private registry로 통합하고 design-api의 provider 해석 의존 제거.
- 인증, materialization, abort, complete-deck, tool loop, usage stage를 공통 handler로 추출.
- client routing 필드 거부.
- 공개 오류/usage sanitize.
- 기존 provider endpoint는 구 bundle migration 기간에만 유지하고 신규 hosted traffic은 받지 않는다.

완료 조건: generic endpoint만으로 기존 slide 생성·수정 흐름이 통과하고 response에 provider 식별자가 없다.

### Phase 2 — runtime config v2와 web transport

- design-api `/runtime-config/v2`가 generic transport/capabilities만 반환.
- web에 `teamver-managed` transport 도입.
- hosted는 generic endpoint 사용.
- AppConfig/pinned config/localStorage에서 actual provider/model/base URL 제거.
- 표시명과 `agent_id` 중립화.

완료 조건: 새 브라우저 세션의 Network와 storage에서 활성 provider가 명시되지 않는다.

### Phase 3 — side-channel 정리

- memory request에서 `chatProvider` 제거.
- browser usage에서 model/protocol 제거.
- server-authoritative billing으로 actual model 전달.
- conversation serialization과 diagnostics 중립화.
- provider 원문 error/details 제거.
- analytics/session replay/crash payload scrub.

완료 조건: 성공·실패·재시도·usage·대화 재조회 모든 경로의 disclosure scan 통과.

### Phase 4 — 호환 제거 및 선택적 branded build

- 구 runtime-config v1 consumer telemetry 확인 후 v1 필드 제거.
- hosted에서 old provider endpoint 호출 탐지/경고 후 **등록 해제 또는 uniform 404**.
- 필요 시 embed 전용 build에서 BYOK provider UI/module을 제외해 L2 달성.

완료 조건: 구버전 사용률 0, rollback window 종료, staging/production sign-off.

### 7.5 현재 구현 경계와 즉시 롤백

2026-10-13 현재 구현된 것은 Phase 1의 shadow API 기반뿐이다.

| 항목 | 상태 |
|---|---|
| 기존 `/api/proxy/minimax/stream` | 변경 없이 유지, web이 계속 사용 |
| 신규 `/api/proxy/chat/stream` | 별도 모듈, flag ON일 때만 등록 |
| web 호출 전환 | 미구현 |
| runtime-config v2 | 미구현 |
| 기존 endpoint 폐쇄 | 미구현 |
| 기본 배포값 | `TEAMVER_HOSTED_CHAT_API_ENABLED=0` |

즉시 롤백은 env에서 `TEAMVER_HOSTED_CHAT_API_ENABLED=0` 또는 미설정 후 daemon 재시작이다. 이 상태에서는 신규 route가 404이며 frontend 재배포가 필요 없다. 코드 롤백이 필요한 경우 shadow API 커밋만 revert하며, 기존 provider API contract에는 migration이나 데이터 변경이 없다.

---

## 8. 테스트 계획

### 8.1 정적 계약 테스트

- hosted stream request body에 `provider`, `apiProtocol`, `model`, `baseUrl`, `apiVersion`, `apiKey`가 없어야 한다.
- runtime config v2에 위 필드가 없어야 한다.
- hosted agent metadata가 `teamver-managed`/`Teamver AI`여야 한다.
- memory/usage body에 실제 provider/model이 없어야 한다.

### 8.2 daemon 통합 테스트

- generic endpoint가 server registry의 adapter/model/base URL을 사용한다.
- client가 provider/model/base URL을 보내면 400.
- identity가 없으면 provider-neutral 401/403.
- hosted의 모든 provider별 endpoint가 migration 후 동일한 404를 반환한다.
- upstream 4xx/5xx/stream error/atomic incomplete 모두 public payload가 중립적이다.
- internal logger와 billing stager에는 actual provider/model이 남는다.
- abort, tool loop, continuation, usage 합산이 기존 provider route와 동일하다.

### 8.3 브라우저 E2E

Playwright request/response collector로 다음 URL을 포함해 한 run 전체를 검사한다.

- runtime config
- stream
- memory extract
- usage event
- message persist/list

금지 패턴 예시:

```text
minimax
MiniMax-M3
api.minimax.io
minimax-api
TEAMVER_MINIMAX
```

검사는 URL, request body, response body, SSE frame, response header, localStorage, IndexedDB, visible diagnostics에 적용한다.

추가로 source map, loaded JS chunk, CSP, performance resource entry, analytics/session replay/crash report payload를 검사한다. L1에서는 “지원 가능한 공급자 문자열” 자체보다 **현재 active provider임을 증명하는 조합**(provider별 endpoint 성공, runtime model/base URL, active agent id)을 실패 조건으로 삼는다.

### 8.4 품질 회귀

provider 추상화는 슬라이드 품질 로직을 바꾸지 않아야 한다.

- 8~10장 요청의 slide count
- complete deck atomic gate
- template representative motif/style 유지
- retry/continuation 횟수
- first-token/total latency
- token usage와 billing 정합
- 기존 fixture의 layout/content quality score

### 8.5 번들 검사

L1 검증은 “활성 provider를 가리키는 runtime 값”을 대상으로 한다. L2 branded build를 선택하면 생성된 JS/source map 전체에서 금지 문자열을 검사하고, source map 배포 정책도 함께 검증한다.

---

## 9. 배포와 롤백

### 9.1 안전한 순서

1. daemon generic endpoint 배포(미사용 상태).
2. design-api `/runtime-config/v2`를 별도 contract로 배포(v1 유지).
3. web transport를 feature flag 1% canary로 활성화.
4. disclosure E2E와 품질/usage 지표 확인.
5. 10% → 50% → 100% 확대.
6. 호환 기간 후 runtime config v1과 hosted provider별 route 사용 중단.

### 9.2 롤백

- canary 기간에만 flag off 시 web이 기존 managed provider path로 복귀한다.
- generic endpoint와 adapter는 남겨도 기존 endpoint에 영향이 없어야 한다.
- billing schema는 actual model 필드를 계속 지원하므로 데이터 migration rollback이 필요 없어야 한다.

provider별 endpoint를 닫은 뒤에는 web flag만으로 되돌리지 않는다. daemon/BFF compatibility release를 함께 롤백해야 한다. 롤백은 provider 비노출을 일시 포기하는 것이므로 운영 승인과 시간 제한을 둔다.

---

## 10. 결정 사항

| 항목 | 결정 |
|---|---|
| URL만 generic alias로 변경 | 불충분, 채택하지 않음 |
| hosted provider 선택 위치 | daemon private registry |
| 공개 endpoint | `/api/proxy/chat/stream` |
| 공개 실행 식별자 | request에는 없음, runtime contract는 `managed-chat-v2` |
| browser actual model/protocol | 제거 |
| BYOK provider endpoint | standalone 유지, hosted migration 후 비활성 |
| billing actual model | server-only 유지 |
| provider 원문 error | browser에 비노출 |
| 기존 대화 metadata | role-aware projection 권장 |
| bundle 내 지원 provider 문자열 제거 | 별도 L2 옵션 |
| provider config SSOT | daemon only |
| runtime-config migration | 별도 v2 endpoint, v1 시한부 유지 |

---

## 11. 구현 전 확인할 질문

1. 일반 workspace 사용량 화면에서 실제 모델명을 보여주는 제품 요구가 있는가? 없다면 logical SKU로 즉시 전환한다.
2. standalone BYOK UI를 hosted build에서도 제공해야 하는가? 아니면 embed 전용 build로 L2까지 갈 것인가?
3. runtime config v1 구버전 bundle의 최대 cache 수명은 얼마인가?
4. 운영자 diagnostics를 어느 권한/API에서 제공할 것인가?
5. provider failover를 동일 run 안에서 허용할 것인가? 허용한다면 billing과 품질 추적은 adapter attempt 단위로 기록해야 한다.
6. 개인정보·subprocessor 정책상 공급자 고지가 필요한 범위와 담당 채널은 무엇인가?

이 여섯 항목 중 1~3과 6을 확정한 뒤 Phase 0 구현에 들어가는 것이 안전하다.
