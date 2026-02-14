import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import React from "react";
import { type Root, createRoot } from "react-dom/client";
import {
  type LocaleCode,
  createTranslator,
  normalizeLocale,
  resolveInitialLocale,
  saveLocale,
} from "../i18n";
import OnboardingWizard from "../onboarding/OnboardingWizard";
import { ReportCenter } from "../report/ReportCenter";
import { OFFICIAL_LINKS, REPORTING_NOTIFICATION_STORAGE_KEY } from "./constants";
import { collectAppDom } from "./dom";
import {
  getPlatformIconPath,
  getPlatformLabelKey,
  normalizePlatformCandidates,
} from "./platformSelection";
import {
  epicLoginWebview,
  epicLogout,
  epicSessionRestore,
  epicStatusGet,
  finderDetectPlatform,
  finderDetectPlatforms,
  launchAutolaunchErrorTake,
  launchGameRunningGet,
  launchModded,
  launchShortcutCreate,
  launchVanilla,
  migrationExport,
  migrationImport,
  presetsExport,
  presetsImportArchive,
  presetsInspectArchive,
  presetsListLocal,
  reportingLogSourceGet,
  reportingMessageSend,
  reportingMessagesList,
  reportingNotificationFlagGet,
  reportingPrepare,
  reportingReportSend,
  reportingThreadsList,
  settingsGet,
  settingsProfileReady,
  settingsUpdate,
  snrPreservedSaveDataStatus,
  snrUninstall,
} from "./services/tauriClient";
import { computeControlState } from "./state/selectors";
import { createAppStore } from "./state/store";
import { renderAppTemplate } from "./template";
import { type ThemePreference, applyTheme, getStoredTheme, setStoredTheme } from "./theme";
import type {
  EpicLoginStatus,
  GamePlatform,
  GameStatePayload,
  InstallProgressPayload,
  InstallResult,
  LauncherSettings,
  LauncherSettingsInput,
  MigrationExportResult,
  MigrationImportResult,
  PreservedSaveDataStatus,
  PresetExportResult,
  PresetImportResult,
  PresetImportSelectionInput,
  PresetSummary,
  ReportMessage,
  ReportThread,
  ReportType,
  ReportingLogSourceInfo,
  ReportingPrepareResult,
  ReportingSendResult,
  SendReportInput,
  SnrReleaseSummary,
  UninstallResult,
} from "./types";

/**
 * フロントエンドの実行本体。
 * 画面描画・イベント結線・Tauri通信をこのモジュールで統合管理する。
 */
const REPORT_HOME_NOTIFICATION_FETCH_GAP_MS = 30_000;
const REPORT_HOME_NOTIFICATION_POLL_INTERVAL_MS = 180_000;
const LAUNCHER_MINIMIZE_EFFECT_DURATION_MS = 280;
const LAUNCHER_AUTO_MINIMIZE_WINDOW_MS = 30_000;
const SETTINGS_OVERLAY_TRANSITION_MS = 220;
type MainTabId = "home" | "report" | "preset" | "settings";
type SettingsCategoryId = "general" | "epic" | "migration" | "credit" | "app-version";
const DEFAULT_SETTINGS_CATEGORY: SettingsCategoryId = "general";

function isMainTabId(value: string | undefined): value is MainTabId {
  return value === "home" || value === "report" || value === "preset" || value === "settings";
}

function isSettingsCategoryId(value: string | undefined): value is SettingsCategoryId {
  return (
    value === "general" ||
    value === "epic" ||
    value === "migration" ||
    value === "credit" ||
    value === "app-version"
  );
}

export async function runLauncher(container?: HTMLElement | null): Promise<void> {
  const app = container ?? document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("#app not found");
  }

  const currentLocale = resolveInitialLocale();
  const t = createTranslator(currentLocale);
  document.documentElement.lang = currentLocale;
  const appWindow = getCurrentWindow();
  try {
    localStorage.removeItem("updater.githubToken");
  } catch {
    // ignore storage failures
  }

  app.innerHTML = renderAppTemplate(currentLocale, t);
  const mainLayout = app.querySelector<HTMLElement>(".main-layout");

  const {
    appVersion,
    settingsAppVersion,
    replayOnboardingButton,
    languageSelect,

    reselectAmongUsButton,
    openAmongUsFolderButton,
    openProfileFolderButton,
    closeToTrayOnCloseInput,
    settingsGeneralStatus,
    settingsShortcutStatus,
    uninstallButton,
    settingsSupportDiscordLinkButton,
    settingsAmongUsOverlay,
    settingsAmongUsOverlayBackdrop,
    settingsAmongUsOverlayCloseButton,
    settingsAmongUsOverlayCancelButton,
    settingsAmongUsOverlayError,
    settingsAmongUsCandidateList,
    settingsAmongUsCandidateEmpty,
    settingsAmongUsManualSelectButton,
    settingsUninstallConfirmOverlay,
    settingsUninstallConfirmOverlayBackdrop,
    settingsUninstallConfirmCloseButton,
    settingsUninstallConfirmCancelButton,
    settingsUninstallConfirmAcceptButton,
    installStatus,
    launchModdedButton,
    launchVanillaButton,
    createModdedShortcutButton,
    launchStatus,
    migrationExportButton,
    migrationEncryptionEnabledInput,
    migrationExportPasswordInput,
    migrationImportPathInput,
    migrationImportPasswordInput,
    migrationImportButton,
    migrationStatus,
    presetRefreshButton,
    presetSelectAllLocalButton,
    presetClearLocalButton,
    presetLocalList,
    presetExportPathInput,
    presetExportButton,
    presetImportPathInput,
    presetInspectButton,
    presetSelectAllArchiveButton,
    presetClearArchiveButton,
    presetImportButton,
    presetArchiveList,
    presetStatus,
    epicLoginWebviewButton,
    epicLogoutButton,
    epicAuthStatus,
    checkUpdateButton,
    updateStatus,
    officialLinkButtons,
    officialLinkIcons,
    themeToggleSystem,
    themeToggleLight,
    themeToggleDark,
  } = collectAppDom();

  function updateThemeButtons(theme: ThemePreference) {
    themeToggleSystem.classList.toggle("active", theme === "system");
    themeToggleLight.classList.toggle("active", theme === "light");
    themeToggleDark.classList.toggle("active", theme === "dark");
    themeToggleSystem.setAttribute("aria-pressed", theme === "system" ? "true" : "false");
    themeToggleLight.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    themeToggleDark.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }

  const currentTheme = getStoredTheme();
  updateThemeButtons(currentTheme);

  themeToggleSystem.addEventListener("click", () => {
    setStoredTheme("system");
    applyTheme("system");
    updateThemeButtons("system");
  });
  themeToggleLight.addEventListener("click", () => {
    setStoredTheme("light");
    applyTheme("light");
    updateThemeButtons("light");
  });
  themeToggleDark.addEventListener("click", () => {
    setStoredTheme("dark");
    applyTheme("dark");
    updateThemeButtons("dark");
  });

  // タブ切り替え
  function switchTab(tabId: MainTabId) {
    activeTab = tabId;

    const reportPanel = document.querySelector<HTMLDivElement>("#tab-report");
    const settingsPanel = document.querySelector<HTMLDivElement>("#tab-settings");
    const homeContent = document.querySelector<HTMLDivElement>("#tab-home .home-content");

    for (const panel of document.querySelectorAll(".tab-panel")) {
      panel.classList.toggle("tab-panel-active", (panel as HTMLElement).dataset.tab === tabId);
    }

    if (reportPanel) {
      reportPanel.classList.remove("tab-report-enter");
    }
    if (settingsPanel) {
      settingsPanel.classList.remove("tab-settings-enter");
    }

    if (homeContent) {
      homeContent.classList.remove("home-content-enter");
    }
    for (const el of document.querySelectorAll(".tab-bar-item")) {
      const isSelected = (el as HTMLElement).dataset.tab === tabId;
      el.classList.toggle("tab-bar-item-active", isSelected);
      el.setAttribute("aria-selected", isSelected ? "true" : "false");
    }

    // Mount/unmount ReportCenter based on tab
    if (tabId === "report") {
      mountReportCenter();
      if (reportPanel) {
        requestAnimationFrame(() => {
          reportPanel.classList.add("tab-report-enter");
        });

        reportPanel.addEventListener(
          "animationend",
          (event) => {
            if (event.target !== reportPanel || event.animationName !== "report-tab-enter") {
              return;
            }
            reportPanel?.classList.remove("tab-report-enter");
          },
          { once: true },
        );
      }
    } else if (tabId === "settings" && settingsPanel) {
      unmountReportCenter();
      requestAnimationFrame(() => {
        settingsPanel.classList.add("tab-settings-enter");
      });

      settingsPanel.addEventListener(
        "animationend",
        (event) => {
          if (event.target !== settingsPanel || event.animationName !== "settings-tab-enter") {
            return;
          }
          settingsPanel.classList.remove("tab-settings-enter");
        },
        { once: true },
      );
    } else {
      unmountReportCenter();
      if (tabId === "home" && homeContent) {
        requestAnimationFrame(() => {
          homeContent.classList.add("home-content-enter");
        });

        homeContent.addEventListener(
          "animationend",
          (event) => {
            if (event.target !== homeContent) {
              return;
            }
            homeContent.classList.remove("home-content-enter");
          },
          { once: true },
        );
      }
    }

    if (tabId === "home") {
      startHomeNotificationPolling();
    } else {
      stopHomeNotificationPolling();
    }
  }

  for (const btn of document.querySelectorAll(".tab-bar-item")) {
    btn.addEventListener("click", () => {
      const tabId = (btn as HTMLElement).dataset.tab;
      if (isMainTabId(tabId)) {
        switchTab(tabId);
      }
    });
  }

  const reportCenterTabButton = document.querySelector<HTMLButtonElement>("#report-center-tab");
  reportCenterTabButton?.addEventListener("click", () => {
    switchTab("report");
  });
  const reportCenterBadge = document.querySelector<HTMLSpanElement>("#report-center-badge");
  const epicAuthStatusBox = document.querySelector<HTMLDivElement>("#epic-auth-status-box");
  const epicAuthStatusIcon = document.querySelector<HTMLDivElement>("#epic-auth-status-icon");
  const settingsCategoryButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-settings-category]"),
  );
  const settingsCategoryPanels = Array.from(
    document.querySelectorAll<HTMLElement>("[data-settings-panel]"),
  );

  function switchSettingsCategory(category: SettingsCategoryId): void {
    for (const button of settingsCategoryButtons) {
      const selected = button.dataset.settingsCategory === category;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    }

    for (const panel of settingsCategoryPanels) {
      const selected = panel.dataset.settingsPanel === category;
      panel.classList.toggle("is-active", selected);
      panel.hidden = !selected;
      panel.setAttribute("aria-hidden", selected ? "false" : "true");
    }
  }

  for (const button of settingsCategoryButtons) {
    button.addEventListener("click", () => {
      const category = button.dataset.settingsCategory;
      if (isSettingsCategoryId(category)) {
        switchSettingsCategory(category);
      }
    });
  }
  switchSettingsCategory(DEFAULT_SETTINGS_CATEGORY);

  function setEpicAuthVisualState(state: "logged-out" | "logged-in" | "error"): void {
    if (!epicAuthStatusBox || !epicAuthStatusIcon) {
      return;
    }
    epicAuthStatusBox.classList.toggle("is-logged-in", state === "logged-in");
    epicAuthStatusBox.classList.toggle("is-error", state === "error");
    epicAuthStatusIcon.textContent = state === "logged-in" ? "✓" : state === "error" ? "⚠" : "🔐";
  }

  function renderEpicActionButtons(loggedIn: boolean): void {
    epicLoginWebviewButton.hidden = loggedIn;
    epicLogoutButton.hidden = !loggedIn;
    epicLoginWebviewButton.setAttribute("aria-hidden", loggedIn ? "true" : "false");
    epicLogoutButton.setAttribute("aria-hidden", loggedIn ? "false" : "true");
  }

  renderEpicActionButtons(false);

  // 通知設定は永続値を先に確定し、store初期値とローカル変数を揃える。
  const initialReportingNotificationEnabled =
    localStorage.getItem(REPORTING_NOTIFICATION_STORAGE_KEY) === "1";
  // signalsストアは段階移行用に導入し、ボタン活性判定の入力を一元化する。
  const appStore = createAppStore(initialReportingNotificationEnabled);

  let settings: LauncherSettings | null = null;
  const releases: SnrReleaseSummary[] = [];
  let profileIsReady = false;
  let gameRunning = false;
  const installInProgress = false;
  let uninstallInProgress = false;
  let launchInProgress = false;
  let creatingShortcut = false;
  const releasesLoading = false;
  let checkingUpdate = false;
  let epicLoggedIn = false;
  let migrationExporting = false;
  let migrationImporting = false;
  let presetLoading = false;
  let presetExporting = false;
  let presetInspecting = false;
  let presetImporting = false;
  let localPresets: PresetSummary[] = [];
  let archivePresets: PresetSummary[] = [];

  let preservedSaveDataAvailable = false;
  let preservedSaveDataFiles = 0;
  let gameStatePollTimer: number | null = null;
  let gameStatePolling = false;
  const reportingNotificationEnabled = initialReportingNotificationEnabled;
  let onboardingRoot: Root | null = null;
  let reportCenterRoot: Root | null = null;
  let activeTab: MainTabId = "home";
  let reportHomeNotificationLastFetchedAt = 0;
  let reportHomeNotificationFetching = false;
  let reportHomeNotificationPollTimer: number | null = null;
  let launcherAutoMinimizePending = false;
  let launcherAutoMinimizeTimer: number | null = null;
  let launcherMinimizing = false;
  let amongUsOverlayLoading = false;
  const overlayAnimationTimers = new WeakMap<HTMLDivElement, number>();
  const overlayCloseTimers = new WeakMap<HTMLDivElement, number>();

  function mountOnboarding() {
    const containerId = "onboarding-root";
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement("div");
      container.id = containerId;
      document.body.appendChild(container);
    }

    if (!onboardingRoot) {
      onboardingRoot = createRoot(container);
    }

    const handleComplete = async () => {
      try {
        settings = await settingsUpdate({ onboardingCompleted: true });
      } catch (error) {
        console.warn("Failed to persist onboarding completion:", error);
      } finally {
        if (onboardingRoot) {
          onboardingRoot.unmount();
          onboardingRoot = null;
        }
        container?.remove();
      }
    };

    onboardingRoot.render(<OnboardingWizard onComplete={handleComplete} />);
  }

  function mountReportCenter() {
    const containerId = "report-center-root";
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!reportCenterRoot) {
      reportCenterRoot = createRoot(container);
    }

    reportCenterRoot.render(<ReportCenter t={t} />);
  }

  function unmountReportCenter() {
    if (reportCenterRoot) {
      reportCenterRoot.unmount();
      reportCenterRoot = null;
    }
  }

  function setReportCenterNotificationBadge(hasUnread: boolean): void {
    if (!reportCenterBadge) {
      return;
    }

    reportCenterBadge.textContent = hasUnread ? "!" : "";
    reportCenterBadge.classList.toggle("is-visible", hasUnread);
  }

  function clearLauncherAutoMinimizePending(): void {
    launcherAutoMinimizePending = false;
    if (launcherAutoMinimizeTimer !== null) {
      window.clearTimeout(launcherAutoMinimizeTimer);
      launcherAutoMinimizeTimer = null;
    }
  }

  function queueLauncherAutoMinimize(): void {
    clearLauncherAutoMinimizePending();
    launcherAutoMinimizePending = true;
    launcherAutoMinimizeTimer = window.setTimeout(() => {
      clearLauncherAutoMinimizePending();
    }, LAUNCHER_AUTO_MINIMIZE_WINDOW_MS);
  }

  async function minimizeLauncherWindowWithEffect(): Promise<void> {
    if (launcherMinimizing) {
      return;
    }
    launcherMinimizing = true;

    try {
      if (mainLayout) {
        mainLayout.classList.remove("main-layout-minimize-out");
        // class再付与時に必ずアニメーションを再生する。
        void mainLayout.offsetWidth;
        mainLayout.classList.add("main-layout-minimize-out");
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, LAUNCHER_MINIMIZE_EFFECT_DURATION_MS);
      });

      await appWindow.minimize();
    } catch (error) {
      console.warn("Failed to minimize launcher window:", error);
      // 最小化失敗時でも起動処理は継続させる。
    } finally {
      if (mainLayout) {
        window.setTimeout(() => {
          mainLayout.classList.remove("main-layout-minimize-out");
        }, 80);
      }
      launcherMinimizing = false;
    }
  }

  async function refreshHomeNotificationState(force = false): Promise<void> {
    const now = Date.now();
    if (
      !force &&
      now - reportHomeNotificationLastFetchedAt < REPORT_HOME_NOTIFICATION_FETCH_GAP_MS
    ) {
      return;
    }

    if (reportHomeNotificationFetching) {
      return;
    }

    reportHomeNotificationFetching = true;
    try {
      const hasUnread = await reportingNotificationFlagGet();
      reportHomeNotificationLastFetchedAt = Date.now();
      setReportCenterNotificationBadge(hasUnread);
    } catch (error) {
      console.error("Failed to fetch reporting notification state:", error);
    } finally {
      reportHomeNotificationFetching = false;
    }
  }

  function startHomeNotificationPolling(): void {
    if (activeTab !== "home") {
      return;
    }

    if (reportHomeNotificationPollTimer === null) {
      reportHomeNotificationPollTimer = window.setInterval(() => {
        void refreshHomeNotificationState();
      }, REPORT_HOME_NOTIFICATION_POLL_INTERVAL_MS);
    }

    void refreshHomeNotificationState();
  }

  function stopHomeNotificationPolling(): void {
    if (reportHomeNotificationPollTimer !== null) {
      window.clearInterval(reportHomeNotificationPollTimer);
      reportHomeNotificationPollTimer = null;
    }
  }

  function formatDate(value: string): string {
    if (!value) {
      return "-";
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(currentLocale);
  }

  function setStatusLine(
    element: HTMLElement,
    message: string,
    tone: "info" | "error" | "success" | "warn" = "info",
  ): void {
    element.textContent = message;
    element.className = tone === "info" ? "status-line" : `status-line ${tone}`;
  }

  function setGeneralStatusLine(
    message: string,
    tone: "info" | "error" | "success" | "warn" = "info",
  ): void {
    setStatusLine(settingsGeneralStatus, message, tone);
  }

  function setShortcutStatusLine(
    message: string,
    tone: "info" | "error" | "success" | "warn" = "info",
  ): void {
    setStatusLine(settingsShortcutStatus, message, tone);
  }

  function renderOfficialLinksInto(container: HTMLDivElement, iconOnly: boolean): void {
    container.replaceChildren();
    for (const link of OFFICIAL_LINKS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = iconOnly ? "official-icon-link" : "pill-link";
      button.style.background = link.backgroundColor;
      button.setAttribute("aria-label", t("official.openInBrowserAria", { label: link.label }));
      button.title = link.label;
      button.innerHTML = iconOnly ? link.iconSvg : `${link.iconSvg}<span>${link.label}</span>`;

      button.addEventListener("click", async () => {
        try {
          await openUrl(link.url);
        } catch {
          window.open(link.url, "_blank", "noopener,noreferrer");
        }
      });

      container.append(button);
    }
  }

  function renderOfficialLinks(): void {
    renderOfficialLinksInto(officialLinkIcons, true);
    renderOfficialLinksInto(officialLinkButtons, false);
  }

  async function openFolder(pathValue: string | null | undefined, label: string): Promise<void> {
    const target = pathValue?.trim() ?? "";
    if (!target) {
      setGeneralStatusLine(t("openFolder.notSet", { label }), "warn");
      return;
    }

    try {
      await openPath(target);
      setGeneralStatusLine(t("openFolder.opened", { label }), "success");
    } catch (error) {
      setGeneralStatusLine(
        t("openFolder.failed", {
          label,
          error: String(error),
        }),
        "error",
      );
    }
  }

  async function refreshPreservedSaveDataStatus(): Promise<void> {
    try {
      const status = await snrPreservedSaveDataStatus();
      preservedSaveDataAvailable = status.available;
      preservedSaveDataFiles = status.files;
    } catch (error) {
      preservedSaveDataAvailable = false;
      preservedSaveDataFiles = 0;
      console.warn("Failed to get preserved save data status:", error);
    }
  }

  function syncStoreSnapshot(): void {
    // ボタン活性の判定元を1箇所へ集約するため、現行ローカル状態をsignalsへ反映する。
    appStore.settings.value = settings;
    appStore.releases.value = releases;
    appStore.profileIsReady.value = profileIsReady;
    appStore.gameRunning.value = gameRunning;
    appStore.installInProgress.value = installInProgress;
    appStore.uninstallInProgress.value = uninstallInProgress;
    appStore.launchInProgress.value = launchInProgress;
    appStore.creatingShortcut.value = creatingShortcut;
    appStore.releasesLoading.value = releasesLoading;
    appStore.checkingUpdate.value = checkingUpdate;
    appStore.epicLoggedIn.value = epicLoggedIn;
    appStore.migrationExporting.value = migrationExporting;
    appStore.migrationImporting.value = migrationImporting;
    appStore.presetLoading.value = presetLoading;
    appStore.presetExporting.value = presetExporting;
    appStore.presetInspecting.value = presetInspecting;
    appStore.presetImporting.value = presetImporting;
    appStore.localPresets.value = localPresets;
    appStore.archivePresets.value = archivePresets;
    appStore.preservedSaveDataAvailable.value = preservedSaveDataAvailable;
    appStore.preservedSaveDataFiles.value = preservedSaveDataFiles;
  }

  function updateButtons(): void {
    // ボタン活性条件は純関数に委譲し、DOM更新だけをここで行う。
    syncStoreSnapshot();
    const control = computeControlState(appStore.snapshot());
    const amongUsSelectionDisabled =
      control.detectAmongUsPathButtonDisabled || amongUsOverlayLoading;

    uninstallButton.disabled = control.uninstallButtonDisabled;
    reselectAmongUsButton.disabled = amongUsSelectionDisabled;
    settingsAmongUsManualSelectButton.disabled = amongUsSelectionDisabled;
    for (const candidateButton of settingsAmongUsCandidateList.querySelectorAll<HTMLButtonElement>(
      ".settings-among-us-candidate-card",
    )) {
      candidateButton.disabled = amongUsSelectionDisabled;
    }
    settingsSupportDiscordLinkButton.disabled = false;
    settingsUninstallConfirmAcceptButton.disabled =
      uninstallInProgress || control.uninstallButtonDisabled;
    settingsUninstallConfirmCancelButton.disabled = uninstallInProgress;
    settingsUninstallConfirmCloseButton.disabled = uninstallInProgress;
    launchModdedButton.disabled = control.launchModdedButtonDisabled;
    launchVanillaButton.disabled = control.launchVanillaButtonDisabled;
    createModdedShortcutButton.disabled = control.createModdedShortcutButtonDisabled;
    epicLoginWebviewButton.disabled = control.epicLoginWebviewButtonDisabled;
    epicLogoutButton.disabled = control.epicLogoutButtonDisabled;
    openAmongUsFolderButton.disabled = control.openAmongUsFolderButtonDisabled;
    openProfileFolderButton.disabled = control.openProfileFolderButtonDisabled;
    closeToTrayOnCloseInput.disabled = control.closeToTrayOnCloseInputDisabled;
    migrationExportButton.disabled = control.migrationExportButtonDisabled;
    migrationImportButton.disabled = control.migrationImportButtonDisabled;
    migrationImportPathInput.disabled = control.migrationImportPathInputDisabled;
    migrationEncryptionEnabledInput.disabled = control.migrationEncryptionEnabledInputDisabled;
    migrationExportPasswordInput.disabled =
      !migrationEncryptionEnabledInput.checked || control.migrationExportPasswordInputDisabled;
    migrationImportPasswordInput.disabled = control.migrationImportPasswordInputDisabled;
    presetRefreshButton.disabled = control.presetRefreshButtonDisabled;
    presetSelectAllLocalButton.disabled = control.presetSelectAllLocalButtonDisabled;
    presetClearLocalButton.disabled = control.presetClearLocalButtonDisabled;
    presetExportPathInput.disabled = control.presetExportPathInputDisabled;
    presetExportButton.disabled = control.presetExportButtonDisabled;
    presetImportPathInput.disabled = control.presetImportPathInputDisabled;
    presetInspectButton.disabled = control.presetInspectButtonDisabled;
    presetSelectAllArchiveButton.disabled = control.presetSelectAllArchiveButtonDisabled;
    presetClearArchiveButton.disabled = control.presetClearArchiveButtonDisabled;
    presetImportButton.disabled = control.presetImportButtonDisabled;
  }

  function applyGameRunningState(running: boolean): void {
    const runningBefore = gameRunning;
    gameRunning = running;

    if (!runningBefore && gameRunning && launcherAutoMinimizePending) {
      clearLauncherAutoMinimizePending();
      void minimizeLauncherWindowWithEffect();
    }

    if (gameRunning) {
      launchStatus.textContent = t("launch.gameRunning");
    } else if (!launchInProgress) {
      launchStatus.textContent = t("launch.gameStopped");
    }
    updateButtons();
  }

  async function refreshGameRunningState(): Promise<void> {
    try {
      const running = await launchGameRunningGet();
      applyGameRunningState(running);
    } catch {
      // ignore game running state retrieval errors
    }
  }

  function startGameRunningPolling(): void {
    if (gameStatePollTimer !== null) {
      window.clearInterval(gameStatePollTimer);
    }

    gameStatePollTimer = window.setInterval(() => {
      if (gameStatePolling) {
        return;
      }

      gameStatePolling = true;
      void refreshGameRunningState().finally(() => {
        gameStatePolling = false;
      });
    }, 2_000);
  }

  function renderSettings(): void {
    if (!settings) {
      return;
    }
    closeToTrayOnCloseInput.checked = settings.closeToTrayOnClose;
  }

  async function reloadSettings(): Promise<LauncherSettings> {
    settings = await settingsGet();
    renderSettings();
    return settings;
  }

  async function saveSettings(input: LauncherSettingsInput): Promise<void> {
    settings = await settingsUpdate(input);
    renderSettings();
  }

  async function refreshProfileReady(): Promise<void> {
    const explicitPath = settings?.profilePath?.trim() ? settings.profilePath : undefined;
    profileIsReady = await settingsProfileReady(explicitPath);
  }

  async function refreshEpicLoginState(): Promise<void> {
    try {
      const status = await epicStatusGet();
      epicLoggedIn = status.loggedIn;

      if (!status.loggedIn) {
        epicAuthStatus.textContent = t("epic.notLoggedIn");
        setEpicAuthVisualState("logged-out");
        return;
      }

      const userLabel = status.displayName?.trim()
        ? status.displayName.trim()
        : status.accountId?.trim()
          ? status.accountId.trim()
          : t("epic.unknownUser");

      if (status.profileError) {
        epicAuthStatus.textContent = t("epic.loggedInProfileError", { user: userLabel });
        setEpicAuthVisualState("error");
      } else {
        epicAuthStatus.textContent = t("epic.loggedIn", { user: userLabel });
        setEpicAuthVisualState("logged-in");
      }
    } catch (error) {
      epicLoggedIn = false;
      epicAuthStatus.textContent = t("epic.statusCheckFailed", { error: String(error) });
      setEpicAuthVisualState("error");
    } finally {
      renderEpicActionButtons(epicLoggedIn);
      updateButtons();
    }
  }

  function renderLocalPresetList(): void {
    presetLocalList.replaceChildren();

    if (localPresets.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = t("preset.localEmpty");
      presetLocalList.append(empty);
      return;
    }

    for (const preset of localPresets) {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.flexWrap = "wrap";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.role = "local-preset-checkbox";
      checkbox.dataset.presetId = String(preset.id);
      checkbox.disabled = !preset.hasDataFile;

      const title = document.createElement("span");
      title.textContent = `[${preset.id}] ${preset.name}`;

      row.append(checkbox, title);

      if (!preset.hasDataFile) {
        const missing = document.createElement("span");
        missing.className = "muted";
        missing.textContent = t("preset.localMissingDataFile");
        row.append(missing);
      }

      presetLocalList.append(row);
    }
  }

  function renderArchivePresetList(): void {
    presetArchiveList.replaceChildren();

    if (archivePresets.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = t("preset.archiveHint");
      presetArchiveList.append(empty);
      return;
    }

    for (const preset of archivePresets) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.flexWrap = "wrap";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.role = "archive-preset-checkbox";
      checkbox.dataset.presetId = String(preset.id);
      checkbox.checked = preset.hasDataFile;
      checkbox.disabled = !preset.hasDataFile;

      const idLabel = document.createElement("span");
      idLabel.textContent = `[${preset.id}]`;
      idLabel.style.minWidth = "54px";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.dataset.role = "archive-preset-name";
      nameInput.dataset.presetId = String(preset.id);
      nameInput.value = preset.name;
      nameInput.style.padding = "6px 8px";
      nameInput.style.minWidth = "260px";
      nameInput.style.flex = "1";
      nameInput.disabled = !preset.hasDataFile;

      row.append(checkbox, idLabel, nameInput);

      if (!preset.hasDataFile) {
        const missing = document.createElement("span");
        missing.className = "muted";
        missing.textContent = t("preset.archiveMissingData");
        row.append(missing);
      }

      presetArchiveList.append(row);
    }
  }

  function setCheckedStateByRole(container: HTMLElement, role: string, checked: boolean): void {
    const checkboxes = container.querySelectorAll<HTMLInputElement>(`input[data-role="${role}"]`);
    for (const checkbox of checkboxes) {
      if (!checkbox.disabled) {
        checkbox.checked = checked;
      }
    }
  }

  function getSelectedLocalPresetIds(): number[] {
    const selected = presetLocalList.querySelectorAll<HTMLInputElement>(
      'input[data-role="local-preset-checkbox"]:checked',
    );

    return Array.from(selected)
      .map((input) => Number(input.dataset.presetId))
      .filter((value) => Number.isInteger(value) && value >= 0);
  }

  function getSelectedArchivePresetInputs(): PresetImportSelectionInput[] {
    const selected = presetArchiveList.querySelectorAll<HTMLInputElement>(
      'input[data-role="archive-preset-checkbox"]:checked',
    );

    const inputs: PresetImportSelectionInput[] = [];
    for (const checkbox of selected) {
      const sourceId = Number(checkbox.dataset.presetId);
      if (!Number.isInteger(sourceId) || sourceId < 0) {
        continue;
      }

      const nameInput = presetArchiveList.querySelector<HTMLInputElement>(
        `input[data-role="archive-preset-name"][data-preset-id="${sourceId}"]`,
      );

      inputs.push({
        sourceId,
        name: nameInput?.value ?? "",
      });
    }

    return inputs;
  }

  async function refreshLocalPresets(keepStatusMessage = false): Promise<void> {
    presetLoading = true;
    updateButtons();

    if (!keepStatusMessage) {
      setStatusLine(presetStatus, t("preset.statusLoadingLocal"));
    }

    try {
      localPresets = await presetsListLocal();
      renderLocalPresetList();

      if (!keepStatusMessage) {
        if (localPresets.length > 0) {
          setStatusLine(
            presetStatus,
            t("preset.statusLoadedLocal", { count: localPresets.length }),
            "success",
          );
        } else {
          setStatusLine(presetStatus, t("preset.statusNoLocal"), "warn");
        }
      }
    } catch (error) {
      localPresets = [];
      renderLocalPresetList();
      if (!keepStatusMessage) {
        setStatusLine(
          presetStatus,
          t("preset.statusLoadFailed", { error: String(error) }),
          "error",
        );
      }
    } finally {
      presetLoading = false;
      updateButtons();
    }
  }

  async function gameExePathFromSettings(): Promise<string> {
    if (!settings || !settings.amongUsPath.trim()) {
      throw new Error("Among Us path is not configured");
    }
    return join(settings.amongUsPath, "Among Us.exe");
  }

  const discordLink =
    OFFICIAL_LINKS.find((link) => link.label.toLowerCase() === "discord")?.url ??
    "https://discord.gg/Cqfwx82ynN";

  function syncOverlayBodyLock(): void {
    const overlayOpen = !settingsAmongUsOverlay.hidden || !settingsUninstallConfirmOverlay.hidden;
    document.documentElement.classList.toggle("settings-overlay-open", overlayOpen);
    document.body.classList.toggle("settings-overlay-open", overlayOpen);
  }

  function clearOverlayTimer(
    timerMap: WeakMap<HTMLDivElement, number>,
    overlay: HTMLDivElement,
  ): void {
    const timer = timerMap.get(overlay);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timerMap.delete(overlay);
    }
  }

  function scheduleOverlayAnimationCleanup(overlay: HTMLDivElement): void {
    clearOverlayTimer(overlayAnimationTimers, overlay);
    const timer = window.setTimeout(() => {
      overlay.classList.remove("is-animating");
      overlayAnimationTimers.delete(overlay);
    }, SETTINGS_OVERLAY_TRANSITION_MS);
    overlayAnimationTimers.set(overlay, timer);
  }

  function openSettingsOverlay(overlay: HTMLDivElement): void {
    clearOverlayTimer(overlayCloseTimers, overlay);

    document.documentElement.classList.add("settings-overlay-open");
    document.body.classList.add("settings-overlay-open");
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    overlay.classList.remove("is-closing");
    overlay.classList.add("is-animating");

    requestAnimationFrame(() => {
      if (overlay.hidden || overlay.classList.contains("is-closing")) {
        return;
      }
      overlay.classList.add("is-open");
    });

    scheduleOverlayAnimationCleanup(overlay);
    syncOverlayBodyLock();
  }

  function closeSettingsOverlay(overlay: HTMLDivElement, immediate = false): void {
    clearOverlayTimer(overlayAnimationTimers, overlay);
    clearOverlayTimer(overlayCloseTimers, overlay);

    if (immediate) {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.classList.remove("is-open", "is-closing", "is-animating");
      syncOverlayBodyLock();
      return;
    }

    if (overlay.hidden || overlay.classList.contains("is-closing")) {
      return;
    }

    overlay.classList.add("is-closing", "is-animating");
    overlay.classList.remove("is-open");

    const timer = window.setTimeout(() => {
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.classList.remove("is-closing", "is-animating");
      overlayCloseTimers.delete(overlay);
      syncOverlayBodyLock();
    }, SETTINGS_OVERLAY_TRANSITION_MS);
    overlayCloseTimers.set(overlay, timer);

    syncOverlayBodyLock();
  }

  function setAmongUsOverlayError(
    message: string | null,
    tone: "info" | "error" | "success" | "warn" = "error",
  ): void {
    if (!message) {
      settingsAmongUsOverlayError.hidden = true;
      settingsAmongUsOverlayError.textContent = "";
      settingsAmongUsOverlayError.className = "status-line settings-among-us-overlay-error";
      return;
    }
    settingsAmongUsOverlayError.hidden = false;
    setStatusLine(settingsAmongUsOverlayError, message, tone);
    settingsAmongUsOverlayError.classList.add("settings-among-us-overlay-error");
  }

  function closeAmongUsOverlay(force = false): void {
    if (amongUsOverlayLoading && !force) {
      return;
    }
    closeSettingsOverlay(settingsAmongUsOverlay, force);
  }

  function openAmongUsOverlay(): void {
    setAmongUsOverlayError(null);
    openSettingsOverlay(settingsAmongUsOverlay);
  }

  async function applyAmongUsSelection(path: string, platform: GamePlatform): Promise<void> {
    amongUsOverlayLoading = true;
    updateButtons();
    setAmongUsOverlayError(null);
    try {
      await saveSettings({
        amongUsPath: path,
        gamePlatform: platform,
      });
      await refreshProfileReady();
      setGeneralStatusLine(t("detect.success", { path, platform }), "success");
      closeAmongUsOverlay(true);
    } catch (error) {
      setAmongUsOverlayError(t("detect.failed", { error: String(error) }));
    } finally {
      amongUsOverlayLoading = false;
      updateButtons();
    }
  }

  function renderAmongUsCandidates(candidates: { path: string; platform: string }[]): void {
    settingsAmongUsCandidateList.replaceChildren();
    const normalizedCandidates = normalizePlatformCandidates(candidates);

    for (const candidate of normalizedCandidates) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "platform-card settings-among-us-candidate-card";
      button.disabled = amongUsOverlayLoading;
      const platform = candidate.platform;
      const iconPath = getPlatformIconPath(platform);
      const platformName = t(getPlatformLabelKey(platform));

      const icon = document.createElement("span");
      icon.className = "platform-icon settings-among-us-platform-icon";
      icon.innerHTML = `<svg viewBox="0 0 24 24" width="80" height="80" fill="currentColor" aria-hidden="true"><path d="${iconPath}" /></svg>`;

      const name = document.createElement("span");
      name.className = "platform-name";
      name.textContent = platformName;

      const path = document.createElement("span");
      path.className = "platform-path";
      path.textContent = `${t("installFlow.folderPath")}: ${candidate.path}`;

      button.append(icon, name, path);
      button.addEventListener("click", async () => {
        await applyAmongUsSelection(candidate.path, platform);
      });
      settingsAmongUsCandidateList.append(button);
    }

    settingsAmongUsCandidateEmpty.hidden = normalizedCandidates.length > 0;
  }

  async function refreshAmongUsCandidates(): Promise<void> {
    amongUsOverlayLoading = true;
    updateButtons();
    settingsAmongUsCandidateList.replaceChildren();
    settingsAmongUsCandidateEmpty.hidden = true;
    setAmongUsOverlayError(t("detect.loading"), "info");

    try {
      const candidates = await finderDetectPlatforms();
      setAmongUsOverlayError(null);
      renderAmongUsCandidates(candidates);
    } catch (error) {
      setAmongUsOverlayError(t("detect.failed", { error: String(error) }));
    } finally {
      amongUsOverlayLoading = false;
      updateButtons();
    }
  }

  reselectAmongUsButton.addEventListener("click", async () => {
    openAmongUsOverlay();
    await refreshAmongUsCandidates();
  });

  settingsAmongUsOverlayBackdrop.addEventListener("click", () => {
    closeAmongUsOverlay();
  });
  settingsAmongUsOverlayCloseButton.addEventListener("click", () => {
    closeAmongUsOverlay();
  });
  settingsAmongUsOverlayCancelButton.addEventListener("click", () => {
    closeAmongUsOverlay();
  });
  settingsAmongUsManualSelectButton.addEventListener("click", async () => {
    if (amongUsOverlayLoading) {
      return;
    }

    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (!selected || Array.isArray(selected)) {
        return;
      }

      try {
        const platform = await finderDetectPlatform(selected);
        if (platform !== "steam" && platform !== "epic") {
          setAmongUsOverlayError(t("installFlow.invalidAmongUsFolder"));
          return;
        }

        await applyAmongUsSelection(selected, platform);
      } catch {
        setAmongUsOverlayError(t("installFlow.invalidAmongUsFolder"));
      }
    } catch {
      // user cancelled
    }
  });

  openAmongUsFolderButton.addEventListener("click", async () => {
    await openFolder(settings?.amongUsPath, t("folder.amongUs"));
  });

  openProfileFolderButton.addEventListener("click", async () => {
    await openFolder(settings?.profilePath, t("folder.profile"));
  });

  closeToTrayOnCloseInput.addEventListener("change", async () => {
    const enabled = closeToTrayOnCloseInput.checked;
    await saveSettings({ closeToTrayOnClose: enabled });
    setGeneralStatusLine(
      t("settings.closeToTrayOnCloseSaved", {
        state: enabled ? t("common.on") : t("common.off"),
      }),
      "success",
    );
    updateButtons();
  });

  function closeUninstallConfirmOverlay(force = false): void {
    if (uninstallInProgress && !force) {
      return;
    }
    closeSettingsOverlay(settingsUninstallConfirmOverlay, force);
  }

  function openUninstallConfirmOverlay(): void {
    openSettingsOverlay(settingsUninstallConfirmOverlay);
  }

  uninstallButton.addEventListener("click", () => {
    if (!settings || uninstallButton.disabled) {
      return;
    }
    openUninstallConfirmOverlay();
  });

  settingsUninstallConfirmOverlayBackdrop.addEventListener("click", () => {
    closeUninstallConfirmOverlay();
  });
  settingsUninstallConfirmCloseButton.addEventListener("click", () => {
    closeUninstallConfirmOverlay();
  });
  settingsUninstallConfirmCancelButton.addEventListener("click", () => {
    closeUninstallConfirmOverlay();
  });
  settingsUninstallConfirmAcceptButton.addEventListener("click", async () => {
    if (!settings || uninstallInProgress) {
      return;
    }

    uninstallInProgress = true;
    updateButtons();
    installStatus.textContent = t("uninstall.starting");

    try {
      const result = await snrUninstall(true);
      installStatus.textContent = t("uninstall.doneWithPreserved", {
        count: result.preservedFiles,
      });
      await refreshProfileReady();
      await refreshPreservedSaveDataStatus();
      await refreshLocalPresets(true);
      closeUninstallConfirmOverlay(true);
      window.location.reload();
    } catch (error) {
      installStatus.textContent = t("uninstall.failed", { error: String(error) });
    } finally {
      uninstallInProgress = false;
      updateButtons();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!settingsUninstallConfirmOverlay.hidden) {
      closeUninstallConfirmOverlay();
      return;
    }
    if (!settingsAmongUsOverlay.hidden) {
      closeAmongUsOverlay();
    }
  });

  migrationExportButton.addEventListener("click", async () => {
    const encryptionEnabled = migrationEncryptionEnabledInput.checked;
    const exportPassword = migrationExportPasswordInput.value;
    if (encryptionEnabled && exportPassword.length === 0) {
      setStatusLine(migrationStatus, t("migration.exportPasswordRequired"), "warn");
      return;
    }

    migrationExporting = true;
    updateButtons();
    setStatusLine(migrationStatus, t("migration.exporting"));

    try {
      const result = await migrationExport({
        encryptionEnabled,
        password: encryptionEnabled ? exportPassword : undefined,
      });
      migrationImportPathInput.value = result.archivePath;
      setStatusLine(
        migrationStatus,
        `${t("migration.exportDone", {
          path: result.archivePath,
          count: result.includedFiles,
          profile: result.profileFiles,
          locallow: result.locallowFiles,
        })} (${result.encrypted ? t("migration.encrypted") : t("migration.unencrypted")})`,
        "success",
      );
    } catch (error) {
      setStatusLine(
        migrationStatus,
        t("migration.exportFailed", { error: String(error) }),
        "error",
      );
    } finally {
      migrationExporting = false;
      updateButtons();
    }
  });

  migrationImportButton.addEventListener("click", async () => {
    const archivePath = migrationImportPathInput.value.trim();
    if (!archivePath) {
      setStatusLine(migrationStatus, t("migration.importPathRequired"), "warn");
      return;
    }

    const importPassword = migrationImportPasswordInput.value;

    migrationImporting = true;
    updateButtons();
    setStatusLine(migrationStatus, t("migration.importing"));

    try {
      const result = await migrationImport({
        archivePath,
        password: importPassword.length > 0 ? importPassword : undefined,
      });
      setStatusLine(
        migrationStatus,
        `${t("migration.importDone", {
          count: result.importedFiles,
          profile: result.profileFiles,
          locallow: result.locallowFiles,
        })} (${result.encrypted ? t("migration.encrypted") : t("migration.unencrypted")})`,
        "success",
      );
      await refreshProfileReady();
      await refreshLocalPresets(true);
    } catch (error) {
      setStatusLine(
        migrationStatus,
        t("migration.importFailed", { error: String(error) }),
        "error",
      );
    } finally {
      migrationImporting = false;
      updateButtons();
    }
  });

  migrationEncryptionEnabledInput.addEventListener("change", () => {
    updateButtons();
  });

  presetRefreshButton.addEventListener("click", async () => {
    await refreshLocalPresets();
  });

  presetSelectAllLocalButton.addEventListener("click", () => {
    setCheckedStateByRole(presetLocalList, "local-preset-checkbox", true);
  });

  presetClearLocalButton.addEventListener("click", () => {
    setCheckedStateByRole(presetLocalList, "local-preset-checkbox", false);
  });

  presetExportButton.addEventListener("click", async () => {
    const selectedIds = getSelectedLocalPresetIds();
    if (selectedIds.length === 0) {
      setStatusLine(presetStatus, t("preset.exportSelectRequired"), "warn");
      return;
    }

    const outputPath = presetExportPathInput.value.trim();

    presetExporting = true;
    updateButtons();
    setStatusLine(presetStatus, t("preset.statusExporting"));

    try {
      const result = await presetsExport({
        presetIds: selectedIds,
        outputPath: outputPath.length > 0 ? outputPath : undefined,
      });

      presetImportPathInput.value = result.archivePath;
      setStatusLine(
        presetStatus,
        t("preset.statusExportDone", {
          path: result.archivePath,
          count: result.exportedPresets,
        }),
        "success",
      );
    } catch (error) {
      setStatusLine(
        presetStatus,
        t("preset.statusExportFailed", { error: String(error) }),
        "error",
      );
    } finally {
      presetExporting = false;
      updateButtons();
    }
  });

  presetInspectButton.addEventListener("click", async () => {
    const archivePath = presetImportPathInput.value.trim();
    if (!archivePath) {
      setStatusLine(presetStatus, t("preset.inspectPathRequired"), "warn");
      return;
    }

    presetInspecting = true;
    updateButtons();
    setStatusLine(presetStatus, t("preset.statusInspecting"));

    try {
      archivePresets = await presetsInspectArchive(archivePath);
      renderArchivePresetList();

      const importable = archivePresets.filter((preset) => preset.hasDataFile).length;
      const missing = archivePresets.length - importable;
      setStatusLine(
        presetStatus,
        t("preset.statusInspectDone", {
          total: archivePresets.length,
          importable,
          missing,
        }),
        importable > 0 ? "success" : "warn",
      );
    } catch (error) {
      archivePresets = [];
      renderArchivePresetList();
      setStatusLine(
        presetStatus,
        t("preset.statusInspectFailed", { error: String(error) }),
        "error",
      );
    } finally {
      presetInspecting = false;
      updateButtons();
    }
  });

  presetSelectAllArchiveButton.addEventListener("click", () => {
    setCheckedStateByRole(presetArchiveList, "archive-preset-checkbox", true);
  });

  presetClearArchiveButton.addEventListener("click", () => {
    setCheckedStateByRole(presetArchiveList, "archive-preset-checkbox", false);
  });

  presetImportButton.addEventListener("click", async () => {
    const archivePath = presetImportPathInput.value.trim();
    if (!archivePath) {
      setStatusLine(presetStatus, t("preset.importPathRequired"), "warn");
      return;
    }

    const selections = getSelectedArchivePresetInputs();
    if (selections.length === 0) {
      setStatusLine(presetStatus, t("preset.importSelectRequired"), "warn");
      return;
    }

    const previewLines = selections
      .map(
        (selection) =>
          `- [${selection.sourceId}] ${(selection.name ?? "").trim() || t("preset.emptyName")}`,
      )
      .join("\n");
    const confirmed = window.confirm(t("preset.importConfirmPrompt", { list: previewLines }));
    if (!confirmed) {
      return;
    }

    presetImporting = true;
    updateButtons();
    setStatusLine(presetStatus, t("preset.statusImporting"));

    try {
      const result = await presetsImportArchive({
        archivePath,
        selections,
      });

      await refreshLocalPresets(true);

      const importedNames = result.imported
        .map((item) => `[${item.targetId}] ${item.name}`)
        .join(", ");
      setStatusLine(
        presetStatus,
        t("preset.statusImportDone", {
          count: result.importedPresets,
          names: importedNames ? ` (${importedNames})` : "",
        }),
        "success",
      );
    } catch (error) {
      setStatusLine(
        presetStatus,
        t("preset.statusImportFailed", { error: String(error) }),
        "error",
      );
    } finally {
      presetImporting = false;
      updateButtons();
    }
  });

  launchModdedButton.addEventListener("click", async () => {
    if (!settings) {
      return;
    }
    launchInProgress = true;
    queueLauncherAutoMinimize();
    launchStatus.textContent = t("launch.moddedStarting");
    updateButtons();

    try {
      const gameExe = await gameExePathFromSettings();
      await launchModded({
        gameExe,
        profilePath: settings.profilePath,
        platform: settings.gamePlatform,
      });
      launchStatus.textContent = t("launch.moddedSent");
    } catch (error) {
      clearLauncherAutoMinimizePending();
      launchStatus.textContent = t("launch.moddedFailed", { error: String(error) });
    } finally {
      launchInProgress = false;
      updateButtons();
    }
  });

  launchVanillaButton.addEventListener("click", async () => {
    if (!settings) {
      return;
    }
    launchInProgress = true;
    queueLauncherAutoMinimize();
    launchStatus.textContent = t("launch.vanillaStarting");
    updateButtons();

    try {
      const gameExe = await gameExePathFromSettings();
      await launchVanilla({
        gameExe,
        platform: settings.gamePlatform,
      });
      launchStatus.textContent = t("launch.vanillaSent");
    } catch (error) {
      clearLauncherAutoMinimizePending();
      launchStatus.textContent = t("launch.vanillaFailed", { error: String(error) });
    } finally {
      launchInProgress = false;
      updateButtons();
    }
  });

  createModdedShortcutButton.addEventListener("click", async () => {
    creatingShortcut = true;
    setShortcutStatusLine(t("launch.shortcutCreating"));
    updateButtons();

    try {
      const shortcutPath = await launchShortcutCreate();
      setShortcutStatusLine(t("launch.shortcutCreated", { path: shortcutPath }), "success");
    } catch (error) {
      setShortcutStatusLine(
        t("launch.shortcutCreateFailed", {
          error: String(error),
        }),
        "error",
      );
    } finally {
      creatingShortcut = false;
      updateButtons();
    }
  });

  epicLoginWebviewButton.addEventListener("click", async () => {
    epicAuthStatus.textContent = t("epic.webviewStarting");
    setEpicAuthVisualState("logged-out");
    try {
      await epicLoginWebview();
    } catch (error) {
      epicAuthStatus.textContent = t("epic.webviewStartFailed", { error: String(error) });
      setEpicAuthVisualState("error");
    }
  });

  epicLogoutButton.addEventListener("click", async () => {
    try {
      await epicLogout();
      epicAuthStatus.textContent = t("epic.logoutDone");
      await refreshEpicLoginState();
    } catch (error) {
      epicAuthStatus.textContent = t("epic.logoutFailed", { error: String(error) });
      setEpicAuthVisualState("error");
    }
  });

  void settingsUpdate({ uiLocale: currentLocale }).catch(() => undefined);

  replayOnboardingButton.addEventListener("click", () => {
    mountOnboarding();
  });

  settingsSupportDiscordLinkButton.addEventListener("click", async () => {
    try {
      await openUrl(discordLink);
    } catch {
      window.open(discordLink, "_blank", "noopener,noreferrer");
    }
  });

  languageSelect.addEventListener("change", async () => {
    const nextLocale = normalizeLocale(languageSelect.value) ?? currentLocale;
    if (nextLocale === currentLocale) {
      return;
    }
    try {
      await settingsUpdate({ uiLocale: nextLocale });
    } catch {
      // ignore backend locale sync failures
    }
    saveLocale(nextLocale);
    window.location.reload();
  });

  renderOfficialLinks();
  renderLocalPresetList();
  renderArchivePresetList();
  setStatusLine(presetStatus, t("preset.statusReadyToRefresh"));

  async function runUpdateCheck(source: "manual" | "startup"): Promise<void> {
    if (checkingUpdate) {
      return;
    }

    checkingUpdate = true;
    checkUpdateButton.disabled = true;
    updateStatus.textContent = t("update.checking");

    try {
      const update = await check();
      if (!update) {
        updateStatus.textContent = t("update.latest");
        return;
      }

      const shouldInstall = window.confirm(t("update.confirmPrompt", { version: update.version }));
      if (!shouldInstall) {
        updateStatus.textContent = t("update.skipped", { version: update.version });
        return;
      }

      let downloadedBytes = 0;
      let totalBytes = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? 0;
          updateStatus.textContent = t("update.downloading");
          return;
        }
        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            const percent = Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100));
            updateStatus.textContent = t("update.downloadingPercent", { percent });
          } else {
            updateStatus.textContent = t("update.downloading");
          }
          return;
        }
        updateStatus.textContent = t("update.applying");
      });

      updateStatus.textContent = t("update.appliedRestart");
    } catch (error) {
      if (source === "manual") {
        updateStatus.textContent = t("update.failed", {
          error: String(error),
        });
      } else {
        // 起動時の自動チェック失敗は動作継続を優先してログのみ残す。
        console.warn("Auto update check failed:", error);
      }
    } finally {
      checkingUpdate = false;
      checkUpdateButton.disabled = false;
    }
  }

  checkUpdateButton.addEventListener("click", async () => {
    await runUpdateCheck("manual");
  });

  void (async () => {
    try {
      const version = `v${await getVersion()}`;
      appVersion.textContent = version;
      settingsAppVersion.textContent = version;
    } catch (error) {
      const errorMessage = t("app.versionFetchFailed", { error: String(error) });
      appVersion.textContent = errorMessage;
      settingsAppVersion.textContent = errorMessage;
    }
  })();

  void listen<InstallProgressPayload>("snr-install-progress", (event) => {
    const payload = event.payload;

    if (payload.stage === "downloading" && typeof payload.downloaded === "number") {
      if (typeof payload.total === "number" && payload.total > 0) {
        const percent = Math.floor((payload.downloaded / payload.total) * 100);
        installStatus.textContent = t("install.progressPercent", {
          message: payload.message,
          percent,
        });
      } else {
        installStatus.textContent = t("install.progressBytes", {
          message: payload.message,
          downloaded: payload.downloaded,
          bytes: t("common.bytes"),
        });
      }
      return;
    }

    if (payload.stage === "extracting" && typeof payload.current === "number") {
      if (typeof payload.entriesTotal === "number" && payload.entriesTotal > 0) {
        installStatus.textContent = t("install.progressEntries", {
          message: payload.message,
          current: payload.current,
          total: payload.entriesTotal,
        });
      } else {
        installStatus.textContent = payload.message;
      }
      return;
    }

    installStatus.textContent = payload.message;
  });

  void listen<GameStatePayload>("game-state-changed", (event) => {
    applyGameRunningState(event.payload.running);
  });

  void listen("epic-login-success", async () => {
    epicAuthStatus.textContent = t("epic.loginSuccess");
    await refreshEpicLoginState();
  });

  void listen<string>("epic-login-error", async (event) => {
    epicAuthStatus.textContent = t("epic.loginFailed", { error: event.payload });
    await refreshEpicLoginState();
  });

  void listen("epic-login-cancelled", () => {
    epicAuthStatus.textContent = t("epic.loginCancelled");
  });

  void (async () => {
    const loadedSettings = await reloadSettings();
    if (!loadedSettings.onboardingCompleted) {
      mountOnboarding();
    }
    await refreshProfileReady();

    await refreshLocalPresets(true);
    await refreshPreservedSaveDataStatus();
    await refreshGameRunningState();
    startGameRunningPolling();

    try {
      await epicSessionRestore();
    } catch {
      // ignore restore errors; status is refreshed next.
    }
    await refreshEpicLoginState();

    try {
      const autoLaunchError = await launchAutolaunchErrorTake();
      if (autoLaunchError) {
        launchStatus.textContent = t("launch.autoModLaunchFailed", { error: autoLaunchError });
      }
    } catch {
      // ignore auto launch error retrieval errors
    }

    updateButtons();
    startHomeNotificationPolling();
    void runUpdateCheck("startup");
  })();
}
