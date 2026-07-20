/**
 * Single source of truth for CDN hosts used by chat prose scrub and artifact
 * preview leak detection.
 *
 * Add new hosts to `ARTIFACT_CDN_HOSTS` ONLY. Alternations / stems / heuristics
 * are derived from that array — invariant tests fail if a consumer drifts.
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

/** Covered by the `fonts.googleapis.com` special pattern — do not emit twice. */
const COVERED_BY_SPECIAL = new Set<string>(["googleapis.com"]);

/** Hosts commonly used as `<script src>` CDNs (must be ⊆ ARTIFACT_CDN_HOSTS). */
export const ARTIFACT_CDN_SCRIPT_SRC_HOSTS = [
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "esm.sh",
] as const;

export function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bareHostPattern(host: ArtifactCdnHost): string | null {
  if (COVERED_BY_SPECIAL.has(host)) return null;
  if (host === "fonts.googleapis.com") return "(?:fonts\\.)?googleapis\\.com";
  if (host === "fontawesome.com") return "(?:(?:kit|use)\\.)?fontawesome\\.com";
  return escapeRegExpLiteral(host);
}

/**
 * Short stems held while a CDN host is still being typed across stream chunks.
 * Derived from canonical hosts + a few mid-label shortcuts (jsdelivr, fonts.goo).
 */
export const ARTIFACT_CDN_HOST_STEMS: readonly string[] = (() => {
  const stems = new Set<string>();
  for (const host of ARTIFACT_CDN_HOSTS) {
    stems.add(host);
    const labels = host.split(".");
    // Progressive left prefixes for fonts.* (floor 6 to avoid holding "font").
    if (labels[0] === "fonts" && labels.length >= 2) {
      const base = `fonts.${labels[1]}`;
      stems.add(base);
      for (let n = 6; n < base.length; n += 1) stems.add(base.slice(0, n));
    }
    if (host.includes("jsdelivr")) {
      stems.add("cdn.jsdelivr");
      stems.add("jsdelivr");
    }
    if (host.includes("fontshare")) stems.add("api.fontshare");
    if (host.includes("typekit")) stems.add("use.typekit");
    if (host.includes("fontawesome")) stems.add("fontawesome");
    if (host.includes("bunny")) stems.add("fonts.bunny");
  }
  return [...stems];
})();

/** Bare host (no required path) for line detectors. */
export function artifactCdnHostAlternation(): string {
  return ARTIFACT_CDN_HOSTS.map(bareHostPattern).filter((p): p is string => p !== null).join("|");
}

/**
 * Host(+path) alternation for orphan void tails.
 * googleapis keeps optional `/css2|icon` path. Other hosts allow path-less
 * `cdn.jsdelivr.net" />` debris as well as `host/…` tails (chat/preview parity).
 */
export function artifactCdnHostWithOptionalPathAlternation(): string {
  const parts: string[] = [];
  for (const host of ARTIFACT_CDN_HOSTS) {
    if (COVERED_BY_SPECIAL.has(host)) continue;
    if (host === "fonts.googleapis.com") {
      parts.push("(?:fonts\\.)?googleapis\\.com(?:\\/(?:css2?|icon)[^<\\n]*)?");
      continue;
    }
    if (host === "fontawesome.com") {
      // kit/use hosts almost always carry a path; keep required `/…`.
      parts.push("(?:(?:kit|use)\\.)?fontawesome\\.com\\/[^<\\n]*");
      continue;
    }
    if (host === "fonts.gstatic.com") {
      // Historic: allow any trailing junk after gstatic host.
      parts.push(`${escapeRegExpLiteral(host)}[^<\\n]*`);
      continue;
    }
    parts.push(`${escapeRegExpLiteral(host)}(?:\\/[^<\\n]*)?`);
  }
  return parts.join("|");
}

/**
 * Tokens matched inside `href="https://…TOKEN…"` / `@import url(…)`.
 * Derived per host so a newly added FQDN contributes a searchable token.
 */
export function artifactCdnHrefTokenAlternation(): string {
  const tokens = new Set<string>();
  for (const host of ARTIFACT_CDN_HOSTS) {
    if (host === "googleapis.com" || host === "fonts.googleapis.com") {
      tokens.add("fonts\\.googleapis");
      continue;
    }
    if (host === "fonts.gstatic.com") {
      tokens.add("fonts\\.gstatic");
      continue;
    }
    if (host === "cdn.jsdelivr.net") {
      tokens.add("jsdelivr");
      tokens.add("cdn\\.jsdelivr");
      continue;
    }
    if (host === "cdnjs.cloudflare.com") {
      tokens.add("cdnjs");
      continue;
    }
    if (host === "fonts.bunny.net") {
      tokens.add("fonts\\.bunny");
      continue;
    }
    if (host === "api.fontshare.com") {
      tokens.add("fontshare");
      continue;
    }
    if (host === "use.typekit.net") {
      tokens.add("typekit");
      continue;
    }
    if (host === "fontawesome.com") {
      tokens.add("fontawesome");
      continue;
    }
    if (host === "unpkg.com") {
      tokens.add("unpkg");
      continue;
    }
    if (host === "esm.sh") {
      tokens.add("esm\\.sh");
      continue;
    }
    // Every current ARTIFACT_CDN_HOSTS entry is handled above, so TS narrows
    // `host` to `never` here. Keep a string fallthrough so a newly added host
    // still contributes a searchable token without an immediate special case.
    const hostName = host as string;
    const labels = hostName.split(".");
    tokens.add(
      escapeRegExpLiteral(labels.length >= 2 ? labels.slice(0, 2).join(".") : hostName),
    );
  }
  return [...tokens].join("|");
}

/** Script-src CDN hosts (external module CDNs) + Google script/font hosts. */
export function artifactCdnScriptSrcHostAlternation(): string {
  const script = ARTIFACT_CDN_SCRIPT_SRC_HOSTS.map(escapeRegExpLiteral).join("|");
  return `${script}|(?:fonts\\.)?googleapis\\.com`;
}

export function artifactHeadCdnHostSource(): string {
  return artifactCdnHostAlternation();
}

export function artifactBareCdnHostLineSource(): string {
  return `(?:https?:\\/\\/)?(?:${artifactCdnHostAlternation()})(?:\\/[^\\s<>]*)?`;
}

export const ARTIFACT_BARE_CDN_HOST_LINE_RE = new RegExp(
  `(?:^|\\n)\\s*${artifactBareCdnHostLineSource()}\\s*(?:\\n|$)`,
  "im",
);

export function artifactCdnImportUrlTokenAlternation(): string {
  return artifactCdnHrefTokenAlternation();
}

/** Informal debris-line heuristic tokens (chat hold). */
export function artifactCdnHeuristicTokenAlternation(): string {
  return artifactCdnHrefTokenAlternation();
}
