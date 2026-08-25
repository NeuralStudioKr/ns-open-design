import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 38 — UI-widget chrome (GALLERY/MODAL/TAB/FORM/…) leftovers and
 * rem/em card-like padding for selective p/span kit bind.
 */
describe("chat leak / persist probe round 38 (GALLERY/MODAL · rem padding)", () => {
  it("drops GALLERY / CAROUSEL / MODAL / DIALOG chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("GALLERY 1 · GRID")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CAROUSEL 2 · SLIDE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MODAL 1 · DIALOG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DIALOG 1 · BOX")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("MODAL 1 · DIALOG\n모달", {
        stripCodeFences: true,
      }),
    ).toBe("모달");
  });

  it("drops TOAST / ALERT / TAB / ACCORDION / STEPPER chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("TOAST 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ALERT 1 · WARN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TAB 1 · PANE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TABS 2 · LIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ACCORDION 1 · ITEM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COLLAPSE 1 · BODY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STEPPER 1 · FLOW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PROGRESS 1 · BAR")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("TAB 1 · PANE\n탭 패널입니다.", {
        stripCodeFences: true,
      }),
    ).toBe("탭 패널입니다.");
  });

  it("drops FORM / INPUT / BUTTON / LINK / LIST / WIDGET chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("FORM 1 · INPUT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("INPUT 1 · FIELD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FIELD 1 · LABEL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BUTTON 1 · CTA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LINK 1 · MORE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LIST 1 · ITEMS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TABLEAU 1 · DATA")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("WIDGET 1 · CARD")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("BUTTON 1 · CTA\n버튼", {
        stripCodeFences: true,
      }),
    ).toBe("버튼");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("FORM 검증을 먼저 하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("FORM 검증을 먼저 하세요.");
    expect(looksLikeDeckCodeDebrisLine("MODAL 열기를 막음")).toBe(false);
  });

  it("binds rem/em card-like p/span frames while keeping thin accents", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<p style="border:2px solid coral;padding:1rem">rem p</p>',
      '<span style="border:2px solid tomato;padding:0.75rem">rem span</span>',
      '<p style="border:2px solid gold;padding:12px 8px">mixed p</p>',
      '<p style="border:2px solid coral;padding:0.25rem">thin rem p</p>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>rem p/i);
    expect(pinned).not.toMatch(/<span[^>]*border:2px solid tomato[^>]*>rem span/i);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid gold[^>]*>mixed p/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid coral[^>]*>thin rem p/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
