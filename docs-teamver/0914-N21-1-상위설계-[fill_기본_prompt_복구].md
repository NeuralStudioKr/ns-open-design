# 0914-N21-1 상위설계 — fill 기본을 MiniMax prompt로 복구 (loop535)

## 증상

템플릿 선택 후 생성이 **시작하자마자 종료**. 결과물은 LOOK seed + 서버 synth 카피(얕음, chart 붕괴 등).

## 원인

루프532가 LOOK seed 배너를 피하려고 기본 fill을 `deterministic`으로 바꿨다.

- 서버가 LOOK seed를 채우고 MiniMax 2차 턴을 **큐하지 않음**
- `usedDeterministicCloneFill` → `od:auto-send-first` 미설정
- 채팅 스트림이 없어 유저 체감은 “바로 끝남”

제품 의도(루프463): **LOOK seed 유지 + MiniMax가 내용을 씀**.

## 해결

`TEMPLATE_CLONE_FILL_DEFAULT_MODE` 및 staging/production example → `prompt`.
`deterministic` 은 env opt-in.

LOOK seed 진단 tail(루프533) · chart-svg 보존(루프534) 은 유지.
