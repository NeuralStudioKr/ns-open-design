// @vitest-environment jsdom
//
// Embed-mode skips for the *write* / mutation AMR endpoints
// (start/cancel/logout). The read-only polls — `fetchAmrModels`,
// `fetchVelaLoginStatus` — are already covered by
// tests/providers/daemon-amr-models.test.ts; this file fills the gap for
// the lifecycle helpers so an embed UI cannot accidentally trigger
// vela-spawn round trips.
import { afterEach, describe, expect, it, vi } from "vitest";

import * as designApiBase from "../src/teamver/designApiBase";

vi.mock("../src/teamver/designApiBase", () => ({
  isTeamverEmbedMode: vi.fn(() => false),
  resolveTeamverLoginUrl: vi.fn(() => "https://teamver.com/auth/signin"),
}));

import {
  startVelaLogin,
  cancelVelaLogin,
  velaLogout,
} from "../src/providers/daemon";

const mockEmbed = (enabled: boolean) =>
  vi.mocked(designApiBase.isTeamverEmbedMode).mockReturnValue(enabled);

describe("vela login lifecycle helpers — Teamver embed skip", () => {
  afterEach(() => {
    mockEmbed(false);
    vi.unstubAllGlobals();
  });

  describe("startVelaLogin", () => {
    it("returns ok=false with reason 'amr_disabled_in_embed' in embed mode (no fetch)", async () => {
      mockEmbed(true);
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const result = await startVelaLogin();

      expect(result.ok).toBe(false);
      expect(result.error).toBe("amr_disabled_in_embed");
      expect(result.status).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("non-embed: posts to /api/integrations/vela/login and returns pid on 200", async () => {
      mockEmbed(false);
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ pid: 123 }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      const result = await startVelaLogin();

      expect(result).toEqual({ ok: true, status: 200, pid: 123 });
      expect(fetchSpy.mock.calls[0][0]).toBe("/api/integrations/vela/login");
    });
  });

  describe("cancelVelaLogin", () => {
    it("returns {ok:true, canceled:false} in embed mode without hitting fetch", async () => {
      mockEmbed(true);
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const result = await cancelVelaLogin();

      expect(result).toEqual({ ok: true, canceled: false });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("non-embed: posts to /api/integrations/vela/login/cancel and parses canceled flag", async () => {
      mockEmbed(false);
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ canceled: true }),
      });
      vi.stubGlobal("fetch", fetchSpy);

      const result = await cancelVelaLogin();

      expect(result).toEqual({ ok: true, canceled: true });
      expect(fetchSpy.mock.calls[0][0]).toBe("/api/integrations/vela/login/cancel");
    });
  });

  describe("velaLogout", () => {
    it("returns {ok:true} in embed mode without hitting fetch", async () => {
      mockEmbed(true);
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const result = await velaLogout();

      expect(result).toEqual({ ok: true });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("non-embed: posts to /api/integrations/vela/logout", async () => {
      mockEmbed(false);
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchSpy);

      const result = await velaLogout();

      expect(result).toEqual({ ok: true });
      expect(fetchSpy.mock.calls[0][0]).toBe("/api/integrations/vela/logout");
    });
  });
});
