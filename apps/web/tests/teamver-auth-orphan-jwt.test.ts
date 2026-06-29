// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isOrphanTeamverJwtAuthFailure } from "../src/teamver/teamverAuthOrphanJwt";

describe("teamverAuthOrphanJwt", () => {
  it("detects refresh user_not_found and bootstrap user_not_in_database bodies", () => {
    expect(isOrphanTeamverJwtAuthFailure(400, '{"message":"error.user_not_found"}')).toBe(true);
    expect(
      isOrphanTeamverJwtAuthFailure(401, '{"message":"error.token.user_not_in_database"}'),
    ).toBe(true);
    expect(isOrphanTeamverJwtAuthFailure(400, '{"message":"error.validation"}')).toBe(false);
    expect(isOrphanTeamverJwtAuthFailure(502, "user_not_found")).toBe(false);
  });
});
