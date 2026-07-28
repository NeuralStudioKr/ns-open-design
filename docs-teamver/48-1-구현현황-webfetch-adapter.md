# 48-1 구현현황 — daemon `web_fetch` backend adapter

**문서 번호:** 48-1 (구현현황)  
**작성:** 2026-07-27 (KST)  
**설계:** [48-1 구현설계](./48-1-구현설계-webfetch-adapter.md)  
**상위 ADR:** [48 웹 fetch 외부화 ADR](./48_웹_fetch_외부화_OpenAI_검토_ADR.md)  
**브랜치:** `feat/web-fetch-adr` (base: `origin/staging`)

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-07-27 16:20 | 초안 — Phase A 완료 · Phase B 착수 |
| 2026-07-27 16:40 | Phase B/C/D/E 완료 · 회귀 3/3 + 신규 16/16 green · staging enable 은 별도 ops task |
| 2026-07-28 10:35 | 코드 리뷰 반영 (Phase F) — 48-1 §5 로그 필드 실 구현 + 신규 회귀 `web-fetch-log.test.ts` (4 케이스) · 총 24/24 green |
| 2026-07-28 13:35 | **조직 정책 갱신 (48 §5.1.1 v1.2):** 새 SaaS 구독 금지 → `WEB_FETCH_BACKEND=reader` 는 staging/prod enable **금지**. 코드는 dead-code 로 보존 (Phase 3 재활용 후보). 후속 인수인계 항목 재작성. |
| 2026-07-28 14:10 | **48-1 §3.3.1 land:** native backend 에 safe redirect follow 도입 (`redirect: 'manual'` + per-hop `assertExternalAssetUrl` + max 3 hops + https→http downgrade 거부). `neuralstudio.kr` 같은 apex 도메인 실측 이슈 해결. 신규 회귀 `web-fetch-redirect.test.ts` (9 케이스) — 총 5 files · 33/33 pass. 로그 스키마에 `hops=N` (>0 시만) 추가, error codes `redirect_max` / `redirect_blocked` / `redirect_malformed` 추가. 브랜치 `fix/web-fetch-safe-redirects`. |

---

## Phase A — worktree · 문서 이관 (완료)

- [x] `git worktree add -b feat/web-fetch-adr ../ns-open-design-web-fetch-adr origin/staging`
- [x] `docs-teamver/48_웹_fetch_외부화_OpenAI_검토_ADR.md` 이관 (untracked → tracked)
- [x] `docs-teamver/15_웹참조_BYOK_web_fetch_FAQ.md` — §관련 SSOT + §변경 이력 링크 추가
- [x] `docs-teamver/04_구현_우선순위.md` — L-472/L-473 링크 갱신
- [x] `docs-teamver/README.md` — 48 인덱스 항목 추가
- [x] `docs-teamver/00_구현_내역_누적.md` — 기존 항목 유지 (이번 Phase 에서는 손대지 않음, Phase E 에서 최종 항목 추가)
- [x] commit `docs(teamver): add 48 web-fetch externalization ADR (worktree base)`
- [x] `git push -u origin feat/web-fetch-adr`

---

## Phase B — 구현설계 · 구현현황 (완료 · commit `c1f5033e4`)

- [x] [48-1 구현설계](./48-1-구현설계-webfetch-adapter.md) 작성 (섹션 1~11)
- [x] 본 구현현황 초안 작성
- [x] commit `docs(teamver): 48-1 web-fetch adapter design + progress (POC scope)` + push

**설계 확정 사항 (Phase C 진입 조건):**
- ✅ Public API `fetchUrlContent(rawUrl, requestInit?)` 시그니처 유지
- ✅ SSRF 는 core 에서 원본 URL 대상으로 단일 지점 실행
- ✅ Backend interface 는 URL 하나 → raw text/isHtml/title 로 최소화
- ✅ Reader backend 는 outbound endpoint 가 configured URL 이므로 부트 타임에만 검증
- ✅ Fallback 은 최대 1회, opt-in

---

## Phase C — core dispatcher (native-only 리팩터, 완료 · commit `fdd0fd374`)

- [x] 신규 `apps/daemon/src/web-fetch/backend.ts`
  - [x] `WebFetchBackendCtx`, `WebFetchBackendResult`, `WebFetchBackend`, `WebFetchToolResult` 타입
- [x] 신규 `apps/daemon/src/web-fetch/native-backend.ts`
  - [x] 기존 fetch/streaming 로직 이동 (동작 무변)
  - [x] `WebFetchBackend` 구현 (`name: 'native'`)
- [x] 신규 `apps/daemon/src/web-fetch/core.ts`
  - [x] `fetchUrlContent` 본체 이동 (SSRF · timeout · UA · cap · htmlToText · 로그)
  - [x] Phase C 는 inline resolver (항상 native), Phase D 에서 `select.ts` 로 교체
- [x] `apps/daemon/src/byok-url-tools.ts` → shim (`export { fetchUrlContent }`, `export type { WebFetchToolResult }`) 로 축약 (breaking 없음)
- [x] 기존 `apps/daemon/tests/byok-url-tools.test.ts` **무수정** 3/3 통과
- [x] `pnpm --filter @open-design/daemon exec tsc -p tsconfig.json --noEmit` clean
- [x] commit `refactor(daemon/web-fetch): extract native backend behind dispatcher` + push

---

## Phase D — reader backend · env · 신규 테스트 (완료 · commit `f373bebba`)

- [x] 신규 `apps/daemon/src/web-fetch/select.ts`
  - [x] env 파싱 (기본 native)
  - [x] `validateReaderEndpoint` (https 강제, 사설 IP literal 거부, 부트 타임 · DNS free)
  - [x] 잘못된 조합 시 `console.warn` + native 다운그레이드
- [x] 신규 `apps/daemon/src/web-fetch/reader-backend.ts`
  - [x] Jina-style prefix (`<base><원본 URL>`)
  - [x] `Authorization: Bearer <key>` optional
  - [x] `WEB_FETCH_READER_TIMEOUT_MS` 개별 timeout (core 12s 와 별개, 신호 wiring 명시)
  - [x] 응답 `isHtml: false` — core 가 htmlToText skip
  - [x] 100KB 스트리밍 캡 자체 적용 (core fail-safe 이전 방어선)
- [x] core: fallback wiring (`select.fallback !== null` 이면 error 시 1회 재시도, `web_fetch.reader_fallback` warn 로그)
- [x] core: 캐시 + `_resetWebFetchBackendCacheForTests` 훅 노출
- [x] 신규 `apps/daemon/tests/web-fetch-select.test.ts` (9 케이스)
- [x] 신규 `apps/daemon/tests/web-fetch-reader-backend.test.ts` (7 케이스, e2e fallback on/off 포함)
- [x] `pnpm --filter @open-design/daemon exec vitest run tests/byok-url-tools.test.ts tests/web-fetch-*.test.ts` — 3 files / 20 tests green
- [x] commit `feat(daemon/web-fetch): reader backend + WEB_FETCH_* env + optional fallback` + push

---

## Phase E — env 예시 · FAQ · 누적 · 최종 현황 (진행 중 → 이 문서 커밋 시 완료)

- [x] `deploy/teamver/.env.staging.example` — `# WEB_FETCH_BACKEND=native` 등 주석 5줄 (staging 실값 변경 없음)
- [x] `docs-teamver/15_웹참조_BYOK_web_fetch_FAQ.md` §5 코드 상태 표에 backend adapter 행 + §5.1 env 스키마 표 추가
- [x] `docs-teamver/48_웹_fetch_외부화_OpenAI_검토_ADR.md` §8 체크리스트 — Phase 2 병합 상태 반영 (v1.1)
- [x] `docs-teamver/00_구현_내역_누적.md` 최상단 — 48-1 POC 병합 항목 추가
- [x] `docs-teamver/04_구현_우선순위.md` L-472/L-473 — Phase 2 진행 상태 + 48-1 링크
- [x] 본 구현현황 최종 갱신 (POC done, staging enable 은 별도 ops task)
- [ ] commit `docs(teamver): 48 phase-2 poc landed — checklist + env example + faq` + push

---

## Phase F — 코드 리뷰 반영 (로그 필드 land, 완료 예정)

**배경:** Phase D 종료 시점에 48-1 §5 의 per-call log 필드가 fallback `console.warn` 한 줄로만 부분 구현돼 있어 기획-구현 불일치가 있었다. 리뷰에서 발견 → 실 구현으로 마감.

- [x] `core.ts` — `logWebFetchCall` + `classifyErrorCode` + `safeUrlHost` 추가, SSRF pre-guard / primary / fallback 3 경로에 log 삽입
- [x] `48-1 §5` 로그 스키마 최종 확정 (backend, url_host, duration_ms, status, text_bytes, truncated, error_code, error, reader_fallback + 예시 4줄)
- [x] 신규 `apps/daemon/tests/web-fetch-log.test.ts` (4 케이스)
  - [x] native ok — url_host / duration_ms / text_bytes, body/title/path 미노출 검증
  - [x] native http 404 → `error_code=http_4xx`
  - [x] reader 503 → native fallback + 최종 line 에 `reader_fallback=1`, warn 스파이로 `web_fetch.reader_fallback` verify
  - [x] SSRF (`169.254.169.254`) → `backend=-`, `error_code=ssrf`
- [x] 전체 회귀: `byok-url-tools`(3) + `web-fetch-select` + `web-fetch-reader-backend` + `web-fetch-log`(4) = **4 files / 24 tests green**
- [x] `pnpm --filter @open-design/daemon exec tsc -p tsconfig.json --noEmit` clean · test tsconfig 신규 error 0
- [ ] commit `refactor(daemon/web-fetch): land 48-1 §5 log schema + regression` + push

**주의사항 (리뷰에서 확인):**
- 원본 `fetchUrlContent` 도 caller signal 을 timeout signal 로 override 했음 → user Stop 미반영은 pre-existing behavior, POC 밖.
- Body streaming timeout 은 undici socket timeout 에 의존 (원본과 동일).
- Loopback (127.0.0.1) 은 SSRF 가드에서 의도적으로 허용 (Ollama 등 local LLM), link-local (169.254.x.x) 은 block — 회귀 테스트에서 반영.

---

## 종료 조건 (POC scope) — 최종

- [x] 모든 Phase (A~F) 완료 · `feat/web-fetch-adr` 원격 최신
- [x] 기존 회귀 테스트 무수정 통과 (`byok-url-tools.test.ts` 3/3)
- [x] 신규 테스트 3종 (select · reader-backend · log) all green — 회귀 포함 총 24/24
- [x] daemon 은 기본 `native` 로 동작 (env 미설정), staging 실환경 스위치는 별도 ops task 로 이관

## Non-goals 재확인

- reader SaaS 실계약 · 과금 · prod key 배포
- managed vendor tool loop (Phase 3, 별 ADR)
- Main BFF 통합 (Phase 4)

## 후속 작업 (v1.2 정책 갱신 반영)

### ops 인수인계 — **활성 계약**

- **Production 배포 전·후 필수 확인:** [48-3 체크리스트](./48-3-웹_fetch_Production_배포_전후_체크리스트.md) (P0~P5, sign-off, 롤백).
- staging/prod daemon 은 `WEB_FETCH_BACKEND` 미설정 상태 = **native 로 계속 동작**. 추가 조치 없음. 회귀 실패 발생 시 `.env` 에 실수로 `WEB_FETCH_BACKEND=reader` 가 들어갔는지 우선 확인.
- daemon 로그 `web_fetch.backend=` 필드로 실행 backend 확인 가능. 만약 `native` 이외 값이 관측되면 즉시 조사 후 native 로 rollback.

### 🚫 명시적 금지 (48 §5.1.1)

- ~~staging `.env.staging` 에 `WEB_FETCH_BACKEND=reader` + `WEB_FETCH_READER_URL` 실값 세팅~~ → **금지 (조직 정책상 새 SaaS 구독 불가)**
- ~~Jina Reader / Firecrawl / Browserless 등 reader-계열 벤더 계약~~ → **금지**
- ~~Reader SaaS 비용 모니터링~~ → **불필요 (미활성)**

### Phase 3 로 이월 (48-2 ADR 후속)

- Teamver 이미 보유 key 인 **OpenAI Responses `web_search`** / **Anthropic hosted `web_search`** 를 활용해 크롤 품질 개선. 새 SaaS 구독 zero.
- 통합 위치 두 갈래 결정: (가) `WebFetchBackend` 슬롯에 `openai-backend.ts` / `anthropic-backend.ts` 를 채워 fetcher 위임, (나) `TEAMVER_OD_API_PROTOCOL` 확장으로 답변 turn 안에서 vendor tool loop.
- 원문 verbatim vs 요약 허용, vendor SSRF 신뢰 경계, 요금·usage bridge 재정합 — 48-2 ADR 로 별도 정리.

이번 브랜치 (`feat/web-fetch-adr`) 는 **여기서 마감**. Phase 3 는 별 브랜치.
