import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 232 (margin-collapse + rtl-ordering)", () => {
  it("copies margin-collapse + rtl-ordering", () => {
    const html = [
      '<section class="slide" style="-webkit-margin-collapse:collapse;-webkit-margin-top-collapse:discard;-webkit-margin-bottom-collapse:separate;-webkit-margin-before-collapse:collapse;-webkit-margin-after-collapse:discard;-webkit-rtl-ordering:logical;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-margin-collapse:\s*collapse/i);
    expect(flow).toMatch(/-webkit-margin-top-collapse:\s*discard/i);
    expect(flow).toMatch(/-webkit-margin-bottom-collapse:\s*separate/i);
    expect(flow).toMatch(/-webkit-margin-before-collapse:\s*collapse/i);
    expect(flow).toMatch(/-webkit-margin-after-collapse:\s*discard/i);
    expect(flow).toMatch(/-webkit-rtl-ordering:\s*logical/i);
  });
});
