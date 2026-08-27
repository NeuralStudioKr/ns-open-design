import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 467 (calc rem+px mixed)", () => {
  it("binds calc(0.5rem + 4px) at 16px root and leaves thinner mixed unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(0.5rem + 4px);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(0.4rem + 4px);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/0\.5rem \+ 4px[^>]*\binfo-card\b|info-card[^>]*0\.5rem \+ 4px/i);
    expect(bound).not.toMatch(/0\.4rem \+ 4px[^>]*\binfo-card\b/i);
  });
});
