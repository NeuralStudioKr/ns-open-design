# 0806-N04-3 구현현황 — slideTurnKind durable

**상태:** 구현·단위검증 완료

## 완료

- [x] contracts `ChatSlideTurnKind` / `ChatMessage.slideTurnKind`
- [x] SQLite `slide_turn_kind` + ALTER · PG migration V10
- [x] `mergeMessageUpsertPayload` keepalive 보존
- [x] `resolveSlideTurnKindForSend` + `messageLooksLikeSlideEditTurn` durable 우선
- [x] ProjectView 송신·client merge·visual-mark fast path
- [x] 단위 테스트 (slide-edit · merge · db round-trip)

## 검증

- [x] `apps/web` slide-edit test (6)
- [x] `apps/daemon` message-upsert-merge · db-pre-turn (11)
- [ ] staging: create/edit 완료 문구 reload 후에도 유지
