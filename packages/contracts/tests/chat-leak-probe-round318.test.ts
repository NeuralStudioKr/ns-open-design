import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 318 (moz-text-emphasis)", () => {
  it("copies moz-text-emphasis", () => {
    const html = [
      '<section class="slide" style="-moz-text-emphasis:filled;-moz-text-emphasis-color:navy;-moz-text-emphasis-position:under;-moz-text-emphasis-style:open;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-text-emphasis:\s*filled/i);
    expect(flow).toMatch(/-moz-text-emphasis-color:\s*navy/i);
    expect(flow).toMatch(/-moz-text-emphasis-position:\s*under/i);
    expect(flow).toMatch(/-moz-text-emphasis-style:\s*open/i);
  });
});
