import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 108 (sub/sup/var/code kit)", () => {
  it("binds selective sub/sup/var/code and keeps strong unbound", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="width:1920px;height:1080px">',
      '<sub style="padding:24px;border:1px solid tomato">sub</sub>',
      '<sup style="padding-inline:1ic;border:1px solid navy">sup</sup>',
      '<var style="padding:0.75rem;border:1px solid teal">var</var>',
      '<code style="padding:12px;border:1px solid olive">code</code>',
      '<strong style="padding:24px;border:1px solid red">strong</strong>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<sub\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<sup\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<var\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<code\b[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<strong\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<strong\b[^>]*border:\s*1px solid red/i);
  });
});
