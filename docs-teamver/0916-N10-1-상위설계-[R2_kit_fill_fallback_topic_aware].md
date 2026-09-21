# 0916-N10-1 상위설계 · R2 kit-specific fill fallback topic-aware (루프543)

## R2 재검사 결과

R1에서 `templatesForSynthTemplateTopic` (deterministic outline 경로)를 고쳤지만
kit-specific fill 함수 (`fillEightBitOrbitKitSlide` / `fillStudioKitSlide` /
`fillBlockFrameNeoSlots`)가 사용하는 `biennaleFillLines`에도 **Teamver 특화 하드
코딩 fallback**이 남아 있었다.

### 발견한 두 hot spot

`packages/contracts/src/template-clone-fill.ts`

1. **`biennaleFillLines` fallbacks** (line 7181~)
   - 이전: `주요 기능: 협업, 파일, AI 작업 흐름을 한 화면에서 연결합니다`
   - 이전: `기대 효과: 반복 업무를 줄이고 팀의 실행 속도를 높입니다`
   - 이전: `다음 단계: 도입 검토와 실행 계획을 명확하게 제안합니다`
   - 결과: 8-Bit Orbit timeline이나 Broadside footer가 fillLines 부족일 때 위
     문장이 free-form 주제(예: 글을 매력적으로 쓰는 팁)에도 그대로 등장.

2. **`biennaleFooterRows`** (line 7213~)
   - 이전: `구성 · 핵심 흐름과 사용자 가치 정리` · `메모 · 팀 단위 실행과 다음 단계까지 연결`
   - Broadside / Biennale footer 슬라이드의 fallback row.

## 수정

두 함수 모두 `topicKeywordForSynthBody(input.title || input.lead || input.bodyText)`로
topic을 추출해 fallback body 문장에 `${topic}` 삽입.

```ts
// biennaleFillLines
{ title: `${topic} 개요`, body: `${topic}의 핵심 메시지와 청중이 얻는 가치를 먼저 정리합니다.` },
{ title: '핵심 포인트', body: `${topic}에서 가장 먼저 이해해야 할 개념·근거를 짧게 정리합니다.` },
{ title: '실행 방법', body: `${topic}을 실제로 적용할 때의 순서와 판단 기준을 제시합니다.` },
{ title: '기대 효과', body: `${topic}이 성공했을 때 청중·팀·사용자에게 생기는 변화를 정리합니다.` },
{ title: '다음 단계', body: `${topic}을 이어가기 위한 다음 행동과 필요한 자원을 제안합니다.` },
```

## 회귀 pin

- 루프543 `biennaleFillLines fallback도 topic 명사가 스며든다` — 8-Bit Orbit
  timeline slide에 fillLines를 비운 상태로 fill을 호출하고 fallback 문장을
  검증:
  - `협업, 파일, AI 작업 흐름` 절대 없음
  - `반복 업무를 줄이고 팀의 실행 속도` 절대 없음
  - `도입 검토와 실행 계획을 명확하게 제안` 절대 없음
  - topic (`글을 매력적으로 쓰는 팁`)이 filled body에 등장

## 검증

`pnpm --filter @open-design/contracts test` — 996 files · **3198 pass**.

## 결론

R1 (synth outline) + R2 (kit fallback) 두 층이 모두 topic-aware. 이제 free-form
주제 fill 경로 전체가 주제 명사를 body에 스며들게 한다.

## R3 종료 판단

R1 · R2 신규 회귀가 없고, kit-specific fill의 다른 하드코딩 fallback (`핵심`,
`주요`, `방향`, `요약` 등의 짧은 label)은 topic 없이도 자연스러워 억지로 삽입
하지 않는다. **3라운드 없이 종료.**
