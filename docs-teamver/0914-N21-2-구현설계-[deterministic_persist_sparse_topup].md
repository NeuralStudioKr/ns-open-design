# 0914-N21-2 구현설계 — deterministic persist 후 sparse top-up

상위: [0914-N21-1](./0914-N21-1-상위설계-[deterministic_persist_sparse_topup].md)

## contracts

- `TemplateClonePersistQualityPhase`에 `'deterministic-fill'` 추가
- `ProjectMetadata.templateCloneSparseCheckPending?: boolean`

## slideCountTopUp.ts

- `shouldRunDeterministicSparseCheck` — pending + filled + mode=deterministic + fillPending 아님
- `deterministicSparseCheckSessionKey(projectId)` — StrictMode/재마운트 중복 방지

## 메타 기록

성공한 deterministic fill 뒤에 같은 필드를 붙인다.

- `App.tsx` Home create
- `ChatComposer` Canvas / Drive (성공 + LOOK seed fallback)
- daemon `project-routes` project metadata (FE가 빠져도 landing이 한 번 검사)

artifact manifest에는 넣지 않는다 (덱 HTML과 무관).

## ProjectView

- `requestSlideCountTopUpRef(htmlPath, { mode: 'sparse-only' })`
  - observe `deterministic-fill`
  - thin rewrite / 장수 top-up / rewrite-exhausted 배너 **생략**
  - `shouldQueueSparseContentTopUp`만 기존 `fireRepair`로 연결
- landing effect: `shouldRunDeterministicSparseCheck` → session latch → pending=false patch → sparse-only 호출

## 테스트

- phase `deterministic-fill` observe
- `shouldRunDeterministicSparseCheck` 게이트
- App / ChatComposer / daemon 소스에 pending 플래그
- ProjectView: sparse-only가 thin rewrite를 호출하지 않음
