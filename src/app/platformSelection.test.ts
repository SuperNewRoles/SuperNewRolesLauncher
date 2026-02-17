import { describe, expect, it } from "vitest";

import {
  filterSelectablePlatformCandidates,
  isPlatformSelectable,
  type NormalizedPlatformCandidate,
} from "./platformSelection";

describe("platform selection availability", () => {
  const candidates: NormalizedPlatformCandidate[] = [
    { path: "C:/AmongUs/Steam", platform: "steam" },
    { path: "C:/AmongUs/Epic", platform: "epic" },
  ];

  it("keeps both Steam and Epic candidates when Epic is enabled", () => {
    expect(filterSelectablePlatformCandidates(candidates, true)).toEqual(candidates);
  });

  it("removes Epic candidates when Epic is disabled", () => {
    expect(filterSelectablePlatformCandidates(candidates, false)).toEqual([
      { path: "C:/AmongUs/Steam", platform: "steam" },
    ]);
  });

  it("marks Steam selectable regardless of Epic flag", () => {
    expect(isPlatformSelectable("steam", true)).toBe(true);
    expect(isPlatformSelectable("steam", false)).toBe(true);
  });

  it("marks Epic selectable only when Epic is enabled", () => {
    expect(isPlatformSelectable("epic", true)).toBe(true);
    expect(isPlatformSelectable("epic", false)).toBe(false);
  });
});
