import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 48 — ICONBTN/SEGMENT/COMMANDPALETTE chrome leftovers and selective
 * table/td/th kit bind (svg stays unbound).
 */
describe("chat leak / persist probe round 48 (ICONBTN · SEGMENT · table)", () => {
  it("drops button-variant chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("ICONBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("GHOSTBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PRIMARYBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SECONDARYBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FABBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BACKBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("NEXTBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DANGERBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SUCCESSBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TOGGLEBTN 1 · BTN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("PRIMARYBTN 1 · BTN\n기본 버튼", {
        stripCodeFences: true,
      }),
    ).toBe("기본 버튼");
  });

  it("drops segment / dock / command-palette / field chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("SEGMENT 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SEGMENTED 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STEPPERCTRL 1 · CTRL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DOCK 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STATUSBAR 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TITLEBAR 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MENUBAR 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TOOLSTRIP 1 · BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COMMANDPALETTE 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CONTEXTMENU 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DROPZONE 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FILEPICKER 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COLORPICKER 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SEARCHFIELD 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DATEFIELD 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TAGINPUT 1 · UI")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CHIPINPUT 1 · UI")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("COMMANDPALETTE 1 · UI\n명령 팔레트", {
        stripCodeFences: true,
      }),
    ).toBe("명령 팔레트");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("SEGMENT 컨트롤을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("SEGMENT 컨트롤을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("DOCK 값을 줄임")).toBe(false);
  });

  it("binds card-like table/td/th while keeping thin accents and svg unbound", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<table style="border:2px solid coral;padding:16px"><tr><td>table card</td></tr></table>',
      '<td style="border:2px solid tomato;padding:12px">td card</td>',
      '<th style="border:2px solid gold;padding:20px">th card</th>',
      '<thead style="border:2px solid coral;padding:16px"><tr><th>thead card</th></tr></thead>',
      '<td style="border:2px solid tomato;padding:2px">thin td</td>',
      '<svg style="border:2px solid gold;padding:16px" width="40" height="40"></svg>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/<table[^>]*border:2px solid coral/i);
    expect(pinned).not.toMatch(/<td[^>]*border:2px solid tomato[^>]*>td card/i);
    expect(pinned).not.toMatch(/<th[^>]*border:2px solid gold[^>]*>th card/i);
    expect(pinned).not.toMatch(/<thead[^>]*border:2px solid coral/i);
    expect(pinned).toMatch(/<td[^>]*border:2px solid tomato[^>]*>thin td/i);
    expect(pinned).toMatch(/<svg[^>]*border:2px solid gold/i);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
