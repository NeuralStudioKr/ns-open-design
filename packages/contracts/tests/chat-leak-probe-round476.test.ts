import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 476 (form mixed calc)", () => {
  // 루프546 F7: mixed rem+px == 12px physical is thin (round437 SSOT).
  it("leaves form with thin mixed calc(0.5rem + 4px) unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:calc(0.5rem + 4px);border:1px solid navy">ok</form>',
      '<form style="padding:calc(0.4rem + 4px);border:1px solid tomato">thin</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/<form\b[^>]*0\.5rem \+ 4px[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/0\.4rem \+ 4px[^>]*\binfo-card\b/i);
  });
});
