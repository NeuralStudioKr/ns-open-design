import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 774 (calc ch minus)", () => {
  it("binds calc(1.5ch + 1ch - 0.3ch) and leaves thinner unbound", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1.5ch + 1ch - 0.3ch);border:1px solid tomato">ok</span>',
      '<p style="padding:calc(1ch + 0.5ch - 0.2ch);border:1px solid navy">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/1\.5ch \+ 1ch - 0\.3ch[^>]*\binfo-card\b|info-card[^>]*1\.5ch \+ 1ch - 0\.3ch/i);
    expect(bound).not.toMatch(/1ch \+ 0\.5ch - 0\.2ch[^>]*\binfo-card\b/i);
  });
});
