import * as Sentry from "@sentry/react";

import { resolveSentryEnvironment } from "./environment";
import { SENTRY_IGNORE_ERRORS, shouldDropSentryEvent } from "./eventFilters";

/** neuralstudio / teamver-design — public DSN (override via NEXT_PUBLIC_SENTRY_DSN). */
const DEFAULT_DSN =
  "https://2f2dd26c93488397083e6f3a965caaa6@o4511844488708096.ingest.us.sentry.io/4511868486942720";

let initialized = false;

/**
 * Browser-only Sentry init for Teamver Design static export (`apps/web/out`).
 * Safe to call multiple times (no-op after first).
 */
export function initTeamverDesignSentry(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;

  const dsn =
    (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() : undefined) ||
    DEFAULT_DSN;
  if (!dsn) return;

  initialized = true;
  Sentry.init({
    dsn,
    environment: resolveSentryEnvironment(),
    tracesSampleRate:
      typeof process !== "undefined" && process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    beforeSend(event) {
      if (shouldDropSentryEvent(event as unknown as Record<string, unknown>)) {
        return null;
      }
      return event;
    },
  });
}

export function captureTeamverDesignException(error: unknown): void {
  initTeamverDesignSentry();
  Sentry.captureException(error);
}
