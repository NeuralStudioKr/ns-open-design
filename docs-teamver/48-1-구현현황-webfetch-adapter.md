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

## Phase B — 구현설계 · 구현현황 (진행 중 → 이 문서 커밋 시 완료)

- [x] [48-1 구현설계](./48-1-구현설계-webfetch-adapter.md) 작성 (섹션 1~11)
- [x] 본 구현현황 초안 작성
- [ ] commit `docs(teamver): 48-1 web-fetch adapter design + progress (POC scope)` + push

**설계 확정 사항 (Phase C 진입 조건):**
- ✅ Public API `fetchUrlContent(rawUrl, requestInit?)` 시그니처 유지
- ✅ SSRF 는 core 에서 원본 URL 대상으로 단일 지점 실행
- ✅ Backend interface 는 URL 하나 → raw text/isHtml/title 로 최소화
- ✅ Reader backend 는 outbound endpoint 가 configured URL 이므로 부트 타임에만 검증
- ✅ Fallback 은 최대 1회, opt-in

---

## Phase C — core dispatcher (native-only 리팩터, 커밋 예정)

- [ ] 신규 `apps/daemon/src/web-fetch/backend.ts`
  - [ ] `WebFetchBackendCtx`, `WebFetchBackendResult`, `WebFetchBackend` 타입
- [ ] 신규 `apps/daemon/src/web-fetch/native-backend.ts`
  - [ ] 기존 fetch/streaming 로직 이동
  - [ ] `WebFetchBackend` 구현 (`name: 'native'`)
- [ ] 신규 `apps/daemon/src/web-fetch/core.ts`
  - [ ] `fetchUrlContent` 본체 이동 (SSRF · timeout · UA · cap · htmlToText · 로그)
  - [ ] `resolveWebFetchBackend()` 호출 (Phase C 에서는 항상 native)
- [ ] `apps/daemon/src/byok-url-tools.ts` → `export { fetchUrlContent } from './web-fetch/core.js';` 로 축약 (breaking 없음)
- [ ] 기존 `apps/daemon/tests/byok-url-tools.test.ts` **무수정** 통과 확인
- [ ] `pnpm --filter @open-design/daemon exec tsc --noEmit`
- [ ] commit `refactor(daemon/web-fetch): extract native backend behind dispatcher` + push

**Phase C 종료 조건:** 회귀 테스트 pass · public API 시그니처 diff 0 · `chat-routes.ts:103` / `byok-tools.ts:489` 콜사이트 코드 변화 없음.

---

## Phase D — reader backend · env · 신규 테스트

- [ ] 신규 `apps/daemon/src/web-fetch/select.ts`
  - [ ] env 파싱 (기본 native)
  - [ ] `validateReaderEndpoint` (https 강제, private ip 거부, 부트 타임)
  - [ ] 잘못된 조합 시 warn 로그 + native fallback
- [ ] 신규 `apps/daemon/src/web-fetch/reader-backend.ts`
  - [ ] Jina-style prefix 조합 (`<base><원본 URL>`)
  - [ ] `Authorization: Bearer <key>` optional
  - [ ] `WEB_FETCH_READER_TIMEOUT_MS` 개별 timeout
  - [ ] 응답 `isHtml: false` (markdown 가정), core 가 htmlToText skip
- [ ] core: fallback wiring (`select.fallback !== null` 이면 error 시 1회 재시도)
- [ ] 신규 `apps/daemon/tests/web-fetch-select.test.ts`
  - [ ] env 4 조합
  - [ ] fallback flag 파싱
- [ ] 신규 `apps/daemon/tests/web-fetch-reader-backend.test.ts`
  - [ ] 성공 케이스 (markdown 그대로 유지)
  - [ ] 401 error (fallback off)
  - [ ] 5xx → native fallback (fallback on)
  - [ ] API key 유무에 따른 Authorization header
- [ ] 로그 필드 스냅샷 (`web_fetch.backend`, `web_fetch.reader_fallback`)
- [ ] `pnpm --filter @open-design/daemon exec vitest run tests/byok-url-tools.test.ts tests/web-fetch-*.test.ts`
- [ ] commit `feat(daemon/web-fetch): reader backend + WEB_FETCH_* env + optional fallback` + push

---

## Phase E — env 예시 · FAQ · 누적 · 최종 현황

- [ ] `deploy/teamver/.env.staging.example` — `# WEB_FETCH_BACKEND=native` 주석 예시 (실값 변경 없음)
- [ ] `docs-teamver/15_웹참조_BYOK_web_fetch_FAQ.md` §5 표에 `WEB_FETCH_BACKEND` 행 추가
- [ ] `docs-teamver/48_웹_fetch_외부화_OpenAI_검토_ADR.md` §8 체크리스트 — Phase 2 착수 상태 반영
- [ ] `docs-teamver/00_구현_내역_누적.md` 최상단 — 48-1 POC 완료 항목 추가
- [ ] 본 구현현황 최종 갱신 (POC done, staging enable 은 별도 ops task)
- [ ] commit `docs(teamver): 48 phase-2 poc landed — checklist + env example + faq` + push

---

## 종료 조건 (POC scope)

- [ ] 모든 Phase 완료 · `feat/web-fetch-adr` 원격 최신
- [ ] 기존 회귀 테스트 무수정 통과
- [ ] 신규 테스트 2종 (select · reader-backend) pass
- [ ] daemon 은 기본 `native` 로 동작, staging 실환경 스위치는 별도 ops task 로 이관

## Non-goals 재확인

- reader SaaS 실계약 · 과금 · prod key 배포
- managed vendor tool loop (Phase 3, 별 ADR)
- Main BFF 통합 (Phase 4)
