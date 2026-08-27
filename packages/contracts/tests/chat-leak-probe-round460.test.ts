import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 460 (set77 combo)", () => {
  it("calc Q + FOO ➜", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(4Q + 4Q);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(html)).toMatch(/4Q \+ 4Q[^>]*\binfo-card\b|info-card[^>]*4Q \+ 4Q/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ➜ XYZ")).toBe(true);
  });
});
