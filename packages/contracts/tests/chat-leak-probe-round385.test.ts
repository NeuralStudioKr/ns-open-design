import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 385 (set62 form combo)", () => {
  it("binds padded form and leaves thin form unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:0.75rem;border:1px solid navy">ok</form>',
      '<form style="padding:3%;border:1px solid tomato">thin</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/0\.75rem[^>]*\binfo-card\b|info-card[^>]*0\.75rem/i);
    expect(bound).not.toMatch(/3%[^>]*\binfo-card\b|info-card[^>]*3%/i);
  });
});
