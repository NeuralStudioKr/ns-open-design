import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 796 (set143 closure)", () => {
  it("neg/paren calc + FOO + invent-frame off", () => {
    const kit = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(10px + 5px - 2px);border:1px solid navy">a</span>',
      '<span style="padding:calc((10px + 6px) - 2px);border:1px solid teal">b</span>',
      '<span style="padding:calc((0.5rem + 8px) - 2px);border:1px solid purple">c</span>',
      '<p style="padding:calc(8px + 3px - 2px);border:1px solid gray">thin</p>',
      "</section>",
    ].join("");
    const bound = bindFakeOutlineCardsToOfficialKit(kit);
    expect(bound).toMatch(/10px \+ 5px - 2px[^>]*\binfo-card\b|info-card[^>]*10px \+ 5px - 2px/i);
    expect(bound).toMatch(/\(10px \+ 6px\) - 2px[^>]*\binfo-card\b|info-card[^>]*\(10px \+ 6px\) - 2px/i);
    expect(bound).toMatch(/\(0\.5rem \+ 8px\) - 2px[^>]*\binfo-card\b|info-card[^>]*\(0\.5rem \+ 8px\) - 2px/i);
    expect(bound).not.toMatch(/8px \+ 3px - 2px[^>]*\binfo-card\b/i);
    for (const g of ["☏", "☎", "♮", "♯", "♪"]) {
      expect(looksLikeDeckCodeDebrisLine(`FOOXYZ 1 ${g} XYZ`)).toBe(true);
    }
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ☏ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;border-top:1px solid blue;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow|border-top/i);
  });
});
