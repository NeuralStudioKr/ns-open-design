import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 252 (moz-text + hyphens)", () => {
  it("copies moz-text + hyphens", () => {
    const html = [
      '<section class="slide" style="-moz-hyphens:auto;-moz-text-align-last:center;-moz-text-decoration-color:tomato;-moz-text-decoration-line:underline;-moz-text-decoration-style:wavy;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-hyphens:\s*auto/i);
    expect(flow).toMatch(/-moz-text-align-last:\s*center/i);
    expect(flow).toMatch(/-moz-text-decoration-color:\s*tomato/i);
    expect(flow).toMatch(/-moz-text-decoration-line:\s*underline/i);
    expect(flow).toMatch(/-moz-text-decoration-style:\s*wavy/i);
  });
});
