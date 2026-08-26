import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 170 (set19 combo)", () => {
  it("copies set19 combo", () => {
    const html = [
      '<section class="slide" style="-webkit-touch-callout:default;-webkit-box-decoration-break:slice;-webkit-background-size:contain;-webkit-user-modify:read-write;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-touch-callout:\s*default/i);
    expect(flow).toMatch(/-webkit-box-decoration-break:\s*slice/i);
    expect(flow).toMatch(/-webkit-background-size:\s*contain/i);
    expect(flow).toMatch(/-webkit-user-modify:\s*read-write/i);
  });
});
