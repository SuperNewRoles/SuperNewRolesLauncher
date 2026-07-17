import type { LauncherSettings, PresetSummary } from "../types";

/**
 * ランチャー画面の操作可否を決めるために必要な状態だけを表す。
 *
 * UI 実装の都合で使われていない状態まで持ち込むと、呼び出し側との二重管理や
 * 古い機能の状態が残りやすい。selector の入力をこの型に限定し、依存関係を明示する。
 */
export interface ControlStateInput {
  settings: LauncherSettings | null;
  profileIsReady: boolean;
  gameRunning: boolean;
  uninstallInProgress: boolean;
  launchInProgress: boolean;
  creatingShortcut: boolean;
  epicLoggedIn: boolean;
  migrationExporting: boolean;
  migrationImporting: boolean;
  presetLoading: boolean;
  presetExporting: boolean;
  presetInspecting: boolean;
  presetImporting: boolean;
  localPresets: PresetSummary[];
  archivePresets: PresetSummary[];
}

/** ランチャー画面で実際に参照する操作可否。 */
export interface ControlState {
  uninstallButtonDisabled: boolean;
  launchModdedButtonDisabled: boolean;
  launchVanillaButtonDisabled: boolean;
  createModdedShortcutButtonDisabled: boolean;
  epicLoginWebviewButtonDisabled: boolean;
  epicLogoutButtonDisabled: boolean;
  detectAmongUsPathButtonDisabled: boolean;
  openAmongUsFolderButtonDisabled: boolean;
  openProfileFolderButtonDisabled: boolean;
  closeToTrayOnCloseInputDisabled: boolean;
  closeWebviewOnTrayBackgroundInputDisabled: boolean;
  reportNotificationsEnabledInputDisabled: boolean;
  announceNotificationsEnabledInputDisabled: boolean;
  migrationExportButtonDisabled: boolean;
  migrationImportButtonDisabled: boolean;
  presetRefreshButtonDisabled: boolean;
  presetSelectAllLocalButtonDisabled: boolean;
  presetClearLocalButtonDisabled: boolean;
  presetExportButtonDisabled: boolean;
  presetInspectButtonDisabled: boolean;
  presetSelectAllArchiveButtonDisabled: boolean;
  presetClearArchiveButtonDisabled: boolean;
  presetImportButtonDisabled: boolean;
}

/**
 * ランチャー画面のボタン活性条件を副作用なしで計算する。
 */
export function computeControlState(state: ControlStateInput): ControlState {
  const hasSettings = state.settings !== null;
  const hasGamePath = Boolean(state.settings?.amongUsPath.trim());
  const hasProfilePath = Boolean(state.settings?.profilePath.trim());
  const migrationBusy = state.migrationExporting || state.migrationImporting;
  const presetBusy =
    state.presetLoading || state.presetExporting || state.presetInspecting || state.presetImporting;
  const dataTransferBusy = migrationBusy || presetBusy;
  const shortcutBusy = state.creatingShortcut;
  const operationBusy = state.uninstallInProgress || dataTransferBusy;
  const launchAvailable =
    hasSettings &&
    hasGamePath &&
    !state.launchInProgress &&
    !state.gameRunning &&
    !operationBusy &&
    !shortcutBusy;
  const closeToTrayEnabled = state.settings?.closeToTrayOnClose ?? false;
  const hasImportableArchivePreset = state.archivePresets.some((preset) => preset.hasDataFile);
  const presetControlsDisabled =
    operationBusy || state.launchInProgress || state.gameRunning || !hasSettings;

  return {
    uninstallButtonDisabled:
      !hasSettings ||
      state.uninstallInProgress ||
      state.launchInProgress ||
      state.gameRunning ||
      dataTransferBusy ||
      shortcutBusy,
    launchModdedButtonDisabled: !launchAvailable || !state.profileIsReady,
    launchVanillaButtonDisabled: !launchAvailable,
    createModdedShortcutButtonDisabled:
      !hasSettings || !hasGamePath || shortcutBusy || state.launchInProgress || operationBusy,
    epicLoginWebviewButtonDisabled: state.launchInProgress || operationBusy,
    epicLogoutButtonDisabled: !state.epicLoggedIn || state.launchInProgress || operationBusy,
    detectAmongUsPathButtonDisabled: state.launchInProgress || operationBusy,
    openAmongUsFolderButtonDisabled: !hasGamePath || state.launchInProgress || operationBusy,
    openProfileFolderButtonDisabled: !hasProfilePath || state.launchInProgress || operationBusy,
    closeToTrayOnCloseInputDisabled: state.launchInProgress || operationBusy,
    closeWebviewOnTrayBackgroundInputDisabled:
      state.launchInProgress || operationBusy || !closeToTrayEnabled,
    reportNotificationsEnabledInputDisabled: state.launchInProgress || operationBusy,
    announceNotificationsEnabledInputDisabled: state.launchInProgress || operationBusy,
    migrationExportButtonDisabled:
      !hasSettings ||
      dataTransferBusy ||
      state.uninstallInProgress ||
      state.launchInProgress ||
      state.gameRunning,
    migrationImportButtonDisabled:
      dataTransferBusy || state.uninstallInProgress || state.launchInProgress || state.gameRunning,
    presetRefreshButtonDisabled: presetControlsDisabled,
    presetSelectAllLocalButtonDisabled: presetControlsDisabled || state.localPresets.length === 0,
    presetClearLocalButtonDisabled: presetControlsDisabled || state.localPresets.length === 0,
    presetExportButtonDisabled: presetControlsDisabled || state.localPresets.length === 0,
    presetInspectButtonDisabled: presetControlsDisabled,
    presetSelectAllArchiveButtonDisabled:
      presetControlsDisabled || state.archivePresets.length === 0 || !hasImportableArchivePreset,
    presetClearArchiveButtonDisabled: presetControlsDisabled || state.archivePresets.length === 0,
    presetImportButtonDisabled: presetControlsDisabled || !hasImportableArchivePreset,
  };
}
