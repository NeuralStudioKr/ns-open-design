/**
 * Pipe one leg of the AMR/Vela proxy with an explicit source-error guard.
 *
 * `.pipe()` does not forward a source `error` event to the destination. Without
 * a source listener, a mid-stream upstream reset or client upload abort can
 * bubble as an unhandled exception and take down the daemon.
 */
export function pipeVelaProxyStreamWithGuard(
  source: NodeJS.ReadableStream,
  dest: NodeJS.WritableStream,
  onSourceError: (err: Error) => void,
): void {
  source.on('error', onSourceError);
  source.pipe(dest);
}
