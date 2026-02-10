import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
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
import {
  OFFICIAL_LINKS,
  REPORTING_NOTIFICATION_STORAGE_KEY,
  UPDATER_TOKEN_STORAGE_KEY,
} from "./constants";
import { collectAppDom } from "./dom";
import {
  epicLoginCode,
  epicLoginWebview,
  epicLogout,
  epicSessionRestore,
  epicStatusGet,
  finderDetectAmongUs,
  finderDetectPlatform,
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
  snrInstall,
  snrPreservedSaveDataStatus,
  snrReleasesList,
  snrUninstall,
} from "./services/tauriClient";
import { computeControlState } from "./state/selectors";
import { createAppStore } from "./state/store";
import { renderAppTemplate } from "./template";
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
export async function runLauncher(container?: HTMLElement | null): Promise<void> {
  const app = container ?? document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("#app not found");
  }

  const currentLocale = resolveInitialLocale();
  const t = createTranslator(currentLocale);
  document.documentElement.lang = currentLocale;

  app.innerHTML = renderAppTemplate(currentLocale, t);

  const {
    appVersion,
    replayOnboardingButton,
    languageSelect,

    amongUsPathInput,
    saveAmongUsPathButton,
    detectAmongUsPathButton,
    platformSelect,
    releaseSelect,
    refreshReleasesButton,
    profilePath,
    openAmongUsFolderButton,
    openProfileFolderButton,
    closeToTrayOnCloseInput,
    installButton,
    installRestoreSaveDataCheckbox,
    uninstallButton,
    uninstallPreserveSaveDataCheckbox,
    installProgress,
    installStatus,
    preservedSaveDataStatus,
    launchModdedButton,
    launchVanillaButton,
    createModdedShortcutButton,
    launchStatus,
    profileReadyStatus,
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
    reportAccountState,
    reportRemoteFlag,
    reportRefreshButton,
    reportNotificationToggle,
    reportNotificationState,
    reportTypeSelect,
    reportTitleInput,
    reportDescriptionInput,
    reportMapInput,
    reportRoleInput,
    reportTimingInput,
    reportBugFields,
    reportLogSource,
    reportSendButton,
    reportStatus,
    reportThreadList,
    reportThreadStatus,
    reportSelectedThread,
    reportMessageList,
    reportReplyInput,
    reportSendMessageButton,
    epicLoginWebviewButton,
    epicLogoutButton,
    epicAuthStatus,
    epicAuthCodeInput,
    epicLoginCodeButton,
    checkUpdateButton,
    updateStatus,
    githubTokenInput,
    saveTokenButton,
    clearTokenButton,
    officialLinkButtons,
  } = collectAppDom();

  // 通知設定は永続値を先に確定し、store初期値とローカル変数を揃える。
  const initialReportingNotificationEnabled =
    localStorage.getItem(REPORTING_NOTIFICATION_STORAGE_KEY) === "1";
  // signalsストアは段階移行用に導入し、ボタン活性判定の入力を一元化する。
  const appStore = createAppStore(initialReportingNotificationEnabled);

  let settings: LauncherSettings | null = null;
  let releases: SnrReleaseSummary[] = [];
  let profileIsReady = false;
  let gameRunning = false;
  let installInProgress = false;
  let uninstallInProgress = false;
  let launchInProgress = false;
  let creatingShortcut = false;
  let releasesLoading = false;
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
  let reportingReady = false;
  let reportPreparing = false;
  let reportingLoading = false;
  let reportMessagesLoading = false;
  let reportSending = false;
  let reportMessageSending = false;
  let reportThreads: ReportThread[] = [];
  let reportMessages: ReportMessage[] = [];
  let selectedReportThreadId: string | null = null;
  let reportMessageLoadTicket = 0;
  let reportingPollTimer: number | null = null;
  let reportingUnreadBaselineCaptured = false;
  let knownUnreadThreadIds = new Set<string>();
  let preservedSaveDataAvailable = false;
  let preservedSaveDataFiles = 0;
  let gameStatePollTimer: number | null = null;
  let gameStatePolling = false;
  let reportingNotificationEnabled = initialReportingNotificationEnabled;
  let onboardingRoot: Root | null = null;

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
      await settingsUpdate({ onboardingCompleted: true });
      if (settings) {
        settings = { ...settings, onboardingCompleted: true };
      }

      if (onboardingRoot) {
        onboardingRoot.unmount();
        onboardingRoot = null;
      }
      container?.remove();
    };

    onboardingRoot.render(<OnboardingWizard onComplete={handleComplete} />);
  }

  function normalizeGithubToken(value: string): string {
    return value.trim();
  }

  function createUpdaterHeaders(token: string): HeadersInit | undefined {
    const normalizedToken = normalizeGithubToken(token);
    if (!normalizedToken) {
      return undefined;
    }

    const authorization = /^(bearer|token)\s+/i.test(normalizedToken)
      ? normalizedToken
      : `Bearer ${normalizedToken}`;

    return {
      Authorization: authorization,
      Accept: "application/octet-stream",
    };
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

  function renderReportBugFields(): void {
    reportBugFields.style.display = reportTypeSelect.value === "Bug" ? "grid" : "none";
  }

  function updateReportingNotificationLabel(): void {
    if (reportingNotificationEnabled) {
      setStatusLine(reportNotificationState, t("report.notificationOn"), "success");
    } else {
      setStatusLine(reportNotificationState, t("report.notificationOff"), "warn");
    }
  }

  function persistReportingNotificationEnabled(): void {
    localStorage.setItem(
      REPORTING_NOTIFICATION_STORAGE_KEY,
      reportingNotificationEnabled ? "1" : "0",
    );
    reportNotificationToggle.checked = reportingNotificationEnabled;
    updateReportingNotificationLabel();
  }

  async function ensureNotificationPermission(): Promise<boolean> {
    try {
      if (await isPermissionGranted()) {
        return true;
      }
      const permission = await requestPermission();
      return permission === "granted";
    } catch {
      return false;
    }
  }

  async function sendUnreadWindowsNotification(newUnreadThreads: ReportThread[]): Promise<void> {
    if (!reportingNotificationEnabled || newUnreadThreads.length === 0) {
      return;
    }

    const granted = await ensureNotificationPermission();
    if (!granted) {
      reportingNotificationEnabled = false;
      persistReportingNotificationEnabled();
      setStatusLine(reportNotificationState, t("report.notificationDisabledNoPermission"), "warn");
      return;
    }

    const title =
      newUnreadThreads.length === 1
        ? t("report.newUnreadSingle", {
            title: newUnreadThreads[0].title || t("report.untitled"),
          })
        : t("report.newUnreadMulti", { count: newUnreadThreads.length });
    const sample = newUnreadThreads
      .slice(0, 2)
      .map((thread) => thread.title || t("report.noTitle"))
      .join(" / ");

    try {
      await sendNotification({ title, body: sample || t("report.notificationFallbackBody") });
    } catch {
      // ignore notification errors
    }
  }

  function extractUnreadIds(threads: ReportThread[]): Set<string> {
    return new Set(threads.filter((thread) => thread.unread).map((thread) => thread.threadId));
  }

  async function updateUnreadDiff(threads: ReportThread[], allowNotify: boolean): Promise<void> {
    const currentUnread = extractUnreadIds(threads);
    if (!reportingUnreadBaselineCaptured) {
      knownUnreadThreadIds = currentUnread;
      reportingUnreadBaselineCaptured = true;
      return;
    }

    const newUnreadIds = [...currentUnread].filter((id) => !knownUnreadThreadIds.has(id));
    if (allowNotify && newUnreadIds.length > 0) {
      await sendUnreadWindowsNotification(
        threads.filter((thread) => newUnreadIds.includes(thread.threadId)),
      );
    }

    knownUnreadThreadIds = currentUnread;
  }

  function stopReportingPolling(): void {
    if (reportingPollTimer !== null) {
      window.clearInterval(reportingPollTimer);
      reportingPollTimer = null;
    }
  }

  function startReportingPolling(): void {
    stopReportingPolling();
    reportingPollTimer = window.setInterval(() => {
      if (!reportingReady || reportPreparing || reportingLoading) {
        return;
      }
      void refreshReportingCenter(false, true);
    }, 60_000);
  }

  function renderOfficialLinks(): void {
    officialLinkButtons.replaceChildren();

    for (const link of OFFICIAL_LINKS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pill-link";
      button.style.background = link.backgroundColor;
      button.setAttribute("aria-label", t("official.openInBrowserAria", { label: link.label }));
      button.innerHTML = `${link.iconSvg}<span>${link.label}</span>`;

      button.addEventListener("click", async () => {
        try {
          await openUrl(link.url);
        } catch {
          window.open(link.url, "_blank", "noopener,noreferrer");
        }
      });

      officialLinkButtons.append(button);
    }
  }

  async function openFolder(pathValue: string | null | undefined, label: string): Promise<void> {
    const target = pathValue?.trim() ?? "";
    if (!target) {
      installStatus.textContent = t("openFolder.notSet", { label });
      return;
    }

    try {
      await openPath(target);
      installStatus.textContent = t("openFolder.opened", { label });
    } catch (error) {
      installStatus.textContent = t("openFolder.failed", {
        label,
        error: String(error),
      });
    }
  }

  function renderPreservedSaveDataStatus(): void {
    if (preservedSaveDataAvailable && preservedSaveDataFiles > 0) {
      preservedSaveDataStatus.textContent = t("launcher.preservedSaveDataAvailable", {
        count: preservedSaveDataFiles,
      });
      return;
    }

    installRestoreSaveDataCheckbox.checked = false;
    preservedSaveDataStatus.textContent = t("launcher.preservedSaveDataNone");
  }

  async function refreshPreservedSaveDataStatus(): Promise<void> {
    try {
      const status = await snrPreservedSaveDataStatus();
      preservedSaveDataAvailable = status.available;
      preservedSaveDataFiles = status.files;
      renderPreservedSaveDataStatus();
    } catch (error) {
      preservedSaveDataAvailable = false;
      preservedSaveDataFiles = 0;
      installRestoreSaveDataCheckbox.checked = false;
      preservedSaveDataStatus.textContent = t("launcher.preservedSaveDataStatusFailed", {
        error: String(error),
      });
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
    appStore.reportingReady.value = reportingReady;
    appStore.reportPreparing.value = reportPreparing;
    appStore.reportingLoading.value = reportingLoading;
    appStore.reportMessagesLoading.value = reportMessagesLoading;
    appStore.reportSending.value = reportSending;
    appStore.reportMessageSending.value = reportMessageSending;
    appStore.reportThreads.value = reportThreads;
    appStore.reportMessages.value = reportMessages;
    appStore.selectedReportThreadId.value = selectedReportThreadId;
    appStore.reportMessageLoadTicket.value = reportMessageLoadTicket;
    appStore.reportingPollTimer.value = reportingPollTimer;
    appStore.reportingUnreadBaselineCaptured.value = reportingUnreadBaselineCaptured;
    appStore.knownUnreadThreadIds.value = new Set(knownUnreadThreadIds);
    appStore.preservedSaveDataAvailable.value = preservedSaveDataAvailable;
    appStore.preservedSaveDataFiles.value = preservedSaveDataFiles;
    appStore.reportingNotificationEnabled.value = reportingNotificationEnabled;
  }

  function updateButtons(): void {
    // ボタン活性条件は純関数に委譲し、DOM更新だけをここで行う。
    syncStoreSnapshot();
    const control = computeControlState(appStore.snapshot());

    installButton.disabled = control.installButtonDisabled;
    installRestoreSaveDataCheckbox.disabled = control.installRestoreSaveDataCheckboxDisabled;
    uninstallButton.disabled = control.uninstallButtonDisabled;
    uninstallPreserveSaveDataCheckbox.disabled = control.uninstallPreserveSaveDataCheckboxDisabled;
    launchModdedButton.disabled = control.launchModdedButtonDisabled;
    launchVanillaButton.disabled = control.launchVanillaButtonDisabled;
    createModdedShortcutButton.disabled = control.createModdedShortcutButtonDisabled;
    epicLoginWebviewButton.disabled = control.epicLoginWebviewButtonDisabled;
    epicLoginCodeButton.disabled = control.epicLoginCodeButtonDisabled;
    epicLogoutButton.disabled = control.epicLogoutButtonDisabled;
    detectAmongUsPathButton.disabled = control.detectAmongUsPathButtonDisabled;
    saveAmongUsPathButton.disabled = control.saveAmongUsPathButtonDisabled;
    refreshReleasesButton.disabled = control.refreshReleasesButtonDisabled;
    releaseSelect.disabled = control.releaseSelectDisabled;
    platformSelect.disabled = control.platformSelectDisabled;
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
    reportRefreshButton.disabled = control.reportRefreshButtonDisabled;
    reportNotificationToggle.disabled = control.reportNotificationToggleDisabled;
    reportTypeSelect.disabled = control.reportTypeSelectDisabled;
    reportTitleInput.disabled = control.reportTitleInputDisabled;
    reportDescriptionInput.disabled = control.reportDescriptionInputDisabled;
    reportMapInput.disabled = control.reportMapInputDisabled;
    reportRoleInput.disabled = control.reportRoleInputDisabled;
    reportTimingInput.disabled = control.reportTimingInputDisabled;
    reportSendButton.disabled = control.reportSendButtonDisabled;
    reportReplyInput.disabled = control.reportReplyInputDisabled;
    reportSendMessageButton.disabled = control.reportSendMessageButtonDisabled;
  }

  function applyGameRunningState(running: boolean): void {
    gameRunning = running;
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
    amongUsPathInput.value = settings.amongUsPath;
    platformSelect.value = settings.gamePlatform;
    profilePath.textContent = settings.profilePath || t("common.unset");
    closeToTrayOnCloseInput.checked = settings.closeToTrayOnClose;
  }

  function renderReleaseOptions(): void {
    const currentSettings = settings;
    releaseSelect.innerHTML = "";
    for (const release of releases) {
      const option = document.createElement("option");
      option.value = release.tag;
      option.textContent = t("releases.optionText", {
        tag: release.tag,
        name: release.name || t("releases.noTitle"),
        date: formatDate(release.publishedAt),
      });
      releaseSelect.append(option);
    }

    if (!currentSettings) {
      return;
    }

    if (
      currentSettings.selectedReleaseTag &&
      releases.some((release) => release.tag === currentSettings.selectedReleaseTag)
    ) {
      releaseSelect.value = currentSettings.selectedReleaseTag;
    } else if (releases.length > 0) {
      releaseSelect.value = releases[0].tag;
    }
  }

  function renderReportThreads(): void {
    reportThreadList.replaceChildren();

    if (reportThreads.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.style.padding = "8px";
      empty.textContent = t("report.threadsEmpty");
      reportThreadList.append(empty);
      reportSelectedThread.textContent = t("report.selectedNone");
      return;
    }

    for (const thread of reportThreads) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        selectedReportThreadId === thread.threadId
          ? "report-thread-item active"
          : "report-thread-item";
      button.textContent = t("report.threadItem", {
        mark: thread.currentStatus.mark || "●",
        title: thread.title || t("report.noTitle"),
        unread: thread.unread ? t("report.unreadSuffix") : "",
      });

      button.addEventListener("click", async () => {
        selectedReportThreadId = thread.threadId;
        renderReportThreads();
        await loadReportMessages(thread.threadId, true);
        updateButtons();
      });

      reportThreadList.append(button);
    }

    const selected = reportThreads.find((thread) => thread.threadId === selectedReportThreadId);
    reportSelectedThread.textContent = selected
      ? t("report.selected", { thread: selected.title || selected.threadId })
      : t("report.selectedNone");
  }

  function createMessageElement(message: ReportMessage): HTMLDivElement {
    const wrapper = document.createElement("div");
    const isStatus = message.messageType === "status";
    wrapper.className = isStatus ? "report-message status" : "report-message";

    const head = document.createElement("div");
    head.className = "report-message-head";

    const author = document.createElement("span");
    const date = document.createElement("span");

    if (isStatus) {
      author.textContent = t("report.statusUpdate", { mark: message.mark?.trim() || "●" });
      if (message.color) {
        author.style.color = message.color;
      }
    } else {
      author.textContent = (message.sender || "unknown").replace("github:", "");
    }

    date.textContent = formatDate(message.createdAt);
    head.append(author, date);

    const body = document.createElement("div");
    body.className = "report-message-body";
    body.textContent = message.content || "";

    wrapper.append(head, body);
    return wrapper;
  }

  function renderReportMessages(): void {
    reportMessageList.replaceChildren();

    if (reportMessages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = t("report.messagesEmpty");
      reportMessageList.append(empty);
      return;
    }

    for (const message of reportMessages) {
      reportMessageList.append(createMessageElement(message));
    }

    reportMessageList.scrollTop = reportMessageList.scrollHeight;
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
    profileReadyStatus.textContent = profileIsReady ? t("profile.ready") : t("profile.notReady");
  }

  async function refreshReleases(): Promise<void> {
    releasesLoading = true;
    updateButtons();
    installStatus.textContent = t("releases.loading");

    try {
      releases = await snrReleasesList();
      renderReleaseOptions();

      if (settings && releaseSelect.value && settings.selectedReleaseTag !== releaseSelect.value) {
        settings = await settingsUpdate({ selectedReleaseTag: releaseSelect.value });
        renderSettings();
      }

      installStatus.textContent = releases.length > 0 ? t("releases.done") : t("releases.none");
    } catch (error) {
      installStatus.textContent = t("releases.failed", { error: String(error) });
    } finally {
      releasesLoading = false;
      updateButtons();
    }
  }

  async function refreshEpicLoginState(): Promise<void> {
    try {
      const status = await epicStatusGet();
      epicLoggedIn = status.loggedIn;

      if (!status.loggedIn) {
        epicAuthStatus.textContent = t("epic.notLoggedIn");
        return;
      }

      const userLabel = status.displayName?.trim()
        ? status.displayName.trim()
        : status.accountId?.trim()
          ? status.accountId.trim()
          : t("epic.unknownUser");

      if (status.profileError) {
        epicAuthStatus.textContent = t("epic.loggedInProfileError", { user: userLabel });
      } else {
        epicAuthStatus.textContent = t("epic.loggedIn", { user: userLabel });
      }
    } catch (error) {
      epicLoggedIn = false;
      epicAuthStatus.textContent = t("epic.statusCheckFailed", { error: String(error) });
    } finally {
      updateButtons();
    }
  }

  async function refreshReportingLogSource(): Promise<void> {
    try {
      const info = await reportingLogSourceGet();
      if (info.exists && info.selectedPath) {
        reportLogSource.textContent = t("report.logDetected", { path: info.selectedPath });
      } else {
        reportLogSource.textContent = t("report.logNotDetected", {
          profile: info.profileCandidate,
          game: info.gameCandidate,
        });
      }
    } catch (error) {
      reportLogSource.textContent = t("report.logSourceFailed", { error: String(error) });
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

  async function loadReportMessages(threadId: string, withStatus: boolean): Promise<void> {
    const normalized = threadId.trim();
    if (!normalized || !reportingReady) {
      return;
    }

    const ticket = ++reportMessageLoadTicket;
    reportMessagesLoading = true;
    if (withStatus) {
      setStatusLine(reportThreadStatus, t("report.messagesLoading"));
    }
    updateButtons();

    try {
      const messages = await reportingMessagesList(normalized);

      if (ticket !== reportMessageLoadTicket) {
        return;
      }

      reportMessages = messages;
      renderReportMessages();

      if (withStatus) {
        setStatusLine(
          reportThreadStatus,
          t("report.messagesLoaded", { count: messages.length }),
          "success",
        );
      }
    } catch (error) {
      if (ticket !== reportMessageLoadTicket) {
        return;
      }
      setStatusLine(
        reportThreadStatus,
        t("report.messagesLoadFailed", { error: String(error) }),
        "error",
      );
    } finally {
      if (ticket === reportMessageLoadTicket) {
        reportMessagesLoading = false;
        updateButtons();
      }
    }
  }

  async function refreshReportingCenter(manual: boolean, allowNotify: boolean): Promise<void> {
    if (!reportingReady || reportingLoading) {
      return;
    }

    reportingLoading = true;
    if (manual) {
      setStatusLine(reportStatus, t("report.threadsRefreshing"));
    }
    updateButtons();

    try {
      // スレッド一覧と通知フラグは独立取得できるため並列で待つ。
      const [threads, hasNotification] = await Promise.all([
        reportingThreadsList(),
        reportingNotificationFlagGet().catch(() => false),
      ]);

      reportThreads = threads;
      reportRemoteFlag.textContent = hasNotification
        ? t("report.remoteFlagUnread")
        : t("report.remoteFlagNone");

      if (
        selectedReportThreadId &&
        !reportThreads.some((thread) => thread.threadId === selectedReportThreadId)
      ) {
        selectedReportThreadId = null;
        reportMessages = [];
      }

      if (!selectedReportThreadId && reportThreads.length > 0) {
        selectedReportThreadId = reportThreads[0].threadId;
      }

      renderReportThreads();
      await updateUnreadDiff(reportThreads, allowNotify);

      if (selectedReportThreadId) {
        await loadReportMessages(selectedReportThreadId, false);
      } else {
        renderReportMessages();
      }

      if (manual) {
        setStatusLine(
          reportStatus,
          t("report.threadsRefreshDone", { count: reportThreads.length }),
          "success",
        );
      }
    } catch (error) {
      setStatusLine(
        reportStatus,
        t("report.threadsRefreshFailed", { error: String(error) }),
        "error",
      );
    } finally {
      reportingLoading = false;
      updateButtons();
    }
  }

  async function initializeReporting(): Promise<void> {
    reportPreparing = true;
    reportingReady = false;
    updateButtons();
    setStatusLine(reportStatus, t("report.preparingAccount"));

    try {
      const result = await reportingPrepare();
      reportingReady = result.ready;
      if (result.createdAccount) {
        reportAccountState.textContent = t("report.accountReadyCreated");
      } else {
        reportAccountState.textContent = t("report.accountReady", { source: result.tokenSource });
      }
      reportAccountState.className = "badge success";

      await refreshReportingLogSource();
      await refreshReportingCenter(true, false);
      startReportingPolling();
      setStatusLine(reportStatus, t("report.ready"), "success");
    } catch (error) {
      reportingReady = false;
      stopReportingPolling();
      reportAccountState.textContent = t("report.accountPrepareFailed");
      reportAccountState.className = "badge warn";
      setStatusLine(reportStatus, t("report.prepareFailed", { error: String(error) }), "error");
    } finally {
      reportPreparing = false;
      updateButtons();
    }
  }

  async function gameExePathFromSettings(): Promise<string> {
    if (!settings || !settings.amongUsPath.trim()) {
      throw new Error("Among Us path is not configured");
    }
    return join(settings.amongUsPath, "Among Us.exe");
  }

  saveAmongUsPathButton.addEventListener("click", async () => {
    const value = amongUsPathInput.value.trim();
    await saveSettings({ amongUsPath: value });
    await refreshProfileReady();
    await refreshReportingLogSource();
    installStatus.textContent = t("settings.amongUsPathSaved");
    updateButtons();
  });

  detectAmongUsPathButton.addEventListener("click", async () => {
    detectAmongUsPathButton.disabled = true;
    installStatus.textContent = t("detect.loading");
    try {
      const detected = await finderDetectAmongUs();
      const platform = await finderDetectPlatform(detected);
      await saveSettings({ amongUsPath: detected, gamePlatform: platform });
      await refreshProfileReady();
      await refreshReportingLogSource();
      installStatus.textContent = t("detect.success", {
        path: detected,
        platform,
      });
    } catch (error) {
      installStatus.textContent = t("detect.failed", { error: String(error) });
    } finally {
      detectAmongUsPathButton.disabled = false;
      updateButtons();
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
    installStatus.textContent = t("settings.closeToTrayOnCloseSaved", {
      state: enabled ? t("common.on") : t("common.off"),
    });
    updateButtons();
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
      await refreshReportingLogSource();
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

  platformSelect.addEventListener("change", async () => {
    const platform = platformSelect.value as GamePlatform;
    await saveSettings({ gamePlatform: platform });
    installStatus.textContent = t("settings.platformChanged", { platform });
    updateButtons();
  });

  releaseSelect.addEventListener("change", async () => {
    const tag = releaseSelect.value;
    await saveSettings({ selectedReleaseTag: tag });
    installStatus.textContent = t("settings.tagSelected", { tag });
    updateButtons();
  });

  refreshReleasesButton.addEventListener("click", async () => {
    await refreshReleases();
  });

  installButton.addEventListener("click", async () => {
    if (!settings) {
      return;
    }
    const tag = settings.selectedReleaseTag.trim();
    if (!tag) {
      installStatus.textContent = t("install.tagRequired");
      return;
    }

    const restorePreservedSaveData = installRestoreSaveDataCheckbox.checked;

    installInProgress = true;
    installProgress.value = 0;
    updateButtons();
    installStatus.textContent = t("install.starting");

    try {
      const result = await snrInstall({
        tag,
        platform: settings.gamePlatform,
        restorePreservedSaveData,
      });
      installStatus.textContent = restorePreservedSaveData
        ? t("install.doneWithRestored", {
            asset: result.assetName,
            count: result.restoredSaveFiles,
          })
        : t("install.done", { asset: result.assetName });
      await reloadSettings();
      await refreshProfileReady();
      await refreshPreservedSaveDataStatus();
      await refreshLocalPresets(true);
      await refreshReportingLogSource();
    } catch (error) {
      installStatus.textContent = t("install.failed", { error: String(error) });
    } finally {
      installInProgress = false;
      updateButtons();
    }
  });

  uninstallButton.addEventListener("click", async () => {
    if (!settings) {
      return;
    }

    const preserveSaveData = uninstallPreserveSaveDataCheckbox.checked;
    const confirmed = window.confirm(
      preserveSaveData ? t("uninstall.confirmWithPreserve") : t("uninstall.confirmWithoutPreserve"),
    );
    if (!confirmed) {
      return;
    }

    uninstallInProgress = true;
    installProgress.value = 0;
    updateButtons();
    installStatus.textContent = t("uninstall.starting");

    try {
      const result = await snrUninstall(preserveSaveData);
      installStatus.textContent = preserveSaveData
        ? t("uninstall.doneWithPreserved", { count: result.preservedFiles })
        : t("uninstall.done");
      await refreshProfileReady();
      await refreshPreservedSaveDataStatus();
      await refreshLocalPresets(true);
      await refreshReportingLogSource();
      window.location.reload();
    } catch (error) {
      installStatus.textContent = t("uninstall.failed", { error: String(error) });
    } finally {
      uninstallInProgress = false;
      updateButtons();
    }
  });

  launchModdedButton.addEventListener("click", async () => {
    if (!settings) {
      return;
    }
    launchInProgress = true;
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
      launchStatus.textContent = t("launch.vanillaFailed", { error: String(error) });
    } finally {
      launchInProgress = false;
      updateButtons();
    }
  });

  createModdedShortcutButton.addEventListener("click", async () => {
    creatingShortcut = true;
    launchStatus.textContent = t("launch.shortcutCreating");
    updateButtons();

    try {
      //const shortcutPath = await launchShortcutCreate();
      await launchShortcutCreate();
    } catch (error) {
      launchStatus.textContent = t("launch.shortcutCreateFailed", {
        error: String(error),
      });
    } finally {
      creatingShortcut = false;
      updateButtons();
    }
  });

  reportTypeSelect.addEventListener("change", () => {
    renderReportBugFields();
  });

  reportNotificationToggle.addEventListener("change", async () => {
    if (reportNotificationToggle.checked) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        reportingNotificationEnabled = false;
        persistReportingNotificationEnabled();
        setStatusLine(reportNotificationState, t("report.permissionRequired"), "warn");
        return;
      }

      reportingNotificationEnabled = true;
      persistReportingNotificationEnabled();
      setStatusLine(reportNotificationState, t("report.notificationsEnabled"), "success");
      return;
    }

    reportingNotificationEnabled = false;
    persistReportingNotificationEnabled();
  });

  reportRefreshButton.addEventListener("click", async () => {
    if (!reportingReady) {
      await initializeReporting();
      return;
    }

    await refreshReportingLogSource();
    await refreshReportingCenter(true, false);
  });

  reportSendButton.addEventListener("click", async () => {
    if (!reportingReady) {
      setStatusLine(reportStatus, t("report.notReady"), "warn");
      return;
    }

    const reportType = reportTypeSelect.value as ReportType;
    const title = reportTitleInput.value.trim();
    const description = reportDescriptionInput.value.trim();

    if (!title) {
      setStatusLine(reportStatus, t("report.titleRequired"), "warn");
      return;
    }
    if (!description) {
      setStatusLine(reportStatus, t("report.bodyRequired"), "warn");
      return;
    }

    const input: SendReportInput = {
      reportType: reportType,
      title,
      description,
    };

    if (reportType === "Bug") {
      const map = reportMapInput.value.trim();
      const role = reportRoleInput.value.trim();
      const timing = reportTimingInput.value.trim();
      if (map) {
        input.map = map;
      }
      if (role) {
        input.role = role;
      }
      if (timing) {
        input.timing = timing;
      }
    }

    reportSending = true;
    updateButtons();
    setStatusLine(reportStatus, t("report.sending"));

    try {
      await reportingReportSend(input);
      setStatusLine(reportStatus, t("report.sent"), "success");
      reportTitleInput.value = "";
      reportDescriptionInput.value = "";
      reportMapInput.value = "";
      reportRoleInput.value = "";
      reportTimingInput.value = "";
      await refreshReportingCenter(true, false);
    } catch (error) {
      setStatusLine(reportStatus, t("report.sendFailed", { error: String(error) }), "error");
    } finally {
      reportSending = false;
      updateButtons();
    }
  });

  reportSendMessageButton.addEventListener("click", async () => {
    const threadId = selectedReportThreadId;
    if (!threadId) {
      setStatusLine(reportThreadStatus, t("report.threadRequired"), "warn");
      return;
    }

    const content = reportReplyInput.value.trim();
    if (!content) {
      setStatusLine(reportThreadStatus, t("report.replyRequired"), "warn");
      return;
    }

    reportMessageSending = true;
    updateButtons();
    setStatusLine(reportThreadStatus, t("report.replySending"));

    try {
      await reportingMessageSend(threadId, content);
      reportReplyInput.value = "";
      setStatusLine(reportThreadStatus, t("report.replySent"), "success");
      await loadReportMessages(threadId, false);
      await refreshReportingCenter(false, false);
    } catch (error) {
      setStatusLine(
        reportThreadStatus,
        t("report.replySendFailed", { error: String(error) }),
        "error",
      );
    } finally {
      reportMessageSending = false;
      updateButtons();
    }
  });

  epicLoginWebviewButton.addEventListener("click", async () => {
    epicAuthStatus.textContent = t("epic.webviewStarting");
    try {
      await epicLoginWebview();
    } catch (error) {
      epicAuthStatus.textContent = t("epic.webviewStartFailed", { error: String(error) });
    }
  });

  epicLoginCodeButton.addEventListener("click", async () => {
    const code = epicAuthCodeInput.value.trim();
    if (!code) {
      epicAuthStatus.textContent = t("epic.codeRequired");
      return;
    }

    epicAuthStatus.textContent = t("epic.codeLoginInProgress");
    try {
      await epicLoginCode(code);
      epicAuthStatus.textContent = t("epic.loginSuccess");
      await refreshEpicLoginState();
    } catch (error) {
      epicAuthStatus.textContent = t("epic.loginFailed", { error: String(error) });
    }
  });

  epicLogoutButton.addEventListener("click", async () => {
    try {
      await epicLogout();
      epicAuthStatus.textContent = t("epic.logoutDone");
      await refreshEpicLoginState();
    } catch (error) {
      epicAuthStatus.textContent = t("epic.logoutFailed", { error: String(error) });
    }
  });

  const savedToken = localStorage.getItem(UPDATER_TOKEN_STORAGE_KEY);
  if (savedToken) {
    githubTokenInput.value = savedToken;
  }

  void settingsUpdate({ uiLocale: currentLocale }).catch(() => undefined);

  replayOnboardingButton.addEventListener("click", () => {
    mountOnboarding();
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
  renderReportBugFields();
  persistReportingNotificationEnabled();
  renderPreservedSaveDataStatus();
  renderLocalPresetList();
  renderArchivePresetList();
  setStatusLine(presetStatus, t("preset.statusReadyToRefresh"));

  saveTokenButton.addEventListener("click", () => {
    const token = normalizeGithubToken(githubTokenInput.value);
    if (!token) {
      updateStatus.textContent = t("token.inputRequired");
      return;
    }
    localStorage.setItem(UPDATER_TOKEN_STORAGE_KEY, token);
    updateStatus.textContent = t("token.saved");
  });

  clearTokenButton.addEventListener("click", () => {
    localStorage.removeItem(UPDATER_TOKEN_STORAGE_KEY);
    githubTokenInput.value = "";
    updateStatus.textContent = t("token.cleared");
  });

  checkUpdateButton.addEventListener("click", async () => {
    if (checkingUpdate) {
      return;
    }

    checkingUpdate = true;
    checkUpdateButton.disabled = true;
    updateStatus.textContent = t("update.checking");

    try {
      const headers = createUpdaterHeaders(githubTokenInput.value);
      const update = await check(headers ? { headers } : undefined);
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

      await update.downloadAndInstall(
        (event) => {
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
        },
        headers ? { headers } : undefined,
      );

      updateStatus.textContent = t("update.appliedRestart");
    } catch (error) {
      const hint = normalizeGithubToken(githubTokenInput.value) ? "" : t("update.privateRepoHint");
      updateStatus.textContent = t("update.failed", {
        error: String(error),
        hint,
      });
    } finally {
      checkingUpdate = false;
      checkUpdateButton.disabled = false;
    }
  });

  void (async () => {
    try {
      appVersion.textContent = `v${await getVersion()}`;
    } catch (error) {
      appVersion.textContent = t("app.versionFetchFailed", { error: String(error) });
    }
  })();

  void listen<InstallProgressPayload>("snr-install-progress", (event) => {
    const payload = event.payload;
    installProgress.value = Math.max(0, Math.min(100, payload.progress ?? 0));

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
    installProgress.value = 0;
    const loadedSettings = await reloadSettings();
    if (!loadedSettings.onboardingCompleted) {
      mountOnboarding();
    }
    await refreshProfileReady();

    await refreshLocalPresets(true);
    await refreshPreservedSaveDataStatus();
    await refreshReleases();
    await refreshReportingLogSource();
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

    await initializeReporting();
    updateButtons();
  })();
}
