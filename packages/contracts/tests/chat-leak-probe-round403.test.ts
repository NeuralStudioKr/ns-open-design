import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 403 (form 2% thin)", () => {
  it("leaves form with 2% padding unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:2%;border:1px solid navy">thin</form>',
      '<form style="padding:4%;border:1px solid tomato">ok</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/padding:2%[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/padding:4%[^>]*\binfo-card\b|info-card[^>]*padding:4%/i);
  });
});
