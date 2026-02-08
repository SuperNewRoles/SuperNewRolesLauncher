import "./styles.css";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";
import {
  SUPPORTED_LOCALES,
  createTranslator,
  normalizeLocale,
  resolveInitialLocale,
  saveLocale,
  type LocaleCode,
  type MessageKey,
} from "./i18n";

type GamePlatform = "steam" | "epic";
type ReportType = "Bug" | "Question" | "Request" | "Thanks" | "Other";

interface LauncherSettings {
  among_us_path: string;
  game_platform: GamePlatform;
  selected_release_tag: string;
  profile_path: string;
  close_to_tray_on_close: boolean;
}

interface LauncherSettingsInput {
  among_us_path?: string;
  game_platform?: GamePlatform;
  selected_release_tag?: string;
  profile_path?: string;
  close_to_tray_on_close?: boolean;
}

interface SnrReleaseSummary {
  tag: string;
  name: string;
  published_at: string;
}

interface InstallResult {
  tag: string;
  platform: string;
  asset_name: string;
  profile_path: string;
  restored_save_files: number;
}

interface UninstallResult {
  profile_path: string;
  removed_profile: boolean;
  preserved_files: number;
}

interface PreservedSaveDataStatus {
  available: boolean;
  files: number;
}

interface MigrationExportResult {
  archive_path: string;
  included_files: number;
  profile_files: number;
  locallow_files: number;
  encrypted: boolean;
}

interface MigrationImportResult {
  imported_files: number;
  profile_files: number;
  locallow_files: number;
  encrypted: boolean;
}

interface PresetSummary {
  id: number;
  name: string;
  has_data_file: boolean;
}

interface PresetExportResult {
  archive_path: string;
  exported_presets: number;
}

interface PresetImportSelectionInput {
  sourceId: number;
  name?: string;
}

interface ImportedPresetResult {
  source_id: number;
  target_id: number;
  name: string;
}

interface PresetImportResult {
  imported_presets: number;
  imported: ImportedPresetResult[];
}

interface InstallProgressPayload {
  stage: string;
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
  current?: number;
  entries_total?: number;
}

interface GameStatePayload {
  running: boolean;
}

interface EpicLoginStatus {
  logged_in: boolean;
  account_id: string | null;
  display_name: string | null;
  profile_error: string | null;
}

interface OfficialLink {
  label: string;
  url: string;
  backgroundColor: string;
  iconSvg: string;
}

interface ReportingPrepareResult {
  ready: boolean;
  token_source: string;
  created_account: boolean;
}

interface ReportingSendResult {
  success: boolean;
}

interface ReportStatus {
  status: string;
  color: string;
  mark: string;
}

interface ReportThread {
  thread_id: string;
  title: string;
  first_message: string;
  created_at: string;
  unread: boolean;
  current_status: ReportStatus;
}

interface ReportMessage {
  message_type: string;
  message_id: string;
  created_at: string;
  content: string;
  sender?: string;
  color?: string;
  mark?: string;
}

interface ReportingLogSourceInfo {
  profile_candidate: string;
  game_candidate: string;
  selected_path: string | null;
  exists: boolean;
}

interface SendReportInput {
  report_type: ReportType;
  title: string;
  description: string;
  map?: string;
  role?: string;
  timing?: string;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app not found");
}

const currentLocale = resolveInitialLocale();
const t = createTranslator(currentLocale);
document.documentElement.lang = currentLocale;

const LOCALE_OPTION_LABEL_KEYS: Record<LocaleCode, MessageKey> = {
  ja: "language.option.ja",
  en: "language.option.en",
};

function renderLocaleOptions(locale: LocaleCode): string {
  return SUPPORTED_LOCALES.map((value) => {
    const selected = value === locale ? " selected" : "";
    return `<option value="${value}"${selected}>${t(LOCALE_OPTION_LABEL_KEYS[value])}</option>`;
  }).join("");
}

app.innerHTML = `
  <main class="app-shell">
    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
      <h1 style="margin: 0; flex: 1; min-width: 280px;">SuperNewRolesLauncher</h1>
      <label for="language-select">${t("language.label")}</label>
      <select id="language-select" style="padding: 8px; min-width: 140px;">${renderLocaleOptions(currentLocale)}</select>
    </div>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px;">
      <strong>${t("credit.title")}</strong>
      <div style="font-size: 14px; line-height: 1.6;">
        <div>${t("credit.supernewrolesLine")}</div>
        <div>${t("credit.amongUsLine")}</div>
        <div>${t("credit.launcherLine")}</div>
        <div>${t("credit.referenceLine")}</div>
      </div>
      <div style="font-size: 12px; color: #57606a; display: grid; gap: 4px;">
        <div>${t("credit.wikiLabel")}: https://wiki.supernewroles.com</div>
      </div>
      <div id="official-link-buttons" class="pill-links"></div>
    </section>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px;">
      <strong>${t("launcher.title")}</strong>
      <div>${t("launcher.currentVersionLabel")}: <span id="app-version">${t("launcher.currentVersionLoading")}</span></div>
      <div style="display: grid; gap: 6px;">
        <label for="among-us-path">${t("launcher.amongUsPathLabel")}</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <input id="among-us-path" type="text" placeholder="C:\\\\Program Files (x86)\\\\Steam\\\\steamapps\\\\common\\\\Among Us" style="padding: 8px; min-width: 500px; flex: 1;" />
          <button id="save-among-us-path" type="button" style="padding: 8px 12px;">${t("launcher.save")}</button>
          <button id="detect-among-us-path" type="button" style="padding: 8px 12px;">${t("launcher.autoDetect")}</button>
        </div>
      </div>
      <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
        <label for="platform-select">${t("launcher.platformLabel")}</label>
        <select id="platform-select" style="padding: 8px;">
          <option value="steam">steam</option>
          <option value="epic">epic</option>
        </select>
        <label for="release-select">${t("launcher.releaseTagLabel")}</label>
        <select id="release-select" style="padding: 8px; min-width: 280px;"></select>
        <button id="refresh-releases" type="button" style="padding: 8px 12px;">${t("launcher.refreshTags")}</button>
      </div>
      <div>${t("launcher.profileDestinationLabel")}: <code id="profile-path"></code></div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="open-among-us-folder" type="button" style="padding: 8px 12px;">${t("launcher.openAmongUsFolder")}</button>
        <button id="open-profile-folder" type="button" style="padding: 8px 12px;">${t("launcher.openProfileFolder")}</button>
      </div>
      <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #57606a;">
        <input id="close-to-tray-on-close" type="checkbox" />
        ${t("launcher.closeToTrayOnClose")}
      </label>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="install-snr" type="button" style="padding: 8px 12px;">${t("launcher.installSnr")}</button>
        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #57606a;">
          <input id="install-restore-save-data" type="checkbox" />
          ${t("launcher.restoreSavedDataOnInstall")}
        </label>
        <progress id="install-progress" value="0" max="100" style="width: 260px;"></progress>
        <span id="install-status" aria-live="polite"></span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="uninstall-snr" type="button" style="padding: 8px 12px;">${t("launcher.uninstallMod")}</button>
        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #57606a;">
          <input id="uninstall-preserve-save-data" type="checkbox" checked />
          ${t("launcher.preserveCurrentSaveData")}
        </label>
      </div>
      <div id="preserved-save-data-status" style="font-size: 12px; color: #57606a;"></div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="launch-modded" type="button" style="padding: 8px 12px;">${t("launcher.launchModded")}</button>
        <button id="launch-vanilla" type="button" style="padding: 8px 12px;">${t("launcher.launchVanilla")}</button>
        <button id="create-modded-shortcut" type="button" style="padding: 8px 12px;">${t("launcher.createModdedShortcut")}</button>
        <span id="launch-status" aria-live="polite"></span>
      </div>
      <div id="profile-ready-status" style="font-size: 12px; color: #57606a;"></div>
    </section>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px; max-width: 780px;">
      <strong>${t("migration.title")}</strong>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="migration-export" type="button" style="padding: 8px 12px;">${t("migration.export")}</button>
        <span style="font-size: 12px; color: #57606a;">${t("migration.exportDescription")}</span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #57606a;">
          <input id="migration-encryption-enabled" type="checkbox" checked />
          ${t("migration.encryptionEnabled")}
        </label>
        <input id="migration-export-password" type="password" placeholder="${t("migration.exportPasswordPlaceholder")}" style="padding: 8px; min-width: 220px;" />
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="migration-import-path" type="text" placeholder="${t("migration.importPlaceholder")}" style="padding: 8px; min-width: 420px; flex: 1;" />
        <input id="migration-import-password" type="password" placeholder="${t("migration.importPasswordPlaceholder")}" style="padding: 8px; min-width: 220px;" />
        <button id="migration-import" type="button" style="padding: 8px 12px;">${t("migration.import")}</button>
      </div>
      <div id="migration-status" style="font-size: 12px; color: #57606a;" aria-live="polite"></div>
    </section>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px; max-width: 860px;">
      <strong>プリセット共有 (.snrpresets)</strong>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="preset-refresh" type="button" style="padding: 8px 12px;">ローカル一覧更新</button>
        <button id="preset-select-all-local" type="button" style="padding: 8px 12px;">全選択</button>
        <button id="preset-clear-local" type="button" style="padding: 8px 12px;">選択解除</button>
      </div>
      <div id="preset-local-list" style="display: grid; gap: 6px; max-height: 220px; overflow: auto; border: 1px solid #d0d7de; border-radius: 8px; padding: 8px;"></div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="preset-export-path" type="text" placeholder="C:\\path\\to\\presets.snrpresets (空で自動)" style="padding: 8px; min-width: 420px; flex: 1;" />
        <button id="preset-export" type="button" style="padding: 8px 12px;">選択をエクスポート</button>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="preset-import-path" type="text" placeholder="C:\\path\\to\\presets.snrpresets" style="padding: 8px; min-width: 420px; flex: 1;" />
        <button id="preset-inspect" type="button" style="padding: 8px 12px;">中身確認</button>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="preset-select-all-archive" type="button" style="padding: 8px 12px;">全選択</button>
        <button id="preset-clear-archive" type="button" style="padding: 8px 12px;">選択解除</button>
        <button id="preset-import" type="button" style="padding: 8px 12px;">選択をインポート</button>
      </div>
      <div id="preset-archive-list" style="display: grid; gap: 6px; max-height: 260px; overflow: auto; border: 1px solid #d0d7de; border-radius: 8px; padding: 8px;"></div>
      <div id="preset-status" style="font-size: 12px; color: #57606a;" aria-live="polite"></div>
    </section>

    <section class="card">
      <div class="report-header">
        <strong>${t("report.title")}</strong>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <span id="report-account-state" class="badge">${t("report.accountStateUnready")}</span>
          <span id="report-remote-flag" class="badge">${t("report.remoteFlagUnknown")}</span>
          <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #57606a;">
            <input id="report-notification-toggle" type="checkbox" />
            ${t("report.notificationToggle")}
          </label>
          <button id="report-refresh" type="button" class="ghost">${t("report.refresh")}</button>
        </div>
      </div>
      <div id="report-notification-state" class="status-line" aria-live="polite"></div>
      <div class="report-grid">
        <div class="report-pane">
          <strong>${t("report.newReport")}</strong>
          <div class="field-grid two">
            <div class="stack">
              <label for="report-type">${t("report.type")}</label>
              <select id="report-type">
                <option value="Bug">${t("report.typeOption.bug")}</option>
                <option value="Question">${t("report.typeOption.question")}</option>
                <option value="Request">${t("report.typeOption.request")}</option>
                <option value="Thanks">${t("report.typeOption.thanks")}</option>
                <option value="Other">${t("report.typeOption.other")}</option>
              </select>
            </div>
            <div class="stack">
              <label for="report-title">${t("report.titleLabel")}</label>
              <input id="report-title" type="text" maxlength="80" />
            </div>
          </div>
          <div id="report-bug-fields" class="field-grid two">
            <div class="stack">
              <label for="report-map">${t("report.map")}</label>
              <input id="report-map" type="text" maxlength="40" />
            </div>
            <div class="stack">
              <label for="report-role">${t("report.role")}</label>
              <input id="report-role" type="text" maxlength="60" />
            </div>
            <div class="stack" style="grid-column: 1 / -1;">
              <label for="report-timing">${t("report.timing")}</label>
              <input id="report-timing" type="text" maxlength="100" />
            </div>
          </div>
          <div class="stack">
            <label for="report-description">${t("report.body")}</label>
            <textarea id="report-description" placeholder="${t("report.bodyPlaceholder")}"></textarea>
          </div>
          <div id="report-log-source" class="muted"></div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button id="report-send" type="button">${t("report.send")}</button>
            <span id="report-status" class="status-line" aria-live="polite"></span>
          </div>
        </div>

        <div class="report-pane">
          <strong>${t("report.threads")}</strong>
          <div id="report-thread-list" class="report-thread-list"></div>
          <div id="report-thread-status" class="status-line" aria-live="polite"></div>
          <div id="report-selected-thread" class="muted">${t("report.selectedNone")}</div>
          <div id="report-message-list" class="report-message-list"></div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <input id="report-reply-input" type="text" placeholder="${t("report.replyPlaceholder")}" style="padding: 8px; min-width: 220px; flex: 1;" />
            <button id="report-send-message" type="button">${t("report.reply")}</button>
          </div>
        </div>
      </div>
    </section>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px;">
      <strong>${t("epic.title")}</strong>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="epic-login-webview" type="button" style="padding: 8px 12px;">${t("epic.loginWebview")}</button>
        <button id="epic-logout" type="button" style="padding: 8px 12px;">${t("epic.logout")}</button>
        <span id="epic-auth-status" aria-live="polite"></span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="epic-auth-code" type="text" placeholder="${t("epic.authCodePlaceholder")}" style="padding: 8px; min-width: 320px;" />
        <button id="epic-login-code" type="button" style="padding: 8px 12px;">${t("epic.loginWithCode")}</button>
      </div>
    </section>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px; max-width: 620px;">
      <strong>${t("update.title")}</strong>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="check-update" type="button" style="padding: 8px 12px;">${t("update.check")}</button>
        <span id="update-status" aria-live="polite"></span>
      </div>
      <div style="display: grid; gap: 6px;">
        <label for="github-token" style="font-size: 12px; color: #57606a;">${t("update.tokenLabel")}</label>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input id="github-token" type="password" autocomplete="off" placeholder="${t("update.tokenPlaceholder")}" style="padding: 8px; min-width: 320px;" />
          <button id="save-token" type="button" style="padding: 8px 12px;">${t("update.saveToken")}</button>
          <button id="clear-token" type="button" style="padding: 8px 12px;">${t("update.clearToken")}</button>
        </div>
      </div>
    </section>
  </main>
`;

function mustElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

const appVersion = mustElement<HTMLSpanElement>("#app-version");
const languageSelect = mustElement<HTMLSelectElement>("#language-select");
const amongUsPathInput = mustElement<HTMLInputElement>("#among-us-path");
const saveAmongUsPathButton = mustElement<HTMLButtonElement>("#save-among-us-path");
const detectAmongUsPathButton = mustElement<HTMLButtonElement>("#detect-among-us-path");
const platformSelect = mustElement<HTMLSelectElement>("#platform-select");
const releaseSelect = mustElement<HTMLSelectElement>("#release-select");
const refreshReleasesButton = mustElement<HTMLButtonElement>("#refresh-releases");
const profilePath = mustElement<HTMLElement>("#profile-path");
const openAmongUsFolderButton = mustElement<HTMLButtonElement>("#open-among-us-folder");
const openProfileFolderButton = mustElement<HTMLButtonElement>("#open-profile-folder");
const closeToTrayOnCloseInput = mustElement<HTMLInputElement>("#close-to-tray-on-close");
const installButton = mustElement<HTMLButtonElement>("#install-snr");
const installRestoreSaveDataCheckbox = mustElement<HTMLInputElement>("#install-restore-save-data");
const uninstallButton = mustElement<HTMLButtonElement>("#uninstall-snr");
const uninstallPreserveSaveDataCheckbox = mustElement<HTMLInputElement>("#uninstall-preserve-save-data");
const installProgress = mustElement<HTMLProgressElement>("#install-progress");
const installStatus = mustElement<HTMLSpanElement>("#install-status");
const preservedSaveDataStatus = mustElement<HTMLDivElement>("#preserved-save-data-status");
const launchModdedButton = mustElement<HTMLButtonElement>("#launch-modded");
const launchVanillaButton = mustElement<HTMLButtonElement>("#launch-vanilla");
const createModdedShortcutButton = mustElement<HTMLButtonElement>("#create-modded-shortcut");
const launchStatus = mustElement<HTMLSpanElement>("#launch-status");
const profileReadyStatus = mustElement<HTMLDivElement>("#profile-ready-status");
const migrationExportButton = mustElement<HTMLButtonElement>("#migration-export");
const migrationEncryptionEnabledInput = mustElement<HTMLInputElement>("#migration-encryption-enabled");
const migrationExportPasswordInput = mustElement<HTMLInputElement>("#migration-export-password");
const migrationImportPathInput = mustElement<HTMLInputElement>("#migration-import-path");
const migrationImportPasswordInput = mustElement<HTMLInputElement>("#migration-import-password");
const migrationImportButton = mustElement<HTMLButtonElement>("#migration-import");
const migrationStatus = mustElement<HTMLDivElement>("#migration-status");
const presetRefreshButton = mustElement<HTMLButtonElement>("#preset-refresh");
const presetSelectAllLocalButton = mustElement<HTMLButtonElement>("#preset-select-all-local");
const presetClearLocalButton = mustElement<HTMLButtonElement>("#preset-clear-local");
const presetLocalList = mustElement<HTMLDivElement>("#preset-local-list");
const presetExportPathInput = mustElement<HTMLInputElement>("#preset-export-path");
const presetExportButton = mustElement<HTMLButtonElement>("#preset-export");
const presetImportPathInput = mustElement<HTMLInputElement>("#preset-import-path");
const presetInspectButton = mustElement<HTMLButtonElement>("#preset-inspect");
const presetSelectAllArchiveButton = mustElement<HTMLButtonElement>("#preset-select-all-archive");
const presetClearArchiveButton = mustElement<HTMLButtonElement>("#preset-clear-archive");
const presetImportButton = mustElement<HTMLButtonElement>("#preset-import");
const presetArchiveList = mustElement<HTMLDivElement>("#preset-archive-list");
const presetStatus = mustElement<HTMLDivElement>("#preset-status");
const reportAccountState = mustElement<HTMLSpanElement>("#report-account-state");
const reportRemoteFlag = mustElement<HTMLSpanElement>("#report-remote-flag");
const reportRefreshButton = mustElement<HTMLButtonElement>("#report-refresh");
const reportNotificationToggle = mustElement<HTMLInputElement>("#report-notification-toggle");
const reportNotificationState = mustElement<HTMLDivElement>("#report-notification-state");
const reportTypeSelect = mustElement<HTMLSelectElement>("#report-type");
const reportTitleInput = mustElement<HTMLInputElement>("#report-title");
const reportDescriptionInput = mustElement<HTMLTextAreaElement>("#report-description");
const reportMapInput = mustElement<HTMLInputElement>("#report-map");
const reportRoleInput = mustElement<HTMLInputElement>("#report-role");
const reportTimingInput = mustElement<HTMLInputElement>("#report-timing");
const reportBugFields = mustElement<HTMLDivElement>("#report-bug-fields");
const reportLogSource = mustElement<HTMLDivElement>("#report-log-source");
const reportSendButton = mustElement<HTMLButtonElement>("#report-send");
const reportStatus = mustElement<HTMLSpanElement>("#report-status");
const reportThreadList = mustElement<HTMLDivElement>("#report-thread-list");
const reportThreadStatus = mustElement<HTMLDivElement>("#report-thread-status");
const reportSelectedThread = mustElement<HTMLDivElement>("#report-selected-thread");
const reportMessageList = mustElement<HTMLDivElement>("#report-message-list");
const reportReplyInput = mustElement<HTMLInputElement>("#report-reply-input");
const reportSendMessageButton = mustElement<HTMLButtonElement>("#report-send-message");
const epicLoginWebviewButton = mustElement<HTMLButtonElement>("#epic-login-webview");
const epicLogoutButton = mustElement<HTMLButtonElement>("#epic-logout");
const epicAuthStatus = mustElement<HTMLSpanElement>("#epic-auth-status");
const epicAuthCodeInput = mustElement<HTMLInputElement>("#epic-auth-code");
const epicLoginCodeButton = mustElement<HTMLButtonElement>("#epic-login-code");
const checkUpdateButton = mustElement<HTMLButtonElement>("#check-update");
const updateStatus = mustElement<HTMLSpanElement>("#update-status");
const githubTokenInput = mustElement<HTMLInputElement>("#github-token");
const saveTokenButton = mustElement<HTMLButtonElement>("#save-token");
const clearTokenButton = mustElement<HTMLButtonElement>("#clear-token");
const officialLinkButtons = mustElement<HTMLDivElement>("#official-link-buttons");

const UPDATER_TOKEN_STORAGE_KEY = "updater.githubToken";
const REPORTING_NOTIFICATION_STORAGE_KEY = "reporting.notification.enabled";

const OFFICIAL_LINKS: OfficialLink[] = [
  {
    label: "FANBOX",
    url: "https://supernewroles.fanbox.cc",
    backgroundColor: "#06A6F2",
    iconSvg:
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M2 2h9v9H2zm11 0h9v9h-9zM2 13h20v9H2z"/></svg>',
  },
  {
    label: "Discord",
    url: "https://discord.gg/Cqfwx82ynN",
    backgroundColor: "#5865F2",
    iconSvg:
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>',
  },
  {
    label: "YouTube",
    url: "https://www.youtube.com/@SuperNewRoles",
    backgroundColor: "#FF0000",
    iconSvg:
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z"/></svg>',
  },
  {
    label: "GitHub",
    url: "https://github.com/SuperNewRoles/SuperNewRoles",
    backgroundColor: "#24292F",
    iconSvg:
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
  },
];

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
let reportingNotificationEnabled =
  localStorage.getItem(REPORTING_NOTIFICATION_STORAGE_KEY) === "1";

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
  tone: "info" | "error" | "success" | "warn" = "info"
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
    reportingNotificationEnabled ? "1" : "0"
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
  return new Set(threads.filter((thread) => thread.unread).map((thread) => thread.thread_id));
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
      threads.filter((thread) => newUnreadIds.includes(thread.thread_id))
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
    const status = await invoke<PreservedSaveDataStatus>("get_preserved_save_data_status");
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

function updateButtons(): void {
  const hasSettings = settings !== null;
  const hasGamePath = Boolean(settings?.among_us_path.trim());
  const hasProfilePath = Boolean(settings?.profile_path.trim());
  const hasTag = Boolean(settings?.selected_release_tag.trim());
  const migrationBusy = migrationExporting || migrationImporting;
  const presetBusy = presetLoading || presetExporting || presetInspecting || presetImporting;
  const dataTransferBusy = migrationBusy || presetBusy;
  const shortcutBusy = creatingShortcut;
  const installOrUninstallBusy = installInProgress || uninstallInProgress;
  const launchAvailable =
    hasSettings &&
    hasGamePath &&
    !launchInProgress &&
    !gameRunning &&
    !installOrUninstallBusy &&
    !dataTransferBusy &&
    !shortcutBusy;

  installButton.disabled =
    !hasSettings || !hasTag || installOrUninstallBusy || releasesLoading || dataTransferBusy;
  installRestoreSaveDataCheckbox.disabled =
    installOrUninstallBusy || releasesLoading || dataTransferBusy || !preservedSaveDataAvailable;
  uninstallButton.disabled =
    !hasSettings ||
    installOrUninstallBusy ||
    launchInProgress ||
    gameRunning ||
    dataTransferBusy ||
    shortcutBusy;
  uninstallPreserveSaveDataCheckbox.disabled =
    uninstallInProgress ||
    installInProgress ||
    launchInProgress ||
    gameRunning ||
    dataTransferBusy ||
    shortcutBusy;
  launchModdedButton.disabled = !launchAvailable || !profileIsReady;
  launchVanillaButton.disabled = !launchAvailable;
  createModdedShortcutButton.disabled =
    !hasSettings ||
    !hasGamePath ||
    shortcutBusy ||
    launchInProgress ||
    installOrUninstallBusy ||
    dataTransferBusy;
  epicLoginWebviewButton.disabled = launchInProgress || installOrUninstallBusy || dataTransferBusy;
  epicLoginCodeButton.disabled = launchInProgress || installOrUninstallBusy || dataTransferBusy;
  epicLogoutButton.disabled = !epicLoggedIn || launchInProgress || installOrUninstallBusy || dataTransferBusy;
  detectAmongUsPathButton.disabled = launchInProgress || installOrUninstallBusy || dataTransferBusy;
  saveAmongUsPathButton.disabled = launchInProgress || installOrUninstallBusy || dataTransferBusy;
  refreshReleasesButton.disabled = releasesLoading || installOrUninstallBusy || dataTransferBusy;
  releaseSelect.disabled = releasesLoading || installOrUninstallBusy || dataTransferBusy;
  platformSelect.disabled = installOrUninstallBusy || dataTransferBusy;
  openAmongUsFolderButton.disabled =
    !hasGamePath || launchInProgress || installOrUninstallBusy || dataTransferBusy;
  openProfileFolderButton.disabled =
    !hasProfilePath || launchInProgress || installOrUninstallBusy || dataTransferBusy;
  closeToTrayOnCloseInput.disabled = launchInProgress || installOrUninstallBusy || dataTransferBusy;
  migrationExportButton.disabled =
    !hasSettings || dataTransferBusy || installOrUninstallBusy || launchInProgress || gameRunning;
  migrationImportButton.disabled = dataTransferBusy || installOrUninstallBusy || launchInProgress || gameRunning;
  migrationImportPathInput.disabled = dataTransferBusy || installOrUninstallBusy || launchInProgress || gameRunning;
  migrationEncryptionEnabledInput.disabled =
    dataTransferBusy || installOrUninstallBusy || launchInProgress || gameRunning;
  migrationExportPasswordInput.disabled =
    !migrationEncryptionEnabledInput.checked ||
    dataTransferBusy ||
    installOrUninstallBusy ||
    launchInProgress ||
    gameRunning;
  migrationImportPasswordInput.disabled =
    dataTransferBusy || installOrUninstallBusy || launchInProgress || gameRunning;

  const hasImportableArchivePreset = archivePresets.some((preset) => preset.has_data_file);
  const presetControlsDisabled =
    dataTransferBusy || installOrUninstallBusy || launchInProgress || gameRunning || !hasSettings;

  presetRefreshButton.disabled = presetControlsDisabled;
  presetSelectAllLocalButton.disabled = presetControlsDisabled || localPresets.length === 0;
  presetClearLocalButton.disabled = presetControlsDisabled || localPresets.length === 0;
  presetExportPathInput.disabled = presetControlsDisabled;
  presetExportButton.disabled = presetControlsDisabled || localPresets.length === 0;
  presetImportPathInput.disabled = presetControlsDisabled;
  presetInspectButton.disabled = presetControlsDisabled;
  presetSelectAllArchiveButton.disabled =
    presetControlsDisabled || archivePresets.length === 0 || !hasImportableArchivePreset;
  presetClearArchiveButton.disabled = presetControlsDisabled || archivePresets.length === 0;
  presetImportButton.disabled = presetControlsDisabled || !hasImportableArchivePreset;

  reportRefreshButton.disabled = reportPreparing || reportingLoading || reportMessagesLoading;
  reportNotificationToggle.disabled = reportPreparing || reportSending;
  reportTypeSelect.disabled = !reportingReady || reportPreparing || reportSending;
  reportTitleInput.disabled = !reportingReady || reportPreparing || reportSending;
  reportDescriptionInput.disabled = !reportingReady || reportPreparing || reportSending;
  reportMapInput.disabled = !reportingReady || reportPreparing || reportSending;
  reportRoleInput.disabled = !reportingReady || reportPreparing || reportSending;
  reportTimingInput.disabled = !reportingReady || reportPreparing || reportSending;
  reportSendButton.disabled = !reportingReady || reportPreparing || reportSending;
  reportReplyInput.disabled = !reportingReady || !selectedReportThreadId || reportMessageSending;
  reportSendMessageButton.disabled = !reportingReady || !selectedReportThreadId || reportMessageSending;
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
    const running = await invoke<boolean>("is_game_running");
    applyGameRunningState(running);
  } catch {
    // ignore game running state retrieval errors
  }
}

function renderSettings(): void {
  if (!settings) {
    return;
  }
  amongUsPathInput.value = settings.among_us_path;
  platformSelect.value = settings.game_platform;
  profilePath.textContent = settings.profile_path || t("common.unset");
  closeToTrayOnCloseInput.checked = settings.close_to_tray_on_close;
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
      date: formatDate(release.published_at),
    });
    releaseSelect.append(option);
  }

  if (!currentSettings) {
    return;
  }

  if (
    currentSettings.selected_release_tag &&
    releases.some((release) => release.tag === currentSettings.selected_release_tag)
  ) {
    releaseSelect.value = currentSettings.selected_release_tag;
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
      selectedReportThreadId === thread.thread_id
        ? "report-thread-item active"
        : "report-thread-item";
    button.textContent = t("report.threadItem", {
      mark: thread.current_status.mark || "●",
      title: thread.title || t("report.noTitle"),
      unread: thread.unread ? t("report.unreadSuffix") : "",
    });

    button.addEventListener("click", async () => {
      selectedReportThreadId = thread.thread_id;
      renderReportThreads();
      await loadReportMessages(thread.thread_id, true);
      updateButtons();
    });

    reportThreadList.append(button);
  }

  const selected = reportThreads.find((thread) => thread.thread_id === selectedReportThreadId);
  reportSelectedThread.textContent = selected
    ? t("report.selected", { thread: selected.title || selected.thread_id })
    : t("report.selectedNone");
}

function createMessageElement(message: ReportMessage): HTMLDivElement {
  const wrapper = document.createElement("div");
  const isStatus = message.message_type === "status";
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

  date.textContent = formatDate(message.created_at);
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

async function reloadSettings(): Promise<void> {
  settings = await invoke<LauncherSettings>("get_launcher_settings");
  renderSettings();
}

async function saveSettings(input: LauncherSettingsInput): Promise<void> {
  settings = await invoke<LauncherSettings>("save_launcher_settings", { settings: input });
  renderSettings();
}

async function refreshProfileReady(): Promise<void> {
  const explicitPath = settings?.profile_path?.trim() ? settings.profile_path : undefined;
  profileIsReady = await invoke<boolean>("check_profile_ready", {
    profilePath: explicitPath,
  });
  profileReadyStatus.textContent = profileIsReady
    ? t("profile.ready")
    : t("profile.notReady");
}

async function refreshReleases(): Promise<void> {
  releasesLoading = true;
  updateButtons();
  installStatus.textContent = t("releases.loading");

  try {
    releases = await invoke<SnrReleaseSummary[]>("list_snr_releases");
    renderReleaseOptions();

    if (settings && releaseSelect.value && settings.selected_release_tag !== releaseSelect.value) {
      settings = await invoke<LauncherSettings>("save_launcher_settings", {
        settings: { selected_release_tag: releaseSelect.value },
      });
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
    const status = await invoke<EpicLoginStatus>("epic_get_login_status");
    epicLoggedIn = status.logged_in;

    if (!status.logged_in) {
      epicAuthStatus.textContent = t("epic.notLoggedIn");
      return;
    }

    const userLabel = status.display_name?.trim()
      ? status.display_name.trim()
      : status.account_id?.trim()
        ? status.account_id.trim()
        : t("epic.unknownUser");

    if (status.profile_error) {
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
    const info = await invoke<ReportingLogSourceInfo>("reporting_get_log_source_info");
    if (info.exists && info.selected_path) {
      reportLogSource.textContent = t("report.logDetected", { path: info.selected_path });
    } else {
      reportLogSource.textContent = t("report.logNotDetected", {
        profile: info.profile_candidate,
        game: info.game_candidate,
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
    empty.textContent = "ローカルにプリセットが見つかりません。";
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
    checkbox.disabled = !preset.has_data_file;

    const title = document.createElement("span");
    title.textContent = `[${preset.id}] ${preset.name}`;

    row.append(checkbox, title);

    if (!preset.has_data_file) {
      const missing = document.createElement("span");
      missing.className = "muted";
      missing.textContent = "(PresetOptions ファイルなし)";
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
    empty.textContent = "中身確認を実行すると、ここに候補が表示されます。";
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
    checkbox.checked = preset.has_data_file;
    checkbox.disabled = !preset.has_data_file;

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
    nameInput.disabled = !preset.has_data_file;

    row.append(checkbox, idLabel, nameInput);

    if (!preset.has_data_file) {
      const missing = document.createElement("span");
      missing.className = "muted";
      missing.textContent = "(データ欠損: インポート不可)";
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
    'input[data-role="local-preset-checkbox"]:checked'
  );

  return Array.from(selected)
    .map((input) => Number(input.dataset.presetId))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function getSelectedArchivePresetInputs(): PresetImportSelectionInput[] {
  const selected = presetArchiveList.querySelectorAll<HTMLInputElement>(
    'input[data-role="archive-preset-checkbox"]:checked'
  );

  const inputs: PresetImportSelectionInput[] = [];
  for (const checkbox of selected) {
    const sourceId = Number(checkbox.dataset.presetId);
    if (!Number.isInteger(sourceId) || sourceId < 0) {
      continue;
    }

    const nameInput = presetArchiveList.querySelector<HTMLInputElement>(
      `input[data-role="archive-preset-name"][data-preset-id="${sourceId}"]`
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
    setStatusLine(presetStatus, "ローカルプリセットを読み込み中...");
  }

  try {
    localPresets = await invoke<PresetSummary[]>("list_local_presets");
    renderLocalPresetList();

    if (!keepStatusMessage) {
      if (localPresets.length > 0) {
        setStatusLine(presetStatus, `ローカルプリセットを読み込みました (${localPresets.length}件)。`, "success");
      } else {
        setStatusLine(presetStatus, "ローカルプリセットがありません。", "warn");
      }
    }
  } catch (error) {
    localPresets = [];
    renderLocalPresetList();
    if (!keepStatusMessage) {
      setStatusLine(presetStatus, `ローカルプリセット読み込み失敗: ${String(error)}`, "error");
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
    const messages = await invoke<ReportMessage[]>("reporting_get_messages", {
      threadId: normalized,
    });

    if (ticket !== reportMessageLoadTicket) {
      return;
    }

    reportMessages = messages;
    renderReportMessages();

    if (withStatus) {
      setStatusLine(reportThreadStatus, t("report.messagesLoaded", { count: messages.length }), "success");
    }
  } catch (error) {
    if (ticket !== reportMessageLoadTicket) {
      return;
    }
    setStatusLine(reportThreadStatus, t("report.messagesLoadFailed", { error: String(error) }), "error");
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
    const [threads, hasNotification] = await Promise.all([
      invoke<ReportThread[]>("reporting_list_threads"),
      invoke<boolean>("reporting_get_notification_flag").catch(() => false),
    ]);

    reportThreads = threads;
    reportRemoteFlag.textContent = hasNotification
      ? t("report.remoteFlagUnread")
      : t("report.remoteFlagNone");

    if (
      selectedReportThreadId &&
      !reportThreads.some((thread) => thread.thread_id === selectedReportThreadId)
    ) {
      selectedReportThreadId = null;
      reportMessages = [];
    }

    if (!selectedReportThreadId && reportThreads.length > 0) {
      selectedReportThreadId = reportThreads[0].thread_id;
    }

    renderReportThreads();
    await updateUnreadDiff(reportThreads, allowNotify);

    if (selectedReportThreadId) {
      await loadReportMessages(selectedReportThreadId, false);
    } else {
      renderReportMessages();
    }

    if (manual) {
      setStatusLine(reportStatus, t("report.threadsRefreshDone", { count: reportThreads.length }), "success");
    }
  } catch (error) {
    setStatusLine(reportStatus, t("report.threadsRefreshFailed", { error: String(error) }), "error");
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
    const result = await invoke<ReportingPrepareResult>("reporting_prepare_account");
    reportingReady = result.ready;
    if (result.created_account) {
      reportAccountState.textContent = t("report.accountReadyCreated");
    } else {
      reportAccountState.textContent = t("report.accountReady", { source: result.token_source });
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
  if (!settings || !settings.among_us_path.trim()) {
    throw new Error("Among Us path is not configured");
  }
  return join(settings.among_us_path, "Among Us.exe");
}

saveAmongUsPathButton.addEventListener("click", async () => {
  const value = amongUsPathInput.value.trim();
  await saveSettings({ among_us_path: value });
  await refreshProfileReady();
  await refreshReportingLogSource();
  installStatus.textContent = t("settings.amongUsPathSaved");
  updateButtons();
});

detectAmongUsPathButton.addEventListener("click", async () => {
  detectAmongUsPathButton.disabled = true;
  installStatus.textContent = t("detect.loading");
  try {
    const detected = await invoke<string>("detect_among_us");
    const platform = await invoke<GamePlatform>("get_game_platform", { path: detected });
    await saveSettings({ among_us_path: detected, game_platform: platform });
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
  await openFolder(settings?.among_us_path, t("folder.amongUs"));
});

openProfileFolderButton.addEventListener("click", async () => {
  await openFolder(settings?.profile_path, t("folder.profile"));
});

closeToTrayOnCloseInput.addEventListener("change", async () => {
  const enabled = closeToTrayOnCloseInput.checked;
  await saveSettings({ close_to_tray_on_close: enabled });
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
    const result = await invoke<MigrationExportResult>("export_migration_data", {
      encryptionEnabled,
      password: encryptionEnabled ? exportPassword : undefined,
    });
    migrationImportPathInput.value = result.archive_path;
    setStatusLine(
      migrationStatus,
      t("migration.exportDone", {
        path: result.archive_path,
        count: result.included_files,
        profile: result.profile_files,
        locallow: result.locallow_files,
      }) +
        ` (${result.encrypted ? t("migration.encrypted") : t("migration.unencrypted")})`,
      "success"
    );
  } catch (error) {
    setStatusLine(migrationStatus, t("migration.exportFailed", { error: String(error) }), "error");
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
    const result = await invoke<MigrationImportResult>("import_migration_data", {
      archivePath,
      password: importPassword.length > 0 ? importPassword : undefined,
    });
    setStatusLine(
      migrationStatus,
      t("migration.importDone", {
        count: result.imported_files,
        profile: result.profile_files,
        locallow: result.locallow_files,
      }) +
        ` (${result.encrypted ? t("migration.encrypted") : t("migration.unencrypted")})`,
      "success"
    );
    await refreshProfileReady();
    await refreshLocalPresets(true);
    await refreshReportingLogSource();
  } catch (error) {
    setStatusLine(migrationStatus, t("migration.importFailed", { error: String(error) }), "error");
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
    setStatusLine(presetStatus, "エクスポートするプリセットを選択してください。", "warn");
    return;
  }

  const outputPath = presetExportPathInput.value.trim();

  presetExporting = true;
  updateButtons();
  setStatusLine(presetStatus, "プリセットを書き出し中...");

  try {
    const result = await invoke<PresetExportResult>("export_selected_presets", {
      presetIds: selectedIds,
      outputPath: outputPath.length > 0 ? outputPath : undefined,
    });

    presetImportPathInput.value = result.archive_path;
    setStatusLine(
      presetStatus,
      `書き出し完了: ${result.archive_path} (${result.exported_presets}件)`,
      "success"
    );
  } catch (error) {
    setStatusLine(presetStatus, `書き出し失敗: ${String(error)}`, "error");
  } finally {
    presetExporting = false;
    updateButtons();
  }
});

presetInspectButton.addEventListener("click", async () => {
  const archivePath = presetImportPathInput.value.trim();
  if (!archivePath) {
    setStatusLine(presetStatus, "読み込む .snrpresets のパスを入力してください。", "warn");
    return;
  }

  presetInspecting = true;
  updateButtons();
  setStatusLine(presetStatus, "アーカイブの中身を確認中...");

  try {
    archivePresets = await invoke<PresetSummary[]>("inspect_preset_archive", {
      archivePath,
    });
    renderArchivePresetList();

    const importable = archivePresets.filter((preset) => preset.has_data_file).length;
    const missing = archivePresets.length - importable;
    setStatusLine(
      presetStatus,
      `確認完了: ${archivePresets.length}件 (インポート可能 ${importable} / 欠損 ${missing})`,
      importable > 0 ? "success" : "warn"
    );
  } catch (error) {
    archivePresets = [];
    renderArchivePresetList();
    setStatusLine(presetStatus, `中身確認失敗: ${String(error)}`, "error");
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
    setStatusLine(presetStatus, "インポート元の .snrpresets パスを入力してください。", "warn");
    return;
  }

  const selections = getSelectedArchivePresetInputs();
  if (selections.length === 0) {
    setStatusLine(presetStatus, "インポートするプリセットを選択してください。", "warn");
    return;
  }

  const previewLines = selections
    .map((selection) => `- [${selection.sourceId}] ${(selection.name ?? "").trim() || "(空名)"}`)
    .join("\n");
  const confirmed = window.confirm(
    `次のプリセットをインポートします。\n\n${previewLines}\n\n重複名は自動で回避されます。続行しますか？`
  );
  if (!confirmed) {
    return;
  }

  presetImporting = true;
  updateButtons();
  setStatusLine(presetStatus, "プリセットをインポート中...");

  try {
    const result = await invoke<PresetImportResult>("import_presets_from_archive", {
      archivePath,
      selections,
    });

    await refreshLocalPresets(true);

    const importedNames = result.imported
      .map((item) => `[${item.target_id}] ${item.name}`)
      .join(", ");
    setStatusLine(
      presetStatus,
      `インポート完了: ${result.imported_presets}件${importedNames ? ` (${importedNames})` : ""}`,
      "success"
    );
  } catch (error) {
    setStatusLine(presetStatus, `インポート失敗: ${String(error)}`, "error");
  } finally {
    presetImporting = false;
    updateButtons();
  }
});

platformSelect.addEventListener("change", async () => {
  const platform = platformSelect.value as GamePlatform;
  await saveSettings({ game_platform: platform });
  installStatus.textContent = t("settings.platformChanged", { platform });
  updateButtons();
});

releaseSelect.addEventListener("change", async () => {
  const tag = releaseSelect.value;
  await saveSettings({ selected_release_tag: tag });
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
  const tag = settings.selected_release_tag.trim();
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
    const result = await invoke<InstallResult>("install_snr_release", {
      tag,
      platform: settings.game_platform,
      restorePreservedSaveData,
    });
    installStatus.textContent = restorePreservedSaveData
      ? t("install.doneWithRestored", {
          asset: result.asset_name,
          count: result.restored_save_files,
        })
      : t("install.done", { asset: result.asset_name });
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
    preserveSaveData ? t("uninstall.confirmWithPreserve") : t("uninstall.confirmWithoutPreserve")
  );
  if (!confirmed) {
    return;
  }

  uninstallInProgress = true;
  installProgress.value = 0;
  updateButtons();
  installStatus.textContent = t("uninstall.starting");

  try {
    const result = await invoke<UninstallResult>("uninstall_snr_profile", {
      preserveSaveData,
    });
    installStatus.textContent = preserveSaveData
      ? t("uninstall.doneWithPreserved", { count: result.preserved_files })
      : t("uninstall.done");
    await refreshProfileReady();
    await refreshPreservedSaveDataStatus();
    await refreshLocalPresets(true);
    await refreshReportingLogSource();
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
    await invoke("launch_modded", {
      gameExe,
      profilePath: settings.profile_path,
      platform: settings.game_platform,
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
    await invoke("launch_vanilla", {
      gameExe,
      platform: settings.game_platform,
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
    const shortcutPath = await invoke<string>("create_modded_launch_shortcut");
    launchStatus.textContent = t("launch.shortcutCreated", { path: shortcutPath });
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
    report_type: reportType,
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
    await invoke<ReportingSendResult>("reporting_send_report", { input });
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
    await invoke<ReportingSendResult>("reporting_send_message", { threadId, content });
    reportReplyInput.value = "";
    setStatusLine(reportThreadStatus, t("report.replySent"), "success");
    await loadReportMessages(threadId, false);
    await refreshReportingCenter(false, false);
  } catch (error) {
    setStatusLine(reportThreadStatus, t("report.replySendFailed", { error: String(error) }), "error");
  } finally {
    reportMessageSending = false;
    updateButtons();
  }
});

epicLoginWebviewButton.addEventListener("click", async () => {
  epicAuthStatus.textContent = t("epic.webviewStarting");
  try {
    await invoke("epic_login_with_webview");
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
    await invoke("epic_login_with_code", { code });
    epicAuthStatus.textContent = t("epic.loginSuccess");
    await refreshEpicLoginState();
  } catch (error) {
    epicAuthStatus.textContent = t("epic.loginFailed", { error: String(error) });
  }
});

epicLogoutButton.addEventListener("click", async () => {
  try {
    await invoke("epic_logout");
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

languageSelect.addEventListener("change", () => {
  const nextLocale = normalizeLocale(languageSelect.value) ?? currentLocale;
  if (nextLocale === currentLocale) {
    return;
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
setStatusLine(presetStatus, "ローカル一覧更新でプリセットを取得できます。");

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
      headers ? { headers } : undefined
    );

    updateStatus.textContent = t("update.appliedRestart");
  } catch (error) {
    const hint = normalizeGithubToken(githubTokenInput.value)
      ? ""
      : t("update.privateRepoHint");
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
    if (typeof payload.entries_total === "number" && payload.entries_total > 0) {
      installStatus.textContent = t("install.progressEntries", {
        message: payload.message,
        current: payload.current,
        total: payload.entries_total,
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
  await reloadSettings();
  await refreshProfileReady();
  await refreshLocalPresets(true);
  await refreshPreservedSaveDataStatus();
  await refreshReleases();
  await refreshReportingLogSource();
  await refreshGameRunningState();

  try {
    await invoke<boolean>("epic_try_restore_session");
  } catch {
    // ignore restore errors; status is refreshed next.
  }
  await refreshEpicLoginState();

  try {
    const autoLaunchError = await invoke<string | null>("take_autolaunch_error");
    if (autoLaunchError) {
      launchStatus.textContent = t("launch.autoModLaunchFailed", { error: autoLaunchError });
    }
  } catch {
    // ignore auto launch error retrieval errors
  }

  await initializeReporting();
  updateButtons();
})();

