import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 910 (var fallback prec)", () => {
  it("binds var(--p, calc(4px + 5px * 2)) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:var(--p, calc(4px + 5px * 2));border:1px solid tomato">ok</span>',
      '<p style="padding:var(--p, calc(3px + 4px * 1));border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/var\(\-\-p\, calc\(4px \+ 5px \* 2\)\)[^>]*\binfo-card\b|info-card[^>]*var\(\-\-p\, calc\(4px \+ 5px \* 2\)\)/i);
    expect(bound).not.toMatch(/var\(\-\-p\, calc\(3px \+ 4px \* 1\)\)[^>]*\binfo-card\b/i);
  });
});
