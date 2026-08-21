# 0821-N01-3 구현현황 — MiniMax Protocol/env skeleton

**구현설계:** [0821-N01-2](./0821-N01-2-구현설계-[MiniMax_protocol_env_skeleton].md)  
**상위:** [54-1](./54-1_MiniMax_전환_개발설계.md) Commit 1

## 진행

| 항목 | 상태 |
|------|------|
| 구현설계 문서 | ☑ |
| `minimax-runtime.ts` | ☑ |
| managed key provider resolver | ☑ |
| web `ApiProtocol` + apiProtocols | ☑ |
| runtime-config allowlist (FE + design-api) | ☑ |
| validate_deploy_env | ☑ |
| 테스트 | ☑ |
| changelog · push | ☐ |

## 결정

- P0 MiniMax BYOK tool 광고: `web_fetch`만 (speech/video 제외 — 54 P0)
- design-api configured: `TEAMVER_MINIMAX_CONFIGURED=1` (또는 MiniMax key 존재); Anthropic `TEAMVER_OD_API_KEY`와 분리
- protocol=minimax일 때 OD 기본값 `claude-*` / `anthropic.com`은 무시하고 MiniMax default로 치환
- Commit 1에서 `/api/proxy/minimax/stream` **미등록** (Commit 2)

## 검증

- daemon: minimax-runtime + teamver-managed-api-key — pass
- web: api-protocols + teamver-reload-runtime-config — pass
- design-api: test_runtime_config.py — 8 pass

## 남은 일 (다음 슬라이스)

- Commit 2: `/api/proxy/minimax/stream` + SSE + `max_tokens` omit + daemon route protocol allowlist
