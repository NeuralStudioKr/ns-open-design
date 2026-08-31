import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 899 (calc max *)", () => {
  it("binds calc(max(calc(5px * 2), calc(7px * 2)) * 1) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(max(calc(5px * 2), calc(7px * 2)) * 1);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(max(calc(4px * 2), calc(5px * 2)) * 1);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/calc\(max\(calc\(5px \* 2\)\, calc\(7px \* 2\)\) \* 1\)[^>]*\binfo-card\b|info-card[^>]*calc\(max\(calc\(5px \* 2\)\, calc\(7px \* 2\)\) \* 1\)/i);
    expect(bound).not.toMatch(/calc\(max\(calc\(4px \* 2\)\, calc\(5px \* 2\)\) \* 1\)[^>]*\binfo-card\b/i);
  });
});
