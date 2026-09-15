# 0915-N01-3 구현현황 — 채팅 패치 self-talk / 영어 내부 서술 누출

설계: [0915-N01-2](./0915-N01-2-구현설계-[채팅_패치_self-talk_누출].md)

## 진행

| 단계 | commit | 상태 |
|---|---|---|
| 상위·구현설계 | `197dcc6ab8` | ☑ |
| sanitize · prompt · probe 922 | `98e702f477` | ☑ |
| push staging | `98e702f477` | ☑ |

## 구현 (완료)

| 파일 | 변경 |
|---|---|
| `agent-prose-sanitize.ts` | `looksLikeDeckPatchSelfTalk` · `stripDeckPatchSelfTalkProse` — 표시 sanitize 체인에 연결 |
| `prompts/system.ts` | UI locale에 패치 self-talk 금지 · `ko`→Korean |
| `prompts/official-system.ts` | 패치 계획 나레이션 금지 |
| `chat-leak-probe-round922.test.ts` | 사용자 보고 전문 제거 · 한글 결과 보존 |

### 검증

| 항목 | 결과 |
|---|---|
| chat-leak-probe-round922 | **4 passed** |

## 변경 이력

| 2026-09-15 | 루프508 완료 — 패치 self-talk 숨김 + locale 프롬프트 |
| 2026-09-15 | 루프508 착수 — 채팅 패치 self-talk / 영어 내부 서술 |
