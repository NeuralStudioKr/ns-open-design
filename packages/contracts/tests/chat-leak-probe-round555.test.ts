import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 555 (calc dvb+dvi)", () => {
  it("binds calc(1dvb + 1dvi) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1dvb + 1dvi);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.5dvb + 0.5dvi);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/1dvb \+ 1dvi[^>]*\binfo-card\b|info-card[^>]*1dvb \+ 1dvi/i);
    expect(bound).not.toMatch(/0\.5dvb \+ 0\.5dvi[^>]*\binfo-card\b/i);
  });
});
