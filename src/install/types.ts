import type { GamePlatform } from "../app/types";

export type InstallStep =
  | "welcome"
  | "detecting"
  | "platform"
  | "version"
  | "import"
  | "epic-login"
  | "confirm"
  | "progress"
  | "complete";

/** ステップの進行順（番号が大きいほど先） */
export const STEP_ORDER: Record<InstallStep, number> = {
  welcome: 0,
  // detecting は welcome と platform の中間演出として 0.5 を割り当てる。
  detecting: 0.5,
  platform: 1,
  "epic-login": 2,
  version: 3,
  import: 4,
  confirm: 5,
  progress: 6,
  complete: 7,
};

// インストール進行中に UI が保持する主要状態。
export interface InstallState {
  step: InstallStep;
  platform: GamePlatform | null;
  amongUsPath: string;
  releaseTag: string;
  restoreSaveData: boolean;
  progress: number;
  progressMessage: string;
}

// 自動検出または手動選択で得られるプラットフォーム候補。
export interface DetectedPlatform {
  path: string;
  platform: string;
}
