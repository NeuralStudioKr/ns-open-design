import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 41 — SPLIT/SURFACE chrome leftovers, cqw/cqh card-like padding,
 * and selective details/summary/label/output kit bind.
 */
describe("chat leak / persist probe round 41 (SPLIT/SURFACE · cqw · details)", () => {
  it("drops SPLIT / SPLITTER / RESIZER / HANDLE chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("SPLIT 1 · PANE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SPLITTER 1 · DRAG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RESIZER 1 · HANDLE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HANDLE 1 · GRAB")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SCROLLBAR 1 · TRACK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("OVERFLOW 1 · HIDE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MASK 1 · FADE")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("SPLIT 1 · PANE\n분할 레이아웃", {
        stripCodeFences: true,
      }),
    ).toBe("분할 레이아웃");
  });

  it("drops GRADIENT / GLASS / SHADOW / SURFACE / PAPER chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("GRADIENT 1 · FILL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PATTERN 1 · BG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TEXTURE 1 · SURF")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("NOISE 1 · GRAIN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BLUR 1 · GLASS")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GLASS 1 · PANEL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FROST 1 · OVER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SHADOW 1 · ELEV")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ELEVATION 1 · CARD")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SURFACE 1 · PAPER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PAPER 1 · SHEET")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("INSET 1 · WELL")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("SURFACE 1 · PAPER\n서피스", {
        stripCodeFences: true,
      }),
    ).toBe("서피스");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("SPLIT 뷰를 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("SPLIT 뷰를 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("SHADOW 값을 줄임")).toBe(false);
  });

  it("binds cqw/cqh card-like p frames while keeping thin accents", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<p style="border:2px solid coral;padding:2cqw">cqw p</p>',
      '<p style="border:2px solid tomato;padding:3cqh">cqh p</p>',
      '<span style="border:2px solid gold;padding:2cqi">cqi span</span>',
      '<p style="border:2px solid coral;padding:1cqw">thin cqw</p>',
      '<p style="border:2px solid tomato;padding:1.5cqh">thin cqh</p>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>cqw p/i);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid tomato[^>]*>cqh p/i);
    expect(pinned).not.toMatch(/<span[^>]*border:2px solid gold[^>]*>cqi span/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid coral[^>]*>thin cqw/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid tomato[^>]*>thin cqh/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("binds card-like details/summary/label while keeping thin accents and plain strong", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<details style="border:2px solid coral;padding:16px">details card</details>',
      '<summary style="border:2px solid tomato;padding:12px">summary card</summary>',
      '<label style="border:2px solid gold;padding:20px">label card</label>',
      '<details style="border:2px solid coral;padding:2px">thin details</details>',
      '<strong style="border:2px solid tomato;padding:16px">keep strong</strong>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<details[^>]*border:2px solid coral[^>]*>details card/i);
    expect(pinned).not.toMatch(/<summary[^>]*border:2px solid tomato[^>]*>summary card/i);
    expect(pinned).not.toMatch(/<label[^>]*border:2px solid gold[^>]*>label card/i);
    expect(pinned).toMatch(/<details[^>]*border:2px solid coral[^>]*>thin details/i);
    expect(pinned).toMatch(/<strong[^>]*border:2px solid tomato[^>]*>keep strong/i);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
