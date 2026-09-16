# 0916-N11-1 상위설계 · prompt-fill 지시 강화 (본문 품질 슬라이스 · 루프544)

## 배경

- 운영 default: `TEMPLATE_CLONE_FILL_DEFAULT_MODE = 'prompt'` (루프535 · Round3 감사).
- 루프543 R1/R2는 `resolveTemplateCloneSlidesForDeterministicFill` /
  `biennaleFillLines` fallback을 topic-aware로 만들었다 — deterministic + seed
  fallback 경로 개선.
- 그러나 실제 사용자가 보는 대부분의 첫 create는 **prompt-fill 경로 (MiniMax
  HTML fill)**로 감. synth만 고치면 모델 턴은 그대로 얕게 나옴.

## 조사 결과 (호출 경로 read-through)

### prompt-fill 시스템 지시 조립 지점

`apps/web/src/teamver/templateCloneContentFill.ts`

- `buildTemplateClonePromptFillSeed` (line 970~1040) — LOOK seed 이후
  MiniMax HTML fill 턴에 append되는 host contract. 이미 다음이 포함:
  - `SLIDE_DECK_QUALITY_BAR_INSTRUCTION` (헤드라인 · 근거 · 반복 금지)
  - `SLIDE_DECK_LAYOUT_VARIETY_INSTRUCTION` (역할 ≥ 4 다양성)
  - `SLIDE_DECK_COPY_DENSITY_INSTRUCTION` (카드마다 1-문장 body)
  - "Do not invent quantitative KPIs, headcount, NPS, market size ($XB), or pricing"
- `templateCloneContentFillHardRules` (line 728~) — JSON slot-fill의 hard
  rules. Prompt-fill과 별도지만 카피 원칙은 공유해야 함.

### 공용 지시 상수

`packages/contracts/src/prompts/deck-quality.ts`

- `SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION` — audience-depth binding + failed
  deliverables enumeration. **하지만 prompt-fill seed에 안 걸림.** JSON slot-fill
  hard rules에만 걸림 (`templateCloneContentFillHardRules` line 736 `${SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION}`).
- `SLIDE_DECK_LAYOUT_VARIETY_INSTRUCTION` · `SLIDE_DECK_COPY_DENSITY_INSTRUCTION`
  — prompt-fill / JSON slot-fill 모두 걸림.

## 이미 있는 것과 없는 것

| 사용자 요구 | 현재 상태 |
|---|---|
| 슬롯마다 서로 다른 1~2문장 · 제목 반복 금지 | ❌ Copy density만 있음. "unique per slot"이 없음. |
| brief 주제 밖 일반론(`개념/구조/영향`, `용어와 원리`) 금지 | 부분 — `generic filler ("핵심 메시지 정리", "주요 특징")`은 있으나 `개념/구조/영향` 계열 없음 |
| 주제에 없는 수치/가격/시장점유 지어내기 금지 | ✅ prompt-fill · JSON slot-fill 둘 다 있음 |
| 템플릿 크롬 · 색 · 장식 유지 | ✅ prompt-fill에 있음 |
| 카탈로그 영어 데모 문장 잔재 금지 | 부분 — `Hartfield / NorthPeak / Project Atlas` 이름은 있으나 일반적인 "Presentation Template" 등 없음 |
| 같은 문장 과반 슬라이드 복붙 금지 | ❌ 없음 |

## 이번 슬라이스 수정 계획

### 1. 신규 공용 상수 2개 (`packages/contracts/src/prompts/deck-quality.ts`)

- `SLIDE_DECK_UNIQUE_SLOT_COPY_INSTRUCTION` — 슬롯마다 다른 문장, 제목/한 단어 라벨 금지, 같은 문장 과반 반복 금지
- `SLIDE_DECK_TOPIC_LOCK_INSTRUCTION` — 주제 이탈 일반론(`개념/구조/영향`, `용어와 원리를 정의`, `배경/핵심 질문/판단 기준`) 금지. 카탈로그 영어 데모 문장 잔재 금지

### 2. 삽입 지점

- `buildTemplateClonePromptFillSeed` (prompt-fill seed)
- `templateCloneContentFillHardRules` (JSON slot-fill hard rules)
- prompt-fill seed에도 `SLIDE_DECK_CONTENT_EXPANSION_INSTRUCTION`을 append
  (지금은 JSON slot-fill에만 걸림)

### 3. 게이트 미변경 근거

`slideNeedsDeterministicBody` (`packages/contracts/src/template-clone-fill.ts:11642`)는
`items.length > 0` OR body가 non-placeholder면 false를 반환. deterministic
outline 경로의 `resolveTemplateCloneSlidesForDeterministicFill`에서만 쓰인다.

- **모델이 이미 채운 items를 synth로 덮어쓰지 않는 안전 경계**.
- 여기서 "얕은 items"(한 단어 라벨)를 구별해 synth로 대체하도록 게이트를 느슨
  하게 만들면, 오히려 "구체적 짧은 items"(전문 용어 + 짧은 정의)도 같이 잡혀
  좋은 본문이 죽는다.
- 따라서 **이번 슬라이스에서는 프롬프트만 강화하고 게이트는 미변경**. 얕은 카피
  방지는 (a) 프롬프트가 모델에게 요구하는 방식 + (b) 이미 있는 healer/persist
  scrub에 의존한다.
- 게이트 미변경 회귀 pin 테스트로 명시.

### 4. pin 테스트

- `buildTemplateClonePromptFillSeed` 출력에 4개 제약 문구가 등장:
  - `unique per slot` (또는 그 한글 동의어)
  - `개념/구조/영향`류 일반론 금지
  - 지어낸 KPI/수치 금지
  - 카탈로그 영어 데모 잔재 금지
- `templateCloneContentFillHardRules` 출력에도 같은 제약 등장
- `slideNeedsDeterministicBody`에 items 1개짜리 얕은 slide를 넣으면 `false`가
  나오는지 pin (게이트 미변경 근거)

## 한계 (여전히 모델이 무시할 수 있는 것)

- prompt는 모델이 존중해야만 효과가 있음. MiniMax가 무시하면 healer/scrub이
  잡을 수 있는 것만 잡히고 얕은 문장 자체는 남을 수 있음.
- "슬롯마다 서로 다른 문장"은 문자열 검사만 가능; 의미론적 중복(문장 구조는
  달라도 뜻이 같음)은 못 잡는다.
