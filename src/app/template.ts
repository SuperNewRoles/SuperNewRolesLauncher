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
 * インストール/オンボーディングのデザインをベースに、下部タブ付きのメインレイアウト。
 */
export function renderAppTemplate(locale: LocaleCode, t: Translator): string {
  return `
  <main class="main-layout">
    <header class="main-header">
      <div class="main-header-left">
        <h1 class="main-title">SuperNewRolesLauncher</h1>
        <span class="main-version" id="app-version">${t("launcher.currentVersionLoading")}</span>
      </div>
      <div class="main-header-right">
        <div class="theme-buttons" style="margin-right: 8px;">
          <button id="theme-toggle-system" type="button" class="theme-btn" title="${t("theme.system")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>
          <button id="theme-toggle-light" type="button" class="theme-btn" title="${t("theme.light")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
          <button id="theme-toggle-dark" type="button" class="theme-btn" title="${t("theme.dark")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
        </div>
        <label for="language-select" class="main-lang-label">${t("language.label")}</label>
        <select id="language-select" class="main-lang-select">${renderLocaleOptions(locale, t)}</select>
      </div>
    </header>

    <div class="main-content">
      <!-- ホームタブ -->
      <section id="tab-home" class="tab-panel tab-panel-active" data-tab="home">
        <div class="home-content">
          <button id="launch-modded" type="button" class="btn-launch-primary">${t("home.launch")}</button>
          <span id="launch-status" class="home-launch-status" aria-live="polite"></span>
          <div class="home-buttons-row">
            <button id="launch-vanilla" type="button" class="btn-home-secondary">${t("home.launchVanilla")}</button>
            <button id="report-center-tab" type="button" class="btn-home-secondary btn-report-center">${t("report.title")}
              <span id="report-center-badge" class="report-center-badge"></span>
            </button>
          </div>
        </div>
      </section>

      <!-- 報告センタータブ -->
      <section id="tab-report" class="tab-panel" data-tab="report">
        <div id="report-center-root" class="tab-inner tab-report-root"></div>
      </section>

      <!-- プリセットタブ -->
      <section id="tab-preset" class="tab-panel" data-tab="preset">
        <div class="tab-inner tab-settings-scroll tab-preset-scroll">
          <section class="card">
            <strong>${t("preset.title")}</strong>
            <div class="row"><button id="preset-refresh" type="button">${t("preset.refreshLocal")}</button><button id="preset-select-all-local" type="button">${t("preset.selectAll")}</button><button id="preset-clear-local" type="button">${t("preset.clearSelection")}</button></div>
            <div id="preset-local-list" style="display: grid; gap: 6px; max-height: 180px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; padding: 8px;"></div>
            <div class="row"><input id="preset-export-path" type="text" placeholder="${t("preset.exportPathPlaceholder")}" style="flex: 1; min-width: 0;" /><button id="preset-export" type="button">${t("preset.exportSelected")}</button></div>
            <div class="row"><input id="preset-import-path" type="text" placeholder="${t("preset.importPathPlaceholder")}" style="flex: 1; min-width: 0;" /><button id="preset-inspect" type="button">${t("preset.inspectArchive")}</button></div>
            <div class="row"><button id="preset-select-all-archive" type="button">${t("preset.selectAll")}</button><button id="preset-clear-archive" type="button">${t("preset.clearSelection")}</button><button id="preset-import" type="button">${t("preset.importSelected")}</button></div>
            <div id="preset-archive-list" style="display: grid; gap: 6px; max-height: 200px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; padding: 8px;"></div>
            <div id="preset-status" class="status-line" aria-live="polite"></div>
          </section>
        </div>
      </section>

      <!-- 設定タブ -->
      <section id="tab-settings" class="tab-panel" data-tab="settings">
        <div class="tab-settings-shell">
          <div class="settings-layout">
            <aside class="settings-sidebar">
              <div class="settings-category-list" role="tablist" aria-label="${t("settings.tab")}">
                <button id="settings-category-general" type="button" class="settings-category-btn is-active" data-settings-category="general" role="tab" aria-selected="true" aria-controls="settings-panel-general">${t("settings.category.general")}</button>
                <button id="settings-category-epic" type="button" class="settings-category-btn" data-settings-category="epic" role="tab" aria-selected="false" aria-controls="settings-panel-epic">${t("epic.title")}</button>
                <button id="settings-category-migration" type="button" class="settings-category-btn" data-settings-category="migration" role="tab" aria-selected="false" aria-controls="settings-panel-migration">${t("settings.category.migration")}</button>
                <button id="settings-category-credit" type="button" class="settings-category-btn" data-settings-category="credit" role="tab" aria-selected="false" aria-controls="settings-panel-credit">${t("credit.title")}</button>
                <button id="settings-category-app-version" type="button" class="settings-category-btn" data-settings-category="app-version" role="tab" aria-selected="false" aria-controls="settings-panel-app-version">${t("settings.category.appVersion")}</button>
              </div>
              <div class="settings-tutorial-wrap">
                <button id="replay-onboarding" type="button" class="ghost settings-tutorial-btn">${t("onboarding.replay")}</button>
              </div>
            </aside>

            <div class="settings-content">
              <section id="settings-panel-general" class="settings-category-panel is-active" data-settings-panel="general" role="tabpanel" aria-labelledby="settings-category-general">
                <section class="card">
                  <strong>${t("launcher.title")}</strong>
                  <div class="stack">
                    <label for="among-us-path">${t("launcher.amongUsPathLabel")}</label>
                    <div class="row">
                      <input id="among-us-path" type="text" placeholder="C:\\\\Program Files (x86)\\\\Steam\\\\steamapps\\\\common\\\\Among Us" style="flex: 1; min-width: 0;" />
                      <button id="save-among-us-path" type="button">${t("launcher.save")}</button>
                      <button id="detect-among-us-path" type="button">${t("launcher.autoDetect")}</button>
                    </div>
                  </div>
                  <div class="row" style="flex-wrap: wrap;">
                    <label for="platform-select">${t("launcher.platformLabel")}</label>
                    <select id="platform-select"><option value="steam">steam</option><option value="epic">epic</option></select>
                    <label for="release-select">${t("launcher.releaseTagLabel")}</label>
                    <select id="release-select" style="min-width: 200px;"></select>
                    <button id="refresh-releases" type="button">${t("launcher.refreshTags")}</button>
                  </div>
                  <div>${t("launcher.profileDestinationLabel")}: <code id="profile-path"></code></div>
                  <div class="row">
                    <button id="open-among-us-folder" type="button">${t("launcher.openAmongUsFolder")}</button>
                    <button id="open-profile-folder" type="button">${t("launcher.openProfileFolder")}</button>
                  </div>
                  <label class="row" style="align-items: center; gap: 6px;">
                    <input id="close-to-tray-on-close" type="checkbox" />
                    <span>${t("launcher.closeToTrayOnClose")}</span>
                  </label>
                </section>

                <section class="card">
                  <strong>${t("launcher.installSnr")} / ${t("launcher.uninstallMod")}</strong>
                  <div class="row">
                    <button id="install-snr" type="button">${t("launcher.installSnr")}</button>
                    <label class="row" style="align-items: center; gap: 6px;">
                      <input id="install-restore-save-data" type="checkbox" />
                      ${t("launcher.restoreSavedDataOnInstall")}
                    </label>
                    <progress id="install-progress" value="0" max="100" style="width: 160px;"></progress>
                  </div>
                  <div class="row">
                    <button id="uninstall-snr" type="button">${t("launcher.uninstallMod")}</button>
                    <label class="row" style="align-items: center; gap: 6px;">
                      <input id="uninstall-preserve-save-data" type="checkbox" checked />
                      ${t("launcher.preserveCurrentSaveData")}
                    </label>
                  </div>
                  <div id="preserved-save-data-status" class="muted"></div>
                  <div class="row">
                    <button id="create-modded-shortcut" type="button">${t("launcher.createModdedShortcut")}</button>
                  </div>
                  <div id="profile-ready-status" class="muted"></div>
                  <span id="install-status" class="status-line" aria-live="polite"></span>
                </section>
              </section>

              <section id="settings-panel-epic" class="settings-category-panel" data-settings-panel="epic" role="tabpanel" aria-labelledby="settings-category-epic" hidden>
                <section class="card">
                  <strong>${t("epic.title")}</strong>
                  <div class="muted">${t("epic.loginDescription")}</div>
                  <div class="row"><button id="epic-login-webview" type="button">${t("epic.loginWebview")}</button><button id="epic-logout" type="button">${t("epic.logout")}</button><span id="epic-auth-status" aria-live="polite"></span></div>
                  <div class="row"><input id="epic-auth-code" type="text" placeholder="${t("epic.authCodePlaceholder")}" style="min-width: 260px;" /><button id="epic-login-code" type="button">${t("epic.loginWithCode")}</button></div>
                </section>
              </section>

              <section id="settings-panel-migration" class="settings-category-panel" data-settings-panel="migration" role="tabpanel" aria-labelledby="settings-category-migration" hidden>
                <section class="card">
                  <strong>${t("migration.title")}</strong>
                  <div class="row"><button id="migration-export" type="button">${t("migration.export")}</button><span class="muted">${t("migration.exportDescription")}</span></div>
                  <div class="row">
                    <label class="row" style="align-items: center; gap: 6px;">
                      <input id="migration-encryption-enabled" type="checkbox" checked />
                      ${t("migration.encryptionEnabled")}
                    </label>
                    <input id="migration-export-password" type="password" placeholder="${t("migration.exportPasswordPlaceholder")}" style="min-width: 180px;" />
                  </div>
                  <div class="row" style="flex-wrap: wrap;">
                    <input id="migration-import-path" type="text" placeholder="${t("migration.importPlaceholder")}" style="flex: 1; min-width: 200px;" />
                    <input id="migration-import-password" type="password" placeholder="${t("migration.importPasswordPlaceholder")}" style="min-width: 140px;" />
                    <button id="migration-import" type="button">${t("migration.import")}</button>
                  </div>
                  <div id="migration-status" class="status-line" aria-live="polite"></div>
                </section>
              </section>

              <section id="settings-panel-credit" class="settings-category-panel" data-settings-panel="credit" role="tabpanel" aria-labelledby="settings-category-credit" hidden>
                <section class="card">
                  <strong>${t("credit.title")}</strong>
                  <div style="font-size: 14px; line-height: 1.6;">
                    <div>${t("credit.supernewrolesLine")}</div>
                    <div>${t("credit.amongUsLine")}</div>
                    <div>${t("credit.launcherLine")}</div>
                    <div>${t("credit.referenceLine")}</div>
                  </div>
                  <div class="muted" style="display: grid; gap: 4px;">
                    <div>${t("credit.wikiLabel")}: https://wiki.supernewroles.com</div>
                  </div>
                  <div id="official-link-buttons" class="pill-links"></div>
                </section>
              </section>

              <section id="settings-panel-app-version" class="settings-category-panel" data-settings-panel="app-version" role="tabpanel" aria-labelledby="settings-category-app-version" hidden>
                <section class="card">
                  <strong>${t("settings.category.appVersion")}</strong>
                  <div class="row">
                    <span class="muted">${t("launcher.currentVersionLabel")}</span>
                    <span id="settings-app-version" class="settings-current-version">${t("launcher.currentVersionLoading")}</span>
                  </div>
                  <div class="row"><button id="check-update" type="button">${t("update.check")}</button><span id="update-status" aria-live="polite"></span></div>
                </section>
              </section>
            </div>
          </div>
        </div>
      </section>
    </div>

    <nav class="tab-bar" role="tablist" aria-label="メインナビゲーション">
      <button type="button" class="tab-bar-item tab-bar-item-active" data-tab="home" role="tab" aria-selected="true">${t("home.tab")}</button>
      <button type="button" class="tab-bar-item" data-tab="report" role="tab" aria-selected="false">${t("report.title")}</button>
      <button type="button" class="tab-bar-item" data-tab="preset" role="tab" aria-selected="false">${t("preset.tab")}</button>
      <button type="button" class="tab-bar-item" data-tab="settings" role="tab" aria-selected="false">${t("settings.tab")}</button>
    </nav>
  </main>
`;
}
