import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 672 (calc rem+pt)", () => {
  it("binds calc(0.5rem + 4pt) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(0.5rem + 4pt);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.2rem + 2pt);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/0\.5rem \+ 4pt[^>]*\binfo-card\b|info-card[^>]*0\.5rem \+ 4pt/i);
    expect(bound).not.toMatch(/0\.2rem \+ 2pt[^>]*\binfo-card\b/i);
  });
});
