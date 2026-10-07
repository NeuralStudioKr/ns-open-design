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

## 후속 (1006-N01 슬라이스 5 — pack dump / 반복 kicker)

실측 10장(www.teamver.com 서비스 소개)은 persist heal이 지나도 **같은 마감 문장**이 kicker·testimonial·CTA·lede에 반복되고, 표지에 `.hero-shot`이 없으며, `나눠같이` / `한다.를` 조사가 깨진다. fillMode(`json`)는 유지한다.

28. **pack close dump** — `쓸 방을 열고 첫 보드에 팀을 초대한다`가 CTA/인용/lede에 있으면 제거한다. CTA는 `${topic} 시작하기`, 인용·lede는 짧은 다른 문장으로 교체한다. kicker dump는 역할별 짧은 라벨로 교체한다.
29. **문장형 kicker** — 24자 이상 `다/요`로 끝나는 kicker는 본문이지 라벨이 아니다. 역할별 짧은 kicker로 교체한다.
30. **동일 kicker 반복** — `Teamver 한눈에`가 여러 장에 있으면 표지만 남기고 나머지는 역할별 라벨로 분기한다.
31. **표지 hero-shot** — cover에 `.hero-shot`이 없으면 공식 chrome을 flow 밖에 삽입한다.
32. **깨진 조사** — `나눠같이` → `나눠 같이`, `한다.를` → `한 것을`.

## 후속 (1006-N01 슬라이스 6 — 2026-10-06 실측 리그레션)

슬라이스 5가 배포된 뒤에도 같은 사용자 재생성에서 **빈약 좌캠·역할 불일치·중복 kicker**가 남는다. fillMode(`json`)는 유지한다.

33. **빈 dim-dot 캡션 제거** — `<p class="dim …"> · </p>` 또는 비어 있는 `<p class="dim …"></p>`는 pack-dump heal이 testimonial / byline을 날린 뒤 남는 orphan이다. 캡션만 있는 p는 삭제해 좌캠에 가운데 점 하나만 남는 것을 막는다.
34. **kicker↔h1 "문제" 중복 끊기** — synth가 kicker에 `${topic}가 풀어야 하는 문제`를 넣고 h1에도 `${topic}가 해결하는 문제`를 넣으면 의미가 반복된다. kicker와 heading이 같은 명사(`문제|주제|과제|쓰임새|쓰는 자리|작업 흐름`)를 공유할 때만 kicker를 index-기반 짧은 라벨로 교체한다. 브랜드 문자열만 겹치면 유지한다.
35. **price-card 슬라이드 h2 정합** — price-card가 2장 이상인 슬라이드의 h2가 `남기는 증거` / `묶는 일` / `모으는 일` / `운영 근거` / `${topic} 운영`이면 price-card 내용과 어긋난다. h2를 `${topic} 쓰임새`로 교체한다. 끝에 `증거`만 있는 정상 제목은 유지한다. 가격·amount는 지어내지 않는다.
36. **Ship CTA 좌캠 lede 복구** — CTA와 같은 행의 `flex:1` 칸이 비어 있을 때만 `${topic}에서 보드를 열고 함께 고칠 사람을 부른다. 초안과 수정이 한 흐름이 된다.` lede를 넣는다. `flex:1.5`, 이미지·카드가 있는 칸, CTA가 들어 있는 칸은 유지한다. 색은 킷 `.lede` / `.slide.dark .lede`에 맡긴다.
37. **방어적 조사 heal** — `healProductLaunchStructuralQuality` 마지막에 `나눠같이` → `나눠 같이`, `한다.를` → `한 것을` (`초대한다.를` → `초대한 것을`)을 다시 적용한다.

## 후속 (1006-N01 슬라이스 7 — 2026-10-07 재생성)

슬라이스 5/6 kicker와 price-card h2(`쓰임새`)는 이미 반영된 덱에서도 표지가 비고, `나눠같이`·끝 중점·헤드폰 글리프·2칸 와이드 슬라이드가 남는다. fillMode(`json`)는 유지한다. 가격·KPI는 짓지 않는다.

38. **표지 chrome** — `.dark.slide-title`은 `.center`가 아니라서 `fillProductLaunchSparseCenterSlides`가 lede를 넣지 않았다. cover/center가 kicker+제목뿐이면 role lede를 둔다. 첫 장이 h1만 있고 카드가 없으면 `.dark` / `.slide-title` / `.center` / `[data-od-slide-flow]`가 없어도 lede를 둔다. `.hero-shot`이 이미 있으면 복제하지 않는다. 없을 때만 flow가 있으면 그 형제, 없으면 표지 끝에 넣는다. head CSS의 `.hero-shot`은 노드로 세지 않는다. 빈 `.deck-footer`는 제거한다. kicker는 h1/h2 앞에 두고, flow는 제목이 없을 때만 폴백이다.
39. **빈 motif strip** — `sanitizePersistedDeckHostLeaks`가 salvage 뒤에 `stripEmptyOfficialMotifInstances`를 돌린다. 방금 넣은 빈 hero-shot이 여기서 삭제되고 head의 `[data-od-official-motif-html].hero-shot` CSS만 남았다. product-launch `.hero-shot`은 CSS paint라 strip에서 제외하고, strip 뒤에 cover ensure와 조사 치환을 한 번 더 적용한다.
40. **나눠같이** — `genericSlideCopyPack` 등 팩 문장은 `나눠 같이`다. persist는 붙임·제로폭·태그 사이 형태까지 `나눠 같이`로 고치고, service-intro synth가 `나눠같이`를 내면 실패하는 회귀를 둔다.
41. **끝 중점** — dim/lede 문장 끝의 ` · ` / ` • `만 제거한다. `초안·리뷰·버전`처럼 단어 사이 붙임표는 유지한다. 점만 있는 문단 삭제는 슬라이스 6 그대로다.
42. **헤드폰 글리프** — product-launch `feature-card`의 `♪ ◈ ◐ ✦ ✧` 아이콘만 제거한다. 다른 킷은 건드리지 않는다.
43. **2칸 와이드** — step / feature-card / card가 정확히 2개면 `PRODUCT_LAUNCH_ALT_CARD_TITLES`에서 아직 안 쓴 제목(같은 보드·권한 경계·결과 이력…)과 기존 팩 본문을 세 번째로 붙인다. `g2`는 `g3`로 되돌린다. price-card·가격은 추가하지 않는다. step 슬라이드에 kicker가 없으면 `정착 순서`를 둔다.

## 경계

- 표지 `Teamver 소개`는 유지
- `첫 7일` 등 keepable 본문은 **첫 등장**은 유지. 덱 뒤쪽에서 같은 문장이 반복될 때만 교체
- CTA 라벨은 `Teamver 시작하기`로만 정규화, 버튼 셸은 유지
- fillMode / MiniMax 호출 정책은 유지 (`json` default)
- 킷 선정(회사 소개 → product-launch)은 여전히 범위 밖

## 변경 이력

| 2026-10-07 13:11 | 슬라이스 7 flat — 표지 lede의 .dark 게이트 제거, 기존 hero-shot은 복제하지 않음 |
| 2026-10-07 13:10 | 슬라이스 7 — 표지 hero/lede, 빈 motif strip, 나눠같이, 끝 중점, 헤드폰 글리프, 2칸 와이드 |
