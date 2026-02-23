//! 起動関連のcommand境界。
//! 実処理はservices層に配置し、このモジュールはTauri公開APIだけを担う。

use tauri::{AppHandle, Runtime};

use crate::services::launch_service;

pub use launch_service::{
    clear_autolaunch_error, launch_modded_from_saved_settings, set_autolaunch_error,
};
pub use launch_service::{parse_elevated_launch_payload_argument, AUTOLAUNCH_MODDED_ARGUMENT};

/// 自動起動エラーを取り出してクリアする。
#[tauri::command]
pub fn launch_autolaunch_error_take() -> Option<String> {
    // 直近の自動起動エラーを取り出し、取得後は状態を空にする。
    launch_service::take_autolaunch_error()
}

/// 追跡中のゲーム実行状態を返す。
#[tauri::command]
pub fn launch_game_running_get<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    // 実行監視の詳細はサービス層に委譲し、ここでは境界だけを提供する。
    launch_service::is_game_running(app)
}

/// Mod起動ショートカットを作成する。
#[tauri::command]
pub fn launch_shortcut_create() -> Result<String, String> {
    // OSごとの差分吸収はサービス層で行い、ここは公開境界に専念する。
    launch_service::create_modded_launch_shortcut()
}

/// Modded起動時にBepInExの初回セットアップが必要かを返す。
#[tauri::command]
pub fn launch_modded_first_setup_pending<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
) -> Result<bool, String> {
    // 初回展開が必要な時だけUI側で確認ダイアログを出せるよう bool を返す。
    launch_service::modded_first_setup_pending(&app, game_exe)
}

/// Modded起動を実行する。
#[tauri::command]
pub async fn launch_modded<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    profile_path: String,
    platform: String,
) -> Result<(), String> {
    // 起動前検証と実プロセス制御はサービス層へ集約し、この境界は委譲に徹する。
    // 実行失敗時の詳細メッセージはそのままフロントへ伝搬する。
    launch_service::launch_modded(app, game_exe, profile_path, platform).await
}

/// Modded起動を管理者権限で再実行する。
#[tauri::command]
pub async fn launch_modded_elevated<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    profile_path: String,
    platform: String,
) -> Result<(), String> {
    launch_service::launch_modded_elevated(app, game_exe, profile_path, platform).await
}

/// Vanilla起動を実行する。
#[tauri::command]
pub async fn launch_vanilla<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    platform: String,
) -> Result<(), String> {
    // Vanilla起動でも共通の起動監視経路を利用する。
    launch_service::launch_vanilla(app, game_exe, platform).await
}

/// Vanilla起動を管理者権限で再実行する。
#[tauri::command]
pub async fn launch_vanilla_elevated<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    platform: String,
) -> Result<(), String> {
    launch_service::launch_vanilla_elevated(app, game_exe, platform).await
}

/// 昇格ヘルパーモードの起動要求を実行する。
pub async fn launch_execute_elevated_payload<R: Runtime>(
    app: AppHandle<R>,
    payload_path: String,
) -> Result<(), String> {
    launch_service::execute_elevated_launch_payload(app, payload_path).await
}
