import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { check } from "@tauri-apps/plugin-updater";

type GamePlatform = "steam" | "epic";

interface LauncherSettings {
  among_us_path: string;
  game_platform: GamePlatform;
  selected_release_tag: string;
  profile_path: string;
}

interface LauncherSettingsInput {
  among_us_path?: string;
  game_platform?: GamePlatform;
  selected_release_tag?: string;
  profile_path?: string;
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

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app not found");
}

app.innerHTML = `
  <main style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 16px; display: grid; gap: 20px; max-width: 980px;">
    <h1 style="margin: 0;">SuperNewRolesLauncher</h1>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px;">
      <strong>クレジット</strong>
      <div style="font-size: 14px; line-height: 1.6;">
        <div>SuperNewRoles: SuperNewRoles Team / Contributors</div>
        <div>Among Us: Innersloth LLC</div>
        <div>Launcher: Tauri v2 + Vite + TypeScript</div>
        <div>参考: Starlight PC (起動やEpicログインなどの実装を参考)</div>
      </div>
      <div style="font-size: 12px; color: #57606a; display: grid; gap: 4px;">
        <div>Wiki: https://wiki.supernewroles.com</div>
      </div>
      <div id="official-link-buttons" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
    </section>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px;">
      <strong>ランチャー設定 / SNRインストール</strong>
      <div>現在のバージョン: <span id="app-version">読み込み中...</span></div>
      <div style="display: grid; gap: 6px;">
        <label for="among-us-path">Among Us パス</label>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <input id="among-us-path" type="text" placeholder="C:\\\\Program Files (x86)\\\\Steam\\\\steamapps\\\\common\\\\Among Us" style="padding: 8px; min-width: 500px; flex: 1;" />
          <button id="save-among-us-path" type="button" style="padding: 8px 12px;">保存</button>
          <button id="detect-among-us-path" type="button" style="padding: 8px 12px;">自動検出</button>
        </div>
      </div>
      <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
        <label for="platform-select">プラットフォーム</label>
        <select id="platform-select" style="padding: 8px;">
          <option value="steam">steam</option>
          <option value="epic">epic</option>
        </select>
        <label for="release-select">SNRタグ</label>
        <select id="release-select" style="padding: 8px; min-width: 280px;"></select>
        <button id="refresh-releases" type="button" style="padding: 8px 12px;">タグ再取得</button>
      </div>
      <div>展開先: <code id="profile-path"></code></div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="open-among-us-folder" type="button" style="padding: 8px 12px;">AmongUsフォルダを開く</button>
        <button id="open-profile-folder" type="button" style="padding: 8px 12px;">プロファイルフォルダを開く</button>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="install-snr" type="button" style="padding: 8px 12px;">SNRをインストール</button>
        <progress id="install-progress" value="0" max="100" style="width: 260px;"></progress>
        <span id="install-status" aria-live="polite"></span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="launch-modded" type="button" style="padding: 8px 12px;">Mod起動</button>
        <button id="launch-vanilla" type="button" style="padding: 8px 12px;">Vanilla起動</button>
        <span id="launch-status" aria-live="polite"></span>
      </div>
      <div id="profile-ready-status" style="font-size: 12px; color: #57606a;"></div>
    </section>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px;">
      <strong>Epic認証</strong>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="epic-login-webview" type="button" style="padding: 8px 12px;">WebViewでログイン</button>
        <button id="epic-logout" type="button" style="padding: 8px 12px;">ログアウト</button>
        <span id="epic-auth-status" aria-live="polite"></span>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="epic-auth-code" type="text" placeholder="Epic auth code" style="padding: 8px; min-width: 320px;" />
        <button id="epic-login-code" type="button" style="padding: 8px 12px;">コードでログイン</button>
      </div>
    </section>

    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px; max-width: 620px;">
      <strong>アプリ更新</strong>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="check-update" type="button" style="padding: 8px 12px;">更新を確認</button>
        <span id="update-status" aria-live="polite"></span>
      </div>
      <div style="display: grid; gap: 6px;">
        <label for="github-token" style="font-size: 12px; color: #57606a;">Private repo test token (任意)</label>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input id="github-token" type="password" autocomplete="off" placeholder="ghp_xxx / github_pat_xxx" style="padding: 8px; min-width: 320px;" />
          <button id="save-token" type="button" style="padding: 8px 12px;">トークン保存</button>
          <button id="clear-token" type="button" style="padding: 8px 12px;">トークン削除</button>
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
const amongUsPathInput = mustElement<HTMLInputElement>("#among-us-path");
const saveAmongUsPathButton = mustElement<HTMLButtonElement>("#save-among-us-path");
const detectAmongUsPathButton = mustElement<HTMLButtonElement>("#detect-among-us-path");
const platformSelect = mustElement<HTMLSelectElement>("#platform-select");
const releaseSelect = mustElement<HTMLSelectElement>("#release-select");
const refreshReleasesButton = mustElement<HTMLButtonElement>("#refresh-releases");
const profilePath = mustElement<HTMLElement>("#profile-path");
const openAmongUsFolderButton = mustElement<HTMLButtonElement>("#open-among-us-folder");
const openProfileFolderButton = mustElement<HTMLButtonElement>("#open-profile-folder");
const installButton = mustElement<HTMLButtonElement>("#install-snr");
const installProgress = mustElement<HTMLProgressElement>("#install-progress");
const installStatus = mustElement<HTMLSpanElement>("#install-status");
const launchModdedButton = mustElement<HTMLButtonElement>("#launch-modded");
const launchVanillaButton = mustElement<HTMLButtonElement>("#launch-vanilla");
const launchStatus = mustElement<HTMLSpanElement>("#launch-status");
const profileReadyStatus = mustElement<HTMLDivElement>("#profile-ready-status");
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
let launchInProgress = false;
let releasesLoading = false;
let checkingUpdate = false;
let epicLoggedIn = false;

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
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function renderOfficialLinks(): void {
  officialLinkButtons.replaceChildren();

  for (const link of OFFICIAL_LINKS) {
    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = [
      "display: inline-flex",
      "align-items: center",
      "gap: 6px",
      "padding: 8px 12px",
      "border: none",
      "border-radius: 999px",
      "color: #fff",
      `background: ${link.backgroundColor}`,
      "font-size: 13px",
      "font-weight: 600",
      "cursor: pointer",
    ].join(";");
    button.setAttribute("aria-label", `${link.label} をブラウザで開く`);
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
    installStatus.textContent = `${label} が未設定です。`;
    return;
  }

  try {
    await openPath(target);
    installStatus.textContent = `${label} を開きました。`;
  } catch (error) {
    installStatus.textContent = `${label} を開けませんでした: ${String(error)}`;
  }
}

function updateButtons(): void {
  const hasSettings = settings !== null;
  const hasGamePath = Boolean(settings?.among_us_path.trim());
  const hasProfilePath = Boolean(settings?.profile_path.trim());
  const hasTag = Boolean(settings?.selected_release_tag.trim());
  const launchAvailable = hasSettings && hasGamePath && !launchInProgress && !gameRunning;

  installButton.disabled = !hasSettings || !hasTag || installInProgress || releasesLoading;
  launchModdedButton.disabled = !launchAvailable || !profileIsReady;
  launchVanillaButton.disabled = !launchAvailable;
  epicLoginWebviewButton.disabled = launchInProgress || installInProgress;
  epicLoginCodeButton.disabled = launchInProgress || installInProgress;
  epicLogoutButton.disabled = !epicLoggedIn || launchInProgress || installInProgress;
  detectAmongUsPathButton.disabled = launchInProgress || installInProgress;
  saveAmongUsPathButton.disabled = launchInProgress || installInProgress;
  refreshReleasesButton.disabled = releasesLoading || installInProgress;
  releaseSelect.disabled = releasesLoading || installInProgress;
  platformSelect.disabled = installInProgress;
  openAmongUsFolderButton.disabled = !hasGamePath || launchInProgress || installInProgress;
  openProfileFolderButton.disabled = !hasProfilePath || launchInProgress || installInProgress;
}

function renderSettings(): void {
  if (!settings) {
    return;
  }
  amongUsPathInput.value = settings.among_us_path;
  platformSelect.value = settings.game_platform;
  profilePath.textContent = settings.profile_path || "(未設定)";
}

function renderReleaseOptions(): void {
  const currentSettings = settings;
  releaseSelect.innerHTML = "";
  for (const release of releases) {
    const option = document.createElement("option");
    option.value = release.tag;
    option.textContent = `${release.tag} - ${release.name || "(no title)"} - ${formatDate(release.published_at)}`;
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
    ? "展開済みプロファイル: 利用可能"
    : "展開済みプロファイル: 未準備";
}

async function refreshReleases(): Promise<void> {
  releasesLoading = true;
  updateButtons();
  installStatus.textContent = "SNRタグを取得中...";

  try {
    releases = await invoke<SnrReleaseSummary[]>("list_snr_releases");
    renderReleaseOptions();

    if (settings && releaseSelect.value && settings.selected_release_tag !== releaseSelect.value) {
      settings = await invoke<LauncherSettings>("save_launcher_settings", {
        settings: { selected_release_tag: releaseSelect.value },
      });
      renderSettings();
    }

    installStatus.textContent = releases.length > 0 ? "SNRタグ取得完了" : "利用可能なタグがありません";
  } catch (error) {
    installStatus.textContent = `SNRタグ取得失敗: ${String(error)}`;
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
      epicAuthStatus.textContent = "未ログイン";
      return;
    }

    const userLabel = status.display_name?.trim()
      ? status.display_name.trim()
      : status.account_id?.trim()
        ? status.account_id.trim()
        : "unknown user";

    if (status.profile_error) {
      epicAuthStatus.textContent = `ログイン済み: ${userLabel} (プロフィール取得失敗)`;
    } else {
      epicAuthStatus.textContent = `ログイン済み: ${userLabel}`;
    }
  } catch (error) {
    epicLoggedIn = false;
    epicAuthStatus.textContent = `状態確認失敗: ${String(error)}`;
  } finally {
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
  installStatus.textContent = "Among Usパスを保存しました。";
  updateButtons();
});

detectAmongUsPathButton.addEventListener("click", async () => {
  detectAmongUsPathButton.disabled = true;
  installStatus.textContent = "Among Usを検出中...";
  try {
    const detected = await invoke<string>("detect_among_us");
    const platform = await invoke<GamePlatform>("get_game_platform", { path: detected });
    await saveSettings({ among_us_path: detected, game_platform: platform });
    await refreshProfileReady();
    installStatus.textContent = `検出成功: ${detected} (${platform})`;
  } catch (error) {
    installStatus.textContent = `検出失敗: ${String(error)}`;
  } finally {
    detectAmongUsPathButton.disabled = false;
    updateButtons();
  }
});

openAmongUsFolderButton.addEventListener("click", async () => {
  await openFolder(settings?.among_us_path, "Among Usフォルダ");
});

openProfileFolderButton.addEventListener("click", async () => {
  await openFolder(settings?.profile_path, "プロファイルフォルダ");
});

platformSelect.addEventListener("change", async () => {
  const platform = platformSelect.value as GamePlatform;
  await saveSettings({ game_platform: platform });
  installStatus.textContent = `プラットフォームを ${platform} に変更しました。`;
  updateButtons();
});

releaseSelect.addEventListener("change", async () => {
  const tag = releaseSelect.value;
  await saveSettings({ selected_release_tag: tag });
  installStatus.textContent = `選択タグ: ${tag}`;
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
    installStatus.textContent = "先にSNRタグを選択してください。";
    return;
  }

  installInProgress = true;
  installProgress.value = 0;
  updateButtons();
  installStatus.textContent = "インストール開始...";

  try {
    const result = await invoke<InstallResult>("install_snr_release", {
      tag,
      platform: settings.game_platform,
    });
    installStatus.textContent = `インストール完了: ${result.asset_name}`;
    await reloadSettings();
    await refreshProfileReady();
  } catch (error) {
    installStatus.textContent = `インストール失敗: ${String(error)}`;
  } finally {
    installInProgress = false;
    updateButtons();
  }
});

launchModdedButton.addEventListener("click", async () => {
  if (!settings) {
    return;
  }
  launchInProgress = true;
  launchStatus.textContent = "Mod起動中...";
  updateButtons();

  try {
    const gameExe = await gameExePathFromSettings();
    await invoke("launch_modded", {
      gameExe,
      profilePath: settings.profile_path,
      platform: settings.game_platform,
    });
    launchStatus.textContent = "Mod起動要求を送信しました。";
  } catch (error) {
    launchStatus.textContent = `Mod起動失敗: ${String(error)}`;
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
  launchStatus.textContent = "Vanilla起動中...";
  updateButtons();

  try {
    const gameExe = await gameExePathFromSettings();
    await invoke("launch_vanilla", {
      gameExe,
      platform: settings.game_platform,
    });
    launchStatus.textContent = "Vanilla起動要求を送信しました。";
  } catch (error) {
    launchStatus.textContent = `Vanilla起動失敗: ${String(error)}`;
  } finally {
    launchInProgress = false;
    updateButtons();
  }
});

epicLoginWebviewButton.addEventListener("click", async () => {
  epicAuthStatus.textContent = "Epic WebViewログインを開始...";
  try {
    await invoke("epic_login_with_webview");
  } catch (error) {
    epicAuthStatus.textContent = `WebViewログイン開始失敗: ${String(error)}`;
  }
});

epicLoginCodeButton.addEventListener("click", async () => {
  const code = epicAuthCodeInput.value.trim();
  if (!code) {
    epicAuthStatus.textContent = "認証コードを入力してください。";
    return;
  }

  epicAuthStatus.textContent = "認証コードでログイン中...";
  try {
    await invoke("epic_login_with_code", { code });
    epicAuthStatus.textContent = "Epicログイン成功";
    await refreshEpicLoginState();
  } catch (error) {
    epicAuthStatus.textContent = `Epicログイン失敗: ${String(error)}`;
  }
});

epicLogoutButton.addEventListener("click", async () => {
  try {
    await invoke("epic_logout");
    epicAuthStatus.textContent = "ログアウトしました。";
    await refreshEpicLoginState();
  } catch (error) {
    epicAuthStatus.textContent = `ログアウト失敗: ${String(error)}`;
  }
});

const savedToken = localStorage.getItem(UPDATER_TOKEN_STORAGE_KEY);
if (savedToken) {
  githubTokenInput.value = savedToken;
}

renderOfficialLinks();

saveTokenButton.addEventListener("click", () => {
  const token = normalizeGithubToken(githubTokenInput.value);
  if (!token) {
    updateStatus.textContent = "保存するトークンを入力してください。";
    return;
  }
  localStorage.setItem(UPDATER_TOKEN_STORAGE_KEY, token);
  updateStatus.textContent = "トークンを保存しました。";
});

clearTokenButton.addEventListener("click", () => {
  localStorage.removeItem(UPDATER_TOKEN_STORAGE_KEY);
  githubTokenInput.value = "";
  updateStatus.textContent = "保存済みトークンを削除しました。";
});

checkUpdateButton.addEventListener("click", async () => {
  if (checkingUpdate) {
    return;
  }

  checkingUpdate = true;
  checkUpdateButton.disabled = true;
  updateStatus.textContent = "更新を確認中...";

  try {
    const headers = createUpdaterHeaders(githubTokenInput.value);
    const update = await check(headers ? { headers } : undefined);
    if (!update) {
      updateStatus.textContent = "最新バージョンです。";
      return;
    }

    const shouldInstall = window.confirm(
      `v${update.version} が利用可能です。今すぐダウンロードして適用しますか？`
    );
    if (!shouldInstall) {
      updateStatus.textContent = `更新 v${update.version} は未適用です。`;
      return;
    }

    let downloadedBytes = 0;
    let totalBytes = 0;

    await update.downloadAndInstall(
      (event) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength ?? 0;
          updateStatus.textContent = "更新をダウンロード中...";
          return;
        }
        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes > 0) {
            const percent = Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100));
            updateStatus.textContent = `更新をダウンロード中... ${percent}%`;
          } else {
            updateStatus.textContent = "更新をダウンロード中...";
          }
          return;
        }
        updateStatus.textContent = "更新を適用中...";
      },
      headers ? { headers } : undefined
    );

    updateStatus.textContent = "更新を適用しました。アプリを再起動してください。";
  } catch (error) {
    const hint = normalizeGithubToken(githubTokenInput.value)
      ? ""
      : " (private repo では token の指定が必要です)";
    updateStatus.textContent = `更新に失敗しました: ${String(error)}${hint}`;
  } finally {
    checkingUpdate = false;
    checkUpdateButton.disabled = false;
  }
});

void (async () => {
  try {
    appVersion.textContent = `v${await getVersion()}`;
  } catch (error) {
    appVersion.textContent = `取得失敗: ${String(error)}`;
  }
})();

void listen<InstallProgressPayload>("snr-install-progress", (event) => {
  const payload = event.payload;
  installProgress.value = Math.max(0, Math.min(100, payload.progress ?? 0));

  if (payload.stage === "downloading" && typeof payload.downloaded === "number") {
    if (typeof payload.total === "number" && payload.total > 0) {
      const percent = Math.floor((payload.downloaded / payload.total) * 100);
      installStatus.textContent = `${payload.message} (${percent}%)`;
    } else {
      installStatus.textContent = `${payload.message} (${payload.downloaded} bytes)`;
    }
    return;
  }

  if (payload.stage === "extracting" && typeof payload.current === "number") {
    if (typeof payload.entries_total === "number" && payload.entries_total > 0) {
      installStatus.textContent = `${payload.message} (${payload.current}/${payload.entries_total})`;
    } else {
      installStatus.textContent = payload.message;
    }
    return;
  }

  installStatus.textContent = payload.message;
});

void listen<GameStatePayload>("game-state-changed", (event) => {
  gameRunning = event.payload.running;
  if (gameRunning) {
    launchStatus.textContent = "ゲーム実行中";
  } else if (!launchInProgress) {
    launchStatus.textContent = "ゲーム停止中";
  }
  updateButtons();
});

void listen("epic-login-success", async () => {
  epicAuthStatus.textContent = "Epicログイン成功";
  await refreshEpicLoginState();
});

void listen<string>("epic-login-error", async (event) => {
  epicAuthStatus.textContent = `Epicログイン失敗: ${event.payload}`;
  await refreshEpicLoginState();
});

void listen("epic-login-cancelled", () => {
  epicAuthStatus.textContent = "Epicログインはキャンセルされました。";
});

void (async () => {
  installProgress.value = 0;
  await reloadSettings();
  await refreshProfileReady();
  await refreshReleases();

  try {
    await invoke<boolean>("epic_try_restore_session");
  } catch {
    // ignore restore errors; status is refreshed next.
  }
  await refreshEpicLoginState();
  updateButtons();
})();
