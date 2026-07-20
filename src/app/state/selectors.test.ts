import { describe, expect, it } from "vitest";

import { type ControlStateInput, computeControlState } from "./selectors";

function createBaseState(): ControlStateInput {
  // 各テストはこの最小状態から必要項目だけ上書きする。
  return {
    settings: null,
    profileIsReady: false,
    gameRunning: false,
    customDllSelecting: false,
    customDllInstalling: false,
    uninstallInProgress: false,
    launchInProgress: false,
    creatingShortcut: false,
    epicLoggedIn: false,
    migrationExporting: false,
    migrationImporting: false,
    presetLoading: false,
    presetExporting: false,
    presetInspecting: false,
    presetImporting: false,
    localPresets: [],
    archivePresets: [],
  };
}

describe("computeControlState", () => {
  it("settings 未取得時は主要操作が無効になる", () => {
    const result = computeControlState(createBaseState());
    expect(result.uninstallButtonDisabled).toBe(true);
    expect(result.customDllLoadButtonDisabled).toBe(true);
    expect(result.launchVanillaButtonDisabled).toBe(true);
    expect(result.migrationExportButtonDisabled).toBe(true);
  });

  it("常駐設定がOFFのとき WebView解放スイッチは無効になる", () => {
    const state = createBaseState();
    // ここでは launch/install 状態を触らず、常駐フラグだけで判定されることを確認する。
    state.settings = {
      amongUsPath: "C:/AmongUs",
      gamePlatform: "steam",
      selectedReleaseTag: "v1.0.0",
      selectedGameServerId: "snr-main",
      profilePath: "C:/profile",
      closeToTrayOnClose: false,
      closeWebviewOnTrayBackground: true,
      reportNotificationsEnabled: true,
      announceNotificationsEnabled: true,
      uiLocale: "ja",
      onboardingCompleted: true,
    };

    const result = computeControlState(state);
    expect(result.closeWebviewOnTrayBackgroundInputDisabled).toBe(true);
  });

  it("起動可能状態で Vanilla 起動が有効になる", () => {
    const state = createBaseState();
    state.settings = {
      amongUsPath: "C:/AmongUs",
      gamePlatform: "steam",
      selectedReleaseTag: "v1.0.0",
      selectedGameServerId: "snr-main",
      profilePath: "C:/profile",
      closeToTrayOnClose: true,
      closeWebviewOnTrayBackground: true,
      reportNotificationsEnabled: true,
      announceNotificationsEnabled: true,
      uiLocale: "ja",
      onboardingCompleted: true,
    };

    state.profileIsReady = true;

    // 起動条件がそろったときに主要ボタンが有効化されることを確認する。
    const result = computeControlState(state);
    expect(result.launchVanillaButtonDisabled).toBe(false);
    expect(result.launchModdedButtonDisabled).toBe(false);
    expect(result.uninstallButtonDisabled).toBe(false);
    expect(result.customDllLoadButtonDisabled).toBe(false);
    expect(result.closeWebviewOnTrayBackgroundInputDisabled).toBe(false);
  });

  it("ゲーム実行中は launch 系が無効になる", () => {
    const state = createBaseState();
    state.settings = {
      amongUsPath: "C:/AmongUs",
      gamePlatform: "steam",
      selectedReleaseTag: "v1.0.0",
      selectedGameServerId: "snr-main",
      profilePath: "C:/profile",
      closeToTrayOnClose: true,
      closeWebviewOnTrayBackground: true,
      reportNotificationsEnabled: true,
      announceNotificationsEnabled: true,
      uiLocale: "ja",
      onboardingCompleted: true,
    };

    state.gameRunning = true;
    state.profileIsReady = true;

    const result = computeControlState(state);
    expect(result.launchVanillaButtonDisabled).toBe(true);
    expect(result.launchModdedButtonDisabled).toBe(true);
    expect(result.customDllLoadButtonDisabled).toBe(true);
  });

  it("プロファイル未準備時はカスタムDLL読み込みを無効化する", () => {
    const state = createBaseState();
    state.settings = {
      amongUsPath: "C:/AmongUs",
      gamePlatform: "steam",
      selectedReleaseTag: "v1.0.0",
      selectedGameServerId: "snr-main",
      profilePath: "C:/profile",
      closeToTrayOnClose: true,
      closeWebviewOnTrayBackground: true,
      reportNotificationsEnabled: true,
      announceNotificationsEnabled: true,
      uiLocale: "ja",
      onboardingCompleted: true,
    };

    expect(computeControlState(state).customDllLoadButtonDisabled).toBe(true);
  });

  it("カスタムDLL選択中は読み込みボタンだけを無効化する", () => {
    const state = createBaseState();
    state.settings = {
      amongUsPath: "C:/AmongUs",
      gamePlatform: "steam",
      selectedReleaseTag: "v1.0.0",
      selectedGameServerId: "snr-main",
      profilePath: "C:/profile",
      closeToTrayOnClose: true,
      closeWebviewOnTrayBackground: true,
      reportNotificationsEnabled: true,
      announceNotificationsEnabled: true,
      uiLocale: "ja",
      onboardingCompleted: true,
    };
    state.profileIsReady = true;
    state.customDllSelecting = true;

    const result = computeControlState(state);
    expect(result.customDllLoadButtonDisabled).toBe(true);
    expect(result.launchVanillaButtonDisabled).toBe(false);
  });

  it("別のデータ操作中はカスタムDLL読み込みを無効化する", () => {
    const state = createBaseState();
    state.settings = {
      amongUsPath: "C:/AmongUs",
      gamePlatform: "steam",
      selectedReleaseTag: "v1.0.0",
      selectedGameServerId: "snr-main",
      profilePath: "C:/profile",
      closeToTrayOnClose: true,
      closeWebviewOnTrayBackground: true,
      reportNotificationsEnabled: true,
      announceNotificationsEnabled: true,
      uiLocale: "ja",
      onboardingCompleted: true,
    };
    state.profileIsReady = true;
    state.migrationExporting = true;

    expect(computeControlState(state).customDllLoadButtonDisabled).toBe(true);
  });

  it("カスタムDLL適用中は競合する操作を無効化する", () => {
    const state = createBaseState();
    state.settings = {
      amongUsPath: "C:/AmongUs",
      gamePlatform: "steam",
      selectedReleaseTag: "v1.0.0",
      selectedGameServerId: "snr-main",
      profilePath: "C:/profile",
      closeToTrayOnClose: true,
      closeWebviewOnTrayBackground: true,
      reportNotificationsEnabled: true,
      announceNotificationsEnabled: true,
      uiLocale: "ja",
      onboardingCompleted: true,
    };
    state.profileIsReady = true;
    state.customDllInstalling = true;

    const result = computeControlState(state);
    expect(result.customDllLoadButtonDisabled).toBe(true);
    expect(result.launchModdedButtonDisabled).toBe(true);
    expect(result.launchVanillaButtonDisabled).toBe(true);
    expect(result.uninstallButtonDisabled).toBe(true);
    expect(result.migrationExportButtonDisabled).toBe(true);
    expect(result.presetRefreshButtonDisabled).toBe(true);
    expect(result.closeToTrayOnCloseInputDisabled).toBe(true);
  });

  it("アーカイブに importable preset が無い場合は import を無効化する", () => {
    const state = createBaseState();
    state.settings = {
      amongUsPath: "C:/AmongUs",
      gamePlatform: "steam",
      selectedReleaseTag: "v1.0.0",
      selectedGameServerId: "snr-main",
      profilePath: "C:/profile",
      closeToTrayOnClose: true,
      closeWebviewOnTrayBackground: true,
      reportNotificationsEnabled: true,
      announceNotificationsEnabled: true,
      uiLocale: "ja",
      onboardingCompleted: true,
    };

    state.archivePresets = [{ id: 1, name: "x", hasDataFile: false }];

    const result = computeControlState(state);
    expect(result.presetImportButtonDisabled).toBe(true);
  });
});
