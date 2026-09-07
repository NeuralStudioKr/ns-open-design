# 0907-N06-1 상위설계 — 사이트 분석 → prompt-fill outline 주입

**날짜:** 2026-09-07 · **루프:** 469  
**관련:** [0907-N05 thin-prior](./0907-N05-1-상위설계-[thin-prior_top-up_본문_품질복구].md) · [0907-N02 LOOK+AI](./0907-N02-1-상위설계-[Clone_LOOK와_AI_본문_동시사용].md) · [54-2](./54-2-구현현황-[MiniMax_품질루프].md) · [15 web_fetch FAQ](./15_웹참조_BYOK_web_fetch_FAQ.md)

## 1. 체감

Clone Block Frame + `www.teamver.com` 사이트 분석 요청 후에도 덱이 **얕은 브랜드 소개**로 끝난다.

- 표지: `팀버 소개`
- 본문: `팀버 한눈에` / 제목만 있는 섹션
- web-fetch는 성공해도 MiniMax prompt-fill이 페이지 사실을 구조화해 쓰지 않음

루프468(P0 thin-prior)은 파이프라인 복구. **본 슬라이스는 N05에서 비범위로 남긴 P2.**

## 2. 원인

| # | 원인 | 의도? |
|---|------|------|
| A | prompt-fill seed의 “If the source is a website…”가 **일반 산문**만 요구하고, brief/fetch 사실과 **슬롯 바인딩**이 없음 | 반의도 |
| B | `compactTemplateCloneFillSourceBrief`가 URL·분석 지시문을 instruction으로 보고 **[Source brief]를 비움** | 버그성 |
| C | deterministic synth cover lead가 `{topic} 한눈에` — prompt-fill이 같은 얕은 패턴을 모방 | 구조 |
| D | `<web-fetch-context>`는 턴에 붙지만, seed가 **필수 섹션 outline**을 강제하지 않음 | 갭 |

## 3. 정책 (루프469)

1. brief/요청이 사이트·제품 URL 분석(`looksLikeTemplateCloneServiceIntroBrief` 계열)이면 prompt-fill seed에 **구조화 outline 블록**을 주입한다.
2. 필수 섹션: problem/context · product promise · core workflow · key features · user/team use cases · closing(+ 선택: integration/ops). 각 섹션 **소스에서 뽑은 구체 bullet 2–4**.
3. brief에 제목·Visible headings·Source preview·URL이 있으면 outline에 **앵커로 바인딩**. 없으면 `<web-fetch-context>` 사실을 쓰라고 명시.
4. 기존 **허위 KPI 금지** 가드는 유지.
5. JSON slot-fill seed에도 같은 outline 지시가 싸면 함께 넣는다(저비용).
6. Zhangzara quality gate 확대는 **비범위**.

## 4. 성공 기준

- `www.teamver.com 사이트 분석…` prompt-fill seed에 problem→closing outline + 소스 앵커(또는 web-fetch 바인딩 지시) 포함
- 얕은 “한눈에/소개만”만으로 끝내라는 지시가 **명시 금지**
- KPI 가드 문구 유지
- 단위 테스트: seed builder / brief structuring helper

## 변경 이력

| 2026-09-07 15:54 | 루프469 상위설계 초안 |
