import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 871 (set158 closure)", () => {
  it("min/max/clamp + FOO + invent-frame off", () => {
    const kit = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:min(calc(7px * 2), calc(8px * 2));border:1px solid navy">a</span>',
      '<span style="padding:max(calc(7px * 2), calc(5px * 2));border:1px solid teal">b</span>',
      '<span style="padding:clamp(calc(4px * 1), calc(7px * 2), calc(9px * 2));border:1px solid purple">c</span>',
      '<p style="padding:min(calc(5px * 2), calc(4px * 2));border:1px solid gray">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kit);
    expect(bound).toMatch(/min\(calc\(7px \* 2\), calc\(8px \* 2\)\)[^>]*\binfo-card\b|info-card[^>]*min\(calc\(7px \* 2\), calc\(8px \* 2\)\)/i);
    expect(bound).toMatch(/max\(calc\(7px \* 2\), calc\(5px \* 2\)\)[^>]*\binfo-card\b|info-card[^>]*max\(calc\(7px \* 2\), calc\(5px \* 2\)\)/i);
    expect(bound).toMatch(/clamp\(calc\(4px \* 1\), calc\(7px \* 2\), calc\(9px \* 2\)\)[^>]*\binfo-card\b|info-card[^>]*clamp\(calc\(4px \* 1\), calc\(7px \* 2\), calc\(9px \* 2\)\)/i);
    expect(bound).not.toMatch(/min\(calc\(5px \* 2\), calc\(4px \* 2\)\)[^>]*\binfo-card\b/i);
    for (const g of ["☀", "☁", "☂", "☃", "☄", "⌂"]) {
      expect(looksLikeDeckCodeDebrisLine(`FOOXYZ 1 ${g} XYZ`)).toBe(true);
    }
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ☀ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;border-top:1px solid blue;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow|border-top/i);
  });
});
