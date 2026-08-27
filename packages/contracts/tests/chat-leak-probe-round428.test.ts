import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 428 (form var 16px)", () => {
  it("binds form with var px fallback", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:var(--pad, 16px);border:1px solid navy">ok</form>',
      '<form style="padding:var(--pad, 4px);border:1px solid tomato">thin</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/var\(--pad, 16px\)[^>]*\binfo-card\b|info-card[^>]*var\(--pad, 16px\)/i);
    expect(bound).not.toMatch(/var\(--pad, 4px\)[^>]*\binfo-card\b/i);
  });
});
