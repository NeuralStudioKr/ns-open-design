import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 468 (calc em+px mixed)", () => {
  it("binds calc(.5em + 4px)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(.5em + 4px);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(.3em + 2px);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/\.5em \+ 4px[^>]*\binfo-card\b|info-card[^>]*\.5em \+ 4px/i);
    expect(bound).not.toMatch(/\.3em \+ 2px[^>]*\binfo-card\b/i);
  });
});
