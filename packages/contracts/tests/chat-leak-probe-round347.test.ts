import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 347 (multi-value + lvh padding)", () => {
  it("binds when any padding component is card-like including lvh", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:4px 12px;border:1px solid tomato">xy</span>',
      '<p style="padding:12px 4px;border:1px solid navy">yx</p>',
      '<span style="padding:2lvh;border:1px solid teal">lvh</span>',
      '<p style="padding:1lvh;border:1px solid olive">thin-lvh</p>',
      '<span style="padding:0.5ic;border:1px solid gold">half-ic</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<span\b[^>]*padding:4px 12px[^>]*\binfo-card\b|<span\b[^>]*\binfo-card\b[^>]*padding:4px 12px/i);
    expect(bound).toMatch(/<p\b[^>]*padding:12px 4px[^>]*\binfo-card\b|<p\b[^>]*\binfo-card\b[^>]*padding:12px 4px/i);
    expect(bound).toMatch(/<span\b[^>]*2lvh[^>]*\binfo-card\b|<span\b[^>]*\binfo-card\b[^>]*2lvh/i);
    expect(bound).not.toMatch(/thin-lvh[^>]*\binfo-card\b|info-card[^>]*thin-lvh/i);
    expect(bound).not.toMatch(/half-ic[^>]*\binfo-card\b|info-card[^>]*half-ic/i);
  });
});
