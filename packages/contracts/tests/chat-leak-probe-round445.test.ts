import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 445 (set74 combo)", () => {
  it("calc sum kit + FOO ⟶", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(8px + 4px);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(html)).toMatch(/8px \+ 4px[^>]*\binfo-card\b|info-card[^>]*8px \+ 4px/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ⟶ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
  });
});
