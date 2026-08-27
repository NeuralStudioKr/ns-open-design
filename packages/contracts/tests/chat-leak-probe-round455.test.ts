import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 455 (set76 combo)", () => {
  it("calc sum + FOO ➡ + invent-frame off", () => {
    const kit = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(8px + 4px);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(kit)).toMatch(/8px \+ 4px[^>]*\binfo-card\b|info-card[^>]*8px \+ 4px/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ➡ XYZ")).toBe(true);
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow/i);
  });
});
