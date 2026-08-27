import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 286 (background blend + inline-policy)", () => {
  it("copies background blend + inline-policy", () => {
    const html = [
      '<section class="slide" style="-moz-background-inline-policy:continuous;-moz-background-blend-mode:multiply;-webkit-background-blend-mode:screen;background-blend-mode:overlay;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-background-inline-policy:\s*continuous/i);
    expect(flow).toMatch(/-moz-background-blend-mode:\s*multiply/i);
    expect(flow).toMatch(/-webkit-background-blend-mode:\s*screen/i);
    expect(flow).toMatch(/background-blend-mode:\s*overlay/i);
  });
});
