import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 73 — border-radius, box-sizing, visibility, grid-column/row flow.
 */
describe("chat leak / persist probe round 73 (border-radius · grid-column)", () => {
  it("copies border-radius and box-sizing into slide flow", () => {
    const html = [
      '<section class="slide" style="border-radius:8px;border-top-left-radius:4px;border-top-right-radius:5px;border-bottom-right-radius:6px;border-bottom-left-radius:7px;border-start-start-radius:4px;border-start-end-radius:5px;border-end-start-radius:6px;border-end-end-radius:8px;box-sizing:border-box;visibility:visible;shape-rendering:crispEdges;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/border-radius:\s*8px/i);
    expect(flowOpen).toMatch(/border-top-left-radius:\s*4px/i);
    expect(flowOpen).toMatch(/border-start-start-radius:\s*4px/i);
    expect(flowOpen).toMatch(/border-end-end-radius:\s*8px/i);
    expect(flowOpen).toMatch(/box-sizing:\s*border-box/i);
    expect(flowOpen).toMatch(/visibility:\s*visible/i);
    expect(flowOpen).toMatch(/shape-rendering:\s*crispEdges/i);
  });

  it("copies grid-column/row/template into slide flow", () => {
    const html = [
      '<section class="slide" style="grid-template:auto / 1fr 1fr;grid-column:1 / -1;grid-column-start:1;grid-column-end:-1;grid-row:span 2;grid-row-start:1;grid-row-end:3;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/grid-template:\s*auto \/ 1fr 1fr/i);
    expect(flowOpen).toMatch(/grid-column:\s*1 \/ -1/i);
    expect(flowOpen).toMatch(/grid-column-start:\s*1/i);
    expect(flowOpen).toMatch(/grid-column-end:\s*-1/i);
    expect(flowOpen).toMatch(/grid-row:\s*span 2/i);
    expect(flowOpen).toMatch(/grid-row-start:\s*1/i);
    expect(flowOpen).toMatch(/grid-row-end:\s*3/i);
  });
});
