# 0910-N02-1 상위설계 — empty 응답 raw_error 진단 보강

**날짜:** 2026-09-10 · **루프:** 490  
**관련:** [0908-N03](./0908-N03-3-구현현황-[킷_대비순응_이중패딩_찌꺼기].md) · 루프481 진단 카드 · [0910-N01](./0910-N01-3-구현현황-[contracts_베이스라인_leftover_red].md)

## 1. 체감

루프481이 copy-diagnostic에 `raw_error` / `reason=unavailable`을 넣었지만, **API 모드 빈 응답** 경로는 여전히 `status:error` 없이 `empty_response` 라벨 + 텍스트만 남겨 진단이 `reason=unavailable`로 끝난다. 상류(모델/쿼터/빈 스트림)를 구분할 수 없다.

## 2. 원인

`ProjectView` onDone `emptyApiResponse` 하드 분기:

- soft improvement → warning + `canceled` (의도적, Retry 없음) ☑
- **그 외** → `runStatus: failed` + `{label:'empty_response'}` + 유저 문구만. `attachPersistedChatError` / `encodePersistedRunErrorDetail` 미사용.

ChatPane 진단은 `label:'error'` + HTML comment diag marker를 읽는다.

## 3. 정책

1. 빈 API 응답 하드 실패도 다른 stream-error와 같이 **persisted status:error**를 남긴다.
2. diag에 `kind=empty_response` · `reason=<model>` · `code=EMPTY_RESPONSE`(또는 AGENT_EXECUTION_FAILED 하위)를 넣는다.
3. soft improvement 빈/실패는 계속 quiet warning + canceled — Retry dock 없음 (루프481 유지).
4. 유저 배너 문구는 기존 `assistant.emptyResponseMessage` 유지.

## 4. 성공 조건

- empty API fail 메시지의 copy-diagnostic에 `raw_error` / `kind=empty_response` 존재
- soft improvement 경로는 Retry/failed로 승격되지 않음
- 단위 테스트로 고정 (MiniMax live 불필요)

## 변경 이력

| 2026-09-10 16:00 | 루프490 상위설계 |
