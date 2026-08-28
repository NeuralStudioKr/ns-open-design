import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 549 (calc rlh+rex)", () => {
  it("binds calc(1.2rlh + 0.8rex) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1.2rlh + 0.8rex);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.3rlh + 0.3rex);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/1\.2rlh \+ 0\.8rex[^>]*\binfo-card\b|info-card[^>]*1\.2rlh \+ 0\.8rex/i);
    expect(bound).not.toMatch(/0\.3rlh \+ 0\.3rex[^>]*\binfo-card\b/i);
  });
});
