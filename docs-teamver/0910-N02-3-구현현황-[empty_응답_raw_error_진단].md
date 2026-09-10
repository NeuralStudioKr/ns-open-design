# 0910-N02-3 구현현황 — empty 응답 raw_error 진단 (루프490·491)

상위: [0910-N02-1](./0910-N02-1-상위설계-[empty_응답_raw_error_진단].md) · 설계: [0910-N02-2](./0910-N02-2-구현설계-[empty_응답_raw_error_진단].md)

## 진행 — 루프490

| 항목 | 상태 |
|------|------|
| `formatPersistedEmptyApiResponseError` | ☑ |
| ProjectView emptyApiResponse 하드 분기 → `attachPersistedChatError` + `empty_response` 라벨 유지 | ☑ |
| soft improvement empty/실패는 canceled + warning 유지 | ☑ (미변경) |
| 단위 테스트 | ☑ |
| ChatPane streaming 회귀 | ☑ |

## 진행 — 루프491 (audit 갭 A/B/C)

| 항목 | 상태 |
|------|------|
| A. daemon stall SSE → `AGENT_EXECUTION_STALLED` | ☑ |
| A. FE salvage: STALLED **또는** FAILED+stall phrase | ☑ |
| A'. `startChatRun`에 `selectedDeckTemplateId`/`Title` 구조분해 누락 수정 (스톨 전 ReferenceError) | ☑ |
| B. `surfaceChatVisibleError` → `encodePersistedRunErrorDetail` | ☑ |
| C. terminal deliverableError 분기에 ops tail encode | ☑ |
| stalledRunDeckSalvage + project-error-messages Vitest | ☑ |
| daemon chat-route stalled 2건 | ☑ |

## 검증

- web: `stalledRunDeckSalvage` + `teamver-project-error-messages` 14/14 ☑
- daemon: `chat-route` `-t stalled` 2/2 ☑

## 남은 일

- N02 staging 실제 스톨 bake (라이브 MiniMax)
- soft improvement 실패 시 ops diag를 warning에 심는 것은 UX 충돌 가능 → 보류

## 변경 이력

| 2026-09-10 16:05 | 루프490 구현·검증 |
| 2026-09-10 16:15 | 루프491 A/B/C + templateId TDZ 수정 |
