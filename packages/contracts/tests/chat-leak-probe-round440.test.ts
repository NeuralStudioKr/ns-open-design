import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 440 (set73 calc combo)", () => {
  it("binds calc(8px + 4px) and calc(.5rem + .25rem)", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(8px + 4px);border:1px solid tomato">a</span>',
      '<p style="padding:calc(.5rem + .25rem);border:1px solid navy">b</p>',
      '<span style="padding:calc(4px + 4px);border:1px solid gold">thin</span>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/8px \+ 4px[^>]*\binfo-card\b|info-card[^>]*8px \+ 4px/i);
    expect(bound).toMatch(/\.5rem \+ \.25rem[^>]*\binfo-card\b|info-card[^>]*\.5rem \+ \.25rem/i);
    expect(bound).not.toMatch(/4px \+ 4px[^>]*\binfo-card\b/i);
  });
});
