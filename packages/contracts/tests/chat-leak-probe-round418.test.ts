import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 418 (section + dot rem)", () => {
  it("binds selective section with .75rem", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:.75rem;border:1px solid navy">ok</section>',
      '<section style="padding:2px;border:1px solid tomato">thin</section>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/\.75rem[^>]*\binfo-card\b|info-card[^>]*\.75rem/i);
    expect(bound).not.toMatch(/padding:2px[^>]*\binfo-card\b/i);
  });
});
