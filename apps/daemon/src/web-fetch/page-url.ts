const FONT_STYLE_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'fonts.bunny.net',
  'api.fontshare.com',
  'use.typekit.net',
  'p.typekit.net',
  'kit.fontawesome.com',
  'use.fontawesome.com',
]);

const STATIC_ASSET_PATH_RE =
  /\.(?:css|woff2?|ttf|otf|eot|map|png|jpe?g|gif|webp|svg|ico|avif|mp4|webm|mp3|wav)(?:$|[?#])/i;

/** Page URLs only — kit `@import` / Google Fonts css2 is not a web-fetch target. */
export function isWebFetchPageUrl(href: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (FONT_STYLE_HOSTS.has(host)) return false;
  if (host.endsWith('.gstatic.com')) return false;
  if (STATIC_ASSET_PATH_RE.test(parsed.pathname)) return false;
  if (/googleapis\.com$/i.test(host) && /^\/css2?$/i.test(parsed.pathname)) return false;
  return true;
}
