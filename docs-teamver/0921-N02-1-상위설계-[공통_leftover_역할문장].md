# 0921-N02-1 상위설계 · 킷 키 없는 기본·임의 템플릿 leftover / 역할 문장

상위: [0921-N01 Coral/Mat/Biennale](./0921-N01-1-상위설계-[coral_mat_biennale_역할pack].md)  
정책: persist / pad / continue / head-banner **불변**. healer/fill만.  
기존 kit healer는 삭제·되돌리지 않는다.

## 왜 킷별 pack만으로는 안 되나

official LOOK resolver가 빗나가거나, 기본 템플릿·이름 없는 `.slide` 덱이면 kit key가 없다.  
그때마다 Coral/Mat/… healer를 늘리면 다음 킷에서 같은 leftover(`개요` / 탐색·실행·확장)가 다시 남는다.

## 목적

`section.slide` / `.slide` 덱이면 kit key 없이도 같은 leftover strip + 역할별 문장을 탄다.

| 경로 | 동작 |
|---|---|
| `synthesizeTemplateCloneSlideBody` | 라벨이 leftover(`개요` 등)면 generic role pack. index마다 다른 topic/brief 문장 |
| `synthesizeTemplateCloneOutlineFromBrief` | 스캐폴드 라벨(`개요`/`도입 로드맵`)은 유지. 본문만 leftover 없이 채움 |
| pad 제목 | leftover/`핵심 N`이면 pack heading으로 교체. 장수·head-banner 정책은 불변 |
| persist salvage | 모든 kit healer **뒤**에 `healGenericTemplateCloneLeftover`. catalog demo strip은 IB chrome을 지우므로 쓰지 않음 |

## leftover (클래스명 아님)

`개요` · `핵심 포인트` · `탐색/실행/확장` · `실무자/리더/운영자` · `Overview` · `Pricing` · `YoY` · Halo/`$179` 데모.  
이미 있는 전역 RE를 **모든** template-clone salvage에 적용.  
루프554: 구체 한국어 ≥20자는 덮지 않음.

## 하지 말 것

- persist / pad / continue / head-banner 정책 변경
- 기존 kit healer 삭제
- Coral/Mat/Biennale만 완주하고 공통 경로를 건너뛰기

## 변경 이력

| 2026-09-21 14:08 | 킷별 pack 무한 확장을 접고 공통 leftover/역할 문장 경로로 전환. |
