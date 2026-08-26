# BFF session-probe/refresh 401 — 구현현황 (0825-N01-3)

| 항목 | 값 |
|------|-----|
| **문서 ID** | `0825-N01-3` |
| **역할** | 3 — 구현현황 |
| **상위** | [0825-N01-1](./0825-N01-1-상위기획-[BFF_session-probe_refresh_401_완전해결].md) · [0825-N01-2](./0825-N01-2-구현설계-[BFF_session-probe_refresh_401_완전해결].md) |
| **시작** | 2026-08-26 |

---

## 진행

| 슬라이스 | FR | 상태 | 비고 |
|----------|----|------|------|
| N01-1 | — | ☑ | 상위 git · Phase 2 Plan A 개정 |
| N01-2 | — | ☑ | 구현설계 (+Plan A §10~17) |
| N01-0 | — | ☑ | CTO 전달 (session 서버 판정 1순위) |
| **A** | FR-1 | ☑ | 확정 dead → probe 0 |
| **B** | FR-2 | ☑ | known-dead / embed cold |
| **C** | FR-3 | ☑ | transition pause |
| **D** | FR-4 | ☑ | `ensureDesignAuthLadder` 래핑 |
| **E** | FR-5·7 | ☑ | auth-ladder 계측 · 36 절 · vitest |
| **F** | FR-6 | ☐ | quiet probe — 후속(선택) |
| **45-1** | FR-11·12 | ☑ | pin · reconcile · logout bridge |
| **G** | FR-8 | ☑ | BE `/auth/session` `main_sso_status` |
| **H** | FR-9 | ☑ | FE server-status reconcile |
| **I** | FR-10 | ☑ | reconcile pause · session-before-ladder (refresh path) |
| **L** | FR-13 | ☐ | 크로스탭 broadcast |
| **M** | FR-14 | ☐ | quiet probe (선택) |
| **N** | FR-15 | ☐ | back-channel logout (선택) |
| **O** | FR-16 | — | epoch Plan C · **보류** |

---

## 결정

- Phase 2 **Plan A** — Design-only, **CTO 승인 불필요**, G~I 즉시 착수 가능.
- epoch 쿠키(FR-16) — Plan A bake 후 재평가.
- FR-4는 대형 리팩터 금지 — 외부 호출부만 ladder로 모음.

---

## 검증

| 항목 | 결과 |
|------|------|
| vitest cookie-auth-recovery (+ session · runtime-config) | ☑ 52 pass |
| S1/S2 staging 수동 | ☐ |
| S8–S11 (Plan A) | ☐ |
| S4 HA 2노드 | ☐ |

---

## 남은 일

1. staging bake · S1/S2 · S8–S9 수동 (Plan A)
2. (선택) L~N · FR-6 quiet probe

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-26 16:05 | Plan A 구현 — G~I 코드·테스트 · BE `main_sso_status` · FE reconcile |
| 2026-08-26 15:45 | Plan A 개정 — G~I 재정의 · 45-1 ☑ · epoch 보류 |
| 2026-08-26 11:35 | Phase 2 통합 설계 — epoch 중심 (폐기) |
| 2026-08-26 10:45 | A–C 코드·테스트 완료 |
| 2026-08-26 10:40 | 현황 골격 · A–C 착수 |
