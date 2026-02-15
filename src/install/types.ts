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

export type ImportMode = "savedata-folder" | "migration-archive";

/** ステップの進行順（番号が大きいほど先） */
export const STEP_ORDER: Record<InstallStep, number> = {
  welcome: 0,
  detecting: 0.5,
  platform: 1,
  "epic-login": 2,
  version: 3,
  import: 4,
  confirm: 5,
  progress: 6,
  complete: 7,
};

export interface InstallState {
  step: InstallStep;
  platform: GamePlatform | null;
  amongUsPath: string;
  releaseTag: string;
  restoreSaveData: boolean;
  progress: number;
  progressMessage: string;
}

export interface DetectedPlatform {
  path: string;
  platform: string;
}
