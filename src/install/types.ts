import type { GamePlatform } from "../app/types";

export type InstallStep =
  | "welcome"
  | "detecting"
  | "platform"
  | "version"
  | "epic-login"
  | "confirm"
  | "progress"
  | "complete";

/** ステップの進行順（番号が大きいほど先） */
export const STEP_ORDER: Record<InstallStep, number> = {
  welcome: 0,
  detecting: 0.5,
  platform: 1,
  "epic-login": 2,
  version: 3,
  confirm: 4,
  progress: 5,
  complete: 6,
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
