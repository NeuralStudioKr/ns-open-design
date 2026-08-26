import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 71 — margin/inset logical longhands, outline, text-decoration, scroll-*
 * block/inline start/end flow copy.
 */
describe("chat leak / persist probe round 71 (margin-block-start · outline)", () => {
  it("copies margin/inset logical longhands into slide flow", () => {
    const html = [
      '<section class="slide" style="margin-block-start:1rem;margin-block-end:2rem;margin-inline-start:3px;margin-inline-end:4px;inset-block-start:0;inset-block-end:1px;inset-inline-start:2px;inset-inline-end:3px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/margin-block-start:\s*1rem/i);
    expect(flowOpen).toMatch(/margin-block-end:\s*2rem/i);
    expect(flowOpen).toMatch(/margin-inline-start:\s*3px/i);
    expect(flowOpen).toMatch(/margin-inline-end:\s*4px/i);
    expect(flowOpen).toMatch(/inset-block-start:\s*0/i);
    expect(flowOpen).toMatch(/inset-block-end:\s*1px/i);
    expect(flowOpen).toMatch(/inset-inline-start:\s*2px/i);
    expect(flowOpen).toMatch(/inset-inline-end:\s*3px/i);
  });

  it("copies outline/text-decoration/border-block into slide flow", () => {
    const html = [
      '<section class="slide" style="outline:1px solid navy;outline-width:1px;outline-style:solid;outline-color:navy;outline-offset:2px;text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:#f00;text-decoration-thickness:2px;border-block:1px solid #000;border-inline:2px dashed #111;border-block-start:1px solid red;border-inline-end:2px solid blue;border-block-width:1px;border-inline-style:solid;border-block-color:red;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/outline:\s*1px solid navy/i);
    expect(flowOpen).toMatch(/outline-offset:\s*2px/i);
    expect(flowOpen).toMatch(/text-decoration-line:\s*underline/i);
    expect(flowOpen).toMatch(/text-decoration-style:\s*wavy/i);
    expect(flowOpen).toMatch(/text-decoration-color:\s*#f00/i);
    expect(flowOpen).toMatch(/text-decoration-thickness:\s*2px/i);
    expect(flowOpen).toMatch(/border-block:\s*1px solid #000/i);
    expect(flowOpen).toMatch(/border-inline:\s*2px dashed #111/i);
    expect(flowOpen).toMatch(/border-block-start:\s*1px solid red/i);
    expect(flowOpen).toMatch(/border-inline-end:\s*2px solid blue/i);
  });

  it("copies scroll-*-block-start longhands into slide flow", () => {
    const html = [
      '<section class="slide" style="scroll-padding-block-start:1px;scroll-padding-block-end:2px;scroll-padding-inline-start:3px;scroll-padding-inline-end:4px;scroll-margin-block-start:5px;scroll-margin-block-end:6px;scroll-margin-inline-start:7px;scroll-margin-inline-end:8px;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/scroll-padding-block-start:\s*1px/i);
    expect(flowOpen).toMatch(/scroll-padding-inline-end:\s*4px/i);
    expect(flowOpen).toMatch(/scroll-margin-block-start:\s*5px/i);
    expect(flowOpen).toMatch(/scroll-margin-inline-end:\s*8px/i);
  });
});
