# 0907-N08-2 구현설계 — Studio / Creative leftover denylist (루프476)

상위: [0907-N08-1](./0907-N08-1-상위설계-[Studio_Creative_leftover_denylist].md) · 현황: [0907-N08-3](./0907-N08-3-구현현황-[Studio_Creative_leftover_denylist].md)

## 목표

Studio · Creative Mode 카탈로그 데모가 Hangul Clone/persist에 남지 않게 한다. Cobalt `healCobaltLeftoverCatalogCopy` / Sakura `healSakuraLeftoverCatalogCopy` 패턴을 따른다.

## 파일

| 경로 | 역할 |
|------|------|
| `packages/contracts/src/template-clone-fill.ts` | denylist · strip · look 감지 · kit fill · persist heal |
| `packages/contracts/tests/helpers/deterministic-template-quality-gate.ts` | Studio/Creative `demoMustNotInclude` · cross denylist |
| `packages/contracts/tests/template-clone-fill.test.ts` | 게이트 + persist heal 회귀 |

## 구현

### 1. Denylist / 감지

`LEFTOVER_CATALOG_PHRASE_RE` + `looksLikeLeftoverTemplateDemoDeck`에 Studio·Creative 지문 추가.

**Studio (본문):** `WHO WE ARE` · `GREAT WORK DOESN'T HAPPEN` · `WE BUILD WHAT OTHERS PLAN` · `Our studio pairs` · `Years of practice` · `Projects delivered` · `Continents active` · `GENERIC IDENTITY` · `A DISTINCTIVE VOICE` · `BOLD IDEAS DESERVE` · `[Studio Name]` · `[Client Name]` · `[Presentation Title]` · `[Caption —` · `[City A]` 등.

**Creative (본문):** `eight pages, eight layouts` · `Replace freely` · `Lift In Engagement` · `Throughput Multiplier` · `Active Placeholders` · `Total Sample Value` · `Placeholder caption` · `Layer alpha` · `VALUES ARE PLACEHOLDER` · `PLACEHOLDER METRIC` · `Generic placeholder` · `Filler text` · `FY PLACEHOLDER` · `CHAPTER OPENER` · `A PRESENTATION TEMPLATE` 등.

구조 라벨 `BEFORE`/`AFTER` · motif `poster` · CSS 토큰은 건드리지 않는다.

별도 `STUDIO_CREATIVE_DEMO_COPY_RE` + `stripStudioCreativeCatalogDemoCopy`를 fill 슬라이드·문서 단위에 Block Frame과 같이 호출(이중 안전).

### 2. Look 감지

- `officialLookIsStudio`: `--c-accent` + (`slide--cover`|`stat-card`) + `slide-chrome` / `compare-panel`
- `officialLookIsCreativeMode`: `(^|\s)s[1-8](\s|$)` 셸 + `poster` + (`data-screen-label`|Archivo|--cream)

Cobalt/Sakura와 상호 배제.

### 3. Fill-time kit

`fillSlideShell` 말미에서:

- Studio: `cover-meta` 컬럼 · `chapter-num` · `.lead` · `stat-label`/`stat-note`(값 `.stat-value` 유지) · compare panel h3/lead/li · `quote-text`/`quote-attr` · chrome `Our Work` 류 데모 label
- Creative: `.footnote` · `.title.display` · s3 `.lbl`/`.desc`(`.num` 유지) · legend Layer · `.sub.body` · `.note` · topbar/pill 데모(`FY PLACEHOLDER` 등)

그 다음 `stripStudioCreativeCatalogDemoCopy` + `stripLeftoverCatalogDemoPhrases`.

### 4. Persist heal

`healStudioLeftoverCatalogCopy` / `healCreativeLeftoverCatalogCopy`:

1. look 아니면 return
2. Hangul(본문 또는 brief) 없으면 return (영문 example no-op)
3. leftover 지문 있는 셸만 outline으로 kit fill
4. `stripLeftoverCatalogDemoPhrases`

`sanitizePersistedDeckHostLeaks`(또는 동일 persist 체인)에서 Cobalt/Sakura heal 다음에 호출.

### 5. Quality gate

| Spec | demoMustNotInclude (추가) |
|------|---------------------------|
| Studio | `WHO WE ARE`, `Our studio pairs`, `Years of practice`, `[Studio Name]`, `A DISTINCTIVE VOICE` |
| Creative Mode | 기존 `FLIP THE` + `Lift In Engagement`, `Throughput Multiplier`, `Layer alpha`, `VALUES ARE PLACEHOLDER`, `eight pages` |

`CROSS_TEMPLATE_LEFTOVER_DENYLIST`에 공통 강한 지문 일부 추가.

## 테스트

- contracts quality-gate `it.each` Studio/Creative (기존 + 확장 denylist)
- `루프476: Studio Hangul clone scrubs catalog leftover`
- `루프476: Creative Mode Hangul clone scrubs catalog leftover`
- `루프476: persist leftover refill …` Studio + Creative (영문 example no-op)

## 비범위

- cover lead / site outline / layout smoke
- MiniMax live · Playwright screenshot
- KPI 숫자 발명

## 변경 이력

| 2026-09-07 18:20 | 루프476 구현설계 |
