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
| N01-2 | — | ☑ | 구현설계 |
| **A** | FR-1 | ☑ | `isDefinitiveAuthRefreshDead` · probe 0 |
| **B** | FR-2 | ☑ | known-dead / embed cold → POST 0 |
| **C** | FR-3 | ☑ | useTeamverEmbed logout · orphan clear pause |
| D–F | FR-4~6 | ☐ | 후속 |

---

## 결정

- HA 허용: `code=refresh_failed`(또는 unknown + 쿠키 힌트).
- 확정 dead: `session_missing` / `session_cookie_invalid` / (cookie 없는 `session_expired`).
- known-dead면 refresh POST 자체를 스킵하고 soft sticky latch (POST 후 probe 스킵보다 강함).
- FR-6 quiet probe 제외.

---

## 검증

| 항목 | 결과 |
|------|------|
| vitest cookie-auth-recovery (+ session · runtime-config gate) | ☑ 51 pass |
| S1 cold unauthenticated | ☐ staging |
| S2 확정 dead focus | ☐ staging |
| S4 HA 2노드 | ☐ staging |

---

## 남은 일

1. staging bake · S1/S2 수동
2. FR-4 ladder 단일 진입점 (후속)
3. FR-5/7 계측·문서 고정 보강

---

## 변경 이력

| 일시 (KST) | 내용 |
|------------|------|
| 2026-08-26 10:45 | A–C 코드·테스트 완료 |
| 2026-08-26 10:40 | 현황 골격 · A–C 착수 |
