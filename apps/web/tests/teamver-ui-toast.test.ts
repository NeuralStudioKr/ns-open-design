// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  showTeamverUiToast,
  subscribeTeamverUiToast,
  TEAMVER_UI_TOAST_EVENT,
} from "../src/teamver/teamverUiToast";

describe("teamverUiToast", () => {
  it("dispatches a friendly toast event for App to render", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeTeamverUiToast(handler);
    showTeamverUiToast({
      message: "로그인 상태를 맞추고 있습니다. 잠시만 기다려 주세요.",
      tone: "loading",
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "로그인 상태를 맞추고 있습니다. 잠시만 기다려 주세요.",
        tone: "loading",
        role: "status",
      }),
    );
    unsubscribe();
  });

  it("ignores blank messages", () => {
    const spy = vi.fn();
    window.addEventListener(TEAMVER_UI_TOAST_EVENT, spy);
    showTeamverUiToast({ message: "   " });
    expect(spy).not.toHaveBeenCalled();
    window.removeEventListener(TEAMVER_UI_TOAST_EVENT, spy);
  });
});
