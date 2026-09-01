/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckFilmstrip } from "../../src/components/DeckFilmstrip";

afterEach(() => {
  cleanup();
});

describe("DeckFilmstrip (0901-N01-C)", () => {
  const items = [
    { index: 0, label: "Cover" },
    { index: 1, label: "Body" },
    { index: 2, label: "Close" },
  ];

  it("renders numbered chips and calls onGo for clicks", () => {
    const onGo = vi.fn();
    const onReorder = vi.fn();
    render(
      <DeckFilmstrip
        items={items}
        currentSlideIndex={1}
        ariaLabel="Slides"
        slideLabelTemplate="Slide {{n}}"
        onGo={onGo}
        onReorder={onReorder}
      />,
    );
    const chips = screen.getAllByRole("button");
    expect(chips).toHaveLength(3);
    expect(chips[1]!.getAttribute("aria-current")).toBe("true");
    fireEvent.click(chips[2]!);
    expect(onGo).toHaveBeenCalledWith(2);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("fires onReorder when a chip is dropped onto another", () => {
    const onGo = vi.fn();
    const onReorder = vi.fn();
    render(
      <DeckFilmstrip
        items={items}
        currentSlideIndex={0}
        ariaLabel="Slides"
        slideLabelTemplate="Slide {{n}}"
        onGo={onGo}
        onReorder={onReorder}
      />,
    );
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      getData: vi.fn((type: string) => (type === "text/plain" ? "0" : "")),
      setData: vi.fn(),
    };
    fireEvent.dragStart(screen.getAllByRole("button")[0]!, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "0");
    act(() => {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      screen.getAllByRole("button")[2]!.dispatchEvent(event);
    });
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(onGo).not.toHaveBeenCalled();
  });

  it("ignores same-index drops", () => {
    const onReorder = vi.fn();
    render(
      <DeckFilmstrip
        items={items}
        currentSlideIndex={0}
        ariaLabel="Slides"
        slideLabelTemplate="Slide {{n}}"
        onGo={vi.fn()}
        onReorder={onReorder}
      />,
    );
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      getData: vi.fn((type: string) => (type === "text/plain" ? "1" : "")),
      setData: vi.fn(),
    };
    fireEvent.dragStart(screen.getAllByRole("button")[1]!, { dataTransfer });
    act(() => {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      screen.getAllByRole("button")[1]!.dispatchEvent(event);
    });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("blocks go and reorder while disabled", () => {
    const onGo = vi.fn();
    const onReorder = vi.fn();
    render(
      <DeckFilmstrip
        items={items}
        currentSlideIndex={0}
        ariaLabel="Slides"
        slideLabelTemplate="Slide {{n}}"
        onGo={onGo}
        onReorder={onReorder}
        disabled
      />,
    );
    const nav = screen.getByTestId("deck-filmstrip");
    expect(nav.getAttribute("aria-disabled")).toBe("true");
    const chips = screen.getAllByRole("button");
    expect(chips[0]!.hasAttribute("disabled")).toBe(true);
    fireEvent.click(chips[1]!);
    expect(onGo).not.toHaveBeenCalled();
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      getData: vi.fn((type: string) => (type === "text/plain" ? "0" : "")),
      setData: vi.fn(),
    };
    fireEvent.dragStart(chips[0]!, { dataTransfer });
    expect(dataTransfer.setData).not.toHaveBeenCalled();
  });
});
