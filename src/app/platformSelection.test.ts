import { describe, expect, it } from "vitest";

import {
  type NormalizedPlatformCandidate,
  filterSelectablePlatformCandidates,
  isPlatformSelectable,
} from "./platformSelection";

describe("platform selection availability", () => {
  // 実運用に近い候補セットを固定し、フラグ差分だけを検証する。
  const candidates: NormalizedPlatformCandidate[] = [
    { path: "C:/AmongUs/Steam", platform: "steam" },
    { path: "C:/AmongUs/Epic", platform: "epic" },
  ];

  it("keeps both Steam and Epic candidates when Epic is enabled", () => {
    // Epic 有効時は候補がそのまま通る。
    expect(filterSelectablePlatformCandidates(candidates, true)).toEqual(candidates);
  });

  it("removes Epic candidates when Epic is disabled", () => {
    // Epic 無効時は Steam のみ残すことで UI 側分岐を単純化する。
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
