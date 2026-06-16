import { describe, expect, it } from "vitest";
import { resolveTeamverMainApiBaseUrl } from "../src/teamver/designApiBase";

describe("resolveTeamverMainApiBaseUrl", () => {
  it("defaults to prod Main BE API on SSR", () => {
    expect(resolveTeamverMainApiBaseUrl()).toBe("https://api.teamver.com");
  });
});
