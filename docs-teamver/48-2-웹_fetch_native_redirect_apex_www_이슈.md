# 48-2 — native web_fetch: apex 도메인 리다이렉트 실패 이슈

**문서 번호:** 48-2  
**작성:** 2026-07-28 (KST)  
**상태:** **Resolved** (코드: `fix/web-fetch-safe-redirects` → `staging` merge)  
**상위 SSOT:** [48 ADR](./48_웹_fetch_외부화_OpenAI_검토_ADR.md) · [48-1 adapter 설계](./48-1-구현설계-webfetch-adapter.md) §3.3.1 · [15 web_fetch FAQ](./15_웹참조_BYOK_web_fetch_FAQ.md)

---

## 1. 요약 (Executive summary)

| 항목 | 내용 |
|------|------|
| **증상** | 프롬프트에 `neuralstudio.kr`, `example.com` 처럼 **apex(www 없는) 도메인**을 넣으면 `<web-fetch-context>` 가 비거나 failed. 반면 `www.teamver.com`, `https://www.teamver.com/` 는 정상. |
| **근본 원인** | daemon native fetch 가 **`redirect: 'error'`** 로 설정되어, 서버가 보내는 **정상 301/302 (apex → www, http → https)** 를 SSRF와 동일하게 “실패” 처리. |
| **오해하기 쉬운 점** | URL **추출(FE)** 은 apex 도메인도 잘 동작함 (`extractPublicHttpUrls` → `https://neuralstudio.kr/`). 실패 지점은 **daemon outbound GET** 단계. |
| **해결** | `redirect: 'manual'` + **매 hop `assertExternalAssetUrl` 재검증** + max 3 hops + https→http downgrade 거부. SSRF 방어는 유지. |
| **외부화 필요성** | 이 이슈만으로는 Reader SaaS / OpenAI web_search **즉시 도입 불필요**. native fix 로 흔한 marketing 사이트 케이스 대부분 커버. |

---

## 2. 재현 조건 (Staging 실측)

### 2.1 성공 케이스

사용자 입력 예:

- `www.teamver.com 참고해서 슬라이드 만들어줘`
- `https://www.teamver.com/ 내용 기반으로 …`

관측:

1. Network: 채팅 전 `POST /api/tools/web-fetch` (또는 동등 경로) **200**
2. Request body: `{ "url": "https://www.teamver.com/..." }`
3. Response: `{ "ok": true, "text": "...", "title": "..." }`
4. Persist / API body: user turn 끝에 `<web-fetch-context>` block 존재
5. Assistant: “URL을 읽을 수 없다” 류 거절 **없음**

[teamver.com](https://www.teamver.com/) 은 canonical hostname 이 이미 `www` 이라 **첫 GET 이 200** 으로 끝나 redirect 가 없음.

### 2.2 실패 케이스 (fix 전)

사용자 입력 예:

- `neuralstudio.kr 참고해서 …`
- `neuralstudio.kr` (bare domain)

관측 (fix 전):

1. FE 는 URL 을 정상 추출: `https://neuralstudio.kr/` (또는 path 포함)
2. `POST /api/tools/web-fetch` 호출됨
3. Response: `{ "ok": false, "error": "fetch failed: ..." }` — undici/Node 에서 redirect 거부 시 흔한 메시지 (`redirect count exceeded`, `redirect mode is 'error'` 등)
4. `<web-fetch-context>` 에 `status: failed` 만 붙거나 본문이 빈약
5. 모델이 참고 자료 없이 답변 → 품질 저하 또는 “접근 불가” 혼선

**실제 HTTP 동작 (일반적인 corporate/marketing 사이트):**

```http
GET https://neuralstudio.kr/ HTTP/1.1
→ 301 Moved Permanently
   Location: https://www.neuralstudio.kr/
```

fix 전 daemon 은 **첫 301 에서 fetch 를 throw** — Location 을 따라가지 않음.

### 2.3 혼동 제거: FE URL 추출 vs daemon fetch

| 단계 | 파일 | apex `neuralstudio.kr` |
|------|------|-------------------------|
| 프롬프트에서 URL 후보 수집 | `apps/web/src/api-web-fetch-context.ts` `collectPromptUrlCandidates` | ✅ bare domain regex + TLD allowlist (`kr`, `studio`, …) |
| 정규화 | `normalizePromptUrl` | ✅ `https://neuralstudio.kr` |
| daemon GET | `apps/daemon/src/web-fetch/native-backend.ts` (fix 전 `byok-url-tools.ts`) | ❌ **301 시 실패** (fix 전) |

따라서 “TLD 가 `.kr` 이라서 regex 에 안 잡힌다” 류 가설은 **본 이슈와 무관** (2026-07-27 이미 `.studio` 등 TLD 확장됨 — [15 §0](./15_웹참조_BYOK_web_fetch_FAQ.md)).

---

## 3. 근본 원인 분석

### 3.1 코드 경로

**호출链 (managed BYOK 선-fetch):**

```text
HomeView / ProjectView submit
  → fetchApiWebFetchContexts(prompt)          [apps/web]
  → POST /api/tools/web-fetch { url }         [daemon chat-routes]
  → fetchUrlContent(url)                      [web-fetch/core.ts shim → core]
  → nativeWebFetchBackend.fetchOnce           [native-backend.ts]
  → fetch(url, { redirect: 'error' })         ← fix 전
```

**BYOK tool loop 경로** 도 동일한 `fetchUrlContent` 를 사용.

### 3.2 왜 `redirect: 'error'` 였나

`apps/daemon/src/connectionTest.ts` 의 `assertAndFetchExternalAsset` 주석 (SSRF SSOT):

- 사용자/업스트림이 준 URL 을 **한 번** `assertExternalAssetUrl` 로 검증
- 이어서 `fetch(..., { redirect: 'error' })` 로 **3xx hop 자체를 금지**
- 목적: 검증된 public URL 이 **302 로 loopback / RFC1918 / link-local / EC2 metadata (`169.254.169.254`)** 로 hop 하면, 두 번째 hop 은 SSRF 검증 없이 fetch 될 수 있다는 우려 차단

이 패턴은 **BYOK 이미지/비디오 다운로드** (`byok-tools.ts`, `media.ts`) 에도 동일하게 적용됨 — “한 번 검증 + redirect 금지”.

### 3.3 web_fetch 에서의 부작용

Marketing / corporate 사이트는 거의 항상:

- apex → `www` (301/302)
- http → https (301/302)

`redirect: 'error'` 는 **악의적 redirect 와 정상 redirect 를 구분하지 못함**.  
결과적으로 “외부화(SaaS reader) 없으면 apex 도메인은 영원히 깨진다” 로 보였으나, 실제로는 **정책 한 줄** 문제.

---

## 4. 해결 설계 (Accepted)

상세 정책 표는 [48-1 §3.3.1 Redirect policy](./48-1-구현설계-webfetch-adapter.md#331-redirect-policy-2026-07-28-갱신) SSOT.

### 4.1 핵심 아이디어

**“redirect 를 follow 하되, follow 할 때마다 SSRF 를 다시 검사한다.”**

```text
GET url (redirect: manual)
  → 3xx + Location?
       → parse Location (relative OK)
       → scheme http(s) only
       → assertExternalAssetUrl(next)   ← DNS resolve, block private/metadata
       → refuse https→http downgrade
       → GET next (hop++, max 3)
  → 2xx → stream body (100KB cap) → HTML→text
```

SSRF 공격 시나리오 (fix 후):

```text
GET https://attacker.com/
  → 302 Location: http://169.254.169.254/latest/meta-data/
  → assertExternalAssetUrl(169.254...) → blocked
  → { ok: false, error: "blocked redirect: ..." }
```

### 4.2 정책 파라미터 (default)

| 파라미터 | 값 | 비고 |
|----------|-----|------|
| `MAX_REDIRECT_HOPS` | 3 | curl 관례; apex→www→… 2 hop 이내가 대부분 |
| Per-hop SSRF | `assertExternalAssetUrl` | 검증 순서: scheme → **SSRF** → downgrade |
| https → http | 거부 | TLS leak 방지 |
| http → https | 허용 | |
| Cross-origin Location | 허용 | CDN/vanity; hop 마다 SSRF |
| Public API | 무변 | `WebFetchToolResult` 에 hops 미노출 |

### 4.3 로그 / ops

daemon stdout (성공, 1 hop):

```text
web_fetch.backend=native url_host=neuralstudio.kr duration_ms=... hops=1 status=ok text_bytes=...
```

실패 bucket (`classifyErrorCode`):

| error prefix / pattern | bucket |
|------------------------|--------|
| `too many redirects` | `redirect_max` |
| `blocked redirect:` | `redirect_blocked` |
| `redirect without Location`, `invalid redirect Location` | `redirect_malformed` |

**주의:** 최초 요청의 `url_host` 는 **사용자가 넣은 apex host** (`neuralstudio.kr`). 최종 200 은 `www` 에서 받아도 로그 host 는 원본 URL 기준 (PII/path 미로그 정책 유지).

### 4.4 코드 위치 (merge 후)

| 파일 | 역할 |
|------|------|
| `apps/daemon/src/web-fetch/native-backend.ts` | hop loop, `resolveSafeRedirect`, `readCappedBody` |
| `apps/daemon/src/web-fetch/core.ts` | SSRF on original URL, logging, htmlToText |
| `apps/daemon/tests/web-fetch-redirect.test.ts` | 9 regression cases |

`staging` 에 adapter 리팩터가 아직 없을 때 hotfix 만 필요하면 동일 로직을 `byok-url-tools.ts` inline fetch 에 포팅 가능 — **본 브랜치는 48-1 리팩터 위에 fix 를 올린 형태**.

---

## 5. 검증 체크리스트

### 5.1 자동 (CI / local)

```bash
cd apps/daemon
pnpm exec vitest run \
  tests/byok-url-tools.test.ts \
  tests/web-fetch-select.test.ts \
  tests/web-fetch-reader-backend.test.ts \
  tests/web-fetch-log.test.ts \
  tests/web-fetch-redirect.test.ts
```

기대: **33/33 pass** (redirect suite 9).

### 5.2 Staging smoke (수동)

**Production 직전·직후 전체 게이트:** [48-3 Production 배포 전·후 체크리스트](./48-3-웹_fetch_Production_배포_전후_체크리스트.md) (P0~P5, sign-off, 롤백).

배포 후 동일 세션에서:

1. `neuralstudio.kr 로 회사 소개 슬라이드 5장` — Network 에 web-fetch **ok**, context 에 본문 길이 > 0
2. `www.teamver.com 참고해서 …` — 회귀 없음
3. (선택) daemon 로그에서 `hops=1` 관측 (apex 사이트)

실패 시 확인:

- `.env` 에 `WEB_FETCH_BACKEND=reader` 오세팅 여부 ([48 §5.1.1](./48_웹_fetch_외부화_OpenAI_검토_ADR.md) — reader enable 금지)
- URL 이 FE 에서 추출됐는지 (prompt only, no POST)

---

## 6. ADR / 로드맵 영향

| 항목 | fix 전 인식 | fix 후 |
|------|-------------|--------|
| Reader SaaS (Jina 등) | apex 깨짐 → SaaS 필요해 보임 | **대부분 native 로 충분** |
| OpenAI `web_search` Phase 3 | 크롤 품질 급함 | **needs-based 지연** 가능 (SPA/bot-block/captcha 는 여전히 한계) |
| 48 §5.1.1 (새 SaaS 금지) | 유지 | 유지 — reader 코드는 dead-code 보존 |

본 이슈 해결만으로 **외부화 작업을 당장 진행하지 않아도 되는** 근거가 됨 (사용자 판단과 일치).

---

## 7. 한계 (fix 후에도 native 가 못 하는 것)

| 케이스 | 증상 | 대응 방향 |
|--------|------|-----------|
| Heavy SPA (본문이 JS 렌더) | text 거의 없음 | Phase 3 vendor tool / reader (정책·비용 재검토) |
| Bot block / CAPTCHA | 403/ challenge HTML | 동일 |
| 로그인 wall | login page text | 사용자에게 “공개 URL” 안내 |
| 4+ redirect tracking chain | `redirect_max` | URL 을 최종 canonical 로 직접 입력 |

---

## 8. 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-07-28 14:10 | 초안 — staging 실측, 원인, fix, 검증, ADR 영향 정리 |
| 2026-07-28 14:20 | README · 15 FAQ · 48-1 불변식 I5 · 48 ADR 상호 링크 |

---

## 9. 관련 SSOT

- [15 §0 현재 상태](./15_웹참조_BYOK_web_fetch_FAQ.md#0-2026-07-08-현재-상태)
- [48 ADR v1.3 changelog](./48_웹_fetch_외부화_OpenAI_검토_ADR.md)
- [48-1 구현현황](./48-1-구현현황-webfetch-adapter.md)
- FE URL 추출: `apps/web/src/api-web-fetch-context.ts`
- SSRF: `apps/daemon/src/connectionTest.ts` `assertExternalAssetUrl`
