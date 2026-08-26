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
| N01-1 | — | ☑ | 상위 git |
| N01-2 | — | ☑ | 구현설계 (+D/E) |
| **A** | FR-1 | ☑ | 확정 dead → probe 0 |
| **B** | FR-2 | ☑ | known-dead / embed cold |
| **C** | FR-3 | ☑ | transition pause |
| **D** | FR-4 | ☑ | `ensureDesignAuthLadder` 래핑 |
| **E** | FR-5·7 | ☑ | auth-ladder 계측 · 36 절 · vitest |
| **F** | FR-6 | ☐ | quiet probe — 후속(선택) |

---

## 결정

- FR-4는 대형 리팩터 금지 — 외부 호출부만 ladder로 모음.
- FR-6은 Epic 비목표 유지.

---

## 검증

| 항목 | 결과 |
|------|------|
| vitest cookie-auth-recovery (+ session · runtime-config) | ☑ 52 pass |
| S1/S2 staging 수동 | ☐ |
| S4 HA 2노드 | ☐ |

---

## 남은 일

1. staging bake · S1/S2 수동
2. (선택) FR-6 quiet probe

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-26 11:00 | D/E 완료 — ladder 래핑 · 계측 · FR-7 |
| 2026-08-26 10:45 | A–C 코드·테스트 완료 |
| 2026-08-26 10:40 | 현황 골격 · A–C 착수 |
