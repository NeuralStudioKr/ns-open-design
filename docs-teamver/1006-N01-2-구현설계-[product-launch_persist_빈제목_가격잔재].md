# 1006-N01-2 구현설계 · Product Launch persist 빈 제목·가격 잔재

상위: [1006-N01-1](./1006-N01-1-상위설계-[product-launch_persist_빈제목_가격잔재].md)

## 파일

`packages/contracts/src/template-clone-fill.ts`
`packages/contracts/tests/template-clone-fill.test.ts`
`packages/contracts/tests/fixtures/loop563-product-launch-empty-pricing.html`
`packages/contracts/tests/loop563-product-launch-structural-quality.test.ts`

## 흐름

`salvageMalformedMiniMaxSlideMarkup` → `healProductLaunchLeftoverCatalogCopy` → `healGenericTemplateCloneLeftover`.

1. **제목 refill 판정** `productLaunchHeadingNeedsRefill`
   - 빈 값, `^\d{1,3}$`, leftover heading(`다음 액션`/`도입 로드맵`), `다루는 칸`, 짧은 역할 단어(`차이`/`핵심`)
   - 본문 문장형 제목(28자+ `다/요`)
   - slideIndex > 0 이고 `slideTitleParrotsBriefFragment`
2. **needsHeal 확대** — 위 제목, leftover kicker, orphan `₩0`/`Free`+CTA(price-card 없음), 형제 dim 동일
3. **fill** — 빈 제목은 `genericRoleCopyForIndex.heading`. 제목 없으면 kicker 뒤에 `h2` 삽입. amount/`₩0`/`Free` wipe. step/feature index를 0이 아니라 sequence index로. 형제 동일 본문은 role item으로 교체
4. **덱 카드 제목 중복** — 같은 h4가 2장 이상이면 이후를 role item title로
5. **pack** — `다루는 칸` → `모으는 일`. `문장과 칸` → `문장과 레이아웃`
6. **generic leftover** — 빈/숫자 제목, `₩0`도 needsHeal
7. **cross-kit 격리** — Product Launch에서 Block Frame 전용 root 속성/스타일을 제거하고 Block Frame healer 진입을 차단
8. **덱 전역 제목 분기** — 같은 h1/h2가 반복되면 슬라이드 구조에 맞는 미사용 제목 후보로 교체

## 경계

- 표지 `Teamver 소개`는 유지
- `첫 7일` 등 keepable 본문은 형제 중복이 아니면 유지
- CTA 라벨은 `Teamver 시작하기`로만 정규화, 버튼 셸은 유지
