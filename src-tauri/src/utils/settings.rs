use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const SETTINGS_FILE_NAME: &str = "settings.json";

pub const REQUIRED_PROFILE_FILES: [&str; 4] = [
    "winhttp.dll",
    "doorstop_config.ini",
    "BepInEx/core/BepInEx.Unity.IL2CPP.dll",
    "dotnet/coreclr.dll",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GamePlatform {
    Steam,
    Epic,
}

impl Default for GamePlatform {
    fn default() -> Self {
        Self::Steam
    }
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
pub struct LauncherSettings {
    pub among_us_path: String,
    pub game_platform: GamePlatform,
    pub selected_release_tag: String,
    pub profile_path: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct LauncherSettingsOnDisk {
    among_us_path: Option<String>,
    game_platform: Option<GamePlatform>,
    selected_release_tag: Option<String>,
    profile_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct LauncherSettingsInput {
    pub among_us_path: Option<String>,
    pub game_platform: Option<GamePlatform>,
    pub selected_release_tag: Option<String>,
    pub profile_path: Option<String>,
}

pub fn app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))
}

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
    })
}

fn normalize_settings(mut settings: LauncherSettings) -> LauncherSettings {
    settings.among_us_path = settings.among_us_path.trim().to_string();
    settings.selected_release_tag = settings.selected_release_tag.trim().to_string();
    settings.profile_path = settings.profile_path.trim().to_string();
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

    if !path.exists() {
        save_settings(app, &default_settings)?;
        return Ok(default_settings);
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read settings file: {e}"))?;
    let on_disk: LauncherSettingsOnDisk = serde_json::from_str(&content).unwrap_or_default();

    default_settings.among_us_path = on_disk.among_us_path.unwrap_or_default();
    default_settings.game_platform = on_disk.game_platform.unwrap_or_default();
    default_settings.selected_release_tag = on_disk.selected_release_tag.unwrap_or_default();
    if let Some(profile_path) = on_disk.profile_path {
        let trimmed = profile_path.trim();
        if !trimmed.is_empty() {
            default_settings.profile_path = trimmed.to_string();
        }
    }

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

    if settings.profile_path.trim().is_empty() {
        settings.profile_path = default_profile_path(app)?.to_string_lossy().to_string();
    }

    settings = normalize_settings(settings);
    save_settings(app, &settings)?;
    Ok(settings)
}

pub fn is_profile_ready(profile_path: &Path) -> bool {
    REQUIRED_PROFILE_FILES
        .iter()
        .all(|relative_path| profile_path.join(relative_path).is_file())
}

pub fn verify_profile_required_files(profile_path: &Path) -> Result<(), String> {
    for relative_path in REQUIRED_PROFILE_FILES {
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
