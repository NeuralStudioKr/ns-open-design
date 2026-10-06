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

## 남은 리스크

- MiniMax가 슬라이드마다 **다른** 한글을 내면 덮지 않는다.
- 회사 소개에 product-launch 킷을 고르는 문제는 범위 밖.
- 이미 저장된 덱은 다시 생성하거나 persist heal을 타야 반영된다.
- fillMode는 `json`을 유지한다. 12초 경로의 leftover는 synth preset 교체로 막는다.
