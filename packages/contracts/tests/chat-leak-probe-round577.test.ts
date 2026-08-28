import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 577 (calc ic+ric)", () => {
  it("binds calc(0.5ic + 0.5ric) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(0.5ic + 0.5ric);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.2ic + 0.2ric);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/0\.5ic \+ 0\.5ric[^>]*\binfo-card\b|info-card[^>]*0\.5ic \+ 0\.5ric/i);
    expect(bound).not.toMatch(/0\.2ic \+ 0\.2ric[^>]*\binfo-card\b/i);
  });
});
