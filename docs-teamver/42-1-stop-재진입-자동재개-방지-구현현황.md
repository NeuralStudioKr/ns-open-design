# Stop 후 재진입 자동 재개 방지 — 구현현황

## 체크리스트

- [x] `rememberUserStoppedAssistantTurn` / `wasUserStoppedAssistantTurn` / session hydrate
- [x] `shouldReattachDaemonRunEvents` + cancelPending helpers
- [x] `attachRecoverableRuns` activeRuns 강제 편입 가드 + cancel reconcile
- [x] Stop하지 않은 daemon `succeeded` run은 HTML 산출물이 없을 때 terminal event replay로 복구
- [x] `handleStop`에서 stopped turn remember
- [x] active-run / BYOK stub merge 가드
- [x] `requestDaemonRunCancel` export
- [x] 단위·컴포넌트 회귀 테스트
- [x] `00_구현_내역_누적` / 구현설계 문서

## 2026-07-30 보강

- 페이지 이탈 중 daemon run이 이미 `succeeded`로 끝나면 기존 reattach 경로는 상태만
  반영하고 SSE replay를 생략했다. 이 경우 FE artifact parser가 떠나 있었기 때문에
  `deck.html` 저장/자동 오픈이 누락될 수 있었다.
- 이제 slide-only run에서 terminal success이지만 assistant row에 HTML `producedFiles`가
  없으면 `/api/runs/:id/events`를 처음부터 replay한다. Stop/cancel 이력은 기존
  guard가 계속 우선하므로 명시적 중지를 자동 재개하지 않는다.

## 남은 리스크

- Stop persist가 실패하고 sessionStorage도 비운 full reload + daemon cancel도 실패하면, 여전히 “살아 있는” run으로 reattach될 수 있다 (Stop 자체가 서버에 도달하지 못한 경우와 동일).
- staging/prod 실브라우저에서 “생성 중 이탈 → run 종료 후 재진입” E2E 실증이 필요하다.
