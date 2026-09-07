# 0907-N01-3 구현현황 — Block Frame neo 슬롯 / preview heal / AI fill (루프461–463)

상위: [0907-N01-1](./0907-N01-1-상위설계-[Block_frame-neo-slot-gate].md) ·
설계: [0907-N01-2](./0907-N01-2-구현설계-[Block_frame-neo-slot-gate].md) ·
fill 모드 정책: [0907-N02-1](./0907-N02-1-상위설계-[Clone_LOOK와_AI_본문_동시사용].md) ·
[0901-N02 rollback switch](./0901-N02-template-clone-fill-rollback-switch.md)

## 진행

| 루프 | 상태 | 요약 |
|------|------|------|
| 461 | ☑ | neo 슬롯 fill 게이트를 body 구조 마커로 전환 · leftover scrub |
| 462 | ☑ | preview heal이 `col-right`/`data-column` peer를 orphan 하던 회귀 수정 |
| 463 | ☑ | 기본 fill 모드 `prompt` — LOOK + MiniMax 내용 생성 · **정책 문서화** |

## 루프462 결정 (heal)

- orphan 패턴은 fill 직후가 아니라 FileViewer/srcdoc heal 파이프라인 결과.
- `classValueLooksCardish` + `blockFrameNeoChromeLabel`(Overview→개요).

## 루프463 결정 (내용 품질 + 동시 사용)

- deterministic-only 즉시 종료는 내용 구성이 부적절 → 기본 경로에서 폐기.
- **LOOK와 AI는 동시에 쓴다** (`prompt`). 자세한 이유·금지 조합·모드 표는 [0907-N02-1](./0907-N02-1-상위설계-[Clone_LOOK와_AI_본문_동시사용].md).
- staging/env-empty 기본 `prompt`. `deterministic`은 명시 opt-in.

## 검증

- [x] contracts template-clone-fill / heal 관련
- [x] web `templateCloneContentFill` 36 passed
- [x] 정책 문서 0907-N02-1 + rollback switch · 00 누적 · MemKraft
- [ ] Design staging 재배포(`=prompt`) 후 Block Frame 생성 → MiniMax 턴 + 레이아웃 확인
