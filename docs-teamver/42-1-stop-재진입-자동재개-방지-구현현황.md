# Stop 후 재진입 자동 재개 방지 — 구현현황

## 체크리스트

- [x] `rememberUserStoppedAssistantTurn` / `wasUserStoppedAssistantTurn` / session hydrate
- [x] `shouldReattachDaemonRunEvents` + cancelPending helpers
- [x] `attachRecoverableRuns` activeRuns 강제 편입 가드 + cancel reconcile
- [x] `handleStop`에서 stopped turn remember
- [x] active-run / BYOK stub merge 가드
- [x] `requestDaemonRunCancel` export
- [x] 단위·컴포넌트 회귀 테스트
- [x] `00_구현_내역_누적` / 구현설계 문서

## 남은 리스크

- Stop persist가 실패하고 sessionStorage도 비운 full reload + daemon cancel도 실패하면, 여전히 “살아 있는” run으로 reattach될 수 있다 (Stop 자체가 서버에 도달하지 못한 경우와 동일).
