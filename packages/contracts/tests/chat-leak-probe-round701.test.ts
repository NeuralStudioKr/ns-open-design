import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 701 (calc px+rlh)", () => {
  it("binds calc(5px + 0.5rlh) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(5px + 0.5rlh);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(2px + 0.2rlh);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/5px \+ 0\.5rlh[^>]*\binfo-card\b|info-card[^>]*5px \+ 0\.5rlh/i);
    expect(bound).not.toMatch(/2px \+ 0\.2rlh[^>]*\binfo-card\b/i);
  });
});
