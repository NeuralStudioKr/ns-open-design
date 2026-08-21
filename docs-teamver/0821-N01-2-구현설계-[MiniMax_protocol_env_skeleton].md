# 0821-N01-2 구현설계 — MiniMax Protocol/env skeleton

**상위:** [54 MiniMax 전환 기획·설계](./54_MiniMax_전환_기획_설계.md) · [54-1 개발설계](./54-1_MiniMax_전환_개발설계.md) §25 / Commit 1  
**범위:** 타입·env·runtime-config·provider별 managed key resolver. **실제 MiniMax stream proxy는 Commit 2.**

## 목표

- `ApiProtocol`에 `minimax` 추가 (기존 Claude/Anthropic 경로 무파괴)
- daemon `minimax-runtime.ts` — key/baseUrl/model/`shouldOmitMaxTokens` SSOT
- `resolveTeamverManagedApiKeyFromEnvForProvider('anthropic'|'minimax')`
- design-api runtime-config가 `minimax`를 allow하고, key 없이 `apiKeyConfigured`만 전달
- validate: default provider가 minimax이면 `TEAMVER_MINIMAX_API_KEY` 필수

## 파일

| 파일 | 변경 |
|------|------|
| `apps/daemon/src/minimax-runtime.ts` | 신규 |
| `apps/daemon/src/teamver-managed-api-key.ts` | provider별 resolver + MiniMax missing code |
| `apps/daemon/tests/minimax-runtime.test.ts` | 신규 |
| `apps/daemon/tests/teamver-managed-api-key.test.ts` | MiniMax managed 케이스 |
| `apps/web/src/types.ts` | `ApiProtocol` + optional `teamverManagedProvider` |
| `apps/web/src/state/apiProtocols.ts` | labels/defaults/`byokChatToolNames` (P0: `web_fetch` only) |
| `apps/web/src/teamver/applyTeamverRuntimeConfig.ts` | allowlist |
| `deploy/teamver/be/app/config.py` | MiniMax env fields |
| `deploy/teamver/be/app/services/od_runtime_config.py` | protocol + configured 판정 |
| `deploy/teamver/be/tests/test_runtime_config.py` | minimax cases |
| `deploy/teamver/scripts/validate_deploy_env.sh` | minimax default 시 key 강제 |
| `.env.*.example` | `TEAMVER_MINIMAX_ENABLED` / `CONFIGURED` 주석 보강 |

## 불변식

- `resolveTeamverManagedApiKeyFromEnv()` = Anthropic chain 유지
- runtime-config 응답에 `apiKey` 절대 없음
- `TEAMVER_OD_API_KEY`를 MiniMax key alias로 쓰지 않음
- Commit 1에서 `/api/proxy/minimax/stream` 미등록 (Commit 2)

## 검증

```bash
pnpm --filter @open-design/daemon exec vitest run tests/minimax-runtime.test.ts tests/teamver-managed-api-key.test.ts
pnpm --filter @open-design/web exec vitest run tests/state/api-protocols.test.ts tests/teamver-reload-runtime-config.test.ts
cd deploy/teamver/be && python -m pytest tests/test_runtime_config.py -q
```
