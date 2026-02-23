import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { downloadDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import React from "react";
import { type Root, createRoot } from "react-dom/client";
import { AnnounceCenter } from "../announce/AnnounceCenter";
import { announceListArticles } from "../announce/announceApi";
import type { AnnounceArticleMinimal } from "../announce/types";
import { GameServersCenter } from "../game-servers/GameServersCenter";
import {
  type LocaleCode,
  createTranslator,
  normalizeLocale,
  resolveInitialLocale,
  saveLocale,
} from "../i18n";
import OnboardingWizard from "../onboarding/OnboardingWizard";
import type { OnboardingStep, OnboardingStepGuide } from "../onboarding/types";
import { ReportCenter } from "../report/ReportCenter";
import {
  ANNOUNCE_BADGE_READ_CREATED_AT_STORAGE_KEY,
  OFFICIAL_LINKS,
  REPORTING_NOTIFICATION_STORAGE_KEY,
} from "./constants";
import { collectAppDom } from "./dom";
import {
  isElevationRequiredLaunchError,
  localizeLaunchErrorMessage,
} from "./launchErrorLocalization";
import {
  ANNOUNCE_ENABLED,
  CONNECT_LINKS_ENABLED,
  EPIC_LOGIN_ENABLED,
  GAME_SERVERS_ENABLED,
  MIGRATION_ENABLED,
  PRESETS_ENABLED,
  REPORTING_ENABLED,
  modConfig,
} from "./modConfig";
import {
  filterSelectablePlatformCandidates,
  getPlatformIconPath,
  getPlatformLabelKey,
  isPlatformSelectable,
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
  launchModdedElevated,
  launchModdedFirstSetupPending,
  launchShortcutCreate,
  launchVanilla,
  launchVanillaElevated,
  migrationExport,
  migrationImport,
  modPreservedSaveDataStatus,
  modUninstall,
  notificationsTakeOpenTarget,
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
  settingsOpenFolder,
  settingsProfileReady,
  settingsUpdate,
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
  NotificationOpenTarget,
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
  SocialIcon,
  UninstallResult,
} from "./types";

/**
 * フロントエンドの実行本体。
 * 画面描画・イベント結線・Tauri通信をこのモジュールで統合管理する。
 */
// タイミング系の値は UI 体感に直結するため、この近辺にまとめて管理する。
const REPORT_HOME_NOTIFICATION_FETCH_GAP_MS = 30_000;
const REPORT_HOME_NOTIFICATION_POLL_INTERVAL_MS = 180_000;
const ANNOUNCE_BADGE_FETCH_GAP_MS = 30_000;
const ANNOUNCE_BADGE_POLL_INTERVAL_MS = 300_000;
const LAUNCHER_MINIMIZE_EFFECT_DURATION_MS = 260;
const LAUNCHER_AUTO_MINIMIZE_WINDOW_MS = 30_000;
const MODDED_FIRST_SETUP_POLL_INTERVAL_MS = 500;
const LAUNCH_ERROR_DISPLAY_MS = 20_000;
const SETTINGS_OVERLAY_TRANSITION_MS = 220;
const LOCALE_SWITCH_RELOAD_ANIMATION_FLAG_KEY = "ui.localeSwitchReloadAnimation";
const INSTALL_FLOW_HOME_AFTER_RELOAD_FLAG_KEY = "ui.installFlowHomeAfterReload";
const LAST_MAIN_TAB_STORAGE_KEY = "ui.lastMainTab";
const BACKGROUND_NOTIFICATION_OPEN_EVENT = "background-notification-open";
const ONBOARDING_SPOTLIGHT_CLASS = "onboarding-spotlight-target";
const ONBOARDING_SPOTLIGHT_FOCUS_CLASS = "onboarding-spotlight-target-focus";
const ONBOARDING_EXIT_ANIMATION_MS = 340;
const LOCALE_PREFERRED_GAME_SERVER_IDS: Record<LocaleCode, string> = {
  ja: "snr-jp",
  en: "snr-useast",
};
type MainTabId = "home" | "report" | "announce" | "preset" | "servers" | "settings";
type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;
type SettingsCategoryId =
  | "general"
  | "notifications"
  | "epic"
  | "migration"
  | "credit"
  | "app-version";
type MigrationMode = "export" | "import";
type MigrationOverlayStep = "select" | "password" | "processing" | "result";
type PresetOverlayMode = "import" | "export";
type PresetFeedbackMode = "none" | "confirmImport" | "result";
type ElevationLaunchRetryInput =
  | {
      kind: "modded";
      gameExe: string;
      profilePath: string;
      platform: GamePlatform;
      firstSetupPending: boolean;
    }
  | {
      kind: "vanilla";
      gameExe: string;
      platform: GamePlatform;
    };
const DEFAULT_SETTINGS_CATEGORY: SettingsCategoryId = "general";

function resolveLocalePreferredGameServerId(locale: LocaleCode): string {
  const preferredId = LOCALE_PREFERRED_GAME_SERVER_IDS[locale];
  const preferredServer = modConfig.apis.gameServers.find((server) => server.id === preferredId);
  if (preferredServer) {
    return preferredServer.id;
  }
  return modConfig.apis.gameServers[0]?.id ?? "";
}

function isMainTabEnabled(tabId: MainTabId): boolean {
  // 機能フラグで非表示になるタブはここで一元判定する。
  if (tabId === "report") {
    return REPORTING_ENABLED;
  }
  if (tabId === "announce") {
    return ANNOUNCE_ENABLED;
  }
  if (tabId === "preset") {
    return PRESETS_ENABLED;
  }
  if (tabId === "servers") {
    return GAME_SERVERS_ENABLED;
  }
  return true;
}

function isSettingsCategoryEnabled(category: SettingsCategoryId): boolean {
  // 設定カテゴリも機能フラグと連動して開閉する。
  if (category === "epic") {
    return EPIC_LOGIN_ENABLED;
  }
  if (category === "migration") {
    return MIGRATION_ENABLED;
  }
  return true;
}

const ONBOARDING_STEP_GUIDES: ReadonlyArray<OnboardingStepGuide> = (() => {
  const guides: OnboardingStepGuide[] = [
    {
      step: "welcome",
      tab: "home",
    },
    {
      step: "launch",
      tab: "home",
      selector: "#launch-modded",
      focus: true,
    },
  ];

  if (REPORTING_ENABLED) {
    guides.push({
      step: "reporting",
      tab: "report",
      selector: "#report-center-root",
    });
  }

  if (PRESETS_ENABLED) {
    guides.push({
      step: "preset",
      tab: "preset",
      selector: "#tab-preset .preset-remake-root",
    });
  }

  if (MIGRATION_ENABLED) {
    guides.push({
      step: "migration",
      tab: "settings",
      settingsCategory: "migration",
      selector: "#settings-panel-migration .settings-migration-action-stack",
    });
  }

  guides.push(
    {
      step: "connect",
    },
    {
      step: "complete",
      tab: "home",
    },
  );
  return guides;
})();

function isMainTabId(value: string | undefined): value is MainTabId {
  return (
    value === "home" ||
    value === "report" ||
    value === "announce" ||
    value === "preset" ||
    value === "servers" ||
    value === "settings"
  );
}

function isSettingsCategoryId(value: string | undefined): value is SettingsCategoryId {
  return (
    value === "general" ||
    value === "notifications" ||
    value === "epic" ||
    value === "migration" ||
    value === "credit" ||
    value === "app-version"
  );
}

function markLocaleSwitchReloadAnimation(): void {
  try {
    sessionStorage.setItem(LOCALE_SWITCH_RELOAD_ANIMATION_FLAG_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

function clearLocaleSwitchReloadAnimation(): void {
  try {
    sessionStorage.removeItem(LOCALE_SWITCH_RELOAD_ANIMATION_FLAG_KEY);
  } catch {
    // ignore storage failures
  }
}

function consumeLocaleSwitchReloadAnimation(): boolean {
  try {
    const value = sessionStorage.getItem(LOCALE_SWITCH_RELOAD_ANIMATION_FLAG_KEY);
    if (value !== "1") {
      return false;
    }
    sessionStorage.removeItem(LOCALE_SWITCH_RELOAD_ANIMATION_FLAG_KEY);
    return true;
  } catch {
    return false;
  }
}

function consumeInstallFlowHomeAfterReload(): boolean {
  try {
    // インストール完了後にホームへ遷移するワンショットフラグを消費する。
    const value = sessionStorage.getItem(INSTALL_FLOW_HOME_AFTER_RELOAD_FLAG_KEY);
    if (value !== "1") {
      return false;
    }
    sessionStorage.removeItem(INSTALL_FLOW_HOME_AFTER_RELOAD_FLAG_KEY);
    return true;
  } catch {
    return false;
  }
}

function saveLastMainTab(tabId: MainTabId): void {
  try {
    localStorage.setItem(LAST_MAIN_TAB_STORAGE_KEY, tabId);
  } catch {
    // ignore storage failures
  }
}

function loadLastMainTab(): MainTabId {
  try {
    const value = localStorage.getItem(LAST_MAIN_TAB_STORAGE_KEY) ?? "home";
    if (isMainTabId(value) && isMainTabEnabled(value)) {
      return value;
    }
  } catch {
    // ignore storage failures
  }
  return "home";
}

function setLocaleSwitchAnimationScrollLock(active: boolean): void {
  document.documentElement.classList.toggle("locale-switch-animating", active);
  document.body.classList.toggle("locale-switch-animating", active);
}

function restartLayoutAnimation(layout: HTMLElement, className: string): Promise<void> {
  layout.classList.remove(className);
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        layout.classList.add(className);
        resolve();
      });
    });
  });
}

export async function runLauncher(container?: HTMLElement | null): Promise<void> {
  // エントリ側から渡されたコンテナを優先し、未指定時は #app を探索する。
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
  const shouldPlayLocaleSwitchEnterAnimation = consumeLocaleSwitchReloadAnimation();

  if (mainLayout && shouldPlayLocaleSwitchEnterAnimation) {
    setLocaleSwitchAnimationScrollLock(true);
    void restartLayoutAnimation(mainLayout, "main-layout-locale-switch-in");
    let cleanedUp = false;
    const cleanupLocaleSwitchEnterAnimation = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      mainLayout.classList.remove("main-layout-locale-switch-in");
      setLocaleSwitchAnimationScrollLock(false);
    };

    mainLayout.addEventListener(
      "animationend",
      (event) => {
        if (event.target !== mainLayout || event.animationName !== "launcher-locale-switch-in") {
          return;
        }
        cleanupLocaleSwitchEnterAnimation();
      },
      { once: true },
    );
    window.setTimeout(
      cleanupLocaleSwitchEnterAnimation,
      LAUNCHER_MINIMIZE_EFFECT_DURATION_MS + 120,
    );
  }

  const {
    appVersion,
    settingsAppVersion,
    replayOnboardingButton,
    languageSelect,

    reselectAmongUsButton,
    openAmongUsFolderButton,
    openProfileFolderButton,
    closeToTrayOnCloseInput,
    closeWebviewOnTrayBackgroundInput,
    settingsGeneralStatus,
    reportNotificationsEnabledInput,
    announceNotificationsEnabledInput,
    settingsNotificationsStatus,
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
    settingsUpdateConfirmOverlay,
    settingsUpdateConfirmOverlayBackdrop,
    settingsUpdateConfirmCloseButton,
    settingsUpdateConfirmCancelButton,
    settingsUpdateConfirmAcceptButton,
    settingsUpdateConfirmMessage,
    settingsElevationConfirmOverlay,
    settingsElevationConfirmOverlayBackdrop,
    settingsElevationConfirmCloseButton,
    settingsElevationConfirmCancelButton,
    settingsElevationConfirmAcceptButton,
    settingsMigrationOverlay,
    settingsMigrationOverlayBackdrop,
    settingsMigrationOverlayCloseButton,
    settingsMigrationOverlayCancelButton,
    settingsMigrationOverlayTitle,
    settingsMigrationStepSelect,
    settingsMigrationSelectedPath,
    settingsMigrationPickPathButton,
    settingsMigrationStepSelectNextButton,
    settingsMigrationStepPassword,
    settingsMigrationPasswordInput,
    settingsMigrationPasswordError,
    settingsMigrationStepPasswordCancelButton,
    settingsMigrationStepPasswordNextButton,
    settingsMigrationStepProcessing,
    settingsMigrationProcessingMessage,
    settingsMigrationStepResult,
    settingsMigrationResultTitle,
    settingsMigrationResultMessage,
    settingsMigrationResultRetryButton,
    settingsMigrationResultCloseButton,
    installStatus,
    launchModdedButton,
    launchVanillaButton,
    createModdedShortcutButton,
    launchStatus,
    migrationExportButton,
    migrationImportButton,
    migrationStatus,
    presetOpenImportButton,
    presetOpenExportButton,
    presetOverlay,
    presetOverlayBackdrop,
    presetOverlayCloseButton,
    presetOverlayTitle,
    presetOverlayImportScreen,
    presetOverlayExportScreen,
    presetRefreshButton,
    presetSelectAllLocalButton,
    presetClearLocalButton,
    presetLocalList,
    presetExportButton,
    presetSelectAllArchiveButton,
    presetClearArchiveButton,
    presetImportButton,
    presetArchiveList,
    presetFeedbackOverlay,
    presetFeedbackOverlayBackdrop,
    presetFeedbackTitle,
    presetFeedbackMessage,
    presetFeedbackList,
    presetFeedbackPrimaryButton,
    presetFeedbackSecondaryButton,
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
  const closeToTrayOnCloseRow =
    closeToTrayOnCloseInput.closest<HTMLElement>(".settings-switch-row");
  const closeWebviewOnTrayBackgroundRow =
    closeWebviewOnTrayBackgroundInput.closest<HTMLElement>(".settings-switch-row");
  const reportNotificationsEnabledRow =
    reportNotificationsEnabledInput.closest<HTMLElement>(".settings-switch-row");
  const announceNotificationsEnabledRow =
    announceNotificationsEnabledInput.closest<HTMLElement>(".settings-switch-row");
  const migrationExtension = modConfig.migration.extension;
  const migrationLegacyExtension = "snrdata";
  const presetExtension = modConfig.presets.extension;
  const presetLegacyExtension = "snrpresets";
  const installProgressEventName = modConfig.events.installProgress;

  function syncSwitchRowDisabledState(
    input: HTMLInputElement,
    rowElement: HTMLElement | null,
  ): void {
    // disabled 状態を行コンテナへ反映し、視覚的にも操作不可を示す。
    rowElement?.classList.toggle("is-disabled", input.disabled);
  }

  function updateThemeButtons(theme: ThemePreference) {
    // 選択中テーマをボタンの active / aria-pressed に同期する。
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
    if (!isMainTabEnabled(tabId)) {
      return;
    }

    activeTab = tabId;
    saveLastMainTab(tabId);

    const reportPanel = document.querySelector<HTMLDivElement>("#tab-report");
    const announcePanel = document.querySelector<HTMLDivElement>("#tab-announce");
    const settingsPanel = document.querySelector<HTMLDivElement>("#tab-settings");
    const presetPanel = document.querySelector<HTMLDivElement>("#tab-preset");
    const serversPanel = document.querySelector<HTMLDivElement>("#tab-servers");
    const homeContent = document.querySelector<HTMLDivElement>("#tab-home .home-content");

    for (const panel of document.querySelectorAll(".tab-panel")) {
      panel.classList.toggle("tab-panel-active", (panel as HTMLElement).dataset.tab === tabId);
    }

    if (reportPanel) {
      reportPanel.classList.remove("tab-report-enter");
    }
    if (announcePanel) {
      announcePanel.classList.remove("tab-announce-enter");
    }
    if (settingsPanel) {
      settingsPanel.classList.remove("tab-settings-enter");
    }
    if (presetPanel) {
      presetPanel.classList.remove("tab-preset-enter");
    }
    if (serversPanel) {
      serversPanel.classList.remove("tab-servers-enter");
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
    if (tabId === "report" && REPORTING_ENABLED) {
      mountReportCenter();
      unmountAnnounceCenter();
      unmountGameServersCenter();
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
    } else if (tabId === "announce" && ANNOUNCE_ENABLED) {
      unmountReportCenter();
      mountAnnounceCenter();
      unmountGameServersCenter();
      if (announcePanel) {
        requestAnimationFrame(() => {
          announcePanel.classList.add("tab-announce-enter");
        });

        announcePanel.addEventListener(
          "animationend",
          (event) => {
            if (event.target !== announcePanel || event.animationName !== "announce-tab-enter") {
              return;
            }
            announcePanel.classList.remove("tab-announce-enter");
          },
          { once: true },
        );
      }
    } else if (tabId === "servers" && GAME_SERVERS_ENABLED && serversPanel) {
      unmountReportCenter();
      unmountAnnounceCenter();
      mountGameServersCenter();
      requestAnimationFrame(() => {
        serversPanel.classList.add("tab-servers-enter");
      });

      serversPanel.addEventListener(
        "animationend",
        (event) => {
          if (event.target !== serversPanel || event.animationName !== "servers-tab-enter") {
            return;
          }
          serversPanel.classList.remove("tab-servers-enter");
        },
        { once: true },
      );
    } else if (tabId === "settings" && settingsPanel) {
      unmountReportCenter();
      unmountAnnounceCenter();
      unmountGameServersCenter();
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
    } else if (tabId === "preset" && PRESETS_ENABLED && presetPanel) {
      unmountReportCenter();
      unmountAnnounceCenter();
      unmountGameServersCenter();
      requestAnimationFrame(() => {
        presetPanel.classList.add("tab-preset-enter");
      });

      presetPanel.addEventListener(
        "animationend",
        (event) => {
          if (event.target !== presetPanel || event.animationName !== "preset-tab-enter") {
            return;
          }
          presetPanel.classList.remove("tab-preset-enter");
        },
        { once: true },
      );
    } else {
      unmountReportCenter();
      unmountAnnounceCenter();
      unmountGameServersCenter();
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

    if (REPORTING_ENABLED && tabId === "home") {
      startHomeNotificationPolling();
    } else {
      stopHomeNotificationPolling();
    }

    if (!ANNOUNCE_ENABLED || tabId === "announce") {
      stopAnnounceNotificationPolling();
    } else {
      startAnnounceNotificationPolling();
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
    if (REPORTING_ENABLED) {
      switchTab("report");
    }
  });
  const reportCenterBadge = document.querySelector<HTMLSpanElement>("#report-center-badge");
  const reportTabBadge = document.querySelector<HTMLSpanElement>("#report-tab-badge");
  const announceTabBadge = document.querySelector<HTMLSpanElement>("#announce-tab-badge");
  const epicAuthStatusBox = document.querySelector<HTMLDivElement>("#epic-auth-status-box");
  const epicAuthStatusIcon = document.querySelector<HTMLDivElement>("#epic-auth-status-icon");
  const settingsCategoryButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-settings-category]"),
  );
  const settingsCategoryPanels = Array.from(
    document.querySelectorAll<HTMLElement>("[data-settings-panel]"),
  );

  function switchSettingsCategory(category: SettingsCategoryId): void {
    const nextCategory = isSettingsCategoryEnabled(category) ? category : DEFAULT_SETTINGS_CATEGORY;

    for (const button of settingsCategoryButtons) {
      const rawCategory = button.dataset.settingsCategory;
      const buttonEnabled = isSettingsCategoryId(rawCategory)
        ? isSettingsCategoryEnabled(rawCategory)
        : true;
      const selected = buttonEnabled && button.dataset.settingsCategory === nextCategory;
      button.hidden = !buttonEnabled;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    }

    for (const panel of settingsCategoryPanels) {
      const rawCategory = panel.dataset.settingsPanel;
      const panelEnabled = isSettingsCategoryId(rawCategory)
        ? isSettingsCategoryEnabled(rawCategory)
        : true;
      const selected = panelEnabled && panel.dataset.settingsPanel === nextCategory;
      panel.classList.toggle("is-active", selected);
      panel.hidden = !selected || !panelEnabled;
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
    if (!EPIC_LOGIN_ENABLED) {
      return;
    }
    if (!epicAuthStatusBox || !epicAuthStatusIcon) {
      return;
    }
    epicAuthStatusBox.classList.toggle("is-logged-in", state === "logged-in");
    epicAuthStatusBox.classList.toggle("is-error", state === "error");
    epicAuthStatusIcon.textContent = state === "logged-in" ? "✓" : state === "error" ? "⚠" : "🔐";
  }

  function renderEpicActionButtons(loggedIn: boolean): void {
    if (!EPIC_LOGIN_ENABLED) {
      epicLoginWebviewButton.hidden = true;
      epicLogoutButton.hidden = true;
      return;
    }
    epicLoginWebviewButton.hidden = loggedIn;
    epicLogoutButton.hidden = !loggedIn;
    epicLoginWebviewButton.setAttribute("aria-hidden", loggedIn ? "true" : "false");
    epicLogoutButton.setAttribute("aria-hidden", loggedIn ? "false" : "true");
  }

  renderEpicActionButtons(false);

  // 通知設定は永続値を先に確定し、store初期値とローカル変数を揃える。
  const initialReportingNotificationEnabled =
    REPORTING_ENABLED && localStorage.getItem(REPORTING_NOTIFICATION_STORAGE_KEY) === "1";
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
  let onboardingSpotlightTarget: HTMLElement | null = null;
  let onboardingGuideAnimationFrame: number | null = null;
  let onboardingReturnTab: MainTabId | null = null;
  let reportCenterRoot: Root | null = null;
  let announceCenterRoot: Root | null = null;
  let gameServersCenterRoot: Root | null = null;
  let pendingReportOpenThreadId: string | null = null;
  let pendingAnnounceOpenArticleId: string | null = null;
  let activeTab: MainTabId = consumeInstallFlowHomeAfterReload() ? "home" : loadLastMainTab();
  let reportHomeNotificationLastFetchedAt = 0;
  let reportHomeNotificationFetching = false;
  let reportHomeNotificationPollTimer: number | null = null;
  let announceBadgeLastFetchedAt = 0;
  let announceBadgeFetching = false;
  let announceBadgePollTimer: number | null = null;
  let launcherAutoMinimizePending = false;
  let launcherAutoMinimizeTimer: number | null = null;
  let launcherMinimizing = false;
  let launchStatusLockUntil = 0;
  let launchStatusLockTimer: number | null = null;
  let localeSwitchInProgress = false;
  let amongUsOverlayLoading = false;
  let amongUsReselectPulseTimer: number | null = null;
  let migrationOverlayMode: MigrationMode | null = null;
  let migrationOverlayStep: MigrationOverlayStep = "select";
  let migrationSelectedPath = "";
  let migrationPassword = "";
  let migrationResultSuccess = false;
  let migrationResultMessage = "";
  let presetOverlayMode: PresetOverlayMode | null = null;
  let presetFeedbackMode: PresetFeedbackMode = "none";
  let presetImportArchivePath = "";
  let presetFeedbackCloseAllOnDismiss = false;
  let presetFeedbackPrimaryAction: (() => void | Promise<void>) | null = null;
  let presetFeedbackSecondaryAction: (() => void | Promise<void>) | null = null;
  let pendingStartupUpdate: AvailableUpdate | null = null;
  let updateConfirmResolver: ((accepted: boolean) => void) | null = null;
  let updateConfirmBackdropUnlockAt = 0;
  let elevationConfirmResolver: ((accepted: boolean) => void) | null = null;
  const overlayAnimationTimers = new WeakMap<HTMLDivElement, number>();
  const overlayCloseTimers = new WeakMap<HTMLDivElement, number>();

  function clearPendingOnboardingGuideAnimation(): void {
    if (onboardingGuideAnimationFrame === null) {
      return;
    }
    window.cancelAnimationFrame(onboardingGuideAnimationFrame);
    onboardingGuideAnimationFrame = null;
  }

  function clearOnboardingSpotlight(): void {
    clearPendingOnboardingGuideAnimation();
    if (!onboardingSpotlightTarget) {
      return;
    }
    onboardingSpotlightTarget.classList.remove(
      ONBOARDING_SPOTLIGHT_CLASS,
      ONBOARDING_SPOTLIGHT_FOCUS_CLASS,
    );
    onboardingSpotlightTarget = null;
  }

  function applyOnboardingSpotlight(target: HTMLElement | null, withFocus: boolean): void {
    clearOnboardingSpotlight();
    if (!target) {
      return;
    }

    onboardingSpotlightTarget = target;
    target.classList.add(ONBOARDING_SPOTLIGHT_CLASS);
    if (!withFocus) {
      return;
    }

    target.classList.add(ONBOARDING_SPOTLIGHT_FOCUS_CLASS);
    if (typeof target.focus === "function") {
      target.focus();
    }
  }

  function applyOnboardingGuide(step: OnboardingStep): void {
    const guide = ONBOARDING_STEP_GUIDES.find((item) => item.step === step);
    if (!guide) {
      clearOnboardingSpotlight();
      return;
    }

    if (guide.tab && isMainTabId(guide.tab) && activeTab !== guide.tab) {
      switchTab(guide.tab);
    }

    if (guide.settingsCategory && isSettingsCategoryId(guide.settingsCategory)) {
      switchSettingsCategory(guide.settingsCategory);
    }

    if (!guide.selector) {
      clearOnboardingSpotlight();
      return;
    }

    clearPendingOnboardingGuideAnimation();
    onboardingGuideAnimationFrame = window.requestAnimationFrame(() => {
      onboardingGuideAnimationFrame = null;
      const target = document.querySelector<HTMLElement>(guide.selector ?? "");
      applyOnboardingSpotlight(target, Boolean(guide.focus));
    });
  }

  async function playOnboardingCompleteTransition(container: HTMLElement | null): Promise<void> {
    const overlay = container?.querySelector<HTMLElement>(".onboarding-wizard");
    if (!overlay) {
      return;
    }
    overlay.classList.add("onboarding-wizard-exit");

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };

      overlay.addEventListener(
        "animationend",
        (event) => {
          if (event.target !== overlay || event.animationName !== "onboarding-overlay-exit") {
            return;
          }
          finish();
        },
        { once: true },
      );

      window.setTimeout(finish, ONBOARDING_EXIT_ANIMATION_MS + 120);
    });
  }

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

    onboardingReturnTab = activeTab;
    clearOnboardingSpotlight();

    const handleComplete = async (reason: "skip" | "complete") => {
      try {
        settings = await settingsUpdate({ onboardingCompleted: true });
      } catch (error) {
        console.warn("Failed to persist onboarding completion:", error);
      } finally {
        const tabToRestore = onboardingReturnTab;
        onboardingReturnTab = null;
        clearOnboardingSpotlight();
        if (reason === "complete") {
          switchTab("home");
          await playOnboardingCompleteTransition(container);
        } else if (tabToRestore && isMainTabId(tabToRestore)) {
          switchTab(tabToRestore);
        }
        if (onboardingRoot) {
          onboardingRoot.unmount();
          onboardingRoot = null;
        }
        container?.remove();
      }
    };

    onboardingRoot.render(
      <OnboardingWizard
        onComplete={handleComplete}
        onStepChange={applyOnboardingGuide}
        reportingEnabled={REPORTING_ENABLED}
        presetsEnabled={PRESETS_ENABLED}
        migrationEnabled={MIGRATION_ENABLED}
      />,
    );
  }

  function mountReportCenter() {
    if (!REPORTING_ENABLED) {
      return;
    }
    const containerId = "report-center-root";
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!reportCenterRoot) {
      reportCenterRoot = createRoot(container);
    }

    reportCenterRoot.render(
      <ReportCenter
        t={t}
        openThreadId={pendingReportOpenThreadId}
        onOpenThreadHandled={(threadId) => {
          if (pendingReportOpenThreadId === threadId) {
            pendingReportOpenThreadId = null;
            mountReportCenter();
          }
        }}
      />,
    );
  }

  function mountAnnounceCenter() {
    if (!ANNOUNCE_ENABLED) {
      return;
    }
    const containerId = "announce-center-root";
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!announceCenterRoot) {
      announceCenterRoot = createRoot(container);
    }

    announceCenterRoot.render(
      <AnnounceCenter
        locale={currentLocale}
        t={t}
        onArticlesUpdated={handleAnnounceArticlesUpdated}
        openArticleId={pendingAnnounceOpenArticleId}
        onOpenArticleHandled={(articleId) => {
          if (pendingAnnounceOpenArticleId === articleId) {
            pendingAnnounceOpenArticleId = null;
            mountAnnounceCenter();
          }
        }}
      />,
    );
  }

  function mountGameServersCenter() {
    if (!GAME_SERVERS_ENABLED) {
      return;
    }
    const containerId = "game-servers-root";
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    if (!gameServersCenterRoot) {
      gameServersCenterRoot = createRoot(container);
    }

    gameServersCenterRoot.render(
      <GameServersCenter
        locale={currentLocale}
        t={t}
        initialSelectedServerId={settings?.selectedGameServerId ?? null}
        onSelectedServerIdChange={async (serverId) => {
          if (settings?.selectedGameServerId === serverId) {
            return;
          }
          settings = await settingsUpdate({ selectedGameServerId: serverId });
          renderSettings();
        }}
      />,
    );
  }

  function unmountReportCenter() {
    if (reportCenterRoot) {
      reportCenterRoot.unmount();
      reportCenterRoot = null;
    }
  }

  function unmountAnnounceCenter() {
    if (announceCenterRoot) {
      announceCenterRoot.unmount();
      announceCenterRoot = null;
    }
  }

  function unmountGameServersCenter() {
    if (gameServersCenterRoot) {
      gameServersCenterRoot.unmount();
      gameServersCenterRoot = null;
    }
  }

  function applyBackgroundNotificationOpenTarget(target: NotificationOpenTarget): void {
    if (target.kind === "report") {
      if (!REPORTING_ENABLED) {
        return;
      }
      pendingAnnounceOpenArticleId = null;
      pendingReportOpenThreadId = target.threadId;
      switchTab("report");
      return;
    }

    if (!ANNOUNCE_ENABLED) {
      return;
    }
    pendingReportOpenThreadId = null;
    pendingAnnounceOpenArticleId = target.articleId;
    switchTab("announce");
  }

  function setReportCenterNotificationBadge(hasUnread: boolean): void {
    if (!REPORTING_ENABLED) {
      return;
    }
    for (const badge of [reportCenterBadge, reportTabBadge]) {
      if (!badge) {
        continue;
      }
      badge.textContent = hasUnread ? "!" : "";
      badge.classList.toggle("is-visible", hasUnread);
    }
  }

  function parseAnnounceCreatedAt(value: string): number {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function resolveLatestAnnounceArticle(
    items: AnnounceArticleMinimal[],
  ): AnnounceArticleMinimal | null {
    let latest: AnnounceArticleMinimal | null = null;
    let latestCreatedAt = 0;
    for (const item of items) {
      const createdAt = parseAnnounceCreatedAt(item.created_at);
      if (!latest || createdAt > latestCreatedAt) {
        latest = item;
        latestCreatedAt = createdAt;
      }
    }
    return latest;
  }

  function getAnnounceReadCreatedAt(): number | null {
    try {
      const value = localStorage.getItem(ANNOUNCE_BADGE_READ_CREATED_AT_STORAGE_KEY);
      if (!value) {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function setAnnounceNotificationBadge(hasUnread: boolean): void {
    if (!ANNOUNCE_ENABLED) {
      return;
    }
    if (!announceTabBadge) {
      return;
    }
    announceTabBadge.textContent = hasUnread ? "!" : "";
    announceTabBadge.classList.toggle("is-visible", hasUnread);
  }

  function syncAnnounceBadgeFromItems(items: AnnounceArticleMinimal[]): void {
    const latest = resolveLatestAnnounceArticle(items);
    if (!latest) {
      setAnnounceNotificationBadge(false);
      return;
    }

    const latestCreatedAt = parseAnnounceCreatedAt(latest.created_at);

    const readCreatedAt = getAnnounceReadCreatedAt();
    if (readCreatedAt === null) {
      setAnnounceNotificationBadge(true);
      return;
    }

    setAnnounceNotificationBadge(latestCreatedAt > readCreatedAt);
  }

  function handleAnnounceArticlesUpdated(items: AnnounceArticleMinimal[]): void {
    announceBadgeLastFetchedAt = Date.now();
    syncAnnounceBadgeFromItems(items);
  }

  let awaitingFirstSetupCompletionForMinimize = false;
  let firstSetupPollTimer: number | null = null;
  let firstSetupPollGeneration = 0;

  function stopFirstSetupCompletionPolling(): void {
    awaitingFirstSetupCompletionForMinimize = false;
    firstSetupPollGeneration += 1;
    if (firstSetupPollTimer !== null) {
      window.clearTimeout(firstSetupPollTimer);
      firstSetupPollTimer = null;
    }
  }

  function startFirstSetupCompletionPolling(gameExe: string): void {
    stopFirstSetupCompletionPolling();
    awaitingFirstSetupCompletionForMinimize = true;
    const generation = firstSetupPollGeneration;

    const scheduleNext = (): void => {
      firstSetupPollTimer = window.setTimeout(() => {
        void pollOnce();
      }, MODDED_FIRST_SETUP_POLL_INTERVAL_MS);
    };

    const pollOnce = async (): Promise<void> => {
      if (generation !== firstSetupPollGeneration) {
        return;
      }
      if (!launcherAutoMinimizePending) {
        stopFirstSetupCompletionPolling();
        return;
      }

      try {
        const pending = await launchModdedFirstSetupPending(gameExe);
        if (generation !== firstSetupPollGeneration) {
          return;
        }
        if (!pending) {
          stopFirstSetupCompletionPolling();
          setLaunchStatus(t("launch.moddedSent"));
          if (launcherAutoMinimizePending) {
            clearLauncherAutoMinimizePending();
            void minimizeLauncherWindowWithEffect();
          }
          return;
        }
      } catch {
        if (generation !== firstSetupPollGeneration) {
          return;
        }
      }

      if (!launcherAutoMinimizePending) {
        stopFirstSetupCompletionPolling();
        return;
      }
      scheduleNext();
    };

    scheduleNext();
  }

  function clearLauncherAutoMinimizePending(): void {
    launcherAutoMinimizePending = false;
    if (launcherAutoMinimizeTimer !== null) {
      window.clearTimeout(launcherAutoMinimizeTimer);
      launcherAutoMinimizeTimer = null;
    }
    stopFirstSetupCompletionPolling();
  }

  function queueLauncherAutoMinimize(
    windowMs: number | null = LAUNCHER_AUTO_MINIMIZE_WINDOW_MS,
  ): void {
    clearLauncherAutoMinimizePending();
    launcherAutoMinimizePending = true;
    if (windowMs === null) {
      launcherAutoMinimizeTimer = null;
      return;
    }
    launcherAutoMinimizeTimer = window.setTimeout(() => {
      clearLauncherAutoMinimizePending();
    }, windowMs);
  }

  async function minimizeLauncherWindowWithEffect(): Promise<void> {
    if (launcherMinimizing) {
      return;
    }
    launcherMinimizing = true;

    try {
      if (mainLayout) {
        setLocaleSwitchAnimationScrollLock(true);
        await restartLayoutAnimation(mainLayout, "main-layout-minimize-out");
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
          setLocaleSwitchAnimationScrollLock(false);
        }, 80);
      } else {
        setLocaleSwitchAnimationScrollLock(false);
      }
      launcherMinimizing = false;
    }
  }

  async function refreshHomeNotificationState(force = false): Promise<void> {
    if (!REPORTING_ENABLED) {
      setReportCenterNotificationBadge(false);
      return;
    }

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
    if (!REPORTING_ENABLED) {
      return;
    }
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

  async function refreshAnnounceNotificationState(force = false): Promise<void> {
    if (!ANNOUNCE_ENABLED) {
      setAnnounceNotificationBadge(false);
      return;
    }

    if (activeTab === "announce") {
      return;
    }

    const now = Date.now();
    if (!force && now - announceBadgeLastFetchedAt < ANNOUNCE_BADGE_FETCH_GAP_MS) {
      return;
    }

    if (announceBadgeFetching) {
      return;
    }

    announceBadgeFetching = true;
    try {
      const response = await announceListArticles(currentLocale);
      announceBadgeLastFetchedAt = Date.now();
      syncAnnounceBadgeFromItems(response.items);
    } catch (error) {
      console.error("Failed to fetch announce notification state:", error);
    } finally {
      announceBadgeFetching = false;
    }
  }

  function startAnnounceNotificationPolling(): void {
    if (!ANNOUNCE_ENABLED) {
      return;
    }
    if (activeTab === "announce") {
      return;
    }

    if (announceBadgePollTimer === null) {
      announceBadgePollTimer = window.setInterval(() => {
        void refreshAnnounceNotificationState();
      }, ANNOUNCE_BADGE_POLL_INTERVAL_MS);
    }

    void refreshAnnounceNotificationState();
  }

  function stopAnnounceNotificationPolling(): void {
    if (announceBadgePollTimer !== null) {
      window.clearInterval(announceBadgePollTimer);
      announceBadgePollTimer = null;
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

  function setNotificationsStatusLine(
    message: string,
    tone: "info" | "error" | "success" | "warn" = "info",
  ): void {
    setStatusLine(settingsNotificationsStatus, message, tone);
  }

  function setShortcutStatusLine(
    message: string,
    tone: "info" | "error" | "success" | "warn" = "info",
  ): void {
    setStatusLine(settingsShortcutStatus, message, tone);
  }

  function createSocialIconElement(
    icon: SocialIcon,
    size: number,
  ): SVGSVGElement | HTMLImageElement {
    if (icon.kind === "image") {
      const img = document.createElement("img");
      img.src = icon.src;
      img.width = size;
      img.height = size;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.decoding = "async";
      if (icon.imageClassName) {
        img.classList.add(icon.imageClassName);
      }
      return img;
    }

    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", icon.viewBox);
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", icon.pathD);
    svg.append(path);

    return svg;
  }

  function renderOfficialLinksInto(container: HTMLDivElement, iconOnly: boolean): void {
    container.replaceChildren();
    if (!CONNECT_LINKS_ENABLED) {
      return;
    }
    for (const link of OFFICIAL_LINKS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = iconOnly ? "official-icon-link" : "pill-link";
      button.style.background = link.backgroundColor;
      button.setAttribute("aria-label", t("official.openInBrowserAria", { label: link.label }));
      button.title = link.label;
      const iconElement = createSocialIconElement(link.icon, iconOnly ? 14 : 16);
      button.append(iconElement);
      if (!iconOnly) {
        const label = document.createElement("span");
        label.textContent = link.label;
        button.append(label);
      }

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
    if (!CONNECT_LINKS_ENABLED) {
      officialLinkIcons.replaceChildren();
      officialLinkButtons.replaceChildren();
      return;
    }
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
      await settingsOpenFolder(target);
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
      const status = await modPreservedSaveDataStatus();
      preservedSaveDataAvailable = status.available && status.files > 0;
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

  function hasBlockedEpicPlatform(selectedSettings: LauncherSettings | null): boolean {
    return !EPIC_LOGIN_ENABLED && selectedSettings?.gamePlatform === "epic";
  }

  function updateButtons(): void {
    // ボタン活性条件は純関数に委譲し、DOM更新だけをここで行う。
    syncStoreSnapshot();
    const control = computeControlState(appStore.snapshot());
    const amongUsSelectionDisabled =
      control.detectAmongUsPathButtonDisabled || amongUsOverlayLoading;
    const epicPlatformBlocked = hasBlockedEpicPlatform(settings);

    uninstallButton.disabled = control.uninstallButtonDisabled;
    reselectAmongUsButton.disabled = amongUsSelectionDisabled;
    settingsAmongUsManualSelectButton.disabled = amongUsSelectionDisabled;
    for (const candidateButton of settingsAmongUsCandidateList.querySelectorAll<HTMLButtonElement>(
      ".settings-among-us-candidate-card",
    )) {
      candidateButton.disabled = amongUsSelectionDisabled;
    }
    settingsSupportDiscordLinkButton.disabled = !CONNECT_LINKS_ENABLED;
    settingsUninstallConfirmAcceptButton.disabled =
      uninstallInProgress || control.uninstallButtonDisabled;
    settingsUninstallConfirmCancelButton.disabled = uninstallInProgress;
    settingsUninstallConfirmCloseButton.disabled = uninstallInProgress;
    settingsElevationConfirmAcceptButton.disabled = false;
    settingsElevationConfirmCancelButton.disabled = false;
    settingsElevationConfirmCloseButton.disabled = false;
    launchModdedButton.disabled = epicPlatformBlocked || control.launchModdedButtonDisabled;
    launchVanillaButton.disabled = epicPlatformBlocked || control.launchVanillaButtonDisabled;
    createModdedShortcutButton.disabled = control.createModdedShortcutButtonDisabled;
    epicLoginWebviewButton.disabled = !EPIC_LOGIN_ENABLED || control.epicLoginWebviewButtonDisabled;
    epicLogoutButton.disabled = !EPIC_LOGIN_ENABLED || control.epicLogoutButtonDisabled;
    openAmongUsFolderButton.disabled = control.openAmongUsFolderButtonDisabled;
    openProfileFolderButton.disabled = control.openProfileFolderButtonDisabled;
    closeToTrayOnCloseInput.disabled = control.closeToTrayOnCloseInputDisabled;
    closeWebviewOnTrayBackgroundInput.disabled = control.closeWebviewOnTrayBackgroundInputDisabled;
    reportNotificationsEnabledInput.disabled = control.reportNotificationsEnabledInputDisabled;
    announceNotificationsEnabledInput.disabled = control.announceNotificationsEnabledInputDisabled;
    syncSwitchRowDisabledState(closeToTrayOnCloseInput, closeToTrayOnCloseRow);
    syncSwitchRowDisabledState(closeWebviewOnTrayBackgroundInput, closeWebviewOnTrayBackgroundRow);
    syncSwitchRowDisabledState(reportNotificationsEnabledInput, reportNotificationsEnabledRow);
    syncSwitchRowDisabledState(announceNotificationsEnabledInput, announceNotificationsEnabledRow);
    const migrationProcessing = migrationExporting || migrationImporting;
    migrationExportButton.disabled = !MIGRATION_ENABLED || control.migrationExportButtonDisabled;
    migrationImportButton.disabled = !MIGRATION_ENABLED || control.migrationImportButtonDisabled;
    settingsMigrationOverlayCloseButton.disabled = migrationProcessing;
    settingsMigrationOverlayCancelButton.disabled = migrationProcessing;
    settingsMigrationPickPathButton.disabled = migrationProcessing;
    settingsMigrationStepSelectNextButton.disabled =
      migrationProcessing || migrationSelectedPath.trim().length === 0;
    settingsMigrationPasswordInput.disabled = migrationProcessing;
    settingsMigrationStepPasswordCancelButton.disabled = migrationProcessing;
    settingsMigrationStepPasswordNextButton.disabled =
      migrationProcessing || migrationPassword.trim().length === 0;
    settingsMigrationResultRetryButton.disabled = migrationProcessing;
    settingsMigrationResultCloseButton.disabled = migrationProcessing;
    const presetProcessing =
      presetLoading || presetExporting || presetInspecting || presetImporting;
    presetOpenImportButton.disabled = !PRESETS_ENABLED || control.presetInspectButtonDisabled;
    presetOpenExportButton.disabled = !PRESETS_ENABLED || control.presetRefreshButtonDisabled;
    presetOverlayCloseButton.disabled = presetProcessing;
    presetRefreshButton.disabled = !PRESETS_ENABLED || control.presetRefreshButtonDisabled;
    presetSelectAllLocalButton.disabled =
      !PRESETS_ENABLED || control.presetSelectAllLocalButtonDisabled;
    presetClearLocalButton.disabled = !PRESETS_ENABLED || control.presetClearLocalButtonDisabled;
    presetExportButton.disabled = !PRESETS_ENABLED || control.presetExportButtonDisabled;
    presetSelectAllArchiveButton.disabled =
      !PRESETS_ENABLED || control.presetSelectAllArchiveButtonDisabled;
    presetClearArchiveButton.disabled =
      !PRESETS_ENABLED || control.presetClearArchiveButtonDisabled;
    presetImportButton.disabled = !PRESETS_ENABLED || control.presetImportButtonDisabled;
    presetFeedbackPrimaryButton.disabled = presetProcessing;
    presetFeedbackSecondaryButton.disabled = presetProcessing;
  }

  function clearLaunchStatusLock(): void {
    launchStatusLockUntil = 0;
    if (launchStatusLockTimer !== null) {
      window.clearTimeout(launchStatusLockTimer);
      launchStatusLockTimer = null;
    }
  }

  function isLaunchStatusLocked(): boolean {
    return Date.now() < launchStatusLockUntil;
  }

  function setLaunchStatus(message: string): void {
    clearLaunchStatusLock();
    launchStatus.textContent = message;
  }

  function setLaunchStatusWithLock(message: string, durationMs: number): void {
    clearLaunchStatusLock();
    launchStatus.textContent = message;
    launchStatusLockUntil = Date.now() + durationMs;
    launchStatusLockTimer = window.setTimeout(() => {
      launchStatusLockTimer = null;
      launchStatusLockUntil = 0;
      if (gameRunning) {
        launchStatus.textContent = t("launch.gameRunning");
      } else if (!launchInProgress) {
        launchStatus.textContent = t("launch.gameStopped");
      }
    }, durationMs);
  }

  function applyGameRunningState(running: boolean): void {
    const runningBefore = gameRunning;
    gameRunning = running;

    if (!runningBefore && gameRunning && launcherAutoMinimizePending) {
      if (!awaitingFirstSetupCompletionForMinimize) {
        clearLauncherAutoMinimizePending();
        void minimizeLauncherWindowWithEffect();
      }
    }

    if (!isLaunchStatusLocked()) {
      if (awaitingFirstSetupCompletionForMinimize) {
        launchStatus.textContent = t("launch.moddedFirstSetupStarting");
      } else if (gameRunning) {
        launchStatus.textContent = t("launch.gameRunning");
      } else if (!launchInProgress) {
        launchStatus.textContent = t("launch.gameStopped");
      }
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
    closeWebviewOnTrayBackgroundInput.checked = settings.closeWebviewOnTrayBackground;
    reportNotificationsEnabledInput.checked = settings.reportNotificationsEnabled;
    announceNotificationsEnabledInput.checked = settings.announceNotificationsEnabled;
  }

  async function reloadSettings(): Promise<LauncherSettings> {
    settings = await settingsGet();
    renderSettings();
    if (GAME_SERVERS_ENABLED && activeTab === "servers") {
      mountGameServersCenter();
    }
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
    if (!EPIC_LOGIN_ENABLED) {
      epicLoggedIn = false;
      epicAuthStatus.textContent = t("epic.notLoggedIn");
      renderEpicActionButtons(false);
      setEpicAuthVisualState("logged-out");
      updateButtons();
      return;
    }

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
      empty.className = "preset-selection-empty muted";
      empty.textContent = t("preset.localEmpty");
      presetLocalList.append(empty);
      return;
    }

    for (const preset of localPresets) {
      const presetName = preset.name.trim() || t("preset.emptyName");
      const row = document.createElement("label");
      row.className = "preset-selection-card preset-selection-card-local";
      if (!preset.hasDataFile) {
        row.classList.add("is-disabled");
      }

      const toggle = document.createElement("span");
      toggle.className = "preset-selection-toggle";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "preset-selection-checkbox";
      checkbox.dataset.role = "local-preset-checkbox";
      checkbox.dataset.presetId = String(preset.id);
      checkbox.disabled = !preset.hasDataFile;
      checkbox.setAttribute("aria-label", `[${preset.id}] ${presetName}`);

      const indicator = document.createElement("span");
      indicator.className = "preset-selection-indicator";
      indicator.setAttribute("aria-hidden", "true");
      toggle.append(checkbox, indicator);

      const body = document.createElement("span");
      body.className = "preset-selection-body";

      const head = document.createElement("span");
      head.className = "preset-selection-head";

      const idLabel = document.createElement("span");
      idLabel.className = "preset-selection-id";
      idLabel.textContent = `[${preset.id}]`;

      const title = document.createElement("span");
      title.className = "preset-selection-name";
      title.textContent = presetName;

      head.append(idLabel, title);
      body.append(head);

      if (!preset.hasDataFile) {
        const missing = document.createElement("span");
        missing.className = "preset-selection-note muted";
        missing.textContent = t("preset.localMissingDataFile");
        body.append(missing);
      }

      row.append(toggle, body);
      presetLocalList.append(row);
    }
  }

  function renderArchivePresetList(): void {
    presetArchiveList.replaceChildren();

    if (archivePresets.length === 0) {
      const empty = document.createElement("div");
      empty.className = "preset-selection-empty muted";
      empty.textContent = t("preset.archiveHint");
      presetArchiveList.append(empty);
      return;
    }

    for (const preset of archivePresets) {
      const presetName = preset.name.trim() || t("preset.emptyName");
      const row = document.createElement("div");
      row.className = "preset-selection-card preset-selection-card-archive";
      if (!preset.hasDataFile) {
        row.classList.add("is-disabled");
      }

      const toggle = document.createElement("label");
      toggle.className = "preset-selection-toggle";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "preset-selection-checkbox";
      checkbox.dataset.role = "archive-preset-checkbox";
      checkbox.dataset.presetId = String(preset.id);
      checkbox.checked = preset.hasDataFile;
      checkbox.disabled = !preset.hasDataFile;
      checkbox.setAttribute("aria-label", `[${preset.id}]`);

      const indicator = document.createElement("span");
      indicator.className = "preset-selection-indicator";
      indicator.setAttribute("aria-hidden", "true");
      toggle.append(checkbox, indicator);

      const body = document.createElement("div");
      body.className = "preset-selection-body";

      const head = document.createElement("div");
      head.className = "preset-selection-head";

      const idLabel = document.createElement("span");
      idLabel.className = "preset-selection-id";
      idLabel.textContent = `[${preset.id}]`;
      head.append(idLabel);

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "preset-selection-name-input";
      nameInput.dataset.role = "archive-preset-name";
      nameInput.dataset.presetId = String(preset.id);
      nameInput.value = presetName;
      nameInput.placeholder = t("preset.emptyName");
      nameInput.setAttribute("aria-label", `[${preset.id}]`);
      nameInput.disabled = !preset.hasDataFile;

      body.append(head, nameInput);

      if (!preset.hasDataFile) {
        const missing = document.createElement("span");
        missing.className = "preset-selection-note muted";
        missing.textContent = t("preset.archiveMissingData");
        body.append(missing);
      }

      if (preset.hasDataFile) {
        row.addEventListener("click", (event) => {
          const target = event.target as HTMLElement | null;
          if (!target) {
            return;
          }
          if (target.closest(".preset-selection-toggle")) {
            return;
          }
          if (target.closest('input[data-role="archive-preset-name"]')) {
            return;
          }
          checkbox.checked = !checkbox.checked;
        });
      }

      row.append(toggle, body);
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

  async function refreshLocalPresets(_keepStatusMessage = false): Promise<void> {
    if (!PRESETS_ENABLED) {
      localPresets = [];
      archivePresets = [];
      renderLocalPresetList();
      renderArchivePresetList();
      return;
    }

    presetLoading = true;
    updateButtons();

    try {
      localPresets = await presetsListLocal();
      renderLocalPresetList();
    } catch (error) {
      localPresets = [];
      renderLocalPresetList();
      setGeneralStatusLine(t("preset.statusLoadFailed", { error: String(error) }), "error");
    } finally {
      presetLoading = false;
      updateButtons();
    }
  }

  async function gameExePathFromSettings(): Promise<string> {
    if (!settings || !settings.amongUsPath.trim()) {
      throw new Error("Among Us path is not configured");
    }
    return join(settings.amongUsPath, modConfig.paths.amongUsExe);
  }

  const discordLink =
    OFFICIAL_LINKS.find((link) => link.label.toLowerCase() === "discord")?.url ??
    modConfig.links.supportDiscordUrl;

  function syncOverlayBodyLock(): void {
    const overlayOpen =
      !settingsAmongUsOverlay.hidden ||
      !settingsUninstallConfirmOverlay.hidden ||
      !settingsUpdateConfirmOverlay.hidden ||
      !settingsElevationConfirmOverlay.hidden ||
      !settingsMigrationOverlay.hidden ||
      !presetOverlay.hidden ||
      !presetFeedbackOverlay.hidden;
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

  function animateAmongUsReselection(): void {
    if (amongUsReselectPulseTimer !== null) {
      window.clearTimeout(amongUsReselectPulseTimer);
      amongUsReselectPulseTimer = null;
    }

    void restartLayoutAnimation(
      reselectAmongUsButton,
      "settings-general-primary-action-reselected",
    );
    amongUsReselectPulseTimer = window.setTimeout(() => {
      reselectAmongUsButton.classList.remove("settings-general-primary-action-reselected");
      amongUsReselectPulseTimer = null;
    }, 760);
  }

  async function applyAmongUsSelection(path: string, platform: GamePlatform): Promise<void> {
    if (!isPlatformSelectable(platform, EPIC_LOGIN_ENABLED)) {
      setAmongUsOverlayError(t("launch.errorEpicFeatureDisabled"));
      return;
    }
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
      amongUsOverlayLoading = false;
      closeAmongUsOverlay();
      animateAmongUsReselection();
    } catch (error) {
      setAmongUsOverlayError(t("detect.failed", { error: String(error) }));
    } finally {
      amongUsOverlayLoading = false;
      updateButtons();
    }
  }

  function renderAmongUsCandidates(candidates: { path: string; platform: string }[]): void {
    settingsAmongUsCandidateList.replaceChildren();
    const normalizedCandidates = filterSelectablePlatformCandidates(
      normalizePlatformCandidates(candidates),
      EPIC_LOGIN_ENABLED,
    );

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
        if (!isPlatformSelectable(platform, EPIC_LOGIN_ENABLED)) {
          setAmongUsOverlayError(t("launch.errorEpicFeatureDisabled"));
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

  closeWebviewOnTrayBackgroundInput.addEventListener("change", async () => {
    const enabled = closeWebviewOnTrayBackgroundInput.checked;
    await saveSettings({ closeWebviewOnTrayBackground: enabled });
    setGeneralStatusLine(
      t("settings.closeWebviewOnTrayBackgroundSaved", {
        state: enabled ? t("common.on") : t("common.off"),
      }),
      "success",
    );
    updateButtons();
  });

  reportNotificationsEnabledInput.addEventListener("change", async () => {
    const enabled = reportNotificationsEnabledInput.checked;
    await saveSettings({ reportNotificationsEnabled: enabled });
    setNotificationsStatusLine(
      t("settings.reportNotificationsEnabledSaved", {
        state: enabled ? t("common.on") : t("common.off"),
      }),
      "success",
    );
    updateButtons();
  });

  announceNotificationsEnabledInput.addEventListener("change", async () => {
    const enabled = announceNotificationsEnabledInput.checked;
    await saveSettings({ announceNotificationsEnabled: enabled });
    setNotificationsStatusLine(
      t("settings.announceNotificationsEnabledSaved", {
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
      const result = await modUninstall(true);
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

  function closeUpdateConfirmOverlay(force = false): void {
    closeSettingsOverlay(settingsUpdateConfirmOverlay, force);
    // Any close path must settle the pending confirmation promise.
    if (!updateConfirmResolver) {
      return;
    }
    const resolve = updateConfirmResolver;
    updateConfirmResolver = null;
    resolve(false);
  }

  function resolveUpdateConfirm(accepted: boolean): void {
    if (!updateConfirmResolver) {
      return;
    }
    const resolve = updateConfirmResolver;
    updateConfirmResolver = null;
    closeSettingsOverlay(settingsUpdateConfirmOverlay);
    resolve(accepted);
  }

  function openUpdateConfirmOverlay(version: string): Promise<boolean> {
    if (updateConfirmResolver) {
      const resolve = updateConfirmResolver;
      updateConfirmResolver = null;
      resolve(false);
    }
    updateConfirmBackdropUnlockAt = Date.now() + 1_000;
    settingsUpdateConfirmMessage.textContent = t("update.confirmPrompt", { version });
    openSettingsOverlay(settingsUpdateConfirmOverlay);
    settingsUpdateConfirmAcceptButton.focus();
    return new Promise<boolean>((resolve) => {
      updateConfirmResolver = resolve;
    });
  }

  settingsUpdateConfirmOverlayBackdrop.addEventListener("click", () => {
    if (Date.now() < updateConfirmBackdropUnlockAt) {
      return;
    }
    resolveUpdateConfirm(false);
  });
  settingsUpdateConfirmCloseButton.addEventListener("click", () => {
    resolveUpdateConfirm(false);
  });
  settingsUpdateConfirmCancelButton.addEventListener("click", () => {
    resolveUpdateConfirm(false);
  });
  settingsUpdateConfirmAcceptButton.addEventListener("click", () => {
    resolveUpdateConfirm(true);
  });

  function closeElevationConfirmOverlay(force = false): void {
    closeSettingsOverlay(settingsElevationConfirmOverlay, force);
    if (!elevationConfirmResolver) {
      return;
    }
    const resolve = elevationConfirmResolver;
    elevationConfirmResolver = null;
    resolve(false);
  }

  function resolveElevationConfirm(accepted: boolean): void {
    if (!elevationConfirmResolver) {
      return;
    }
    const resolve = elevationConfirmResolver;
    elevationConfirmResolver = null;
    closeSettingsOverlay(settingsElevationConfirmOverlay);
    resolve(accepted);
  }

  function openElevationConfirmOverlay(): Promise<boolean> {
    if (elevationConfirmResolver) {
      const resolve = elevationConfirmResolver;
      elevationConfirmResolver = null;
      resolve(false);
    }
    openSettingsOverlay(settingsElevationConfirmOverlay);
    settingsElevationConfirmAcceptButton.focus();
    return new Promise<boolean>((resolve) => {
      elevationConfirmResolver = resolve;
    });
  }

  settingsElevationConfirmOverlayBackdrop.addEventListener("click", () => {
    resolveElevationConfirm(false);
  });
  settingsElevationConfirmCloseButton.addEventListener("click", () => {
    resolveElevationConfirm(false);
  });
  settingsElevationConfirmCancelButton.addEventListener("click", () => {
    resolveElevationConfirm(false);
  });
  settingsElevationConfirmAcceptButton.addEventListener("click", () => {
    resolveElevationConfirm(true);
  });

  function isMigrationProcessing(): boolean {
    return migrationExporting || migrationImporting;
  }

  function localizeLaunchError(error: unknown): string {
    return localizeLaunchErrorMessage(error, modConfig.paths.amongUsExe, t);
  }

  async function retryLaunchWithElevationIfNeeded(
    error: unknown,
    input: ElevationLaunchRetryInput,
  ): Promise<boolean> {
    if (!isElevationRequiredLaunchError(error)) {
      return false;
    }

    clearLauncherAutoMinimizePending();
    const accepted = await openElevationConfirmOverlay();
    if (!accepted) {
      if (input.kind === "modded") {
        setLaunchStatusWithLock(
          t("launch.moddedFailed", { error: localizeLaunchError(error) }),
          LAUNCH_ERROR_DISPLAY_MS,
        );
      } else {
        setLaunchStatusWithLock(
          t("launch.vanillaFailed", { error: localizeLaunchError(error) }),
          LAUNCH_ERROR_DISPLAY_MS,
        );
      }
      return true;
    }

    if (input.kind === "modded") {
      queueLauncherAutoMinimize(input.firstSetupPending ? null : LAUNCHER_AUTO_MINIMIZE_WINDOW_MS);
      if (input.firstSetupPending) {
        setLaunchStatus(t("launch.moddedFirstSetupStarting"));
        startFirstSetupCompletionPolling(input.gameExe);
      } else {
        setLaunchStatus(t("launch.moddedStarting"));
      }
    } else {
      queueLauncherAutoMinimize();
      setLaunchStatus(t("launch.vanillaStarting"));
    }

    try {
      if (input.kind === "modded") {
        await launchModdedElevated({
          gameExe: input.gameExe,
          profilePath: input.profilePath,
          platform: input.platform,
        });
        if (!input.firstSetupPending) {
          setLaunchStatus(t("launch.moddedSent"));
        }
      } else {
        await launchVanillaElevated({
          gameExe: input.gameExe,
          platform: input.platform,
        });
        setLaunchStatus(t("launch.vanillaSent"));
      }
      return true;
    } catch (retryError) {
      clearLauncherAutoMinimizePending();
      if (input.kind === "modded") {
        setLaunchStatusWithLock(
          t("launch.moddedFailed", { error: localizeLaunchError(retryError) }),
          LAUNCH_ERROR_DISPLAY_MS,
        );
      } else {
        setLaunchStatusWithLock(
          t("launch.vanillaFailed", { error: localizeLaunchError(retryError) }),
          LAUNCH_ERROR_DISPLAY_MS,
        );
      }
      return true;
    }
  }

  function isMigrationPasswordError(message: string): boolean {
    const normalized = message.toLowerCase();
    const passwordPatterns = [
      "incorrect password",
      "invalid password",
      "wrong password",
      "password mismatch",
      "decrypt",
      "decryption failed",
      "authentication failed",
      "hmac",
      "mac mismatch",
      "tag mismatch",
      "aead",
    ];
    if (message.includes("パスワード")) {
      return true;
    }
    return passwordPatterns.some((pattern) => normalized.includes(pattern));
  }

  function setMigrationPasswordError(
    message: string | null,
    tone: "info" | "error" | "success" | "warn" = "warn",
  ): void {
    if (!message) {
      settingsMigrationPasswordError.hidden = true;
      settingsMigrationPasswordError.textContent = "";
      settingsMigrationPasswordError.className = "status-line";
      return;
    }
    settingsMigrationPasswordError.hidden = false;
    setStatusLine(settingsMigrationPasswordError, message, tone);
  }

  function renderMigrationOverlayContent(): void {
    if (!migrationOverlayMode) {
      return;
    }

    const exportMode = migrationOverlayMode === "export";
    settingsMigrationOverlayTitle.textContent = exportMode
      ? t("migration.overlay.exportTitle")
      : t("migration.overlay.importTitle");

    settingsMigrationSelectedPath.textContent =
      migrationSelectedPath.trim().length > 0
        ? t("migration.overlay.selectedPath", { path: migrationSelectedPath })
        : t("migration.overlay.pathNotSelected");

    settingsMigrationProcessingMessage.textContent = exportMode
      ? t("migration.overlay.exporting")
      : t("migration.overlay.importing");

    settingsMigrationStepSelect.hidden = migrationOverlayStep !== "select";
    settingsMigrationStepPassword.hidden = migrationOverlayStep !== "password";
    settingsMigrationStepProcessing.hidden = migrationOverlayStep !== "processing";
    settingsMigrationStepResult.hidden = migrationOverlayStep !== "result";
    settingsMigrationOverlayCloseButton.hidden = false;

    settingsMigrationResultRetryButton.hidden = migrationResultSuccess;
    settingsMigrationResultCloseButton.hidden = !migrationResultSuccess;
    settingsMigrationResultTitle.textContent = migrationResultSuccess
      ? exportMode
        ? t("migration.overlay.exportCompleteTitle")
        : t("migration.overlay.importCompleteTitle")
      : t("migration.overlay.failedTitle");
    settingsMigrationResultMessage.textContent = migrationResultMessage;
    settingsMigrationResultMessage.classList.toggle("is-error", !migrationResultSuccess);
    settingsMigrationResultMessage.classList.toggle("is-success", migrationResultSuccess);
  }

  function resetMigrationOverlayState(mode: MigrationMode): void {
    migrationOverlayMode = mode;
    migrationOverlayStep = "select";
    migrationSelectedPath = "";
    migrationPassword = "";
    migrationResultSuccess = false;
    migrationResultMessage = "";
    settingsMigrationPasswordInput.value = "";
    setMigrationPasswordError(null);
    renderMigrationOverlayContent();
  }

  function closeMigrationOverlay(force = false): void {
    if (isMigrationProcessing() && !force) {
      return;
    }
    closeSettingsOverlay(settingsMigrationOverlay, force);
    migrationOverlayMode = null;
    migrationOverlayStep = "select";
    migrationSelectedPath = "";
    migrationPassword = "";
    migrationResultSuccess = false;
    migrationResultMessage = "";
    settingsMigrationPasswordInput.value = "";
    setMigrationPasswordError(null);
    updateButtons();
  }

  async function resolveMigrationDialogDefaultPath(
    mode: MigrationMode,
  ): Promise<string | undefined> {
    try {
      const downloadsPath = await downloadDir();
      if (mode === "export") {
        return join(downloadsPath, `migration.${migrationExtension}`);
      }
      return downloadsPath;
    } catch {
      if (mode === "export") {
        return `migration.${migrationExtension}`;
      }
      return undefined;
    }
  }

  async function pickMigrationPathForMode(mode: MigrationMode): Promise<string | null> {
    const defaultPath = await resolveMigrationDialogDefaultPath(mode);

    try {
      if (mode === "export") {
        const selectedPath = await save({
          title: t("migration.overlay.exportDialogTitle"),
          defaultPath,
          filters: [{ name: migrationExtension, extensions: [migrationExtension] }],
        });
        return selectedPath ?? null;
      }

      const selectedPath = await open({
        multiple: false,
        directory: false,
        defaultPath,
        filters: [
          {
            name: migrationExtension,
            extensions: Array.from(new Set([migrationExtension, migrationLegacyExtension])),
          },
        ],
      });
      if (!selectedPath || Array.isArray(selectedPath)) {
        return null;
      }
      return selectedPath;
    } catch {
      // user cancelled
      return null;
    }
  }

  async function pickMigrationPath(): Promise<void> {
    if (!migrationOverlayMode || isMigrationProcessing()) {
      return;
    }
    const selectedPath = await pickMigrationPathForMode(migrationOverlayMode);
    if (selectedPath) {
      migrationSelectedPath = selectedPath;
    }
    renderMigrationOverlayContent();
    updateButtons();
  }

  async function runMigrationOperation(): Promise<void> {
    if (!migrationOverlayMode) {
      return;
    }

    const mode = migrationOverlayMode;
    const selectedPath = migrationSelectedPath.trim();
    if (!selectedPath) {
      migrationOverlayStep = "select";
      renderMigrationOverlayContent();
      updateButtons();
      return;
    }

    const password = migrationPassword.trim();
    if (password.length === 0) {
      setMigrationPasswordError(t("migration.overlay.passwordRequired"), "warn");
      updateButtons();
      return;
    }

    migrationOverlayStep = "processing";
    renderMigrationOverlayContent();

    if (mode === "export") {
      migrationExporting = true;
      setStatusLine(migrationStatus, t("migration.exporting"));
    } else {
      migrationImporting = true;
      setStatusLine(migrationStatus, t("migration.importing"));
    }
    updateButtons();

    try {
      if (mode === "export") {
        const result = await migrationExport({
          outputPath: selectedPath,
          encryptionEnabled: true,
          password,
        });
        migrationSelectedPath = result.archivePath;
        migrationResultSuccess = true;
        migrationResultMessage = t("migration.overlay.exportSuccess", {
          path: result.archivePath,
          count: result.includedFiles,
          profile: result.profileFiles,
          locallow: result.locallowFiles,
        });
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
      } else {
        const result = await migrationImport({
          archivePath: selectedPath,
          password,
        });
        migrationResultSuccess = true;
        migrationResultMessage = t("migration.overlay.importSuccess", {
          count: result.importedFiles,
          profile: result.profileFiles,
          locallow: result.locallowFiles,
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
      }
    } catch (error) {
      const message = String(error);
      migrationResultSuccess = false;
      if (mode === "export") {
        migrationResultMessage = t("migration.overlay.failedWithError", { error: message });
        setStatusLine(migrationStatus, t("migration.exportFailed", { error: message }), "error");
      } else {
        const invalidPassword = isMigrationPasswordError(message);
        if (invalidPassword) {
          const localized = t("migration.overlay.invalidPassword");
          migrationResultMessage = localized;
          setStatusLine(
            migrationStatus,
            t("migration.importFailed", { error: localized }),
            "error",
          );
        } else {
          migrationResultMessage = t("migration.overlay.failedWithError", { error: message });
          setStatusLine(migrationStatus, t("migration.importFailed", { error: message }), "error");
        }
      }
    } finally {
      migrationExporting = false;
      migrationImporting = false;
      migrationOverlayStep = "result";
      renderMigrationOverlayContent();
      updateButtons();
    }
  }

  function openMigrationOverlay(mode: MigrationMode, selectedPath?: string): void {
    resetMigrationOverlayState(mode);
    if (selectedPath) {
      migrationSelectedPath = selectedPath;
      migrationOverlayStep = "password";
      renderMigrationOverlayContent();
    }
    openSettingsOverlay(settingsMigrationOverlay);
    updateButtons();
  }

  async function startMigrationFlow(mode: MigrationMode): Promise<void> {
    if (!MIGRATION_ENABLED) {
      return;
    }
    if (isMigrationProcessing()) {
      return;
    }

    closeMigrationOverlay(true);
    const selectedPath = await pickMigrationPathForMode(mode);
    if (!selectedPath) {
      return;
    }
    openMigrationOverlay(mode, selectedPath);
    settingsMigrationPasswordInput.focus();
  }

  migrationExportButton.addEventListener("click", () => {
    void startMigrationFlow("export");
  });

  migrationImportButton.addEventListener("click", () => {
    void startMigrationFlow("import");
  });

  settingsMigrationOverlayBackdrop.addEventListener("click", () => {
    closeMigrationOverlay();
  });
  settingsMigrationOverlayCloseButton.addEventListener("click", () => {
    closeMigrationOverlay();
  });
  settingsMigrationOverlayCancelButton.addEventListener("click", () => {
    closeMigrationOverlay();
  });
  settingsMigrationPickPathButton.addEventListener("click", async () => {
    await pickMigrationPath();
  });
  settingsMigrationStepSelectNextButton.addEventListener("click", () => {
    if (migrationSelectedPath.trim().length === 0 || isMigrationProcessing()) {
      return;
    }
    migrationOverlayStep = "password";
    setMigrationPasswordError(null);
    renderMigrationOverlayContent();
    settingsMigrationPasswordInput.focus();
    updateButtons();
  });
  settingsMigrationPasswordInput.addEventListener("input", () => {
    migrationPassword = settingsMigrationPasswordInput.value;
    if (migrationPassword.trim().length > 0) {
      setMigrationPasswordError(null);
    }
    updateButtons();
  });
  settingsMigrationStepPasswordCancelButton.addEventListener("click", () => {
    closeMigrationOverlay();
  });
  settingsMigrationStepPasswordNextButton.addEventListener("click", async () => {
    migrationPassword = settingsMigrationPasswordInput.value;
    if (migrationPassword.trim().length === 0) {
      setMigrationPasswordError(t("migration.overlay.passwordRequired"), "warn");
      updateButtons();
      return;
    }
    await runMigrationOperation();
  });
  settingsMigrationResultRetryButton.addEventListener("click", () => {
    if (isMigrationProcessing()) {
      return;
    }
    if (migrationOverlayMode) {
      void startMigrationFlow(migrationOverlayMode);
    }
  });
  settingsMigrationResultCloseButton.addEventListener("click", () => {
    closeMigrationOverlay();
  });

  function isPresetProcessing(): boolean {
    return presetLoading || presetExporting || presetInspecting || presetImporting;
  }

  function renderPresetOverlayContent(): void {
    if (!presetOverlayMode) {
      presetOverlayImportScreen.hidden = true;
      presetOverlayExportScreen.hidden = true;
      presetOverlayTitle.textContent = t("preset.title");
      return;
    }

    const importMode = presetOverlayMode === "import";
    presetOverlayImportScreen.hidden = !importMode;
    presetOverlayExportScreen.hidden = importMode;
    presetOverlayTitle.textContent = importMode
      ? t("preset.importSelected")
      : t("preset.exportSelected");
  }

  function openPresetOverlay(mode: PresetOverlayMode): void {
    if (!PRESETS_ENABLED) {
      return;
    }
    if (isPresetProcessing()) {
      return;
    }
    presetOverlayMode = mode;
    renderPresetOverlayContent();
    openSettingsOverlay(presetOverlay);
    updateButtons();
  }

  function closePresetOverlay(force = false): void {
    if (isPresetProcessing() && !force) {
      return;
    }
    closeSettingsOverlay(presetOverlay, force);
    presetOverlayMode = null;
    renderPresetOverlayContent();
    updateButtons();
  }

  function closePresetResultOverlay(force = false): void {
    if (isPresetProcessing() && !force) {
      return;
    }
    closeSettingsOverlay(presetFeedbackOverlay, force);
    const resetPresetFeedbackState = () => {
      presetFeedbackMode = "none";
      presetFeedbackCloseAllOnDismiss = false;
      presetFeedbackPrimaryAction = null;
      presetFeedbackSecondaryAction = null;
      presetFeedbackTitle.textContent = "";
      presetFeedbackMessage.textContent = "";
      presetFeedbackList.replaceChildren();
      presetFeedbackList.hidden = true;
      presetFeedbackPrimaryButton.hidden = false;
      presetFeedbackSecondaryButton.hidden = false;
    };
    if (force) {
      resetPresetFeedbackState();
    } else {
      window.setTimeout(() => {
        if (!presetFeedbackOverlay.hidden) {
          return;
        }
        resetPresetFeedbackState();
        updateButtons();
      }, SETTINGS_OVERLAY_TRANSITION_MS);
    }
    updateButtons();
  }

  function closeAllOverlays(force = false): void {
    closePresetResultOverlay(force);
    closePresetOverlay(force);
    closeUninstallConfirmOverlay(force);
    closeUpdateConfirmOverlay(force);
    closeElevationConfirmOverlay(force);
    closeMigrationOverlay(force);
    closeAmongUsOverlay(force);
  }

  function openPresetFeedbackOverlay(
    mode: PresetFeedbackMode,
    title: string,
    message: string,
    listItems: string[],
    primaryLabel: string,
    secondaryLabel: string | null,
    onPrimary: (() => void | Promise<void>) | null,
    onSecondary: (() => void | Promise<void>) | null,
    closeAllOnDismiss = false,
  ): void {
    presetFeedbackMode = mode;
    presetFeedbackCloseAllOnDismiss = closeAllOnDismiss;
    presetFeedbackPrimaryAction = onPrimary;
    presetFeedbackSecondaryAction = onSecondary;
    presetFeedbackTitle.textContent = title;
    presetFeedbackMessage.textContent = message;
    presetFeedbackList.replaceChildren();
    if (listItems.length > 0) {
      const items = listItems.map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      });
      presetFeedbackList.append(...items);
      presetFeedbackList.hidden = false;
    } else {
      presetFeedbackList.hidden = true;
    }
    presetFeedbackPrimaryButton.textContent = primaryLabel;
    presetFeedbackPrimaryButton.hidden = false;
    if (secondaryLabel) {
      presetFeedbackSecondaryButton.textContent = secondaryLabel;
      presetFeedbackSecondaryButton.hidden = false;
    } else {
      presetFeedbackSecondaryButton.textContent = "";
      presetFeedbackSecondaryButton.hidden = true;
    }
    openSettingsOverlay(presetFeedbackOverlay);
    updateButtons();
  }

  function showPresetResultOverlay(
    message: string,
    title = t("preset.feedback.doneTitle"),
    listItems: string[] = [],
    closeAllOnDismiss = true,
  ): void {
    openPresetFeedbackOverlay(
      "result",
      title,
      message,
      listItems,
      t("preset.feedback.close"),
      null,
      null,
      null,
      closeAllOnDismiss,
    );
  }

  presetOpenImportButton.addEventListener("click", () => {
    void startPresetImportFlow();
  });

  presetOpenExportButton.addEventListener("click", () => {
    openPresetOverlay("export");
  });

  presetOverlayBackdrop.addEventListener("click", () => {
    closePresetOverlay();
  });

  presetOverlayCloseButton.addEventListener("click", () => {
    closePresetOverlay();
  });

  presetFeedbackOverlayBackdrop.addEventListener("click", () => {
    if (presetFeedbackMode === "result") {
      if (presetFeedbackCloseAllOnDismiss) {
        closeAllOverlays();
      } else {
        closePresetResultOverlay();
      }
      return;
    }
    closePresetResultOverlay();
  });

  presetFeedbackPrimaryButton.addEventListener("click", () => {
    const action = presetFeedbackPrimaryAction;
    if (action) {
      void action();
      return;
    }
    if (presetFeedbackMode === "result") {
      if (presetFeedbackCloseAllOnDismiss) {
        closeAllOverlays();
      } else {
        closePresetResultOverlay();
      }
      return;
    }
    closePresetResultOverlay();
  });

  presetFeedbackSecondaryButton.addEventListener("click", () => {
    const action = presetFeedbackSecondaryAction;
    if (action) {
      void action();
      return;
    }
    closePresetResultOverlay();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!presetFeedbackOverlay.hidden) {
      if (presetFeedbackMode === "result") {
        if (presetFeedbackCloseAllOnDismiss) {
          closeAllOverlays();
        } else {
          closePresetResultOverlay();
        }
      } else {
        closePresetResultOverlay();
      }
      return;
    }
    if (!presetOverlay.hidden) {
      closePresetOverlay();
      return;
    }
    if (!settingsUninstallConfirmOverlay.hidden) {
      closeUninstallConfirmOverlay();
      return;
    }
    if (!settingsUpdateConfirmOverlay.hidden) {
      resolveUpdateConfirm(false);
      return;
    }
    if (!settingsElevationConfirmOverlay.hidden) {
      resolveElevationConfirm(false);
      return;
    }
    if (!settingsMigrationOverlay.hidden) {
      closeMigrationOverlay();
      return;
    }
    if (!settingsAmongUsOverlay.hidden) {
      closeAmongUsOverlay();
    }
  });

  async function resolvePresetExportDefaultPath(): Promise<string | undefined> {
    try {
      const downloadsPath = await downloadDir();
      return join(downloadsPath, `presets.${presetExtension}`);
    } catch {
      return `presets.${presetExtension}`;
    }
  }

  async function pickPresetExportPath(): Promise<string | null> {
    const defaultPath = await resolvePresetExportDefaultPath();
    try {
      const selectedPath = await save({
        title: t("preset.exportDialogTitle"),
        defaultPath,
        filters: [{ name: presetExtension, extensions: [presetExtension] }],
      });
      return selectedPath ?? null;
    } catch {
      // user cancelled
      return null;
    }
  }

  async function resolvePresetImportDefaultPath(): Promise<string | undefined> {
    try {
      return await downloadDir();
    } catch {
      return undefined;
    }
  }

  async function pickPresetImportPath(): Promise<string | null> {
    const defaultPath = await resolvePresetImportDefaultPath();
    try {
      const selectedPath = await open({
        title: t("preset.importDialogTitle"),
        multiple: false,
        directory: false,
        defaultPath,
        filters: [
          {
            name: presetExtension,
            extensions: Array.from(new Set([presetExtension, presetLegacyExtension])),
          },
        ],
      });
      if (!selectedPath || Array.isArray(selectedPath)) {
        return null;
      }
      return selectedPath;
    } catch {
      // user cancelled
      return null;
    }
  }

  async function inspectPresetArchiveWithStatus(archivePath: string): Promise<boolean> {
    if (!archivePath) {
      return false;
    }

    presetInspecting = true;
    updateButtons();

    try {
      archivePresets = await presetsInspectArchive(archivePath);
      renderArchivePresetList();
      return true;
    } catch (error) {
      archivePresets = [];
      renderArchivePresetList();
      showPresetResultOverlay(
        t("preset.statusInspectFailed", { error: String(error) }),
        t("preset.title"),
        [],
        false,
      );
      return false;
    } finally {
      presetInspecting = false;
      updateButtons();
    }
  }

  async function startPresetImportFlow(): Promise<void> {
    if (!PRESETS_ENABLED) {
      return;
    }
    if (isPresetProcessing()) {
      return;
    }
    closePresetOverlay(true);
    closePresetResultOverlay(true);
    const archivePath = await pickPresetImportPath();
    if (!archivePath) {
      return;
    }
    presetImportArchivePath = archivePath;
    openPresetOverlay("import");
    await inspectPresetArchiveWithStatus(archivePath);
  }

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
      showPresetResultOverlay(t("preset.exportSelectRequired"), t("preset.title"), [], false);
      return;
    }
    const outputPath = await pickPresetExportPath();
    if (!outputPath) {
      return;
    }

    presetExporting = true;
    updateButtons();

    try {
      const result = await presetsExport({
        presetIds: selectedIds,
        outputPath,
      });

      presetImportArchivePath = result.archivePath;
      showPresetResultOverlay(t("preset.feedback.exportDone", { count: result.exportedPresets }));
    } catch (error) {
      showPresetResultOverlay(
        t("preset.statusExportFailed", { error: String(error) }),
        t("preset.title"),
      );
    } finally {
      presetExporting = false;
      updateButtons();
    }
  });

  presetSelectAllArchiveButton.addEventListener("click", () => {
    setCheckedStateByRole(presetArchiveList, "archive-preset-checkbox", true);
  });

  presetClearArchiveButton.addEventListener("click", () => {
    setCheckedStateByRole(presetArchiveList, "archive-preset-checkbox", false);
  });

  async function runPresetImport(
    archivePath: string,
    selections: PresetImportSelectionInput[],
  ): Promise<void> {
    if (!PRESETS_ENABLED) {
      return;
    }
    closePresetResultOverlay(true);
    presetImporting = true;
    updateButtons();

    try {
      const result = await presetsImportArchive({
        archivePath,
        selections,
      });

      await refreshLocalPresets(true);

      const importedItems = result.imported.map(
        (item) => `[${item.targetId}] ${(item.name ?? "").trim() || t("preset.emptyName")}`,
      );
      showPresetResultOverlay(
        t("preset.statusImportDone", { count: result.importedPresets, names: "" }),
        t("preset.feedback.confirmImportTitle"),
        importedItems,
      );
    } catch (error) {
      showPresetResultOverlay(
        t("preset.statusImportFailed", { error: String(error) }),
        t("preset.feedback.confirmImportTitle"),
      );
    } finally {
      presetImporting = false;
      updateButtons();
    }
  }

  presetImportButton.addEventListener("click", async () => {
    const archivePath = presetImportArchivePath.trim();
    if (!archivePath) {
      showPresetResultOverlay(
        t("preset.importPathRequired"),
        t("preset.feedback.confirmImportTitle"),
      );
      return;
    }

    const selections = getSelectedArchivePresetInputs();
    if (selections.length === 0) {
      showPresetResultOverlay(
        t("preset.importSelectRequired"),
        t("preset.feedback.confirmImportTitle"),
        [],
        false,
      );
      return;
    }

    const previewItems = selections.map(
      (selection) =>
        `[${selection.sourceId}] ${(selection.name ?? "").trim() || t("preset.emptyName")}`,
    );
    openPresetFeedbackOverlay(
      "confirmImport",
      t("preset.feedback.confirmImportTitle"),
      t("preset.feedback.confirmImportMessage"),
      previewItems,
      t("preset.feedback.import"),
      t("preset.feedback.cancel"),
      async () => {
        await runPresetImport(archivePath, selections);
      },
      () => {
        closePresetResultOverlay();
      },
    );
  });

  launchModdedButton.addEventListener("click", async () => {
    if (!settings) {
      return;
    }
    if (hasBlockedEpicPlatform(settings)) {
      setLaunchStatusWithLock(t("launch.errorEpicFeatureDisabled"), LAUNCH_ERROR_DISPLAY_MS);
      return;
    }
    launchInProgress = true;
    setLaunchStatus(t("launch.moddedStarting"));
    updateButtons();

    let gameExe = "";
    let firstSetupPending = false;
    try {
      gameExe = await gameExePathFromSettings();
      try {
        firstSetupPending = await launchModdedFirstSetupPending(gameExe);
      } catch {
        // 判定失敗時は通常の起動文言を維持する。
      }
      queueLauncherAutoMinimize(firstSetupPending ? null : LAUNCHER_AUTO_MINIMIZE_WINDOW_MS);
      if (firstSetupPending) {
        setLaunchStatus(t("launch.moddedFirstSetupStarting"));
        startFirstSetupCompletionPolling(gameExe);
      }
      await launchModded({
        gameExe,
        profilePath: settings.profilePath,
        platform: settings.gamePlatform,
      });
      if (!firstSetupPending) {
        setLaunchStatus(t("launch.moddedSent"));
      }
    } catch (error) {
      const retried = await retryLaunchWithElevationIfNeeded(error, {
        kind: "modded",
        gameExe,
        profilePath: settings.profilePath,
        platform: settings.gamePlatform,
        firstSetupPending,
      });
      if (!retried) {
        clearLauncherAutoMinimizePending();
        setLaunchStatusWithLock(
          t("launch.moddedFailed", { error: localizeLaunchError(error) }),
          LAUNCH_ERROR_DISPLAY_MS,
        );
      }
    } finally {
      launchInProgress = false;
      updateButtons();
    }
  });

  launchVanillaButton.addEventListener("click", async () => {
    if (!settings) {
      return;
    }
    if (hasBlockedEpicPlatform(settings)) {
      setLaunchStatusWithLock(t("launch.errorEpicFeatureDisabled"), LAUNCH_ERROR_DISPLAY_MS);
      return;
    }
    launchInProgress = true;
    queueLauncherAutoMinimize();
    setLaunchStatus(t("launch.vanillaStarting"));
    updateButtons();

    let gameExe = "";
    try {
      gameExe = await gameExePathFromSettings();
      await launchVanilla({
        gameExe,
        platform: settings.gamePlatform,
      });
      setLaunchStatus(t("launch.vanillaSent"));
    } catch (error) {
      const retried = await retryLaunchWithElevationIfNeeded(error, {
        kind: "vanilla",
        gameExe,
        platform: settings.gamePlatform,
      });
      if (!retried) {
        clearLauncherAutoMinimizePending();
        setLaunchStatusWithLock(
          t("launch.vanillaFailed", { error: localizeLaunchError(error) }),
          LAUNCH_ERROR_DISPLAY_MS,
        );
      }
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
    if (!EPIC_LOGIN_ENABLED) {
      return;
    }
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
    if (!EPIC_LOGIN_ENABLED) {
      return;
    }
    try {
      await epicLogout();
      epicAuthStatus.textContent = t("epic.logoutDone");
      await refreshEpicLoginState();
    } catch (error) {
      epicAuthStatus.textContent = t("epic.logoutFailed", { error: String(error) });
      setEpicAuthVisualState("error");
    }
  });

  void settingsUpdate({
    uiLocale: currentLocale,
  }).catch(() => undefined);

  replayOnboardingButton.addEventListener("click", () => {
    mountOnboarding();
  });

  settingsSupportDiscordLinkButton.addEventListener("click", async () => {
    if (!CONNECT_LINKS_ENABLED) {
      return;
    }
    try {
      await openUrl(discordLink);
    } catch {
      window.open(discordLink, "_blank", "noopener,noreferrer");
    }
  });

  languageSelect.addEventListener("change", async () => {
    if (localeSwitchInProgress) {
      return;
    }

    const nextLocale = normalizeLocale(languageSelect.value) ?? currentLocale;
    if (nextLocale === currentLocale) {
      return;
    }

    localeSwitchInProgress = true;
    languageSelect.disabled = true;
    let didRequestReload = false;

    try {
      saveLocale(nextLocale);

      await settingsUpdate({
        uiLocale: nextLocale,
        selectedGameServerId: resolveLocalePreferredGameServerId(nextLocale),
      });
    } catch {
      // ignore backend locale sync failures
    }

    try {
      if (mainLayout) {
        setLocaleSwitchAnimationScrollLock(true);
        await restartLayoutAnimation(mainLayout, "main-layout-minimize-out");
      }

      markLocaleSwitchReloadAnimation();

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, LAUNCHER_MINIMIZE_EFFECT_DURATION_MS);
      });

      try {
        window.location.reload();
        didRequestReload = true;
      } catch {
        // fall through to finally cleanup when reload fails unexpectedly.
      }
    } finally {
      if (!didRequestReload) {
        clearLocaleSwitchReloadAnimation();
        if (mainLayout) {
          mainLayout.classList.remove("main-layout-minimize-out");
        }
        setLocaleSwitchAnimationScrollLock(false);
        languageSelect.disabled = false;
        localeSwitchInProgress = false;
      }
    }
  });

  renderOfficialLinks();
  renderLocalPresetList();
  renderArchivePresetList();
  renderPresetOverlayContent();
  if (activeTab !== "home") {
    switchTab(activeTab);
  }

  type VersionDisplayState = "loading" | "ready" | "error";
  type UpdateStatusState =
    | "idle"
    | "checking"
    | "latest"
    | "skipped"
    | "downloading"
    | "applying"
    | "success"
    | "error";

  function setVersionDisplay(text: string, state: VersionDisplayState): void {
    appVersion.textContent = text;
    appVersion.dataset.state = state;
    settingsAppVersion.textContent = text;
    settingsAppVersion.dataset.state = state;
  }

  function setUpdateStatus(text: string, state: UpdateStatusState): void {
    updateStatus.textContent = text;
    updateStatus.dataset.state = state;
  }

  function canPromptUpdateNow(): boolean {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  async function applyAvailableUpdate(update: AvailableUpdate): Promise<void> {
    const shouldInstall = await openUpdateConfirmOverlay(update.version);
    if (!shouldInstall) {
      setUpdateStatus(t("update.skipped", { version: update.version }), "skipped");
      return;
    }

    let downloadedBytes = 0;
    let totalBytes = 0;

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength ?? 0;
        setUpdateStatus(t("update.downloading"), "downloading");
        return;
      }
      if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0) {
          const percent = Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100));
          setUpdateStatus(t("update.downloadingPercent", { percent }), "downloading");
        } else {
          setUpdateStatus(t("update.downloading"), "downloading");
        }
        return;
      }
      setUpdateStatus(t("update.applying"), "applying");
    });

    setUpdateStatus(t("update.appliedRestart"), "success");
  }

  async function runPendingStartupUpdateIfPossible(): Promise<void> {
    if (!pendingStartupUpdate || checkingUpdate || !canPromptUpdateNow()) {
      return;
    }

    const update = pendingStartupUpdate;
    pendingStartupUpdate = null;
    checkingUpdate = true;
    checkUpdateButton.disabled = true;
    setUpdateStatus(t("update.checking"), "checking");

    try {
      await applyAvailableUpdate(update);
    } catch (error) {
      console.warn("Deferred auto update prompt failed:", error);
      setUpdateStatus("", "idle");
    } finally {
      checkingUpdate = false;
      checkUpdateButton.disabled = false;
    }
  }

  async function runUpdateCheck(source: "manual" | "startup"): Promise<void> {
    if (checkingUpdate) {
      return;
    }

    if (source === "manual") {
      pendingStartupUpdate = null;
    }

    checkingUpdate = true;
    checkUpdateButton.disabled = true;
    setUpdateStatus(t("update.checking"), "checking");

    try {
      const update = await check();
      if (!update) {
        pendingStartupUpdate = null;
        setUpdateStatus(t("update.latest"), "latest");
        return;
      }

      // 起動直後の背景状態では自動適用せず、可視・フォーカス時だけ確認を出す。
      if (source === "startup" && !canPromptUpdateNow()) {
        pendingStartupUpdate = update;
        setUpdateStatus(t("update.skipped", { version: update.version }), "skipped");
        return;
      }

      pendingStartupUpdate = null;
      await applyAvailableUpdate(update);
    } catch (error) {
      if (source === "manual") {
        setUpdateStatus(
          t("update.failed", {
            error: String(error),
          }),
          "error",
        );
      } else {
        console.warn("Auto update check failed:", error);
        setUpdateStatus("", "idle");
      }
    } finally {
      checkingUpdate = false;
      checkUpdateButton.disabled = false;
    }
  }

  checkUpdateButton.addEventListener("click", async () => {
    await runUpdateCheck("manual");
  });
  window.addEventListener("focus", () => {
    void runPendingStartupUpdateIfPossible();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    void runPendingStartupUpdateIfPossible();
  });

  setVersionDisplay(t("launcher.currentVersionLoading"), "loading");
  setUpdateStatus("", "idle");

  void (async () => {
    try {
      const version = `v${await getVersion()}`;
      setVersionDisplay(version, "ready");
    } catch (error) {
      const errorMessage = t("app.versionFetchFailed", { error: String(error) });
      setVersionDisplay(errorMessage, "error");
    }
  })();

  void listen<NotificationOpenTarget>(BACKGROUND_NOTIFICATION_OPEN_EVENT, (event) => {
    applyBackgroundNotificationOpenTarget(event.payload);
    void notificationsTakeOpenTarget().catch(() => undefined);
  });

  void listen<InstallProgressPayload>(installProgressEventName, (event) => {
    const payload = event.payload;

    if (
      (payload.stage === "downloading" || payload.stage === "patchers") &&
      typeof payload.downloaded === "number"
    ) {
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
    if (!EPIC_LOGIN_ENABLED) {
      return;
    }
    epicAuthStatus.textContent = t("epic.loginSuccess");
    await refreshEpicLoginState();
  });

  void listen<string>("epic-login-error", async (event) => {
    if (!EPIC_LOGIN_ENABLED) {
      return;
    }
    epicAuthStatus.textContent = t("epic.loginFailed", { error: event.payload });
    await refreshEpicLoginState();
  });

  void listen("epic-login-cancelled", () => {
    if (!EPIC_LOGIN_ENABLED) {
      return;
    }
    epicAuthStatus.textContent = t("epic.loginCancelled");
  });

  void (async () => {
    const loadedSettings = await reloadSettings();
    try {
      const pendingOpenTarget = await notificationsTakeOpenTarget();
      if (pendingOpenTarget) {
        applyBackgroundNotificationOpenTarget(pendingOpenTarget);
      }
    } catch {
      // ignore pending open target retrieval errors
    }

    if (hasBlockedEpicPlatform(loadedSettings)) {
      setLaunchStatusWithLock(t("launch.errorEpicFeatureDisabled"), LAUNCH_ERROR_DISPLAY_MS);
    }
    if (!loadedSettings.onboardingCompleted) {
      mountOnboarding();
    }
    await refreshProfileReady();

    await refreshLocalPresets(true);
    await refreshPreservedSaveDataStatus();
    await refreshGameRunningState();
    startGameRunningPolling();

    if (EPIC_LOGIN_ENABLED) {
      try {
        await epicSessionRestore();
      } catch {
        // ignore restore errors; status is refreshed next.
      }
    }
    await refreshEpicLoginState();

    try {
      const autoLaunchError = await launchAutolaunchErrorTake();
      if (autoLaunchError) {
        setLaunchStatusWithLock(
          t("launch.autoModLaunchFailed", {
            error: localizeLaunchError(autoLaunchError),
          }),
          LAUNCH_ERROR_DISPLAY_MS,
        );
      }
    } catch {
      // ignore auto launch error retrieval errors
    }

    updateButtons();
    startHomeNotificationPolling();
    startAnnounceNotificationPolling();
    void runUpdateCheck("startup");
  })();
}
