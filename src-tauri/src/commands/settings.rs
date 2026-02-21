// 設定読み書きとフォルダ起動を公開するコマンド群。
use std::path::{Path, PathBuf};
use std::process::Command;
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
    // 引数未指定時は保存済み設定か既定値から対象パスを決定する。
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

/// 指定フォルダをOS標準のファイルエクスプローラーで開く。
#[tauri::command]
pub fn settings_open_folder(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is empty".to_string());
    }

    let target = PathBuf::from(trimmed);
    if !target.exists() {
        return Err(format!("Path does not exist: {}", target.display()));
    }
    if !target.is_dir() {
        return Err(format!("Path is not a directory: {}", target.display()));
    }

    open_directory(&target)
}

fn open_directory(path: &Path) -> Result<(), String> {
    // OSごとの既定コマンドを使ってフォルダを開く。
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(path);
        cmd
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(path);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(path);
        cmd
    };

    // フォルダ起動要求だけを投げ、外部アプリの終了待ちは行わない。
    command
        .spawn()
        .map_err(|e| format!("Failed to open directory {}: {e}", path.to_string_lossy()))?;

    Ok(())
}
