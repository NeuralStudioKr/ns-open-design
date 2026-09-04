# 0901-N02-20 구현설계 — Biennale · Cobalt Grid 품질 게이트 (루프459)

상위: [0901-N02-1](./0901-N02-1-상위설계-[Clone_slot-fill].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)  
직전: [0901-N02-19](./0901-N02-19-구현설계-[Clone_template-quality-gates].md) 루프450–458 — Capsule / Daisy / Creative / Studio / Blue-pro / Block-frame / Product / Pitch.  
원격 루프451은 Cobalt 레이아웃 heal이라 이번 게이트 확대는 459번.

## 목표

루프450과 같은 4축 fixture 게이트를, 사용자가 실제로 leftover·배치 이슈를 본 unique-role 공식 템플릿까지 확대한다.

1. **대표 motif 존재**
2. **demo leftover 없음**
3. **1920×1080 캔버스 고정**
4. **요청 장수 준수** (unique-shell cap 반영)

## 대상 · motif 핀

| 템플릿 | pluginId | 자연 셸 | motifMustInclude | expectedSlideCount |
|--------|----------|---------|------------------|--------------------|
| Biennale Yellow | `html-ppt-zhangzara-biennale-yellow` | 8 unique | `--sun`, `sunglow`, `s-programme` | 8 |
| Cobalt Grid | `html-ppt-zhangzara-cobalt-grid` | 8 unique | `--ink-soft`, `pixel-glitch`, `s-index` | 8 |

공통 brief는 루프450과 동일:

```
www.teamver.com 사이트 분석해서 서비스 소개 슬라이드 만들어줘. 8~10장
```

## Cobalt Grid 슬롯 채움 (게이트를 통과시키기 위한 최소 수정)

Field Office Quarterly 카탈로그는 Biennale와 같은 unique-role 셸(`s-cover`/`s-manifesto`/`s-index`/`s-chapter`/`s-data`/`s-quote`/`s-table`/`s-colophon`)을 쓰지만 슬롯명이 다르다.

- `.stmt` / `.meta-tag` / `.who-tag` / `.role-meta` — manifesto·quote
- `.list .row` / `.ledger .row` — index·table peers (`COBALT_GRID_SLOT_MAP`)
- `.cfooter .colf` / `.subkicker` / `.vstack` — cover chrome
- `.col-footer` — colophon
- `.vbig` / `.lab2` / `.lab-tag` — data 슬라이드

`fillAndTrimCardPeers`가 같은 카드를 여러 번 보면 title이 `입력입력입력…`으로 붙지 않도록 기존 루프430 idempotent prepend를 유지한다. 10장 요청은 unique-role cap으로 8장.

## leftover 감지

`looksLikeLeftoverTemplateDemoDeck`와 `CROSS_TEMPLATE_LEFTOVER_DENYLIST`에 Field Office / Aurora Institute 지문을 넣는다. `LEFTOVER_CATALOG_PHRASE_RE`는 cover footer·index row·data caption까지 지운다.

## 테스트

- contracts `루프450/459 Zhangzara template quality gates` — 기존 스펙 + Biennale Yellow / Cobalt Grid
- contracts `loop459 — Cobalt Grid 10-slide request fills stmt/list/table/colophon and scrubs Field Office demo`
- daemon `루프450/459 Zhangzara 서버 fill 스모크` — Biennale / Cobalt 추가

## 비범위

- 전 Zhangzara 카탈로그 일괄 게이트 (Broadside 47셸, Retro, Sakura 등은 다음)
- MiniMax live E2E · staging 재배포
- UI 변경
