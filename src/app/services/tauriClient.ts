import { invoke } from "@tauri-apps/api/core";
import type {
  EpicLoginStatus,
  GamePlatform,
  InstallResult,
  LauncherSettings,
  LauncherSettingsInput,
  MigrationExportResult,
  MigrationImportResult,
  MigrationPasswordValidationResult,
  PreservedSaveDataStatus,
  PresetExportResult,
  PresetImportResult,
  PresetImportSelectionInput,
  PresetSummary,
  SaveDataImportResult,
  SaveDataPreviewResult,
  ReportMessage,
  ReportThread,
  ReportingLogSourceInfo,
  ReportingPrepareResult,
  ReportingSendResult,
  SendReportInput,
  SnrReleaseSummary,
  UninstallResult,
} from "../types";

/**
 * フロントからTauri commandを呼ぶ唯一の窓口。
 * command名変更やDTO整形はここで吸収し、画面コードの責務を減らす。
 */

// 設定関連API
export function settingsGet(): Promise<LauncherSettings> {
  return invoke<LauncherSettings>("settings_get");
}

export function settingsUpdate(settings: LauncherSettingsInput): Promise<LauncherSettings> {
  return invoke<LauncherSettings>("settings_update", { settings });
}

export function settingsProfileReady(profilePath?: string): Promise<boolean> {
  return invoke<boolean>("settings_profile_ready", { profilePath });
}

export function settingsOpenFolder(path: string): Promise<void> {
  return invoke<void>("settings_open_folder", { path });
}

// パス検出関連API
export function finderDetectAmongUs(): Promise<string> {
  return invoke<string>("finder_detect_among_us");
}

export function finderDetectPlatform(path: string): Promise<GamePlatform> {
  return invoke<GamePlatform>("finder_detect_platform", { path });
}

export interface DetectedPlatform {
  path: string;
  platform: string;
}

export function finderDetectPlatforms(): Promise<DetectedPlatform[]> {
  return invoke<DetectedPlatform[]>("finder_detect_platforms");
}

// SNRインストール関連API
export function snrReleasesList(): Promise<SnrReleaseSummary[]> {
  return invoke<SnrReleaseSummary[]>("snr_releases_list");
}

export function snrInstall(input: {
  tag: string;
  platform: GamePlatform;
  restorePreservedSaveData: boolean;
}): Promise<InstallResult> {
  return invoke<InstallResult>("snr_install", input);
}

export function snrUninstall(preserveSaveData: boolean): Promise<UninstallResult> {
  return invoke<UninstallResult>("snr_uninstall", { preserveSaveData });
}

export function snrPreservedSaveDataStatus(): Promise<PreservedSaveDataStatus> {
  return invoke<PreservedSaveDataStatus>("snr_preserved_save_data_status");
}

export function snrSaveDataPreview(sourceAmongUsPath: string): Promise<SaveDataPreviewResult> {
  return invoke<SaveDataPreviewResult>("snr_savedata_preview", { sourceAmongUsPath });
}

export function snrSaveDataImport(sourceAmongUsPath: string): Promise<SaveDataImportResult> {
  return invoke<SaveDataImportResult>("snr_savedata_import", { sourceAmongUsPath });
}

// マイグレーション関連API
export function migrationExport(input: {
  outputPath?: string;
  encryptionEnabled?: boolean;
  password?: string;
}): Promise<MigrationExportResult> {
  return invoke<MigrationExportResult>("migration_export", input);
}

export function migrationImport(input: {
  archivePath: string;
  password?: string;
}): Promise<MigrationImportResult> {
  return invoke<MigrationImportResult>("migration_import", input);
}

export function migrationValidateArchivePassword(input: {
  archivePath: string;
  password?: string;
}): Promise<MigrationPasswordValidationResult> {
  return invoke<MigrationPasswordValidationResult>("migration_validate_archive_password", input);
}

// プリセット関連API
export function presetsListLocal(): Promise<PresetSummary[]> {
  return invoke<PresetSummary[]>("presets_list_local");
}

export function presetsExport(input: {
  presetIds: number[];
  outputPath?: string;
}): Promise<PresetExportResult> {
  return invoke<PresetExportResult>("presets_export", input);
}

export function presetsInspectArchive(archivePath: string): Promise<PresetSummary[]> {
  return invoke<PresetSummary[]>("presets_inspect_archive", { archivePath });
}

export function presetsImportArchive(input: {
  archivePath: string;
  selections: PresetImportSelectionInput[];
}): Promise<PresetImportResult> {
  return invoke<PresetImportResult>("presets_import_archive", input);
}

// Reporting関連API
export function reportingPrepare(): Promise<ReportingPrepareResult> {
  return invoke<ReportingPrepareResult>("reporting_prepare");
}

export function reportingThreadsList(): Promise<ReportThread[]> {
  return invoke<ReportThread[]>("reporting_threads_list");
}

export function reportingMessagesList(threadId: string): Promise<ReportMessage[]> {
  return invoke<ReportMessage[]>("reporting_messages_list", { threadId });
}

export function reportingMessageSend(
  threadId: string,
  content: string,
): Promise<ReportingSendResult> {
  return invoke<ReportingSendResult>("reporting_message_send", { threadId, content });
}

export function reportingReportSend(input: SendReportInput): Promise<ReportingSendResult> {
  return invoke<ReportingSendResult>("reporting_report_send", { input });
}

export function reportingNotificationFlagGet(): Promise<boolean> {
  return invoke<boolean>("reporting_notification_flag_get");
}

export function reportingLogSourceGet(): Promise<ReportingLogSourceInfo> {
  return invoke<ReportingLogSourceInfo>("reporting_log_source_get");
}

// 起動関連API
export function launchModded(input: {
  gameExe: string;
  profilePath: string;
  platform: GamePlatform;
}): Promise<void> {
  return invoke<void>("launch_modded", input);
}

export function launchVanilla(input: {
  gameExe: string;
  platform: GamePlatform;
}): Promise<void> {
  return invoke<void>("launch_vanilla", input);
}

export function launchShortcutCreate(): Promise<string> {
  return invoke<string>("launch_shortcut_create");
}

export function launchAutolaunchErrorTake(): Promise<string | null> {
  return invoke<string | null>("launch_autolaunch_error_take");
}

export function launchGameRunningGet(): Promise<boolean> {
  return invoke<boolean>("launch_game_running_get");
}

// Epic認証関連API
export function epicLoginWebview(): Promise<void> {
  return invoke<void>("epic_login_webview");
}

export function epicLoginCode(code: string): Promise<void> {
  return invoke<void>("epic_login_code", { code });
}

export function epicSessionRestore(): Promise<boolean> {
  return invoke<boolean>("epic_session_restore");
}

export function epicStatusGet(): Promise<EpicLoginStatus> {
  return invoke<EpicLoginStatus>("epic_status_get");
}

export function epicLogout(): Promise<void> {
  return invoke<void>("epic_logout");
}
