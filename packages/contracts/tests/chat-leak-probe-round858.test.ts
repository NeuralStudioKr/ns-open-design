import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 858 (max pt)", () => {
  it("binds max(calc(5pt * 2), calc(3pt * 2)) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:max(calc(5pt * 2), calc(3pt * 2));border:1px solid tomato">ok</span>',
      '<p style="padding:max(calc(3pt * 2), calc(2pt * 2));border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/max\(calc\(5pt \* 2\)\, calc\(3pt \* 2\)\)[^>]*\binfo-card\b|info-card[^>]*max\(calc\(5pt \* 2\)\, calc\(3pt \* 2\)\)/i);
    expect(bound).not.toMatch(/max\(calc\(3pt \* 2\)\, calc\(2pt \* 2\)\)[^>]*\binfo-card\b/i);
  });
});
