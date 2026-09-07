# 0907-N06-2 구현설계 — 사이트 분석 → prompt-fill outline 주입

**날짜:** 2026-09-07 · **루프:** 469  
**상위:** [0907-N06-1](./0907-N06-1-상위설계-[사이트분석_prompt-fill_outline_주입].md)

## 변경 파일

| 파일 | 역할 |
|------|------|
| `apps/web/src/teamver/templateCloneContentFill.ts` | helper + prompt-fill/json seed에 outline 주입 · compact brief가 URL 분석 보존 |
| `apps/web/tests/teamver/templateCloneContentFill.test.ts` | seed / helper 회귀 |
| `docs-teamver/0907-N06-*` · `00` · `54-2` | 문서 |

## 로직

### A. 감지

요청·brief 결합 텍스트가 `looksLikeTemplateCloneServiceIntroBrief` (contracts: `사이트|서비스 소개|www.|https?://`)이면 website analysis 모드.

### B. 앵커 추출 (`extractWebsiteAnalysisAnchorsFromBrief`)

brief에서 가능하면:

- URL (`www.` / `https?://`)
- Canvas/Visible/Source headings (`A / B / C`)
- Source preview 앞 N줄 (짧은 불릿)
- cover topic (`deriveTemplateCloneTopicLabel` / brand 힌트)

fetch 본문은 이 턴의 `<web-fetch-context>`에 이미 있음 → seed는 “이 컨텍스트의 제목·헤딩·카피를 섹션에 바인딩” 지시.

### C. outline 블록 (`buildWebsiteServiceIntroOutlineInstruction`)

기존 한 줄:

> If the source is a website or product URL, build a real service-introduction deck…

를 **구조화 블록으로 교체/강화**:

```
Website/product analysis outline (REQUIRED):
1. Cover — brand/product name (not raw URL)
2. Problem/context — …
3. Product promise — …
4. Core workflow — …
5. Key features — 2–4 named features from source
6. User/team use cases
7. Closing / adoption
Bind every section to [Source brief] and <web-fetch-context> facts.
Source anchors: …
FORBIDDEN: shallow-only decks (brand intro + "한눈에" / title-only sections).
Keep: do not invent quantitative KPIs …
```

### D. 주입 지점

1. `buildTemplateClonePromptFillSeed` — 기존 website 한 줄 대신 outline 블록
2. `buildTemplateCloneContentFillSeed` — hard rules 뒤 또는 brief 앞에 동일 블록(싸면)
3. `compactTemplateCloneFillSourceBrief` — service-intro URL/분석 문장은 instruction drop 전에 **보존**

### E. 비범위

- Zhangzara gate 확대
- daemon deterministic synth lead(`한눈에`) 전면 교체 (별 백로그; prompt-fill 경로가 우선)
- web-fetch adapter / reader backend 변경

## 검증

- unit: service-intro seed에 outline 섹션·앵커·KPI 가드·얕은 금지
- unit: 일반 expo brief에는 outline 블록 없음
- unit: compact brief가 teamver URL 분석 문장 보존
- 기존 templateCloneContentFill 스위트 회귀

## 변경 이력

| 2026-09-07 15:54 | 루프469 구현설계 초안 |
