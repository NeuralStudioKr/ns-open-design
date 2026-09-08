# 0908-N01-3 구현현황 — Design 활성 워크스페이스 새로고침 유실 (루프477)

상위: [0908-N01-1](./0908-N01-1-상위설계-[Design_활성WS_새로고침_유실].md) · 설계: [0908-N01-2](./0908-N01-2-구현설계-[Design_활성WS_새로고침_유실].md)

## 진행

| 단계 | 상태 |
|------|------|
| 상위설계 commit (규칙1 선행) | ☑ `d4828b6c23` |
| 구현설계·현황 초안 | ☑ |
| 슬라이스 A — P1 stored_wins + P3 단일 reconcile | ☐ |
| 슬라이스 A 테스트 | ☐ |
| 슬라이스 B — P2 자동 전환 알림 | ☐ |
| push · staging CI | ☐ |

## 진단 근거 (코드 확인 완료)

| 원인 | 위치 | 확인 |
|------|------|------|
| 런치 `workspace_id`가 부트 전에 삭제 | `client-app.tsx:13-18` · `teamverEmbedAuthNavigation.ts:5,107-131` | ☑ scrub이 theme/locale만 stash, workspace는 버림 → `teamverEmbedSessionBoot.ts:113`은 warm 경로에서 항상 null |
| warm/cold 승자 불일치 | `app/auth/callback/page.tsx:33,52` | ☑ 콜백은 `useSearchParams()`로 스크럽 이전 값을 잡아 override 적용 |
| `app_enabled=false` 저장값 탈락 | `workspaceUtils.ts:91-98` · `syncTeamverWorkspace.ts:71-74` | ☑ 풀이 활성 앱으로 좁혀져 저장값이 `preferred` 검사를 통과하지 못함 |
| 부트 완료 전 이중 reconcile | `useTeamverEmbed.ts:410,608-619` | ☑ `isTeamverEmbedBootComplete()`가 false → 보존 꺼진 reconcile이 부트와 동시 실행 |
| 재발 근거(선행 수정) | `activeTeamverWorkspace.ts:14-23` | ☑ 읽기 경로만 고쳐진 상태, 부트 경로 미수정 |

## 결정

- **P1 stored_wins** — Design 안의 사용자 선택이 Main 런치 힌트보다 우선. 힌트는 저장값이 없을 때만 시드, **one-shot**.
- **P2 auto_switch + 알림** — 비활성/회수 시 전환은 유지, 전환 사실을 배너로 통지.
- **P3** 새로고침당 비보존 reconcile 1회.

## 남은 일

- 슬라이스 A 구현 5곳 (`teamverEmbedAuthNavigation` · `syncTeamverWorkspace` · `teamverEmbedSessionBoot` · `auth/callback` · `useTeamverEmbed`)
- 슬라이스 B 구현 3곳 (`teamverWorkspaceEvents` · `useTeamverEmbed` · `TeamverSessionBanner`)
- staging 수동 검증: Design에서 B 선택 → F5 → B 유지 / Main `?workspace_id=A` 재진입 → B 유지 / 최초 진입 → A 시드

## 검증

| 항목 | 상태 |
|------|------|
| 저장값 B 있고 런치 A → B 유지 | ☐ |
| 저장값 없음 + 런치 A → A 시드 | ☐ |
| 런치 힌트 one-shot (2회 새로고침에서 재적용 없음) | ☐ |
| `appEnabled=false` → 전환 + `app-disabled` 알림 | ☐ |
| 목록에서 사라짐 → 전환 + `revoked` 알림 | ☐ |
| 부트 중 비보존 reconcile 1회 | ☐ |
| staging bake | ☐ |

## 변경 이력

| 2026-09-08 | 루프477 현황 초안 (진단 확정 · 정책 P1/P2/P3 반영) |
