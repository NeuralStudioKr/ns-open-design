import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 505 (set86 combo)", () => {
  it("rem+em + FOO ◇", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(0.5rem + 0.25em);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(html)).toMatch(/0\.5rem \+ 0\.25em[^>]*\binfo-card\b|info-card[^>]*0\.5rem \+ 0\.25em/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ◇ XYZ")).toBe(true);
  });
});
