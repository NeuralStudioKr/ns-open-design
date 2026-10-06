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

## 후속 (1006-N01 슬라이스 4)

persist leftover는 줄었지만 미리보기와 다른 **킷 셸 배치**가 남는다. fillMode(`json`)는 유지한다.

20. **표지 chrome** — `.brand`도 `.hero-shot`처럼 flow 밖으로 승격하고 공식 `position:absolute;top:56px;left:112px`를 복구한다.
21. **영문 킷 kicker** — `01 · The sound` / `02` / `Pricing` 은 `${topic} 한눈에`로 교체.
22. **CTA 잔재** — `early review` / `2-year warranty` / `· from` / 빈 96px / 킷 `14일`을 제거하고 큰 숫자는 `지금`으로 시각 리듬을 맞춘다.
23. **price-card 무게** — 가격을 지어내지 않는다. 빈 amount는 `한 화면` / `한 팀` / `한 정책` 짧은 한글 라벨로 공식 64px 숫자를 대체한다.
24. **센터 장** — kicker+제목만 있는 introducing 장에 role lede를 넣어 빈 화면을 채운다.
25. **중복 style 속성** — `style="" style="…" style="…"`처럼 한 태그에 style가 여러 번이면 브라우저가 첫 번째만 쓴다. 하나로 병합하고 빈 style는 제거한다.

## 후속 (1006-N01 슬라이스 4b — 12초 근본원인)

슬라이스 3에서 synth copy를 깨끗하게 올린 **역효과**로 `outlineNeedsAiContentFill()`가 `false`를 반환했다. synth outline이 더 이상 `GENERIC_DETERMINISTIC_FILL_COPY_RE`에 걸리지 않고 모든 장에 item이 있으면 데몬이 **MiniMax AI fill을 건너뛰고** 순수 synth 덱을 ~12초에 내보낸다. 미리보기 대비 품질이 떨어지는 진짜 원인이다. fillMode(`json`)는 유지한다.

26. **synthetic/densified outline은 항상 AI fill** — `resolveTemplateCloneSlidesForDeterministicFillWithProvenance.finish()`에서 `needsAiContentFill = source === 'resolved' ? outlineNeedsAiContentFill(slides) : true`. synthetic·densified는 generic seed이므로 반드시 MiniMax fill을 거친다. 완전히 `resolved`된 outline만 AI fill을 건너뛸 수 있다.
27. **service-intro seed lead 복구** — synth 첫 장 lead를 `${topic} 풀어야 하는 문제`로 되돌린다. leftover 라벨이 아니라 keepable copy이며, outline이 generic seed임을 분기와 테스트(루프419)에서 식별하게 한다. "evidence/신뢰" 슬롯(슬라이드 6)도 leftover 정문구(`신뢰를 만드는 증거`)를 피해 `${topic} 신뢰 근거`로 복원한다.

## 경계

- 표지 `Teamver 소개`는 유지
- `첫 7일` 등 keepable 본문은 **첫 등장**은 유지. 덱 뒤쪽에서 같은 문장이 반복될 때만 교체
- CTA 라벨은 `Teamver 시작하기`로만 정규화, 버튼 셸은 유지
- fillMode / MiniMax 호출 정책은 유지 (`json` default)
- 킷 선정(회사 소개 → product-launch)은 여전히 범위 밖
