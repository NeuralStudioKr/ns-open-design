import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 238 (ms-wrap + block-progression)", () => {
  it("copies ms-wrap + block-progression", () => {
    const html = [
      '<section class="slide" style="-ms-wrap-flow:end;-ms-wrap-margin:1rem;-ms-wrap-through:none;-ms-block-progression:tb;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-wrap-flow:\s*end/i);
    expect(flow).toMatch(/-ms-wrap-margin:\s*1rem/i);
    expect(flow).toMatch(/-ms-wrap-through:\s*none/i);
    expect(flow).toMatch(/-ms-block-progression:\s*tb/i);
  });
});
