# 0914-N07-2 구현설계 — outline generator 텔레메트리

상위: [0914-N07-1](./0914-N07-1-상위설계-[outline_generator_텔레메트리].md)

## contracts

`summarizeTemplateCloneOutlineQuality` · `buildTemplateCloneOutlineQualityObserve`

- 파싱: `parseTemplateCloneDeckOutline` → 실패 시 `recoverPartialTemplateCloneOutline`
- synth outline은 호출하지 않음 (생성 경로를 바꾸지 않음)

## web

`observeTemplateCloneOutlineQuality` → `devLog.info('[teamver] outline-quality')`

`ProjectView` JSON slot-fill 결정 직후, persist-quality와 같이 호출. try/catch로 persist를 깨지 않음.

## 테스트

- title-only outline → rate 1, slot-fill HTML 불변
- dense 4+ roleHint → title-only 0
- 잘린 JSON → `source: partial`
- 파싱 실패 → `source: none`
