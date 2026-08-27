import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 424 (.8em direct)", () => {
  it("binds .8em card padding", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:.8em;border:1px solid tomato">ok</span>',
      '<p style="padding:.3em;border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/\.8em[^>]*\binfo-card\b|info-card[^>]*\.8em/i);
    expect(bound).not.toMatch(/\.3em[^>]*\binfo-card\b/i);
  });
});
