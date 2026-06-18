// Map known AMR (vela) model-probe failure messages to a stable `reason`
// label so the `/api/amr/models` route can:
//
//   1. Return a graceful 503 (`available:false`) instead of 500 when the
//      vela CLI / runtime definition is missing — common in Teamver Design
//      staging containers that ship without the AMR bundle.
//   2. Tag the structured `console.warn` so CloudWatch log metric filters
//      can tell "vela not installed in this container" apart from real
//      runtime bugs (filesystem, JSON parse, vela returning malformed
//      catalogue, …) without scraping free-form messages.
//
// Returns null when the message is unknown — the caller MUST fall through
// to a generic 500 in that case so unexpected probe failures still surface.
export function classifyAmrModelProbeError(message: string): string | null {
  if (/AMR vela binary could not be resolved/i.test(message)) {
    return 'vela_binary_missing';
  }
  if (/AMR runtime definition is missing/i.test(message)) {
    return 'runtime_def_missing';
  }
  return null;
}
