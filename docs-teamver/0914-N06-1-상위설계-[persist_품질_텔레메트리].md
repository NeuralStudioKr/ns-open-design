# 0914-N06-1 상위설계 — persist 품질 텔레메트리 (observe-only)

문서 60 §1.36 보류: persist 후 **distinct shell** · **title-only card rate**를 관측할 수단이 없다. merge/slot-fill이 저장 HTML을 바꿔도, staging에서 숫자가 남지 않아 품질이 좋아졌는지 모른다.

## 범위

- 측정만 한다. persist HTML · LOOK merge · heal · fill 결과는 바꾸지 않는다.
- 저장 거부 / Retry / LOOK seed 승격에 숫자를 쓰지 않는다.
- JSON 기본값 전환은 하지 않는다.
- staging MiniMax live bake는 이 환경에 키·배포가 없어 후속.

## 지표

| 지표 | 뜻 |
|---|---|
| `distinctShellCount` | persist HTML에서 `classifyTemplateCloneShellRole` 고유 수 |
| `titleOnlyCardRate` | 카드/리스트 item 중 body가 12자 미만인 비율 |

prompt-fill은 merge 전(model) / 후(host)를 같이 남겨 delta를 본다.

## 비범위

- PostHog 이벤트 카탈로그 추가
- 사용자 챗 카드에 숫자 노출
- 임계값으로 persist 실패 처리
