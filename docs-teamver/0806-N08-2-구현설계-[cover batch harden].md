# 0806-N08-2 구현설계 — cover batch harden

1. **RecentProjectsStrip:** embed에서 `homeCoversReady` 전 HTML thumb는 loading placeholder (ProjectCardHtmlCover 미마운트)
2. **batch ACL:** teamver managed면 item마다 `verifyTeamverProjectAccess`; deny → `ok: false` (preview-url-batch + cover-html-batch)
3. **cover-html-batch:** `resolveProjectFilePath`로 size/mime 선검사 후 `readProjectFile`
4. **warm:** batch 시드 시 `preferDeck: true` 고정 (선-isolate와 CSS 정합)
