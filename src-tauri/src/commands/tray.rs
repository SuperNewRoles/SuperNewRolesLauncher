//! トレイ専用の軽量 command 群。
//! カスタムトレイメニュー WebView からの操作を受ける。

use tauri::{AppHandle, Runtime};

/// メインウィンドウを前面表示する。
#[tauri::command]
pub fn tray_show_main_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    crate::hide_tray_menu_window(&app);
    crate::show_main_window_now(&app);
    Ok(())
}

/// アプリを終了する。
#[tauri::command]
pub fn tray_exit_app<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    crate::hide_tray_menu_window(&app);
    app.exit(0);
    Ok(())
}

/// 保存済み設定を使って Modded 起動する。
#[tauri::command]
pub async fn tray_launch_modded<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    crate::hide_tray_menu_window(&app);
    match crate::commands::launch::launch_modded_from_saved_settings(app.clone()).await {
        Ok(()) => Ok(()),
        Err(error) => {
            crate::commands::launch::set_autolaunch_error(error.clone());
            crate::show_main_window_now(&app);
            Err(error)
        }
    }
}
