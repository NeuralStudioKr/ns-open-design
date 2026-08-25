import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 39 — control/dashboard chrome leftovers and % / ch card-like
 * padding for selective p/span kit bind.
 */
describe("chat leak / persist probe round 39 (AVATAR/DASHBOARD · %/ch padding)", () => {
  it("drops AVATAR / CHIP / PILL / TOGGLE / SWITCH chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("AVATAR 1 · USER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHIP 2 · TAG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PILL 1 · FILTER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TOGGLE 1 · ON")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SWITCH 1 · OFF")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("CHIP 2 · TAG\n칩 필터", {
        stripCodeFences: true,
      }),
    ).toBe("칩 필터");
  });

  it("drops SLIDER / CHECKBOX / RADIO / DROPDOWN / SELECT chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("SLIDER 1 · RANGE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHECKBOX 1 · OPT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("RADIO 1 · CHOICE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DROPDOWN 1 · MENU")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SELECT 1 · LIST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COMBOBOX 1 · PICK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PICKER 1 · DATE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CALENDAR 1 · DAY")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DATEPICKER 1 · RANGE")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("DROPDOWN 1 · MENU\n드롭다운", {
        stripCodeFences: true,
      }),
    ).toBe("드롭다운");
  });

  it("drops DASHBOARD / VIEWPORT / CANVAS / LAYER / STACK chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("MILESTONE 1 · GOAL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SCORECARD 1 · KPI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DASHBOARD 1 · VIEW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("VIEWPORT 1 · FRAME")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CANVAS 1 · DRAW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LAYER 1 · STACK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STACK 1 · V")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CLUSTER 1 · GROUP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GROUP 1 · SET")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("DASHBOARD 1 · VIEW\n대시보드", {
        stripCodeFences: true,
      }),
    ).toBe("대시보드");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("TOGGLE 상태를 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("TOGGLE 상태를 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("CANVAS 크기를 맞춤")).toBe(false);
  });

  it("binds %/ch card-like p/span frames while keeping thin accents", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<p style="border:2px solid coral;padding:4%">pct p</p>',
      '<p style="border:2px solid tomato;padding:12%">pct12</p>',
      '<span style="border:2px solid gold;padding:3ch">ch span</span>',
      '<p style="border:2px solid coral;padding:2%">thin pct</p>',
      '<span style="border:2px solid tomato;padding:1.5ch">thin ch</span>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid coral[^>]*>pct p/i);
    expect(pinned).not.toMatch(/<p[^>]*border:2px solid tomato[^>]*>pct12/i);
    expect(pinned).not.toMatch(/<span[^>]*border:2px solid gold[^>]*>ch span/i);
    expect(pinned).toMatch(/<p[^>]*border:2px solid coral[^>]*>thin pct/i);
    expect(pinned).toMatch(/<span[^>]*border:2px solid tomato[^>]*>thin ch/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
