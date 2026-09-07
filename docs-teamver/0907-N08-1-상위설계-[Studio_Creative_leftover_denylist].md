# 0907-N08-1 상위설계 — Studio / Creative Mode leftover denylist 보강

**날짜:** 2026-09-07 · **루프:** 476  
**관련:** [54-2](./54-2-구현현황-[MiniMax_품질루프].md) next #4 · [0907-N07-1](./0907-N07-1-상위설계-[서비스소개_표지_lead_한눈에_개선].md) 비범위 이관 · [0901-N02-21](./0901-N02-21-구현설계-[Clone_sakura-leftover-refill].md) · Cobalt 루프460

## 1. 체감

Hangul 주제 Clone 후에도 **Studio** (`html-ppt-zhangzara-studio`) · **Creative Mode** (`html-ppt-zhangzara-creative-mode`) 카탈로그 데모 카피가 남는다.

- Studio: `WHO WE ARE` · `Our studio pairs…` · `Years of practice` · `[Studio Name]` · compare AFTER 영문
- Creative: `Lift In Engagement` · `Throughput Multiplier` · `Layer alpha` · `VALUES ARE PLACEHOLDER` · `eight pages…`

4축 게이트는 Creative에 `FLIP THE`만, Studio `demoMustNotInclude`는 비어 있어 회귀를 못 잡는다. `looksLikeLeftoverTemplateDemoDeck` / `LEFTOVER_CATALOG_PHRASE_RE`에도 Studio·Creative 지문이 없다.

## 2. 정책

1. Hangul topical fill 후 Studio/Creative **카탈로그 데모 본문** 금지.
2. 영문 `example.html` brief 없음 → **no-op** (카탈로그 Intact).
3. Cobalt(460) / Sakura(467)와 동일: **fill-time scrub** + Hangul **persist heal**(슬롯 선채움 후 wipe).
4. KPI 숫자(`.stat-value` / `.num`)는 발명하지 않는다 — 데모 라벨·캡션만 교체·스크럽.
5. cover lead / site outline / layout smoke(N06–N07·루프472)는 **비범위**.

## 3. 성공 조건

- deterministic Clone(팀버 서비스 소개 brief)에서 Studio/Creative 데모 문구 부재.
- quality gate `demoMustNotInclude` + leftover 감지에 Studio/Creative 지문 편입.
- persist heal: Hangul+leftover → refill/scrub · 영문 example → 동일 문자열.

## 변경 이력

| 2026-09-07 18:20 | 루프476 상위설계 초안 |
