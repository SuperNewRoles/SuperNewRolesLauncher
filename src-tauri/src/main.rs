#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// アプリ起動エントリ。トレイ常駐と自動起動フローをここで束ねる。

mod commands;
mod services;
mod utils;

use std::ffi::OsStr;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WebviewWindowBuilder,
};
use utils::mod_profile;

const TRAY_ID: &str = "main-tray";
const TRAY_MENU_SHOW_ID: &str = "tray_show";
const TRAY_MENU_LAUNCH_ID: &str = "tray_launch";
const TRAY_MENU_EXIT_ID: &str = "tray_exit";
// Keep the hidden webview alive for 30 minutes so short tray sessions do not
// repeatedly pay window teardown/startup costs, while still eventually freeing memory.
const TRAY_WEBVIEW_KEEPALIVE_MS: u64 = 30 * 60 * 1000;

#[derive(Debug)]
struct TrayWebviewDestroyState {
    generation: AtomicU64,
    pending_cancel_tx: Mutex<Option<mpsc::Sender<()>>>,
}

impl TrayWebviewDestroyState {
    fn new() -> Self {
        // 生成番号は遅延破棄タスクの世代管理に使う。
        Self {
            generation: AtomicU64::new(0),
            pending_cancel_tx: Mutex::new(None),
        }
    }

    fn cancel_pending(&self) {
        // 最新世代へ進めることで、過去に予約した破棄処理を無効化する。
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut guard) = self.pending_cancel_tx.lock() {
            if let Some(cancel_tx) = guard.take() {
                let _ = cancel_tx.send(());
            }
        }
    }

    fn schedule_destroy<R: tauri::Runtime + 'static>(self: &Arc<Self>, app: AppHandle<R>) {
        // 現在世代に紐づく破棄予約を作成し、一定時間後に実行判定する。
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let (cancel_tx, cancel_rx) = mpsc::channel::<()>();

        if let Ok(mut guard) = self.pending_cancel_tx.lock() {
            if let Some(previous_cancel_tx) = guard.replace(cancel_tx) {
                let _ = previous_cancel_tx.send(());
            }
        } else {
            return;
        }

        let state = self.clone();
        std::thread::spawn(move || {
            match cancel_rx.recv_timeout(Duration::from_millis(TRAY_WEBVIEW_KEEPALIVE_MS)) {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => return,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if state.generation.load(Ordering::SeqCst) != generation {
                return;
            }

            if let Ok(mut guard) = state.pending_cancel_tx.lock() {
                if state.generation.load(Ordering::SeqCst) == generation {
                    guard.take();
                }
            }

            let should_destroy = match crate::utils::settings::load_or_init_settings(&app) {
                Ok(settings) => {
                    settings.close_to_tray_on_close && settings.close_webview_on_tray_background
                }
                Err(_) => true,
            };
            if !should_destroy {
                return;
            }

            if let Some(window) = app.get_webview_window("main") {
                if matches!(window.is_visible(), Ok(false)) {
                    let _ = window.destroy();
                }
            }
        });
    }
}

fn tray_menu_labels(locale: &str) -> (String, String, String) {
    let short_name = mod_profile::get().mod_info.short_name.clone();
    match locale {
        "en" => (
            format!("Launch {short_name} AmongUs"),
            "Show".to_string(),
            "Exit".to_string(),
        ),
        _ => (
            format!("{short_name} AmongUsを起動"),
            "表示".to_string(),
            "終了".to_string(),
        ),
    }
}

fn args_contain_autolaunch_modded<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    // single-instance 経由で渡された引数群から自動起動フラグのみ検出する。
    args.into_iter()
        .any(|arg| arg.as_ref() == commands::launch::AUTOLAUNCH_MODDED_ARGUMENT)
}

fn should_auto_launch_modded() -> bool {
    std::env::args_os().any(|arg| arg == OsStr::new(commands::launch::AUTOLAUNCH_MODDED_ARGUMENT))
}

fn start_modded_autolaunch<R: tauri::Runtime>(
    app_handle: AppHandle<R>,
    bypass_close_to_tray: Arc<AtomicBool>,
    tray_webview_destroy_state: Arc<TrayWebviewDestroyState>,
    exit_on_success: bool,
) {
    // 新しい自動起動試行の前に、前回エラーを消して状態を初期化する。
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
                show_main_window(&app_handle, &tray_webview_destroy_state);
            }
        }
    });
}

pub(crate) fn create_main_window<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Option<tauri::WebviewWindow<R>> {
    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")?;
    let builder = WebviewWindowBuilder::from_config(app, window_config).ok()?;
    builder.build().ok()
}

pub(crate) fn get_or_create_main_window<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Option<tauri::WebviewWindow<R>> {
    app.get_webview_window("main")
        .or_else(|| create_main_window(app))
}

pub(crate) fn show_main_window_now<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = get_or_create_main_window(app) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_main_window<R: tauri::Runtime>(
    app: &AppHandle<R>,
    tray_webview_destroy_state: &Arc<TrayWebviewDestroyState>,
) {
    tray_webview_destroy_state.cancel_pending();
    show_main_window_now(app);
}

fn setup_tray<R: tauri::Runtime>(
    app: &AppHandle<R>,
    tray_webview_destroy_state: Arc<TrayWebviewDestroyState>,
) -> tauri::Result<()> {
    // ロケールに応じたメニュー文言を構成し、トレイを初期化する。
    let mod_profile = mod_profile::get();
    let locale = crate::utils::settings::load_or_init_settings(app)
        .map(|settings| settings.ui_locale)
        .unwrap_or_else(|_| "ja".to_string());
    let (launch_label, show_label, exit_label) = tray_menu_labels(&locale);

    let show_item = MenuItem::with_id(app, TRAY_MENU_SHOW_ID, show_label, true, None::<&str>)?;
    let launch_item =
        MenuItem::with_id(app, TRAY_MENU_LAUNCH_ID, launch_label, true, None::<&str>)?;
    let exit_item = MenuItem::with_id(app, TRAY_MENU_EXIT_ID, exit_label, true, None::<&str>)?;
    let tray_menu = Menu::with_items(app, &[&launch_item, &show_item, &exit_item])?;

    let tray_webview_destroy_state_for_tray = tray_webview_destroy_state.clone();
    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .tooltip(mod_profile.branding.tray_tooltip.clone())
        .on_tray_icon_event(move |tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Down,
                    ..
                }
            ) {
                tray_webview_destroy_state_for_tray.cancel_pending();
                let _ = get_or_create_main_window(tray.app_handle());
                return;
            }

            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle(), &tray_webview_destroy_state_for_tray);
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
    // 起動引数と共有状態を先に確定し、後続クロージャで再利用する。
    let auto_launch_modded = should_auto_launch_modded();
    let bypass_close_to_tray = Arc::new(AtomicBool::new(false));
    let bypass_close_to_tray_for_single_instance = bypass_close_to_tray.clone();
    let bypass_close_to_tray_for_menu = bypass_close_to_tray.clone();
    let bypass_close_to_tray_for_window = bypass_close_to_tray.clone();
    let bypass_close_to_tray_for_exit = bypass_close_to_tray.clone();
    let tray_webview_destroy_state = Arc::new(TrayWebviewDestroyState::new());
    let tray_webview_destroy_state_for_single_instance = tray_webview_destroy_state.clone();
    let tray_webview_destroy_state_for_menu = tray_webview_destroy_state.clone();
    let tray_webview_destroy_state_for_window = tray_webview_destroy_state.clone();
    let tray_webview_destroy_state_for_setup = tray_webview_destroy_state.clone();
    let tray_webview_destroy_state_for_autolaunch = tray_webview_destroy_state.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            move |app, args, _cwd| {
                if args_contain_autolaunch_modded(args) {
                    start_modded_autolaunch(
                        app.clone(),
                        bypass_close_to_tray_for_single_instance.clone(),
                        tray_webview_destroy_state_for_single_instance.clone(),
                        false,
                    );
                    return;
                }

                show_main_window(app, &tray_webview_destroy_state_for_single_instance);
            },
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_menu_event(move |app, event| {
            if event.id() == TRAY_MENU_SHOW_ID {
                show_main_window(app, &tray_webview_destroy_state_for_menu);
                return;
            }

            if event.id() == TRAY_MENU_LAUNCH_ID {
                let app_handle = app.clone();
                let _bypass_close_to_tray_for_menu = bypass_close_to_tray_for_menu.clone();
                let tray_webview_destroy_state_for_launch =
                    tray_webview_destroy_state_for_menu.clone();
                // 起動処理は時間がかかるため、メニューイベント処理本体は即座に返す。
                tauri::async_runtime::spawn(async move {
                    match commands::launch::launch_modded_from_saved_settings(app_handle.clone())
                        .await
                    {
                        Ok(()) => {
                            // nothing to do
                        }
                        Err(error) => {
                            commands::launch::set_autolaunch_error(error);
                            show_main_window(&app_handle, &tray_webview_destroy_state_for_launch);
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
                        // 設定読み込み失敗時は安全側としてトレイ遷移+webview解放を既定にする。
                        Ok(settings) => (
                            settings.close_to_tray_on_close,
                            settings.close_webview_on_tray_background,
                        ),
                        Err(_) => (true, true),
                    };

                if close_to_tray.0 {
                    api.prevent_close();
                    let _ = window.hide();
                    if close_to_tray.1 {
                        tray_webview_destroy_state_for_window
                            .schedule_destroy(window.app_handle().clone());
                    } else {
                        tray_webview_destroy_state_for_window.cancel_pending();
                    }
                }
            }
        })
        .setup(move |app| {
            crate::utils::mod_profile::validate().map_err(
                |error| -> Box<dyn std::error::Error> { Box::new(std::io::Error::other(error)) },
            )?;
            setup_tray(app.handle(), tray_webview_destroy_state_for_setup.clone())?;
            crate::utils::background_notifications::start_worker(app.handle().clone());

            if auto_launch_modded {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }

                start_modded_autolaunch(
                    app.handle().clone(),
                    bypass_close_to_tray.clone(),
                    tray_webview_destroy_state_for_autolaunch.clone(),
                    true,
                );
            } else {
                show_main_window(app.handle(), &tray_webview_destroy_state_for_setup);
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
            commands::migration::migration_validate_archive_password,
            commands::presets::presets_list_local,
            commands::presets::presets_export,
            commands::presets::presets_inspect_archive,
            commands::presets::presets_import_archive,
            commands::finder::finder_detect_among_us,
            commands::finder::finder_detect_platform,
            commands::finder::finder_detect_platforms,
            commands::snr::mod_releases_list,
            commands::snr::mod_install,
            commands::snr::mod_uninstall,
            commands::snr::mod_preserved_save_data_status,
            commands::snr::mod_savedata_preview,
            commands::snr::mod_savedata_import,
            commands::snr::mod_savedata_merge_presets,
            commands::snr::mod_preserved_savedata_merge_presets,
            commands::snr::snr_releases_list,
            commands::snr::snr_install,
            commands::snr::snr_uninstall,
            commands::snr::snr_preserved_save_data_status,
            commands::snr::snr_savedata_preview,
            commands::snr::snr_savedata_import,
            commands::snr::snr_savedata_merge_presets,
            commands::snr::snr_preserved_savedata_merge_presets,
            commands::reporting::reporting_prepare,
            commands::reporting::reporting_threads_list,
            commands::reporting::reporting_messages_list,
            commands::reporting::reporting_message_send,
            commands::reporting::reporting_report_send,
            commands::reporting::reporting_notification_flag_get,
            commands::reporting::reporting_log_source_get,
            commands::notifications::notifications_take_open_target,
            commands::launch::launch_modded,
            commands::launch::launch_vanilla,
            commands::launch::launch_shortcut_create,
            commands::launch::launch_modded_first_setup_pending,
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |app_handle, event| {
        if let RunEvent::ExitRequested { api, code, .. } = event {
            // 明示終了(codeあり)か終了バイパス時は、通常終了フローをそのまま通す。
            if code.is_some() || bypass_close_to_tray_for_exit.load(Ordering::SeqCst) {
                return;
            }

            // No windows + close-to-tray + close-webview mode means this exit was caused
            // by destroying the main window, so keep the tray process alive.
            if app_handle.get_webview_window("main").is_none() {
                let keep_alive_without_window =
                    match crate::utils::settings::load_or_init_settings(app_handle) {
                        Ok(settings) => {
                            settings.close_to_tray_on_close
                                && settings.close_webview_on_tray_background
                        }
                        Err(_) => true,
                    };
                if keep_alive_without_window {
                    api.prevent_exit();
                }
            }
        }
    });
}

fn main() {
    run();
}
