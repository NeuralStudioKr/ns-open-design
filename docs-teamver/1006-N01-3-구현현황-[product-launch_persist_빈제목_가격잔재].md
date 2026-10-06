# 1006-N01-3 구현현황 · Product Launch persist 빈 제목·가격 잔재

상위: [1006-N01-1](./1006-N01-1-상위설계-[product-launch_persist_빈제목_가격잔재].md)
설계: [1006-N01-2](./1006-N01-2-구현설계-[product-launch_persist_빈제목_가격잔재].md)

## 완료

- ☑ 사용자 리포트 HTML 진단: 빈 h1, `₩0`, `02`, `다루는 칸`, 동일 step, amount `01/02/03`, 표지 파롯
- ☑ healer/pack 수정 (`packages/contracts/src/template-clone-fill.ts`)
  - `productLaunchHeadingNeedsRefill` — 빈/숫자/leftover/`다루는 칸`/본문형 제목/표지 이후 brief 파롯
  - orphan `₩0`/`Free`+CTA wipe, amount `01/02/03` 비움 (가격 미창작)
  - step/feature sequence index + 형제 동일 dim 강제 분기
  - pack `다루는 칸` → `모으는 일`
  - generic leftover도 빈/숫자/`₩0` 제목 refill
  - Product Launch에 혼입된 Block Frame root 속성/CSS 제거 및 Block Frame healer 차단
  - 덱 전체 h1/h2 중복을 구조별 미사용 제목으로 분기
- ☑ fixture `tests/fixtures/loop563-product-launch-empty-pricing.html`
- ☑ 독립 구조 품질 테스트 `tests/loop563-product-launch-structural-quality.test.ts`
- ☑ 루프551–554 유지, 루프563 추가

## 검증

```
pnpm exec vitest run tests/template-clone-fill.test.ts -t '루프55|루프563|Product Launch'
pnpm exec vitest run tests/loop563-product-launch-structural-quality.test.ts
# 합계 45 passed
```

loop563 실측 (brief `Teamver 소개`):

| 장 | 이전 | 이후 |
|---|---|---|
| 1 | Teamver 소개 | Teamver 소개 (유지) |
| 2 | Teamver 소개 | Teamver가 해결하는 문제 |
| 3 | 다루는 칸 | Teamver 핵심 근거 |
| 5 | 동일 step 3개 | 서로 다른 3문장 |
| 6 | Free / ₩0 | 도입 단계, ₩0 없음 |
| 7 | 빈 h1 | Teamver 운영 |
| 8 | `02` | Teamver 운영 근거 |

사용자 첨부 원본(10장) 실측:

- 장수 `10 → 10`
- 빈 제목 / 숫자 제목 / 중복 제목 `0`
- `₩0` / 잘린 본문 / Block Frame 스타일 혼입 `0`

전체 `template-clone-fill` 테스트는 373개 통과, 2개 실패다. 실패한 Block Frame 제목 축약과 KPI 데모값 제거 테스트는 깨끗한 기준선 `b88b1271c8`에서도 동일하게 재현되어 이번 변경의 회귀가 아니다.

## 슬라이스 2 완료

- ☑ 덱 전역 카드 h4/본문 슬로건 분기 (`healProductLaunchRepeatedCardCopy`) — 첫 등장 유지
- ☑ 빈 `.amount` 노드 제거
- ☑ leftover 표지 kicker → `${topic} 한눈에`
- ☑ 한국어 덱 `html lang="ko"`
- ☑ 잘린 `하는/위한/통한` 문장을 완전한 문장으로 닫음
- ☑ loop563 구조 테스트 6개 + 루프551–554 유지 (46 passed)

## 슬라이스 3 완료

12초 JSON-synth leftover + 미리보기와 다른 배치를 같은 에픽에서 닫았다. fillMode는 `json` 유지.

- ☑ `templatesForSynthTemplateTopic('service-intro')` → `genericSlideCopyPack` (핵심 가치/사용 장면 제거)
- ☑ leftover 카드·깨진 태그·긴 한글 140px → needsHeal
- ☑ `.hero-shot`을 `[data-od-slide-flow]` 밖으로 승격 (`data-od-official-motif-html`)
- ☑ 공식 inset `80px 112px` 복구, `g3`+2칸 → `g2`, 빈 amount 제거, `< div="">`/`<>` salvage
- ☑ `.card` leftover 잎 refill + 닫히지 않은 인용 refill
- ☑ loop563 구조 테스트 8개 + 루프551–554·572 leftover 계열 81 passed (origin/staging rebase 후)

## 슬라이스 4 완료

미리보기와 다른 킷 셸을 persist에서 공식 배치에 맞췄다. fillMode는 `json` 유지.

- ☑ `.brand`를 flow 밖으로 승격하고 `top:56px;left:112px` 핀
- ☑ `01 · The sound` / 숫자 kicker → `${topic} 한눈에`
- ☑ `early review` / `2-year warranty` / 킷 `14일` 제거, CTA 큰 숫자는 `지금`
- ☑ 빈 price-card amount → `한 화면` / `한 팀` / `한 정책` (가격 창작 없음)
- ☑ 센터 introducing 장에 role lede
- ☑ 중복 `style` 속성 병합 + 빈 style 제거
- ☑ loop563 구조 테스트 10개 통과

## 슬라이스 4b 완료 — 12초 근본원인

슬라이스 3이 synth copy를 깨끗하게 올린 역효과로 `outlineNeedsAiContentFill()`가 `false`가 되어 데몬이 MiniMax AI fill을 건너뛰고 순수 synth 덱을 ~12초에 냈다. 이것이 미리보기 대비 품질 저하의 진짜 원인이었다.

- ☑ `resolveTemplateCloneSlidesForDeterministicFillWithProvenance.finish()` — `needsAiContentFill = source === 'resolved' ? outlineNeedsAiContentFill(slides) : true` (synthetic·densified는 항상 AI fill)
- ☑ service-intro synth 첫 장 lead를 `${topic} 풀어야 하는 문제`로 복구, 슬라이드 6은 `${topic} 신뢰 근거` (leftover 정문구 회피)
- ☑ 회귀 5건 수정 — `template-clone-outline`(루프419 LOOK preview·dense 10-slide), `template-clone-fill` 루프480 Block Frame dense content, loop558/560 offline-repro(단독 통과, fixture 재생성 순서 부작용)
- ☑ 전체 스위트: 8 failed / 3337 passed → 남은 8개 중 loop558·560은 단독 통과(재생성 순서), 나머지 6개는 깨끗한 부모(d3706fa998) 기준선에서도 동일 재현되는 선행 실패(이번 변경 무관): deck-framework-compact, deck-quality-slide-count 루프550, deck-template-look-css Capsule Motif, system-prompt-api-mode compact signature, template-clone-fill 루프531·루프515

## 슬라이스 5 — pack dump / 반복 kicker

실측 HTML(10장, `www.teamver.com` 서비스 소개) 기준.

- ☑ pack close dump(`쓸 방을 열고…`)를 CTA/인용/lede에서 제거
- ☑ 문장형·반복 `한눈에` kicker를 역할별로 분기
- ☑ cover에 없는 `.hero-shot` 삽입
- ☑ `나눠같이` / `한다.를` 조사 수정
- ☑ artifact_regression(slide-count)은 이후 수정 턴이 장수를 줄여 거절된 안전 게이트. 이번 슬라이스에서 게이트를 느슨하게 하지 않음
- ☑ loop563 구조 테스트 11개 통과

## 남은 리스크

- MiniMax가 슬라이드마다 **다른** 한글을 내면 덮지 않는다.
- 회사 소개에 product-launch 킷을 고르는 문제는 범위 밖.
- 이미 저장된 덱은 다시 생성하거나 persist heal을 타야 반영된다.
- fillMode는 `json`을 유지한다. 12초 순수-synth 경로는 synthetic/densified outline에서 `needsAiContentFill=true`를 강제해 다시 MiniMax fill을 타게 한다.
