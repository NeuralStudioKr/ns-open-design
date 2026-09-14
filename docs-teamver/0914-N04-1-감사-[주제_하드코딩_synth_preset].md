# 0914-N04-1 감사 — 주제(삼각함수·monorepo 등) 하드코딩

## 발견 (운영)

`packages/contracts/src/template-clone-fill.ts`의 deterministic synth가 brief를 regex로 분류해 **통짜 본문**을 넣었다.

| preset | 트리거 예 | 위험 |
|--------|-----------|------|
| `trigonometry` | 삼각함수, sin/cos, 단위원… | QA 주제가 전 사용자 덱 본문으로 고정 |
| `cloud-native` | 쿠버네티스, 마이크로서비스… | 동일 |
| `monorepo` | monorepo, turborepo, nx… | 동일 |
| `expo` | expo, EAS, react native… | 동일 |

`미적분`은 preset 없음 — `heal-heading-item-count` 주석 예시만.

## 조치 (루프516)

- 주제 preset **전부 삭제**
- 남김: `service-intro`(URL 서비스 소개 구조) + `generic`(`${topic}`만 끼운 골격)
- 테스트: 단위원/Changesets/EAS 등 **에세이 문구 미포함**을 assert

## 유지(문제 아님)

- 버그 리포트 주석의 `삼각함수` 언급
- 테스트 fixture brief에 주제를 넣는 것 (assert는 일반 골격)
