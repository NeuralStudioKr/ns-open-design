# 0907-N06-5 구현설계 — 서비스 소개 cover lead 미발명 (루프474)

상위: [0907-N06-1](./0907-N06-1-상위설계-[사이트분석_prompt-fill_outline_주입].md)  
직전: [0907-N06-4](./0907-N06-4-구현설계-[Clone_deterministic-cover-lead].md) 루프473.

## 체감

루프473이 `{topic} 한눈에`를 없앴지만, 모든 서비스 소개 URL에 Teamver 전용 카피를 넣었다.

`{topic} — 팀의 디자인 작업을 파일·대화·템플릿 한 흐름으로 연결합니다`

`expo.dev` 사이트 분석에도 같은 문장이 붙는다. 소스에 없는 제품 주장이다. 루프471 KPI 가드와 충돌.

## 정책

`synthesizeTemplateCloneCoverLead` 시그니처는 유지.

1. 서비스 소개 / 사이트 분석(또는 표지 제목이 `소개`로 끝남)은 소스 headings/preview의 제품 카피를 lead로 쓴다.
2. 소스 사실이 없으면 `{topic}가 다루는 문제와 제공 가치` — 분석 과제만 이름 붙인다.
3. `파일·대화·템플릿` 같은 Teamver 작업 흐름 문장을 합성하지 않는다. KPI `%`도 만들지 않는다.
4. 일반 free-form은 루프473 문장(`핵심 맥락과 다음 단계`)을 유지한다.
5. `{topic} 한눈에`는 계속 금지.

## 검증

- Teamver URL brief lead에 `파일·대화·템플릿` / `한눈에` / `%` 없음
- `expo.dev` 서비스 소개에도 Teamver 작업 흐름 문장 없음
- Source preview가 있으면 그 한 줄이 lead
- Capsule quality-gate clone에 `한눈에` 없음(루프473 유지)

## 비범위

- Playwright pixel / FileViewer
- MiniMax live
- 호출자가 명시한 `한눈에` 픽스처 wipe
