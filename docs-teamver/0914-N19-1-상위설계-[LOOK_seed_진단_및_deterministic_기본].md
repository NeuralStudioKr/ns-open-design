# 0914-N19-1 상위설계 — LOOK seed fallback 진단 + deterministic 기본 (loop532/533)

## 증상 (유저 리포트)

```
error_code: clone_look_seed_fallback
reason=unavailable (no persisted status:error detail on this turn)
```

MiniMax prompt-fill 이 실패해 LOOK seed 만 남고, Retry dock 은 뜨지만 copy-diagnostics 에 실패 원인이 없다.

## 원인

1. **Fill 실패**: staging 기본이 `prompt`(MiniMax 2차 턴). 모델 출력 unparseable / structure skip → seed-fallback.
2. **진단 공백**: status:error detail 에 사용자 한국어 문장만 저장 → `extractPersistedRunErrorDiagnostic` null → `reason=unavailable`.

## 해결

| 슬라이스 | 내용 |
|---|---|
| **A (532)** | `TEMPLATE_CLONE_FILL_DEFAULT_MODE = deterministic` — MiniMax 2차 턴 제거로 LOOK seed 배너 예방. `prompt` 는 env/localStorage rollback. |
| **B (533)** | `formatCloneLookSeedFallbackErrorDetail(reason)` — error event 에 encode 된 diagnostic tail. 복구 경로별 reason 태깅. |

## 트레이드오프

Deterministic 은 loop421 에서 지적한 얇은 카피 위험이 있다. 이번 우선순위는 **완성본 미생성(LOOK seed 배너)** 방지. 품질 개선은 sparse top-up / 이후 prompt 품질 루프.
