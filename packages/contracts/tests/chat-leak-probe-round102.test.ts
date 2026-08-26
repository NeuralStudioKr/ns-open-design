import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

describe("chat leak / persist probe round 102 (speak / user-modify)", () => {
  it("copies aural and editing leftovers", () => {
    const html = [
      '<section class="slide" style="speak:never;speak-as:spell-out;voice-family:female;user-modify:read-only;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/speak:\s*never/i);
    expect(flow).toMatch(/speak-as:\s*spell-out/i);
    expect(flow).toMatch(/voice-family:\s*female/i);
    expect(flow).toMatch(/user-modify:\s*read-only/i);
  });
});
