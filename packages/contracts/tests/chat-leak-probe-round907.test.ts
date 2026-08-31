import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 907 (calc max + px)", () => {
  it("binds calc(max(calc(0.3rem * 2), calc(7px * 2)) + 2px) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(max(calc(0.3rem * 2), calc(7px * 2)) + 2px);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(max(calc(0.2rem * 2), calc(5px * 2)) + 1px);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/calc\(max\(calc\(0\.3rem \* 2\)\, calc\(7px \* 2\)\) \+ 2px\)[^>]*\binfo-card\b|info-card[^>]*calc\(max\(calc\(0\.3rem \* 2\)\, calc\(7px \* 2\)\) \+ 2px\)/i);
    expect(bound).not.toMatch(/calc\(max\(calc\(0\.2rem \* 2\)\, calc\(5px \* 2\)\) \+ 1px\)[^>]*\binfo-card\b/i);
  });
});
