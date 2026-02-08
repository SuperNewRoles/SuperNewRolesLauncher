use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

use crate::utils::settings::{
    self, default_profile_path, is_profile_ready, LauncherSettings, LauncherSettingsInput,
};

/// ランチャー設定を取得する。
#[tauri::command]
pub fn settings_get<R: Runtime>(app: AppHandle<R>) -> Result<LauncherSettings, String> {
    settings::load_or_init_settings(&app)
}

/// ランチャー設定を更新する。
#[tauri::command]
pub fn settings_update<R: Runtime>(
    app: AppHandle<R>,
    settings: LauncherSettingsInput,
) -> Result<LauncherSettings, String> {
    settings::apply_settings_input(&app, settings)
}

/// プロファイル必須ファイルの存在を確認する。
#[tauri::command]
pub fn settings_profile_ready<R: Runtime>(
    app: AppHandle<R>,
    profile_path: Option<String>,
) -> Result<bool, String> {
    let target_path = if let Some(profile_path) = profile_path {
        let trimmed = profile_path.trim();
        if trimmed.is_empty() {
            default_profile_path(&app)?
        } else {
            PathBuf::from(trimmed)
        }
    } else {
        PathBuf::from(settings::load_or_init_settings(&app)?.profile_path)
    };

    Ok(is_profile_ready(&target_path))
}
