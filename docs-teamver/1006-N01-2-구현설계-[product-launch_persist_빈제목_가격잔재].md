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

## 후속 (1006-N01 슬라이스 2)

h1/h2 분기는 닫혔다. 같은 카드 슬로건이 **다른 장**에 반복되고, 가격 amount가 빈 칸으로 남고, 표지 kicker가 leftover 본문이다.

9. **덱 전역 카드 슬로건** — `feature-card` / `price-card` / `step` / `card`의 h4·본문이 8자/16자 이상이고 앞서 나온 문장과 같으면 첫 등장만 유지. 이후는 미사용 짧은 역할 제목 + title-aware 본문
10. **빈 amount 셸 제거** — wipe 후 내용 없는 `.amount`는 레이아웃 구멍이라 노드를 제거
11. **표지 leftover kicker** — `다루는 문제와 제공 가치` 등 leftover 본문 kicker는 `${topic} 한눈에`로 교체 (빈 kicker 금지)
12. **한국어 덱 `lang`** — hangul이 있으면 `html lang="ko"`
13. **잘린 서술** — `하는/위한/통한`으로 끝나는 p는 완전한 문장으로 닫음

## 후속 (1006-N01 슬라이스 3)

실생성 12초 + leftover 카드 + 미리보기와 다른 배치는 **json outline + service-intro synth**가 원인이다. fillMode(`json`)는 유지한다.

14. **synth preset 교체** — `templatesForSynthTemplateTopic('service-intro')`의 leftover 제목/본문(`핵심 가치`/`사용자가 즉시 얻는…`)을 `genericSlideCopyPack` 문장으로 교체. 12초 경로의 품질 바닥을 올린다.
15. **needsHeal에 leftover 카드** — 제목이 keepable이어도 h4/본문이 leftover면 fill 한다.
16. **배치** — `.hero-shot`을 flow 밖으로 승격(미리보기처럼 슬라이드 형제). 긴 한글 h1의 `font-size:140px` 제거. 빈 amount 제거. `g3`+카드 2장 → `g2`. `< div="">`/`<>` salvage.
17. **잘린 따옴표** — `"문서`처럼 닫히지 않은 인용은 refill 대상으로 본다.
18. **`.card` leftover** — kit `.card`(feature-card 아님)도 생성 fill·persist refill 대상. 제목이 keepable이어도 leftover 카드 잎을 교체한다.
19. **공식 inset** — slide+flow 이중 `56px 72px`를 제거하고 flow를 킷 미리보기와 같은 `80px 112px`로 맞춘다.

## 경계

- 표지 `Teamver 소개`는 유지
- `첫 7일` 등 keepable 본문은 **첫 등장**은 유지. 덱 뒤쪽에서 같은 문장이 반복될 때만 교체
- CTA 라벨은 `Teamver 시작하기`로만 정규화, 버튼 셸은 유지
- fillMode / MiniMax 호출 정책은 유지 (`json` default)
- 킷 선정(회사 소개 → product-launch)은 여전히 범위 밖
