import { isTeamverEmbedMode } from "./designApiBase";
import { navigate, parseRoute, type Route } from "../router";

const BOUNDARY_STATE_KEY = "teamverEmbedHistoryBoundary";

function isEmbedTrapRoute(route: Route): boolean {
  return route.kind === "home" && route.view === "home";
}

/**
 * Embed 모드에서 브라우저 뒤로가기가 Main FE(/thread)로 빠지는 것을 완화한다.
 * - 진입 시 same-document history 엔트리를 하나 더 쌓아 cross-origin back 을 same-document popstate 로 전환
 * - 홈/프로젝트 목록에서 back 시 Design 안에 머무름 (Teamver 링크로만 이탈)
 */
export function installTeamverEmbedHistoryBoundary(): () => void {
  if (!isTeamverEmbedMode() || typeof window === "undefined") {
    return () => {};
  }

  window.history.pushState(
    { [BOUNDARY_STATE_KEY]: true },
    "",
    window.location.href,
  );

  const onPopState = () => {
    queueMicrotask(() => {
      if (!isTeamverEmbedMode()) return;
      const route = parseRoute(window.location.pathname);
      if (!isEmbedTrapRoute(route)) return;

      window.history.pushState(
        { [BOUNDARY_STATE_KEY]: true },
        "",
        window.location.href,
      );
      navigate({ kind: "home", view: "home" }, { replace: true });
    });
  };

  window.addEventListener("popstate", onPopState);
  return () => window.removeEventListener("popstate", onPopState);
}
