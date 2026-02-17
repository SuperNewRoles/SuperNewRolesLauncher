//! ランチャー設定の永続化と正規化を担当するユーティリティ。
//! フロント向けDTO(camelCase)と内部表現をここで吸収し、他層の責務を軽く保つ。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

use crate::utils::mod_profile;

const SETTINGS_FILE_NAME: &str = "settings.json";

fn required_profile_files() -> &'static [String] {
    &mod_profile::get().paths.profile_required_files
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum GamePlatform {
    #[default]
    Steam,
    Epic,
}

impl GamePlatform {
    pub fn from_user_value(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "steam" => Ok(Self::Steam),
            "epic" => Ok(Self::Epic),
            other => Err(format!("Unsupported platform: {other}")),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Steam => "steam",
            Self::Epic => "epic",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub among_us_path: String,
    pub game_platform: GamePlatform,
    pub selected_release_tag: String,
    pub profile_path: String,
    pub close_to_tray_on_close: bool,
    pub ui_locale: String,
    pub onboarding_completed: bool,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LauncherSettingsOnDisk {
    among_us_path: Option<String>,
    game_platform: Option<GamePlatform>,
    selected_release_tag: Option<String>,
    profile_path: Option<String>,
    close_to_tray_on_close: Option<bool>,
    ui_locale: Option<String>,
    onboarding_completed: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettingsInput {
    pub among_us_path: Option<String>,
    pub game_platform: Option<GamePlatform>,
    pub selected_release_tag: Option<String>,
    pub profile_path: Option<String>,
    pub close_to_tray_on_close: Option<bool>,
    pub ui_locale: Option<String>,
    pub onboarding_completed: Option<bool>,
}

fn normalize_ui_locale(value: &str) -> &'static str {
    match value.trim().to_ascii_lowercase().as_str() {
        "en" => "en",
        _ => "ja",
    }
}

/// アプリ固有データの保存先ディレクトリを返す。
pub fn app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))
}

/// デフォルトのSNRプロファイル保存先を返す。
pub fn default_profile_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("profiles").join("default"))
}

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(SETTINGS_FILE_NAME))
}

fn make_default_settings<R: Runtime>(app: &AppHandle<R>) -> Result<LauncherSettings, String> {
    let profile_path = default_profile_path(app)?;
    Ok(LauncherSettings {
        among_us_path: String::new(),
        game_platform: GamePlatform::Steam,
        selected_release_tag: String::new(),
        profile_path: profile_path.to_string_lossy().to_string(),
        close_to_tray_on_close: true,
        ui_locale: "ja".to_string(),
        onboarding_completed: false,
    })
}

fn normalize_settings(mut settings: LauncherSettings) -> LauncherSettings {
    settings.among_us_path = settings.among_us_path.trim().to_string();
    settings.selected_release_tag = settings.selected_release_tag.trim().to_string();
    settings.profile_path = settings.profile_path.trim().to_string();
    settings.ui_locale = normalize_ui_locale(&settings.ui_locale).to_string();
    settings
}

pub fn save_settings<R: Runtime>(
    app: &AppHandle<R>,
    settings: &LauncherSettings,
) -> Result<(), String> {
    let settings = normalize_settings(settings.clone());
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings directory: {e}"))?;
    }

    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("Failed to write settings file: {e}"))?;
    Ok(())
}

pub fn load_or_init_settings<R: Runtime>(app: &AppHandle<R>) -> Result<LauncherSettings, String> {
    let path = settings_path(app)?;
    let mut default_settings = make_default_settings(app)?;

    // 初回起動では既定値を即保存し、以降の処理を同一フローにそろえる。
    if !path.exists() {
        save_settings(app, &default_settings)?;
        return Ok(default_settings);
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read settings file: {e}"))?;
    // 破損JSONがあっても起動不能にしないため、読取失敗時は既定値へフォールバックする。
    let on_disk: LauncherSettingsOnDisk = serde_json::from_str(&content).unwrap_or_default();

    default_settings.among_us_path = on_disk.among_us_path.unwrap_or_default();
    default_settings.game_platform = on_disk.game_platform.unwrap_or_default();
    default_settings.selected_release_tag = on_disk.selected_release_tag.unwrap_or_default();
    default_settings.close_to_tray_on_close = on_disk.close_to_tray_on_close.unwrap_or(true);
    default_settings.ui_locale =
        normalize_ui_locale(on_disk.ui_locale.as_deref().unwrap_or("ja")).to_string();
    if let Some(profile_path) = on_disk.profile_path {
        let trimmed = profile_path.trim();
        if !trimmed.is_empty() {
            default_settings.profile_path = trimmed.to_string();
        }
    }
    default_settings.onboarding_completed = on_disk.onboarding_completed.unwrap_or(false);

    // 読み込み直後に正規化して再保存し、以降の設定形式を安定化する。
    default_settings = normalize_settings(default_settings);
    save_settings(app, &default_settings)?;
    Ok(default_settings)
}

pub fn apply_settings_input<R: Runtime>(
    app: &AppHandle<R>,
    input: LauncherSettingsInput,
) -> Result<LauncherSettings, String> {
    let mut settings = load_or_init_settings(app)?;

    if let Some(among_us_path) = input.among_us_path {
        settings.among_us_path = among_us_path;
    }
    if let Some(game_platform) = input.game_platform {
        settings.game_platform = game_platform;
    }
    if let Some(selected_release_tag) = input.selected_release_tag {
        settings.selected_release_tag = selected_release_tag;
    }
    if let Some(profile_path) = input.profile_path {
        settings.profile_path = profile_path;
    }
    if let Some(close_to_tray_on_close) = input.close_to_tray_on_close {
        settings.close_to_tray_on_close = close_to_tray_on_close;
    }
    if let Some(ui_locale) = input.ui_locale {
        settings.ui_locale = ui_locale;
    }
    if let Some(onboarding_completed) = input.onboarding_completed {
        settings.onboarding_completed = onboarding_completed;
    }

    if settings.profile_path.trim().is_empty() {
        settings.profile_path = default_profile_path(app)?.to_string_lossy().to_string();
    }

    // 外部入力を都度正規化してから保存し、不正な空白やlocale値を残さない。
    settings = normalize_settings(settings);
    save_settings(app, &settings)?;
    Ok(settings)
}

/// プロファイルの必須ファイルがすべて揃っているかを判定する。
pub fn is_profile_ready(profile_path: &Path) -> bool {
    required_profile_files()
        .iter()
        .all(|relative_path| profile_path.join(relative_path).is_file())
}

/// 必須ファイルの不足内容を詳細メッセージ付きで検証する。
pub fn verify_profile_required_files(profile_path: &Path) -> Result<(), String> {
    for relative_path in required_profile_files() {
        let file_path = profile_path.join(relative_path);
        if !file_path.is_file() {
            return Err(format!(
                "Missing required file in profile: {}",
                file_path.to_string_lossy()
            ));
        }
    }
    Ok(())
}
