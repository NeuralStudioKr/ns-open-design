import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 468 (calc em+px mixed)", () => {
  // 루프546 F7: round437 SSOT — mixed em+px == 12px physical is thin.
  it("leaves thin mixed em+px unbound (.5em + 4px == 12px == thin)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(.5em + 4px);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(.3em + 2px);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/\.5em \+ 4px[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/\.3em \+ 2px[^>]*\binfo-card\b/i);
  });
});
