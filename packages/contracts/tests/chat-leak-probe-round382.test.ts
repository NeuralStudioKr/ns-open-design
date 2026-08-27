import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 382 (form padded bind)", () => {
  it("binds form with card-like padding", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:16px;border:1px solid tomato">ok</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<form\b[^>]*\binfo-card\b/i);
  });
});
