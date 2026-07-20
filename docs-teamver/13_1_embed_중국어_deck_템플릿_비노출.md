# Teamver embed — 중국어 deck 템플릿 비노출 (1차 출시)

embed 1차 출시(`slideOnlyMvp`)에서는 **미리보기·썸네일에 중국어가 절반 이상**인 deck 템플릿을
갤러리·커뮤니티·설정에서 비노출한다. standalone OD에는 영향 없다.

**정책 코드:** `apps/web/src/teamver/branding/embedChineseDeckTemplatePolicy.ts`  
**관련:** [13_embed_슬라이드_MVP_기능게이트](./13_embed_슬라이드_MVP_기능게이트.md)

---

## 1. 배경

- design-templates에는 `isChinese` 같은 전용 필드가 없었다.
- `slideOnlyMvp`는 `mode: deck`만 필터링해 **deck 53개 전부**가 노출되었다.
- `disabledSkills`는 embed slide-only에서 deck에 적용되지 않는다.

1차 출시 대상 사용자(한국어 UI)에게 중국어 데모 문구가 먼저 보이지 않도록,
`example.html` 기준으로 preview 텍스트를 분석한 뒤 비노출 목록을 확정했다.

---

## 2. 분석 방법

| 항목 | 기준 |
|------|------|
| **썸네일** | `example.html` 1번 슬라이드 가시 텍스트 (bake `poster.jpg` 첫 프레임) |
| **호버 미리보기** | 처음 6슬라이드 가시 텍스트 (bake slide-walk, `MAX_SLIDES=6`) |
| **중국어 비율** | 한자 수 ÷ (한자 + 영문 알파벳) |

**한계:** 글자 수 기준이라 글자 크기·레이아웃 면적은 반영하지 않는다.
표지 대제목이 중국어 중심인데 비율이 낮게 나오는 경우가 있어, 경계 템플릿은 수동 포함했다.

**분석 대상 파일**

- 대부분: `design-templates/<slug>/example.html`
- `magazine-web-ppt`(guizang): `plugins/_official/examples/guizang-ppt/assets/example-slides.html`

---

## 3. 분류 결과 (deck 53개)

### 3.1 썸네일 중국어 ≥50% — 6개

| 템플릿 ID | 썸네일 | 호버(6슬) | 비고 |
|-----------|--------|-----------|------|
| `html-ppt-xhs-white-editorial` | 89% | 48% | 小红书 스타일 |
| `html-ppt-presenter-mode` | 80% | 77% | 폴더: `html-ppt-presenter-mode-reveal` |
| `html-ppt-testing-safety-alert` | 69% | 42% | |
| `magazine-web-ppt` | 68% | 44% | guizang, plugin: `example-guizang-ppt` |
| `html-ppt-graphify-dark-graph` | 68% | 41% | |
| `html-ppt-knowledge-arch-blueprint` | 54% | 35% | |

### 3.2 경계 구간 (썸네일 25~49% 또는 호버 ≥50%) — 5개

정책상 **1차 출시 비노출에 포함** (넉넉한 기준).

| 템플릿 ID | 썸네일 | 호버(6슬) | 비고 |
|-----------|--------|-----------|------|
| `html-ppt-xhs-pastel-card` | 49% | 54% | 호버 시 중국어 과반 |
| `html-ppt-obsidian-claude-gradient` | 48% | 37% | |
| `html-ppt-weekly-report` | 35% | 2% | 표지만 중영 혼합 |
| `html-ppt-hermes-cyber-terminal` | 31% | 19% | 터미널 UI + 중국어 |
| `html-ppt-tech-sharing` | 20%* | 15% | *표지 대제목 중국어 중심 — 수동 포함 |

### 3.3 영어 중심 — 42개 (노출 유지)

- `html-ppt-zhangzara-*` 32개 전부
- `simple-deck`, `kami-deck`, `ib-pitch-book`, `open-design-landing-deck`, `replit-deck`, `weekly-update`
- `html-ppt-pitch-deck`, `html-ppt-product-launch`, `html-ppt-course-module` 등

### 3.4 미리보기 없음 / 부모 카탈로그

| ID | 비고 |
|----|------|
| `html-ppt` | 자식 템플릿 묶음 부모, `aggregatesExamples`로 갤러리 카드 숨김 |
| `replit-deck` | `examples/*.html` 파생 카드 — 영어 데모, **노출 유지** |

---

## 4. 구현 (embed 1차 출시)

### 4.1 비노출 SSOT

`EMBED_HIDDEN_CHINESE_PRIMARY_DECK_TEMPLATE_IDS` (14개 + guizang family) — SSOT: `@open-design/contracts` `embed-chinese-deck-policy.ts`

```
magazine-web-ppt
deck-guizang-editorial   # plugin-only — Community "Guizang 에디토리얼 E-Ink 덱"
deck-open-slide-canvas   # plugin/skill — Community "Open-Slide 1920 캔버스 덱"
ppt-keynote              # plugin/skill — Keynote 스타일 중국어 제품소개 데모
html-ppt-xhs-white-editorial
html-ppt-presenter-mode
html-ppt-testing-safety-alert
html-ppt-graphify-dark-graph
html-ppt-knowledge-arch-blueprint
html-ppt-xhs-pastel-card
html-ppt-obsidian-claude-gradient
html-ppt-hermes-cyber-terminal
html-ppt-weekly-report
html-ppt-tech-sharing
```

**적용 위치**

| 영역 | 계층 | 헬퍼 / env |
|------|------|------------|
| `/api/design-templates` listing·detail | **daemon** | `OD_DESIGN_TEMPLATES_EXCLUDE_ZH_CN=1` + `filterDesignTemplatesExcludingChinesePrimary` |
| `/api/plugins` listing·detail (deck examples) | **daemon** | 동일 env + `filterPluginsExcludingChinesePrimaryDeck` |
| Design templates 갤러리 / 설정 | web (이중 안전선) | `isDesignTemplateEnabled`, `isDesignTemplateVisibleInSettings` |
| Community deck 플러그인 | web (이중 안전선) | `pluginsForSlideOnlyMvp` |
| Skills listing (deck 템플릿) | web (이중 안전선) | `skillsForSlideOnlyMvp` |

Teamver embed staging은 `.env.staging` 에 `OD_DESIGN_TEMPLATES_EXCLUDE_ZH_CN=1` 을
`OD_PLUGIN_CATALOG_DEFAULT_MODE=deck` · `OD_SKILLS_CATALOG_SLIDE_ONLY=1` 과 함께 설정한다.
standalone OD(daemon env 미설정)는 API·UI 모두 풀 카탈로그.

`slideOnlyMvp: false`(standalone OD web)에서는 FE 필터 미적용.

### 4.2 plugin ID ↔ template ID 매핑

| plugin id | template id |
|-----------|-------------|
| `example-guizang-ppt` | `magazine-web-ppt` |
| `example-deck-guizang-editorial` | `deck-guizang-editorial` |
| `example-html-ppt-presenter-mode-reveal` | `html-ppt-presenter-mode` |
| `example-<template-id>` | `<template-id>` (그 외) |

---

## 5. 메타데이터 (`od.content_locale`)

비노출 목록 deck 템플릿 `SKILL.md` / `open-design.json` 에 추가:

```yaml
od:
  mode: deck
  content_locale: zh-CN
```

daemon `listSkills` / `/api/design-templates` 응답에 `contentLocale` 필드로 노출된다.
plugin 목록은 `open-design.json` `od.content_locale` 을 `readOdContentLocale` 로 읽는다.
embed 필터는 **denylist + `contentLocale === 'zh-CN'` + guizang deck family id (`*guizang*`, `magazine-web-ppt`)** 삼중 조건 — 이후 템플릿은 메타만으로도 자동 비노출 가능.

| 필드 | 용도 |
|------|------|
| `od.content_locale: zh-CN` | 데모·프롬프트·미리보기가 중국어 중심 |
| (미래) `od.content_locale: en` | 명시적 영어 중심 — denylist 없이 노출 |

`zh_name` / `en_name`은 functional `skills/` 에만 쓰이고 design-templates에는 없었다.
1차 출시 이후 i18n 표시명이 필요하면 `en_name`/`zh_name`을 design-templates에도 추가할 수 있다.

---

## 6. 게이트 체크리스트

| ID | 항목 | 상태 |
|----|------|------|
| S-5c | embed Community + Design templates — 중국어 deck 14개 + guizang family 비노출 | ✅ |
| S-5c-meta | `od.content_locale: zh-CN` + API `contentLocale` | ✅ |
| S-5c-guard | daemon `embed-chinese-deck-catalog-guard` — bundled deck preview 중국어 중심 → 정책 커버 강제 | ✅ |

**수동 검증**

1. staging embed Home 커뮤니티 — `Guizang`, `XHS`, `Hermes 사이버`, `Open-Slide 1920 캔버스 덱`, `Keynote` 등 카드 미노출
2. Settings → Design templates — 동일 중국어 deck 미노출
3. standalone OD — 해당 템플릿 정상 노출

---

## 7. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-20 | `deck-open-slide-canvas` / `ppt-keynote` 누락 보완 + catalog guard 테스트 |
| 2026-07-10 | `deck-guizang-editorial` / `example-deck-guizang-editorial` 누락 보완 + guizang family id 규칙 |
| 2026-07-09 | preview HTML 분석, 11개 비노출·`content_locale` 메타·정책 코드 반영 |
