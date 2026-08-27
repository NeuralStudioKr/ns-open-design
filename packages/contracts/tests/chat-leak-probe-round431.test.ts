import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 431 (.5rem stay unbound)", () => {
  it("leaves .5rem and .6rem unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:.5rem;border:1px solid tomato">a</span>',
      '<p style="padding:.6rem;border:1px solid navy">b</p>',
      '<span style="padding:.75rem;border:1px solid teal">ok</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/\.5rem[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/\.6rem[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/\.75rem[^>]*\binfo-card\b|info-card[^>]*\.75rem/i);
  });
});
