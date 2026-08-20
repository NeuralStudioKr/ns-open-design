/**
 * Teamver Slide: first Stop on a hung fill / top-up must salvage, not cancel.
 *
 * Users hit Stop after a 3+ minute next-page hang and then paste
 * `CANCELED_BY_USER` / "Stopped by user". That stamp skips persist +
 * append top-up. Fill / expansion turns should abort upstream and
 * finalize through onDone instead.
 *
 * Hard cancel (CANCELED_BY_USER) stays for: send-now supersede, a
 * second Stop after salvage already armed, and ordinary edit turns.
 */

export function shouldSalvageSlideUserStop(input: {
  slideOnlyMvp: boolean;
  superseded: boolean;
  templateCloneContentFill: boolean;
  slideCountTopUp: boolean;
  abortControllerAlive: boolean;
}): boolean {
  return (
    input.slideOnlyMvp
    && !input.superseded
    && input.abortControllerAlive
    && (input.templateCloneContentFill || input.slideCountTopUp)
  );
}
