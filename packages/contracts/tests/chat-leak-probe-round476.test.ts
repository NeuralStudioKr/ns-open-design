import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 476 (form mixed calc)", () => {
  it("binds form with calc(0.5rem + 4px)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:calc(0.5rem + 4px);border:1px solid navy">ok</form>',
      '<form style="padding:calc(0.4rem + 4px);border:1px solid tomato">thin</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<form\b[^>]*0\.5rem \+ 4px[^>]*\binfo-card\b|<form\b[^>]*\binfo-card\b[^>]*0\.5rem \+ 4px/i);
    expect(bound).not.toMatch(/0\.4rem \+ 4px[^>]*\binfo-card\b/i);
  });
});
