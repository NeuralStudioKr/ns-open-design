export type EmbedRunTrackingRefs = {
  activeRunIds: { current: Set<string> };
  notifiedBackgroundRunIds: { current: Set<string> };
  wasActiveRun: { current: boolean };
  activeRunSignature: { current: string };
};

/** Drop cross-workspace/session background-run toast + list-refresh bookkeeping. */
export function resetEmbedRunTrackingRefs(refs: EmbedRunTrackingRefs): void {
  refs.activeRunIds.current.clear();
  refs.notifiedBackgroundRunIds.current.clear();
  refs.wasActiveRun.current = false;
  refs.activeRunSignature.current = "";
}
