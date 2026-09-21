# 0916-N09-1 상위설계 · 본문 자체 품질 (synth outline topic-aware)

## 사용자 리포트

> "본문 밀도, 내용 품질, 정확도 등등, 내용 자체에 대한 품질을 더 올리자."

예: 주제 "글을 매력적으로 쓰는 팁" → 카드 본문이 아래처럼 **주제 무관 범용 아웃라인**만 채워짐.

```
개념 / 구조 / 영향
용어와 원리를 짧고 정확하게 정의
구성 요소와 서로 연결되는 방식을 설명
Teamver가 다루는 문제와 제공 가치
```

여러 슬라이드에 동일 문장이 반복. 밀도도 한 줄뿐.

## 근본 원인 (코드 read-through)

### (1) `templatesForSynthTemplateTopic` (`packages/contracts/src/template-clone-fill.ts:1226~1374`)

free-form 프리셋의 6개 outline template의 `lines`가 **topic 없이 하드코딩** 되어 있다.

```ts
// 현재
{
  roleHint: 'cards',
  lead: '핵심 개념을 세 갈래로 나누기',
  itemTitles: ['개념', '구조', '영향'],
  lines: [
    '개념: 용어와 원리를 짧고 정확하게 정의',
    '구조: 구성 요소와 서로 연결되는 방식을 설명',
    '영향: 실제 의사결정이나 업무에 생기는 변화를 정리',
  ],
},
```

`${topic}`은 cover lead와 list/closing 몇 문장에만 삽입. 나머지 `cards / process / stat / closing` 등은 어떤 주제든 그대로. → 사용자가 본 결과의 진짜 원인.

### (2) `synthesizeTemplateCloneSlideBody` (line 1509~) + `padDeterministicTemplateCloneSlides` (line 1527~)

`templates[(index - 1) % templates.length]`로 순환. slideCount가 templates.length(6)를 초과하거나 index 조합이 겹치면 **동일 lines가 여러 슬라이드에 반복**. body/items가 그대로 복붙.

### (3) `bindTemplateCloneSynthItemBody` (line 1489~)

`${item}: ${slide} 관점에서 이 항목이 왜 중요한지…` 형태로 topic-aware 문장을 만들 수 있음. **하지만 실제로 items가 `templatesForSynthTemplateTopic`의 하드코딩 lines에서 파싱되면 이 함수를 안 탄다**. 즉 위 (1)에서 lines가 하드코딩이라 bind가 무력화.

### (4) 호출 경로

- `resolveTemplateCloneSlidesForDeterministicFill` → deterministic fill / seed-fallback으로 채워지는 슬롯의 body/items가 여기서 결정.
- `decideTemplateCloneSlotFillTerminal` → 모델 실패 시 `synthesizeTemplateCloneOutlineFromBrief`가 seed에 lines를 파고 최종 HTML 생성.
- prompt-fill 모드에서도 unfilled 슬롯은 seed 위에서 남는 lines가 그대로 렌더됨.

## 수정 원칙

1. **generic preset lines에 `${topic}` 삽입** — 카드 body가 실제 주제를 언급하도록.
2. **6개 slice의 각도 다양성 유지** — 정의/사례/순서/체크/사례-비교/정리.
3. **반복 방지** — pad가 같은 template을 두 번 이상 쓰면 slide-title/index를 salt로 넣어 다른 variant 문장 생성.
4. **품질 기준 pin 테스트**:
   - 주제 키워드가 카드 body 과반에 포함
   - 완전 동일 body 문자열이 덱의 과반 슬라이드에 반복 금지
   - 지어낸 KPI 숫자 (`$`, `%`, `억`, `M`, `B`) 신규 삽입 금지 (기존 정책 유지)
   - 공식 example.html 힐러 no-op 유지
5. **모델 output 존중** — 모델이 이미 채운 구체 본문을 synth가 덮어쓰지 않는 기존 정책 유지 (`slideNeedsDeterministicBody` 게이트).

## 스코프 외 (한계)

- prompt-fill (모델 턴)에서 모델이 얕은 문장을 쓸 때는 시스템 prompt 강화가 필요하나, deterministic/seed-fallback 경로가 먼저다 (사용자 리포트는 fallback으로 확인). prompt-fill 강화는 후속 라운드.
- 없는 사실을 지어내지 않는 정확도는 **없는 KPI 수치 신규 삽입 금지**로 제한. 문장은 주제 명사 삽입 정도.
