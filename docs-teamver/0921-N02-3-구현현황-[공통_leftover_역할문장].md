# 0921-N02-3 구현현황 · 킷 키 없는 공통 leftover / 역할 문장

상위: [0921-N02-1](./0921-N02-1-상위설계-[공통_leftover_역할문장].md)

## 진행

- [x] `healGenericTemplateCloneLeftover` — `.slide` 호스트면 kit key 없이 leftover 제목/잎/Halo 데모를 역할 문장으로 교체
- [x] `synthesizeTemplateCloneSlideBody` leftover 라벨 → generic role pack (킷 pack 없어도 개요 아웃라인 금지)
- [x] pad leftover/`핵심 N` 제목 → pack heading. persist/pad 장수·head-banner 불변
- [x] outline-from-brief 스캐폴드 라벨 유지 (`개요`/`도입 로드맵` pin)
- [x] salvage: 모든 기존 kit healer **뒤**에 generic heal. IB catalog phrase strip 미사용
- [x] 기본 10장 leftover fixture + unnamed salvage pin (`loop562-generic-leftover.test.ts`)

## 검증

- `tests/loop562-generic-leftover.test.ts`
- `tests/template-clone-fill.test.ts` (Cobalt / Block Frame / EightBit pin)
- `tests/template-clone-outline.test.ts`

## 남은 리스크

모델이 짧게 내면 pad는 장수를 맞추지만 밀도는 seed 한 줄 수준일 수 있다. generic pack이 문장은 바꾸나, MiniMax 단답 자체를 늘리지는 않는다.
