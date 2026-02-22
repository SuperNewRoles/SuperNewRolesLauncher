import { describe, expect, it } from "vitest";

import { computeControlState } from "./selectors";
import type { AppStateSnapshot } from "./store";

function createBaseSnapshot(): AppStateSnapshot {
  // 各テストはこの最小状態から必要項目だけ上書きする。
  return {
    settings: null,
    releases: [],
    profileIsReady: false,
    gameRunning: false,
    installInProgress: false,
    uninstallInProgress: false,
    launchInProgress: false,
    creatingShortcut: false,
    releasesLoading: false,
    checkingUpdate: false,
    epicLoggedIn: false,
    migrationExporting: false,
    migrationImporting: false,
    presetLoading: false,
    presetExporting: false,
    presetInspecting: false,
    presetImporting: false,
    localPresets: [],
    archivePresets: [],
    reportingReady: false,
    reportPreparing: false,
    reportingLoading: false,
    reportMessagesLoading: false,
    reportSending: false,
    reportMessageSending: false,
    reportThreads: [],
    reportMessages: [],
    selectedReportThreadId: null,
    reportMessageLoadTicket: 0,
    reportingPollTimer: null,
    reportingUnreadBaselineCaptured: false,
    knownUnreadThreadIds: new Set(),
    preservedSaveDataAvailable: false,
    preservedSaveDataFiles: 0,
    reportingNotificationEnabled: false,
  };
}

describe("computeControlState", () => {
  it("settings 未取得時は主要操作が無効になる", () => {
    const result = computeControlState(createBaseSnapshot());
    expect(result.installButtonDisabled).toBe(true);
    expect(result.launchVanillaButtonDisabled).toBe(true);
    expect(result.migrationExportButtonDisabled).toBe(true);
  });

  it("常駐設定がOFFのとき WebView解放スイッチは無効になる", () => {
    const state = createBaseSnapshot();
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
    const state = createBaseSnapshot();
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
    expect(result.installButtonDisabled).toBe(false);
    expect(result.closeWebviewOnTrayBackgroundInputDisabled).toBe(false);
  });

  it("ゲーム実行中は launch 系が無効になる", () => {
    const state = createBaseSnapshot();
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
  });

  it("アーカイブに importable preset が無い場合は import を無効化する", () => {
    const state = createBaseSnapshot();
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
