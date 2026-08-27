import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 393 (nested section kit after close fix)", () => {
  it("binds padded nested section inside slide", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:16px;border:1px solid navy">inner</section>',
      '<p>after</p>',
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toContain("after");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<section\b[^>]*padding:16px[^>]*\binfo-card\b|<section\b[^>]*\binfo-card\b[^>]*padding:16px/i);
  });
});
