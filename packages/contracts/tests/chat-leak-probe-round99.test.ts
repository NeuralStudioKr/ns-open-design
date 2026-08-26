import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 99 (base-palette / override-colors)", () => {
  it("copies font-palette companion props", () => {
    const html = [
      '<section class="slide" style="base-palette:0;override-colors:1 red;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/base-palette:\s*0/i);
    expect(flow).toMatch(/override-colors:\s*1 red/i);
  });
});
