import { type LocaleCode, type MessageKey, SUPPORTED_LOCALES } from "../i18n";
import {
  ANNOUNCE_ENABLED,
  CONNECT_LINKS_ENABLED,
  EPIC_LOGIN_ENABLED,
  GAME_SERVERS_ENABLED,
  LAUNCHER_NAME,
  MIGRATION_ENABLED,
  PRESETS_ENABLED,
  REPORTING_ENABLED,
  modConfig,
} from "./modConfig";

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
    // 現在ロケールに一致する option のみ selected を付与する。
    const selected = value === locale ? " selected" : "";
    return `<option value="${value}"${selected}>${t(LOCALE_OPTION_LABEL_KEYS[value])}</option>`;
  }).join("");
}

/**
 * 1ページ全体のHTMLを返す。
 * インストール/オンボーディングのデザインをベースに、下部タブ付きのメインレイアウト。
 */
export function renderAppTemplate(locale: LocaleCode, t: Translator): string {
  // 機能フラグに応じてタブと設定カテゴリの表示可否を切り替える。
  const reportHiddenAttr = REPORTING_ENABLED ? "" : " hidden";
  const announceHiddenAttr = ANNOUNCE_ENABLED ? "" : " hidden";
  const presetHiddenAttr = PRESETS_ENABLED ? "" : " hidden";
  const migrationHiddenAttr = MIGRATION_ENABLED ? "" : " hidden";
  const epicHiddenAttr = EPIC_LOGIN_ENABLED ? "" : " hidden";
  const connectLinksHiddenAttr = CONNECT_LINKS_ENABLED ? "" : " hidden";
  const gameServersHiddenAttr = GAME_SERVERS_ENABLED ? "" : " hidden";
  // 文字列テンプレートを使うことで初期描画時の依存を減らし、描画順を制御しやすくする。
  return `
  <main class="main-layout">
    <header class="main-header">
      <div class="main-header-left">
        <h1 class="main-title">${LAUNCHER_NAME}</h1>
        <div class="main-version-pill">
          <span class="main-version" id="app-version" data-state="loading">${t("launcher.currentVersionLoading")}</span>
        </div>
      </div>
      <div class="main-header-right">
        <div id="official-link-icons" class="main-official-icons"${connectLinksHiddenAttr}></div>
        <div class="theme-buttons" style="margin-right: 8px;">
          <button id="theme-toggle-system" type="button" class="theme-btn" title="${t("theme.system")}" aria-label="${t("theme.system")}" aria-pressed="false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>
          <button id="theme-toggle-light" type="button" class="theme-btn" title="${t("theme.light")}" aria-label="${t("theme.light")}" aria-pressed="false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
          <button id="theme-toggle-dark" type="button" class="theme-btn" title="${t("theme.dark")}" aria-label="${t("theme.dark")}" aria-pressed="false">
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
            <button id="report-center-tab" type="button" class="btn-home-secondary btn-report-center"${reportHiddenAttr}>${t("report.title")}
              <span id="report-center-badge" class="report-center-badge" aria-hidden="true"></span>
            </button>
          </div>
        </div>
      </section>

      <!-- 報告センタータブ -->
      <section id="tab-report" class="tab-panel" data-tab="report"${reportHiddenAttr}>
        <div id="report-center-root" class="tab-inner tab-report-root"></div>
      </section>

      <!-- アナウンスタブ -->
      <section id="tab-announce" class="tab-panel" data-tab="announce"${announceHiddenAttr}>
        <div id="announce-center-root" class="tab-inner tab-announce-root"></div>
      </section>

      <!-- プリセットタブ -->
      <section id="tab-preset" class="tab-panel" data-tab="preset"${presetHiddenAttr}>
        <div class="tab-inner tab-settings-scroll tab-preset-scroll preset-remake-root">
          <div class="preset-remake-launch-grid">
            <button id="preset-open-import" type="button" class="settings-migration-action preset-remake-primary">
              <span class="settings-migration-action-icon" aria-hidden="true">📥</span>
              <span class="settings-migration-action-text">
                <span class="settings-migration-action-title">${t("preset.importSelected")}</span>
                <span class="settings-migration-action-subtitle">${t("preset.importActionSubtitle")}</span>
              </span>
            </button>
            <button id="preset-open-export" type="button" class="settings-migration-action preset-remake-primary">
              <span class="settings-migration-action-icon" aria-hidden="true">📤</span>
              <span class="settings-migration-action-text">
                <span class="settings-migration-action-title">${t("preset.exportSelected")}</span>
                <span class="settings-migration-action-subtitle">${t("preset.exportActionSubtitle")}</span>
              </span>
            </button>
          </div>
        </div>

        <div id="preset-overlay" class="settings-fullscreen-overlay" hidden aria-hidden="true">
          <div id="preset-overlay-backdrop" class="settings-fullscreen-overlay-backdrop"></div>
          <section class="settings-fullscreen-overlay-panel preset-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="preset-overlay-title">
            <header class="settings-fullscreen-overlay-header">
              <h2 id="preset-overlay-title">${t("preset.title")}</h2>
              <button id="preset-overlay-close" type="button" class="settings-fullscreen-overlay-close" aria-label="${t("common.cancel")}">×</button>
            </header>

            <section id="preset-overlay-import-screen" class="preset-overlay-screen" hidden>
              <div class="row preset-remake-row preset-selection-toolbar">
                <button id="preset-select-all-archive" type="button">${t("preset.selectAll")}</button>
                <button id="preset-clear-archive" type="button">${t("preset.clearSelection")}</button>
              </div>
              <div id="preset-archive-list" class="preset-overlay-list preset-selection-list"></div>
              <footer class="settings-fullscreen-overlay-actions preset-overlay-actions">
                <button id="preset-import" type="button">${t("preset.importSelected")}</button>
              </footer>
            </section>

            <section id="preset-overlay-export-screen" class="preset-overlay-screen" hidden>
              <div class="row preset-remake-row preset-selection-toolbar">
                <button id="preset-refresh" type="button">${t("preset.refreshLocal")}</button>
                <button id="preset-select-all-local" type="button">${t("preset.selectAll")}</button>
                <button id="preset-clear-local" type="button">${t("preset.clearSelection")}</button>
              </div>
              <div id="preset-local-list" class="preset-overlay-list preset-selection-list"></div>
              <footer class="settings-fullscreen-overlay-actions preset-overlay-actions">
                <button id="preset-export" type="button">${t("preset.exportSelected")}</button>
              </footer>
            </section>
          </section>
        </div>
      </section>

      <!-- ゲームサーバータブ -->
      <section id="tab-servers" class="tab-panel" data-tab="servers"${gameServersHiddenAttr}>
        <div id="game-servers-root" class="tab-inner tab-game-servers-root"></div>
      </section>

      <!-- 設定タブ -->
      <section id="tab-settings" class="tab-panel" data-tab="settings">
        <div class="tab-settings-shell">
          <div class="settings-layout">
            <aside class="settings-sidebar">
              <div class="settings-category-list" role="tablist" aria-label="${t("settings.tab")}">
                <button id="settings-category-general" type="button" class="settings-category-btn is-active" data-settings-category="general" role="tab" aria-selected="true" aria-controls="settings-panel-general">${t("settings.category.general")}</button>
                <button id="settings-category-notifications" type="button" class="settings-category-btn" data-settings-category="notifications" role="tab" aria-selected="false" aria-controls="settings-panel-notifications">${t("settings.category.notifications")}</button>
                <button id="settings-category-epic" type="button" class="settings-category-btn" data-settings-category="epic" role="tab" aria-selected="false" aria-controls="settings-panel-epic"${epicHiddenAttr}>${t("epic.title")}</button>
                <button id="settings-category-migration" type="button" class="settings-category-btn" data-settings-category="migration" role="tab" aria-selected="false" aria-controls="settings-panel-migration"${migrationHiddenAttr}>${t("settings.category.migration")}</button>
                <button id="settings-category-credit" type="button" class="settings-category-btn" data-settings-category="credit" role="tab" aria-selected="false" aria-controls="settings-panel-credit">${t("credit.title")}</button>
                <button id="settings-category-app-version" type="button" class="settings-category-btn" data-settings-category="app-version" role="tab" aria-selected="false" aria-controls="settings-panel-app-version">${t("settings.category.appVersion")}</button>
              </div>
              <div class="settings-tutorial-wrap">
                <button id="replay-onboarding" type="button" class="ghost settings-tutorial-btn">${t("onboarding.replay")}</button>
              </div>
            </aside>

            <div class="settings-content">
              <section id="settings-panel-general" class="settings-category-panel is-active" data-settings-panel="general" role="tabpanel" aria-labelledby="settings-category-general">
                <div class="settings-general-layout">
                  <section class="card settings-general-card">
                    <strong>${t("settings.general.title")}</strong>
                    <button id="reselect-among-us-button" type="button" class="settings-general-primary-action">${t("settings.general.reselectAmongUs")}</button>
                    <div class="settings-general-divider" aria-hidden="true"></div>
                    <label class="settings-switch-row" for="close-to-tray-on-close">
                      <span class="settings-switch-text">${t("launcher.closeToTrayOnClose")}</span>
                      <span class="settings-switch-control">
                        <input id="close-to-tray-on-close" type="checkbox" />
                        <span class="settings-switch-slider" aria-hidden="true"></span>
                      </span>
                    </label>
                    <label
                      class="settings-switch-row settings-switch-row-child"
                      for="close-webview-on-tray-background"
                    >
                      <span class="settings-switch-text">${t("launcher.closeWebviewOnTrayBackground")}</span>
                      <span class="settings-switch-control">
                        <input id="close-webview-on-tray-background" type="checkbox" />
                        <span class="settings-switch-slider" aria-hidden="true"></span>
                      </span>
                    </label>
                    <div class="settings-general-action-grid">
                      <button id="open-among-us-folder" type="button" class="settings-folder-action-button"><span class="settings-folder-action-icon" aria-hidden="true">📁</span><span>${t("launcher.openAmongUsFolder")}</span></button>
                      <button id="open-profile-folder" type="button" class="settings-folder-action-button"><span class="settings-folder-action-icon" aria-hidden="true">📁</span><span>${t("launcher.openProfileFolder")}</span></button>
                    </div>
                    <span id="settings-general-status" class="status-line" aria-live="polite"></span>
                  </section>

                  <section class="card settings-general-card settings-general-shortcut-section">
                    <strong>${t("settings.general.shortcutTitle")}</strong>
                    <p class="muted settings-general-shortcut-description">${t("settings.general.shortcutDescription")}</p>
                    <button id="create-modded-shortcut" type="button">${t("launcher.createModdedShortcut")}</button>
                    <span id="settings-shortcut-status" class="status-line" aria-live="polite"></span>
                  </section>

                  <section class="card settings-general-card settings-general-danger-zone">
                    <strong>${t("settings.general.dangerTitle")}</strong>
                    <p class="muted">${t("settings.general.uninstallDescription")}</p>
                    <button id="uninstall-snr" type="button" class="settings-danger-button">${t("launcher.uninstallMod")}</button>
                    <span id="install-status" class="status-line" aria-live="polite"></span>
                  </section>

                  <section class="card settings-general-card settings-general-support">
                    <p class="settings-general-support-text">${t("settings.general.supportText")}</p>
                    <button id="settings-support-discord-link" type="button" class="ghost settings-general-support-link"${connectLinksHiddenAttr}>${t("settings.general.supportDiscordLink")}</button>
                  </section>
                </div>
              </section>

              <section id="settings-panel-notifications" class="settings-category-panel" data-settings-panel="notifications" role="tabpanel" aria-labelledby="settings-category-notifications" hidden>
                <section class="card settings-general-card">
                  <strong>${t("settings.notifications.title")}</strong>
                  <label class="settings-switch-row" for="settings-report-notifications-enabled">
                    <span class="settings-switch-text">${t("launcher.reportNotificationsEnabled")}</span>
                    <span class="settings-switch-control">
                      <input id="settings-report-notifications-enabled" type="checkbox" />
                      <span class="settings-switch-slider" aria-hidden="true"></span>
                    </span>
                  </label>
                  <label class="settings-switch-row" for="settings-announce-notifications-enabled">
                    <span class="settings-switch-text">${t("launcher.announceNotificationsEnabled")}</span>
                    <span class="settings-switch-control">
                      <input id="settings-announce-notifications-enabled" type="checkbox" />
                      <span class="settings-switch-slider" aria-hidden="true"></span>
                    </span>
                  </label>
                  <span id="settings-notifications-status" class="status-line" aria-live="polite"></span>
                </section>
              </section>

              <section id="settings-panel-epic" class="settings-category-panel" data-settings-panel="epic" role="tabpanel" aria-labelledby="settings-category-epic" hidden${epicHiddenAttr}>
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

              <section id="settings-panel-migration" class="settings-category-panel" data-settings-panel="migration" role="tabpanel" aria-labelledby="settings-category-migration" hidden${migrationHiddenAttr}>
                <section class="card settings-migration-panel">
                  <strong>${t("migration.title")}</strong>
                  <div class="settings-migration-action-stack">
                    <button id="migration-export" type="button" class="settings-migration-action settings-migration-action-export">
                      <span class="settings-migration-action-icon" aria-hidden="true">🧳</span>
                      <span class="settings-migration-action-text">
                        <span class="settings-migration-action-title">${t("migration.export")}</span>
                        <span class="settings-migration-action-subtitle">${t("migration.overlay.exportActionHint")}</span>
                      </span>
                    </button>
                    <button id="migration-import" type="button" class="settings-migration-action settings-migration-action-import">
                      <span class="settings-migration-action-icon" aria-hidden="true">📦</span>
                      <span class="settings-migration-action-text">
                        <span class="settings-migration-action-title">${t("migration.import")}</span>
                        <span class="settings-migration-action-subtitle">${t("migration.overlay.importActionHint")}</span>
                      </span>
                    </button>
                  </div>
                  <div id="migration-status" class="status-line" aria-live="polite"></div>
                </section>
              </section>

              <section id="settings-panel-credit" class="settings-category-panel" data-settings-panel="credit" role="tabpanel" aria-labelledby="settings-category-credit" hidden>
                <section class="card settings-credit-card">
                  <div class="settings-credit-header">
                    <strong>${t("credit.title")}</strong>
                    <p class="settings-credit-summary">${t("credit.summary")}</p>
                  </div>

                  <div class="settings-credit-grid">
                    <section class="settings-credit-group" aria-labelledby="settings-credit-group-project">
                      <h3 id="settings-credit-group-project" class="settings-credit-group-title">${t("credit.group.project")}</h3>
                      <div class="settings-credit-list">
                        <div>${t("credit.supernewrolesLine")}</div>
                        <div>${t("credit.amongUsLine")}</div>
                      </div>
                    </section>

                    <section class="settings-credit-group" aria-labelledby="settings-credit-group-technology">
                      <h3 id="settings-credit-group-technology" class="settings-credit-group-title">${t("credit.group.technology")}</h3>
                      <div class="settings-credit-list">
                        <div>${t("credit.launcherLine")}</div>
                        <div>${t("credit.referenceLine")}</div>
                      </div>
                    </section>
                  </div>

                  <section class="settings-credit-links" aria-labelledby="settings-credit-links-title">
                    <div class="settings-credit-links-head">
                      <h3 id="settings-credit-links-title" class="settings-credit-links-title">${t("credit.group.links")}</h3>
                      <a
                        class="settings-credit-wiki-link"
                        href="${modConfig.links.wikiUrl}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >${t("credit.wikiLabel")}: ${modConfig.links.wikiUrl}</a>
                    </div>
                    <div id="official-link-buttons" class="pill-links settings-credit-pill-links"${connectLinksHiddenAttr}></div>
                  </section>
                </section>
              </section>

              <section id="settings-panel-app-version" class="settings-category-panel" data-settings-panel="app-version" role="tabpanel" aria-labelledby="settings-category-app-version" hidden>
                <section class="card settings-app-version-card">
                  <div class="settings-app-version-head">
                    <div class="settings-app-version-title-wrap">
                      <strong>${t("settings.category.appVersion")}</strong>
                      <span class="settings-app-version-badge">${t("settings.appVersion.badge")}</span>
                    </div>
                    <p class="settings-app-version-description">${t("settings.appVersion.description")}</p>
                  </div>
                  <div class="settings-app-version-current">
                    <span class="muted settings-app-version-label">${t("launcher.currentVersionLabel")}</span>
                    <span id="settings-app-version" class="settings-current-version" data-state="loading">${t("launcher.currentVersionLoading")}</span>
                  </div>
                  <div class="settings-app-version-actions">
                    <button id="check-update" type="button">${t("update.check")}</button>
                    <span id="update-status" class="settings-update-status" data-state="idle" aria-live="polite"></span>
                  </div>
                </section>
              </section>
            </div>
          </div>
        </div>

      </section>

      <div id="settings-among-us-overlay" class="settings-fullscreen-overlay" hidden aria-hidden="true">
        <div id="settings-among-us-overlay-backdrop" class="settings-fullscreen-overlay-backdrop"></div>
        <section class="settings-fullscreen-overlay-panel settings-among-us-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="settings-among-us-overlay-title">
          <button id="settings-among-us-overlay-close" type="button" class="settings-fullscreen-overlay-close settings-among-us-overlay-close" aria-label="${t("settings.general.reselectOverlayClose")}">×</button>
          <div class="settings-among-us-overlay-content install-step install-step-platform">
            <h2 id="settings-among-us-overlay-title" class="step-title">${t("settings.general.reselectOverlayTitle")}</h2>
            <p class="muted settings-among-us-overlay-description">${t("settings.general.reselectOverlayDescription")}</p>
            <div id="settings-among-us-overlay-error" class="status-line settings-among-us-overlay-error" hidden></div>
            <div id="settings-among-us-candidate-list" class="settings-among-us-candidate-list platform-grid"></div>
            <button id="settings-among-us-manual-select" type="button" class="btn-manual-select settings-among-us-manual-select-centered">📁 ${t("settings.general.reselectOverlayManualSelect")}</button>
            <p id="settings-among-us-candidate-empty" class="muted settings-among-us-candidate-empty" hidden>${t("settings.general.reselectOverlayEmpty")}</p>
            <footer class="settings-among-us-overlay-actions">
              <button id="settings-among-us-overlay-cancel" type="button" class="ghost settings-among-us-overlay-cancel">${t("settings.general.reselectOverlayClose")}</button>
            </footer>
          </div>
        </section>
      </div>

      <div id="settings-uninstall-confirm-overlay" class="settings-fullscreen-overlay" hidden aria-hidden="true">
        <div id="settings-uninstall-confirm-overlay-backdrop" class="settings-fullscreen-overlay-backdrop"></div>
        <section class="settings-fullscreen-overlay-panel settings-uninstall-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="settings-uninstall-confirm-title">
          <header class="settings-fullscreen-overlay-header">
            <h2 id="settings-uninstall-confirm-title">${t("settings.general.uninstallConfirmTitle")}</h2>
            <button id="settings-uninstall-confirm-close" type="button" class="settings-fullscreen-overlay-close" aria-label="${t("settings.general.reselectOverlayClose")}">×</button>
          </header>
          <p>${t("settings.general.uninstallConfirmMessage")}</p>
          <p class="settings-uninstall-confirm-note">${t("settings.general.uninstallConfirmPreserveFixed")}</p>
          <footer class="settings-fullscreen-overlay-actions">
            <button id="settings-uninstall-confirm-cancel" type="button" class="ghost">${t("common.cancel")}</button>
            <button id="settings-uninstall-confirm-accept" type="button" class="settings-danger-button">${t("settings.general.uninstallConfirmAccept")}</button>
          </footer>
        </section>
      </div>

      <div id="settings-update-confirm-overlay" class="settings-fullscreen-overlay" hidden aria-hidden="true">
        <div id="settings-update-confirm-overlay-backdrop" class="settings-fullscreen-overlay-backdrop"></div>
        <section
          class="settings-fullscreen-overlay-panel settings-update-confirm-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-update-confirm-title"
          aria-describedby="settings-update-confirm-message"
        >
          <header class="settings-fullscreen-overlay-header">
            <h2 id="settings-update-confirm-title">${t("update.confirmTitle")}</h2>
            <button id="settings-update-confirm-close" type="button" class="settings-fullscreen-overlay-close" aria-label="${t("common.close")}">×</button>
          </header>
          <p id="settings-update-confirm-message" class="settings-update-confirm-message"></p>
          <footer class="settings-fullscreen-overlay-actions">
            <button id="settings-update-confirm-cancel" type="button" class="ghost">${t("common.cancel")}</button>
            <button id="settings-update-confirm-accept" type="button">${t("update.confirmInstall")}</button>
          </footer>
        </section>
      </div>

      <div id="settings-elevation-confirm-overlay" class="settings-fullscreen-overlay" hidden aria-hidden="true">
        <div id="settings-elevation-confirm-overlay-backdrop" class="settings-fullscreen-overlay-backdrop"></div>
        <section
          class="settings-fullscreen-overlay-panel settings-update-confirm-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-elevation-confirm-title"
          aria-describedby="settings-elevation-confirm-message"
        >
          <header class="settings-fullscreen-overlay-header">
            <h2 id="settings-elevation-confirm-title">${t("launch.elevationConfirmTitle")}</h2>
            <button id="settings-elevation-confirm-close" type="button" class="settings-fullscreen-overlay-close" aria-label="${t("common.close")}">×</button>
          </header>
          <p id="settings-elevation-confirm-message" class="settings-update-confirm-message">${t("launch.elevationConfirmMessage")}</p>
          <footer class="settings-fullscreen-overlay-actions">
            <button id="settings-elevation-confirm-cancel" type="button" class="ghost">${t("launch.elevationConfirmCancel")}</button>
            <button id="settings-elevation-confirm-accept" type="button">${t("launch.elevationConfirmAccept")}</button>
          </footer>
        </section>
      </div>

      <div id="settings-migration-overlay" class="settings-fullscreen-overlay" hidden aria-hidden="true">
        <div id="settings-migration-overlay-backdrop" class="settings-fullscreen-overlay-backdrop"></div>
        <section class="settings-fullscreen-overlay-panel settings-migration-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="settings-migration-overlay-title">
          <header class="settings-fullscreen-overlay-header settings-migration-overlay-header">
            <h2 id="settings-migration-overlay-title">${t("migration.title")}</h2>
            <button id="settings-migration-overlay-close" type="button" class="settings-fullscreen-overlay-close" aria-label="${t("migration.overlay.close")}">×</button>
          </header>

          <section id="settings-migration-step-select" class="settings-migration-step">
            <p id="settings-migration-selected-path" class="settings-migration-selected-path">${t("migration.overlay.pathNotSelected")}</p>
            <footer class="settings-fullscreen-overlay-actions settings-migration-step-actions">
              <button id="settings-migration-overlay-cancel" type="button" class="ghost">${t("common.cancel")}</button>
              <button id="settings-migration-pick-path" type="button">${t("migration.overlay.pickPath")}</button>
              <button id="settings-migration-step-select-next" type="button">${t("common.next")}</button>
            </footer>
          </section>

          <section id="settings-migration-step-password" class="settings-migration-step" hidden>
            <label class="stack" for="settings-migration-password-input">
              <span>${t("migration.overlay.passwordLabel")}</span>
              <input id="settings-migration-password-input" type="password" placeholder="${t("migration.overlay.passwordPlaceholder")}" autocomplete="new-password" />
            </label>
            <div id="settings-migration-password-error" class="status-line" hidden></div>
            <footer class="settings-fullscreen-overlay-actions settings-migration-step-actions">
              <button id="settings-migration-step-password-cancel" type="button" class="ghost">${t("common.cancel")}</button>
              <button id="settings-migration-step-password-next" type="button">${t("common.next")}</button>
            </footer>
          </section>

          <section id="settings-migration-step-processing" class="settings-migration-step" hidden>
            <div class="settings-migration-processing-indicator" aria-hidden="true"></div>
            <p id="settings-migration-processing-message" class="settings-migration-processing-message">${t("migration.overlay.processing")}</p>
          </section>

          <section id="settings-migration-step-result" class="settings-migration-step" hidden>
            <h3 id="settings-migration-result-title" class="settings-migration-result-title"></h3>
            <p id="settings-migration-result-message" class="settings-migration-result-message"></p>
            <footer class="settings-fullscreen-overlay-actions settings-migration-step-actions">
              <button id="settings-migration-result-retry" type="button" class="ghost">${t("migration.overlay.retry")}</button>
              <button id="settings-migration-result-close" type="button">${t("migration.overlay.close")}</button>
            </footer>
          </section>
        </section>
      </div>
    </div>
    <div id="preset-feedback-overlay" class="settings-fullscreen-overlay" hidden aria-hidden="true">
      <div id="preset-feedback-overlay-backdrop" class="settings-fullscreen-overlay-backdrop"></div>
      <section
        class="settings-fullscreen-overlay-panel preset-feedback-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-feedback-title"
      >
        <header class="settings-fullscreen-overlay-header preset-feedback-header">
          <h2 id="preset-feedback-title"></h2>
        </header>
        <p id="preset-feedback-message" class="preset-feedback-message" role="status" aria-live="polite"></p>
        <ul id="preset-feedback-list" class="preset-feedback-list" hidden></ul>
        <footer class="settings-fullscreen-overlay-actions preset-feedback-actions">
          <button id="preset-feedback-secondary" type="button"></button>
          <button id="preset-feedback-primary" type="button"></button>
        </footer>
      </section>
    </div>

    <nav class="tab-bar" role="tablist" aria-label="メインナビゲーション">
      <button type="button" class="tab-bar-item" data-tab="preset" role="tab" aria-selected="false"${presetHiddenAttr}>
        <span class="tab-bar-item-emoji" aria-hidden="true">📦</span>
        <span class="tab-bar-item-label">${t("preset.tab")}</span>
      </button>
      <button type="button" class="tab-bar-item tab-bar-item-announce" data-tab="announce" role="tab" aria-selected="false"${announceHiddenAttr}>
        <span class="tab-bar-item-emoji" aria-hidden="true">📢</span>
        <span class="tab-bar-item-label">${t("announce.tab")}</span>
        <span id="announce-tab-badge" class="report-center-badge announce-tab-badge" aria-hidden="true"></span>
      </button>
      <button type="button" class="tab-bar-item tab-bar-item-active" data-tab="home" role="tab" aria-selected="true">
        <span class="tab-bar-item-emoji" aria-hidden="true">🏠</span>
        <span class="tab-bar-item-label">${t("home.tab")}</span>
      </button>
      <button type="button" class="tab-bar-item" data-tab="servers" role="tab" aria-selected="false"${gameServersHiddenAttr}>
        <span class="tab-bar-item-emoji" aria-hidden="true">🌐</span>
        <span class="tab-bar-item-label">${t("gameServers.tab")}</span>
      </button>
      <button type="button" class="tab-bar-item tab-bar-item-report" data-tab="report" role="tab" aria-selected="false"${reportHiddenAttr}>
        <span class="tab-bar-item-emoji" aria-hidden="true">📝</span>
        <span class="tab-bar-item-label">${t("report.title")}</span>
        <span id="report-tab-badge" class="report-center-badge report-tab-badge" aria-hidden="true"></span>
      </button>
      <button type="button" class="tab-bar-item" data-tab="settings" role="tab" aria-selected="false">
        <span class="tab-bar-item-emoji" aria-hidden="true">⚙️</span>
        <span class="tab-bar-item-label">${t("settings.tab")}</span>
      </button>
    </nav>
  </main>
`;
}
