import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 432 (invent-frame border-top)", () => {
  it("keeps border-top off flow", () => {
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="border-top:2px solid teal;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/border-top/i);
  });
});
