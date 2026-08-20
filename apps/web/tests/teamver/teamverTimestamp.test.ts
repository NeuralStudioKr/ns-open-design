import { describe, expect, it } from "vitest";
import {
  formatTeamverTimestampKst,
  parseTeamverTimestampMs,
} from "../../src/teamver/teamverTimestamp";

describe("parseTeamverTimestampMs", () => {
  it("treats naive ISO as UTC (Main Canvas often omits Z)", () => {
    const withZ = parseTeamverTimestampMs("2026-08-05T07:11:00.000Z");
    const naive = parseTeamverTimestampMs("2026-08-05T07:11:00");
    expect(naive).toBe(withZ);
  });

  it("coerces unix seconds to ms", () => {
    expect(parseTeamverTimestampMs(1_725_000_000)).toBe(1_725_000_000_000);
    expect(parseTeamverTimestampMs("1725000000")).toBe(1_725_000_000_000);
  });

  it("keeps millisecond epoch numbers", () => {
    expect(parseTeamverTimestampMs(1_725_000_000_000)).toBe(1_725_000_000_000);
  });

  it("accepts Date instances", () => {
    const d = new Date("2026-08-05T07:11:00.000Z");
    expect(parseTeamverTimestampMs(d)).toBe(d.getTime());
  });
});

describe("formatTeamverTimestampKst", () => {
  it("formats UTC instant in Asia/Seoul", () => {
    const label = formatTeamverTimestampKst("2026-08-05T07:11:00.000Z", "ko");
    expect(label).toContain("2026");
    expect(label).toMatch(/오후\s*4:11|16:11/);
  });

  it("formats naive UTC the same as Zulu", () => {
    const a = formatTeamverTimestampKst("2026-08-05T07:11:00", "ko");
    const b = formatTeamverTimestampKst("2026-08-05T07:11:00Z", "ko");
    expect(a).toBe(b);
  });

  it("returns null for revision ids", () => {
    expect(formatTeamverTimestampKst("rev_abc123")).toBeNull();
    expect(formatTeamverTimestampKst("artifact-uuid-not-a-date")).toBeNull();
  });
});
