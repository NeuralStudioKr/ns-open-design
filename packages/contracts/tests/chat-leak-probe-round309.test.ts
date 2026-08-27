import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 309 (invent-frame keep + FOO)", () => {
  it("keeps invent-frame off flow and drops FOO chrome", () => {
    const html = [
      '<section class="slide" style="-webkit-wrap-through:wrap;view-transition-group:g;box-shadow:0 0 0 1px red;border-top:1px solid navy;background-color:snow;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-wrap-through:\s*wrap/i);
    expect(flow).toMatch(/view-transition-group:\s*g/i);
    expect(flow).not.toMatch(/box-shadow/i);
    expect(flow).not.toMatch(/border-top/i);
    expect(flow).not.toMatch(/background-color/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 / XYZ")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 : XYZ\n트랙 정리 완료", {
        stripCodeFences: true,
      }),
    ).toBe("트랙 정리 완료");
  });
});
