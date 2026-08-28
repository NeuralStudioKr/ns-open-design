import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 581 (calc Q+pt)", () => {
  it("binds calc(10Q + 4pt) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(10Q + 4pt);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(2Q + 1pt);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/10Q \+ 4pt[^>]*\binfo-card\b|info-card[^>]*10Q \+ 4pt/i);
    expect(bound).not.toMatch(/2Q \+ 1pt[^>]*\binfo-card\b/i);
  });
});
