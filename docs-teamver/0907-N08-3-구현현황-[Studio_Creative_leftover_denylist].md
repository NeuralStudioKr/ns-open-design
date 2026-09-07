# 0907-N08-3 구현현황 — Studio / Creative leftover denylist (루프476)

상위: [0907-N08-1](./0907-N08-1-상위설계-[Studio_Creative_leftover_denylist].md) · 설계: [0907-N08-2](./0907-N08-2-구현설계-[Studio_Creative_leftover_denylist].md)

## 진행

| 항목 | 상태 |
|------|------|
| 상위·구현설계 git 선행 | ☑ |
| denylist + leftover 감지 | ☑ |
| Studio/Creative kit fill | ☑ |
| persist heal + 영문 no-op | ☑ |
| quality gate demoMustNotInclude | ☑ |
| contracts 회귀 테스트 | ☑ |
| 54-2 · 00 누적 루프476 | ☑ |
| commit + push origin/staging | ☐ |

## 결정

- 에픽 번호: **0907-N08** (N07에서 명시 이관된 54-2 #4).
- Cobalt/Sakura와 동일하게 fill scrub + Hangul-only persist heal.
- KPI `.stat-value` / `.num` 유지.
- Studio example.html의 `</span\n>` 줄바꿈 닫힘 — chrome wipe는 `<\/span\s*>` 필수 (본문 통째 삭제 방지).

## 구현 요약

- `officialLookIsStudio` / `officialLookIsCreativeMode`
- `fillStudioKitSlide` / `fillCreativeModeKitSlide` + `stripStudioCreativeCatalogDemoCopy`
- `healStudioLeftoverCatalogCopy` / `healCreativeLeftoverCatalogCopy`
- `LEFTOVER_CATALOG_PHRASE_RE` · `looksLikeLeftoverTemplateDemoDeck` · quality gate denylist 확장

## 검증

- ☑ contracts `루프476` ×4
- ☑ Zhangzara quality gates (Studio/Creative 포함 `it.each`)

## 변경 이력

| 2026-09-07 18:30 | 구현·검증 완료 |
| 2026-09-07 18:20 | 현황 초안 |
