# 0918-N06-3 구현현황 · Daisy Days / Broadside / Playful 역할 pack

상위설계: `docs-teamver/0918-N06-1-상위설계-[daisy_broadside_playful_역할pack].md`

## 생성 방법

| 경로 | 결과 |
|---|---|
| 실생성 (staging `https://stg-design.teamver.com`) | **못 함.** 브라우저 MCP 탭이 없음. 로그인·API 키·캡차 우회 없음. |
| 오프라인 LOOK seed | **실행.** official `example.html` + brief `Teamver 소개` → salvage + leftover heal. MiniMax 짧은 응답은 2장 채운 모델 → `recoverShortDeckByPaddingToSeed` + salvage. |

fixture: `packages/contracts/tests/fixtures/loop560-live-*.html` (시크릿 없음).

persist / pad / continue / head-banner 정책은 변경하지 않음. healer/fill만. 기존 EightBit / Capsule / BF / Cobalt / Grove / Studio / PL healer는 되돌리지 않음.

## 검토 (고치기 전)

official: `html-ppt-zhangzara-daisy-days` (10 section), `html-ppt-zhangzara-broadside` (16 slide--*), `html-ppt-zhangzara-playful` (10 div.slide).

| 킷 | pack | healer | 고치기 전 leftover |
|---|---|---|---|
| Daisy Days | 없음 | poster slot만 | `Daisy Days` / `Welcome to Today` / 교실 주간표 / `A Wise Educator` / `Literacy - 33%`. pad에 `개요` |
| Broadside | leftover strip + `fillStudioKitSlide`만 | `healBroadsideLeftoverCatalogCopy` | `$3.5B` / `3×` / `#1` / `[Studio X] Guidelines` / footer `Broadside`. 역할 문장 약함 |
| Playful | 없음 | poster slot만 | `Creative Direction` / `What We Will Cover Today` / `The Collective` / `98%` / `hello@example.studio` |

공통 synth 가드는 item 제목만 막고, 아웃라인 슬라이드 제목 `개요`가 남을 수 있었다.

## 품질 표 (미리보기 vs 생성)

미리보기 = official `example.html`. 생성 = fill+heal. pad = 2장 모델 → seed 장수.

| 킷 | 미리보기 장수 | 생성 | pad | leftover (개요/탐색실행확장/영문 데모/$3.5B/98%) | 한글 tracking | 빈 슬롯 | 문장 다양 | pad 밀도 |
|---|---|---|---|---|---|---|---|---|
| Daisy Days | 10 | 10 | 10 (pad 4) | 없음. 교실 카탈로그·`33%` wipe | 유지. 구체 한국어 ≥20 유지 | 주간/카드/도넛 pack 채움, 가짜 % 없음 | 역할 pack (표지/묶는 일/초안·수정·공유 등) | kit-aware fill |
| Broadside | 16 | 16 | 16 (pad 11) | 없음. `$3.5B`/`3×`/`#1` wipe | 유지 | stat/pie/fadelist pack 채움 | 역할 pack 보강 | kit-aware fill |
| Playful | 10 | 10 | 10 | 없음. `98%`/`47` wipe | 유지 | toc/team/service/stat pack 채움 | 역할 pack | kit-aware fill |

unique 스코어(슬라이드 앞 80자)는 공유 크롬 때문에 낮게 나옴. leftover 제목은 역할별로 다름.

## 고친 점

1. **Daisy Days kit key + leftover healer** (`DAISY_DAYS_KIT_KEY`, `fillDaisyDaysKitSlide`, `healDaisyDaysLeftoverCatalogCopy`). 커버·환영·주간·타임라인·차트·카드·인용·팀·프로세스·도넛 문장. 가짜 KPI wipe만.
2. **Broadside 역할 pack 보강** (`BROADSIDE_KIT_KEY`, `fillBroadsideKitSlide`). 기존 leftover strip은 유지. 커버·챕터·스테이트먼트·스플릿·스탯·페이드리스트·리스트·인용·비교·차트·다이어그램·파이·닫기 문장. `$3.5B` wipe 유지.
3. **Playful kit key + leftover healer** (`PLAYFUL_KIT_KEY`, `fillPlayfulKitSlide`, `healPlayfulLeftoverCatalogCopy`). 커버·목차·스테이트먼트·차트·팀·서비스·타임라인·스탯·갤러리·닫기 문장. 빈 스테이트먼트 셸은 lead를 다시 넣음.
4. **공통 synth 가드** — 세 킷은 kit key 분기로 pack을 타서 `개요`/`탐색·실행·확장` 아웃라인을 넣지 않음. 루프554: 구체 한국어 ≥20자는 덮지 않음.

## 검증

```bash
pnpm --filter @open-design/contracts exec vitest run \
  tests/loop560-offline-repro.test.ts \
  tests/template-clone-fill.test.ts \
  tests/template-clone-outline.test.ts
```

378 passed.

## 다음 후보

역할 pack이 아직 없는 official 킷: Coral, Mat, Biennale Yellow, Cartesian, Bold Poster, Pin and Paper, Blue Professional, Creative Mode, Sakura, Long Table, Raw Grid(leftover strip만), Retro Windows, Signal, Vellum, Soft Editorial, Stencil Tablet, Scatterbrain, Neo Grid Bold, Peoples Platform, Pink Script, Retro Zine, Monochrome, XHS/Taste/weekly/pitch 등.

## 변경 이력

| 2026-09-18 17:18 | 오프라인 LOOK seed 실측 후 Daisy/Broadside/Playful pack + leftover heal. |
