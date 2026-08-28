import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 768 (set134 combo rem+px+pt)", () => {
  it("rem+px+pt + FOO ✂ + invent-frame off", () => {
    const kit = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(0.3rem + 4px + 4pt);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(kit)).toMatch(/0\.3rem \+ 4px \+ 4pt[^>]*\binfo-card\b|info-card[^>]*0\.3rem \+ 4px \+ 4pt/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ✂ XYZ")).toBe(true);
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="border-top:2px solid red;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/border-top/i);
  });
});
