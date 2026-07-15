// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useTeamverDriveModalFocusTrap } from "../src/teamver/useTeamverDriveModalFocusTrap";

function TrapHarness({ open }: { open: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useTeamverDriveModalFocusTrap(open, ref);
  return (
    <div ref={ref} role="dialog" tabIndex={-1} data-testid="trap-root">
      <button type="button" data-testid="first">First</button>
      <button type="button" data-testid="last" data-teamver-drive-autofocus="true">
        Last
      </button>
    </div>
  );
}

describe("useTeamverDriveModalFocusTrap", () => {
  afterEach(() => {
    cleanup();
  });

  it("focuses the autofocus control when open", async () => {
    render(<TrapHarness open />);
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId("last"));
    });
  });

  it("cycles Tab from last back to first", async () => {
    render(<TrapHarness open />);
    const first = screen.getByTestId("first");
    const last = screen.getByTestId("last");
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(last);
    });

    last.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(first);
  });
});
