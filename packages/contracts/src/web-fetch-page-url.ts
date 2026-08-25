import { ARTIFACT_CDN_HOSTS } from './html/artifactCdnHosts.js';

const STATIC_ASSET_PATH_RE =
  /\.(?:css|less|scss|sass|styl|woff2?|ttf|otf|eot|map|png|jpe?g|gif|webp|svg|ico|avif|mp4|webm|mp3|wav|ogg|js|mjs|cjs|wasm)(?:$|[?#])/i;

const EXTRA_ASSET_HOSTS = new Set([
  'p.typekit.net',
  'fonts.adobe.com',
  'ka-f.fontawesome.com',
  'ka-p.fontawesome.com',
]);

const ASSET_CONTENT_TYPE_RE =
  /^(?:text\/css|text\/(?:less|scss|sass|javascript)|application\/(?:javascript|ecmascript|wasm|font-[\w-]+)|font\/|image\/|audio\/|video\/)/i;

function hostLooksLikeDesignAssetCdn(host: string): boolean {
  const h = host.toLowerCase();
  if (EXTRA_ASSET_HOSTS.has(h)) return true;
  if (h.endsWith('.gstatic.com') || h.endsWith('.typekit.net')) return true;
  for (const known of ARTIFACT_CDN_HOSTS) {
    if (h === known || h.endsWith(`.${known}`)) return true;
  }
  return false;
}

const PROMPT_PAGE_URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

function normalizePromptPageUrl(raw: string): string | null {
  const trimmed = String(raw || '').replace(/[.,;:!?)]+$/g, '').trim();
  if (!trimmed) return null;
  const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * True when prompt / message text names a real HTML page (not kit CSS / fonts).
 * MiniMax first-fill uses this to keep `web_fetch` off unless the user gave a page.
 */
export function textHasWebFetchPageUrl(text: string): boolean {
  const source = String(text || '');
  if (!source) return false;
  for (const match of source.matchAll(PROMPT_PAGE_URL_RE)) {
    if (isWebFetchAssetUrlContext(source, match.index ?? 0)) continue;
    const href = normalizePromptPageUrl(match[0]);
    if (href && isWebFetchPageUrl(href)) return true;
  }
  return false;
}

function collectMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .join('\n');
}

/** Scan chat messages (and optional system prompt) for a real page URL. */
export function messagesHaveWebFetchPageUrl(
  messages: ReadonlyArray<{ content?: unknown }> | null | undefined,
  systemPrompt?: string | null,
): boolean {
  if (textHasWebFetchPageUrl(String(systemPrompt ?? ''))) return true;
  for (const message of messages ?? []) {
    if (textHasWebFetchPageUrl(collectMessageText(message?.content))) return true;
  }
  return false;
}

/** Page URLs only — kit `@import` / Google Fonts css2 / CDN assets are not targets. */
export function isWebFetchPageUrl(href: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (hostLooksLikeDesignAssetCdn(host)) return false;
  if (STATIC_ASSET_PATH_RE.test(parsed.pathname)) return false;
  if (/googleapis\.com$/i.test(host) && /^\/(?:css2?|icon)(?:\/|$)/i.test(parsed.pathname)) {
    return false;
  }
  return true;
}

/**
 * URL sits in CSS/HTML asset syntax (`@import`, `url()`, `<link href>`,
 * `<script src>`, media `src`) rather than as a page the user asked to read.
 */
function schemeStartIndex(source: string, matchIndex: number): number {
  const beforeScheme = source.slice(Math.max(0, matchIndex - 8), matchIndex);
  if (/https:\/\/$/i.test(beforeScheme)) return matchIndex - 8;
  if (/http:\/\/$/i.test(beforeScheme)) return matchIndex - 7;
  return matchIndex;
}

export function isWebFetchAssetUrlContext(source: string, matchIndex: number): boolean {
  const text = String(source || '');
  const start = schemeStartIndex(text, matchIndex);
  const before = text.slice(Math.max(0, start - 200), start);
  if (/@import\s+(?:url\s*\(\s*)?['"]?$/i.test(before)) return true;
  if (/url\s*\(\s*['"]?$/i.test(before)) return true;
  if (/<link\b[^>]*\bhref\s*=\s*['"]?$/i.test(before)) return true;
  if (/<script\b[^>]*\bsrc\s*=\s*['"]?$/i.test(before)) return true;
  if (/<(?:img|source|video|audio)\b[^>]*\b(?:src|poster)\s*=\s*['"]?$/i.test(before)) return true;
  return false;
}

/** Raw CSS body when Content-Type is missing or wrong. */
export function looksLikeWebFetchStylesheetText(text: string): boolean {
  return /^(@charset\b|@import\b|@font-face\b)/i.test(String(text || '').trim());
}

/** After fetch: stylesheets / fonts / media / JS are not page text. */
export function isWebFetchPageContentType(contentType: string): boolean {
  const type = String(contentType || '').split(';')[0]?.trim() ?? '';
  if (!type) return true;
  return !ASSET_CONTENT_TYPE_RE.test(type);
}
