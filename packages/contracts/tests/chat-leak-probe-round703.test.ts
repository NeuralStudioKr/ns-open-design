import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 703 (calc px+vb)", () => {
  it("binds calc(3px + 1vb) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(3px + 1vb);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(1px + 0.3vb);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/3px \+ 1vb[^>]*\binfo-card\b|info-card[^>]*3px \+ 1vb/i);
    expect(bound).not.toMatch(/1px \+ 0\.3vb[^>]*\binfo-card\b/i);
  });
});
