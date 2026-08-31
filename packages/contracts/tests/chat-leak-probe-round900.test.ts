import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 900 (calc clamp +)", () => {
  it("binds calc(clamp(calc(4px * 1), calc(7px * 2), calc(9px * 2)) + 2px) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(clamp(calc(4px * 1), calc(7px * 2), calc(9px * 2)) + 2px);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(clamp(calc(4px * 1), calc(5px * 2), calc(5px * 2)) + 1px);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/calc\(clamp\(calc\(4px \* 1\)\, calc\(7px \* 2\)\, calc\(9px \* 2\)\) \+ 2px\)[^>]*\binfo-card\b|info-card[^>]*calc\(clamp\(calc\(4px \* 1\)\, calc\(7px \* 2\)\, calc\(9px \* 2\)\) \+ 2px\)/i);
    expect(bound).not.toMatch(/calc\(clamp\(calc\(4px \* 1\)\, calc\(5px \* 2\)\, calc\(5px \* 2\)\) \+ 1px\)[^>]*\binfo-card\b/i);
  });
});
