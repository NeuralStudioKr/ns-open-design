import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 75 — font-variant family, text-orientation, ruby-overhang flow.
 */
describe("chat leak / persist probe round 75 (font-variant · text-orientation)", () => {
  it("copies font-variant and text-orientation into slide flow", () => {
    const html = [
      '<section class="slide" style="font-variant-ligatures:none;font-variant-numeric:tabular-nums;font-variant-caps:small-caps;font-variant-east-asian:full-width;font-variant-alternates:normal;font-variant-position:sub;font-variant-emoji:emoji;font-language-override:normal;font-stretch:condensed;line-height-step:1.2;ruby-overhang:auto;text-combine-upright:all;text-orientation:mixed;text-rendering:optimizeLegibility;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/font-variant-ligatures:\s*none/i);
    expect(flowOpen).toMatch(/font-variant-numeric:\s*tabular-nums/i);
    expect(flowOpen).toMatch(/font-variant-caps:\s*small-caps/i);
    expect(flowOpen).toMatch(/font-variant-east-asian:\s*full-width/i);
    expect(flowOpen).toMatch(/font-variant-emoji:\s*emoji/i);
    expect(flowOpen).toMatch(/font-language-override:\s*normal/i);
    expect(flowOpen).toMatch(/font-stretch:\s*condensed/i);
    expect(flowOpen).toMatch(/line-height-step:\s*1\.2/i);
    expect(flowOpen).toMatch(/ruby-overhang:\s*auto/i);
    expect(flowOpen).toMatch(/text-combine-upright:\s*all/i);
    expect(flowOpen).toMatch(/text-orientation:\s*mixed/i);
    expect(flowOpen).toMatch(/text-rendering:\s*optimizeLegibility/i);
  });
});
