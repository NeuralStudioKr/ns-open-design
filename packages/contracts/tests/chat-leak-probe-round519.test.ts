import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 519 (thin form keep)", () => {
  it("does not bind a 2px form", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:2px;border:1px solid gold">thin-form</form>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(html)).not.toMatch(/padding:2px[^>]*\binfo-card\b/i);
  });
});
