# 0916-N03-2 구현설계 · 8-Bit Orbit 카탈로그 카피 힐러

| 파일 | 역할 |
|------|------|
| `packages/contracts/src/template-clone-fill.ts` | `fillEightBitOrbitKitSlide` (per-shell 슬롯 채우기), `stripEightBitOrbitCatalogDemoCopy` (literal wipe), `healEightBitOrbitLeftoverCatalogCopy` (deck 단위 재fill), `mergeCssDeclarations` + `appendInlineStyle` dedupe |
| `packages/contracts/tests/fixtures/loop540-eightbit-orbit-korean-writing-tips.html` | 사용자 HTML 기반 재현 fixture (10 슬라이드 축약) |
| `packages/contracts/tests/template-clone-fill.test.ts` | 루프540 회귀 (tier / timeline / stat / quote / cover / strip / appendInlineStyle idempotency) |

## 데이터 흐름

```
generate → MiniMax fill → fillTemplateCloneSlideShellForOutline
                            ├─ fillBlockFrameNeoSlots
                            ├─ fillEightBitOrbitKitSlide          ← NEW
                            ├─ stripEightBitOrbitCatalogDemoCopy  ← NEW
                            ├─ stripLeftoverCatalogDemoPhrases
                            └─ …
                          → applyFillHealers
                            ├─ healBroadsideLeftoverCatalogCopy
                            ├─ healGroveLeftoverCatalogCopy
                            ├─ healBlockFrameInventedHeroShells
                            ├─ healEightBitOrbitLeftoverCatalogCopy ← NEW
                            └─ …
```

## 슬롯 결정 규칙

| Slot | 채우기 규칙 |
|------|---------|
| `.hero-subtitle` | `input.lead` → `input.bodyText` → `synthesizeTemplateCloneCoverLead(title)` |
| `.hero-badge` × 3 | `fillLines[0..2].title`을 12자 이내로 잘라 삽입. 부족하면 `01 · <chromeLabel>` 순번 |
| `.pixel-label` (chrome) | English 카탈로그 라벨(Mission Brief / Chronology / Live Telemetry / Access Tiers / Loadout)이면 chromeLabel로 대체. 이미 한국어면 유지 |
| `.timeline-event .date` | `STEP 01`..`STEP NN` (덱 주제와 무관한 Q1..Q4 원본 대체) |
| `.timeline-event h4` | `fillLine.title` |
| `.timeline-event p` | `fillLine.body || fillLine.title` |
| `.stat-block .stat-number` | metric-like title/body 우선, 없으면 ordinal (`data-target` / `data-suffix` 속성 제거) |
| `.stat-block .stat-label` | `fillLine.title` |
| `.tier-card` / `.tier-grid` | 통째로 strip (`stripClassBlocks`) — 주제와 무관한 slot |
| `.quote-author` | wipe (attribution 조작 금지) |
| `.quote-text` | `input.lead || bodyText || title` |
| `.pixel-btn` | `Select` / `Initialize Deck` / `View Documentation` 등 catalog literal이면 `자세히 보기`로 대체 |

## `appendInlineStyle` idempotency

Before:
```ts
return attrs.replace(styleMatch[0], ` style=${quote}${current};${style}${quote}`);
```

같은 property가 두 번 이상 실행되면 `current`에도 이미 값이 있고 `style`도
그대로 붙어 stacked declarations를 만듦. → 최대 8회까지 관측.

After (`mergeCssDeclarations`):
```ts
const seen = new Map<string, string>();
for (const decl of current.split(';')) seen.set(prop, `${prop}:${value}`);
for (const decl of incoming.split(';')) seen.set(prop, `${prop}:${value}`);
return Array.from(seen.values()).join(';');
```

property 이름 (`font-size`, `line-height`, ...) 기준으로 dedupe. 재적용해도
최종 style 문자열이 동일하게 유지.

## 안전장치

- `fillEightBitOrbitKitSlide` — 구조적 marker 없으면 즉시 return. 다른 킷 슬라이드에는 영향 없음.
- `healEightBitOrbitLeftoverCatalogCopy` — `officialLookIsEightBitOrbit` OR
  8-bit 구조 marker gate. 다른 킷은 no-op.
- `stripEightBitOrbitCatalogDemoCopy` — 문자열 기반 wipe만 하므로 다른 킷에서도 fire 하지만
  `Rookie` / `Studio Orbital` 등 유일-literal이라 side-effect 없음.
- `tier-card` 전체 strip — 통상 slot이 아니지만 pricing tier가 있어야 하는 덱은
  8-Bit Orbit이 아닌 pricing/saas 킷을 사용해야 함.

## 리스크

- `Arcade` / `Boss` 같은 tier 이름은 게임 관련 덱에서 정상 텍스트일 수 있음.
  현재 regex는 word-boundary + trailing 조건으로 hero-badge 안에서만 매치.
- `data-target`은 8-bit orbit stat-block 안에서만 제거. 다른 킷의 KPI 애니메이션은 영향 없음.
