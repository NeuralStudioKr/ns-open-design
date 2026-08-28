import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 617 (set99 combo ch+cq)", () => {
  it("ch+cqw + FOO ⬡ + invent-frame off", () => {
    const kit = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1ch + 1cqw);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(kit)).toMatch(/1ch \+ 1cqw[^>]*\binfo-card\b|info-card[^>]*1ch \+ 1cqw/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ⬡ XYZ")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ⬡ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="box-shadow:0 0 0 1px red;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/box-shadow/i);
  });
});
