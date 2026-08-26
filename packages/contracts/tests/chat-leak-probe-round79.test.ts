import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 79 (snow/brown named frames)", () => {
  it("binds brown/snow/sandybrown/dimgrey/slategrey invent frames", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    for (const color of ["brown", "snow", "sandybrown", "dimgrey", "slategrey"]) {
      const html = [
        kit,
        '<section class="slide" style="width:1920px;height:1080px">',
        `<div style="padding:16px;border:1px solid ${color}">x</div>`,
        "</section>",
      ].join("");
      const bound = bindFakeOutlineCardsToOfficialKit(html);
      expect(bound).toMatch(/info-card/i);
      expect(bound).not.toMatch(new RegExp(`border:\\s*1px solid ${color}`, "i"));
    }
  });
});
