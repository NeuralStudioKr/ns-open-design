import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 104 (thin logical padding unbound)", () => {
  it("keeps thin padding-block accents unbound", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding-block:0.5ic;border:1px solid tomato">x</span>',
      '<p style="padding-inline:1px;border:1px solid navy">y</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/<span\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<p\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/border:\s*1px solid tomato/i);
  });
});
