# Stop 후 재진입 자동 재개 방지 — 구현설계

## 문제

1. 페이지 leave는 daemon/BYOK를 **취소하지 않고** SSE만 detach한다 (백그라운드 계속이 의도).
2. 사용자가 **Stop**하면 local message는 `canceled`+`endedAt`이 되고 daemon에는 `POST /cancel`이 간다.
3. cancel grace 동안 daemon `list(active)`는 여전히 해당 run을 주고, `status`는 `running`, `cancelRequested=true`다.
4. 재진입 `attachRecoverableRuns`가 activeRuns를 **terminal 여부 무시하고** recoverable에 넣고, `runStatus: status.status`로 local `canceled`를 `running`으로 덮은 뒤 `reattachDaemonRun`을 호출했다.

## 설계

| 계층 | 규칙 |
|------|------|
| Stop 기록 | `rememberUserStoppedAssistantTurn({ runId, assistantMessageId })` — 메모리 + `sessionStorage` |
| Eligibility | `isRecoverableDaemonRunMessage` / `isInFlightAssistantMessage`가 user-stopped면 false |
| Reattach gate | `shouldReattachDaemonRunEvents(message, run)` — local terminal · user-stopped · `cancelRequested` · daemon terminal이면 false |
| Active merge | `mergeActiveRunsIntoMessages` / `mergeMissingActiveRunAssistantMessages`는 cancelPending·stopped·이미 terminal인 id를 stub으로 부활시키지 않음 |
| Reconcile | cancelPending/stopped면 SSE 없이 `canceled` 유지 + `requestDaemonRunCancel` best-effort |

## 비목표

- Stop **없이** leave한 백그라운드 작업의 재진입 reattach는 유지한다.
- incomplete_output auto-continue 게이트는 변경하지 않는다 (`canceled`는 원래 대상 아님).

## 검증

- unit: cancel grace + user-stopped → `shouldReattachDaemonRunEvents` false, merge no-op
- component: canceled message + active `cancelRequested` run → `reattachDaemonRun` 미호출, `requestDaemonRunCancel` 호출
