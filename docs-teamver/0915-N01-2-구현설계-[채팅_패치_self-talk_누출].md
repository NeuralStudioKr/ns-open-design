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

## 후속 — deliverable contract 한국어 에코

모델이 프롬프트 계약을 채팅에 그대로 옮긴다:

`작성 중입니다. \`<!doctype 시작하는 완전한 덱을 같은 응답에 동봉합니다.`

4. **host-contract fingerprint** — `looksLikeLeakedApiModeFilesystemProse`에 `<!doctype` + `완전한 덱` / `같은 응답` / `동봉` (및 `complete deck` + `same response`)를 넣는다. 문장 제거 후 남은 `작성 중입니다`만이면 같이 지운다.
5. **표시** — Teamver 슬라이드 UI는 스트리밍 중에도 계약 에코(`<!doctype` + 동봉/같은 응답)를 `stripLeakedDeckDeliverableContractProse`로 숨긴다. 짧은 `작성 중`만 있는 진행 문구는 스트리밍 동안 유지하고, 턴이 끝나면 residue로 지운다.
6. **프롬프트** — deliverable rule에 "채팅에 `<!doctype` / 같은 응답에 동봉 계약을 에코하지 말 것"을 명시한다.

## 후속 — 슬라이드 개요 JSON 에코

모델이 clone-fill 개요를 채팅에 그대로 붙인다.

```json
{"title":"…","slides":[{"title":"…","kicker":"…","lead":"…","roleHint":"
```

7. **표시** — `stripLeakedApiModeFilesystemProse`가 `"slides"` 배열과 `kicker` / `roleHint`(또는 `{"title"…"slides":[` 헤더)를 채팅 문장에서 제거한다. 잘린 스트림도 지운다. `<artifact>` 본문은 유지한다. 앞뒤의 사용자용 문장은 남긴다.
8. **프롬프트** — 채팅에 `title` / `slides` / `kicker` / `roleHint` JSON을 붙이지 말 것.

## 비범위

- BE BFF
- thinking_delta 경로 (이미 억제)
