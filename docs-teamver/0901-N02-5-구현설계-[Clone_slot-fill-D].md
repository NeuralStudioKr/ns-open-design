# 0901-N02-5 구현설계 — hybrid HTML fallback 제거 (D)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · B5: [0901-N02-2](./0901-N02-2-구현설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

Clone first-fill에서 JSON repair가 한 번 더 실패해도 **모델 HTML hybrid를 persist하지 않는다**.  
motif/CSS가 깨진 MiniMax dump 대신 **LOOK seed**를 유지하고 `templateCloneSlotFillFallback: true`만 찍는다.

## 결정표 (`decideTemplateCloneSlotFillTerminal`)

| 조건 | 결과 |
|------|------|
| seed + valid outline → apply ok | `slot-fill` |
| 실패 ∧ repair 미시도 | `queue-repair` |
| 실패 ∧ repair 이미 있음 ∧ seed 있음 | `seed-fallback` `{ html: seed, title }` |
| 실패 ∧ repair 이미 있음 ∧ seed 없음 | `abort` (persist 없음; 모델 HTML 금지) |

`html-fallback` kind **제거**.

## title

seed-fallback title: raw JSON `"title"` 느슨 추출 → seed `<title>` → `슬라이드`.

## ProjectView

1. `seed-fallback`: `artifactToPersist = { deck, seed html, title }`, fallback metadata ref true.
2. `abort`: `artifactToPersist = null`, fallback ref true (또는 false — persist 없으므로 metadata 불필요). **모델 HTML resolve 결과 폐기**.
3. catch: seed 재사용 시도; 없으면 abort와 동일.
4. emergency salvage: 기존처럼 `pendingSlotFillRepair` 중에만 억제. seed-fallback는 seed를 persist하므로 producedHtml이 생기면 salvage 조건이 자연히 꺼짐.

## 테스트

- B5 `html-fallback` → `seed-fallback` (seed HTML 포함, motif class 유지)
- seed 없을 때 repair 후 `abort`
- FE: 결정 kind 분기 (있으면) — 최소 contracts로 충분

## 비범위

- C2 id slot map
- MiniMax 실키 E2E
- leftover `기둥 Z`
- repair 횟수 변경 (1회 유지)
