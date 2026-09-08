# 0908-N02-3 구현현황 — 스톨 부분 덱 salvage · 이어쓰기 (루프477)

상위: [0908-N02-1](./0908-N02-1-상위설계-[스톨_부분덱_salvage_이어쓰기].md) · 설계: [0908-N02-2](./0908-N02-2-구현설계-[스톨_부분덱_salvage_이어쓰기].md)

## 진행

| 항목 | 상태 |
|---|---|
| 스톨 에러 `resumable: true` (`api-proxy.ts`) | ☑ |
| salvage 자격 순수 함수 + notice/status code (`stalledRunDeckSalvage.ts`) | ☑ |
| `parser.flush()` → `flushTerminalParserArtifacts()` 추출 | ☑ |
| onError salvage 분기 (terminal finalize 재사용) | ☑ |
| 단위 테스트 (자격 5케이스 + api-proxy `resumable`) | ☑ |
| staging 배포 후 실제 스톨 재현 확인 | ☐ |
| 부분 덱 없는 스톨 soft-retry 스트림 고정 (루프478) | ☑ |

## 결정

- **스톨 처리는 성공 경로 재사용.** 별도 salvage 구현을 만들지 않고 `scheduleStreamRunHtmlAutoOpen`에 태웠다. emergency salvage → auto-continue → outline fallback → succeeded-notice / failed+resumable이 이미 그 안에 있어서, 스톨만 다른 규칙을 갖지 않는다.
- **run ref 초기화 금지.** salvage 분기에서 `runPersistTargetFileRef` 등을 지우지 않는다. 파이프라인 `finally`가 소유하며, 먼저 지우면 persist 타깃이 사라진다.
- **자격 하한(400자 + `<!doctype html`/`<html`).** `<artifact>` 태그만 온 스톨(사용자 리포트의 `<head>` 직후 keepalive 구간)은 건질 HTML이 없어 기존 실패 카드를 유지한다.
- **`retryable`은 그대로.** 토큰이 그려진 뒤 soft-retry는 UI 중복이므로 계속 `false`. 대신 `resumable: true`로 수동 이어쓰기를 연다.

## 검증

- `apps/web/tests/teamver/stalledRunDeckSalvage.test.ts` — 자격/비자격 5케이스 + notice 코드 ☑
- `apps/web/tests/providers/api-proxy.test.ts` — 스톨 `resumable === true` (delta 후에도) ☑ (루프477)
- `apps/web/tests/providers/api-proxy.test.ts` — 루프478 무토큰 hang → 2회차 성공 / 3회 소진 `retryable` 유지 ☑ (파일 전체 47 passed)
- `tsc --noEmit` — 수정 라인에 신규 오류 없음 ☑ (`src/_archive`·일부 테스트 파일의 기존 오류만 잔존)
- ProjectView 렌더 스위트(`ProjectView.*`, `App.*`)는 로컬 데몬(127.0.0.1:3000) 의존으로 이 환경에서 baseline부터 실패 — 이번 변경 전후 동일, 판정 불가 ☐

## 남은 일

1. staging 배포 후 실제 MiniMax 스톨에서 부분 덱 저장·이어쓰기 확인.
2. ~~부분 덱 없는 스톨(토큰 이전 침묵)의 재시도 UX 점검 — soft-retry 1회가 실제로 붙는지.~~ → 루프478 ☑ (`streamProxyEndpoint` 무토큰 hang → 2회차 성공 / 3회 소진).
3. 근본 완화(모델 분할 생성·유휴 창 조정)는 별도 루프.

## 변경 이력

| 2026-09-08 13:55 | 루프477 구현·테스트 완료, 문서 N02로 재번호(동일 날짜 N01은 Design 활성WS 에픽) |
| 2026-09-08 | 루프478 — 무토큰 스톨 soft-retry를 스트림 루프 테스트로 고정 ([0908-N02-4](./0908-N02-4-구현설계-[스톨_무부분덱_soft-retry].md)) |
