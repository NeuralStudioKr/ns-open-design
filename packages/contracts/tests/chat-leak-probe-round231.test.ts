import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 231 (moz-columns)", () => {
  it("copies moz-columns", () => {
    const html = [
      '<section class="slide" style="-moz-column-count:2;-moz-column-gap:1rem;-moz-column-rule:1px solid navy;-moz-column-width:12rem;-moz-columns:2 12rem;-moz-column-fill:balance;-moz-column-span:all;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-moz-column-count:\s*2/i);
    expect(flow).toMatch(/-moz-column-gap:\s*1rem/i);
    expect(flow).toMatch(/-moz-column-rule:\s*1px solid navy/i);
    expect(flow).toMatch(/-moz-column-width:\s*12rem/i);
    expect(flow).toMatch(/-moz-columns:\s*2 12rem/i);
    expect(flow).toMatch(/-moz-column-fill:\s*balance/i);
    expect(flow).toMatch(/-moz-column-span:\s*all/i);
  });
});
