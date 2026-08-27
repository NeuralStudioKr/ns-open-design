import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 438 (calc subtract)", () => {
  it("binds calc(16px - 4px) and leaves calc(10px - 4px) unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(16px - 4px);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(10px - 4px);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/calc\(16px - 4px\)[^>]*\binfo-card\b|info-card[^>]*calc\(16px - 4px\)/i);
    expect(bound).not.toMatch(/calc\(10px - 4px\)[^>]*\binfo-card\b/i);
  });
});
