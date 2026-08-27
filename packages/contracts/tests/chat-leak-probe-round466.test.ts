import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 466 (calc % sum)", () => {
  it("binds calc(3% + 1%) and leaves calc(2% + 1%) unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(3% + 1%);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(2% + 1%);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/calc\(3% \+ 1%\)[^>]*\binfo-card\b|info-card[^>]*calc\(3% \+ 1%\)/i);
    expect(bound).not.toMatch(/calc\(2% \+ 1%\)[^>]*\binfo-card\b/i);
  });
});
