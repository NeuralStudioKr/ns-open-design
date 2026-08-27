import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 447 (section calc sum)", () => {
  it("binds selective section with calc rem sum", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:calc(.5rem + .25rem);border:1px solid navy">ok</section>',
      '<section style="padding:calc(4px + 4px);border:1px solid tomato">thin</section>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/\.5rem \+ \.25rem[^>]*\binfo-card\b|info-card[^>]*\.5rem \+ \.25rem/i);
    expect(bound).not.toMatch(/4px \+ 4px[^>]*\binfo-card\b/i);
  });
});
