import type { AppStateSnapshot } from "./store";

/**
 * ボタン活性の判定結果。
 * DOM更新ロジックと条件計算を分離して、ユニットテスト可能にする。
 */
export interface ControlState {
  installButtonDisabled: boolean;
  installRestoreSaveDataCheckboxDisabled: boolean;
  uninstallButtonDisabled: boolean;
  uninstallPreserveSaveDataCheckboxDisabled: boolean;
  launchModdedButtonDisabled: boolean;
  launchVanillaButtonDisabled: boolean;
  createModdedShortcutButtonDisabled: boolean;
  epicLoginWebviewButtonDisabled: boolean;
  epicLoginCodeButtonDisabled: boolean;
  epicLogoutButtonDisabled: boolean;
  detectAmongUsPathButtonDisabled: boolean;
  saveAmongUsPathButtonDisabled: boolean;
  refreshReleasesButtonDisabled: boolean;
  releaseSelectDisabled: boolean;
  platformSelectDisabled: boolean;
  openAmongUsFolderButtonDisabled: boolean;
  openProfileFolderButtonDisabled: boolean;
  closeToTrayOnCloseInputDisabled: boolean;
  closeWebviewOnTrayBackgroundInputDisabled: boolean;
  migrationExportButtonDisabled: boolean;
  migrationImportButtonDisabled: boolean;
  migrationImportPathInputDisabled: boolean;
  migrationEncryptionEnabledInputDisabled: boolean;
  migrationExportPasswordInputDisabled: boolean;
  migrationImportPasswordInputDisabled: boolean;
  presetRefreshButtonDisabled: boolean;
  presetSelectAllLocalButtonDisabled: boolean;
  presetClearLocalButtonDisabled: boolean;
  presetExportPathInputDisabled: boolean;
  presetExportButtonDisabled: boolean;
  presetImportPathInputDisabled: boolean;
  presetInspectButtonDisabled: boolean;
  presetSelectAllArchiveButtonDisabled: boolean;
  presetClearArchiveButtonDisabled: boolean;
  presetImportButtonDisabled: boolean;
  reportRefreshButtonDisabled: boolean;
  reportNotificationToggleDisabled: boolean;
  reportTypeSelectDisabled: boolean;
  reportTitleInputDisabled: boolean;
  reportDescriptionInputDisabled: boolean;
  reportMapInputDisabled: boolean;
  reportRoleInputDisabled: boolean;
  reportTimingInputDisabled: boolean;
  reportSendButtonDisabled: boolean;
  reportReplyInputDisabled: boolean;
  reportSendMessageButtonDisabled: boolean;
}

/**
 * 旧updateButtonsの条件式を純関数化したもの。
 * 引数のみで結果が決まるため、副作用なしで安全に検証できる。
 */
export function computeControlState(state: AppStateSnapshot): ControlState {
  const hasSettings = state.settings !== null;
  const hasGamePath = Boolean(state.settings?.amongUsPath.trim());
  const hasProfilePath = Boolean(state.settings?.profilePath.trim());
  const hasTag = Boolean(state.settings?.selectedReleaseTag.trim());
  const migrationBusy = state.migrationExporting || state.migrationImporting;
  const presetBusy =
    state.presetLoading || state.presetExporting || state.presetInspecting || state.presetImporting;
  const dataTransferBusy = migrationBusy || presetBusy;
  const shortcutBusy = state.creatingShortcut;
  const installOrUninstallBusy = state.installInProgress || state.uninstallInProgress;
  const launchAvailable =
    hasSettings &&
    hasGamePath &&
    !state.launchInProgress &&
    !state.gameRunning &&
    !installOrUninstallBusy &&
    !dataTransferBusy &&
    !shortcutBusy;
  const closeToTrayEnabled = state.settings?.closeToTrayOnClose ?? false;

  const hasImportableArchivePreset = state.archivePresets.some((preset) => preset.hasDataFile);
  const presetControlsDisabled =
    dataTransferBusy ||
    installOrUninstallBusy ||
    state.launchInProgress ||
    state.gameRunning ||
    !hasSettings;

  return {
    installButtonDisabled:
      !hasSettings ||
      !hasTag ||
      installOrUninstallBusy ||
      state.releasesLoading ||
      dataTransferBusy,
    installRestoreSaveDataCheckboxDisabled:
      installOrUninstallBusy ||
      state.releasesLoading ||
      dataTransferBusy ||
      !state.preservedSaveDataAvailable,
    uninstallButtonDisabled:
      !hasSettings ||
      installOrUninstallBusy ||
      state.launchInProgress ||
      state.gameRunning ||
      dataTransferBusy ||
      shortcutBusy,
    uninstallPreserveSaveDataCheckboxDisabled:
      state.uninstallInProgress ||
      state.installInProgress ||
      state.launchInProgress ||
      state.gameRunning ||
      dataTransferBusy ||
      shortcutBusy,
    launchModdedButtonDisabled: !launchAvailable || !state.profileIsReady,
    launchVanillaButtonDisabled: !launchAvailable,
    createModdedShortcutButtonDisabled:
      !hasSettings ||
      !hasGamePath ||
      shortcutBusy ||
      state.launchInProgress ||
      installOrUninstallBusy ||
      dataTransferBusy,
    epicLoginWebviewButtonDisabled:
      state.launchInProgress || installOrUninstallBusy || dataTransferBusy,
    epicLoginCodeButtonDisabled:
      state.launchInProgress || installOrUninstallBusy || dataTransferBusy,
    epicLogoutButtonDisabled:
      !state.epicLoggedIn || state.launchInProgress || installOrUninstallBusy || dataTransferBusy,
    detectAmongUsPathButtonDisabled:
      state.launchInProgress || installOrUninstallBusy || dataTransferBusy,
    saveAmongUsPathButtonDisabled:
      state.launchInProgress || installOrUninstallBusy || dataTransferBusy,
    refreshReleasesButtonDisabled:
      state.releasesLoading || installOrUninstallBusy || dataTransferBusy,
    releaseSelectDisabled: state.releasesLoading || installOrUninstallBusy || dataTransferBusy,
    platformSelectDisabled: installOrUninstallBusy || dataTransferBusy,
    openAmongUsFolderButtonDisabled:
      !hasGamePath || state.launchInProgress || installOrUninstallBusy || dataTransferBusy,
    openProfileFolderButtonDisabled:
      !hasProfilePath || state.launchInProgress || installOrUninstallBusy || dataTransferBusy,
    closeToTrayOnCloseInputDisabled:
      state.launchInProgress || installOrUninstallBusy || dataTransferBusy,
    closeWebviewOnTrayBackgroundInputDisabled:
      state.launchInProgress ||
      installOrUninstallBusy ||
      dataTransferBusy ||
      !closeToTrayEnabled,
    migrationExportButtonDisabled:
      !hasSettings ||
      dataTransferBusy ||
      installOrUninstallBusy ||
      state.launchInProgress ||
      state.gameRunning,
    migrationImportButtonDisabled:
      dataTransferBusy || installOrUninstallBusy || state.launchInProgress || state.gameRunning,
    migrationImportPathInputDisabled:
      dataTransferBusy || installOrUninstallBusy || state.launchInProgress || state.gameRunning,
    migrationEncryptionEnabledInputDisabled:
      dataTransferBusy || installOrUninstallBusy || state.launchInProgress || state.gameRunning,
    migrationExportPasswordInputDisabled:
      dataTransferBusy || installOrUninstallBusy || state.launchInProgress || state.gameRunning,
    migrationImportPasswordInputDisabled:
      dataTransferBusy || installOrUninstallBusy || state.launchInProgress || state.gameRunning,
    presetRefreshButtonDisabled: presetControlsDisabled,
    presetSelectAllLocalButtonDisabled: presetControlsDisabled || state.localPresets.length === 0,
    presetClearLocalButtonDisabled: presetControlsDisabled || state.localPresets.length === 0,
    presetExportPathInputDisabled: presetControlsDisabled,
    presetExportButtonDisabled: presetControlsDisabled || state.localPresets.length === 0,
    presetImportPathInputDisabled: presetControlsDisabled,
    presetInspectButtonDisabled: presetControlsDisabled,
    presetSelectAllArchiveButtonDisabled:
      presetControlsDisabled || state.archivePresets.length === 0 || !hasImportableArchivePreset,
    presetClearArchiveButtonDisabled: presetControlsDisabled || state.archivePresets.length === 0,
    presetImportButtonDisabled: presetControlsDisabled || !hasImportableArchivePreset,
    reportRefreshButtonDisabled:
      state.reportPreparing || state.reportingLoading || state.reportMessagesLoading,
    reportNotificationToggleDisabled: state.reportPreparing || state.reportSending,
    reportTypeSelectDisabled: !state.reportingReady || state.reportPreparing || state.reportSending,
    reportTitleInputDisabled: !state.reportingReady || state.reportPreparing || state.reportSending,
    reportDescriptionInputDisabled:
      !state.reportingReady || state.reportPreparing || state.reportSending,
    reportMapInputDisabled: !state.reportingReady || state.reportPreparing || state.reportSending,
    reportRoleInputDisabled: !state.reportingReady || state.reportPreparing || state.reportSending,
    reportTimingInputDisabled:
      !state.reportingReady || state.reportPreparing || state.reportSending,
    reportSendButtonDisabled: !state.reportingReady || state.reportPreparing || state.reportSending,
    reportReplyInputDisabled:
      !state.reportingReady || !state.selectedReportThreadId || state.reportMessageSending,
    reportSendMessageButtonDisabled:
      !state.reportingReady || !state.selectedReportThreadId || state.reportMessageSending,
  };
}
