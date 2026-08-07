"use client";

import { useEffect } from "react";

import { initTeamverDesignSentry } from "./initClient";

/** Mount once from root layout — static-export safe browser Sentry bootstrap. */
export function TeamverSentryBootstrap(): null {
  useEffect(() => {
    initTeamverDesignSentry();
  }, []);
  return null;
}
