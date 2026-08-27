import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 429 (nested section after)", () => {
  it("keeps content after nested section in slide", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<section style="padding:.75rem">inner</section>',
      "<p>after-nested</p>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).toContain("after-nested");
    expect(pinned).toContain("inner");
  });
});
