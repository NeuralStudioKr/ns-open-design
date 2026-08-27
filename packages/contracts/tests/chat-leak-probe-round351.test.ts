import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 351 (section thin stay unbound)", () => {
  it("keeps thin nested section without card-like padding unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="border:1px solid navy;padding:2px">thin</section>',
      '<section style="border:1px solid tomato;padding:1px">also</section>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).not.toMatch(/<section\b[^>]*padding:2px[^>]*\binfo-card\b/i);
    expect(bound).not.toMatch(/<section\b[^>]*padding:1px[^>]*\binfo-card\b/i);
  });
});
