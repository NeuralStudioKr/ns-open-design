/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeckFilmstrip,
  filmstripSlotToReorderIndex,
  scrollFilmstripChipIntoView,
} from "../../src/components/DeckFilmstrip";

afterEach(() => {
  cleanup();
});

describe("filmstripSlotToReorderIndex (0901-N01-C2)", () => {
  it("maps insert-before slots to splice toIndex", () => {
    expect(filmstripSlotToReorderIndex(0, 0, 3)).toBeNull();
    expect(filmstripSlotToReorderIndex(0, 1, 3)).toBeNull();
    expect(filmstripSlotToReorderIndex(0, 2, 3)).toBe(1);
    expect(filmstripSlotToReorderIndex(0, 3, 3)).toBe(2);
    expect(filmstripSlotToReorderIndex(2, 0, 3)).toBe(0);
    expect(filmstripSlotToReorderIndex(2, 1, 3)).toBe(1);
    expect(filmstripSlotToReorderIndex(2, 2, 3)).toBeNull();
    expect(filmstripSlotToReorderIndex(2, 3, 3)).toBeNull();
    expect(filmstripSlotToReorderIndex(1, 0, 3)).toBe(0);
    expect(filmstripSlotToReorderIndex(1, 3, 3)).toBe(2);
    expect(filmstripSlotToReorderIndex(0, 4, 3)).toBeNull();
    expect(filmstripSlotToReorderIndex(0, 2, 1)).toBeNull();
  });
});

describe("scrollFilmstripChipIntoView (0901-N01-C2)", () => {
  it("adjusts nav.scrollLeft only when the chip overflows horizontally", () => {
    const nav = {
      getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 40, width: 100, height: 40 }),
      scrollLeft: 0,
    } as unknown as HTMLElement;
    const chipRight = {
      getBoundingClientRect: () => ({ left: 90, right: 130, top: 0, bottom: 28, width: 40, height: 28 }),
    } as unknown as HTMLElement;
    scrollFilmstripChipIntoView(nav, chipRight, 8);
    expect(nav.scrollLeft).toBe(38);

    nav.scrollLeft = 50;
    const chipLeft = {
      getBoundingClientRect: () => ({ left: -20, right: 20, top: 0, bottom: 28, width: 40, height: 28 }),
    } as unknown as HTMLElement;
    scrollFilmstripChipIntoView(nav, chipLeft, 8);
    expect(nav.scrollLeft).toBe(22);
  });
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
    expect(chips[0]!.getAttribute("aria-label")).toBe("Slide 1 · Cover");
    expect(chips[1]!.getAttribute("aria-label")).toBe("Slide 2 · Body");
    expect(chips[2]!.getAttribute("aria-label")).toBe("Slide 3 · Close");
    expect(chips[0]!.textContent).toBe("1Cover");
    expect(chips[1]!.textContent).toBe("2Body");
    expect(chips[1]!.getAttribute("aria-current")).toBe("true");
    fireEvent.click(chips[2]!);
    expect(onGo).toHaveBeenCalledWith(2);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("fires onReorder when a chip is dropped onto another (right half → after)", () => {
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
    const target = screen.getAllByRole("button")[2]!;
    Object.defineProperty(target, "getBoundingClientRect", {
      value: () => ({ left: 200, width: 40, right: 240, top: 0, bottom: 28, height: 28, x: 200, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.dragStart(screen.getAllByRole("button")[0]!, { dataTransfer });
    act(() => {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      Object.defineProperty(event, "clientX", { value: 230 });
      target.dispatchEvent(event);
    });
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(onGo).not.toHaveBeenCalled();
  });

  it("drops on left half of a chip insert before it", () => {
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
      getData: vi.fn((type: string) => (type === "text/plain" ? "0" : "")),
      setData: vi.fn(),
    };
    const target = screen.getAllByRole("button")[2]!;
    Object.defineProperty(target, "getBoundingClientRect", {
      value: () => ({ left: 200, width: 40, right: 240, top: 0, bottom: 28, height: 28, x: 200, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.dragStart(screen.getAllByRole("button")[0]!, { dataTransfer });
    act(() => {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      Object.defineProperty(event, "clientX", { value: 205 });
      target.dispatchEvent(event);
    });
    // slot=2 → toIndex 1
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it("shows insert-before marker on left-half dragOver", () => {
    render(
      <DeckFilmstrip
        items={items}
        currentSlideIndex={0}
        ariaLabel="Slides"
        slideLabelTemplate="Slide {{n}}"
        onGo={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      getData: vi.fn(),
      setData: vi.fn(),
    };
    const chips = screen.getAllByRole("button");
    Object.defineProperty(chips[2]!, "getBoundingClientRect", {
      value: () => ({ left: 200, width: 40, right: 240, top: 0, bottom: 28, height: 28, x: 200, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.dragStart(chips[0]!, { dataTransfer });
    act(() => {
      const event = new Event("dragover", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      Object.defineProperty(event, "clientX", { value: 205 });
      chips[2]!.dispatchEvent(event);
    });
    const markers = document.querySelectorAll("[data-drop-before='true']");
    expect(markers.length).toBe(1);
    expect(markers[0]!.classList.contains("is-drop-before")).toBe(true);
  });

  it("scrolls the filmstrip horizontally when the current index changes", () => {
    const { rerender } = render(
      <DeckFilmstrip
        items={items}
        currentSlideIndex={0}
        ariaLabel="Slides"
        slideLabelTemplate="Slide {{n}}"
        onGo={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const nav = screen.getByTestId("deck-filmstrip");
    Object.defineProperty(nav, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, right: 80, top: 0, bottom: 40, width: 80, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    });
    const chips = screen.getAllByRole("button");
    Object.defineProperty(chips[2]!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 120, right: 160, top: 0, bottom: 28, width: 40, height: 28, x: 120, y: 0, toJSON: () => ({}) }),
    });
    Object.defineProperty(nav, "scrollLeft", { configurable: true, writable: true, value: 0 });

    rerender(
      <DeckFilmstrip
        items={items}
        currentSlideIndex={2}
        ariaLabel="Slides"
        slideLabelTemplate="Slide {{n}}"
        onGo={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    expect((nav as HTMLElement).scrollLeft).toBeGreaterThan(0);
    expect(screen.getByTestId("deck-filmstrip-current").textContent).toBe("3Close");
  });

  it("suppresses the synthetic click after a drag gesture", () => {
    const onGo = vi.fn();
    render(
      <DeckFilmstrip
        items={items}
        currentSlideIndex={0}
        ariaLabel="Slides"
        slideLabelTemplate="Slide {{n}}"
        onGo={onGo}
        onReorder={vi.fn()}
      />,
    );
    const chips = screen.getAllByRole("button");
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      getData: vi.fn(),
      setData: vi.fn(),
    };
    fireEvent.dragStart(chips[1]!, { dataTransfer });
    fireEvent.dragEnd(chips[1]!);
    fireEvent.click(chips[1]!);
    expect(onGo).not.toHaveBeenCalled();
    fireEvent.click(chips[1]!);
    expect(onGo).toHaveBeenCalledWith(1);
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
    const target = screen.getAllByRole("button")[1]!;
    Object.defineProperty(target, "getBoundingClientRect", {
      value: () => ({ left: 100, width: 40, right: 140, top: 0, bottom: 28, height: 28, x: 100, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.dragStart(target, { dataTransfer });
    act(() => {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      Object.defineProperty(event, "clientX", { value: 105 });
      target.dispatchEvent(event);
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

  it("hides a title when the label is only the page number", () => {
    render(
      <DeckFilmstrip
        items={[{ index: 0, label: "1" }, { index: 1, label: "Agenda" }]}
        currentSlideIndex={0}
        ariaLabel="Pages"
        slideLabelTemplate="Page {{n}}"
        onGo={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    const chips = screen.getAllByRole("button");
    expect(chips[0]!.getAttribute("aria-label")).toBe("Page 1");
    expect(chips[0]!.querySelector(".deck-filmstrip__title")).toBeNull();
    expect(chips[1]!.getAttribute("aria-label")).toBe("Page 2 · Agenda");
    expect(chips[1]!.textContent).toBe("2Agenda");
  });
});
