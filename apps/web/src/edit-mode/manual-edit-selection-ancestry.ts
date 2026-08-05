/** Drop selected ids that sit inside another selected ancestor in the DOM tree. */
export function pruneNestedManualEditSelectionIds(
  ids: readonly string[],
  isDescendant: (childId: string, ancestorId: string) => boolean,
): string[] {
  if (ids.length < 2) return [...ids];
  return ids.filter(
    (id) => !ids.some((otherId) => otherId !== id && isDescendant(id, otherId)),
  );
}

/** Group geometry applies only to root targets — descendants move with their ancestor. */
export function filterRootTargetsForGroupGeometry<T extends { id: string }>(
  targets: readonly T[],
  isDescendant: (childId: string, ancestorId: string) => boolean,
): T[] {
  if (targets.length < 2) return [...targets];
  return targets.filter(
    (target) => !targets.some(
      (other) => other.id !== target.id && isDescendant(target.id, other.id),
    ),
  );
}
