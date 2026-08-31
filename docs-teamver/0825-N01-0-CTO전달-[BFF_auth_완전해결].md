# BFF Auth 401 완전 해결 — CTO 전달 요약

| 항목 | 값 |
|------|-----|
| **문서 ID** | `0825-N01-0` |
| **대상** | CTO · 플랫폼 리드 |
| **작성일** | 2026-08-26 · **개정 2026-08-31 (멀티앱 · 재검토)** |
| **Epic SSOT** | [0825-N01-1](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) · [0825-N01-2](./0825-N01-2-구현설계-[BFF_session-probe_refresh_401_완전해결].md) · [0825-N01-3](./0825-N01-3-구현현황-[BFF_session-probe_refresh_401_완전해결].md) |
| **구현 후보** | [0831-N01-1](./0831-N01-1-상위기획-[Apps_Main_auth_멀티앱_정합_구현후보].md) |
| **관련** | [36](./36_BFF_auth_refresh_401_정리.md) · [45](./45_Main_SSO_Design_BFF_계정_불일치_예방_로드맵.md) · [41](./41_Design_Drive_인증_계약_권고.md) |

---

## 1. 한 줄 요약

Design auth 401 폭풍(Phase 1) + Main↔앱 세션 어긋남(Plan A) 대응.  
**재검토:** 멀티앱 기본해는 **Plan A + `unknown`∧BFF-live → 로컬 앱 logout**. Main 레지스트리 iframe fan-out은 **즉시성 가속(선택)** — 필수가 아님.

---

## 2. 채택 조합

| 층 | 내용 | 상태 |
|----|------|------|
| Phase 1 ladder | 확정 dead → probe 0 | ☑ |
| Plan A | `/auth/session` `main_sso_status` (Design reference) | ☑ |
| **FR-P0** | logout 후 `unknown`이면 앱이 스스로 BFF 폐기 | ☐ 다음 |
| Docs 포트 | Plan A + FR-P0 | ☐ |
| Fan-out / M2M | 열린 탭 **즉시** 폐기 | 선택 |

상세 후보 비교(A~G): [0831-N01-1](./0831-N01-1-상위기획-[Apps_Main_auth_멀티앱_정합_구현후보].md).

---

## 3. 왜 fan-out이 필수가 아닌가

| 사건 | 서버 status | 기본 조치 |
|------|-------------|-----------|
| 계정 전환 | `mismatch` | Plan A recovery (앱 focus) |
| Main 로그아웃 | `unknown` | **앱 로컬 logout (FR-P0)** — Main에 앱 목록 불필요 |

iframe fan-out은 “focus 전 즉시”가 필요할 때만.

---

## 4. 성공 기준 (요약)

| ID | Pass |
|----|------|
| S1–S2 · S8–S11 | Design Plan A / ladder |
| **S12a (필수)** | logout 후 **다음 focus**에서 BFF 미인증 |
| **S12b (선택)** | logout **즉시** fan-out |
| **S13** | 다수 앱 · 계정 전환 → 앱별 Plan A |

---

## 5. 의사결정

| 항목 | 승인 |
|------|------|
| Plan A Design | 불필요 · ☑ |
| **FR-P0 / Docs 포트** | Design·Docs 자체 (Main 최소) |
| Fan-out / M2M | 제품 “즉시” 요구 시 플랫폼 |
| Dual-auth / epoch | 별도 · 보류 |

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-31 15:20 | 재검토 — FR-P0 기본 · fan-out 가속 · 0831-N01-1 링크 |
| 2026-08-31 15:05 | 멀티앱 Phase 2b |
| 2026-08-26 15:50 | Plan A 승인 불필요 |
| 2026-08-26 15:45 | Plan A 1순위 |
| 2026-08-26 15:30 | epoch 초안 (폐기) |
