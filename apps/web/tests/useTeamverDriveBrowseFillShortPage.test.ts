/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RefObject } from "react";
import { useTeamverDriveBrowseFillShortPage } from "../src/teamver/useTeamverDriveBrowseFillShortPage";

function mountScrollRoot(short: boolean) {
  const root = document.createElement("div");
  Object.defineProperty(root, "scrollHeight", {
    value: short ? 40 : 800,
    configurable: true,
  });
  Object.defineProperty(root, "clientHeight", {
    value: 400,
    configurable: true,
  });
  document.body.appendChild(root);
  return { current: root } satisfies RefObject<HTMLDivElement>;
}

function mountZeroHeightScrollRoot() {
  const root = document.createElement("div");
  Object.defineProperty(root, "scrollHeight", {
    value: 0,
    configurable: true,
  });
  Object.defineProperty(root, "clientHeight", {
    value: 0,
    configurable: true,
  });
  document.body.appendChild(root);
  return { current: root } satisfies RefObject<HTMLDivElement>;
}

async function flushRaf() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

describe("useTeamverDriveBrowseFillShortPage", () => {
  it("prefetches when the list does not fill the scroll viewport", async () => {
    const onLoadMore = vi.fn();
    const rootRef = mountScrollRoot(true);

    renderHook(() =>
      useTeamverDriveBrowseFillShortPage({
        enabled: true,
        hasMore: true,
        loading: false,
        rootRef,
        contentKey: "1:0:0",
        resetKey: "scope-a",
        onLoadMore,
        maxChase: 3,
      }),
    );

    await flushRaf();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rootRef.current?.remove();
  });

  it("does not prefetch when content already overflows the viewport", async () => {
    const onLoadMore = vi.fn();
    const rootRef = mountScrollRoot(false);

    renderHook(() =>
      useTeamverDriveBrowseFillShortPage({
        enabled: true,
        hasMore: true,
        loading: false,
        rootRef,
        contentKey: "1:0:0",
        resetKey: "scope-b",
        onLoadMore,
      }),
    );

    await flushRaf();
    expect(onLoadMore).not.toHaveBeenCalled();
    rootRef.current?.remove();
  });

  it("waits until the scroll viewport has a measurable height", async () => {
    const onLoadMore = vi.fn();
    const rootRef = mountZeroHeightScrollRoot();

    renderHook(() =>
      useTeamverDriveBrowseFillShortPage({
        enabled: true,
        hasMore: true,
        loading: false,
        rootRef,
        contentKey: "0:0:0",
        resetKey: "scope-zero",
        onLoadMore,
      }),
    );

    await flushRaf();
    expect(onLoadMore).not.toHaveBeenCalled();
    rootRef.current?.remove();
  });

  it("respects maxChase across contentKey updates", async () => {
    const onLoadMore = vi.fn();
    const rootRef = mountScrollRoot(true);

    const { rerender } = renderHook(
      ({ contentKey }: { contentKey: string }) =>
        useTeamverDriveBrowseFillShortPage({
          enabled: true,
          hasMore: true,
          loading: false,
          rootRef,
          contentKey,
          resetKey: "scope-c",
          onLoadMore,
          maxChase: 2,
        }),
      { initialProps: { contentKey: "0:0:0" } },
    );

    await flushRaf();
    rerender({ contentKey: "1:0:0" });
    await flushRaf();
    rerender({ contentKey: "2:0:0" });
    await flushRaf();

    expect(onLoadMore).toHaveBeenCalledTimes(2);
    rootRef.current?.remove();
  });
});
