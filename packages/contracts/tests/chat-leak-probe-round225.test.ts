import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
  stripTrailingDeckFrameworkCssLeak,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 225 (set28–30 closure)", () => {
  it("copies vendor stack, keeps invent-frame off, cuts @charset", () => {
    const html = [
      '<section class="slide" style="-webkit-border-bottom-left-radius:1px;-webkit-clip-path:none;-moz-transform:translate(0);-ms-overflow-style:scrollbar;box-shadow:0 0 0 1px red;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-border-bottom-left-radius:\s*1px/i);
    expect(flow).toMatch(/-webkit-clip-path:\s*none/i);
    expect(flow).toMatch(/-moz-transform:\s*translate\(0\)/i);
    expect(flow).toMatch(/-ms-overflow-style:\s*scrollbar/i);
    expect(flow).not.toMatch(/box-shadow/i);
    expect(looksLikeDeckCodeDebrisLine('@charset "utf-8";')).toBe(true);
    expect(
      stripTrailingDeckFrameworkCssLeak(
        "완료.\n\n@charset {\n  .a { opacity: 1 }\n}",
      ),
    ).toBe("완료.");
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 5 / TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
