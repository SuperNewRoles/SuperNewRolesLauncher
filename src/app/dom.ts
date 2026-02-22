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
  closeWebviewOnTrayBackgroundInput: HTMLInputElement;
  settingsGeneralStatus: HTMLSpanElement;
  reportNotificationsEnabledInput: HTMLInputElement;
  announceNotificationsEnabledInput: HTMLInputElement;
  settingsNotificationsStatus: HTMLSpanElement;
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
  settingsUpdateConfirmOverlay: HTMLDivElement;
  settingsUpdateConfirmOverlayBackdrop: HTMLDivElement;
  settingsUpdateConfirmCloseButton: HTMLButtonElement;
  settingsUpdateConfirmCancelButton: HTMLButtonElement;
  settingsUpdateConfirmAcceptButton: HTMLButtonElement;
  settingsUpdateConfirmMessage: HTMLParagraphElement;
  settingsMigrationOverlay: HTMLDivElement;
  settingsMigrationOverlayBackdrop: HTMLDivElement;
  settingsMigrationOverlayCloseButton: HTMLButtonElement;
  settingsMigrationOverlayCancelButton: HTMLButtonElement;
  settingsMigrationOverlayTitle: HTMLHeadingElement;
  settingsMigrationStepSelect: HTMLElement;
  settingsMigrationSelectedPath: HTMLParagraphElement;
  settingsMigrationPickPathButton: HTMLButtonElement;
  settingsMigrationStepSelectNextButton: HTMLButtonElement;
  settingsMigrationStepPassword: HTMLElement;
  settingsMigrationPasswordInput: HTMLInputElement;
  settingsMigrationPasswordError: HTMLDivElement;
  settingsMigrationStepPasswordCancelButton: HTMLButtonElement;
  settingsMigrationStepPasswordNextButton: HTMLButtonElement;
  settingsMigrationStepProcessing: HTMLElement;
  settingsMigrationProcessingMessage: HTMLParagraphElement;
  settingsMigrationStepResult: HTMLElement;
  settingsMigrationResultTitle: HTMLHeadingElement;
  settingsMigrationResultMessage: HTMLParagraphElement;
  settingsMigrationResultRetryButton: HTMLButtonElement;
  settingsMigrationResultCloseButton: HTMLButtonElement;
  installStatus: HTMLSpanElement;
  launchModdedButton: HTMLButtonElement;
  launchVanillaButton: HTMLButtonElement;
  createModdedShortcutButton: HTMLButtonElement;
  launchStatus: HTMLSpanElement;
  migrationExportButton: HTMLButtonElement;
  migrationImportButton: HTMLButtonElement;
  migrationStatus: HTMLDivElement;
  presetOpenImportButton: HTMLButtonElement;
  presetOpenExportButton: HTMLButtonElement;
  presetOverlay: HTMLDivElement;
  presetOverlayBackdrop: HTMLDivElement;
  presetOverlayCloseButton: HTMLButtonElement;
  presetOverlayTitle: HTMLHeadingElement;
  presetOverlayImportScreen: HTMLElement;
  presetOverlayExportScreen: HTMLElement;
  presetRefreshButton: HTMLButtonElement;
  presetSelectAllLocalButton: HTMLButtonElement;
  presetClearLocalButton: HTMLButtonElement;
  presetLocalList: HTMLDivElement;
  presetExportButton: HTMLButtonElement;
  presetSelectAllArchiveButton: HTMLButtonElement;
  presetClearArchiveButton: HTMLButtonElement;
  presetImportButton: HTMLButtonElement;
  presetArchiveList: HTMLDivElement;
  presetFeedbackOverlay: HTMLDivElement;
  presetFeedbackOverlayBackdrop: HTMLDivElement;
  presetFeedbackTitle: HTMLHeadingElement;
  presetFeedbackMessage: HTMLParagraphElement;
  presetFeedbackList: HTMLUListElement;
  presetFeedbackPrimaryButton: HTMLButtonElement;
  presetFeedbackSecondaryButton: HTMLButtonElement;
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
  // 必須要素はここで取得失敗を即例外化し、テンプレート破壊を早期検知する。
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function optionalElement<K extends keyof HTMLElementTagNameMap>(
  selector: string,
  fallbackTagName: K,
): HTMLElementTagNameMap[K] {
  // 機能フラグで非表示になり得る要素は optional として扱う。
  const element = document.querySelector<HTMLElementTagNameMap[K]>(selector);
  if (element) {
    return element;
  }
  // 呼び出し側の null チェックを減らすため、ダミー要素を返す。
  const fallback = document.createElement(fallbackTagName);
  // hidden にしておくことで、誤って DOM に追加されても描画へ影響しない。
  fallback.hidden = true;
  return fallback;
}

/**
 * テンプレート描画後に必要な要素をすべて取得する。
 * ここで失敗する場合はテンプレート破壊を即座に検知できる。
 */
export function collectAppDom(): AppDom {
  // テンプレートの id と 1:1 で対応する要素参照をここで確定させる。
  return {
    appVersion: mustElement<HTMLSpanElement>("#app-version"),
    settingsAppVersion: mustElement<HTMLSpanElement>("#settings-app-version"),
    replayOnboardingButton: mustElement<HTMLButtonElement>("#replay-onboarding"),
    languageSelect: mustElement<HTMLSelectElement>("#language-select"),
    reselectAmongUsButton: mustElement<HTMLButtonElement>("#reselect-among-us-button"),
    openAmongUsFolderButton: mustElement<HTMLButtonElement>("#open-among-us-folder"),
    openProfileFolderButton: mustElement<HTMLButtonElement>("#open-profile-folder"),
    closeToTrayOnCloseInput: mustElement<HTMLInputElement>("#close-to-tray-on-close"),
    closeWebviewOnTrayBackgroundInput: mustElement<HTMLInputElement>(
      "#close-webview-on-tray-background",
    ),
    settingsGeneralStatus: mustElement<HTMLSpanElement>("#settings-general-status"),
    reportNotificationsEnabledInput: mustElement<HTMLInputElement>(
      "#settings-report-notifications-enabled",
    ),
    announceNotificationsEnabledInput: mustElement<HTMLInputElement>(
      "#settings-announce-notifications-enabled",
    ),
    settingsNotificationsStatus: mustElement<HTMLSpanElement>("#settings-notifications-status"),
    settingsShortcutStatus: mustElement<HTMLSpanElement>("#settings-shortcut-status"),
    uninstallButton: mustElement<HTMLButtonElement>("#uninstall-snr"),
    settingsSupportDiscordLinkButton: optionalElement("#settings-support-discord-link", "button"),
    settingsAmongUsOverlay: mustElement<HTMLDivElement>("#settings-among-us-overlay"),
    settingsAmongUsOverlayBackdrop: mustElement<HTMLDivElement>(
      "#settings-among-us-overlay-backdrop",
    ),
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
    settingsUninstallConfirmOverlay: mustElement<HTMLDivElement>(
      "#settings-uninstall-confirm-overlay",
    ),
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
    settingsUpdateConfirmOverlay: mustElement<HTMLDivElement>("#settings-update-confirm-overlay"),
    settingsUpdateConfirmOverlayBackdrop: mustElement<HTMLDivElement>(
      "#settings-update-confirm-overlay-backdrop",
    ),
    settingsUpdateConfirmCloseButton: mustElement<HTMLButtonElement>(
      "#settings-update-confirm-close",
    ),
    settingsUpdateConfirmCancelButton: mustElement<HTMLButtonElement>(
      "#settings-update-confirm-cancel",
    ),
    settingsUpdateConfirmAcceptButton: mustElement<HTMLButtonElement>(
      "#settings-update-confirm-accept",
    ),
    settingsUpdateConfirmMessage: mustElement<HTMLParagraphElement>(
      "#settings-update-confirm-message",
    ),
    settingsMigrationOverlay: optionalElement("#settings-migration-overlay", "div"),
    settingsMigrationOverlayBackdrop: optionalElement(
      "#settings-migration-overlay-backdrop",
      "div",
    ),
    settingsMigrationOverlayCloseButton: optionalElement(
      "#settings-migration-overlay-close",
      "button",
    ),
    settingsMigrationOverlayCancelButton: optionalElement(
      "#settings-migration-overlay-cancel",
      "button",
    ),
    settingsMigrationOverlayTitle: optionalElement("#settings-migration-overlay-title", "h2"),
    settingsMigrationStepSelect: optionalElement("#settings-migration-step-select", "section"),
    settingsMigrationSelectedPath: optionalElement("#settings-migration-selected-path", "p"),
    settingsMigrationPickPathButton: optionalElement("#settings-migration-pick-path", "button"),
    settingsMigrationStepSelectNextButton: optionalElement(
      "#settings-migration-step-select-next",
      "button",
    ),
    settingsMigrationStepPassword: optionalElement("#settings-migration-step-password", "section"),
    settingsMigrationPasswordInput: optionalElement("#settings-migration-password-input", "input"),
    settingsMigrationPasswordError: optionalElement("#settings-migration-password-error", "div"),
    settingsMigrationStepPasswordCancelButton: optionalElement(
      "#settings-migration-step-password-cancel",
      "button",
    ),
    settingsMigrationStepPasswordNextButton: optionalElement(
      "#settings-migration-step-password-next",
      "button",
    ),
    settingsMigrationStepProcessing: optionalElement(
      "#settings-migration-step-processing",
      "section",
    ),
    settingsMigrationProcessingMessage: optionalElement(
      "#settings-migration-processing-message",
      "p",
    ),
    settingsMigrationStepResult: optionalElement("#settings-migration-step-result", "section"),
    settingsMigrationResultTitle: optionalElement("#settings-migration-result-title", "h3"),
    settingsMigrationResultMessage: optionalElement("#settings-migration-result-message", "p"),
    settingsMigrationResultRetryButton: optionalElement(
      "#settings-migration-result-retry",
      "button",
    ),
    settingsMigrationResultCloseButton: optionalElement(
      "#settings-migration-result-close",
      "button",
    ),
    installStatus: mustElement<HTMLSpanElement>("#install-status"),
    launchModdedButton: mustElement<HTMLButtonElement>("#launch-modded"),
    launchVanillaButton: mustElement<HTMLButtonElement>("#launch-vanilla"),
    createModdedShortcutButton: mustElement<HTMLButtonElement>("#create-modded-shortcut"),
    launchStatus: mustElement<HTMLSpanElement>("#launch-status"),
    migrationExportButton: optionalElement("#migration-export", "button"),
    migrationImportButton: optionalElement("#migration-import", "button"),
    migrationStatus: optionalElement("#migration-status", "div"),
    presetOpenImportButton: optionalElement("#preset-open-import", "button"),
    presetOpenExportButton: optionalElement("#preset-open-export", "button"),
    presetOverlay: optionalElement("#preset-overlay", "div"),
    presetOverlayBackdrop: optionalElement("#preset-overlay-backdrop", "div"),
    presetOverlayCloseButton: optionalElement("#preset-overlay-close", "button"),
    presetOverlayTitle: optionalElement("#preset-overlay-title", "h2"),
    presetOverlayImportScreen: optionalElement("#preset-overlay-import-screen", "section"),
    presetOverlayExportScreen: optionalElement("#preset-overlay-export-screen", "section"),
    presetRefreshButton: optionalElement("#preset-refresh", "button"),
    presetSelectAllLocalButton: optionalElement("#preset-select-all-local", "button"),
    presetClearLocalButton: optionalElement("#preset-clear-local", "button"),
    presetLocalList: optionalElement("#preset-local-list", "div"),
    presetExportButton: optionalElement("#preset-export", "button"),
    presetSelectAllArchiveButton: optionalElement("#preset-select-all-archive", "button"),
    presetClearArchiveButton: optionalElement("#preset-clear-archive", "button"),
    presetImportButton: optionalElement("#preset-import", "button"),
    presetArchiveList: optionalElement("#preset-archive-list", "div"),
    presetFeedbackOverlay: optionalElement("#preset-feedback-overlay", "div"),
    presetFeedbackOverlayBackdrop: optionalElement("#preset-feedback-overlay-backdrop", "div"),
    presetFeedbackTitle: optionalElement("#preset-feedback-title", "h2"),
    presetFeedbackMessage: optionalElement("#preset-feedback-message", "p"),
    presetFeedbackList: optionalElement("#preset-feedback-list", "ul"),
    presetFeedbackPrimaryButton: optionalElement("#preset-feedback-primary", "button"),
    presetFeedbackSecondaryButton: optionalElement("#preset-feedback-secondary", "button"),
    epicLoginWebviewButton: optionalElement("#epic-login-webview", "button"),
    epicLogoutButton: optionalElement("#epic-logout", "button"),
    epicAuthStatus: optionalElement("#epic-auth-status", "span"),
    checkUpdateButton: mustElement<HTMLButtonElement>("#check-update"),
    updateStatus: mustElement<HTMLSpanElement>("#update-status"),
    officialLinkButtons: optionalElement("#official-link-buttons", "div"),
    officialLinkIcons: optionalElement("#official-link-icons", "div"),
    themeToggleSystem: mustElement<HTMLButtonElement>("#theme-toggle-system"),
    themeToggleLight: mustElement<HTMLButtonElement>("#theme-toggle-light"),
    themeToggleDark: mustElement<HTMLButtonElement>("#theme-toggle-dark"),
  };
}
