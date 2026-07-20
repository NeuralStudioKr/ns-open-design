import { describe, expect, it } from "vitest";

import {
  ARTIFACT_CDN_HOSTS,
  ARTIFACT_CDN_HOST_STEMS,
  artifactBareCdnHostLineSource,
  artifactCdnHostAlternation,
  artifactCdnHostWithOptionalPathAlternation,
  artifactCdnHrefTokenAlternation,
  artifactCdnImportUrlTokenAlternation,
  artifactCdnScriptSrcHostAlternation,
  artifactHeadCdnHostSource,
} from "../src/html/artifactCdnHosts.js";
import {
  ARTIFACT_HEAD_CDN_HOST_SOURCE,
  ARTIFACT_ORPHAN_HEAD_VOID_DOM_TEXT_LEAK_SOURCE,
  ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE,
} from "../src/html/artifactPreviewTextLeaks.js";
import { sanitizeAssistantProseForDisplay } from "../src/agent-prose-sanitize.js";
import { isArtifactHtmlStableForPreview } from "../src/html/isArtifactHtmlStableForPreview.js";

/**
 * Structural invariants that prevent the "every review finds a new CDN hole"
 * cycle. When adding a host, update `ARTIFACT_CDN_HOSTS` only — these tests
 * fail if a consumer drifts.
 */
describe("artifact CDN host SSOT invariants", () => {
  it("every stem is a prefix of (or equal to) a canonical host", () => {
    for (const stem of ARTIFACT_CDN_HOST_STEMS) {
      const ok = ARTIFACT_CDN_HOSTS.some(
        (host) =>
          host === stem
          || host.startsWith(stem)
          || host.includes(`.${stem}`)
          || host.includes(`${stem}.`)
          || (stem.length >= 4 && host.includes(stem)),
      );
      expect(ok, `stem ${stem} is not covered by any ARTIFACT_CDN_HOSTS entry`).toBe(
        true,
      );
    }
  });

  it("derived alternations mention every canonical host key token", () => {
    const surfaces = [
      artifactCdnHostAlternation(),
      artifactCdnHostWithOptionalPathAlternation(),
      artifactHeadCdnHostSource(),
      artifactBareCdnHostLineSource(),
      ARTIFACT_HEAD_CDN_HOST_SOURCE,
      ARTIFACT_ORPHAN_HEAD_VOID_DOM_TEXT_LEAK_SOURCE,
      ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE.source,
    ];
    for (const host of ARTIFACT_CDN_HOSTS) {
      // googleapis.com is covered by `(?:fonts\.)?googleapis\.com`
      // fontawesome.com is covered by `(?:(?:kit|use)\.)?fontawesome\.com`
      const token = host.includes("googleapis")
        ? "googleapis"
        : host.includes("fontawesome")
          ? "fontawesome"
          : host.replace(/\./g, "\\.");
      for (const surface of surfaces) {
        expect(
          surface.includes(token) || surface.includes(host.replace(/\./g, "\\.")),
          `${host} (token ${token}) missing from surface`,
        ).toBe(true);
      }
    }
  });

  it("href/import/script token surfaces cover every CDN family", () => {
    const href = artifactCdnHrefTokenAlternation();
    const imp = artifactCdnImportUrlTokenAlternation();
    const script = artifactCdnScriptSrcHostAlternation();
    for (const token of [
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
    ]) {
      expect(href.includes(token), `href missing ${token}`).toBe(true);
      expect(imp.includes(token), `import missing ${token}`).toBe(true);
    }
    for (const token of ["jsdelivr", "unpkg", "cdnjs", "esm\\.sh"]) {
      expect(script.includes(token), `script missing ${token}`).toBe(true);
    }
  });

  it("chat scrub and preview gate agree on bare-host lines for every host", () => {
    for (const host of ARTIFACT_CDN_HOSTS) {
      const prose = `Done.\n${host}\nNext.`;
      const cleaned = sanitizeAssistantProseForDisplay(prose);
      expect(cleaned, `chat left bare host ${host}`).not.toContain(host);

      const html = `<!doctype html><html><head><title>T</title></head><body>
<section class="slide">A</section>
${host}
</body></html>`;
      expect(
        isArtifactHtmlStableForPreview(html),
        `preview accepted bare host ${host}`,
      ).toBe(false);
    }
  });

  it("full-tag-before-orphan: intact stylesheet link leaves no <link residue", () => {
    const input =
      'Before <link rel="stylesheet" href="https://fonts.googleapis.com/css2"> After';
    const out = sanitizeAssistantProseForDisplay(input);
    expect(out).toBe("Before  After");
    expect(out).not.toContain("<link");
  });
});
