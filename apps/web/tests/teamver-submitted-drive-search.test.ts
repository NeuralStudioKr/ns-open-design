// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { driveSearchTextMatches, useSubmittedDriveSearch } from "../src/teamver/useSubmittedDriveSearch";

describe("useSubmittedDriveSearch", () => {
  it("keeps browse mode until search is submitted", () => {
    const { result } = renderHook(() => useSubmittedDriveSearch(2));

    act(() => result.current.setQuery("de"));
    expect(result.current.searchMode).toBe(false);

    act(() => result.current.submitSearch());
    expect(result.current.searchMode).toBe(true);
    expect(result.current.submittedQuery).toBe("de");
  });

  it("clears submitted query when input is cleared", () => {
    const { result } = renderHook(() => useSubmittedDriveSearch(2));

    act(() => {
      result.current.setQuery("deck");
      result.current.submitSearch();
    });
    act(() => result.current.setQuery(""));
    expect(result.current.searchMode).toBe(false);
    expect(result.current.submittedQuery).toBe("");
  });

  it("drops server search when submit is below min length", () => {
    const { result } = renderHook(() => useSubmittedDriveSearch(2));

    act(() => {
      result.current.setQuery("deck");
      result.current.submitSearch();
    });
    act(() => result.current.setQuery("d"));
    act(() => result.current.submitSearch());
    expect(result.current.searchMode).toBe(false);
  });
});

describe("driveSearchTextMatches", () => {
  it("matches case-insensitive substrings across provided fields", () => {
    expect(driveSearchTextMatches("export", "Team / Exports", "팀 드라이브 폴더")).toBe(true);
    expect(driveSearchTextMatches("export", "Assets", "개인 드라이브")).toBe(false);
    expect(driveSearchTextMatches("", "Assets")).toBe(true);
  });
});
