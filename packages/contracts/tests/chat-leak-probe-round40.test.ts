import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  looksLikeSlideCountTopUpLeftover,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 40 — overlay/nav chrome leftovers, leftover top-up wipe, and
 * vh/vw card-like padding for selective p/span kit bind.
 */
describe("chat leak / persist probe round 40 (TOOLTIP/DRAWER · vh/vw padding)", () => {
  it("drops TOOLTIP / POPOVER / DRAWER / OFFCANVAS chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("TOOLTIP 1 · HINT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("POPOVER 2 · MENU")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DRAWER 1 · SIDE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("OFFCANVAS 1 · NAV")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("DRAWER 1 · SIDE\n사이드 메뉴", {
        stripCodeFences: true,
      }),
    ).toBe("사이드 메뉴");
  });

  it("drops BREADCRUMB / PAGINATION / SKELETON / SPINNER chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("BREADCRUMB 1 · PATH")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PAGINATION 2 · PAGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SKELETON 1 · LOAD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SPINNER 1 · WAIT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LOADER 1 · SPIN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("SKELETON 1 · LOAD\n로딩", {
        stripCodeFences: true,
      }),
    ).toBe("로딩");
  });

  it("drops OVERLAY / BACKDROP / SNACKBAR / FAB / MEGAMENU chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("OVERLAY 1 · MASK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BACKDROP 1 · DIM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SNACKBAR 1 · TOAST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FAB 1 · ADD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MEGAMENU 1 · NAV")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SUBNAV 1 · LINK")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FAB 1 · ADD\n추가", {
        stripCodeFences: true,
      }),
    ).toBe("추가");
  });

  it("wipes leftover slide-count top-up instructions and keeps Hangul status", () => {
    const leftover = [
      "The",
      "Keep",
      "APPEND",
      "This is an explicit slide-count expansion — not a redesign.",
      "Do NOT rewrite the saved deck. Emit ONLY the new `",
    ].join("\n");
    expect(looksLikeSlideCountTopUpLeftover(leftover)).toBe(true);
    expect(sanitizeAssistantProseForDisplay(leftover, { stripCodeFences: true })).toBe("");
    expect(
      sanitizeAssistantProseForDisplay(`슬라이드 작업이 완료되었습니다.\n${leftover}`, {
        stripCodeFences: true,
      }),
    ).toBe("슬라이드 작업이 완료되었습니다.");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("TOOLTIP 문구를 짧게 유지하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("TOOLTIP 문구를 짧게 유지하세요.");
    expect(looksLikeDeckCodeDebrisLine("DRAWER 정리를 먼저 하세요")).toBe(false);
  });

  it("binds vh/vw card-like p/span frames while keeping thin accents", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<p style="border:2px solid coral;padding:4vh">vh p</p>',
      '<span style="border:2px solid gold;padding:3vw">vw span</span>',
      '<p style="border:2px solid coral;padding:1vh">thin vh</p>',
      '<span style="border:2px solid tomato;padding:2vw">thin vw</span>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>vh p/i);
    expect(pinned).not.toMatch(/<span[^>]*border:2px solid gold[^>]*>vw span/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid coral[^>]*>thin vh/i);
    expect(pinned).toMatch(/<span[^>]*border:2px solid tomato[^>]*>thin vw/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
