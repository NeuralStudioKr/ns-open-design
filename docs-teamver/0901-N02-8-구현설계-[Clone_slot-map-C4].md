# 0901-N02-8 구현설계 — prefixed `*-card` peer heuristic (C4)

상위: [0901-N02-7](./0901-N02-7-구현설계-[Clone_slot-map-C3].md) · 현황: [0901-N02-3](./0901-N02-3-구현현황-[Clone_slot-fill].md)

## 목표

템플릿 id 맵이 없어도 **접두 카드 class**(`xp-card` · `hc-card` · `column-card` · `kb-card`…)에서  
**카드 수 = 내용 수**가 성립하게 한다. 맵 폭발 없이 공통 heuristic로 커버.

## 범위

1. **Peer suffix:** class 토큰이 allowlist에 있거나 `/^[a-z0-9][\w-]*-card$/` (반드시 `-card`로 끝남)
2. **Host suffix:** allowlist 또는 `/^[a-z0-9][\w-]*-grid(-\d+)?$/` · `/^grid-\d+$/`
3. **공통 peer 추가:** `team-member`
4. **fill 슬롯:** `.card-title`(+`.card-text` 비움) · `.member-name`(+`.member-role` 비움)
5. 오탐 금지: `card-icon` / `card-title` / `card-text` / `kb-grid-bg`는 peer/host 아님

## 비범위

- leftover `기둥 Z` 토큰 확장
- MiniMax 실키 live E2E (키 없으면 ☐ 유지)
- 모든 `*-step` / bare `stat` / bare `kpi` (과한 삭제 위험)
- 신규 템플릿 id별 맵 파일 (heuristic로 충분하면 생략)

## 테스트

| 케이스 | 기대 |
|--------|------|
| `xp-grid-2` + `xp-card` ×3 · 2줄 | xp-card 2 |
| `hc-grid-3` + `hc-card` ×3 · 2줄 | hc-card 2 |
| `columns-grid` + `column-card` · card-title | 2장 · demo title/text 소거 · card-icon 유지 |
| `team-grid` + `team-member` | 2장 · member-name 채움 |

## 완료 기준

- N02-3 **C4** ☑ · MiniMax E2E는 키 유무에 따라 ☑/☐
