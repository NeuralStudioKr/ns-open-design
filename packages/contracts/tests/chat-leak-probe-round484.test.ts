import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 484 (background-color off)", () => {
  it("does not copy background-color", () => {
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="background-color:#fff;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/background-color/i);
  });
});
