import { describe, expect, it } from "vitest";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 150 (set13–15 closure)", () => {
  it("copies webkit animation stack and drops slash chrome", () => {
    const html = [
      '<section class="slide" style="-webkit-animation:spin 2s;-webkit-animation-play-state:paused;-webkit-hyphens:auto;-webkit-text-security:disc;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const flow = pinDeckSlidesToFixedCanvas(html).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).toMatch(/-webkit-animation:\s*spin 2s/i);
    expect(flow).toMatch(/-webkit-animation-play-state:\s*paused/i);
    expect(flow).toMatch(/-webkit-hyphens:\s*auto/i);
    expect(flow).toMatch(/-webkit-text-security:\s*disc/i);
    expect(looksLikeDeckCodeDebrisLine("QUZTOKEN 3 ／ TOKEN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 3 ／ TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
