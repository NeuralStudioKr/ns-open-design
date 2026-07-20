/**
 * Single source of truth for CDN hosts used by chat prose scrub and artifact
 * preview leak detection.
 *
 * Add new hosts HERE ONLY. Invariant tests assert chat scrub, preview gate,
 * DOM detectors, and head repair all consume this module — do not re-list
 * FQDNs in call sites.
 */

/** Longer hosts first so `includes` / reverse-prefix matching prefer them. */
export const ARTIFACT_CDN_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "fonts.bunny.net",
  "api.fontshare.com",
  "use.typekit.net",
  "googleapis.com",
  "fontawesome.com",
  "unpkg.com",
  "esm.sh",
] as const;

export type ArtifactCdnHost = (typeof ARTIFACT_CDN_HOSTS)[number];

/**
 * Short stems held while a CDN host is still being typed across stream chunks.
 * Every stem must be a prefix of (or equal to) an entry in ARTIFACT_CDN_HOSTS
 * — enforced by invariant tests.
 */
export const ARTIFACT_CDN_HOST_STEMS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "googleapis.com",
  "fonts.google",
  "fonts.goo",
  "cdn.jsdelivr.net",
  "cdn.jsdelivr",
  "jsdelivr",
  "unpkg.com",
  "esm.sh",
  "fonts.bunny",
  "fonts.bunny.net",
  "api.fontshare",
  "api.fontshare.com",
  "use.typekit",
  "use.typekit.net",
  "fontawesome",
  "fontawesome.com",
] as const;

export function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Host(+path) alternation for orphan void tails:
 * `(?:fonts\.)?googleapis\.com(?:/(?:css2?|icon)…)?|fonts\.gstatic\.com…|…`
 */
export function artifactCdnHostWithOptionalPathAlternation(): string {
  return [
    "(?:fonts\\.)?googleapis\\.com(?:\\/(?:css2?|icon)[^<\\n]*)?",
    "fonts\\.gstatic\\.com[^<\\n]*",
    "cdn\\.jsdelivr\\.net\\/[^<\\n]*",
    "unpkg\\.com\\/[^<\\n]*",
    "cdnjs\\.cloudflare\\.com\\/[^<\\n]*",
    "fonts\\.bunny\\.net\\/[^<\\n]*",
    "api\\.fontshare\\.com\\/[^<\\n]*",
    "use\\.typekit\\.net\\/[^<\\n]*",
    "(?:(?:kit|use)\\.)?fontawesome\\.com\\/[^<\\n]*",
    "esm\\.sh\\/[^<\\n]*",
  ].join("|");
}

/** Bare host (no required path) for line detectors / script src tails. */
export function artifactCdnHostAlternation(): string {
  return [
    "(?:fonts\\.)?googleapis\\.com",
    "fonts\\.gstatic\\.com",
    "cdn\\.jsdelivr\\.net",
    "unpkg\\.com",
    "cdnjs\\.cloudflare\\.com",
    "fonts\\.bunny\\.net",
    "api\\.fontshare\\.com",
    "use\\.typekit\\.net",
    "(?:(?:kit|use)\\.)?fontawesome\\.com",
    "esm\\.sh",
  ].join("|");
}

/**
 * Tokens matched inside `href="https://…TOKEN…"`.
 * Shorter than FQDNs so `fonts.googleapis` catches the common truncate point.
 */
export function artifactCdnHrefTokenAlternation(): string {
  return [
    "fonts\\.googleapis",
    "fonts\\.gstatic",
    "jsdelivr",
    "unpkg",
    "cdnjs",
    "fonts\\.bunny",
    "fontshare",
    "typekit",
    "fontawesome",
    "esm\\.sh",
  ].join("|");
}

/** Script-src CDN hosts (external module CDNs). */
export function artifactCdnScriptSrcHostAlternation(): string {
  return [
    "cdn\\.jsdelivr\\.net",
    "unpkg\\.com",
    "cdnjs\\.cloudflare\\.com",
    "esm\\.sh",
  ].join("|");
}

/**
 * Source for DOM `fontCdnLeak` / head CDN detectors.
 * Derived from the same host set as void tails (no path suffixes).
 */
export function artifactHeadCdnHostSource(): string {
  return artifactCdnHostAlternation();
}

/** Bare host or host+path on its own line (optional scheme). */
export function artifactBareCdnHostLineSource(): string {
  return `(?:https?:\\/\\/)?(?:${artifactCdnHostAlternation()})(?:\\/[^\\s<>]*)?`;
}

export const ARTIFACT_BARE_CDN_HOST_LINE_RE = new RegExp(
  `(?:^|\\n)\\s*${artifactBareCdnHostLineSource()}\\s*(?:\\n|$)`,
  "im",
);

/** Chat `@import url(CDN)` / bare `url(CDN)` token alternation. */
export function artifactCdnImportUrlTokenAlternation(): string {
  return [
    "fonts\\.googleapis",
    "fonts\\.gstatic",
    "cdn\\.jsdelivr",
    "unpkg",
    "cdnjs",
    "fonts\\.bunny",
    "fontshare",
    "typekit",
    "fontawesome",
    "esm\\.sh",
  ].join("|");
}
