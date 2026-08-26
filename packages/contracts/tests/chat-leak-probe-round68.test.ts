import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 68 — 2-letter generic track chrome and caret/text-spacing flow.
 */
describe("chat leak / persist probe round 68 (UX track · caret-animation)", () => {
  it("drops 2-letter ALLCAPS track leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("UX 2 · RESEARCH")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("AB 1 · CD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FO 1 · BAR")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("UX 2 · RESEARCH\n리서치 완료", {
        stripCodeFences: true,
      }),
    ).toBe("리서치 완료");
  });

  it("keeps short mixed-case and Hangul prose", () => {
    expect(looksLikeDeckCodeDebrisLine("Ux 2 · Research")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("UX 구성을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("UX 구성을 먼저 확인하세요.");
  });

  it("copies caret-animation/text-spacing into slide flow", () => {
    const html = [
      '<section class="slide" style="caret-animation:auto;text-spacing:trim-start;text-autospace:normal;baseline-shift:sub;color-interpolation:linearRGB;color-rendering:optimizeQuality;image-resolution:300dpi;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/caret-animation:\s*auto/i);
    expect(flowOpen).toMatch(/text-spacing:\s*trim-start/i);
    expect(flowOpen).toMatch(/text-autospace:\s*normal/i);
    expect(flowOpen).toMatch(/baseline-shift:\s*sub/i);
    expect(flowOpen).toMatch(/color-interpolation:\s*linearRGB/i);
    expect(flowOpen).toMatch(/color-rendering:\s*optimizeQuality/i);
    expect(flowOpen).toMatch(/image-resolution:\s*300dpi/i);
  });
});
