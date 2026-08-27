import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 376 (lvmin/svmin/dvmin padding)", () => {
  it("binds ≥2 lvmin/svmin/dvmin card padding", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:2lvmin;border:1px solid tomato">a</span>',
      '<p style="padding:2svmin;border:1px solid navy">b</p>',
      '<span style="padding:2dvmin;border:1px solid teal">c</span>',
      '<p style="padding:1lvmin;border:1px solid gold">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/2lvmin[^>]*\binfo-card\b|info-card[^>]*2lvmin/i);
    expect(bound).toMatch(/2svmin[^>]*\binfo-card\b|info-card[^>]*2svmin/i);
    expect(bound).toMatch(/2dvmin[^>]*\binfo-card\b|info-card[^>]*2dvmin/i);
    expect(bound).not.toMatch(/1lvmin[^>]*\binfo-card\b|info-card[^>]*1lvmin/i);
  });
});
