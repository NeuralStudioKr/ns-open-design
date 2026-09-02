# 0901-N02-9 구현설계 — prefixed `*-step` peer heuristic (C5)

상위: [0901-N02-8](./0901-N02-8-구현설계-[Clone_slot-map-C4].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

process/timeline 템플릿에서 **스텝 peer 수 = 내용 줄 수**.  
맵 없이 `kb-step` · `timeline-step` · `xw-step` · bare `.step` demo 잔여를 제거한다.

## 범위

1. **Peer suffix:** `/^[a-z][a-z0-9_-]*-step$/` (문자 시작 · `-step`로 끝)
2. **공통 peer:** exact `step` (creative-mode / soft-editorial)
3. **Host suffix:** `/^[a-z][a-z0-9_-]*-steps$/` (`oc-steps` · `xw-steps`)
4. **fill 슬롯:** `kb-step-title` · `step-title` · `cycle-title` · `flow-title` · `xw-txt` · `.t`(+`.d`)
5. **오탐 금지:** `4-step` / `five-step` / `four-step` 등 개수 섹션 토큰 · `step-title` / `kb-step-body` 내부 슬롯

## 비범위

- leftover 칸 번호 확장
- MiniMax 실키 live E2E (키 없으면 ☐)
- bare `stat` / bare `kpi`
- 신규 템플릿 id별 맵

## 테스트

| 케이스 | 기대 |
|--------|------|
| kb-pipeline + kb-step ×3 · 2줄 | kb-step 2 · title 채움 · body 비움 |
| timeline + timeline-step | 2장 · step-title |
| xw-steps + xw-step | 2장 · xw-txt |
| flow + bare step `.t`/`.d` | 2장 |
| five-step ×3 | trim 없음 (섹션 크롬) |

## 완료 기준

- N02-3 **C5** ☑ · MiniMax E2E는 키 유무에 따라 ☑/☐
