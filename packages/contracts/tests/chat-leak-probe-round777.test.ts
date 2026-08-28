import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 777 (calc paren px)", () => {
  it("binds calc((10px + 6px) - 2px) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc((10px + 6px) - 2px);border:1px solid tomato">ok</span>',
      '<p style="padding:calc((8px + 3px) - 2px);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/\(10px \+ 6px\) - 2px[^>]*\binfo-card\b|info-card[^>]*\(10px \+ 6px\) - 2px/i);
    expect(bound).not.toMatch(/\(8px \+ 3px\) - 2px[^>]*\binfo-card\b/i);
  });
});
