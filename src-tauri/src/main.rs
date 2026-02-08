#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod utils;

use std::ffi::OsStr;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

const TRAY_ID: &str = "main-tray";
const TRAY_MENU_SHOW_ID: &str = "tray_show";
const TRAY_MENU_EXIT_ID: &str = "tray_exit";

fn should_auto_launch_modded() -> bool {
    std::env::args_os()
        .any(|arg| arg == OsStr::new(commands::launch::AUTOLAUNCH_MODDED_ARGUMENT))
}

fn show_main_window<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn setup_tray<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, TRAY_MENU_SHOW_ID, "Show", true, None::<&str>)?;
    let exit_item = MenuItem::with_id(app, TRAY_MENU_EXIT_ID, "Exit", true, None::<&str>)?;
    let tray_menu = Menu::with_items(app, &[&show_item, &exit_item])?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip("SuperNewRolesLauncher")
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let auto_launch_modded = should_auto_launch_modded();
    let bypass_close_to_tray = Arc::new(AtomicBool::new(false));
    let bypass_close_to_tray_for_menu = bypass_close_to_tray.clone();
    let bypass_close_to_tray_for_window = bypass_close_to_tray.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_menu_event(move |app, event| {
            if event.id() == TRAY_MENU_SHOW_ID {
                show_main_window(app);
                return;
            }

            if event.id() == TRAY_MENU_EXIT_ID {
                bypass_close_to_tray_for_menu.store(true, Ordering::SeqCst);
                app.exit(0);
            }
        })
        .on_window_event(move |window, event| {
            if window.label() != "main" {
                return;
            }

            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if bypass_close_to_tray_for_window.load(Ordering::SeqCst) {
                    return;
                }

                let close_to_tray = match crate::utils::settings::load_or_init_settings(&window.app_handle())
                {
                    Ok(settings) => settings.close_to_tray_on_close,
                    Err(_) => true,
                };

                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(move |app| {
            setup_tray(&app.handle())?;

            if auto_launch_modded {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }

                commands::launch::clear_autolaunch_error();
                let app_handle = app.handle().clone();
                let bypass_close_to_tray_for_autolaunch = bypass_close_to_tray.clone();
                tauri::async_runtime::spawn(async move {
                    match commands::launch::launch_modded_from_saved_settings(app_handle.clone())
                        .await
                    {
                        Ok(()) => {
                            bypass_close_to_tray_for_autolaunch.store(true, Ordering::SeqCst);
                            app_handle.exit(0);
                        }
                        Err(error) => {
                            commands::launch::set_autolaunch_error(error);
                            show_main_window(&app_handle);
                        }
                    }
                });
            } else if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_launcher_settings,
            commands::settings::save_launcher_settings,
            commands::settings::check_profile_ready,
            commands::migration::export_migration_data,
            commands::migration::import_migration_data,
            commands::presets::list_local_presets,
            commands::presets::export_selected_presets,
            commands::presets::inspect_preset_archive,
            commands::presets::import_presets_from_archive,
            commands::finder::detect_among_us,
            commands::finder::get_game_platform,
            commands::snr::list_snr_releases,
            commands::snr::install_snr_release,
            commands::snr::uninstall_snr_profile,
            commands::snr::get_preserved_save_data_status,
            commands::reporting::reporting_prepare_account,
            commands::reporting::reporting_list_threads,
            commands::reporting::reporting_get_messages,
            commands::reporting::reporting_send_message,
            commands::reporting::reporting_send_report,
            commands::reporting::reporting_get_notification_flag,
            commands::reporting::reporting_get_log_source_info,
            commands::launch::launch_modded,
            commands::launch::launch_vanilla,
            commands::launch::create_modded_launch_shortcut,
            commands::launch::take_autolaunch_error,
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
