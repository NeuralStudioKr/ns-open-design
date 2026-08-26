import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 74 — cursor, scrollbar, scroll-behavior, text-edge, margin-trim flow.
 */
describe("chat leak / persist probe round 74 (cursor · scrollbar)", () => {
  it("copies cursor/scrollbar/scroll-behavior into slide flow", () => {
    const html = [
      '<section class="slide" style="cursor:pointer;scrollbar-width:thin;scrollbar-color:red blue;scroll-behavior:smooth;scroll-snap-stop:always;hyphenate-limit-zone:10%;text-edge:cap alphabetic;leading-trim:both;margin-trim:block;position-try-options:flip-block;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/cursor:\s*pointer/i);
    expect(flowOpen).toMatch(/scrollbar-width:\s*thin/i);
    expect(flowOpen).toMatch(/scrollbar-color:\s*red blue/i);
    expect(flowOpen).toMatch(/scroll-behavior:\s*smooth/i);
    expect(flowOpen).toMatch(/scroll-snap-stop:\s*always/i);
    expect(flowOpen).toMatch(/hyphenate-limit-zone:\s*10%/i);
    expect(flowOpen).toMatch(/text-edge:\s*cap alphabetic/i);
    expect(flowOpen).toMatch(/leading-trim:\s*both/i);
    expect(flowOpen).toMatch(/margin-trim:\s*block/i);
    expect(flowOpen).toMatch(/position-try-options:\s*flip-block/i);
  });
});
