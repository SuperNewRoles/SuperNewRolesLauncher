//! 起動関連のcommand境界。
//! 実処理はservices層に配置し、このモジュールはTauri公開APIだけを担う。

use tauri::{AppHandle, Runtime};

use crate::services::launch_service;

pub use launch_service::AUTOLAUNCH_MODDED_ARGUMENT;
pub use launch_service::{
    clear_autolaunch_error, launch_modded_from_saved_settings, set_autolaunch_error,
};

/// 自動起動エラーを取り出してクリアする。
#[tauri::command]
pub fn launch_autolaunch_error_take() -> Option<String> {
    launch_service::take_autolaunch_error()
}

/// 追跡中のゲーム実行状態を返す。
#[tauri::command]
pub fn launch_game_running_get<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    launch_service::is_game_running(app)
}

/// Mod起動ショートカットを作成する。
#[tauri::command]
pub fn launch_shortcut_create() -> Result<String, String> {
    launch_service::create_modded_launch_shortcut()
}

/// Modded起動を実行する。
#[tauri::command]
pub async fn launch_modded<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    profile_path: String,
    platform: String,
) -> Result<(), String> {
    launch_service::launch_modded(app, game_exe, profile_path, platform).await
}

/// Vanilla起動を実行する。
#[tauri::command]
pub async fn launch_vanilla<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    platform: String,
) -> Result<(), String> {
    launch_service::launch_vanilla(app, game_exe, platform).await
}
