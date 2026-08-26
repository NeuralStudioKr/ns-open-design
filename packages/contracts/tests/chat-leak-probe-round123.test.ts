import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 123 (webkit filter/backdrop)", () => {
  it("copies -webkit-filter and -webkit-backdrop-filter", () => {
    const html = [
      '<section class="slide" style="-webkit-filter:blur(2px);-webkit-backdrop-filter:saturate(1.2);width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-filter:\s*blur\(2px\)/i);
    expect(flow).toMatch(/-webkit-backdrop-filter:\s*saturate\(1\.2\)/i);
  });
});
