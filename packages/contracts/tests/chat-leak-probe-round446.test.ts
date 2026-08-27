import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 446 (calc padding on flow)", () => {
  it("copies calc(8px + 4px) onto flow", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px;padding:calc(8px + 4px)">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/padding:\s*calc\(8px \+ 4px\)/i);
  });
});
