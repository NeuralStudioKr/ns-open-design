import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 415 (set68 combo)", () => {
  it("dot rem kit + FOO ⇢ + invent policy cue", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:.75rem;border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(html)).toMatch(/\.75rem[^>]*\binfo-card\b|info-card[^>]*\.75rem/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ⇢ XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
  });
});
