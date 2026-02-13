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
        <div id="official-link-icons" class="main-official-icons"></div>
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
                <section class="settings-epic-install-wrap">
                  <div class="install-step-epic-login settings-epic-install-step">
                    <div class="epic-login-container">
                      <div class="epic-login-header">
                        <div class="epic-icon">
                          <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3.537 0C2.165 0 1.66.506 1.66 1.879V18.44a4.262 4.262 0 00.02.433c.031.3.037.59.316.92.027.033.311.245.311.245.153.075.258.13.43.2l8.335 3.491c.433.199.614.276.928.27h.002c.314.006.495-.071.928-.27l8.335-3.492c.172-.07.277-.124.43-.2 0 0 .284-.211.311-.243.28-.33.285-.621.316-.92a4.261 4.261 0 00.02-.434V1.879c0-1.373-.506-1.88-1.878-1.88zm13.366 3.11h.68c1.138 0 1.688.553 1.688 1.696v1.88h-1.374v-1.8c0-.369-.17-.54-.523-.54h-.235c-.367 0-.537.17-.537.539v5.81c0 .369.17.54.537.54h.262c.353 0 .523-.171.523-.54V8.619h1.373v2.143c0 1.144-.562 1.71-1.7 1.71h-.694c-1.138 0-1.7-.566-1.7-1.71V4.82c0-1.144.562-1.709 1.7-1.709zm-12.186.08h3.114v1.274H6.117v2.603h1.648v1.275H6.117v2.774h1.74v1.275h-3.14zm3.816 0h2.198c1.138 0 1.7.564 1.7 1.708v2.445c0 1.144-.562 1.71-1.7 1.71h-.799v3.338h-1.4zm4.53 0h1.4v9.201h-1.4zm-3.13 1.235v3.392h.575c.354 0 .523-.171.523-.54V4.965c0-.368-.17-.54-.523-.54zm-3.74 10.147a1.708 1.708 0 01.591.108 1.745 1.745 0 01.49.299l-.452.546a1.247 1.247 0 00-.308-.195.91.91 0 00-.363-.068.658.658 0 00-.28.06.703.703 0 00-.224.163.783.783 0 00-.151.243.799.799 0 00-.056.299v.008a.852.852 0 00.056.31.7.7 0 00.157.245.736.736 0 00.238.16.774.774 0 00.303.058.79.79 0 00.445-.116v-.339h-.548v-.565H7.37v1.255a2.019 2.019 0 01-.524.307 1.789 1.789 0 01-.683.123 1.642 1.642 0 01-.602-.107 1.46 1.46 0 01-.478-.3 1.371 1.371 0 01-.318-.455 1.438 1.438 0 01-.115-.58v-.008a1.426 1.426 0 01.113-.57 1.449 1.449 0 01.312-.46 1.418 1.418 0 01.474-.309 1.58 1.58 0 01.598-.111 1.708 1.708 0 01.045 0zm11.963.008a2.006 2.006 0 01.612.094 1.61 1.61 0 01.507.277l-.386.546a1.562 1.562 0 00-.39-.205 1.178 1.178 0 00-.388-.07.347.347 0 00-.208.052.154.154 0 00-.07.127v.008a.158.158 0 00.022.084.198.198 0 00.076.066.831.831 0 00.147.06c.062.02.14.04.236.061a3.389 3.389 0 01.43.122 1.292 1.292 0 01.328.17.678.678 0 01.207.24.739.739 0 01.071.337v.008a.865.865 0 01-.081.382.82.82 0 01-.229.285 1.032 1.032 0 01-.353.18 1.606 1.606 0 01-.46.061 2.16 2.16 0 01-.71-.116 1.718 1.718 0 01-.593-.346l.43-.514c.277.223.578.335.9.335a.457.457 0 00.236-.05.157.157 0 00.082-.142v-.008a.15.15 0 00-.02-.077.204.204 0 00-.073-.066.753.753 0 00-.143-.062 2.45 2.45 0 00-.233-.062 5.036 5.036 0 01-.413-.113 1.26 1.26 0 01-.331-.16.72.72 0 01-.222-.243.73.73 0 01-.082-.36v-.008a.863.863 0 01.074-.359.794.794 0 01.214-.283 1.007 1.007 0 01.34-.185 1.423 1.423 0 01.448-.066 2.006 2.006 0 01.025 0zm-9.358.025h.742l1.183 2.81h-.825l-.203-.499H8.623l-.198.498h-.81zm2.197.02h.814l.663 1.08.663-1.08h.814v2.79h-.766v-1.602l-.711 1.091h-.016l-.707-1.083v1.593h-.754zm3.469 0h2.235v.658h-1.473v.422h1.334v.61h-1.334v.442h1.493v.658h-2.255zm-5.3.897l-.315.793h.624zm-1.145 5.19h8.014l-4.09 1.348z" />
                          </svg>
                        </div>
                        <h2 class="step-title">${t("installFlow.epicLogin")}</h2>
                      </div>
                      <p class="epic-hint">${t("installFlow.epicLoginRequired")}</p>

                      <div class="epic-login-card">
                        <div id="epic-auth-status-box" class="epic-login-info settings-epic-status">
                          <div id="epic-auth-status-icon" class="epic-login-info-icon">🔐</div>
                          <p id="epic-auth-status" class="epic-login-info-text" aria-live="polite"></p>
                        </div>
                        <div class="epic-login-form settings-epic-login-actions">
                          <button id="epic-login-webview" type="button" class="btn-primary btn-login" aria-hidden="false">
                            <span class="btn-icon">🌐</span>${t("epic.loginWebview")}
                          </button>
                          <button id="epic-logout" type="button" class="ghost settings-epic-logout" hidden aria-hidden="true">${t("epic.logout")}</button>
                        </div>
                      </div>
                    </div>
                  </div>
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
