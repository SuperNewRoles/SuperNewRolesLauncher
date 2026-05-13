import { describe, expect, it } from "vitest";

import {
  type NormalizedPlatformCandidate,
  filterSelectablePlatformCandidates,
  getPlatformIconPath,
  getPlatformLabelKey,
  isPlatformSelectable,
  normalizePlatformCandidates,
} from "./platformSelection";

describe("platform selection availability", () => {
  // 実運用に近い候補セットを固定し、フラグ差分だけを検証する。
  const candidates: NormalizedPlatformCandidate[] = [
    { path: "C:/AmongUs/Steam", platform: "steam" },
    { path: "C:/AmongUs/Epic", platform: "epic" },
    { path: "C:/AmongUs/Xbox", platform: "xbox" },
  ];

  it("keeps Steam, Epic, and Xbox candidates when Epic is enabled", () => {
    // Epic 有効時は候補がそのまま通る。
    expect(filterSelectablePlatformCandidates(candidates, true)).toEqual(candidates);
  });

  it("removes only Epic candidates when Epic is disabled", () => {
    // Epic 無効時も Xbox は選択可能なまま残す。
    expect(filterSelectablePlatformCandidates(candidates, false)).toEqual([
      { path: "C:/AmongUs/Steam", platform: "steam" },
      { path: "C:/AmongUs/Xbox", platform: "xbox" },
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

  it("marks Xbox selectable regardless of Epic flag", () => {
    expect(isPlatformSelectable("xbox", true)).toBe(true);
    expect(isPlatformSelectable("xbox", false)).toBe(true);
  });

  it("normalizes candidates with stable Steam Epic Xbox order", () => {
    expect(
      normalizePlatformCandidates([
        { path: "C:/AmongUs/Xbox", platform: "xbox" },
        { path: "C:/AmongUs/Unknown", platform: "unknown" },
        { path: "C:/AmongUs/Epic", platform: "epic" },
        { path: "C:/AmongUs/Steam", platform: "steam" },
      ]),
    ).toEqual([
      { path: "C:/AmongUs/Steam", platform: "steam" },
      { path: "C:/AmongUs/Epic", platform: "epic" },
      { path: "C:/AmongUs/Xbox", platform: "xbox" },
    ]);
  });

  it("returns Xbox label and icon metadata", () => {
    expect(getPlatformLabelKey("xbox")).toBe("installFlow.platformXbox");
    expect(getPlatformIconPath("xbox")).toContain("M12");
  });
});
