import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 408 (env/var px fallback)", () => {
  it("binds env/var card px fallbacks and leaves thin 4px unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:var(--p, 16px);border:1px solid tomato">a</span>',
      '<p style="padding:env(safe-area-inset-top, 12px);border:1px solid navy">b</p>',
      '<span style="padding:var(--thin, 4px);border:1px solid gold">thin</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/var\(--p[^>]*\binfo-card\b|info-card[^>]*var\(--p/i);
    expect(bound).toMatch(/env\([^>]*\binfo-card\b|info-card[^>]*env\(/i);
    expect(bound).not.toMatch(/var\(--thin[^>]*\binfo-card\b|info-card[^>]*var\(--thin/i);
  });
});
