# 0916-N01-2 구현설계 · Broadside 카탈로그 데모 카피 힐러

## 파일 · 함수 매핑

### `packages/contracts/src/template-clone-fill.ts`
1. 신규 정규식 (약 8000 라인 근처)
   - `BROADSIDE_STAT_VALUE_DEMO_RE`
     ```
     /^(?:\$[\d.,]+\s*[BMK]|\$?\[X\]\s*B?|#\d+|3\s*[×xX]|\dx|3x)$/i
     ```
   - `BROADSIDE_LEFTOVER_BODY_RE`
     ```
     /Broadside|\[Studio X\]\s*Guidelines|Before\s*During\s*After|the\s*<br\s*\/?>\s*session|
      TOTAL\s+MARKET\s*:\s*\$?\[X\]B|\bLeader\b\s*[\s\S]{0,60}?\bChallenger\b|
      Followers[\s\S]{0,80}?Other|A brand built by committee|Studio Presentation|\$3\.5B|\bStudio X\b/i
     ```

2. `LEFTOVER_CATALOG_PHRASE_RE` 확장
   - `\[Studio\s*X\]\s*Guidelines|TOTAL\s+MARKET\s*:\s*\$?\[X\]B|` prefix 추가.

3. `fillStudioKitSlide` 확장
   - `slide--stats` `.stat-card` 처리 시 `.stat-value` 정책:
     - metric-like 있으면 대체
     - literal Broadside demo pattern(`BROADSIDE_STAT_VALUE_DEMO_RE`) 매칭 시 ordinal(`01`/`02`/`03`) 대체
     - 그 외 seed 유지 (12, 340% 등)
   - `slide--diagram` + `.flow-step`
     - `.flow-num` = ordinal, `.flow-title` = 카드 title, `.flow-desc` = 카드 body
     - `replaceExactClassBlocksBySequence` 사용 (div 블록 매칭)
   - `slide--pie` + `.pie-item`
     - `.pie-item-label` = title, `.pie-item-val` = metric-like or 빈 문자열
     - `.pie-total` 안에 `[X]|TOTAL MARKET|placeholder` 있으면 wipe
   - `slide--fadelist` + `.fadelist-item`
     - `replaceClassTextBySequence`로 span 시퀀스 채움 (`fadelist-item`은 span)
     - `.fadelist-title` = input.title로 교체
     - `.broadside-num` 안에 `Studio X|Guidelines|^N / N$` 있으면 wipe
   - `.slide-foot .label` wipe에 `Broadside`, `[Studio X]` 케이스 추가
   - `.broadside-num` 하단 chrome도 동일하게 wipe

4. `healBroadsideLeftoverCatalogCopy(html, brief)` 신규
   - Return early if not Broadside.
   - `listHealSlideHostSpans` → 각 호스트에 대해 attrs 검사 (`slide--(cover|chapter|split|stats|list|quote|compare|statement|chart|end|diagram|pie|fadelist)`).
   - `looksLikeLeftoverTemplateDemoDeck(body) || BROADSIDE_LEFTOVER_BODY_RE.test(body)` 시 fill.
   - 최종 `stripStudioCreativeCatalogDemoCopy(stripLeftoverCatalogDemoPhrases(out))`.

5. 파이프라인 wiring — `applyFillHealers` (line 5870 부근)
   - `healStudioLeftoverCatalogCopy` 다음, `healCreativeLeftoverCatalogCopy` 앞에 삽입.

### `packages/contracts/src/html/deck-fixed-canvas.ts`
- `FIXED_CANVAS_CSS` 상수 안, `.slide > [data-od-slide-flow]:has(.split-top)` 블록 다음에 아래 규칙 추가:
  ```css
  .slide > [data-od-slide-flow] > .slide-body,
  .slide > [data-od-slide-flow] > .slide-chrome + .slide-body {
    flex: 1 1 auto !important;
    min-height: 0 !important;
  }
  ```
- 주석에 loop536 근거 명시.

### `packages/contracts/tests/template-clone-fill.test.ts`
- `healBroadsideLeftoverCatalogCopy` 임포트 추가.
- `루프536 — Broadside orange kit demo chrome ...` 테스트 신규 추가.
  - `readFile`로 `fixtures/loop536-broadside-teamver-empty-bottom.html` 로드.
  - `officialLookIsBroadside(html)` true 검증.
  - `healBroadsideLeftoverCatalogCopy(html, brief)` 실행.
  - `$3.5B`, `>3×<`, `>#1<`, `>Leader<`, `>Challenger<`, `>Followers<`, `TOTAL MARKET: $[X]B`, `>40%<`, `>Before<`, `>During<`, `>After<`, `[Studio X] Guidelines`, `>Broadside<` 모두 미매칭 확인.

### `packages/contracts/tests/fixtures/loop536-broadside-teamver-empty-bottom.html` (신규)
- 사용자 리포트 HTML을 5개 슬라이드(cover / stats / diagram / pie / fadelist)로 축약.
- Broadside 지문(`.cover-body`, `.broadside-num`, `.slide--cover`, `.slide-body` 등) 그대로 유지.
- 모든 데모 chrome 그대로 포함하여 힐러 미적용 시 회귀 감지.

## 실행 순서
1. `BROADSIDE_STAT_VALUE_DEMO_RE`, `BROADSIDE_LEFTOVER_BODY_RE`, `LEFTOVER_CATALOG_PHRASE_RE` 편집.
2. `fillStudioKitSlide` 안 각 슬라이드 유형별 브랜치 추가.
3. `healBroadsideLeftoverCatalogCopy` 정의 후 `applyFillHealers`에 wiring.
4. `deck-fixed-canvas.ts` CSS 확장.
5. Fixture 저장.
6. 테스트 추가 → `pnpm --filter @open-design/contracts test --run template-clone-fill` 통과 확인.
7. 전체 contracts 테스트 → 3172 pass 유지.
