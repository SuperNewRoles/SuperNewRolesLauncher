import { signal } from "@preact/signals-core";
import type {
  LauncherSettings,
  PresetSummary,
  ReportMessage,
  ReportThread,
  SnrReleaseSummary,
  StatusTone,
} from "../types";

/**
 * アプリ状態をsignalsで管理するストア。
 * 旧実装のlet乱立を置き換え、描画制御とテスト容易性を改善する。
 */
export interface AppStateSnapshot {
  settings: LauncherSettings | null;
  releases: SnrReleaseSummary[];
  profileIsReady: boolean;
  gameRunning: boolean;
  installInProgress: boolean;
  uninstallInProgress: boolean;
  launchInProgress: boolean;
  creatingShortcut: boolean;
  releasesLoading: boolean;
  checkingUpdate: boolean;
  epicLoggedIn: boolean;
  migrationExporting: boolean;
  migrationImporting: boolean;
  presetLoading: boolean;
  presetExporting: boolean;
  presetInspecting: boolean;
  presetImporting: boolean;
  localPresets: PresetSummary[];
  archivePresets: PresetSummary[];
  reportingReady: boolean;
  reportPreparing: boolean;
  reportingLoading: boolean;
  reportMessagesLoading: boolean;
  reportSending: boolean;
  reportMessageSending: boolean;
  reportThreads: ReportThread[];
  reportMessages: ReportMessage[];
  selectedReportThreadId: string | null;
  reportMessageLoadTicket: number;
  reportingPollTimer: number | null;
  reportingUnreadBaselineCaptured: boolean;
  knownUnreadThreadIds: Set<string>;
  preservedSaveDataAvailable: boolean;
  preservedSaveDataFiles: number;
  reportingNotificationEnabled: boolean;
}

export interface AppStore {
  settings: ReturnType<typeof signal<LauncherSettings | null>>;
  releases: ReturnType<typeof signal<SnrReleaseSummary[]>>;
  profileIsReady: ReturnType<typeof signal<boolean>>;
  gameRunning: ReturnType<typeof signal<boolean>>;
  installInProgress: ReturnType<typeof signal<boolean>>;
  uninstallInProgress: ReturnType<typeof signal<boolean>>;
  launchInProgress: ReturnType<typeof signal<boolean>>;
  creatingShortcut: ReturnType<typeof signal<boolean>>;
  releasesLoading: ReturnType<typeof signal<boolean>>;
  checkingUpdate: ReturnType<typeof signal<boolean>>;
  epicLoggedIn: ReturnType<typeof signal<boolean>>;
  migrationExporting: ReturnType<typeof signal<boolean>>;
  migrationImporting: ReturnType<typeof signal<boolean>>;
  presetLoading: ReturnType<typeof signal<boolean>>;
  presetExporting: ReturnType<typeof signal<boolean>>;
  presetInspecting: ReturnType<typeof signal<boolean>>;
  presetImporting: ReturnType<typeof signal<boolean>>;
  localPresets: ReturnType<typeof signal<PresetSummary[]>>;
  archivePresets: ReturnType<typeof signal<PresetSummary[]>>;
  reportingReady: ReturnType<typeof signal<boolean>>;
  reportPreparing: ReturnType<typeof signal<boolean>>;
  reportingLoading: ReturnType<typeof signal<boolean>>;
  reportMessagesLoading: ReturnType<typeof signal<boolean>>;
  reportSending: ReturnType<typeof signal<boolean>>;
  reportMessageSending: ReturnType<typeof signal<boolean>>;
  reportThreads: ReturnType<typeof signal<ReportThread[]>>;
  reportMessages: ReturnType<typeof signal<ReportMessage[]>>;
  selectedReportThreadId: ReturnType<typeof signal<string | null>>;
  reportMessageLoadTicket: ReturnType<typeof signal<number>>;
  reportingPollTimer: ReturnType<typeof signal<number | null>>;
  reportingUnreadBaselineCaptured: ReturnType<typeof signal<boolean>>;
  knownUnreadThreadIds: ReturnType<typeof signal<Set<string>>>;
  preservedSaveDataAvailable: ReturnType<typeof signal<boolean>>;
  preservedSaveDataFiles: ReturnType<typeof signal<number>>;
  reportingNotificationEnabled: ReturnType<typeof signal<boolean>>;
  readonly snapshot: () => AppStateSnapshot;
}

export interface StatusState {
  message: string;
  tone: StatusTone;
}

/**
 * 初期状態を生成する。
 * ローカルストレージ由来の初期値は呼び出し側から渡して副作用を閉じ込める。
 */
export function createAppStore(initialNotificationEnabled: boolean): AppStore {
  const settings = signal<LauncherSettings | null>(null);
  const releases = signal<SnrReleaseSummary[]>([]);
  const profileIsReady = signal(false);
  const gameRunning = signal(false);
  const installInProgress = signal(false);
  const uninstallInProgress = signal(false);
  const launchInProgress = signal(false);
  const creatingShortcut = signal(false);
  const releasesLoading = signal(false);
  const checkingUpdate = signal(false);
  const epicLoggedIn = signal(false);
  const migrationExporting = signal(false);
  const migrationImporting = signal(false);
  const presetLoading = signal(false);
  const presetExporting = signal(false);
  const presetInspecting = signal(false);
  const presetImporting = signal(false);
  const localPresets = signal<PresetSummary[]>([]);
  const archivePresets = signal<PresetSummary[]>([]);
  const reportingReady = signal(false);
  const reportPreparing = signal(false);
  const reportingLoading = signal(false);
  const reportMessagesLoading = signal(false);
  const reportSending = signal(false);
  const reportMessageSending = signal(false);
  const reportThreads = signal<ReportThread[]>([]);
  const reportMessages = signal<ReportMessage[]>([]);
  const selectedReportThreadId = signal<string | null>(null);
  const reportMessageLoadTicket = signal(0);
  const reportingPollTimer = signal<number | null>(null);
  const reportingUnreadBaselineCaptured = signal(false);
  const knownUnreadThreadIds = signal<Set<string>>(new Set<string>());
  const preservedSaveDataAvailable = signal(false);
  const preservedSaveDataFiles = signal(0);
  const reportingNotificationEnabled = signal(initialNotificationEnabled);

  return {
    settings,
    releases,
    profileIsReady,
    gameRunning,
    installInProgress,
    uninstallInProgress,
    launchInProgress,
    creatingShortcut,
    releasesLoading,
    checkingUpdate,
    epicLoggedIn,
    migrationExporting,
    migrationImporting,
    presetLoading,
    presetExporting,
    presetInspecting,
    presetImporting,
    localPresets,
    archivePresets,
    reportingReady,
    reportPreparing,
    reportingLoading,
    reportMessagesLoading,
    reportSending,
    reportMessageSending,
    reportThreads,
    reportMessages,
    selectedReportThreadId,
    reportMessageLoadTicket,
    reportingPollTimer,
    reportingUnreadBaselineCaptured,
    knownUnreadThreadIds,
    preservedSaveDataAvailable,
    preservedSaveDataFiles,
    reportingNotificationEnabled,
    snapshot: () => ({
      settings: settings.value,
      releases: releases.value,
      profileIsReady: profileIsReady.value,
      gameRunning: gameRunning.value,
      installInProgress: installInProgress.value,
      uninstallInProgress: uninstallInProgress.value,
      launchInProgress: launchInProgress.value,
      creatingShortcut: creatingShortcut.value,
      releasesLoading: releasesLoading.value,
      checkingUpdate: checkingUpdate.value,
      epicLoggedIn: epicLoggedIn.value,
      migrationExporting: migrationExporting.value,
      migrationImporting: migrationImporting.value,
      presetLoading: presetLoading.value,
      presetExporting: presetExporting.value,
      presetInspecting: presetInspecting.value,
      presetImporting: presetImporting.value,
      localPresets: localPresets.value,
      archivePresets: archivePresets.value,
      reportingReady: reportingReady.value,
      reportPreparing: reportPreparing.value,
      reportingLoading: reportingLoading.value,
      reportMessagesLoading: reportMessagesLoading.value,
      reportSending: reportSending.value,
      reportMessageSending: reportMessageSending.value,
      reportThreads: reportThreads.value,
      reportMessages: reportMessages.value,
      selectedReportThreadId: selectedReportThreadId.value,
      reportMessageLoadTicket: reportMessageLoadTicket.value,
      reportingPollTimer: reportingPollTimer.value,
      reportingUnreadBaselineCaptured: reportingUnreadBaselineCaptured.value,
      knownUnreadThreadIds: knownUnreadThreadIds.value,
      preservedSaveDataAvailable: preservedSaveDataAvailable.value,
      preservedSaveDataFiles: preservedSaveDataFiles.value,
      reportingNotificationEnabled: reportingNotificationEnabled.value,
    }),
  };
}
