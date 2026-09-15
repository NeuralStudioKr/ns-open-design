# 0915-N01-2 구현설계 — 채팅 패치 self-talk / 영어 내부 서술 누출

상위: [0915-N01-1](./0915-N01-1-상위설계-[채팅_패치_self-talk_누출].md)

## 1. `packages/contracts/src/agent-prose-sanitize.ts`

신규:

- `looksLikeDeckPatchSelfTalk(text)` — 신호 ≥2 또는 강한 조합
  - `slide N (index M)`
  - `I'm checking the slide` / `I'll patch` / `needs the patch`
  - `Looking at the current HTML` / `<span>` / `.slide--` / `mono label` / `title-only body`
- `stripDeckPatchSelfTalkProse(input)`
  - Hangul 없는 전체가 self-talk → `""`
  - 문단 단위로 self-talk 문단 제거 (한글 결과 문장 보존)

`sanitizeLeakedAgentProse` / `sanitizeAssistantProseForDisplay` 체인에 연결 (`stripAgentToolSelfTalkNotes` 근처).

## 2. 프롬프트

`apps/daemon/src/prompts/system.ts` · `official-system.ts`:

- 패치 계획·slide index·HTML/CSS 클래스·"I'm checking the slide" self-talk를 채팅에 쓰지 말 것
- element-patch/artifact는 조용히 emit; 사용자 문장은 UI locale의 **짧은 결과만**

`renderUiLocalePrompt`: `ko` / `ko-KR` → languageName `Korean` (가독성).

## 3. 테스트

`packages/contracts/tests/chat-leak-probe-round922.test.ts` — 사용자 보고 전문 → sanitize 후 빈 문자열; 한글 결과+영어 self-talk 혼합 시 한글만 남음.

## 비범위

- BE BFF
- thinking_delta 경로 (이미 억제)
