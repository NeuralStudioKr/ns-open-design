# 0901-N02-25 구현설계 — deterministic 서비스 소개 cover lead (루프473)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)  
직전: [0901-N02-24](./0901-N02-24-구현설계-[Clone_layout-smoke].md) 루프472 · [0907-N06-2](./0907-N06-2-구현설계-[사이트분석_prompt-fill_outline_주입].md) 루프471 비범위.

## 목표

루프471 「다음」 / 54-2 항목 5 — prompt-fill outline은 주입됐지만 deterministic synth cover lead가 여전히 `{topic} 한눈에`라서 `www.teamver.com` 서비스 소개가 `팀버 한눈에`로 시작한다.

FileViewer 클릭·MiniMax live는 이 환경에서 확인하지 못한다. 1차는 **synth cover lead 계약**.

## 정책

1. `synthesizeTemplateCloneCoverLead({ cover, brief })`가 유일한 합성 cover lead.
2. 서비스 소개 / 사이트 분석(`looksLikeTemplateCloneServiceIntroBrief` 또는 표지 제목이 `소개`로 끝남)은 `{topic} 한눈에` 금지.
3. Source headings / Source preview에 표지·섹션 라벨이 아닌 제품 카피가 있으면 그걸 lead로 쓴다. KPI·기능명을 새로 만들지 않는다.
4. 소스 사실이 없으면 `{topic}가 다루는 문제와 제공 가치` — 분석 과제만 이름 붙인다.
5. 일반 free-form(Expo 등)은 기존 `{topic} 한눈에` 유지.
6. 공식 영문 `example.html`은 Hangul brief 없이 no-op (기존 leftover heal 계약).

## 호출부

- `synthesizeTemplateCloneOutlineFromBrief`
- `buildTemplateClonedDeckHtml` empty-brief starter
- `scrubLeftoverCatalogExampleHtml` fallback
- `synthesizeTemplateCloneSlidesFromFreeFormBrief` fallback
- `resolveTemplateCloneSlidesForDeterministicFill` cover densify
- Biennale / Cobalt / Sakura / Long Table 빈 lead 슬롯 fallback

## 테스트

- contracts `template-clone-outline` — Teamver URL brief lead에 `한눈에` 없음 · preview 우선 · Expo는 `한눈에` 유지 · KPI `%` 없음
- `template-clone-fill` empty-brief padding이 새 fallback lead를 허용

## 비범위

- Playwright pixel / FileViewer bake
- MiniMax live smoke
- Studio/Creative leftover denylist
