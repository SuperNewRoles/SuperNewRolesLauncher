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
  NotificationOpenTarget,
  PreservedSaveDataStatus,
  PresetExportResult,
  PresetImportResult,
  PresetImportSelectionInput,
  PresetSummary,
  ReportMessage,
  ReportThread,
  ReportingLogSourceInfo,
  ReportingPrepareResult,
  ReportingSendResult,
  SaveDataImportResult,
  SaveDataPresetMergeResult,
  SaveDataPreviewResult,
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
  // 現在保存されているランチャー設定を取得する。
  return invoke<LauncherSettings>("settings_get");
}

export function settingsUpdate(settings: LauncherSettingsInput): Promise<LauncherSettings> {
  // 部分更新 payload をそのまま渡し、差分更新の責務はバックエンド側に委ねる。
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
  // 既知のインストール先候補から Among Us を自動検出する。
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

// Modインストール関連API（汎用）
export function modReleasesList(): Promise<SnrReleaseSummary[]> {
  // 配布元から利用可能なリリース一覧を取得する。
  return invoke<SnrReleaseSummary[]>("mod_releases_list");
}

export function modInstall(input: {
  tag: string;
  platform: GamePlatform;
  restorePreservedSaveData: boolean;
}): Promise<InstallResult> {
  return invoke<InstallResult>("mod_install", input);
}

export function modUninstall(preserveSaveData: boolean): Promise<UninstallResult> {
  return invoke<UninstallResult>("mod_uninstall", { preserveSaveData });
}

export function modPreservedSaveDataStatus(): Promise<PreservedSaveDataStatus> {
  return invoke<PreservedSaveDataStatus>("mod_preserved_save_data_status");
}

export function modSaveDataPreview(sourceAmongUsPath: string): Promise<SaveDataPreviewResult> {
  return invoke<SaveDataPreviewResult>("mod_savedata_preview", { sourceAmongUsPath });
}

export function modSaveDataImport(sourceAmongUsPath: string): Promise<SaveDataImportResult> {
  return invoke<SaveDataImportResult>("mod_savedata_import", { sourceAmongUsPath });
}

export function modSaveDataMergePresets(
  sourceAmongUsPath: string,
): Promise<SaveDataPresetMergeResult> {
  return invoke<SaveDataPresetMergeResult>("mod_savedata_merge_presets", { sourceAmongUsPath });
}

export function modPreservedSaveDataMergePresets(): Promise<SaveDataPresetMergeResult> {
  return invoke<SaveDataPresetMergeResult>("mod_preserved_savedata_merge_presets");
}

// 互換API（deprecated）
export function snrReleasesList(): Promise<SnrReleaseSummary[]> {
  // 旧 API 名の呼び出しを新 API 実装へ委譲する。
  return modReleasesList();
}

export function snrInstall(input: {
  tag: string;
  platform: GamePlatform;
  restorePreservedSaveData: boolean;
}): Promise<InstallResult> {
  return modInstall(input);
}

export function snrUninstall(preserveSaveData: boolean): Promise<UninstallResult> {
  return modUninstall(preserveSaveData);
}

export function snrPreservedSaveDataStatus(): Promise<PreservedSaveDataStatus> {
  return modPreservedSaveDataStatus();
}

export function snrSaveDataPreview(sourceAmongUsPath: string): Promise<SaveDataPreviewResult> {
  return modSaveDataPreview(sourceAmongUsPath);
}

export function snrSaveDataImport(sourceAmongUsPath: string): Promise<SaveDataImportResult> {
  return modSaveDataImport(sourceAmongUsPath);
}

export function snrSaveDataMergePresets(
  sourceAmongUsPath: string,
): Promise<SaveDataPresetMergeResult> {
  return modSaveDataMergePresets(sourceAmongUsPath);
}

export function snrPreservedSaveDataMergePresets(): Promise<SaveDataPresetMergeResult> {
  return modPreservedSaveDataMergePresets();
}

// マイグレーション関連API
export function migrationExport(input: {
  outputPath?: string;
  encryptionEnabled?: boolean;
  password?: string;
}): Promise<MigrationExportResult> {
  // 既存データをアーカイブ化して外部保存できる形式で出力する。
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
  // ローカル SaveData からプリセット一覧を読み出す。
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
  // 報告機能の利用可否とトークン状態を初期化する。
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

export function notificationsTakeOpenTarget(): Promise<NotificationOpenTarget | null> {
  return invoke<NotificationOpenTarget | null>("notifications_take_open_target");
}

// 起動関連API
export function launchModded(input: {
  gameExe: string;
  profilePath: string;
  platform: GamePlatform;
}): Promise<void> {
  // Mod 適用済みプロファイルでゲームを起動する。
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

export function launchModdedFirstSetupPending(gameExe: string): Promise<boolean> {
  return invoke<boolean>("launch_modded_first_setup_pending", { gameExe });
}

export function launchAutolaunchErrorTake(): Promise<string | null> {
  return invoke<string | null>("launch_autolaunch_error_take");
}

export function launchGameRunningGet(): Promise<boolean> {
  return invoke<boolean>("launch_game_running_get");
}

// トレイメニュー関連API
export function trayLaunchModded(): Promise<void> {
  return invoke<void>("tray_launch_modded");
}

export function trayShowMainWindow(): Promise<void> {
  return invoke<void>("tray_show_main_window");
}

export function trayExitApp(): Promise<void> {
  return invoke<void>("tray_exit_app");
}

// Epic認証関連API
export function epicLoginWebview(): Promise<void> {
  // WebView ベースの Epic ログインフローを開始する。
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
