import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 180 (set19-21 closure)", () => {
  it("copies set19-21 closure", () => {
    const html = [
      '<section class="slide" style="-webkit-nbsp-mode:space;-webkit-mask-source-type:alpha;-webkit-hyphenate-limit-before:1;-webkit-border-start:1px solid #000;-webkit-user-modify:read-only;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-nbsp-mode:\s*space/i);
    expect(flow).toMatch(/-webkit-mask-source-type:\s*alpha/i);
    expect(flow).toMatch(/-webkit-hyphenate-limit-before:\s*1/i);
    expect(flow).toMatch(/-webkit-border-start:\s*1px solid #000/i);
    expect(flow).toMatch(/-webkit-user-modify:\s*read-only/i);
  });
});
