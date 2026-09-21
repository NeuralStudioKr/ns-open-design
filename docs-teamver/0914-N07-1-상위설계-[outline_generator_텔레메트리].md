# 0914-N07-1 상위설계 — outline generator 텔레메트리 (observe-only)

문서 60 §1.32 후속. persist HTML 품질(루프523)은 남겼지만, JSON slot-fill **모델 outline**의 roleHint 다양성·title-only 비율은 관측되지 않는다. 첫 채우기가 얕으면 host enrich가 막아도 원인을 숫자로 못 본다.

## 범위

- 측정만 한다. outline / synth preset / persist HTML은 바꾸지 않는다.
- generic synth preset 세분화는 품질 리스크가 있어 하지 않는다.

## 지표

| 지표 | 뜻 |
|---|---|
| `distinctRoleHintCount` | 모델이 준 고유 `roleHint` 수 |
| `titleOnlySlideRate` | body/lead/item body가 12자 미만인 슬라이드 비율 |
| `titleOnlyCardRate` | items[] 중 thin body 비율 |
| `source` | `model` / `partial` / `none` |

## 비범위

- PostHog 카탈로그
- 사용자 챗 카드 노출
- 임계값으로 persist 실패
- JSON 기본값 전환
