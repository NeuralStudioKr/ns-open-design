# 0918-N02-1 상위설계 · Cobalt Grid leftover·cover/table 힐러

## 사용자 리포트

Cobalt Grid(`s-cover`, `s-manifesto`, `s-index`, `s-data`, `s-chapter`, `s-quote`, `s-table`, `s-colophon`)로 생성한 8장은 저장됐지만 **공통 service-intro synth leftover + 레이아웃 붕괴**가 남는다. Product Launch(루프551/554) · Block Frame(루프555/556)과 같은 **kit-specific healer**가 Cobalt에는 없다.

기존 `healCobaltLeftoverCatalogCopy`는 영문 Field Office 카탈로그(`The index, in six entries` 등)만 본다. 한국어 generic leftover와 cover/table DOM 붕괴는 통과한다.

## 카피 leftover (generic service-intro)

| 증상 | 처리 |
|---|---|
| `개요` / `핵심 포인트` / `근거와 사례` / `실행 방안` / `고객 경험` / `운영과 보안` | h / `.h` / `.ttl` / `.title` leftover 제목 → topic 역할 제목 또는 비움 |
| `핵심 가치` / `사용 장면` / `탐색` / `실행` / `확장` | 짧은 leftover 카드 라벨 → topic 역할 또는 비움 |
| `사용자가 즉시 얻는 시간 절감…` / `첫 방문에서 문제와 해결 방식을…` | catalog leftover 문장 strip |
| `전환` / `활성` / `품질` + 전환율 문장 | 짧은 leftover 라벨 + catalog 전환율 문장 strip |
| `Teamver 소개 2` | 숫자 접미 금지. `소개 N` 제거 |
| `대상 고객별 메시지`가 chapter `nm-tag`와 `lede`에 중복 | leftover면 한쪽만 유지하거나 topic 역할로 |
| quote `qbody`에 제품/사례/운영 세 문장이 한 덩어리 | 첫 문장만 인용. 나머지는 버리지 말고 길면 한 문장으로 |
| table 영문 `No.` `Trend` `Reading` `Mood` `YoY` | 한국어 역할(번호/항목/설명/상태) 또는 leftover wipe |
| `파일럿`이 headrow 앞 텍스트 누수 | raw text 제거 |
| delta `02 / 2` | pagenum 형태 leftover wipe (가짜 KPI 금지) |

## 레이아웃

| 증상 | 처리 |
|---|---|
| cover `cfooter` 붕괴: `colf`가 footer 밖, 고아 ` · `, 빈 `<div></div>` | 2–3 `colf`로 재조립. 고아 텍스트를 colf 안으로 |
| `.v-row` 세 칸 비어 있음 | 짧은 topic caption으로 채움 (catalog `issue.04` 금지) |
| `.s-data .vbig` 비어 있음, chart 없음 | vbig에 가짜 KPI 금지. ordinal(`01`) 또는 빈 유지. 킷 pixel-stack chart 셸만 복구 |
| `.qr-block` 비어 있음 | 장식 `px` 패턴 유지. 빈 그리드가 레이아웃을 깨지 않게 |
| table headrow에 caption 셀이 본문과 섞임 | head는 역할 셀만. 본문 클래스 셀은 분리/제거 |

## 내용 구성 (후속)

leftover strip만 하면 빈 슬롯이 다시 `개요`/`핵심 포인트`/`탐색·실행·확장` 공통 아웃라인으로 채워져 미리보기(LOOK seed 매거진 구성)가 붕괴한다.

| 슬라이드 | 채움 (brief `Teamver 소개` → topic Teamver) |
|---|---|
| cover | 제품명 + 한 줄 가치. kicker ≠ footer. `문제와 제공 가치` 반복 금지 |
| manifesto | 한 문장 선언. `소개 2` 금지 |
| index | 킷 list 슬롯 수만큼. 워크스페이스/권한/협업/산출물/감사/온보딩. 탐색·실행·확장 루프 금지 |
| data | 빈 vbig에 가짜 % 금지. lab2/desc는 Teamver 운영 문장 (전환/활성/품질 금지) |
| chapter / quote | 서로 다른 문장. qbody는 한 인용 |
| table | 한국어 헤더. 도입 단계 행은 서로 다른 문장. `파일럿` leftover 금지 |
| colophon | 닫는 메시지 + 다음 행동. 전환/활성/품질 금지 |

빈 제목/본문을 **같은 service-intro 아웃라인으로 다시 채우지 말 것.**  
`synthesizeTemplateCloneSlideBody` / biennale service-intro 라인이 Cobalt에 주입되면 가드로 차단.

## 정책 (루프554)

- catalog leftover만 strip. 한국어 ≥20자 **구체** 문장은 유지.
- leftover를 지운 뒤 빈 칸은 **역할별 Teamver 문장**으로만 채움. 공통 아웃라인 재주입 금지.
- topic fallback을 `주제` / `핵심 주제`로 쓰지 말 것. brief `Teamver 소개` → **Teamver**.
- `소개 N` 숫자 접미 금지.
- persist / pad / continue 손대지 말 것.

## 감지 · 키

- kit 감지: `.s-cover` + `.s-colophon` **또는** `pixel-glitch` + `.pagenum`.
- Sakura / Long Table / Biennale / Product Launch / Block Frame 거부.
- key: `cobalt-grid` (`COBALT_GRID_KIT_KEY`).
- `resolveTemplateCloneKitKey`가 이 키를 반환.

## 구현

위치: `packages/contracts/src/template-clone-fill.ts`

- `healCobaltGridLeftoverCatalogCopy(html, brief)`
- `fillCobaltGridKitSlide` — 슬라이드 역할별 leftover + DOM 수리
- persist heal 파이프라인(`salvageMalformedMiniMaxSlideMarkup`)과 magazine heal에서 기존 `healCobaltLeftoverCatalogCopy` **다음**에 호출
- table fill의 `delta-tag`가 `02 / 2` 같은 pagenum을 쓰지 않게 가드

fixture: `packages/contracts/tests/fixtures/loop557-cobalt-grid-teamver.html` — 사용자 body 중심, CSS 최소.

## 테스트 pin

heal 후:

- `소개 2` 없음
- `No.` / `YoY` 없음
- `파일럿` head 누수 없음
- cfooter 고아 ` · ` 없음
- `개요` / `핵심 포인트`가 h 제목으로 없음
- `탐색`+`실행`+`확장` 트리오가 제목으로 없음
- cover kicker ≠ footer
- manifesto ≠ `소개 2`
- 서로 다른 index h3 3개 이상
- 기존 Halo / Block Frame 테스트 green
- 공식 English `example.html` no-op (한글 leftover 없음)
- Product Launch / Block Frame fixture에 발동하지 않음

## 범위 외

- persist / pad / continue / 32자 retry
- Broadside / EightBit / Raw-Grid / Halo / Block Frame healer 본문
- secrets. ns-open-design 은 ns_cicd 미등록 — CICD 금지

## 변경 이력

| 2026-09-18 11:45 | leftover strip 후 역할별 Teamver 문장으로 내용 구성을 올리는 후속. |
| 2026-09-18 11:40 | Cobalt Grid leftover·cover/table kit healer 상위설계 (루프557). |
