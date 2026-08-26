import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 51 — BTN/CTRL/STATE suffix catch-all chrome + container-type flow copy.
 */
describe("chat leak / persist probe round 51 (suffix BTN/CTRL/STATE · container)", () => {
  it("drops unknown *BTN / *CTRL / *STATE track leftovers", () => {
    expect(looksLikeDeckCodeDebrisLine("FOOBTN 1 · X")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ZOOMCTRL 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PANCTRL 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ANIMCTRL 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GESTURECTRL 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("IDLESTATE 1 · STATE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HOVERSTATE 1 · STATE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOCUSSTATE 1 · STATE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SELECTEDSTATE 1 · STATE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PENDINGSTATE 1 · STATE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TIMEOUTSTATE 1 · STATE")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("ZOOMCTRL 1 · CTRL\n줌 컨트롤", {
        stripCodeFences: true,
      }),
    ).toBe("줌 컨트롤");
    expect(
      sanitizeAssistantProseForDisplay("IDLESTATE 1 · STATE\n유휴 상태", {
        stripCodeFences: true,
      }),
    ).toBe("유휴 상태");
  });

  it("keeps legitimate prose mentioning those suffixes", () => {
    expect(
      sanitizeAssistantProseForDisplay("ZOOMCTRL 설정을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("ZOOMCTRL 설정을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("IDLESTATE 값을 줄임")).toBe(false);
    // TRACK-format prose without a chrome suffix still passes through.
    expect(looksLikeDeckCodeDebrisLine("FOOQUUX 1 · X")).toBe(false);
  });

  it("copies container-type / container-name into slide flow", () => {
    const html = [
      '<section class="slide" style="container-type:inline-size;container-name:slide;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/container-type:\s*inline-size/i);
    expect(flowOpen).toMatch(/container-name:\s*slide/i);
  });

  it("copies container shorthand into slide flow", () => {
    const html = [
      '<section class="slide" style="container:slide / inline-size;width:1920px;height:1080px">',
      "<div>x</div>",
      "</section>",
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    const flowOpen = pinned.match(
      /<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i,
    )?.[0] ?? "";
    expect(flowOpen).toMatch(/container:\s*slide \/ inline-size/i);
  });
});
