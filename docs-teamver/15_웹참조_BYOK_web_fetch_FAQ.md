# Design embed — 웹 참조(URL) · BYOK `web_fetch` FAQ

**작성:** 2026-06-22  
**목적:** “www.teamver.com 내용으로 슬라이드 만들어줘” 같은 **URL 기반 웹 참조**를 Design embed(BYOK)에서 어떻게 넣을지, Main Teamver 채팅의 web search와 무엇이 다른지, **왜 daemon 패치가 필요한지**를 한 문서에 정리한다.  
**후속 질문·오해하기 쉬운 지점**도 함께 적어 둔다.

**관련 (Teamver):**

| 문서 | 내용 |
|------|------|
| [13 embed 슬라이드 MVP](./13_embed_슬라이드_MVP_기능게이트.md) | deck-only embed 범위 |
| [06 Docs/Slides형 연동](./06_Docs슬라이드형_연동.md) | design-api · Main BE 관계 |
| [10 세션·OD패치](./10_세션·OD패치_보강.md) | embed · runtime-config · upstream 패치 |

**관련 (minimax-byok 포크 — 구현 레퍼런스):**

| 문서 | 내용 |
|------|------|
| `opendesign-minimax-byok/docs/07-url-fetching.md` | `web_fetch` 도구 · SSRF · HTML→text |
| `opendesign-minimax-byok/docs/08-system-prompt.md` | `BYOK_TOOLS_OVERRIDE` vs `API_MODE_OVERRIDE` |
| `opendesign-minimax-byok/docs/01-overview.md` | CLI 패스 vs BYOK 프록시 패스 |

**관련 (Main Teamver 채팅):**

| 문서 | 내용 |
|------|------|
| `ns-teamver-be/docs/54_웹_참조_채팅_통합_기획.md` | GPT/Claude/Gemini **벤더 native web search** |
| `ns-teamver-be/docs/모델별_web_search_비교.md` | 벤더별 search vs fetch 차이 |

---

## 1. 한 줄 결론

> Design embed에서 “**사용자가 준 URL**을 읽어 슬라이드를 만든다”는 목표는, Main Teamver 채팅의 **`use_web_search`(벤더 web search)** 와 **다른 문제**이며, 현재 `ns-open-design` BYOK 경로에는 URL 읽기 capability가 **없다**.  
> **API 파라미터만으로는 켤 수 없고**, daemon에 **`web_fetch` tool + BYOK tool loop + 시스템 프롬프트 수정**이 필요하다 (레퍼런스: minimax-byok doc 07·08).

---

## 2. 니즈 플로우 (목표 UX)

사용자 입력 예:

> “https://www.teamver.com/ 내용 기반으로 제품 소개 슬라이드 10장 만들어줘.”

기대 동작:

```text
사용자(URL 포함 프롬프트)
  → embed FE (managed BYOK, deck 템플릿)
  → OD daemon /api/proxy/.../stream
  → LLM이 web_fetch(url) tool call
  → daemon이 HTTP GET (SSRF 가드) → HTML→text
  → LLM이 본문 + deck skill/template로 HTML 슬라이드 생성
  → FE 미리보기 · Drive publish
```

---

## 3. 두 스택 비교 — Main Teamver 채팅 vs Design embed

| | **Main Teamver 채팅** (`ns-teamver-be`) | **Design embed** (`ns-open-design` daemon) |
|--|----------------------------------------|---------------------------------------------|
| 진입 | `POST /api/v2/chat` | FE → daemon `/api/proxy/{provider}/stream` |
| LLM 설정 | Main BE 모델별 클라이언트 | `runtime-config` (protocol, baseUrl, model, apiKeyConfigured; **apiKey 비반환**) |
| 웹 참조 방식 | **벤더 native web search** (Responses API, Anthropic server tool, Gemini grounding) | (현재) **없음** · (계획) daemon **`web_fetch`** |
| 사용자 스위치 | `ChatDTO.use_web_search` | (현재) 없음 |
| 구현 위치 | `avang/gpt/aichat_v2.py`, `aichat_claude.py` 등 | `apps/daemon` BYOK tool loop |

**같은 Teamver 제품이어도 채팅 앱과 Design embed는 HTTP·과금·도구 스택이 분리**되어 있다. Main BE에 web search가 있다고 embed에 자동으로 따라오지 **않는다**.

---

## 4. web search vs URL fetch — 자주 혼동하는 부분

| | **벤더 web search** | **daemon `web_fetch`** |
|--|----------------------|-------------------------|
| 입력 | 검색어 (모델이 생성) | **사용자가 준 정확한 URL** |
| 동작 | 검색엔진·벤더 인프라가 여러 소스 조회 | daemon이 **그 URL** HTTP GET |
| 적합한 질문 | “최근 ○○ 뉴스 알려줘” | “**이 페이지** 내용으로 슬라이드” |
| Main Teamver | ✅ `use_web_search` | ❌ (별도) |
| minimax-byok 설계 | 대체 목적 아님 | ✅ doc 07 |

**web search만 켜도** `www.teamver.com` **전체 본문**이 안정적으로 들어온다고 보기 어렵다 (스니펫·랭킹 결과 수준).  
“특정 URL 슬라이드” 니즈에는 **URL fetch** 쪽이 더 직접적이다.

---

## 5. 현재 코드 상태 (`ns-open-design`)

| 항목 | 상태 | 근거 |
|------|------|------|
| BYOK `web_fetch` 도구 | ✅ 구현 (loop 184) | `byok-url-tools.ts` · `byok-tools.ts` · senseaudio/aihubmix proxy |
| `executeOneTool` | ✅ 4-tool 화이트리스트 | `chat-routes.ts` — `web_fetch` 디스패치 |
| BYOK 시스템 프롬프트 | ✅ `BYOK_TOOLS_OVERRIDE` | `byokToolNames` + `ProjectView` · contracts/daemon `system.ts` |
| `runtime-config` web 플래그 | ❌ 없음 (선택) | `od_runtime_config.py` — protocol/model/baseUrl + apiKeyConfigured만 공개, apiKey는 비반환 |
| FE `WebFetchCard` UI | ✅ 호출 경로 연결 | tool event + 기존 `ToolCard` |
| minimax-byok 레퍼런스 | ✅ 포크 설계·이식 완료 | doc 07·08 |

**staging 주의:** `TEAMVER_OD_API_PROTOCOL=anthropic` 단독 base stream은 **tool loop 없음** → URL 읽기 불가. tool loop 프로토콜·모델로 전환 필요 (아래 Q6 · `.env.staging.example`).

---

## 6. FAQ — 대화에서 나온 질문 + 후속으로 나올 만한 질문

### Q1. 웹 패치는 별도 FE 구현인가? API 파라미터만으로 가능한가?

**A:** URL 읽기의 **핵심은 daemon(백엔드) 패치**다. FE는 기존 tool 카드(`WebFetchCard`)로 대부분 커버 가능.

- `runtime-config`는 today **공개 가능한 LLM 실행 선호값만** 넘긴다 (`apiProtocol`, `baseUrl`, `model`, `apiKeyConfigured`). 실제 `apiKey`는 브라우저 Network 응답에 반환하지 않는다.
- `enableWebFetch: true` 같은 플래그를 **나중에** 넣을 수는 있으나, **실행 코드 없이는 의미 없다**.
- 순서: **daemon `web_fetch` 이식 → env/runtime으로 프로토콜·모델 맞춤 → (선택) API 게이트**.

---

### Q2. Main Teamver 채팅처럼 “각 AI 모델 API의 web search tool” 쓰면 되지 않나?

**A:** **개념적으로 비슷**(모델이 tool로 웹 정보를 참조)하지만 **같은 구현이 아니다**.

Main Teamver:

- OpenAI **Responses API** + `web_search` tool
- Anthropic **Messages** + server-side `web_search`
- Gemini **google_search** / grounding  
→ Main BE가 **모델별로** 요청을 조립한다.

Design BYOK:

- MiniMax 등은 OpenAI 호환 **`chat/completions` + custom tools** 루프
- OD daemon이 **`generate_image`처럼 `web_fetch` executor**를 직접 실행
- 벤더가 “web search” API를 제공해도, **현 BYOK proxy 와이어에 그대로 꽂혀 있지 않음**

---

### Q3. 벤더 web search API를 Design BYOK에 그대로 못 쓰는 거야?

**A:** **원칙적으로는 가능**하지만, minimax-byok 1차안이 `web_fetch`인 이유는 실용적이다.

| 장벽 | 설명 |
|------|------|
| 프로토콜 불일치 | OpenAI web search ↔ Responses API; BYOK ↔ chat completions tool loop |
| 벤더별 분기 | Main BE 수준의 `AiChatV2` / `AiChatClaude` / Gemini 분기를 **OD daemon에도** 새로 만들어야 함 |
| MiniMax | doc 기준 OpenAI-shape **custom tool** 경로; native web search 표준 연동 불명확 |
| 목적 차이 | web search = 검색; 니즈 = **지정 URL 본문** |

**“못 쓴다”기보다 “BYOK embed 1차에 가장 싸고 portable한 해법이 daemon fetch tool”** 이라고 보면 된다.

---

### Q4. 특정 URL을 읽으려면 꼭 `web_fetch` 방식이어야만 하나?

**A:** **아니다.** 대안은 있다. embed + managed BYOK 조합에서 **trade-off**만 다르다.

| 방식 | 설명 | embed BYOK 적합도 |
|------|------|-------------------|
| **daemon `web_fetch`** (doc 07) | LLM tool call → daemon GET → tool result | ✅ **1차 권장** |
| 벤더 native web search | Main BE와 동일 패턴을 daemon에 이식 | △ 프로토콜·모델별 작업 큼 |
| **선-fetch 후 프롬프트 주입** | daemon/FE가 URL fetch 후 user message에 본문 첨부 | ✅ tool loop 없이 가능; 토큰·UX 설계 필요 |
| **Main BE가 fetch → Design에 전달** | BFF/M2M으로 본문 전달 | ✅ 가능; **cross-service** 설계 추가 |
| CLI `WebFetch` | `mode: daemon` + claude/codex | △ embed는 managed **API(BYOK)** 고정 |

---

### Q5. 그럼 결국 daemon 소스를 수정해야 하는 거 맞지?

**A:** **맞다** (BYOK embed 경로 기준).

필수 daemon 작업 (minimax-byok doc 07·08 이식):

1. `byok-url-tools.ts` — SSRF, timeout, 100KB cap, HTML→text  
2. `byok-tools.ts` — `web_fetch` tool 정의 + `executeWebFetch`  
3. `chat-routes.ts` — `executeOneTool` 4-tool, `buildToolResultContent`, tool loop  
4. `prompts/system.ts` (+ contracts) — `byokToolNames` → **`BYOK_TOOLS_OVERRIDE`** (`WebFetch unavailable` 제거)

FE는 **필수 대규모 패치 아님** (tool UI·deck 템플릿 ON 정도).

---

### Q6. staging env만 바꾸면 되나? (`TEAMVER_OD_API_*`)

**A:** **코드 이식 후**에만 의미 있다.

- `TEAMVER_OD_API_PROTOCOL` — **tool loop 지원** 프로토콜 (예: `aihubmix`, `senseaudio`; minimax 라우트 추가 시 해당 값)  
- `TEAMVER_OD_API_MODEL` — tool call 지원 모델  
- **`anthropic` 단독 base stream** — text-only; **`web_fetch` 없음**

설정 예 (개념):

```bash
TEAMVER_OD_API_PROTOCOL=aihubmix   # 또는 senseaudio / (minimax 등록 후) minimax
TEAMVER_OD_API_BASE_URL=...
TEAMVER_OD_API_MODEL=MiniMax-M3    # tool loop 지원 모델
TEAMVER_OD_API_KEY=...
```

---

### Q7. CLI 에이전트(claude/codex)로 돌리면 URL 읽기 되지 않나?

**A:** **된다.** Open Design **CLI 에이전트 패스**는 내장 `WebFetch`를 쓴다.

| 패스 | 트리거 | URL 읽기 |
|------|--------|----------|
| CLI 에이전트 | `mode: daemon` + agentId | CLI `WebFetch` |
| BYOK 프록시 | embed `lockExecutionConfig` + managed API | **daemon-side tool만** |

Teamver embed 1차는 **managed BYOK(API) 고정**이라 CLI 패스와 무관하다.

---

### Q8. teamver.com 같은 SPA(Next.js) 페이지는 잘 읽히나?

**A:** **항상 보장되지 않는다.**

- `web_fetch`는 **서버가 받은 HTML**을 파싱한다.  
- JS 렌더 SPA는 **빈 shell**만 올 수 있다 (hallmark `study.md`, doc 07과 동일 이슈).  
- 실패 시: 사용자에게 **본문 붙여달라** / 스크린샷 fallback — doc 07·skill 쪽 정책 참고.

---

### Q9. 보안·제한은?

| 항목 | 정책 (doc 07) |
|------|----------------|
| SSRF | loopback, RFC1918, metadata IP 차단; redirect 차단 |
| 스킴 | http(s)만 |
| 크기 | ~100KB cap |
| 시간 | ~12s timeout |

---

### Q10. Main Teamver web search와 Design URL fetch를 **하나로 통합**할 수 있나?

**A:** 장기적으로 가능. 단기 embed MVP에는 **범위 밖**에 가깝다.

| 통합안 | 설명 |
|--------|------|
| A. OD daemon `web_fetch` | embed 자체 완결 · Main BE 변경 최소 |
| B. Main BE fetch API → Design | “URL 본문 조회” M2M; Design은 프롬프트만 |
| C. Design BYOK에 벤더 web search 이식 | Main BE doc 54 수준의 **모델별** daemon 작업 |

**1차 슬라이드 MVP**에는 **A**가 doc·포크와 정합성이 가장 높다.

---

## 7. 구현 로드맵 (권장 순서)

| # | 작업 | 성격 |
|---|------|------|
| 1 | minimax-byok **doc 07·08** → `ns-open-design` daemon 이식 | **필수 코드** |
| 2 | staging `TEAMVER_OD_API_*` — tool loop 프로토콜·모델 | **설정** |
| 3 | embed deck 템플릿·skill ON ([13](./13_embed_슬라이드_MVP_기능게이트.md)) | **게이트** |
| 4 | E2E: “teamver.com URL → deck HTML” smoke | **검증** |
| 5 | (선택) `runtime-config.features.webFetch` | **API 게이트** |
| 6 | (선택) Main BE 연동 fetch | **아키텍처 확장** |

---

## 8. 코드·설정 SSOT

| 영역 | 경로 |
|------|------|
| runtime-config (managed BYOK) | `deploy/teamver/be/app/services/od_runtime_config.py` |
| BYOK proxy · tool loop | `apps/daemon/src/chat-routes.ts` |
| BYOK tools | `apps/daemon/src/byok-tools.ts` |
| 시스템 프롬프트 | `apps/daemon/src/prompts/system.ts`, `packages/contracts/src/prompts/system.ts` |
| embed 실행 고정 | `apps/web/src/teamver/branding/config.ts` (`lockExecutionConfig`) |
| FE tool UI | `apps/web/src/components/ToolCard.tsx` (`WebFetchCard`) |
| minimax-byok 레퍼런스 | `opendesign-minimax-byok/docs/07-url-fetching.md` |

---

## 9. 용어 정리

| 용어 | 의미 |
|------|------|
| **web search** | 벤더 검색 tool — 쿼리 기반, Main Teamver `use_web_search` |
| **web_fetch** | OD BYOK custom tool — **지정 URL** HTTP fetch (daemon 실행) |
| **WebFetch** | CLI 에이전트 내장 도구명 — BYOK `web_fetch`와 **다름** |
| **BYOK 프록시 패스** | `mode: api` — daemon이 LLM API + server-side tool loop |
| **CLI 에이전트 패스** | `mode: daemon` — 로컬 CLI spawn + CLI 도구 |

---

## 10. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-06-22 | 초안 — embed URL 참조 FAQ, Main BE web search 대비, minimax-byok `web_fetch` 정리 |
| 2026-06-19 | loop 184 — §5 코드 상태 ✅ 갱신, staging anthropic vs tool loop 주의 |
