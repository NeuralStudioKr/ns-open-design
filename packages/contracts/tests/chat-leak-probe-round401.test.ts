import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 401 (dvmax thin unbound)", () => {
  it("leaves 1dvmax unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:1dvmax;border:1px solid tomato">thin</span>',
      '<p style="padding:2dvmax;border:1px solid navy">ok</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/1dvmax[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/2dvmax[^>]*\binfo-card\b|info-card[^>]*2dvmax/i);
  });
});
