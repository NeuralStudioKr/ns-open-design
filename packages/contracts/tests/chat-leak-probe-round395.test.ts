import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 395 (set64 combo)", () => {
  it("form selective + FOO ： + @when debris", () => {
    const html = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<form style="padding:12px;border:1px solid navy">ok</form>',
      '<form style="padding:1px;border:1px solid tomato">thin</form>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/padding:12px[^>]*\binfo-card\b|info-card[^>]*padding:12px/i);
    expect(bound).not.toMatch(/padding:1px[^>]*\binfo-card\b/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ： XYZ")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("@when (style(--a:1)) {}")).toBe(true);
  });
});
