# 0914-N22-1 상위설계 — LOOK seed 배너 generic-brief 문장 (loop536)

상위: `0914-N09-1` Option A leftover. N15는 Home empty-brief를 fill 전에 soft-defer 했다. 남은 것은 **이미 LOOK seed 배너가 뜬 뒤**의 상황별 카피.

병렬 loop535 (`0914-N21` fill 기본 prompt 복구) 이후 MiniMax fill이 다시 기본이라 LOOK seed 배너가 더 자주 뜬다.

## 문제

`formatCloneLookSeedFallbackNotice`는 항상 「채우기에 실패해… 다시 시도」만 말한다. N09가 적은 「이번 요청에 주제가 명확하지 않았습니다. 채팅에 주제를 더 구체적으로 입력해 주세요.」는 Home defer 안내(`formatGenericBriefDeferFillNotice`)에만 가깝게 있고, MiniMax/JSON fill이 raw LOOK seed로 떨어진 배너에는 없다.

주제가 있는 요청이 모델 파싱으로 실패한 경우에는 이 문장이 거짓이다.

## 하지 않을 것

- fill / heal / LOOK merge / synth HTML 변경 없음
- Retry dock (`failed` + `CLONE_LOOK_SEED_FALLBACK_STATUS_CODE`) 동작 변경 없음
- Canvas/Drive (`hasSourceMaterial`) 에는 generic 문장 없음 — 소스 brief가 topic
- Option B/C (generic synth, 프롬프트 튜닝) 없음

## 해결

`isGenericTemplateCloneTopicBrief`가 참이고 첨부/소스 brief가 없을 때만 기존 LOOK seed 문장 뒤에 N09 문장을 붙인다. topical brief · Canvas/Drive는 기존 카피 유지.
