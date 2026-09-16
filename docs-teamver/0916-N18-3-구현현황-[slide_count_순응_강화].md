# 0916-N18-3 구현현황 · slide-count 순응 강화 (루프550)

상위설계: `docs-teamver/0916-N18-1-상위설계-[slide_count_순응_강화].md`  
사용자 리포트: project `031f42a2-50f8-4bdd-aa5f-67cc76548d7c` · conversation `6b5721e2-2fd3-4af6-aa85-f4184843369a` · `error_code: artifact_short_response_persisted` · **10 → 2 slides**.

## 요약

정량 프롬프트(`Return EXACTLY N` / `Seed contains N`)를 seed 상단·hard rules·handleSend 치환에 넣고, create/full fill에서 seed vs 반환이 크게 벌어지면 pad 전에 MiniMax를 **1회** 재호출한다. 재시도도 짧으면 루프549 pad+notice가 안전망이다.

## 구현 체크

- [x] `renderSlideCountRequirementInstruction(N)` — `Return EXACTLY N` / `Seed contains N` / verbatim copy
- [x] seed 상단 + hard rules 양쪽 emit
- [x] handleSend에서 디스크 LOOK seed 개수로 fallback 상수 치환
- [x] `shouldAutoRetryShortSlideResponse` — 명시 N + 큰 단축만 1회
- [x] persist `needs-short-response-retry` → handleSend 재발화, 메타 `autoRetryForShortResponse: true`
- [x] 재시도 성공(N장) → notice 없음
- [x] 재시도도 짧음 → 루프549 pad+notice
- [x] unspecified / scoped → 재시도 없음
- [x] pad 밀도 kit-aware fill — **skip** (이유: Raw-Grid KPI 스크럽이 `template-clone-fill.ts` healer를 병렬 수정 중. 같은 파일의 merge/heal 순서를 건드리면 충돌. pad는 마지막 안전망으로 유지)
- [x] 루프544~549 경로 유지
- [x] Raw-Grid 힐러 파일 미수정

## 이전 vs 지금

| 상황 | 이전 (루프549) | 지금 (루프550) |
|---|---|---|
| seed 10 · 요청 10 · 첫 응답 10 | 저장 | 저장 (정량 프롬프트) |
| seed 10 · 요청 10 · 첫 2 · 재시도 10 | 즉시 pad 10 + notice | **재시도 1회 → 10장 저장 · notice 없음** |
| seed 10 · 요청 10 · 첫 2 · 재시도 2 | 즉시 pad 10 + notice | 재시도 후 pad 10 + notice |
| unspecified 3장 | 저장 (incomplete 미발동) | **재시도 없음** |
| scoped image/comment 1장 | scoped 경로 | **재시도 없음** |

## 재시도 대상 / 제외

| 대상 | 제외 |
|---|---|
| create/full fill | scoped edit (image/comment) |
| 명시 N | unspecified (명시 N 없음) |
| seed 대비 큰 단축 (10→2, 5→1) | 이미 `autoRetryForShortResponse` 인 턴 |
| | 소폭 차이 · 0장 collapse |

## 비용·지연

- 프롬프트 +1~2줄 (~80 tokens). 정상 N장 응답에는 추가 호출 없음.
- 큰 단축이 난 create에만 MiniMax 1회 추가. 그 다음에도 짧으면 pad (추가 LLM 없음).

## 바꾼 파일

- `packages/contracts/src/prompts/deck-quality.ts`
- `apps/web/src/teamver/templateCloneContentFill.ts`
- `apps/web/src/teamver/shortResponseAutoRetry.ts` (신규)
- `apps/web/src/components/ProjectView.tsx` (persist 결정 + handleSend 치환/재발화)
- `packages/contracts/tests/deck-quality-slide-count.test.ts` (신규)
- `apps/web/tests/teamver/short-response-auto-retry.test.ts` (신규)
- `apps/web/tests/project-view-message-load.test.ts` (소스 pin)

## 검증

- contracts `deck-quality-slide-count` · web `short-response-auto-retry` · persist 소스 pin
- 프롬프트 pin: `Return EXACTLY {N}` / `Seed contains {N}`

## 사용자 재현

같은 project `031f42a2-50f8-4bdd-aa5f-67cc76548d7c`에서 10장 요청을 다시 보낸다. 이상적 결과는 재시도 후 10장 저장(notice 없음). 재시도도 2장이면 pad 10 + `artifact_short_response_persisted`.

## 변경 이력

| 2026-09-16 16:55 | 정량 프롬프트 + 짧은 응답 자동 재시도 1회 구현. pad 밀도는 Raw-Grid 병렬 충돌로 skip. |
