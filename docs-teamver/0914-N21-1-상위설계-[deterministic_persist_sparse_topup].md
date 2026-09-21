# 0914-N21-1 상위설계 — deterministic persist 후 sparse top-up (loop535)

상위: loop532/533 (`0914-N19`). N19 다음 단계: 「품질 개선은 sparse top-up / 이후 prompt 품질 루프」.
병렬 loop534 (`0914-N20`) 는 Block-frame chart-svg 보존.

## 문제

staging 기본 fill은 `deterministic`(daemon slot-fill, MiniMax 2차 턴 없음). Home / Canvas / Drive는 채운 `deck.html`을 저장한 뒤 auto-send를 건너뛴다.

`shouldQueueSparseContentTopUp`은 MiniMax persist 직후(`requestSlideCountTopUpRef`)에서만 평가된다. deterministic create는 그 경로를 타지 않아, heading shortfall / title-only card가 있어도 기존 soft-improvement sparse-repair가 한 번도 안 돈다.

persist-quality observe(`루프523`)도 JSON slot-fill · prompt-fill LOOK merge에만 있다. deterministic 덱의 distinct-shell / title-only rate는 남지 않는다.

## 하지 않을 것

- fill / heal / LOOK merge / synth preset HTML 변경 없음
- fill 기본값을 `prompt` / `json`으로 되돌리지 않음
- thin-prior full rewrite · slide-count APPEND를 deterministic landing에 연결하지 않음 (루프421/532 — MiniMax HTML rewrite가 키트를 덮고 `AGENT_EXECUTION_FAILED`를 만듦)
- 성공한 슬라이드를 재작성하지 않음. evidence가 있을 때만 기존 deck-patch sparse-repair

## 해결

1. deterministic 성공 metadata에 `templateCloneSparseCheckPending: true`
2. ProjectView가 대화를 읽은 뒤 **한 번만** `deck.html`을 보고 persist-quality observe (`phase: deterministic-fill`)
3. 기존 `shouldQueueSparseContentTopUp`이 참일 때만 숨은 sparse-repair (soft-improvement). 실패해도 저장된 덱은 유지

## 트레이드오프

evidence가 있으면 MiniMax 한 턴이 다시 돈다. 루프481이 이미 soft-cancel / 조용한 실패 문구를 갖고 있어, 완성본이 깨진 것처럼 보이지 않는다. thin LOOK seed는 `thinPrior` 게이트로 queue되지 않는다.
