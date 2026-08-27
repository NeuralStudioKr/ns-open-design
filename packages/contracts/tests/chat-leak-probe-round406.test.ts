import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 406 (leading-dot rem padding)", () => {
  it("binds .75rem and leaves thin .5rem unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:.75rem;border:1px solid tomato">ok</span>',
      '<p style="padding:.5rem;border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/\.75rem[^>]*\binfo-card\b|info-card[^>]*\.75rem/i);
    expect(bound).not.toMatch(/\.5rem[^>]*\binfo-card\b|info-card[^>]*\.5rem/i);
  });
});
