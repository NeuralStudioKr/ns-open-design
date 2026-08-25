import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 40 — overlay/brand chrome leftovers and vh/vw card-like padding.
 */
describe("chat leak / persist probe round 40 (TOOLTIP/CALLOUT · vh/vw padding)", () => {
  it("drops TOOLTIP / POPOVER / DRAWER / SHEET / SNACKBAR chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("TOOLTIP 1 · HINT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("POPOVER 1 · INFO")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DRAWER 1 · SIDE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SHEET 1 · BOTTOM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SNACKBAR 1 · MSG")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("TOOLTIP 1 · HINT\n툴팁 안내", {
        stripCodeFences: true,
      }),
    ).toBe("툴팁 안내");
  });

  it("drops NOTICE / CALLOUT / HIGHLIGHT / MARKER / PIN chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("NOTICE 1 · ALERT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CALLOUT 1 · TIP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CALLOUT 2 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HIGHLIGHT 1 · MARK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MARKER 1 · PIN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PIN 1 · MAP")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("CALLOUT 1 · TIP\n콜아웃", {
        stripCodeFences: true,
      }),
    ).toBe("콜아웃");
  });

  it("drops ANNOTATION / COMMENT / FEEDBACK / LOGO / BRAND chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("ANNOTATION 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COMMENT 1 · THREAD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("THREAD 1 · CHAT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("REPLY 1 · ANS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FEEDBACK 1 · RATE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RATING 1 · STARS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("REVIEW 1 · TEXT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TESTIMONIAL 1 · QUOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LOGO 1 · BRAND")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BRAND 1 · MARK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WORDMARK 1 · TYPE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LOCKUP 1 · LOGO")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("LOGO 1 · BRAND\n로고 배치", {
        stripCodeFences: true,
      }),
    ).toBe("로고 배치");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("BRAND 가이드를 먼저 보세요.", {
        stripCodeFences: true,
      }),
    ).toBe("BRAND 가이드를 먼저 보세요.");
    expect(looksLikeDeckCodeDebrisLine("COMMENT 달기를 막음")).toBe(false);
  });

  it("binds vh/vw card-like p frames while keeping thin accents", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<p style="border:2px solid coral;padding:2vh">vh p</p>',
      '<p style="border:2px solid tomato;padding:3vw">vw p</p>',
      '<span style="border:2px solid gold;padding:2vmin">vmin span</span>',
      '<p style="border:2px solid coral;padding:1vh">thin vh</p>',
      '<p style="border:2px solid tomato;padding:1.5vw">thin vw</p>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>vh p/i);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid tomato[^>]*>vw p/i);
    expect(pinned).not.toMatch(/<span[^>]*border:2px solid gold[^>]*>vmin span/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid coral[^>]*>thin vh/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid tomato[^>]*>thin vw/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
