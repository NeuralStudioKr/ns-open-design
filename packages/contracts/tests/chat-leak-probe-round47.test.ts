import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";
import { pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";

/**
 * Round 47 — TOC/social/btn chrome leftovers + remaining CSS named-color
 * invent frames (aliceblue / chartreuse / darkgray …).
 */
describe("chat leak / persist probe round 47 (TOCENTRY · HASHTAG · aliceblue)", () => {
  it("drops typography / break chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("WIDOW 1 · LINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ORPHAN 1 · LINE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("INDENT 1 · FIRST")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("OUTDENT 1 · HANG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TABSTOP 1 · MARK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SECTIONBREAK 1 · RULE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PAGEBREAK 1 · RULE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SOFTBREAK 1 · BR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("ANNOTATIONBOX 1 · NOTE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CALLOUTARROW 1 · POINT")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("WIDOW 1 · LINE\n과부 행", {
        stripCodeFences: true,
      }),
    ).toBe("과부 행");
  });

  it("drops TOC / QR / social / presence chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("TOCENTRY 1 · ROW")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TOCPAGE 1 · NUM")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("LEADERDOTS 1 · TOC")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CROSSREF 1 · LINK")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HYPERLINK 1 · URL")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("QRCODE 1 · CODE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("BARCODE 1 · CODE")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("HASHTAG 1 · TAG")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MENTION 1 · USER")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TOKENCHIP 1 · CHIP")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("UNREAD 1 · DOT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("PRESENCE 1 · DOT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("STATUSDOT 1 · DOT")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("TYPING 1 · INDICATOR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("READRECEIPT 1 · CHECK")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("QRCODE 1 · CODE\nQR 코드", {
        stripCodeFences: true,
      }),
    ).toBe("QR 코드");
  });

  it("drops toolbar button chrome", () => {
    expect(looksLikeDeckCodeDebrisLine("RETRYBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("CLOSEBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DOWNLOADBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SHAREBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("EXPORTBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SAVEBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("EDITBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("DELETEBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("MENUBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("SEARCHBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FILTERBTN 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("EXPANDALL 1 · BTN")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("COLLAPSEALL 1 · BTN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("DOWNLOADBTN 1 · BTN\n다운로드", {
        stripCodeFences: true,
      }),
    ).toBe("다운로드");
  });

  it("keeps legitimate prose mentioning those words", () => {
    expect(
      sanitizeAssistantProseForDisplay("QRCODE 영역을 먼저 확인하세요.", {
        stripCodeFences: true,
      }),
    ).toBe("QRCODE 영역을 먼저 확인하세요.");
    expect(looksLikeDeckCodeDebrisLine("HASHTAG 목록을 정리함")).toBe(false);
  });

  it("binds remaining CSS named-color invent frames to kit cards", () => {
    const html = [
      '<section class="slide" style="width:1920px;height:1080px">',
      '<div style="border:2px solid aliceblue;padding:16px">alice</div>',
      '<div style="border:2px solid chartreuse;padding:16px">chartreuse</div>',
      '<div style="border:2px solid darkgray;padding:16px">darkgray</div>',
      '<div style="border:2px solid forestgreen;padding:16px">forest</div>',
      '<div style="border:2px solid lemonchiffon;padding:16px">lemon</div>',
      '<div style="border:2px solid powderblue;padding:16px">powder</div>',
      '<div style="border:2px solid whitesmoke;padding:16px">smoke</div>',
      '<div style="border:1px solid var(--border);padding:16px">kit</div>',
      "</section>",
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
    ].join("");
    const pinned = pinDeckSlidesToFixedCanvas(html);
    expect(pinned).not.toMatch(/border:2px solid aliceblue/i);
    expect(pinned).not.toMatch(/border:2px solid chartreuse/i);
    expect(pinned).not.toMatch(/border:2px solid darkgray/i);
    expect(pinned).not.toMatch(/border:2px solid forestgreen/i);
    expect(pinned).not.toMatch(/border:2px solid lemonchiffon/i);
    expect(pinned).not.toMatch(/border:2px solid powderblue/i);
    expect(pinned).not.toMatch(/border:2px solid whitesmoke/i);
    expect(pinned).toMatch(/border:1px solid var\(--border\)/);
    expect(pinned.match(/class="[^"]*\binfo-card\b/g)?.length).toBeGreaterThanOrEqual(7);
  });
});
