# 0901-N02-13 구현설계 — `.lbl` fill · `*-postit` · flow arrows (C9)

상위: [0901-N02-12](./0901-N02-12-구현설계-[Clone_slot-map-C8].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

1. hermes `hc-card`처럼 **h3–h5 없이 `.lbl`만 있는 카드**도 제목 슬롯으로 채운다.
2. scatterbrain `feature-postit` 등 sticky peer를 trim (hero `statement-postit` 제외).
3. broadside `flow` + `flow-arrow` orphan 제거를 픽스처로 고정.

## 범위

1. fill: `.lbl` (h3–h5 없을 때만) · `.val`/`.desc` 비움. `ts-card`는 기존 h4 우선.
2. peer: exact `feature-postit`/`col-postit` + letter-led `*-postit`
3. deny: `statement-postit` · `main-title-postit` · `main-text-postit` · `*-title-postit`
4. flow + flow-arrow 회귀 (C8 arrow 규칙 재사용)

## 비범위

- MiniMax 실키 live E2E
- 루프366 FileViewer 브라우저 bake
- filmstrip 수동 bake (0901-N01-C3 staging bake 완료)

## 테스트

| 케이스 | 기대 |
|--------|------|
| hc-grid-3 + hc-card ×3 · 2줄 | 2 · lbl 채움 · val/desc 비움 |
| ts-card + lbl+h4 | h4에 채움 · lbl 유지 |
| feature-postit ×3 | 2 · statement-postit 비대상 |
| flow + flow-arrow | step 2 · arrow 1 |

## 완료 기준

- N02-3 **C9** ☑ · MiniMax ☐

## 다음 추천 작업

1. MiniMax 키 환경 Clone fill live smoke
2. 루프366 FileViewer ←/→ staging bake (브라우저)
3. hermes/oc/kb LOOK seed → fill → heal 추가 통합(선택)
4. compare-postit / 기타 sticky 레이아웃 미세 조정(선택)
