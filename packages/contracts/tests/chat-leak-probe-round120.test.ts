import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit } from "../src/html/deck-fixed-canvas.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 120 (set7–8 closure)", () => {
  it("binds del/sup cards and copies smoothing+stroke", () => {
    const kit =
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>';
    const html = [
      kit,
      '<section class="slide" style="font-smooth:always;-webkit-text-stroke:1px #000;app-region:drag;width:1920px;height:1080px">',
      '<del style="padding:24px;border:1px solid tomato">del</del>',
      '<sup style="padding:1ic;border:1px solid navy">sup</sup>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(html);
    expect(bound).toMatch(/<del\b[^>]*\binfo-card\b/i);
    expect(bound).toMatch(/<sup\b[^>]*\binfo-card\b/i);
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/font-smooth:\s*always/i);
    expect(flow).toMatch(/-webkit-text-stroke:\s*1px #000/i);
    expect(flow).toMatch(/app-region:\s*drag/i);
  });
});
