import { EPIC_ICON_PATH, STEAM_ICON_PATH } from "./platformIconPaths";
import type { GamePlatform } from "./types";

export interface NormalizedPlatformCandidate {
  path: string;
  platform: GamePlatform;
}

export function isPlatformSelectable(platform: GamePlatform, epicEnabled: boolean): boolean {
  if (platform === "steam") {
    return true;
  }
  return epicEnabled;
}

export function filterSelectablePlatformCandidates(
  candidates: NormalizedPlatformCandidate[],
  epicEnabled: boolean,
): NormalizedPlatformCandidate[] {
  if (epicEnabled) {
    return candidates;
  }
  return candidates.filter((candidate) => isPlatformSelectable(candidate.platform, epicEnabled));
}

export function normalizePlatformCandidates(
  candidates: { path: string; platform: string }[],
): NormalizedPlatformCandidate[] {
  return candidates
    .filter(
      (candidate): candidate is NormalizedPlatformCandidate =>
        candidate.platform === "steam" || candidate.platform === "epic",
    )
    .slice()
    .sort((left, right) => {
      if (left.platform !== right.platform) {
        return left.platform === "steam" ? -1 : 1;
      }
      return left.path.localeCompare(right.path, undefined, { sensitivity: "base" });
    });
}

export function getPlatformIconPath(platform: GamePlatform): string {
  return platform === "steam" ? STEAM_ICON_PATH : EPIC_ICON_PATH;
}

export function getPlatformLabelKey(
  platform: GamePlatform,
): "installFlow.platformSteam" | "installFlow.platformEpic" {
  return platform === "steam" ? "installFlow.platformSteam" : "installFlow.platformEpic";
}
