import { type LocaleCode, type MessageKey, SUPPORTED_LOCALES } from "../i18n";

/**
 * 画面テンプレート生成専用モジュール。
 * UI文字列の組み立てだけを担当し、イベントや状態管理は別モジュールに分離する。
 */

const LOCALE_OPTION_LABEL_KEYS: Record<LocaleCode, MessageKey> = {
  ja: "language.option.ja",
  en: "language.option.en",
};

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

function renderLocaleOptions(locale: LocaleCode, t: Translator): string {
  return SUPPORTED_LOCALES.map((value) => {
    const selected = value === locale ? " selected" : "";
    return `<option value="${value}"${selected}>${t(LOCALE_OPTION_LABEL_KEYS[value])}</option>`;
  }).join("");
}

/**
 * 1ページ全体のHTMLを返す。
 * 既存DOM idを維持し、機能移行中でもイベント結線を壊さないことを保証する。
 */
export function renderAppTemplate(locale: LocaleCode, t: Translator): string {
  return `
  <main class="app-shell">
    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
      <h1 style="margin: 0; flex: 1; min-width: 280px;">SuperNewRolesLauncher</h1>
      <label for="language-select">${t("language.label")}</label>
      <select id="language-select" style="padding: 8px; min-width: 140px;">${renderLocaleOptions(locale, t)}</select>
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
      <strong>${t("preset.title")}</strong>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="preset-refresh" type="button" style="padding: 8px 12px;">${t("preset.refreshLocal")}</button>
        <button id="preset-select-all-local" type="button" style="padding: 8px 12px;">${t("preset.selectAll")}</button>
        <button id="preset-clear-local" type="button" style="padding: 8px 12px;">${t("preset.clearSelection")}</button>
      </div>
      <div id="preset-local-list" style="display: grid; gap: 6px; max-height: 220px; overflow: auto; border: 1px solid #d0d7de; border-radius: 8px; padding: 8px;"></div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="preset-export-path" type="text" placeholder="${t("preset.exportPathPlaceholder")}" style="padding: 8px; min-width: 420px; flex: 1;" />
        <button id="preset-export" type="button" style="padding: 8px 12px;">${t("preset.exportSelected")}</button>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="preset-import-path" type="text" placeholder="${t("preset.importPathPlaceholder")}" style="padding: 8px; min-width: 420px; flex: 1;" />
        <button id="preset-inspect" type="button" style="padding: 8px 12px;">${t("preset.inspectArchive")}</button>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="preset-select-all-archive" type="button" style="padding: 8px 12px;">${t("preset.selectAll")}</button>
        <button id="preset-clear-archive" type="button" style="padding: 8px 12px;">${t("preset.clearSelection")}</button>
        <button id="preset-import" type="button" style="padding: 8px 12px;">${t("preset.importSelected")}</button>
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
}
