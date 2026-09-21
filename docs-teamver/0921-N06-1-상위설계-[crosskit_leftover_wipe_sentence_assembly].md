# 0921-N06-1 상위설계 · Cross-kit leftover wipe / 문장 짜맞추기

상위: [0921-N05-1 AI fill 강제 · 서버 문장 짜맞추기 제거](./0921-N05-1-상위설계-[ai_fill_강제·짜맞추기_제거].md)  
선행: [0921-N04 kit pack Teamver-scope guard](./0921-N04-1-상위설계-[kit_pack_teamver_scope_guard].md)  
SSOT: [60](./60_Canvas_Slide_시스템_프롬프트_템플릿적용_개선.md) §1.47  
정책: persist / pad / continue / head-banner **불변**. 0918-N05 · 0921-N03 healer/fill · 0921-N04 Teamver-scope · 0921-N05 salt 5경로 **삭제·되돌리지 않음**.

> Staging N05 는 salt suffix 5경로만 닫고 leftover wipe / `${noun} 다음` fallback 은 별도 슬라이스로 미뤘다. 본 슬라이스는 그 이관분 + Coral cross-kit chrome 오염을 구현한다.

## 사용자 리포트 (2026-09-21, 루프571)

브리프: `www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘.`  
템플릿: Zhangzara Block Frame · 10장 · 19초 · 2206 출력 토큰 (AI 는 실행됨).

증상:

1. **레이아웃 붕괴.** slide-2 (`왜 Teamver인가`) 에 Coral 전용 `section-label` / `big-statement` / `body-text` 가 `col-left`+`col-right` row flex 형제로 붙는다. 킷 CSS 가 없어 미리보기가 기본 박스·잘린 텍스트로 보인다.
2. **문장 중간 leftover strip 잔재.** ` 방식을 한 문장으로 이해`, `로 연결되는 명확한 행동 경로`, `빠르게을 시작`, 커버 `Teamver가 `.
3. **leftover 제목 + 접미 조합.** `대상 고객별 메시지 다음`, `측정해야 할 지표 쓰는 길`, `: 을 시작 판단`.

N04 kit-scope guard 는 Teamver 브리프에서 no-op 가 맞다. N05 는 `${cover} · N` salt 만 제거했다. 이번 회귀는 **다른 킷 filler 가 Block Frame 을 오염**하고, **서버 leftover wipe/title fallback 이 MiniMax 문장을 자른 뒤 접미를 붙이는** 문제다.

## 근본 원인

| 지점 | 문제 |
|---|---|
| `coralSlideHasKitChrome` | `slide-(?:[1-9]\|10)` 만으로 Coral 로 판정. Block Frame 도 `slide-1`…`slide-10` 이라 `fillCoralKitSlide` 가 BF 에서 돈다. |
| `fillCoralKitSlide` 말미 | `slide-2` 에 `big-statement` 없으면 Coral chrome 3개를 **append**. BF two-column 이 5열로 깨진다. |
| `wipeEightBitCapsuleLeftoverPhrases` / `wipeGroveStudioLeftoverPhrases` | `SERVICE_INTRO_LEFTOVER_BODY_RE` 를 문장 중간 substring 으로 `.replace`. `다루는 문제와 제공 가치` 가 커버 lead 에서 빠지면 `Teamver가 ` 만 남고, `첫 방문에서 문제와 해결` 이 빠지면 ` 방식을 한 문장으로 이해` 가 남는다. `/파일럿/g` 는 `빠르게 파일럿을 시작` → `빠르게을 시작`. |
| `fillSlideShell` + `serviceIntroSynthTitleFallback` | leftover 제목(`대상 고객별 메시지`)을 topic noun 으로 잡고 `${noun} 다음` / `${noun} 쓰는 길` 을 만든다. |
| `dedupeIdenticalOutlineTitles` / pad | `${cover} · N` salt. 0921-N05 가 5경로를 이미 닫음. 본 슬라이스는 leftover heading fallback 과 중복 원제 유지를 맞춘다. |

## 개선

1. **Coral filler 는 Coral chrome 에서만.** Block Frame / Capsule / EightBit / Daisy 고유 토큰이 있으면 `coralSlideHasKitChrome` false. 빈 `class="slide slide-2"` Coral pad 재구성은 유지 (loop561).
2. **Substring leftover wipe 금지.** 요소 전체 텍스트가 leftover 문장(또는 leftover + 조사 잔재)일 때만 leaf 를 비운다. 원문 중간 삭제는 하지 않는다. `/파일럿/g` 전역 삭제를 제거한다.
3. **제목 접미 조합 금지.** `serviceIntroSynthTitleFallback` 은 `${noun} 범위/판단/쓰는 길/다음` 을 만들지 않는다. leftover heading 은 topic noun 이 될 수 없다.
4. **pad/dedupe salt 금지.** `${cover} · N` 대신 role heading 을 쓰고, 그래도 겹치면 원제를 유지한다. N05 salt 5경로와 충돌하지 않는다.

## 하지 말 것

- persist / pad / continue / head-banner 정책 변경.
- `TEMPLATE_CLONE_FILL_DEFAULT_MODE` / AI JSON fill 파이프라인 변경.
- kit copy pack 삭제. Teamver 브리프에서 pack 은 유지 (0921-N04 no-op).
- 킷 healer 대량 revert. 0921-N05 salt 5경로 되돌림 금지.
- Coral 빈 slide-2 pad 재구성 제거.
