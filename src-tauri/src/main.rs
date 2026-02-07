#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_launcher_settings,
            commands::settings::save_launcher_settings,
            commands::settings::check_profile_ready,
            commands::finder::detect_among_us,
            commands::finder::get_game_platform,
            commands::snr::list_snr_releases,
            commands::snr::install_snr_release,
            commands::launch::launch_modded,
            commands::launch::launch_vanilla,
            commands::epic_commands::get_epic_auth_url,
            commands::epic_commands::epic_login_with_code,
            commands::epic_commands::epic_login_with_webview,
            commands::epic_commands::epic_try_restore_session,
            commands::epic_commands::epic_is_logged_in,
            commands::epic_commands::epic_get_login_status,
            commands::epic_commands::epic_logout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
