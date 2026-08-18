/**
 * Quote-aware CSS `@import` handling.
 *
 * Google Fonts css2 URLs embed `;` between axes (`wght@400;700`,
 * `opsz,wght@0,6..96,400..900;1,6..96…`). A `[^;]+` strip cuts mid-URL and
 * leaves `1,6..96…swap');` debris that merges into the next selector.
 */

import { ARTIFACT_FONT_STYLESHEET_HOSTS } from "./artifactCdnHosts.js";

const FONT_HOSTS = new Set<string>(ARTIFACT_FONT_STYLESHEET_HOSTS);

/** Snapshot-clone JS: quote-aware `@import` strip (URLs may contain `;`). */
export const SNAPSHOT_QUOTE_AWARE_IMPORT_STRIP_SNIPPET =
  '.replace(/@import\\s+(?:url\\(\\s*)?(["\']).*?\\1(?:\\s*\\))?[^;]*;/gi, \'\')';

export function stripOrphanGoogleFontImportDebris(css: string): string {
  return String(css || "")
    .replace(
      /^\s*(?:[\d,.]+(?:\.\.[\d,.]+)?,)*[\d,.]+(?:\.\.[\d,.]+)?&family=[\s\S]*?display=swap['"]\s*\)\s*;?/i,
      "",
    )
    .replace(
      /^\s*family=[A-Za-z0-9_+:;,.%&=@\- ]*?display=swap['"]\s*\)\s*;?/i,
      "",
    );
}

function cssAtRuleStatements(css: string, ruleName: string): string[] {
  const lower = css.toLowerCase();
  const needle = `@${ruleName.toLowerCase()}`;
  const out: string[] = [];
  let cursor = 0;
  while (cursor < css.length) {
    const idx = lower.indexOf(needle, cursor);
    if (idx < 0) break;
    const afterName = idx + needle.length;
    if (afterName < css.length && /[\w-]/.test(css[afterName]!)) {
      cursor = afterName;
      continue;
    }
    let i = afterName;
    while (i < css.length && /[\s\r\n\f]/.test(css[i]!)) i += 1;
    let quote: '"' | "'" | null = null;
    while (i < css.length) {
      const ch = css[i]!;
      if (quote) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        i += 1;
        continue;
      }
      if (ch === ";") {
        i += 1;
        break;
      }
      if (ch === "{") {
        let depth = 1;
        i += 1;
        while (i < css.length && depth > 0) {
          const inner = css[i]!;
          if (quote) {
            if (inner === "\\") {
              i += 2;
              continue;
            }
            if (inner === quote) quote = null;
            i += 1;
            continue;
          }
          if (inner === '"' || inner === "'") {
            quote = inner;
            i += 1;
            continue;
          }
          if (inner === "{") depth += 1;
          else if (inner === "}") depth -= 1;
          i += 1;
        }
        break;
      }
      i += 1;
    }
    out.push(css.slice(idx, i).trim());
    cursor = i;
  }
  return out;
}

function stripCssAtRuleQuoteAware(css: string, ruleName: string): string {
  const statements = cssAtRuleStatements(css, ruleName);
  if (statements.length === 0) return css;
  let out = css;
  for (const statement of statements) {
    out = out.replace(statement, "");
  }
  return out;
}

function importStatementUrl(statement: string): string | null {
  const urlFn = /url\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(statement);
  const quoted = /@import\s+(['"])([^'"]+)\1/i.exec(statement);
  const raw = (urlFn?.[2] ?? quoted?.[2] ?? "").trim();
  return raw || null;
}

function importStatementHost(statement: string): string | null {
  const raw = importStatementUrl(statement);
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isAllowlistedFontStylesheetHref(href: string): boolean {
  const raw = String(href ?? "").trim();
  if (!raw) return false;
  try {
    return FONT_HOSTS.has(new URL(raw).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function extractAllowlistedFontImportRules(css: string): string[] {
  return cssAtRuleStatements(css, "import").filter((statement) => {
    const host = importStatementHost(statement);
    return host != null && FONT_HOSTS.has(host);
  });
}

/** Persist path: keep allowlisted font `@import`, drop the rest quote-aware. */
export function rewriteCssImportsForPersist(css: string): string {
  const source = String(css ?? "");
  const kept = extractAllowlistedFontImportRules(source);
  const stripped = stripOrphanGoogleFontImportDebris(
    stripCssAtRuleQuoteAware(source, "import"),
  ).trim();
  return [...kept, stripped].filter(Boolean).join("\n");
}

/**
 * Plugin / untrusted preview: drop every remote `@import` quote-aware so
 * css2 `;` axes cannot leave selector debris. Local `@import "./x.css"` stays.
 */
export function stripRemoteCssImportsQuoteAware(css: string): {
  css: string;
  stripped: boolean;
} {
  const source = String(css ?? "");
  const remotes = cssAtRuleStatements(source, "import").filter((statement) => {
    const url = importStatementUrl(statement);
    return Boolean(url && /^https?:\/\//i.test(url));
  });
  if (remotes.length === 0) {
    const cleaned = stripOrphanGoogleFontImportDebris(source);
    return { css: cleaned, stripped: cleaned !== source };
  }
  let next = source;
  for (const statement of remotes) {
    next = next.replace(statement, "/* od stripped external css import */");
  }
  next = stripOrphanGoogleFontImportDebris(next);
  return { css: next, stripped: true };
}
