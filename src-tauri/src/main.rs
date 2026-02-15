#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod services;
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
const TRAY_MENU_LAUNCH_ID: &str = "tray_launch";
const TRAY_MENU_EXIT_ID: &str = "tray_exit";

fn tray_menu_labels(locale: &str) -> (&'static str, &'static str, &'static str) {
    match locale {
        "en" => ("Launch SNR AmongUs", "Show", "Exit"),
        _ => ("SNR AmongUsを起動", "表示", "終了"),
    }
}

fn args_contain_autolaunch_modded<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .any(|arg| arg.as_ref() == commands::launch::AUTOLAUNCH_MODDED_ARGUMENT)
}

fn should_auto_launch_modded() -> bool {
    std::env::args_os().any(|arg| arg == OsStr::new(commands::launch::AUTOLAUNCH_MODDED_ARGUMENT))
}

fn start_modded_autolaunch<R: tauri::Runtime>(
    app_handle: AppHandle<R>,
    bypass_close_to_tray: Arc<AtomicBool>,
    exit_on_success: bool,
) {
    commands::launch::clear_autolaunch_error();
    tauri::async_runtime::spawn(async move {
        match commands::launch::launch_modded_from_saved_settings(app_handle.clone()).await {
            Ok(()) => {
                if exit_on_success {
                    bypass_close_to_tray.store(true, Ordering::SeqCst);
                    app_handle.exit(0);
                }
            }
            Err(error) => {
                commands::launch::set_autolaunch_error(error);
                show_main_window(&app_handle);
            }
        }
    });
}

fn show_main_window<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn setup_tray<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let locale = crate::utils::settings::load_or_init_settings(app)
        .map(|settings| settings.ui_locale)
        .unwrap_or_else(|_| "ja".to_string());
    let (launch_label, show_label, exit_label) = tray_menu_labels(&locale);

    let show_item = MenuItem::with_id(app, TRAY_MENU_SHOW_ID, show_label, true, None::<&str>)?;
    let launch_item =
        MenuItem::with_id(app, TRAY_MENU_LAUNCH_ID, launch_label, true, None::<&str>)?;
    let exit_item = MenuItem::with_id(app, TRAY_MENU_EXIT_ID, exit_label, true, None::<&str>)?;
    let tray_menu = Menu::with_items(app, &[&launch_item, &show_item, &exit_item])?;

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
    let bypass_close_to_tray_for_single_instance = bypass_close_to_tray.clone();
    let bypass_close_to_tray_for_menu = bypass_close_to_tray.clone();
    let bypass_close_to_tray_for_window = bypass_close_to_tray.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            move |app, args, _cwd| {
                if args_contain_autolaunch_modded(args) {
                    start_modded_autolaunch(
                        app.clone(),
                        bypass_close_to_tray_for_single_instance.clone(),
                        false,
                    );
                    return;
                }

                show_main_window(app);
            },
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_menu_event(move |app, event| {
            if event.id() == TRAY_MENU_SHOW_ID {
                show_main_window(app);
                return;
            }

            if event.id() == TRAY_MENU_LAUNCH_ID {
                let app_handle = app.clone();
                let _bypass_close_to_tray_for_menu = bypass_close_to_tray_for_menu.clone();
                tauri::async_runtime::spawn(async move {
                    match commands::launch::launch_modded_from_saved_settings(app_handle.clone())
                        .await
                    {
                        Ok(()) => {
                            // nothing to do
                        }
                        Err(error) => {
                            commands::launch::set_autolaunch_error(error);
                            show_main_window(&app_handle);
                        }
                    }
                });
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

                let close_to_tray =
                    match crate::utils::settings::load_or_init_settings(window.app_handle()) {
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
            setup_tray(app.handle())?;

            if auto_launch_modded {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }

                start_modded_autolaunch(app.handle().clone(), bypass_close_to_tray.clone(), true);
            } else if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::settings_get,
            commands::settings::settings_update,
            commands::settings::settings_profile_ready,
            commands::settings::settings_open_folder,
            commands::migration::migration_export,
            commands::migration::migration_import,
            commands::presets::presets_list_local,
            commands::presets::presets_export,
            commands::presets::presets_inspect_archive,
            commands::presets::presets_import_archive,
            commands::finder::finder_detect_among_us,
            commands::finder::finder_detect_platform,
            commands::finder::finder_detect_platforms,
            commands::snr::snr_releases_list,
            commands::snr::snr_install,
            commands::snr::snr_uninstall,
            commands::snr::snr_preserved_save_data_status,
            commands::snr::snr_savedata_preview,
            commands::snr::snr_savedata_import,
            commands::reporting::reporting_prepare,
            commands::reporting::reporting_threads_list,
            commands::reporting::reporting_messages_list,
            commands::reporting::reporting_message_send,
            commands::reporting::reporting_report_send,
            commands::reporting::reporting_notification_flag_get,
            commands::reporting::reporting_log_source_get,
            commands::launch::launch_modded,
            commands::launch::launch_vanilla,
            commands::launch::launch_shortcut_create,
            commands::launch::launch_autolaunch_error_take,
            commands::launch::launch_game_running_get,
            commands::epic_commands::epic_auth_url_get,
            commands::epic_commands::epic_login_code,
            commands::epic_commands::epic_login_webview,
            commands::epic_commands::epic_session_restore,
            commands::epic_commands::epic_logged_in_get,
            commands::epic_commands::epic_status_get,
            commands::epic_commands::epic_logout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
