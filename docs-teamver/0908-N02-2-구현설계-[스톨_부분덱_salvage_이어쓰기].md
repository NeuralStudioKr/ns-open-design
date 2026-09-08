# 0908-N02-2 구현설계 — 스톨 부분 덱 salvage · 이어쓰기 (루프477)

상위: [0908-N02-1](./0908-N02-1-상위설계-[스톨_부분덱_salvage_이어쓰기].md) · 현황: [0908-N02-3](./0908-N02-3-구현현황-[스톨_부분덱_salvage_이어쓰기].md)

## 목표

`AGENT_EXECUTION_STALLED`로 끝난 슬라이드 런이 **부분 덱을 이미 스트리밍했다면**, 성공 종료와 같은 terminal finalize(`scheduleStreamRunHtmlAutoOpen`)에 태워 salvage·auto-continue를 받게 한다. 스톨 에러에는 `resumable`을 붙여 이어쓰기 dock을 살린다.

## 파일

| 경로 | 역할 |
|------|------|
| `apps/web/src/providers/api-proxy.ts` | 스톨 에러에 `resumable: true` |
| `apps/web/src/teamver/stalledRunDeckSalvage.ts` (신규) | salvage 자격 판정 + notice/status code |
| `apps/web/src/components/ProjectView.tsx` | `parser.flush()` 블록 추출 · onError salvage 분기 |
| `apps/web/tests/teamver/stalledRunDeckSalvage.test.ts` (신규) | 자격 판정 회귀 |
| `apps/web/tests/providers/api-proxy.test.ts` | 스톨 `resumable` 회귀 |

## 구현

### 1. 스톨 에러 `resumable`

`createProxyStreamIdleError()`에 `resumable: true`. `retryable`은 기존 게이트 유지 — 토큰이 그려진 뒤 soft-retry는 UI 중복이므로 계속 `false`로 강등되지만, `resumable`은 살아남아 `ProjectView` onError(`err.resumable`)와 ChatPane 이어쓰기가 동작한다.

### 2. salvage 자격 (순수 함수)

`stalledRunPartialDeckText({ errorCode, slideOnlyMvp, streamedText })` → `string | null`

- `slideOnlyMvp` 아니면 `null` (프로토타입 런은 기존 실패 UX)
- `errorCode !== 'AGENT_EXECUTION_STALLED'` → `null`
- 스트리밍 텍스트에 `<!doctype html` / `<html` 시작이 없으면 `null` (`<artifact>` 태그만 온 경우 = 건질 것 없음)
- 최소 길이 `STALLED_PARTIAL_DECK_MIN_CHARS`(400) 미만 → `null`

`STALLED_PARTIAL_DECK_STATUS_CODE = 'stalled_partial_deck'` · `formatStalledPartialDeckNotice()`는 경고 notice 문구.

### 3. parser flush 공용화

onDone 안의 `for (const ev of parser.flush())` 블록(미종료 `<artifact>` → `parsedArtifact` / `bestArtifactSoFar` 갱신)을 `flushTerminalParserArtifacts()`로 추출해 onDone·onError salvage 분기가 공유한다. 스톨은 artifact가 닫히지 않으므로 이 flush 없이는 `resolveTerminalArtifactToPersist`가 부분 덱을 못 본다.

### 4. onError salvage 분기

`textBuffer.flush()` 직후, `runMayFinalize`인 경우에만 판정한다. 자격이 있으면 onDone 종료 절차를 그대로 미러링한다.

1. 경고 status event(`STALLED_PARTIAL_DECK_STATUS_CODE`) + `resumable: true` — **durable error·전역 배너·`failed` 확정 없음**
2. comment attachment는 `needs_review`
3. `flushTerminalParserArtifacts()`
4. `clearCurrentRunStreamingMarker` · API 모드면 background chat `active: false`
5. `scheduleStreamRunHtmlAutoOpen(text)` → 저장/오픈/succeeded-notice 또는 incomplete → auto-continue(이어쓰기)
6. `onProjectsRefresh()` · `releaseOwnedDaemonRun()` 후 return

run ref 초기화(`runPersistTargetFileRef` 등)는 파이프라인 `finally`가 담당하므로 이 분기에서 건드리지 않는다 — 먼저 지우면 persist 타깃이 사라진다.

자격 미달 스톨·그 외 에러는 기존 경로(실패 카드 + `err.resumable`) 그대로.

## 테스트

- `루프477: stalled deck stream with partial html is salvageable`
- 비자격: 다른 코드 / `slideOnlyMvp=false` / artifact 태그만 / 짧은 텍스트
- api-proxy: 스톨 에러 `resumable === true` (delta 전·후 모두)

## 비범위

- 유휴 창(deck 10분 / 일반 5분), 데몬 `OD_BYOK_PROXY_INACTIVITY_TIMEOUT_MS` 값 변경
- MiniMax 업스트림 침묵 자체의 회피(모델·프롬프트 분할)
- deterministic 서버 fill 경로 (스톨 무관)

## 변경 이력

| 2026-09-08 13:35 | 루프477 구현설계 |
