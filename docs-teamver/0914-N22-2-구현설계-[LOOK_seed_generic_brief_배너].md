# 0914-N22-2 구현설계 — LOOK seed 배너 generic-brief 문장

상위: [0914-N22-1](./0914-N22-1-상위설계-[LOOK_seed_generic_brief_배너].md)

## projectErrorMessages.ts

- `formatCloneLookSeedFallbackNotice({ genericBrief })`
- `formatCloneLookSeedFallbackErrorDetail(reason, { genericBrief })`
- generic이 아니면 기존 문장 그대로 (Retry 「다시 시도」 유지)

## templateCloneContentFill.ts

- `shouldExplainGenericBriefOnLookSeedFallback`
  - `isGenericTemplateCloneTopicBrief(brief)`
  - attachments 또는 fill seed의 `attached source materials (Canvas/Drive/files)` → false

## 호출

- `ProjectView` LOOK seed persist 마감 — `runVisiblePromptRef` + 해당 user 첨부/본문
- `slide-deliverable-recovery` reload 복구 — preceding user

## 테스트

- generic / topical / Canvas source 분기
- 기본 notice는 여전히 「다시 시도」
- recovery가 messages를 넘기면 generic 문장
