// Backend adapter contract for the daemon `web_fetch` pipeline. See
// docs-teamver/48-1-구현설계-webfetch-adapter.md §3.2.
//
// Contract summary:
//   - The core dispatcher (core.ts) owns input validation, SSRF against
//     the ORIGINAL url, timeout wiring, log fields, htmlToText fallback,
//     and error normalisation.
//   - A backend only ever sees an already-SSRF-cleared, http(s) URL. It
//     performs exactly one outbound request, honours the AbortSignal the
//     core hands it, and returns the raw response bytes as UTF-8 text
//     plus a minimal set of flags. It never throws — thrown errors are
//     treated as a bug and rewritten to a generic error by the core.

export interface WebFetchBackendCtx {
  /** SSRF-checked, trimmed, http(s) URL. Backends do not re-validate. */
  readonly url: string;
  /** Core-owned abort signal (fires on the 12s timeout). Backends must
   *  pipe this into their outbound fetch. */
  readonly signal: AbortSignal;
  /** BYOK tool-loop path may pass an undici dispatcher / caller signal.
   *  Backends may spread this into their fetch init, but `signal` above
   *  takes precedence. */
  readonly requestInit?: Pick<RequestInit, 'dispatcher' | 'signal'>;
}

export interface WebFetchBackendResult {
  ok: boolean;
  /** UTF-8 text of the response body. For the native backend this is
   *  the raw HTML/plain text; for a reader backend it is already
   *  stripped markdown. */
  text?: string;
  /** True when the returned `text` is HTML the core still needs to
   *  strip via htmlToText. Reader backends set this to false — their
   *  response is already presentable. */
  isHtml?: boolean;
  /** Optional title hint. Native backend leaves this undefined and lets
   *  the core extract the <title>. Reader backends may set it if the
   *  vendor API returns one. */
  title?: string;
  /** True when the backend stopped reading past MAX_TEXT_BYTES. The
   *  core preserves this flag on the public result. */
  truncated?: boolean;
  /** Short human-readable failure reason. Present iff ok === false. */
  error?: string;
}

/** Public shape returned by `fetchUrlContent`. Kept identical to the
 *  original `byok-url-tools` export to preserve the API contract at
 *  POST /api/tools/web-fetch and inside the BYOK tool loop. */
export interface WebFetchToolResult {
  ok: boolean;
  /** Plain-text content of the page (HTML stripped), capped at
   *  MAX_TEXT_BYTES. */
  text?: string;
  /** Document <title>, when present — fed to the model as a hint. */
  title?: string;
  /** True when the body hit the size cap and was cut short. */
  truncated?: boolean;
  /** Short human-readable failure reason for the model to relay. */
  error?: string;
}

export interface WebFetchBackend {
  readonly name: 'native' | 'reader';
  fetchOnce(ctx: WebFetchBackendCtx): Promise<WebFetchBackendResult>;
}
