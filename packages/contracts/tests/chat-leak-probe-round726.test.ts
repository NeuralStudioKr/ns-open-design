import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 726 (calc px+cm)", () => {
  it("binds calc(5px + 0.3cm) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(5px + 0.3cm);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(2px + 0.1cm);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/5px \+ 0\.3cm[^>]*\binfo-card\b|info-card[^>]*5px \+ 0\.3cm/i);
    expect(bound).not.toMatch(/2px \+ 0\.1cm[^>]*\binfo-card\b/i);
  });
});
