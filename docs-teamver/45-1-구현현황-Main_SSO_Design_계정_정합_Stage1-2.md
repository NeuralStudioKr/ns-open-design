# 45-1 구현현황 — Main SSO ↔ Design BFF 계정 정합 (Stage 1·2)

**설계:** [45-1-구현설계-Main_SSO_Design_계정_정합_Stage1-2.md](./45-1-구현설계-Main_SSO_Design_계정_정합_Stage1-2.md)

| 항목 | 상태 |
|------|------|
| 45-1 구현설계 문서 | ✅ |
| Stage 1 BE pin + `main_sso_identity_hash` | ✅ |
| Stage 2 FE probe + reconcile | ✅ |
| Main logout iframe bridge | ✅ (`ns-teamver-fe-v2` + Design `/auth/logout-bridge`) |
| pytest `test_main_sso_identity_pin.py` | ✅ |
| vitest `teamver-main-sso-user-probe.test.ts` | ✅ |
| `/auth/session` bootstrap paths include `main_sso_identity_hash` | ✅ |
| staging E2E (수동) | ☐ |
| mismatch recovery 중 BFF probe/refresh 401 폭주 완화 | ✅ (`pauseDesignBffAuthDuringTransition`, embed 즉시 clear) |

## 체크리스트

- [x] `BffSession.pin_main_user_id` + exchange 저장
- [x] `main_sso_user_mismatches_bff` pin 우선 비교
- [x] `teamverMainSsoUserProbe` + `teamverMainSsoUserReconcile` hooks
- [x] `/auth/logout-bridge` + Main FE iframe
- [x] `00_구현_내역_누적.md` 항목

## 수동 검증

1. Design User A 로그인 → Main logout → User B 로그인 → Design 진입 → B cold start 또는 B 프로필.
2. Main logout 시 Network에 `stg-design…/auth/logout-bridge` iframe (best-effort).
