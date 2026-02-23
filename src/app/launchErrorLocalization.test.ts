import { describe, expect, it } from "vitest";

import {
  type LaunchErrorMessageKey,
  isElevationRequiredLaunchError,
  localizeLaunchErrorMessage,
  normalizeInvokeErrorMessage,
} from "./launchErrorLocalization";

const t = (key: LaunchErrorMessageKey, params?: Record<string, string | number>): string => {
  // テストでは翻訳文そのものではなく、キーと引数のマッピング結果を検証する。
  if (params?.error) {
    return `${key}:${params.error}`;
  }
  return key;
};

describe("launch error localization", () => {
  it("normalizes invoke wrapper from error message", () => {
    // Tauri invoke の共通プレフィックスが除去されることを確認する。
    const raw = "Error invoking 'launch_modded': Epic launch requires Epic authentication";
    expect(normalizeInvokeErrorMessage(raw)).toBe("Epic launch requires Epic authentication");
  });

  it("localizes wrapped Epic auth required error", () => {
    const raw =
      "Error invoking 'launch_modded': Epic launch requires Epic authentication. Please log in from the Epic settings tab.";
    expect(localizeLaunchErrorMessage(raw, "Among Us.exe", t)).toBe("launch.errorEpicAuthRequired");
  });

  it("localizes wrapped Epic auth check failure with detail", () => {
    const raw =
      "Error invoking 'launch_modded': Epic authentication check failed. Please log in to Epic and try again: token expired";
    expect(localizeLaunchErrorMessage(raw, "Among Us.exe", t)).toBe(
      "launch.errorEpicAuthCheckFailedWithDetail:token expired",
    );
  });

  it("localizes Epic feature disabled error", () => {
    // mod.config 由来の固定文言はそのまま翻訳キーへ写像される想定。
    const raw = "Error invoking 'launch_vanilla': Epic launch is disabled by mod.config.json.";
    expect(localizeLaunchErrorMessage(raw, "Among Us.exe", t)).toBe(
      "launch.errorEpicFeatureDisabled",
    );
  });

  it("localizes wrapped missing BepInEx IL2CPP DLL error", () => {
    const raw =
      "Error invoking 'launch_modded': BepInEx IL2CPP DLL not found: C:\\...\\BepInEx.Unity.IL2CPP.dll";
    expect(localizeLaunchErrorMessage(raw, "Among Us.exe", t)).toBe(
      "launch.errorBepInExIl2CppDllMissing",
    );
  });

  it("maps invalid launch target error to Among Us folder localization", () => {
    const raw =
      "Error invoking 'launch_modded': Launch target is not Among Us.exe: C:/Games/AU.exe";
    expect(localizeLaunchErrorMessage(raw, "Among Us.exe", t)).toBe(
      "installFlow.invalidAmongUsFolder",
    );
  });

  it("detects elevation required launch error", () => {
    const raw = "Error invoking 'launch_modded': ELEVATION_REQUIRED: The requested operation";
    expect(isElevationRequiredLaunchError(raw)).toBe(true);
  });

  it("localizes elevation cancelled error", () => {
    const raw =
      "Error invoking 'launch_modded_elevated': ELEVATION_CANCELLED: The elevation request was cancelled.";
    expect(localizeLaunchErrorMessage(raw, "Among Us.exe", t)).toBe(
      "launch.errorElevationCancelled",
    );
  });

  it("localizes elevated launch helper failure with detail", () => {
    const raw = "Error invoking 'launch_modded_elevated': ELEVATED_LAUNCH_FAILED: helper timed out";
    expect(localizeLaunchErrorMessage(raw, "Among Us.exe", t)).toBe(
      "launch.errorElevatedLaunchFailed:helper timed out",
    );
  });
});
