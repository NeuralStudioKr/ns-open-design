# 0914-N13-1 상위설계 — stalled_partial_deck Retry copy 불일치 (loop529)

감사(N11 후속): `formatStalledPartialDeckNotice` 는 「다시 시도」를 말하지만, 부분 HTML 저장 성공 시 finalize 는 `succeeded` → Retry dock 미렌더.

## 해결

Emergency salvage 와 같이 **review 톤**으로 copy 변경. 부분 덱은 이미 저장됐으므로 failed 로 바꾸지 않는다.

```
- …이어서 만들거나 다시 시도해 주세요.
+ …내용을 확인한 뒤, 채팅에서 이어서 요청해 주세요.
```
