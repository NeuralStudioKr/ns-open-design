# 0914-N12-1 상위설계 — Generic brief 시 MiniMax auto-fill soft defer (loop529)

상위: `0914-N09-1` Option A.

## 문제

주제 없는 Home create (`슬라이드` / empty / boilerplate) 도 LOOK seed 후 MiniMax fill 을 자동 전송한다. 모델이 파싱 불가 outline 을 내면 raw LOOK seed 배너가 뜬다 (N09 P1).

## 해결 (soft)

- `isGenericTemplateCloneTopicBrief` SSOT 추가.
- Home create (`!hasSourceMaterial`) 에서 generic 이면:
  - LOOK seed 는 유지
  - fill queue + `od:auto-send-first` **생략**
  - `setWorkingDirError` 로 "주제를 구체적으로 입력하면…" 안내
- Canvas/Drive (`hasSourceMaterial`) 는 제외 (소스 brief 가 anchor).
- Hard block 금지 (템플릿 미리보기 UX 유지).

## 스코프 밖

Option B/C (synth 확장, 프롬프트 튜닝) — 텔레메트리 후.
