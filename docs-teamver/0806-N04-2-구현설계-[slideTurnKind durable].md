# 0806-N04-2 구현설계 — slideTurnKind durable

## contracts

```ts
export type ChatSlideTurnKind = 'create' | 'edit';
// ChatMessage.slideTurnKind?: ChatSlideTurnKind
```

## 송신 (`ProjectView`)

```ts
slideTurnKind = resolveSlideTurnKindForSend({
  slideOnlyMvp,
  preTurnFileNames,
  existingDeckAttached: autoAttachedDeckPath != null,
})
```

## 판정 (`chat-message-render`)

1. `slideTurnKind === 'edit'` → edit  
2. `slideTurnKind === 'create'` → edit only if body has patch artifact  
3. else legacy heuristic  

## persist

- SQLite: `slide_turn_kind TEXT` + ALTER  
- PG: migration V10 `ADD COLUMN IF NOT EXISTS`  
- merge: `incoming ?? existing` (keepalive가 지울 수 없음)
