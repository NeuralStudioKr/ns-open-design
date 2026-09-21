# 0918-N03-3 구현현황 · 공통 개요 synth 가드 + Block Frame 역할별 구성

상위설계: `docs-teamver/0918-N03-1-상위설계-[공통synth가드_BF구성].md`

## 상태

구현 완료. staging push. ns-open-design 은 ns_cicd 미등록 — CICD 감시 없음.

## 가드 범위

| 경로 | 차단 |
|---|---|
| `synthesizeTemplateCloneSlideBody` | 어느 킷이든 item/lead 제목 `개요` / `핵심 포인트` / `탐색`+`실행`+`확장` 트리오 금지. leftover heading·card RE는 전역 상수 |
| `biennaleFillLines` | fallback·기존 라인 제목이 `개요`/`핵심 포인트`/트리오면 topic 역할 제목으로 치환 |
| service-intro process 템플릿 | itemTitles `탐색/실행/확장` → `첫 방문/쓰는 길/팀으로 넓히기` |
| Block Frame fill/heal | leftover RE로 `실무자/리더/운영자`, `전환율/활성/품질`, 손상 토큰 strip 후 pack 채움 |

persist / pad / continue / head-banner 로직은 변경하지 않음. pad 장의 카피만 kit pack(또는 seed+brief)을 쓴다.

## Block Frame 슬라이드별 구성 (brief `Teamver 소개`)

| 슬라이드 | 셸 | 채움 |
|---|---|---|
| cover | `.hero-frame` | 한 줄 가치. 제목 `개요`/`핵심 포인트` 금지. kicker는 짧은 역할 |
| intro | `.intro-card` / `.nb-card` | 같은 보드 / 권한 나누기 / 이어서 고치기. leftover 역할 유지 금지 |
| features | `.feature-card` | 초안 / 수정 / 공유 |
| chart | `.data-box` | leftover `전환율`/`활성`/`품질` → 같은 보드 / 권한 경계 / 결과 이력 |
| quote | `.quote-frame` | 한 인용. cover/intro와 다른 문장 |
| split | `.split-content` | 보드를 연다 / 권한을 나눈다 / 이력을 남긴다 |
| timeline | `.timeline-step` | 한 팀 보드 / 리뷰 습관 / 조직 기준. `파일떴`/`희대다` 없음 |
| stats / team / close | 해당 셸 | 역할별 Teamver 문장. 닫기는 다음 행동 |

한국어 ≥20 구체 문장은 유지 (554). `고객경험` → `고객 경험` (555). leftover role body는 길이만 길어도 strip (556).

## 구현

| 항목 | 상태 |
|---|---|
| 전역 leftover RE | ☑ heading / card / body. Cobalt·PL 별칭 |
| `sanitizeServiceIntroSynthTitles` | ☑ 개요·트리오만 기본 킷에서 치환. 다른 leftover 제목은 킷 fill 유지 |
| `blockFrameSlideCopyPack` | ☑ 역할별 Teamver 문장 |
| leftover heal native 보존 철회 | ☑ 역할 leftover는 `.intro-card` 안에서도 pack으로 |
| pad 카피 | ☑ kit pack. 개요 synth 재주입 없음. persist/pad 로직 불변 |
| Halo / Raw-Grid / Cobalt 힐러 | ☑ 손대지 않음. 557 pin 유지 |

## 검증

```bash
pnpm --filter @open-design/contracts exec vitest run tests/template-clone-fill.test.ts tests/template-clone-outline.test.ts
```

373 passed. synth 트리오 pin · loop555/556 leftover 없음 · Cobalt 557 유지.

## 다음 후보

Grove / Studio / EightBit 중 역할별 내용 구성 pack이 아직 없는 킷.

## 변경 이력

| 2026-09-18 14:05 | 공통 개요 synth 가드 + Block Frame 역할별 Teamver 구성 구현. |
