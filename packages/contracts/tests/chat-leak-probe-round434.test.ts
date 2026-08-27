import { describe, expect, it } from "vitest";
import {
  looksLikeDeckCodeDebrisLine,
  sanitizeAssistantProseForDisplay,
} from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 434 (FOO ⟹ sanitize)", () => {
  it("scrubs ⟹ chrome line", () => {
    expect(looksLikeDeckCodeDebrisLine("QUZTOKEN 5 ⟹ TOKEN")).toBe(true);
    expect(
      sanitizeAssistantProseForDisplay("QUZTOKEN 5 ⟹ TOKEN\n마감 완료", {
        stripCodeFences: true,
      }),
    ).toBe("마감 완료");
  });
});
