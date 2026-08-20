# 0806-N04-1 상위설계 — slideTurnKind durable

**선행:** [0805-N05](./0805-N05-1-상위설계-[수정·생성%20완료%20문구%20판정%20하드닝].md)

## 문제

수정/생성 완료 문구가 reload·empty-shell에서 `preTurnFileNames` / artifact 휴리스틱에만 의존.  
필드 누락·스트립 시 오판 여지.

## 목표

- `ChatMessage.slideTurnKind?: 'create' | 'edit'`
- 송신 시 slide-only에서 확정·persist (SQLite/PG)
- 판정: durable 필드 우선, 없으면 기존 휴리스틱
