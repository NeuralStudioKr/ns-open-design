import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 381 (form thin stay unbound)", () => {
  it("keeps thin form without card-like padding unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:2px;border:1px solid navy">thin</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/<form\b[^>]*\binfo-card\b/i);
  });
});
