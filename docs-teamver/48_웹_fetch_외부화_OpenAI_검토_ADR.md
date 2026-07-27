# Design embed — 웹 fetch 외부화 검토 (OpenAI web search vs 자체 fetch)

**문서 번호:** 48  
**작성:** 2026-07-27 (KST)  
**상태:** **ADR (Accepted 방향)** — “OpenAI로 전면 대체”는 **기각**, “daemon 계약 유지 + fetch 백엔드 교체/단계적 vendor tool”은 **채택**  
**목적:** Design embed에서 반복되는 **web fetch / 선-fetch / `<web-fetch-context>`** 이슈를 “직접 크롤 구현을 OpenAI API로 바꾸자”는 제안 관점에서 **기획·구현·운영**을 한 문서에 정리하고, **의사결정 근거**와 **로드맵**을 SSOT로 둔다.

## 변경 이력

| 일시 (KST) | 변경 내용 |
|------------|-----------|
| 2026-07-27 16:00 | v1.0 초안 — OpenAI web search 대체 검토, 현재 아키텍처, 비교표, ADR, Phase 로드맵 |
| 2026-07-27 16:35 | v1.1 — Phase 2 POC 착수·병합 반영 (§8 체크리스트 상태 갱신, [48-1 설계](./48-1-구현설계-webfetch-adapter.md)/[48-1 현황](./48-1-구현현황-webfetch-adapter.md) 상호 링크) |

**관련 SSOT**

| 문서 | 역할 |
|------|------|
| [15 웹참조 BYOK web_fetch FAQ](./15_웹참조_BYOK_web_fetch_FAQ.md) | **현재 구현** · FAQ · 선-fetch 주입 · BYOK tool loop |
| [29 BYOK api mode vs runs](./29_BYOK_api_mode_vs_runs_아키텍처.md) | API 모드 스트림 · tool loop 부재 |
| [36 BFF auth refresh 401](./36_BFF_auth_refresh_401_정리.md) | prefetch와 auth refresh 엮임 이슈 맥락 |
| `ns-teamver-be/docs/54_웹_참조_채팅_통합_기획.md` | Main 채팅 **벤더 native web search** |
| `ns-teamver-be/docs/모델별_web_search_비교.md` | GPT / Claude / Gemini search vs fetch |
| OpenAI [Web search 가이드](https://developers.openai.com/api/docs/guides/tools-web-search) | Responses API `web_search` hosted tool |

**코드 앵커 (ns-open-design)**

| 구성요소 | 경로·엔드포인트 |
|----------|----------------|
| SSRF-safe fetch 코어 | `apps/daemon` — `byok-url-tools.ts` (`fetchUrlContent`) |
| BYOK tool | `byok-tools.ts` — `web_fetch` / `executeWebFetch` |
| API 모드 선-fetch HTTP | `POST /api/tools/web-fetch` |
| FE URL 감지·주입 | `apps/web` — `api-web-fetch-context.ts` |
| 프롬프트 규칙 | `packages/contracts/src/prompts/system.ts` — `<web-fetch-context>` |

---

## 1. 배경 — 왜 “fetch 이슈”가 계속 보이는가

### 1.1 사용자 니즈 (불변)

대표 입력:

> `www.teamver.com 참고해서 제품 소개 슬라이드 만들어줘`

기대:

1. 사용자가 **지정한 URL(들)** 의 본문·구조·톤을 참고한다.
2. Design(deck/slide) 생성 파이프라인으로 **HTML 덱**을 만든다.
3. “API 모드라 웹을 읽을 수 없다” 같은 **허위 거절**이 없어야 한다.

이 니즈는 Main Teamver 채팅의 **“최신 뉴스 검색”** 과 **다르다**. [15 §4](./15_웹참조_BYOK_web_fetch_FAQ.md) — **정확한 URL fetch** vs **검색어 web search**.

### 1.2 제안 (검토 대상)

> 패치·크롤·HTML→text를 우리가 직접 하지 말고, **OpenAI API의 web fetch(실무상 `web_search` hosted tool)** 로 대체하자.

### 1.3 실제 장애·불만의 층 (2026-07 기준)

| 층 | 증상 | OpenAI 전환만으로 해결? |
|----|------|-------------------------|
| **A. 통합·부하** | 선-fetch가 workspace header / BFF auth refresh와 엮여 401·지연 | ❌ (호출 경로 격리 필요 — [15 §0](./15_웹참조_BYOK_web_fetch_FAQ.md), `skipTeamverWorkspaceHeaders` 등) |
| **B. 프롬프트·모델 행동** | `<web-fetch-context>`가 있는데도 “WebFetch unavailable”·“접근 불가” 응답 | ❌ (contracts/daemon prompt 정합 — [15 §0](./15_웹참조_BYOK_web_fetch_FAQ.md)) |
| **C. 프로토콜 분기** | managed **Anthropic** stream은 tool loop 없음; BYOK 일부만 `web_fetch` loop | △ (OpenAI Responses는 **별 프로토콜** — §4) |
| **D. 크롤 품질** | JS 렌더 SPA, 봇 차단, 빈 본문, 100KB cap | △ (hosted search/reader가 나을 **수 있음**) |
| **E. 보안·정책** | SSRF, redirect, private IP | △ (외부 SaaS로 **통제 지점 이동**) |

**결론:** 이슈 상당수는 **“크롤 라이브러리”** 가 아니라 **A~C (제품 wiring)** 이다. OpenAI로 fetch만 옮겨도 A~C는 남거나, **새로운 프로토콜·벤더 lock-in** 비용이 생긴다.

---

## 2. 현재 아키텍처 (Design embed SSOT)

### 2.1 두 경로

```mermaid
flowchart TB
  subgraph user [User]
    P[Prompt with URL]
  end

  subgraph fe [apps/web embed]
    DET[URL extract max 3]
    PRE[fetchApiWebFetchContexts]
    INJ["Append web-fetch-context to user turn"]
    RUN[POST proxy stream]
  end

  subgraph daemon [OD daemon]
    WF["POST /api/tools/web-fetch"]
    FU[fetchUrlContent SSRF HTML to text]
    LOOP[BYOK chat tool loop web_fetch]
    PROXY["/api/proxy/{provider}/stream"]
  end

  P --> DET
  DET --> PRE
  PRE --> WF
  WF --> FU
  FU --> INJ
  INJ --> RUN
  RUN --> PROXY

  P --> RUN
  RUN --> LOOP
  LOOP --> FU
```

| 경로 | 언제 | 특징 |
|------|------|------|
| **선-fetch + 주입** | Teamver managed **Anthropic** 등 **tool loop 없는** API 모드 | FE가 **결정론적으로** URL 본문을 user turn에 넣음 |
| **BYOK tool loop** | `aihubmix`, `senseaudio` 등 loop 연결 프로토콜 | 모델이 **`web_fetch` tool call** → daemon 실행 |

### 2.2 선-fetch 계약 (요약)

- **입력:** 사용자 프롬프트에서 추출한 public http(s) URL (최대 3개).
- **실행:** daemon `POST /api/tools/web-fetch` — timeout, size cap, SSRF, redirect 정책은 BYOK `web_fetch`와 **동일 코어**.
- **출력:** 현재 user message에만 `<web-fetch-context>` 블록 (status, url, text 또는 failure reason).
- **실패:** fetch 실패만 컨텍스트에 실리고 **채팅 run 자체는 진행** (best-effort).
- **프롬프트:** block이 있으면 모델은 **이미 fetch된 text**를 쓰고 “URL 접근 불가”로 **일반화해 거절하지 말 것**.

### 2.3 Main Teamver 채팅과의 분리

| | Main (`ns-teamver-be`) | Design embed (`ns-open-design`) |
|--|------------------------|----------------------------------|
| 진입 | `POST /api/v2/chat` | FE → daemon proxy stream |
| 웹 | **벤더 native web search** (Responses, Claude tool, Gemini grounding) | **URL fetch** + (일부) **daemon web_fetch** |
| 스위치 | `ChatDTO.use_web_search` | (embed) 별도 UI 스위치 없음 — URL 있으면 선-fetch |

Main에 web search가 있어도 Design embed에 **자동 전파되지 않음** ([15 §3](./15_웹참조_BYOK_web_fetch_FAQ.md)).

---

## 3. OpenAI “web fetch”가 실제로 의미하는 것

### 3.1 공식 surface (2026-07)

OpenAI는 Design FAQ에서 말하는 **“사용자 URL을 GET해서 전문을 넣는다”** 와 1:1 대응하는 단일 API를 문서화하지 않는다. 실무에서 말하는 **OpenAI web fetch**는 주로:

| API | Tool | 동작 요약 |
|-----|------|-----------|
| **Responses API** | `{ "type": "web_search" }` | 모델이 **검색 필요**를 판단 → hosted search → 인용·sources |
| (legacy) | `web_search_preview`, Chat Completions search 모델 | 신규 통합은 **Responses + web_search** 권장 |

참고: [Using tools — web search](https://developers.openai.com/api/docs/guides/tools), [Web search guide](https://developers.openai.com/api/docs/guides/tools-web-search).

### 3.2 web_search의 action 모델 (개념)

Responses API reference상 web search call은 대략:

- `search` — 쿼리 기반 검색
- (reasoning 계열) `open_page`, `find_in_page` — 페이지 탐색·패턴 검색

즉 **“검색 + 선택적 페이지 열기”** 에 가깝고, Design이 필요로 하는 **“사용자가 적은 URL N개를 반드시 선-fetch”** 와 **계약이 다르다**.

### 3.3 OpenAI web_search — 장점

- JS-heavy·anti-bot 페이지에서 **자체 `fetch`+cheerio/text 추출**보다 성공률이 높을 **수 있음**
- 최신 정보·**인용(sources)** · `allowed_domains` 필터 등 **운영 기능** 내장
- 앱이 크롤러·브라우저 풀을 **직접 운영하지 않음**

### 3.4 OpenAI web_search — Design 관점 리스크

| 리스크 | 설명 |
|--------|------|
| **URL 고정 fetch 비보장** | 모델이 search를 **안 부를 수 있음**; 검색 결과가 사용자 URL과 **다를 수 있음** |
| **프로토콜 불일치** | staging 기본 **Anthropic managed stream** ≠ OpenAI Responses; **전면 대체 = 라우팅 재설계** |
| **비용·지연** | search tool + (often) multi-step; turn당 선-fetch 1~3 URL 패턴과 **과금 단위 상이** |
| **데이터 거주·컴플라이언스** | 고객 URL·페이지 본문이 OpenAI(및 grounding 파트너)로 — 엔터프라이즈/온프레미스 Design과 충돌 가능 |
| **멀티 벤더** | Anthropic/Google/BYOK 혼용 제품에서 **OpenAI-only 해법은 1차 경로가 될 수 없음** |
| **디버깅** | “왜 이 URL 본문이 비었는가”가 **우리 daemon 로그**가 아니라 **vendor tool call** 안에 묶임 |

---

## 4. 옵션 비교 (의사결정 표)

### 4.1 후보

| ID | 이름 | 요약 |
|----|------|------|
| **O0** | **현행 유지 + wiring 강화** | `fetchUrlContent` + 선-fetch + prompt; A~C 계속 수리 |
| **O1** | **OpenAI Responses `web_search`로 전면 대체** | Design run을 OpenAI Responses 중심으로; 자체 fetch 제거 |
| **O2** | **Reader/Crawl SaaS adapter** | `POST /api/tools/web-fetch` **계약 유지**, 내부만 Jina/Firecrawl/Browserless 등 |
| **O3** | **Main BE web capability BFF** | Main이 이미 쓰는 벤더 search/fetch를 Design 전용 **“URL→text”** API로 노출 |
| **O4** | **Managed Anthropic (+α) native tool loop** | proxy stream에 tool loop 부착 — FAQ “장기 선택지” |

### 4.2 니즈별 적합도

| 니즈 | O0 | O1 | O2 | O3 | O4 |
|------|----|----|----|----|-----|
| **정확한 URL 본문 (슬라이드)** | ◎ | △ | ◎ | △~◎ | ◎ |
| **managed Anthropic 기본 경로** | ◎ | ✗ | ◎ | ◎ | ◎ |
| **SSRF·allowlist 통제 (daemon)** | ◎ | △ | ◎ | △ | ◎ |
| **크롤 품질 (SPA)** | △ | ○~◎ | ◎ | ○ | △~◎ |
| **멀티 provider BYOK** | ◎ | ✗ | ◎ | ○ | ○ |
| **구현·롤백 비용** | ◎ | ✗ | ○ | △ | △ |
| **“최신 뉴스 검색”** | △ | ◎ | △ | ◎ | ○ |

범례: ◎ 적합 · ○ 부분 · △ 주의 · ✗ 부적합

### 4.3 OpenAI 전면 대체(O1)가 기각되는 이유 (한 줄)

> Design 1차 UX는 **“사용자 URL → deterministic prefetch → `<web-fetch-context>`”** 이고, OpenAI `web_search`는 **“모델 판단 검색”** 이며, **현 기본 inference 경로(Anthropic proxy)와 API 표면이 다르다.**

---

## 5. ADR — 채택 방향

### 5.1 Decision

| 항목 | 결정 |
|------|------|
| **OpenAI web_search로 자체 fetch 전면 대체** | **No** (O1 기각) |
| **단기 SSOT** | **O0** — 선-fetch + prompt + auth prefetch 격리 ([15 §0](./15_웹참조_BYOK_web_fetch_FAQ.md)) |
| **중기 (크롤 품질·운영)** | **O2** — `fetchUrlContent` **뒤에 adapter**; env로 `native` / `reader_saas` 선택 |
| **선택적** | **O3** — Main과 중복 투자 vs 통합 BFF는 **별 ADR** (조직·보안 경계 확인 후) |
| **장기** | **O4** — managed Anthropic tool loop; 선-fetch와 **역할 분담** 재정의 |

### 5.2 유지 불변식 (Invariants)

1. **FE↔daemon 계약:** `POST /api/tools/web-fetch` 요청/응답·`<web-fetch-context>` XML 형태는 **외부 노출 API**로 취급 (adapter 교체 시에도 유지).
2. **SSRF:** 최종 fetch URL은 **항상 daemon 정책**을 통과 (SaaS adapter도 allowlist·blocklist 연동).
3. **프로토콜 정직성:** tool loop **없는** proxy에는 prompt가 **“web_fetch tool 호출 가능”** 이라고 말하지 않음 (`byokChatToolNamesForProtocol()` — [00 누적 2026-07-03](./00_구현_내역_누적.md)).
4. **실패 허용:** fetch 실패가 **run 전체를 막지 않음**; failure reason만 context.

### 5.3 OpenAI를 쓸 수 있는 **좁은** 자리 (Optional)

다음 **모두** 만족할 때만 `web_search` 검토:

- runtime-config `protocol=openai` (또는 OpenAI Responses BYOK)
- 니즈가 **검색·최신 정보** 위주 (URL 고정 슬라이드 1차 UX 아님)
- 데이터 외부 전송·과금이 **고객 계약상 허용**

구현 형태: daemon OpenAI Responses proxy path에 `tools: [{ type: "web_search" }]` — **선-fetch 주입과 병렬**이 아니라 **대체 경로**로 문서화.

---

## 6. 로드맵 (Phase)

### Phase 0 — 관측·분류 (진행 중)

**목표:** “fetch broken” 리포트를 **A~E 층**으로 분류.

| 체크 | 방법 |
|------|------|
| 선-fetch 호출됨 | Network: `POST /api/tools/web-fetch` (채팅 전) |
| auth noise 없음 | 동 호출에 `/teamver-bff/auth/refresh` **연쇄 없음** |
| context 주입됨 | request body / persist snapshot에 `<web-fetch-context>` |
| 모델 거절 | assistant가 “API 모드라 읽을 수 없음” **금지** (prompt regression test) |
| 본문 품질 | text length, title, status=failed reason |

**테스트 SSOT:** `apps/web/tests/api-web-fetch-context.test.ts`, `HomeView`·prefill 관련 회귀.

### Phase 1 — Wiring 안정화 (P0, O0)

- [15 §0](./15_웹참조_BYOK_web_fetch_FAQ.md) 항목 유지·회귀 테스트
- staging smoke: `www.teamver.com 참고해서 슬라이드…` ([15 §0 “다음 추천 작업”](./15_웹참조_BYOK_web_fetch_FAQ.md))

### Phase 2 — Fetch backend adapter (P1, O2)

**설계 스케치 (구현 전)**

```text
fetchUrlContent(url, options)
  → if WEB_FETCH_BACKEND=native: existing HTTP+HTML→text
  → if WEB_FETCH_BACKEND=reader: POST Reader SaaS with url, map to { text, title, status }
  → same SSRF gate before outbound
  → same 100KB (or configured) cap at merge
```

| 항목 | 권장 |
|------|------|
| Config | `WEB_FETCH_BACKEND`, `WEB_FETCH_READER_URL`, `WEB_FETCH_READER_API_KEY` |
| Fallback | reader 실패 시 **native 1회** (optional flag) |
| 로그 | `url`, `backend`, `duration_ms`, `bytes`, `status` — **본문 미로그** (PII) |

**후보 SaaS (평가만, 벤더 lock-in 전 POC)**

- Jina Reader, Firecrawl, Browserless 등 — **SPA·markdown 품질** POC로 비교

### Phase 3 — Vendor tool loop (P2, O4 / 선택 O1)

- managed Anthropic stream에 tool loop + (vendor가 제공하는) web tool
- 또는 OpenAI Responses dedicated route for **search-heavy** SKUs only

### Phase 4 — Main BFF (optional O3)

- Design이 Main BE를 호출하는 **cross-stack** — SSO, usage 귀속, latency, blast radius 검토 필요
- [06 Docs/Slides형 연동](./06_Docs슬라이드형_연동.md) · [41 Drive 인증](./41_Design_Drive_인증_계약_권고.md)과 **동일한 “경계 문서”** 수준으로 설계

---

## 7. OpenAI vs 자체 fetch — FAQ

### Q1. “OpenAI web fetch 쓰면 auth refresh 이슈도 사라지나?”

**아니다.** refresh 잡음은 **FE→daemon prefetch가 BFF/session 루틴을 탔기 때문**이다. fetch 실행 주체가 OpenAI여도 **선-fetch를 호출하는 FE 경로**는 남거나, OpenAI 호출을 **어디서** 하느냐에 따라 **새로운** auth·키 관리가 생긴다.

### Q2. “web search 켜면 teamver.com 전문이 들어오지 않나?”

**보장되지 않는다.** search는 **쿼리·랭킹·스니펫** 중심이다. “이 URL 전체” 니즈는 [15 §4](./15_웹참조_BYOK_web_fetch_FAQ.md) 표와 동일.

### Q3. “그럼 OpenAI는 언제 쓰나?”

Main 채팅 **`use_web_search`**, 또는 Design에서 **protocol=openai** + **검색형** 워크플로를 **의도적으로** 팔 때. URL 슬라이드 1차 UX의 **대체재가 아님**.

### Q4. “직접 크롤이 너무 고통스럽다”

**O2 adapter**가 OpenAI 전면보다 **낮은 리스크**다. FE·prompt·`<web-fetch-context>` **불변** 유지.

### Q5. BYOK `web_fetch` tool loop는?

**유지.** `aihubmix` / `senseaudio`에서 모델 주도 fetch; API 모드 선-fetch와 **prompt 규칙 공유** ([15 §0](./15_웹참조_BYOK_web_fetch_FAQ.md)).

---

## 8. 구현 체크리스트 (Phase 2 착수 시)

**상태:** POC 코드 병합 완료 (`feat/web-fetch-adr` · 커밋 `465386ece`→`f373bebba`). staging 실 스위치 · SaaS 실계약은 별도 ops task. 자세한 설계·현황은 [48-1 구현설계](./48-1-구현설계-webfetch-adapter.md) · [48-1 구현현황](./48-1-구현현황-webfetch-adapter.md).

- [x] `WEB_FETCH_BACKEND` env + daemon 단일 진입점 — `apps/daemon/src/web-fetch/{core,select,backend,native-backend,reader-backend}.ts`
- [x] SSRF regression — 원본 URL 은 `assertExternalAssetUrl` 통과, reader endpoint 는 부트 시 https + 사설 IP literal 거부
- [x] contracts test — `<web-fetch-context>` 규칙 unchanged (`apps/daemon/tests/byok-url-tools.test.ts` 무수정 통과)
- [x] 신규 회귀 — `web-fetch-select.test.ts` (9) + `web-fetch-reader-backend.test.ts` (7) all green
- [ ] Reader SaaS POC 실측: teamver.com, SPA landing, bot-block 페이지 3종 (ops smoke — staging enable 후)
- [ ] 비용 모니터링 — fetch당 outbound + SaaS billing (ops task)
- [ ] [04 구현 우선순위](./04_구현_우선순위.md) L-472/L-473과 **상태 동기화**

---

## 9. 참고 — OpenAI 문서 링크 (외부)

- [Web search (OpenAI API)](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Using tools](https://developers.openai.com/api/docs/guides/tools)
- [Responses API reference — web_search tool](https://developers.openai.com/api/reference/resources/responses/)

---

## 10. 한 줄 요약 (경영·기획용)

> **URL 기반 슬라이드**는 OpenAI web search **전면 대체**보다, **지금의 선-fetch 계약을 유지**하고 **크롤 품질만 선택적으로 SaaS adapter로 바꾸는** 것이 기획·구현·멀티 벤더와 맞다. OpenAI `web_search`는 **검색형·OpenAI 전용 경로**의 **옵션**으로 둔다.
