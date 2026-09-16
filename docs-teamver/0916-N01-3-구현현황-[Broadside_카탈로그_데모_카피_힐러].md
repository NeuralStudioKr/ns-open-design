# 0916-N01-3 구현현황 · Broadside 카탈로그 데모 카피 힐러

## 진행 요약
- ☑ `BROADSIDE_STAT_VALUE_DEMO_RE`, `BROADSIDE_LEFTOVER_BODY_RE`, `LEFTOVER_CATALOG_PHRASE_RE` 추가.
- ☑ `fillStudioKitSlide`에 `slide--diagram`, `slide--pie`, `slide--fadelist` 슬롯 채우기 브랜치 확장.
- ☑ `.stat-value` 정책: metric 있으면 대체, literal demo pattern이면 ordinal, 그 외 seed 유지.
- ☑ `.slide-foot .label` / `.broadside-num` chrome wipe에 `Broadside`, `[Studio X]`, `^N / N$` 케이스 추가.
- ☑ `healBroadsideLeftoverCatalogCopy` 신규 + `applyFillHealers`에 wiring.
- ☑ `deck-fixed-canvas.ts` FIXED_CANVAS_CSS에 `.slide > [data-od-slide-flow] > .slide-body { flex:1 1 auto; min-height:0 }` 추가 (loop536 주석).
- ☑ Fixture `loop536-broadside-teamver-empty-bottom.html` 추가.
- ☑ 유닛 테스트 `루프536 — Broadside orange kit demo chrome ...` 추가.
- ☑ `pnpm --filter @open-design/contracts test`: **996 files · 3172 tests all pass**.

## 검증 로그
```
pnpm --filter @open-design/contracts test --run template-clone-fill
→ 251 pass (기존 250 + 신규 1)

pnpm --filter @open-design/contracts test --run deck-fixed-canvas
→ 4 files · 87 tests pass

pnpm --filter @open-design/contracts test
→ 996 files · 3172 tests pass · 112s
```

## 남은 후속 (다음 라운드에서 소화)
- **Round 1 (a)**: 다른 공식 킷(EightBit, Coral, Playful, BlockFrame-Neo, Mat, Grove, Signal, Cobalt, Sakura, LongTable, Capsule)의 example.html도 catalog leftover 검사·힐러 확장.
- **Round 2 (b)**: Studio/Signal/Grove/Coral/Playful 등에서도 `.slide-body` flow-wrapper 안 layout 붕괴 여부 재검사.
- **Round 3 (c)**: `TEMPLATE_CLONE_FILL_DEFAULT_MODE`와 env, prompt/deterministic 경로 일관성 검증.
- **Round 4 (d)**: `.stat-value` 데모 검출·중립화 로직을 공통 helper로 추출 (다른 KPI 슬롯 재사용).
- **Round 5 (e)**: LOOK seed / outline / emergency / stalled_partial_deck / deck_patch_parse_failed 회귀 검사.
- **Round 6**: 통합 스위프.
