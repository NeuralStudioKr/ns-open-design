import { describe, expect, it } from "vitest";
import { looksLikeDeckCodeDebrisLine } from "../src/agent-prose-sanitize.js";

describe("chat leak / persist probe round 457 (Step keep)", () => {
  it("keeps Step labels after new arrow seps", () => {
    expect(looksLikeDeckCodeDebrisLine("Step 1: Setup")).toBe(false);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ⟶ BAR")).toBe(true);
    expect(looksLikeDeckCodeDebrisLine("FOOXYZ 1 ➢ BAR")).toBe(true);
  });
});
