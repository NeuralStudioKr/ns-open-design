/**
 * Decide between two HTML preview render strategies in FileViewer:
 *
 *   - URL-load: <iframe src="/api/projects/:id/raw/:file"> — the browser
 *     fetches each <script src> / <link href> as its own request. Source
 *     maps work, DevTools shows real filenames, per-asset HTTP caching
 *     applies, and a single broken file no longer takes down the whole
 *     iframe. This is the right default for multi-file artifacts (e.g.
 *     React prototypes that ship dozens of `.jsx` files).
 *
 *   - srcDoc inline: build a self-contained document (via buildSrcdoc),
 *     optionally with relative assets concatenated in by inlineRelative-
 *     Assets, and pass it via the iframe's srcDoc attribute. Required
 *     when we need to inject host-side bridges that cannot be served from
 *     the artifact itself (deck navigation, inspect/tweak controls), and
 *     useful as an explicit opt-in for self-contained exports.
 *
 * The two helpers below isolate the decision so it's directly unit-
 * testable without dragging the whole FileViewer React tree into a
 * jsdom harness.
 */

export interface UrlLoadDecision {
  /** Whether the viewer is showing the rendered preview vs. the raw source. */
  mode: 'preview' | 'source';
  /** Treat as a slide deck — needs the deck postMessage bridge. */
  isDeck: boolean;
  /** Comment mode is active. Needs either srcDoc injection or a URL-load bridge. */
  commentMode: boolean;
  /** Inspect mode is active — needs the srcdoc selection bridge for live tuning. */
  inspectMode?: boolean;
  /** Direct text edit is active. Needs either srcDoc injection or an artifact-owned URL-load bridge. */
  editMode?: boolean;
  /** The artifact has its own script that listens for edit postMessages while URL-loaded. */
  urlModeBridge?: boolean;
  /** The URL-loaded artifact response includes the comment/selection bridge. */
  urlCommentBridge?: boolean;
  /** Tweaks palette popover open or palette committed — needs the palette bridge. */
  paletteActive?: boolean;
  /** Draw annotations need the srcDoc snapshot bridge for screenshot export. */
  drawMode?: boolean;
  /**
   * Artifact ships the class based tweaks template (`.tw-panel` / `.tw-hidden`)
   * and therefore needs the srcDoc tweaks bridge so the toolbar toggle can
   * detect availability and drive panel visibility. The bridge is injected by
   * buildSrcdoc and has no equivalent on the URL load path.
   */
  tweaksBridge?: boolean;
  /** User explicitly opted into the inline path via ?forceInline=1. */
  forceInline: boolean;
  /**
   * The HTML source contains patterns that steal focus on load (e.g.
   * `window.focus()`, `element.focus()`). When true, forces the srcDoc path
   * so `injectPreviewFocusGuard` can suppress the focus grab.
   */
  needsFocusGuard?: boolean;
  /**
   * The HTML source contains a self-redirecting directive that can loop forever
   * and freeze the preview. When true, forces the srcDoc path so
   * buildSrcdoc's redirect-loop guard is present.
   */
  needsRedirectGuard?: boolean;
}

/**
 * Detect the class based tweaks template in an artifact source string.
 * Looks for the fixed `.tw-panel` / `.tw-hidden` selectors the skill ships in
 * `design-templates/tweaks/assets/wrap.html`. Returns false for null / empty
 * input so callers can pass `source` directly without a guard.
 */
export function hasTweaksTemplate(source: string | null | undefined): boolean {
  if (!source) return false;
  return /\btw-(?:panel|hidden)\b/.test(source);
}

/**
 * Returns true when an HTML file's preview iframe should load directly
 * from its raw URL (via `<iframe src=...>`) rather than through the
 * srcDoc inline path. Pure function — caller is responsible for the
 * non-HTML / source-mode early returns.
 */
export function shouldUrlLoadHtmlPreview(d: UrlLoadDecision): boolean {
  if (d.mode !== 'preview') return false;
  if (d.isDeck) return false;
  if (d.commentMode && !(d.urlCommentBridge || d.urlModeBridge)) return false;
  // Inspect needs the selection bridge injected via buildSrcdoc; a raw
  // URL-loaded iframe has no listener to apply per-element overrides.
  if (d.inspectMode) return false;
  if (d.editMode && !d.urlModeBridge) return false;
  // Palette tweaks need the srcDoc-side bridge — `<iframe src=URL>` has
  // no parent-injected listener to recolor against.
  if (d.paletteActive) return false;
  if (d.drawMode) return false;
  // The class based tweaks template relies on the srcDoc tweaks bridge
  // emitting `od:tweaks-available` on mount; on the URL load path the bridge
  // is never injected, so the toolbar toggle would stay disabled even though
  // the artifact ships a `.tw-panel`.
  if (d.tweaksBridge) return false;
  if (d.forceInline) return false;
  if (d.needsFocusGuard) return false;
  if (d.needsRedirectGuard) return false;
  return true;
}

export function resolveHtmlPreviewAssetUrl(options: {
  teamverEmbedMode: boolean;
  embedPreviewPrefix: string | null | undefined;
  rawUrl: string;
  scopedUrl: string | null | undefined;
}): string {
  if (!options.teamverEmbedMode) return options.rawUrl;
  return options.embedPreviewPrefix ? options.scopedUrl ?? 'about:blank' : 'about:blank';
}

/**
 * `<base href>` for srcDoc deck/HTML previews.
 *
 * Teamver embed resolves a scoped preview prefix asynchronously. Until it
 * arrives, `resolveHtmlPreviewAssetUrl` returns `about:blank` (correct for
 * inactive URL-load iframes). Injecting that into srcDoc as `<base
 * href="about:blank">` breaks relative CSS/assets and can leave the first
 * paint blank until a toolbar remount. Return `undefined` so buildSrcdoc
 * skips base injection until a real prefix exists.
 */
export function resolveHtmlPreviewSrcDocBaseHref(options: {
  teamverEmbedMode: boolean;
  embedPreviewPrefix: string | null | undefined;
  rawUrl: string;
  scopedUrl: string | null | undefined;
}): string | undefined {
  const href = resolveHtmlPreviewAssetUrl(options);
  if (!href || href === 'about:blank') return undefined;
  return href;
}

/**
 * Mount key for the srcDoc preview iframe.
 *
 * Teamver embed holds `srcDoc=""` until a scoped preview prefix settles.
 * If the iframe DOM node is reused across that hold→paint transition,
 * React only updates the `srcDoc` attribute in place — compact/framework
 * decks then lose the `od:deck-host-viewport` handshake and stay blank
 * until toolbar refresh remounts the frame.
 *
 * Including the settled prefix in the key forces a fresh mount on the
 * first paintable document (same commit as non-empty srcDoc).
 */
export function resolveSrcDocPreviewMountKey(options: {
  transportResetKey: number;
  teamverEmbedMode: boolean;
  embedPreviewPrefix: string | null | undefined;
  embedPreviewPrefixSettled: boolean;
}): string {
  if (!options.teamverEmbedMode) return String(options.transportResetKey);
  const prefix = typeof options.embedPreviewPrefix === 'string'
    ? options.embedPreviewPrefix.trim()
    : '';
  const scope = options.embedPreviewPrefixSettled && prefix ? prefix : 'hold';
  return `${options.transportResetKey}:${scope}`;
}

/** True while Teamver embed has HTML source but must not paint without a scoped base. */
export function isEmbedPreviewAwaitingScopedPrefix(options: {
  teamverEmbedMode: boolean;
  hasSource: boolean;
  embedPreviewPrefix: string | null | undefined;
  embedPreviewPrefixSettled: boolean;
}): boolean {
  if (!options.teamverEmbedMode || !options.hasSource) return false;
  const prefix = typeof options.embedPreviewPrefix === 'string'
    ? options.embedPreviewPrefix.trim()
    : '';
  return !options.embedPreviewPrefixSettled || !prefix;
}

export function hasUrlModeBridge(source: string | null | undefined): boolean {
  if (!source) return false;
  return /<script\b[^>]*\bsrc\s*=\s*["'][^"']*\bod-direct-edit\.js\b[^"']*["'][^>]*>/i.test(source);
}

/**
 * Read the `forceInline` opt-out from a URL search string or an existing
 * URLSearchParams. Accepts `1`, `true`, `yes`, `on` (case-insensitive).
 * Anything else — including `0`, `false`, an unrelated value, or a
 * missing parameter — returns false.
 */
export function parseForceInline(search: string | URLSearchParams | null | undefined): boolean {
  if (!search) return false;
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const value = params.get('forceInline');
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Return true when the HTML source contains patterns that fail under the
 * URL-load iframe's bare `sandbox="allow-scripts"` (no `allow-same-origin`).
 *
 * The srcDoc path runs `injectSandboxShim` (see
 * `apps/web/src/runtime/srcdoc.ts`) before any user script, which polyfills
 * `localStorage` / `sessionStorage` so artifacts that read them at mount
 * don't throw `SecurityError` and unmount the React tree. The URL-load path
 * serves raw HTML untouched, so artifacts that touch sandbox-blocked Web
 * Storage at startup go blank.
 *
 * Scope is narrow on purpose. This helper detects three reliable signals
 * visible in the *document* source and routes those artifacts back through
 * srcDoc by toggling `forceInline`:
 *
 *   - `<script type="text/babel">` (quoted or unquoted): Babel-standalone
 *     XHR-fetches and evals sibling `.jsx`/`.tsx` files at runtime.
 *     Agent-emitted React prototypes in this style routinely read Web
 *     Storage from `useState` initializers.
 *   - Direct `localStorage` / `sessionStorage` mentions in the document
 *     source (covers inline scripts and plain HTML that calls them).
 *   - Any external `<script src="…">` (including `type="module"`): the
 *     parent string scan can't see the linked subresource's body, and
 *     agent-emitted artifacts commonly read Web Storage from an external
 *     `boot.js` / `app.js` at module eval (issue #2361). Conservatively
 *     route any external script through srcDoc so the shim is in place
 *     before that read happens. The alternative — fetching every script
 *     URL ahead of the iframe and scanning it — would duplicate work the
 *     browser is about to do and add round trips on every preview load,
 *     so the heuristic favors a few extra srcDoc-mode previews over those
 *     additional requests.
 *
 * Remaining known limitation: dynamically injected scripts
 * (`document.createElement('script'); s.src = '…'; head.appendChild(s)`)
 * are still invisible to this scan because the literal `<script src=…>`
 * tag never appears in the source. Such artifacts will still URL-load and
 * still throw on Web Storage access at startup. Workaround for now: users
 * can opt the artifact into srcDoc with `?forceInline=1` or by toggling
 * Tweaks.
 *
 * Pure string scan — caller passes the same `source` already fetched for
 * preview rendering, so this adds no extra I/O. Heuristic by design: false
 * positives just take the (slightly slower but safer) srcDoc path; false
 * negatives are the same blank-preview the user already hits.
 */
/**
 * Return true when the HTML source may call `.focus()` at load time, which
 * would steal focus from the host page in a URL-loaded iframe. The srcDoc
 * path injects `injectPreviewFocusGuard` to suppress this; URL-load has no
 * such guard, so we force the srcDoc path instead.
 *
 * Detection covers two cases:
 *
 *   1. Inline `.focus(` calls and `autofocus` attributes — directly visible
 *      in the document source.
 *   2. External `<script src=...>` references — we cannot inspect the linked
 *      file's content, so we conservatively assume it may call focus.
 *
 * False positives just route the artifact through the slightly slower srcDoc
 * path, which is the safe direction.
 */
export function htmlNeedsFocusGuard(source: string): boolean {
  if (/\.\s*focus\s*\(/i.test(source)) return true;
  if (/\bautofocus\b/i.test(source)) return true;
  if (/<script\b[^>]*\bsrc\s*=/i.test(source)) return true;
  return false;
}

export function htmlNeedsRedirectGuard(source: string | null | undefined): boolean {
  if (!source) return false;
  if (/<meta\b[^>]*\bhttp-equiv\s*=\s*["']?\s*refresh\b/i.test(source)) return true;
  if (/\blocation\s*\.\s*(?:reload|replace|assign)\s*\(/i.test(source)) return true;
  if (/\blocation\s*\.\s*href\s*=[^=]/i.test(source)) return true;
  if (/\b(?:window|document|self|top|parent)\s*\.\s*location\s*=[^=]/i.test(source)) return true;
  return false;
}

export function htmlNeedsSandboxShim(source: string): boolean {
  // Quote-optional: HTML5 permits unquoted attribute values
  // (`<script type=text/babel src=app.jsx>`). The trailing `\b` rejects
  // same-prefix word continuations like `text/babelish`. Hyphenated variants
  // (`text/babel-other`) still match because `\b` treats `-` as a non-word
  // boundary, but that's a harmless false positive — srcDoc fallback is
  // the safe direction. Tightening to a `(?=[\s>"'])` lookahead would also
  // reject hyphenated variants if a real case ever surfaces.
  if (/<script\s[^>]*\btype\s*=\s*["']?text\/babel\b/i.test(source)) return true;
  if (/\b(?:local|session)Storage\b/.test(source)) return true;
  // External `<script ... src=...>` — see issue #2361. `\s[^>]*?` requires at
  // least one whitespace after `<script` (so we don't match `<scripts>`-like
  // text or self-closing-ish edge cases) and stays non-greedy to keep the
  // search bounded to the tag itself. Lazy match avoids spilling into
  // unrelated `src=` attributes on later tags in the same document.
  if (/<script\s[^>]*?\bsrc\s*=/i.test(source)) return true;
  return false;
}
