# 0918-N05-3 구현현황 · EightBit Orbit / Capsule 역할 pack과 leftover

상위설계: `docs-teamver/0918-N05-1-상위설계-[eightbit_capsule_역할pack].md`

## 생성 방법

| 경로 | 결과 |
|---|---|
| 실생성 (staging `https://stg-design.teamver.com`) | **못 함.** 브라우저 MCP가 탭을 열지 못함 (`No browser tab available`). 로그인·API 키·캡차 우회 없음. |
| 오프라인 LOOK seed | **실행.** official `example.html` + brief `Teamver 소개` → salvage + leftover heal. MiniMax 짧은 응답은 2장 채운 모델 → `recoverShortDeckByPaddingToSeed` + salvage. |

fixture: `packages/contracts/tests/fixtures/loop559-live-*.html` (시크릿 없음).

persist / pad / continue / head-banner 정책은 변경하지 않음. healer/fill만. 기존 BF / Cobalt / Grove / Studio / PL healer는 되돌리지 않음.

## 검토 (고치기 전)

official: `html-ppt-zhangzara-8-bit-orbit` (10 section), `html-ppt-zhangzara-capsule` (10 div.slide).

| 킷 | pack | healer | 고치기 전 leftover |
|---|---|---|---|
| EightBit | fill/heal만. kit key·역할 pack 없음 | `healEightBitOrbitLeftoverCatalogCopy` | `개요` 킥커. pad에 `핵심 포인트`/`파일럿` |
| Capsule | 없음 | `stripCapsuleCatalogDemoCopy`만 | `개요`/`핵심 포인트`. pad에 영문 데모·`340%`/`12.4M` |

공통 synth 가드는 item 제목만 막고, 아웃라인 슬라이드 제목 `개요`가 pixel-label/h2로 남았다.

## 품질 표 (미리보기 vs 생성)

미리보기 = official `example.html`. 생성 = fill+heal. pad = 2장 모델 → seed 장수.

| 킷 | 미리보기 장수 | 생성 | pad | leftover (개요/탐색실행확장/영문 데모/Rookie/$0) | 한글 tracking | 빈 슬롯 | 문장 다양 | pad 밀도 |
|---|---|---|---|---|---|---|---|---|
| EightBit | 10 | 10 | 10 (pad 4) | 없음. Rookie/`$0`/Pixel Perfect 스크럽 유지 | 유지 | 차트/스탯 라벨 pack 채움, 가짜 % 없음 | 역할 pack (표지/묶는 일/초안·수정·공유 등) | kit-aware fill |
| Capsule | 10 | 10 | 10 | 없음. `340%`/`12.4M` wipe | 유지. 구체 한국어 ≥20 유지 | pillar/chart/stat/timeline pack 채움 | 역할 pack | kit-aware fill |

unique 스코어(슬라이드 앞 80자)는 공유 크롬 때문에 낮게 나옴. leftover 제목은 역할별로 다름.

## 고친 점

1. **EightBit 역할 pack** (`EIGHTBIT_ORBIT_KIT_KEY`). synth·fill·heal이 커버/인트로/피처/차트/타임라인/스탯/인용/티어/닫기 문장을 넣음. leftover `개요` pixel-label·h2 교체. 영문 데모(Rookie, `$0/mo`, Pixel Perfect) 스크럽 유지.
2. **Capsule kit key + leftover healer** (`CAPSULE_KIT_KEY`, `fillCapsuleKitSlide`, `healCapsuleLeftoverCatalogCopy`). 역할별 Teamver 문장. 가짜 KPI wipe만. 루프554: 구체 한국어 ≥20자는 덮지 않음.
3. **공통 synth 가드** — 두 킷은 kit key 분기로 pack을 타서 `개요`/`탐색·실행·확장` 아웃라인을 넣지 않음. 기존 N03 sanitize도 유지.

## 검증

```bash
pnpm --filter @open-design/contracts exec vitest run \
  tests/loop559-offline-repro.test.ts \
  tests/template-clone-fill.test.ts \
  tests/template-clone-outline.test.ts
```

377 passed.

## 다음 후보

Daisy Days / Broadside / Playful 등 아직 역할 pack이 없는 official 킷. Grove pad 일부 장식 라벨 영문 크롬.

## 변경 이력

| 2026-09-18 16:06 | 오프라인 LOOK seed 실측 후 EightBit/Capsule pack + leftover heal. |
