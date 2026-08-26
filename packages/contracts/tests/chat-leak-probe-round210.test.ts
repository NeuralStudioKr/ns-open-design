import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 210 (set25–27 closure)", () => {
  it("copies vendor stack, keeps invent-frame off flow, drops FOO chrome", () => {
    const html = [
      '<section class="slide" style="-webkit-transition-timing-function:ease;-webkit-text-emphasis-color:#111;-webkit-box-sizing:border-box;-webkit-border-vertical-spacing:1px;box-shadow:0 0 0 1px red;border-top:1px solid navy;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-transition-timing-function:\s*ease/i);
    expect(flow).toMatch(/-webkit-text-emphasis-color:\s*#111/i);
    expect(flow).toMatch(/-webkit-box-sizing:\s*border-box/i);
    expect(flow).toMatch(/-webkit-border-vertical-spacing:\s*1px/i);
    expect(flow).not.toMatch(/box-shadow/i);
    expect(flow).not.toMatch(/border-top/i);
    expect(looksLikeDeckCodeDebrisLine("QUZTOKEN 5 / TOKEN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 5 / TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
