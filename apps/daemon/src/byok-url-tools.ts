// Backwards-compatible shim for the pre-adapter `web_fetch` entry
// point. The real implementation lives under ./web-fetch/. See
// docs-teamver/48-1-구현설계-webfetch-adapter.md §3.1.
//
// Keeping this file (and its exports) unchanged shields both callers —
// POST /api/tools/web-fetch and BYOK tool-loop `executeWebFetch` — from
// the internal restructure, so the Phase C diff is a pure refactor.

export { fetchUrlContent } from './web-fetch/core.js';
export type { WebFetchToolResult } from './web-fetch/backend.js';
