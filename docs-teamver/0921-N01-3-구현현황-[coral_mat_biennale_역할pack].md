# 0921-N01-3 구현현황 · Coral / Mat / Biennale Yellow 역할 pack

상위설계: `docs-teamver/0921-N01-1-상위설계-[coral_mat_biennale_역할pack].md`

## 생성 방법

| 경로 | 결과 |
|---|---|
| 실생성 (staging) | **못 함.** 브라우저 탭/로그인 우회 없음. |
| 오프라인 LOOK seed | **실행.** official `example.html` + brief `Teamver 소개` → salvage + leftover heal. MiniMax 짧은 응답은 2장 채운 모델 → `recoverShortDeckByPaddingToSeed` + salvage. |

fixture: `packages/contracts/tests/fixtures/loop561-live-*.html` (시크릿 없음).

persist / pad / continue / head-banner 정책은 변경하지 않음. healer/fill만. 기존 Daisy / Broadside / Playful / EightBit / Capsule / BF / Cobalt / Grove / Studio / PL healer는 되돌리지 않음.

역할 pack 코드는 `2f7fb88827`에 이미 들어 있다. 이 슬라이스는 오프라인 재현 고정과 Coral pad에서 빈 statement 슬라이드가 떨어지는 갭만 닫는다.

## 품질 표 (미리보기 vs 생성)

미리보기 = official `example.html`. 생성 = fill+heal. pad = 2장 모델 → seed 장수.

| 킷 | 미리보기 장수 | 생성 | pad | leftover | 한글 tracking |
|---|---|---|---|---|---|
| Coral | 10 | 10 | 10 (marker 0 — 기존 `div.slide` 셸을 채움) | 없음. `VENTURE` / `QUARTERLY` / `01 / Overview` / `+147%` wipe | 유지 |
| Mat | 9 | 9 | 9 | 없음. `[Studio Name]` / `Craft Matters` / `4.7k` wipe | 유지 |
| Biennale Yellow | 8 | 8 | 8 | 없음. `Aurora` / `Public attendance` / `76,400` wipe | 유지 |

## 고친 점

1. **Coral / Mat / Biennale kit key + leftover healer** (`CORAL_KIT_KEY` / `MAT_KIT_KEY` / `BIENNALE_YELLOW_KIT_KEY`, `fill*KitSlide`, `heal*LeftoverCatalogCopy`). 커버·스테이트먼트·필러·스탯·임팩트·카드·인용·타임라인·팀·닫기 문장.
2. **공통 synth 가드** — 세 킷은 kit key 분기로 pack을 타서 `개요`/`탐색·실행·확장` 아웃라인을 넣지 않음. 루프554: 구체 한국어 ≥20자는 덮지 않음.
3. **Coral pad statement 재구성** — pad merge가 `slide-2` 안 `big-statement` 크롬을 지우면 healer가 건너뛰고 `dropEmptyDeckSlides`가 한 장을 떨어뜨렸다. `slide-N` host만으로 chrome으로 보고, 빈 `slide-2`에 section-label / big-statement / body-text를 다시 넣는다.

## 검증

```bash
pnpm --filter @open-design/contracts exec vitest run tests/loop561-offline-repro.test.ts
```

## 다음

킷 키 없는 기본·임의 템플릿 leftover는 [0921-N02](./0921-N02-3-구현현황-[공통_leftover_역할문장].md).

## 변경 이력

| 2026-09-21 14:28 | 오프라인 LOOK seed 재현 + Coral pad statement 빈 슬라이드 재구성. |
