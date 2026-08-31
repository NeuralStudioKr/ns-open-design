import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 906 (var nested calc min)", () => {
  it("binds var(--x, calc(min(calc(7px * 2), calc(8px * 2)) + 4px)) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:var(--x, calc(min(calc(7px * 2), calc(8px * 2)) + 4px));border:1px solid tomato">ok</span>',
      '<p style="padding:var(--x, calc(min(calc(5px * 2), calc(4px * 2)) + 2px));border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/var\(\-\-x\, calc\(min\(calc\(7px \* 2\)\, calc\(8px \* 2\)\) \+ 4px\)\)[^>]*\binfo-card\b|info-card[^>]*var\(\-\-x\, calc\(min\(calc\(7px \* 2\)\, calc\(8px \* 2\)\) \+ 4px\)\)/i);
    expect(bound).not.toMatch(/var\(\-\-x\, calc\(min\(calc\(5px \* 2\)\, calc\(4px \* 2\)\) \+ 2px\)\)[^>]*\binfo-card\b/i);
  });
});
