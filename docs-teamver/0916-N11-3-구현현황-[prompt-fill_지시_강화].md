# 0916-N11-3 구현현황 · prompt-fill 지시 강화 (본문 품질 슬라이스 · 루프544)

## 진행 요약

- ☑ `packages/contracts/src/prompts/deck-quality.ts` — `SLIDE_DECK_UNIQUE_SLOT_COPY_INSTRUCTION`
  + `SLIDE_DECK_TOPIC_LOCK_INSTRUCTION` 신규 export (contracts barrel `index.ts`가
  이미 deck-quality를 re-export하므로 별도 수정 불필요).
- ☑ `apps/web/src/teamver/templateCloneContentFill.ts`
  - `buildTemplateClonePromptFillSeed`에 두 신규 상수 append (기존 pin
    "Content expansion contract"는 prompt-fill seed에 노출하지 않도록 유지 —
    TOPIC_LOCK이 그 실패 시나리오를 이미 부분 커버).
  - `templateCloneContentFillHardRules`에도 두 신규 상수 append.
- ☑ `packages/contracts/src/template-clone-fill.ts` — `slideNeedsDeterministicBody`
  export (게이트 미변경 pin 목적).
- ☑ 회귀 pin 추가:
  1. `apps/web/tests/teamver/templateCloneContentFill.test.ts` — prompt-fill seed
     에 topic-lock / unique-per-slot 지시 등장 검증 (한글 예시 `개념 / 구조 / 영향`,
     `배경 / 핵심 질문 / 판단 기준`, `Bare one-word labels (핵심, 개념, 요약)` 포함).
  2. 같은 파일 — JSON slot-fill hard rules에도 같은 두 지시 + 기존 CONTENT_EXPANSION 유지.
  3. `packages/contracts/tests/template-clone-fill.test.ts` — `slideNeedsDeterministicBody`
     게이트 4-case pin: items 있는 얕은 라벨 → false · items 있는 구체 body → false
     · items 없고 placeholder body → true · items 없고 구체 body → false.

## 프롬프트 문구 위치 · SHA 요약

| 위치 | 라인 | 문구 |
|---|---|---|
| `packages/contracts/src/prompts/deck-quality.ts` | `SLIDE_DECK_UNIQUE_SLOT_COPY_INSTRUCTION` | "Unique-per-slot copy is REQUIRED: … a failed deliverable." |
| 같은 파일 | `SLIDE_DECK_TOPIC_LOCK_INSTRUCTION` | "Topic-lock (brief-tethered content): … Hartfield, NorthPeak, WACC, EBITDA, Project Atlas)." |
| `apps/web/src/teamver/templateCloneContentFill.ts` `buildTemplateClonePromptFillSeed` | prompt-fill seed | 두 상수 append (SLIDE_DECK_COPY_DENSITY 바로 뒤) |
| 같은 파일 `templateCloneContentFillHardRules` | JSON slot-fill hard rules | 두 상수 `- ` 접두로 append |

## 게이트 변경 여부

**미변경.** `slideNeedsDeterministicBody`는 `items.length > 0`이면 무조건 false
반환. 사용자 지시대로 "얕은 items"를 구별해 synth로 대체하는 로직은 회귀
위험이 커서 이번 슬라이스에서는 프롬프트 강화만 진행. 게이트 회귀는 신규 pin
테스트로 명시 (`루프544 slideNeedsDeterministicBody 게이트 미변경`).

## 검증

- `pnpm --filter @open-design/contracts test` — 996 files · **3199 pass** (+1)
- `pnpm --filter @open-design/web test --run teamver/templateCloneContentFill` — **43 pass** (+2)

## 여전히 모델이 무시할 수 있는 한계

- MiniMax가 host contract를 존중해야만 이 지시가 효과를 낸다. 모델이 무시해서
  얕은 문장을 그대로 낼 경우, healer/scrub이 잡을 수 있는 것만 잡히고 얕은
  문장 자체는 남을 수 있다.
- "슬롯마다 서로 다른 문장"은 문자열 검사만 가능한 계약 — 문장 구조가 달라도
  의미상 같은 카피 반복은 이 지시로 못 잡는다.
- 게이트 미변경 결정 때문에 items가 이미 채워졌다면 얕더라도 synth로 대체하지
  않음. 프롬프트가 실패한 얕은 items가 그대로 나갈 수 있음. (게이트 완화는
  후속 슬라이스에서 별도 리스크 검토 필요.)
