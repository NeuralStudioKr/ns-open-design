# 0916-N03-1 상위설계 · 8-Bit Orbit 카탈로그 카피 힐러

## 배경

사용자 리포트 2026-09-16 (제목 "글을 매력적으로 쓰는 팁") — 8-Bit / Pixel 킷
(Tektur + Chakra Petch + Space Mono, `--neon-cyan`, `data-slide="1"..."10"`)로
생성한 한국어 덱에서 아래 결함 관측:

1. **English 카탈로그 데모 잔재**
   - Cover: `Pixel Perfect Presentation System`, `hero-badge` 3개 (`10 Slides`
     / `CSS Native` / `Zero Dependencies`)
   - Split(slide 2/3): `pixel-label` "Mission Brief" / "Core Systems", 본문
     `No canvas limits...`
   - Timeline(slide 6): `Chronology`, `Q1 2026`~`Q4 2026`, English 본문
     (`Wireframes, palette selection...`)
   - Stats(slide 7): `Live Telemetry`, `Active Worlds` 등 label + JS 없이 0으로
     렌더되는 `data-target="847"` counter
   - Quote(slide 8): "— Lead Creative Technologist, Studio Orbital", 카탈로그
     인용문
   - Tiers(slide 9): `Access Tiers`, `Rookie`/`Arcade`/`Boss`, `$0/mo` /
     `$29/mo` / `$79/mo`, feature bullets (`5 slide maximum` ...)
   - CTA(slide 10): `Ready Player One?`, `Initialize Deck`, `View Documentation`

2. **주제와 무관한 합성 개요만 들어감**
   - 제목 "글을 매력적으로 쓰는 팁"인데 카드는 범용 아웃라인. tier/timeline은
     완전히 원본 seed. 같은 shell이 중복.

3. **inline style 폭주**
   - `h3` / `p` style에 `font-size:36px;line-height:1.08;word-break:keep-all;
     overflow-wrap:break-word`가 최대 8번 누적. `appendInlineStyle`가 동일한
     property를 dedupe하지 않고 append함.

## 목표

- 위 8-Bit Orbit 킷 카탈로그 leftover가 한국어 덱에 leak되지 않게.
- tier / timeline / stat / quote / hero-badge 슬롯을 실제 주제 카피로 채우거나,
  주제와 무관한 슬롯은 완전히 드롭.
- `data-target` 카운터를 실제 metric OR ordinal로 대체해서 headless
  render에서 0이 보이지 않게.
- `appendInlineStyle` idempotent — 여러 번 실행해도 style 조각 누적 금지.

## 원인 정리

- **fill 파이프라인 커버리지 부재** — `fillBlockFrameNeoSlots` / `fillStudioKitSlide`
  / `fillCreativeModeKitSlide` 등은 있지만 8-Bit Orbit 킷 슬롯 전용 함수가 없음.
  MiniMax fill은 title/h1/p만 바꾸고 tier/timeline/stat/quote/badge 슬롯은
  seed의 English literal을 그대로 남김. Cover restyle 함수는 `pixel-hero-text`
  만 처리.
- **catalog demo strip 부재** — `stripBlockFrameNeoCatalogDemoCopy` /
  `stripStudioCreativeCatalogDemoCopy` / `stripCapsuleCatalogDemoCopy`는
  있지만 8-Bit Orbit 전용 문자열 strip 함수가 없음. `LEFTOVER_CATALOG_PHRASE_RE`
  에도 8-Bit 문구가 대부분 미포함.
- **`data-target` counter** — JS `IntersectionObserver`가 카운트업 하도록 만든
  slot. static export에서는 `<div class="stat-number" data-target="847">0</div>`
  → "0"만 보이고 label만 "Active Worlds"로 남음.
- **`appendInlineStyle` 누적** — `styleMatch` 뒤에 `${current};${style}`을
  단순 append. 힐러/피어핏이 재실행되면 동일 declaration이 stack. property
  dedupe 필요.

## 슬라이스

1. `packages/contracts/src/template-clone-fill.ts`
   - `fillEightBitOrbitKitSlide(body, attrs, input)` 신규
     - cover: `hero-subtitle` (lead 대체), `hero-badge` × 3 (주제 라벨)
     - `pixel-label` chrome (Mission Brief / Chronology / Live Telemetry / Access Tiers) → chromeLabel
     - timeline-event × N: `.date` → `STEP 01..N`, `h4` → fillLine.title, `p` → fillLine.body
     - stat-block × N: `.stat-number` (data-target/suffix 제거) → metric/ordinal, `.stat-label` → 주제 label
     - tier-card / tier-grid: Korean writing-tips 덱에는 tier 개념이 없음 → 통째로 strip
     - quote-author: wipe (fabricated attribution 금지), quote-text: lead/bodyText 삽입
     - pixel-btn: `Select` / `Initialize Deck` / `View Documentation` 등 English CTA → "자세히 보기"
   - `stripEightBitOrbitCatalogDemoCopy(html)` 신규
     - `EIGHTBIT_DEMO_COPY_RE` — Pixel Perfect Presentation System / Access Tiers / Rookie / $29/mo /
       Studio Orbital / Active Worlds / Q1 2026 등 문자열 wipe
   - `healEightBitOrbitLeftoverCatalogCopy(html, brief)` 신규
     - `officialLookIsEightBitOrbit` OR 구조적 marker guard
     - 슬라이드 스팬 순회 → shell별로 `fillEightBitOrbitKitSlide` 재적용
   - fill 파이프라인 (`fillTemplateCloneSlideShellForOutline`)에 `fillEightBitOrbitKitSlide` + `stripEightBitOrbitCatalogDemoCopy` wiring
   - heal 파이프라인 (`applyFillHealers`)에 `healEightBitOrbitLeftoverCatalogCopy` wiring
   - `appendInlineStyle` 리팩터 — `mergeCssDeclarations` 헬퍼로 property 기준 dedupe (동일 property 재적용 시 최신 값만 유지)
2. Fixture · 유닛 테스트
   - `tests/fixtures/loop540-eightbit-orbit-korean-writing-tips.html` (사용자 HTML 기반, 10 슬라이드 축약)
   - `루프540 —` 8-Bit Orbit tier / timeline / stat / quote / cover / stripEightBitOrbitCatalogDemoCopy / appendInlineStyle idempotency 테스트 7건
3. 문서화 (`docs-teamver/0916-N03-*`)
4. commit → push (staging). ns-open-design은 ns_cicd 미등록 — CICD subagent 없음.

## 검증

- `pnpm --filter @open-design/contracts test --run template-clone-fill` 269 pass (7 신규)
- 전체 `pnpm --filter @open-design/contracts test --run` 3190 pass
