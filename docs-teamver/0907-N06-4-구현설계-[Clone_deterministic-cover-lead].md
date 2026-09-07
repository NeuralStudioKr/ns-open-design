# 0907-N06-4 구현설계 — deterministic synth cover lead 교체 (루프473)

상위: [0907-N06-1](./0907-N06-1-상위설계-[사이트분석_prompt-fill_outline_주입].md) · 설계: [0907-N06-2](./0907-N06-2-구현설계-[사이트분석_prompt-fill_outline_주입].md)  
현황: [0907-N06-3](./0907-N06-3-구현현황-[사이트분석_prompt-fill_outline_주입].md) · [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

루프471 비범위 — LOOK seed / daemon deterministic synth가 `{topic} 한눈에`를 표지 lead로 써서, prompt-fill이 금지한 얕은 패턴을 그대로 복제한다.

## 변경

`synthesizeTemplateCloneCoverLead(cover, brief?)`:

- 서비스 소개 brief: `{topic} — 팀의 디자인 작업을 파일·대화·템플릿 한 흐름으로 연결합니다`
- 그 외: `{topic} — 핵심 맥락과 다음 단계를 정리합니다`
- 조사 붙여쓰기를 피해 `팀버은`/`팀버이`를 만들지 않는다
- outline 합성 · empty-brief pad · leftover scrub · kit lede fallback가 모두 이 helper를 쓴다

호출자가 넘긴 `lead: '팀버 한눈에'`는 leftover 회귀 픽스처로 유지한다.

## 검증

- contracts outline: service-intro 10장에 `한눈에` 없음 · promise lead
- contracts fill: empty-brief pad가 `한눈에`를 쓰지 않음
- Capsule quality-gate clone에 `한눈에` 없음

## 비범위

- Playwright pixel / FileViewer
- MiniMax live
- 호출자가 명시한 한눈에 카피 wipe
- 서비스 소개 lead의 소스 바인딩 · 미발명 가드 → 루프474 [0907-N06-5](./0907-N06-5-구현설계-[Clone_cover-lead-no-invent].md)
