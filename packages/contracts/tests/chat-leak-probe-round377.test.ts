import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 377 (lvmax/svmax/dvmax padding)", () => {
  it("binds ≥2 lvmax/svmax/dvmax card padding", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:2lvmax;border:1px solid tomato">a</span>',
      '<p style="padding:2svmax;border:1px solid navy">b</p>',
      '<span style="padding:2dvmax;border:1px solid teal">c</span>',
      '<p style="padding:1.5svmax;border:1px solid gold">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/2lvmax[^>]*\binfo-card\b|info-card[^>]*2lvmax/i);
    expect(bound).toMatch(/2svmax[^>]*\binfo-card\b|info-card[^>]*2svmax/i);
    expect(bound).toMatch(/2dvmax[^>]*\binfo-card\b|info-card[^>]*2dvmax/i);
    expect(bound).not.toMatch(/1\.5svmax[^>]*\binfo-card\b|info-card[^>]*1\.5svmax/i);
  });
});
