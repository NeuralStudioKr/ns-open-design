import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 127 (pre kit)", () => {
  it("binds selective pre with card-like padding and keeps em unbound", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<pre style="padding:24px;border:1px solid tomato">code</pre>',
      '<em style="padding:24px;border:1px solid navy">em</em>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<pre\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<em\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<em\b[^>]*border:\s*1px solid navy/i);
  });
});
