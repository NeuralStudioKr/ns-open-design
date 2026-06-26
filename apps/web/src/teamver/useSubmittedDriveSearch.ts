import { useCallback, useState } from "react";

export function driveSearchTextMatches(
  query: string,
  ...texts: Array<string | null | undefined>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((text) => (text ?? "").toLowerCase().includes(q));
}

export function useSubmittedDriveSearch(minLength: number) {
  const [query, setQueryState] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const trimmedQuery = query.trim();
  const trimmedSubmitted = submittedQuery.trim();
  const searchMode = trimmedSubmitted.length >= minLength;

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    if (!next.trim()) setSubmittedQuery("");
  }, []);

  const submitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length >= minLength) {
      setSubmittedQuery(trimmed);
      return;
    }
    setSubmittedQuery("");
  }, [minLength, query]);

  const resetSearch = useCallback(() => {
    setQueryState("");
    setSubmittedQuery("");
  }, []);

  return {
    query,
    setQuery,
    submittedQuery: trimmedSubmitted,
    searchMode,
    submitSearch,
    resetSearch,
  };
}
