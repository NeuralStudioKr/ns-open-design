# 0916-N05-1 상위설계 · Round 3 fill mode 일관성 감사

## 배경

`TEMPLATE_CLONE_FILL_DEFAULT_MODE`가 `prompt` (루프535)로 롤백된 이후,
소스 default · env 파일 · 문서 · 테스트가 일관되게 `prompt`인지 감사.

## 감사 결과

| 위치 | 값 | 일관 여부 |
|------|------|--------|
| `apps/web/src/teamver/templateCloneContentFill.ts:85` | `TEMPLATE_CLONE_FILL_DEFAULT_MODE = 'prompt'` | ✔ |
| 같은 파일 line 61 주석 | "env-empty / staging default since loop535" | ✔ |
| 같은 파일 line 80 주석 | "Content must go through MiniMax after LOOK seed" | ✔ |
| `deploy/teamver/.env.staging.example:101` | `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt` | ✔ |
| `deploy/teamver/.env.production.example:108` | `VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt` | ✔ |
| `deploy/teamver/.env.example:24-28` | 주석 default=prompt 명시 | ✔ |
| `apps/web/tests/teamver/templateCloneContentFill.test.ts:221` | `expect(stagingEnv).toMatch(/^VITE_TEAMVER_TEMPLATE_CLONE_FILL_MODE=prompt$/m)` | ✔ |
| `normalizeTemplateCloneFillMode` fallback | `TEMPLATE_CLONE_FILL_DEFAULT_MODE` | ✔ |
| `getTemplateCloneFillMode` fallback | `TEMPLATE_CLONE_FILL_DEFAULT_MODE` | ✔ |

## 결론

**검토 완료·변경 없음**. 모든 경로(코드 · 주석 · env 예제 · 테스트)가 `prompt`로
일관됨. `deterministic` / `json` / `pure-prompt`는 explicit opt-in 표기.

Loop532 briefly-defaulted-to-deterministic 회귀 방지 테스트도 유지 중
(`apps/web/tests/teamver/templateCloneContentFill.test.ts` loop535 case).

## 검증

`pnpm --filter @open-design/web test --run teamver/templateCloneContentFill`
→ 41 pass (default=prompt · staging env 예제 · env override · localStorage 등 전 케이스).
