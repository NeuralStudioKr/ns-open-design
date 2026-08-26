import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 160 (border-image+logical combo)", () => {
  it("copies webkit border-image and logical sizes together", () => {
    const html = [
      '<section class="slide" style="-webkit-border-image-source:url(a.png);-webkit-logical-height:40%;-webkit-text-zoom:reset;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-border-image-source:\s*url\(a\.png\)/i);
    expect(flow).toMatch(/-webkit-logical-height:\s*40%/i);
    expect(flow).toMatch(/-webkit-text-zoom:\s*reset/i);
  });
});
