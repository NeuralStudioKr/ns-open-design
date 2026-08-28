import { describe, expect, it } from "vitest";
import { bindFakeOutlineCardsToOfficialKit, pinDeckSlidesToFixedCanvas } from "../src/html/deck-fixed-canvas.js";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 568 (set95 combo vb+FOO)", () => {
  it("vb+vi + FOO ■ + invent-frame off", () => {
    const kit = [
      '<style data-od-official-look-css>.info-card{border:1px solid var(--border)}</style>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<span style="padding:calc(1vb + 1vi);border:1px solid navy">ok</span>',
      "</section>",
    ].join("");
    expect(bindFakeOutlineCardsToOfficialKit(kit)).toMatch(/1vb \+ 1vi[^>]*\binfo-card\b|info-card[^>]*1vb \+ 1vi/i);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ■ XYZ")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("FOOXYZ 1 ■ XYZ\n마감 완료", { stripCodeFences: true }),
    ).toBe("마감 완료");
    const flow = pinDeckSlidesToFixedCanvas(
      '<section class="slide" style="border-top:2px solid red;width:1920px;height:1080px"><div>x</div></section>',
    ).match(/<div\b[^>]*\bdata-od-slide-flow\b[^>]*>/i)?.[0] ?? "";
    expect(flow).not.toMatch(/border-top/i);
  });
});
