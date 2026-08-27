import { describe, expect, it } from "vitest";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 404 (Step keep after ： seps)", () => {
  it("keeps mixed-case Step labels", () => {
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(looksLikeDeckCodeDebrisLine("Step 9: Finish")).toBe(false);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ： BAR")).toBe(true);
  });
});
