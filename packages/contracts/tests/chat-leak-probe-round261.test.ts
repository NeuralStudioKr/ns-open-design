import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 261 (ms-scrollbar colors)", () => {
  it("copies ms-scrollbar colors", () => {
    const html = [
      '<section class="slide" style="-ms-scrollbar-base-color:silver;-ms-scrollbar-face-color:gray;-ms-scrollbar-3dlight-color:#eee;-ms-scrollbar-shadow-color:#333;-ms-scrollbar-highlight-color:#fff;-ms-scrollbar-darkshadow-color:#000;-ms-scrollbar-arrow-color:navy;-ms-scrollbar-track-color:#f5f5f5;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-ms-scrollbar-base-color:\s*silver/i);
    expect(flow).toMatch(/-ms-scrollbar-face-color:\s*gray/i);
    expect(flow).toMatch(/-ms-scrollbar-arrow-color:\s*navy/i);
    expect(flow).toMatch(/-ms-scrollbar-track-color:\s*#f5f5f5/i);
  });
});
