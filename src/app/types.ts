/**
 * フロントエンド全体で共有するDTOと状態型の定義。
 * Tauri command境界の入出力を明示し、機能分割後も型を一元化する。
 */

export type GamePlatform = "steam" | "epic";
export type ReportType = "Bug" | "Question" | "Request" | "Thanks" | "Other";

export interface LauncherSettings {
  amongUsPath: string;
  gamePlatform: GamePlatform;
  selectedReleaseTag: string;
  profilePath: string;
  closeToTrayOnClose: boolean;
  uiLocale: string;
  onboardingCompleted: boolean;
}

export interface LauncherSettingsInput {
  amongUsPath?: string;
  gamePlatform?: GamePlatform;
  selectedReleaseTag?: string;
  profilePath?: string;
  closeToTrayOnClose?: boolean;
  uiLocale?: string;
  onboardingCompleted?: boolean;
}

export interface SnrReleaseSummary {
  tag: string;
  name: string;
  publishedAt: string;
}

export interface InstallResult {
  tag: string;
  platform: string;
  assetName: string;
  profilePath: string;
  restoredSaveFiles: number;
}

export interface UninstallResult {
  profilePath: string;
  removedProfile: boolean;
  preservedFiles: number;
}

export interface PreservedSaveDataStatus {
  // available は「復元可能な保存データが1件以上あるか」を表す。
  available: boolean;
  files: number;
}

export interface MigrationExportResult {
  archivePath: string;
  includedFiles: number;
  profileFiles: number;
  locallowFiles: number;
  encrypted: boolean;
}

export interface MigrationImportResult {
  importedFiles: number;
  profileFiles: number;
  locallowFiles: number;
  encrypted: boolean;
}

export interface MigrationPasswordValidationResult {
  encrypted: boolean;
}

export interface PresetSummary {
  id: number;
  name: string;
  hasDataFile: boolean;
}

export interface PresetExportResult {
  archivePath: string;
  exportedPresets: number;
}

export interface PresetImportSelectionInput {
  sourceId: number;
  name?: string;
}

export interface ImportedPresetResult {
  sourceId: number;
  targetId: number;
  name: string;
}

export interface PresetImportResult {
  importedPresets: number;
  imported: ImportedPresetResult[];
}

export interface SaveDataPreviewResult {
  sourceAmongUsPath: string;
  sourceSaveDataPath: string;
  presets: PresetSummary[];
  fileCount: number;
}

export interface SaveDataImportResult {
  sourceSaveDataPath: string;
  targetSaveDataPath: string;
  importedFiles: number;
  importedPresets: number;
}

export interface SaveDataPresetMergeResult {
  sourceSaveDataPath: string;
  importedPresets: number;
}

export interface InstallProgressPayload {
  stage: string;
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
  current?: number;
  entriesTotal?: number;
}

export interface GameStatePayload {
  running: boolean;
}

export interface EpicLoginStatus {
  loggedIn: boolean;
  accountId: string | null;
  displayName: string | null;
  profileError: string | null;
}

export interface OfficialLink {
  label: string;
  url: string;
  backgroundColor: string;
  iconSvg: string;
}

export interface ReportingPrepareResult {
  ready: boolean;
  tokenSource: string;
  createdAccount: boolean;
  githubId?: string;
}

export interface ReportingSendResult {
  success: boolean;
}

export interface ReportStatus {
  status: string;
  color: string;
  mark: string;
}

export interface ReportThread {
  threadId: string;
  title: string;
  firstMessage: string;
  createdAt: string;
  unread: boolean;
  currentStatus: ReportStatus;
}

export interface ReportMessage {
  messageType: string;
  messageId: string;
  createdAt: string;
  content: string;
  sender?: string;
  color?: string;
  mark?: string;
}

export interface ReportingLogSourceInfo {
  profileCandidate: string;
  gameCandidate: string;
  selectedPath: string | null;
  exists: boolean;
}

export interface SendReportInput {
  reportType: ReportType;
  title: string;
  description: string;
  map?: string;
  role?: string;
  timing?: string;
}

export type StatusTone = "info" | "error" | "success" | "warn";
