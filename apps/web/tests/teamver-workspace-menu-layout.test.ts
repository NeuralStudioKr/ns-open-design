import { describe, expect, it } from "vitest";

import { computeWorkspaceMenuLayout } from "../src/teamver/teamverWorkspaceMenuLayout";

describe("computeWorkspaceMenuLayout", () => {
  it("anchors below trigger left edge with viewport clamping", () => {
    const layout = computeWorkspaceMenuLayout(
      { left: 64, right: 220, bottom: 48, width: 156 },
      { width: 390, height: 844 },
    );

    expect(layout.top).toBe(55);
    expect(layout.left).toBe(64);
    expect(layout.width).toBe(240);
    expect(layout.maxHeight).toBeGreaterThan(160);
  });

  it("keeps menu inside viewport when trigger sits near the left rail", () => {
    const layout = computeWorkspaceMenuLayout(
      { left: 58, right: 180, bottom: 40, width: 122 },
      { width: 320, height: 568 },
      { margin: 12, minWidth: 240 },
    );

    expect(layout.left).toBeGreaterThanOrEqual(12);
    expect(layout.left + layout.width).toBeLessThanOrEqual(320 - 12);
  });

  it("shifts menu left when it would overflow the right edge", () => {
    const layout = computeWorkspaceMenuLayout(
      { left: 250, right: 360, bottom: 40, top: 8, width: 110 },
      { width: 390, height: 700 },
      { minWidth: 240 },
    );

    expect(layout.left + layout.width).toBeLessThanOrEqual(378);
    expect(layout.left).toBeLessThan(250);
  });

  it("opens upward when there is more room above the trigger", () => {
    const layout = computeWorkspaceMenuLayout(
      { left: 72, right: 220, bottom: 520, top: 480, width: 148 },
      { width: 390, height: 568 },
      { minHeight: 220 },
    );

    expect(layout.bottom).toBeDefined();
    expect(layout.top).toBeUndefined();
    expect(layout.maxHeight).toBeGreaterThan(160);
  });
});
