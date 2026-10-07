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

## 슬라이스 7 — 표지 chrome · 조사 · 2칸 와이드

2026-10-07 재생성 HTML. 슬라이스 5/6 kicker(`Teamver 한눈에` / `이렇게 씁니다` / `쓰는 단위` / `정착 순서` / `Teamver 기준` / `이어서` / `다음에`)와 price-card h2 `Teamver 쓰임새`는 이미 들어가 있다. 남은 결함은 표지·조사·끝 중점·헤드폰 글리프·2칸 슬라이드다. fillMode는 `json` 유지.

- ☑ 표지가 `.dark.slide-title`이라 center lede를 건너뛰던 것 — cover에도 lede
- ☑ hero-shot은 삽입됐지만 `stripEmptyOfficialMotifInstances`가 빈 `data-od-official-motif-html`을 지웠다. product-launch `.hero-shot`은 strip에서 제외하고 persist 끝에서 다시 확인. 빈 `.deck-footer` 제거
- ☑ `나눠같이` — 팩 소스는 `나눠 같이`. persist 치환을 최종 HTML까지 유지. synth 회귀로 소스가 붙임꼴을 내면 실패
- ☑ dim/lede 끝 ` · ` 제거, `초안·리뷰` 유지
- ☑ feature-card `♪ ◈ ◐ ✦ ✧` 제거 (다른 킷 제외)
- ☑ step / feature-card / card가 2개면 팩 제목으로 세 번째를 채우고, step에 kicker가 없으면 `정착 순서`
- ☑ loop563 구조 테스트 19개 통과. template-clone-fill `루프55|Product Launch` 41개 통과 (synth 문장은 바꾸지 않음)
- ☐ 이미 저장된 덱은 다시 생성하거나 persist heal을 타야 화면에 반영된다. 이번 턴은 commit/push/배포 없음

### flat variant (flow 없음)

같은 날 재생성본은 `[data-od-slide-flow]`도 `data-od-deck-fixed-canvas-pin`도 없고, 표지가 `.slide.dark`이며 `.hero-shot`·kicker·h1·빈 `.deck-footer`가 section 직계다. `.slide-title` / `.center`가 아니다. 슬라이스 7 heal은 이 마크업에서도 돈다. 회귀는 `tests/fixtures/loop563-product-launch-flat.html`.

- 글리프 제거, `나눠같이` → `나눠 같이`, 빈 footer 제거, 2칸 feature-card/card → 3칸 `g3`, 2-step에 세 번째와 kicker는 flow에 묶여 있지 않았다.
- 표지 lede만 `.center` / `.slide-title` / (첫 장 + `.dark` + h1)에 묶여 있었다. `.dark` 조건을 빼서, 카드 없는 첫 h1 표지면 클래스와 flow가 없어도 lede를 넣는다. 이 재생성 표지는 원래 `.dark`라 조건 변경 전에도 lede 대상이었다.
- hero ensure는 요소가 있으면 즉시 반환한다. flow는 샷이 없을 때의 삽입 위치일 뿐이다. 기존 `<div class="hero-shot">`은 복제되지 않는다. kicker는 h1/h2가 있으면 flow 없이 그 앞에 붙는다.
- `healProductLaunchLeftoverCatalogCopy`와 `sanitizePersistedDeckHostLeaks` 모두 위 단언을 통과했다. 가격·KPI는 추가하지 않는다. 배포 후 재생성하면 이 flat 덱의 위 결함은 heal 된다.

## 슬라이스 6 — 빈 dim-dot · 중복 kicker · price-card 역할 불일치

사용자 재생성(2026-10-06) 실측 HTML: Ship 슬라이드 좌캠에 `<p class="dim mt-m"> · </p>` orphan만 남아 비어 보이고, 2장은 kicker/h1이 모두 `문제`로 중복, price-card 슬라이드 h2는 `${topic}가 남기는 증거`라 역할이 어긋났다. 슬라이스 5의 수정이 이미 배포된 것은 kicker 분기(`이렇게 씁니다/쓰는 단위/정착 순서/Teamver 기준/이어서/다음에`)가 `PRODUCT_LAUNCH_KICKER_BY_INDEX`와 정확히 일치해 확인됐다.

- ☑ `wipeProductLaunchOrphanDimDots` — `<p class="dim …"> · </p>` 및 빈 `<p class="dim …"></p>` 제거
- ☑ `healProductLaunchKickerParrotsHeading` — kicker와 h1/h2가 같은 명사를 반복할 때만 index 라벨로 교체. 브랜드만 겹치면 유지
- ☑ `retitleProductLaunchPriceCardSlide` — price-card ≥2장 + h2가 `남기는 증거/묶는 일/모으는 일/운영 근거`이면 h2를 `${topic} 쓰임새`로 교체. 카드 h4는 유지
- ☑ `fillProductLaunchShipSlide` — CTA와 같은 행의 빈 `flex:1` 칸에만 `.lede` 삽입. 이미지·`flex:1.5`·CTA가 들어 있는 칸은 유지. 색은 킷 CSS
- ☑ 방어적 `나눠같이` / `한다.를` → `한 것을` 치환을 heal 체인 끝으로 승격
- ☑ loop563 구조 테스트 13개 통과
- ☑ 전체 contracts 스위트: 11개 pre-existing 실패와 동일(슬라이스 4b 때 알려진 선행 실패 + loop558~561 live-fixture 환경 의존 + e2e). 슬라이스 6으로 새로 깨진 테스트 없음

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

## 변경 이력

| 2026-10-07 13:11 | 슬라이스 7 flat — flow 없는 표지에서도 lede·hero·2칸·글리프 heal, loop563 19 |
| 2026-10-07 13:10 | 슬라이스 7 — 표지 hero가 motif strip에 지워지던 원인과 2칸·글리프·조사 heal |
