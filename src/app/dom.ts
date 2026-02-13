/**
 * DOM要素アクセスを集約するモジュール。
 * セレクタ変更時の影響範囲を最小化するため、取得処理を一箇所に閉じ込める。
 */
export interface AppDom {
  appVersion: HTMLSpanElement;
  replayOnboardingButton: HTMLButtonElement;
  languageSelect: HTMLSelectElement;

  amongUsPathInput: HTMLInputElement;
  saveAmongUsPathButton: HTMLButtonElement;
  detectAmongUsPathButton: HTMLButtonElement;
  platformSelect: HTMLSelectElement;
  releaseSelect: HTMLSelectElement;
  refreshReleasesButton: HTMLButtonElement;
  profilePath: HTMLElement;
  openAmongUsFolderButton: HTMLButtonElement;
  openProfileFolderButton: HTMLButtonElement;
  closeToTrayOnCloseInput: HTMLInputElement;
  installButton: HTMLButtonElement;
  installRestoreSaveDataCheckbox: HTMLInputElement;
  uninstallButton: HTMLButtonElement;
  uninstallPreserveSaveDataCheckbox: HTMLInputElement;
  installProgress: HTMLProgressElement;
  installStatus: HTMLSpanElement;
  preservedSaveDataStatus: HTMLDivElement;
  launchModdedButton: HTMLButtonElement;
  launchVanillaButton: HTMLButtonElement;
  createModdedShortcutButton: HTMLButtonElement;
  launchStatus: HTMLSpanElement;
  profileReadyStatus: HTMLDivElement;
  migrationExportButton: HTMLButtonElement;
  migrationEncryptionEnabledInput: HTMLInputElement;
  migrationExportPasswordInput: HTMLInputElement;
  migrationImportPathInput: HTMLInputElement;
  migrationImportPasswordInput: HTMLInputElement;
  migrationImportButton: HTMLButtonElement;
  migrationStatus: HTMLDivElement;
  presetRefreshButton: HTMLButtonElement;
  presetSelectAllLocalButton: HTMLButtonElement;
  presetClearLocalButton: HTMLButtonElement;
  presetLocalList: HTMLDivElement;
  presetExportPathInput: HTMLInputElement;
  presetExportButton: HTMLButtonElement;
  presetImportPathInput: HTMLInputElement;
  presetInspectButton: HTMLButtonElement;
  presetSelectAllArchiveButton: HTMLButtonElement;
  presetClearArchiveButton: HTMLButtonElement;
  presetImportButton: HTMLButtonElement;
  presetArchiveList: HTMLDivElement;
  presetStatus: HTMLDivElement;
  epicLoginWebviewButton: HTMLButtonElement;
  epicLogoutButton: HTMLButtonElement;
  epicAuthStatus: HTMLSpanElement;
  epicAuthCodeInput: HTMLInputElement;
  epicLoginCodeButton: HTMLButtonElement;
  checkUpdateButton: HTMLButtonElement;
  updateStatus: HTMLSpanElement;
  githubTokenInput: HTMLInputElement;
  saveTokenButton: HTMLButtonElement;
  clearTokenButton: HTMLButtonElement;
  officialLinkButtons: HTMLDivElement;
  themeToggleSystem: HTMLButtonElement;
  themeToggleLight: HTMLButtonElement;
  themeToggleDark: HTMLButtonElement;
}

function mustElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

/**
 * テンプレート描画後に必要な要素をすべて取得する。
 * ここで失敗する場合はテンプレート破壊を即座に検知できる。
 */
export function collectAppDom(): AppDom {
  return {
    appVersion: mustElement<HTMLSpanElement>("#app-version"),
    replayOnboardingButton: mustElement<HTMLButtonElement>("#replay-onboarding"),
    languageSelect: mustElement<HTMLSelectElement>("#language-select"),
    amongUsPathInput: mustElement<HTMLInputElement>("#among-us-path"),
    saveAmongUsPathButton: mustElement<HTMLButtonElement>("#save-among-us-path"),
    detectAmongUsPathButton: mustElement<HTMLButtonElement>("#detect-among-us-path"),
    platformSelect: mustElement<HTMLSelectElement>("#platform-select"),
    releaseSelect: mustElement<HTMLSelectElement>("#release-select"),
    refreshReleasesButton: mustElement<HTMLButtonElement>("#refresh-releases"),
    profilePath: mustElement<HTMLElement>("#profile-path"),
    openAmongUsFolderButton: mustElement<HTMLButtonElement>("#open-among-us-folder"),
    openProfileFolderButton: mustElement<HTMLButtonElement>("#open-profile-folder"),
    closeToTrayOnCloseInput: mustElement<HTMLInputElement>("#close-to-tray-on-close"),
    installButton: mustElement<HTMLButtonElement>("#install-snr"),
    installRestoreSaveDataCheckbox: mustElement<HTMLInputElement>("#install-restore-save-data"),
    uninstallButton: mustElement<HTMLButtonElement>("#uninstall-snr"),
    uninstallPreserveSaveDataCheckbox: mustElement<HTMLInputElement>(
      "#uninstall-preserve-save-data",
    ),
    installProgress: mustElement<HTMLProgressElement>("#install-progress"),
    installStatus: mustElement<HTMLSpanElement>("#install-status"),
    preservedSaveDataStatus: mustElement<HTMLDivElement>("#preserved-save-data-status"),
    launchModdedButton: mustElement<HTMLButtonElement>("#launch-modded"),
    launchVanillaButton: mustElement<HTMLButtonElement>("#launch-vanilla"),
    createModdedShortcutButton: mustElement<HTMLButtonElement>("#create-modded-shortcut"),
    launchStatus: mustElement<HTMLSpanElement>("#launch-status"),
    profileReadyStatus: mustElement<HTMLDivElement>("#profile-ready-status"),
    migrationExportButton: mustElement<HTMLButtonElement>("#migration-export"),
    migrationEncryptionEnabledInput: mustElement<HTMLInputElement>("#migration-encryption-enabled"),
    migrationExportPasswordInput: mustElement<HTMLInputElement>("#migration-export-password"),
    migrationImportPathInput: mustElement<HTMLInputElement>("#migration-import-path"),
    migrationImportPasswordInput: mustElement<HTMLInputElement>("#migration-import-password"),
    migrationImportButton: mustElement<HTMLButtonElement>("#migration-import"),
    migrationStatus: mustElement<HTMLDivElement>("#migration-status"),
    presetRefreshButton: mustElement<HTMLButtonElement>("#preset-refresh"),
    presetSelectAllLocalButton: mustElement<HTMLButtonElement>("#preset-select-all-local"),
    presetClearLocalButton: mustElement<HTMLButtonElement>("#preset-clear-local"),
    presetLocalList: mustElement<HTMLDivElement>("#preset-local-list"),
    presetExportPathInput: mustElement<HTMLInputElement>("#preset-export-path"),
    presetExportButton: mustElement<HTMLButtonElement>("#preset-export"),
    presetImportPathInput: mustElement<HTMLInputElement>("#preset-import-path"),
    presetInspectButton: mustElement<HTMLButtonElement>("#preset-inspect"),
    presetSelectAllArchiveButton: mustElement<HTMLButtonElement>("#preset-select-all-archive"),
    presetClearArchiveButton: mustElement<HTMLButtonElement>("#preset-clear-archive"),
    presetImportButton: mustElement<HTMLButtonElement>("#preset-import"),
    presetArchiveList: mustElement<HTMLDivElement>("#preset-archive-list"),
    presetStatus: mustElement<HTMLDivElement>("#preset-status"),
    epicLoginWebviewButton: mustElement<HTMLButtonElement>("#epic-login-webview"),
    epicLogoutButton: mustElement<HTMLButtonElement>("#epic-logout"),
    epicAuthStatus: mustElement<HTMLSpanElement>("#epic-auth-status"),
    epicAuthCodeInput: mustElement<HTMLInputElement>("#epic-auth-code"),
    epicLoginCodeButton: mustElement<HTMLButtonElement>("#epic-login-code"),
    checkUpdateButton: mustElement<HTMLButtonElement>("#check-update"),
    updateStatus: mustElement<HTMLSpanElement>("#update-status"),
    githubTokenInput: mustElement<HTMLInputElement>("#github-token"),
    saveTokenButton: mustElement<HTMLButtonElement>("#save-token"),
    clearTokenButton: mustElement<HTMLButtonElement>("#clear-token"),
    officialLinkButtons: mustElement<HTMLDivElement>("#official-link-buttons"),
    themeToggleSystem: mustElement<HTMLButtonElement>("#theme-toggle-system"),
    themeToggleLight: mustElement<HTMLButtonElement>("#theme-toggle-light"),
    themeToggleDark: mustElement<HTMLButtonElement>("#theme-toggle-dark"),
  };
}
