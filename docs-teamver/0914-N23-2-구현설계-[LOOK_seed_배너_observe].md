# 0914-N23-2 구현설계 — LOOK seed 배너 observe-only

상위: [0914-N23-1](./0914-N23-1-상위설계-[LOOK_seed_배너_observe].md)

## contracts

- `TemplateCloneLookSeedFallbackObserve`
- `buildTemplateCloneLookSeedFallbackObserve`

## web

- `observeTemplateCloneLookSeedFallback` → `[teamver] look-seed-fallback`
- `encodePersistedRunErrorDetail` extras (`genericBrief` / `source` / `fillMode`)
- `formatCloneLookSeedFallbackErrorDetail`가 extras를 넣음

## 호출

- ProjectView persist 마감 — `source=persist`
- slide-deliverable-recovery reload — `source=reload`

observe 실패는 persist/복구를 막지 않는다.

## 테스트

- observe payload shape
- diagnostic tail extras
- 기본 배너 문장 불변
