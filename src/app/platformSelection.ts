import { EPIC_ICON_PATH, STEAM_ICON_PATH } from "./platformIconPaths";
import type { GamePlatform } from "./types";

export interface NormalizedPlatformCandidate {
  path: string;
  platform: GamePlatform;
}

export function isPlatformSelectable(platform: GamePlatform, epicEnabled: boolean): boolean {
  // Steam は常時選択可能、Epic は機能フラグで制御する。
  if (platform === "steam") {
    return true;
  }
  return epicEnabled;
}

export function filterSelectablePlatformCandidates(
  candidates: NormalizedPlatformCandidate[],
  epicEnabled: boolean,
): NormalizedPlatformCandidate[] {
  // Epic が有効ならフィルタ不要で候補をそのまま使う。
  if (epicEnabled) {
    return candidates;
  }
  return candidates.filter((candidate) => isPlatformSelectable(candidate.platform, epicEnabled));
}

export function normalizePlatformCandidates(
  candidates: { path: string; platform: string }[],
): NormalizedPlatformCandidate[] {
  return (
    candidates
      .filter(
        // 型ガードで未知プラットフォームを除外する。
        (candidate): candidate is NormalizedPlatformCandidate =>
          candidate.platform === "steam" || candidate.platform === "epic",
      )
      // 呼び出し元配列を変更しないため、並び替え前にコピーを作る。
      .slice()
      .sort((left, right) => {
        // 表示順は Steam 優先、同一プラットフォーム内はパス文字列順に固定する。
        if (left.platform !== right.platform) {
          return left.platform === "steam" ? -1 : 1;
        }
        return left.path.localeCompare(right.path, undefined, { sensitivity: "base" });
      })
  );
}

export function getPlatformIconPath(platform: GamePlatform): string {
  // 表示用アイコンはプラットフォーム種別で切り替える。
  return platform === "steam" ? STEAM_ICON_PATH : EPIC_ICON_PATH;
}

export function getPlatformLabelKey(
  platform: GamePlatform,
): "installFlow.platformSteam" | "installFlow.platformEpic" {
  // 翻訳キーもプラットフォーム種別に対応させる。
  return platform === "steam" ? "installFlow.platformSteam" : "installFlow.platformEpic";
}
