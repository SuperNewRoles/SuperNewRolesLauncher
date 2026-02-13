/**
 * DOM要素アクセスを集約するモジュール。
 * セレクタ変更時の影響範囲を最小化するため、取得処理を一箇所に閉じ込める。
 */
export interface AppDom {
  appVersion: HTMLSpanElement;
  settingsAppVersion: HTMLSpanElement;
  replayOnboardingButton: HTMLButtonElement;
  languageSelect: HTMLSelectElement;

  reselectAmongUsButton: HTMLButtonElement;
  openAmongUsFolderButton: HTMLButtonElement;
  openProfileFolderButton: HTMLButtonElement;
  closeToTrayOnCloseInput: HTMLInputElement;
  settingsGeneralStatus: HTMLSpanElement;
  settingsShortcutStatus: HTMLSpanElement;
  uninstallButton: HTMLButtonElement;
  settingsSupportDiscordLinkButton: HTMLButtonElement;
  settingsAmongUsOverlay: HTMLDivElement;
  settingsAmongUsOverlayBackdrop: HTMLDivElement;
  settingsAmongUsOverlayCloseButton: HTMLButtonElement;
  settingsAmongUsOverlayCancelButton: HTMLButtonElement;
  settingsAmongUsOverlayError: HTMLDivElement;
  settingsAmongUsCandidateList: HTMLDivElement;
  settingsAmongUsCandidateEmpty: HTMLParagraphElement;
  settingsAmongUsManualSelectButton: HTMLButtonElement;
  settingsUninstallConfirmOverlay: HTMLDivElement;
  settingsUninstallConfirmOverlayBackdrop: HTMLDivElement;
  settingsUninstallConfirmCloseButton: HTMLButtonElement;
  settingsUninstallConfirmCancelButton: HTMLButtonElement;
  settingsUninstallConfirmAcceptButton: HTMLButtonElement;
  installStatus: HTMLSpanElement;
  launchModdedButton: HTMLButtonElement;
  launchVanillaButton: HTMLButtonElement;
  createModdedShortcutButton: HTMLButtonElement;
  launchStatus: HTMLSpanElement;
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
  checkUpdateButton: HTMLButtonElement;
  updateStatus: HTMLSpanElement;
  officialLinkButtons: HTMLDivElement;
  officialLinkIcons: HTMLDivElement;
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
    settingsAppVersion: mustElement<HTMLSpanElement>("#settings-app-version"),
    replayOnboardingButton: mustElement<HTMLButtonElement>("#replay-onboarding"),
    languageSelect: mustElement<HTMLSelectElement>("#language-select"),
    reselectAmongUsButton: mustElement<HTMLButtonElement>("#reselect-among-us-button"),
    openAmongUsFolderButton: mustElement<HTMLButtonElement>("#open-among-us-folder"),
    openProfileFolderButton: mustElement<HTMLButtonElement>("#open-profile-folder"),
    closeToTrayOnCloseInput: mustElement<HTMLInputElement>("#close-to-tray-on-close"),
    settingsGeneralStatus: mustElement<HTMLSpanElement>("#settings-general-status"),
    settingsShortcutStatus: mustElement<HTMLSpanElement>("#settings-shortcut-status"),
    uninstallButton: mustElement<HTMLButtonElement>("#uninstall-snr"),
    settingsSupportDiscordLinkButton: mustElement<HTMLButtonElement>(
      "#settings-support-discord-link",
    ),
    settingsAmongUsOverlay: mustElement<HTMLDivElement>("#settings-among-us-overlay"),
    settingsAmongUsOverlayBackdrop: mustElement<HTMLDivElement>("#settings-among-us-overlay-backdrop"),
    settingsAmongUsOverlayCloseButton: mustElement<HTMLButtonElement>(
      "#settings-among-us-overlay-close",
    ),
    settingsAmongUsOverlayCancelButton: mustElement<HTMLButtonElement>(
      "#settings-among-us-overlay-cancel",
    ),
    settingsAmongUsOverlayError: mustElement<HTMLDivElement>("#settings-among-us-overlay-error"),
    settingsAmongUsCandidateList: mustElement<HTMLDivElement>("#settings-among-us-candidate-list"),
    settingsAmongUsCandidateEmpty: mustElement<HTMLParagraphElement>(
      "#settings-among-us-candidate-empty",
    ),
    settingsAmongUsManualSelectButton: mustElement<HTMLButtonElement>(
      "#settings-among-us-manual-select",
    ),
    settingsUninstallConfirmOverlay: mustElement<HTMLDivElement>("#settings-uninstall-confirm-overlay"),
    settingsUninstallConfirmOverlayBackdrop: mustElement<HTMLDivElement>(
      "#settings-uninstall-confirm-overlay-backdrop",
    ),
    settingsUninstallConfirmCloseButton: mustElement<HTMLButtonElement>(
      "#settings-uninstall-confirm-close",
    ),
    settingsUninstallConfirmCancelButton: mustElement<HTMLButtonElement>(
      "#settings-uninstall-confirm-cancel",
    ),
    settingsUninstallConfirmAcceptButton: mustElement<HTMLButtonElement>(
      "#settings-uninstall-confirm-accept",
    ),
    installStatus: mustElement<HTMLSpanElement>("#install-status"),
    launchModdedButton: mustElement<HTMLButtonElement>("#launch-modded"),
    launchVanillaButton: mustElement<HTMLButtonElement>("#launch-vanilla"),
    createModdedShortcutButton: mustElement<HTMLButtonElement>("#create-modded-shortcut"),
    launchStatus: mustElement<HTMLSpanElement>("#launch-status"),
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
    checkUpdateButton: mustElement<HTMLButtonElement>("#check-update"),
    updateStatus: mustElement<HTMLSpanElement>("#update-status"),
    officialLinkButtons: mustElement<HTMLDivElement>("#official-link-buttons"),
    officialLinkIcons: mustElement<HTMLDivElement>("#official-link-icons"),
    themeToggleSystem: mustElement<HTMLButtonElement>("#theme-toggle-system"),
    themeToggleLight: mustElement<HTMLButtonElement>("#theme-toggle-light"),
    themeToggleDark: mustElement<HTMLButtonElement>("#theme-toggle-dark"),
  };
}
