import { describe, expect, it } from "vitest";

import {
  extractAllowlistedFontImportRules,
  rewriteCssImportsForPersist,
  stripOrphanGoogleFontImportDebris,
  stripRemoteCssImportsQuoteAware,
} from "../src/html/cssImportSanitize.js";

const CAPSULE_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');";

describe("cssImportSanitize", () => {
  it("keeps Capsule Google Fonts @import whose css2 URL contains semicolons", () => {
    const css = `${CAPSULE_IMPORT}\n:root{--coral:#E85D4E}\n.pill{border-radius:9999px}`;
    const out = rewriteCssImportsForPersist(css);
    expect(out).toContain("fonts.googleapis.com/css2?family=Bodoni+Moda");
    expect(out).toContain("1,6..96,400..900");
    expect(out).toContain(":root{--coral:#E85D4E}");
    expect(extractAllowlistedFontImportRules(css)).toHaveLength(1);
  });

  it("does not leave css2 axis debris after a naive semicolon cut", () => {
    const debris =
      "1,6..96,400..900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');\n:root{--coral:#E85D4E}";
    const out = stripOrphanGoogleFontImportDebris(debris);
    expect(out).not.toMatch(/1,6\.\.96/);
    expect(out).toContain(":root{--coral:#E85D4E}");
  });

  it("strips remote non-font @import quote-aware without eating later rules", () => {
    const css = `${CAPSULE_IMPORT} @import url("https://evil.example/x.css"); .pill{color:red}`;
    const persist = rewriteCssImportsForPersist(css);
    expect(persist).toContain("fonts.googleapis.com");
    expect(persist).not.toContain("evil.example");
    expect(persist).toContain(".pill{color:red}");

    const preview = stripRemoteCssImportsQuoteAware(css);
    expect(preview.stripped).toBe(true);
    expect(preview.css).toContain("od stripped external css import");
    expect(preview.css).not.toContain("evil.example");
    expect(preview.css).not.toMatch(/1,6\.\.96[^']*swap/);
    expect(preview.css).toContain(".pill{color:red}");
  });
});
