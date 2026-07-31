import { describe, expect, it } from "vitest";
import {
  isRouteAchievementId,
  ROUTE_ACHIEVEMENT_IDS,
  ROUTE_ACHIEVEMENTS,
} from "./route-achievements";

describe("route achievements", () => {
  it("covers the complete 3x3 route matrix exactly once", () => {
    const expected = ["web", "smb", "nfs"].flatMap((entrance) =>
      ["sudo", "timer", "suid"].map(
        (rootPath) => `${entrance}-${rootPath}`,
      ),
    );

    expect([...ROUTE_ACHIEVEMENT_IDS]).toEqual(expected);
    expect(Object.keys(ROUTE_ACHIEVEMENTS)).toEqual(expected);
    expect(new Set(ROUTE_ACHIEVEMENT_IDS).size).toBe(9);
    expect(
      ROUTE_ACHIEVEMENT_IDS.every(
        (id) =>
          isRouteAchievementId(id) &&
          ROUTE_ACHIEVEMENTS[id].label.includes(" × "),
      ),
    ).toBe(true);
  });

  it("rejects arbitrary or legacy route identifiers", () => {
    expect(isRouteAchievementId("web-sudo")).toBe(true);
    expect(isRouteAchievementId("windows-sudo")).toBe(false);
    expect(isRouteAchievementId("web-unknown")).toBe(false);
  });
});
